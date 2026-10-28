-- ── Precio real de materiales (APU / explosión de insumos) desde Compras ──
-- Un insumo base de tipo 'material' vinculado a comp.articulos toma su costo
-- del artículo: precio_ultima_compra (OP autorizada) y, si aún no hay compra,
-- precio_ref. El costo se propaga a:
--   ctrl.mant_insumos.costo  →  ctrl.mant_conceptos_insumos.costo_unitario
--   →  herramienta menor (% sobre M.O.)  →  ctrl.mant_conceptos.costo_directo / pu_venta
-- El UPDATE de mant_conceptos dispara ctrl.mant_concepto_sync_dependientes, que
-- refresca OT por conceptos y CAPEX. La explosión de insumos lee
-- mant_conceptos_insumos, así que queda con precio real sin cambios extra.

-- Equivalencia de unidades: 1 unidad del artículo (Compras) = N unidades del
-- insumo. Ej.: artículo en "viaje" y insumo en "m³" con 1 viaje = 6 m³ → factor 6.
-- costo del insumo = precio del artículo / factor.
ALTER TABLE ctrl.mant_insumos
  ADD COLUMN IF NOT EXISTS factor_equivalencia numeric(14,6) NOT NULL DEFAULT 1;
ALTER TABLE ctrl.mant_insumos DROP CONSTRAINT IF EXISTS mant_insumos_factor_equivalencia_check;
ALTER TABLE ctrl.mant_insumos ADD CONSTRAINT mant_insumos_factor_equivalencia_check CHECK (factor_equivalencia > 0);
COMMENT ON COLUMN ctrl.mant_insumos.factor_equivalencia IS '1 unidad del artículo vinculado = N unidades del insumo. costo = precio_articulo / factor_equivalencia.';

CREATE OR REPLACE FUNCTION ctrl.fn_sync_precios_articulos_mant(p_articulos bigint[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ctrl, comp, public AS $$
DECLARE
  n integer := 0;
  v_conceptos bigint[];
BEGIN
  -- 1. Catálogo de insumos base
  UPDATE ctrl.mant_insumos mi
     SET costo = ROUND(COALESCE(NULLIF(a.precio_ultima_compra,0), NULLIF(a.precio_ref,0)) / mi.factor_equivalencia, 4)
    FROM comp.articulos a
   WHERE a.id = mi.id_articulo_fk
     AND mi.tipo = 'material'
     AND (p_articulos IS NULL OR a.id = ANY(p_articulos))
     AND COALESCE(NULLIF(a.precio_ultima_compra,0), NULLIF(a.precio_ref,0)) IS NOT NULL
     AND mi.costo IS DISTINCT FROM ROUND(COALESCE(NULLIF(a.precio_ultima_compra,0), NULLIF(a.precio_ref,0)) / mi.factor_equivalencia, 4);

  -- 2. Matrices de PU que usan esos insumos
  WITH upd AS (
    UPDATE ctrl.mant_conceptos_insumos mci
       SET costo_unitario = mi.costo
      FROM ctrl.mant_insumos mi
     WHERE mi.id = mci.id_insumo_fk
       AND mi.tipo = 'material'
       AND mi.id_articulo_fk IS NOT NULL
       AND (p_articulos IS NULL OR mi.id_articulo_fk = ANY(p_articulos))
       AND mci.costo_unitario IS DISTINCT FROM mi.costo
    RETURNING mci.id_concepto_fk
  )
  SELECT array_agg(DISTINCT id_concepto_fk) INTO v_conceptos FROM upd;

  IF v_conceptos IS NULL THEN RETURN 0; END IF;

  -- 3. Herramienta menor = % sobre subtotal de mano de obra (no cambia por
  --    materiales, pero se alinea por si estaba desfasada)
  UPDATE ctrl.mant_conceptos_insumos h
     SET costo_unitario = mo.subtotal
    FROM (SELECT id_concepto_fk, COALESCE(SUM(importe),0) AS subtotal
            FROM ctrl.mant_conceptos_insumos WHERE tipo = 'mano_obra'
           GROUP BY id_concepto_fk) mo
   WHERE h.id_concepto_fk = mo.id_concepto_fk
     AND h.tipo = 'herramienta_menor'
     AND h.id_concepto_fk = ANY(v_conceptos)
     AND h.costo_unitario IS DISTINCT FROM mo.subtotal;

  -- 4. Recalcula cabecera de los conceptos afectados (dispara sync a OT/CAPEX)
  UPDATE ctrl.mant_conceptos c
     SET costo_directo = t.cd,
         pu_venta      = ROUND(t.cd * (1 + c.factor_indirectos), 4)
    FROM (SELECT id_concepto_fk, COALESCE(SUM(importe),0) AS cd
            FROM ctrl.mant_conceptos_insumos
           WHERE id_concepto_fk = ANY(v_conceptos)
           GROUP BY id_concepto_fk) t
   WHERE c.id = t.id_concepto_fk;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION ctrl.fn_sync_precios_articulos_mant(bigint[]) TO authenticated, service_role;

-- Cuando cambia el precio del artículo en Compras
CREATE OR REPLACE FUNCTION comp.trg_articulo_precio_sync_mant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ctrl, comp, public AS $$
BEGIN
  IF NEW.precio_ultima_compra IS DISTINCT FROM OLD.precio_ultima_compra
     OR NEW.precio_ref IS DISTINCT FROM OLD.precio_ref THEN
    PERFORM ctrl.fn_sync_precios_articulos_mant(ARRAY[NEW.id::bigint]);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_articulo_precio_sync_mant ON comp.articulos;
CREATE TRIGGER trg_articulo_precio_sync_mant
  AFTER UPDATE OF precio_ultima_compra, precio_ref ON comp.articulos
  FOR EACH ROW EXECUTE FUNCTION comp.trg_articulo_precio_sync_mant();

-- Cuando se vincula/cambia el artículo de un insumo base
CREATE OR REPLACE FUNCTION ctrl.trg_mant_insumo_vincula_articulo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ctrl, comp, public AS $$
BEGIN
  IF NEW.tipo = 'material' AND NEW.id_articulo_fk IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.id_articulo_fk IS DISTINCT FROM OLD.id_articulo_fk
          OR NEW.factor_equivalencia IS DISTINCT FROM OLD.factor_equivalencia) THEN
    PERFORM ctrl.fn_sync_precios_articulos_mant(ARRAY[NEW.id_articulo_fk]);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mant_insumo_vincula_articulo ON ctrl.mant_insumos;
CREATE TRIGGER trg_mant_insumo_vincula_articulo
  AFTER INSERT OR UPDATE OF id_articulo_fk, factor_equivalencia ON ctrl.mant_insumos
  FOR EACH ROW EXECUTE FUNCTION ctrl.trg_mant_insumo_vincula_articulo();

-- Carga inicial con los vínculos ya existentes
SELECT ctrl.fn_sync_precios_articulos_mant(NULL);
