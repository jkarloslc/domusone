-- ─────────────────────────────────────────────────────────────────────────────
-- Sincronización automática: al editar un concepto del catálogo
-- (ctrl.mant_conceptos), propaga descripción, unidad, precio y matriz de
-- insumos a los registros que ya lo referencian:
--   - ctrl.ot_conceptos                        (OT "Por Conceptos")
--   - ctrl.capex_partidas / ctrl.capex_insumos (proyectos CAPEX)
--
-- Aplica a TODOS los registros sin importar status (decisión de negocio,
-- 2026-08-13): incluye OT Completada/Cancelada y proyectos CAPEX
-- Terminado/Cancelado. Antes eran snapshots congelados a propósito; ahora
-- se mantienen vivos y siempre reflejan el último costo del catálogo.
--
-- La explosión de insumos que se muestra en la OT ya se calculaba en vivo
-- leyendo ctrl.mant_conceptos_insumos (ver explotarInsumos() en
-- OrdenesTrabajoTab.tsx) — no requiere sync. Lo que sí era snapshot y ahora
-- se sincroniza es el renglón cabecera ctrl.ot_conceptos (codigo/
-- descripcion/unidad/costo_unitario).
--
-- CAPEX sí duplicaba la matriz completa en ctrl.capex_insumos (tabla propia,
-- sin join en vivo), así que el trigger la reemplaza por completo cada vez.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ctrl.mant_concepto_sync_dependientes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r_partida RECORD;
  v_pu_materiales   numeric(14,4);
  v_pu_mano_obra    numeric(14,4);
  v_pu_maquinaria   numeric(14,4);
  v_pu_equipo_menor numeric(14,4);
BEGIN
  -- Órdenes de Trabajo: refresca el renglón elegido
  UPDATE ctrl.ot_conceptos
  SET codigo         = NEW.codigo,
      descripcion    = NEW.descripcion,
      unidad         = NEW.unidad,
      costo_unitario = NEW.pu_venta
  WHERE id_concepto_fk = NEW.id;

  -- CAPEX: refresca cabecera de partidas + reemplaza su matriz de insumos
  FOR r_partida IN SELECT id FROM ctrl.capex_partidas WHERE id_concepto_fk = NEW.id
  LOOP
    SELECT
      COALESCE(SUM(cantidad * costo_unitario) FILTER (WHERE tipo = 'material'), 0),
      COALESCE(SUM(cantidad * costo_unitario) FILTER (WHERE tipo = 'mano_obra'), 0),
      COALESCE(SUM(cantidad * costo_unitario) FILTER (WHERE tipo = 'equipo'), 0),
      COALESCE(SUM(cantidad * costo_unitario) FILTER (WHERE tipo = 'herramienta_menor'), 0)
    INTO v_pu_materiales, v_pu_mano_obra, v_pu_maquinaria, v_pu_equipo_menor
    FROM ctrl.mant_conceptos_insumos
    WHERE id_concepto_fk = NEW.id;

    UPDATE ctrl.capex_partidas
    SET descripcion     = NEW.descripcion,
        unidad          = NEW.unidad,
        pu_materiales   = v_pu_materiales,
        pu_mano_obra    = v_pu_mano_obra,
        pu_maquinaria   = v_pu_maquinaria,
        pu_equipo_menor = v_pu_equipo_menor
    WHERE id = r_partida.id;

    DELETE FROM ctrl.capex_insumos WHERE id_partida_fk = r_partida.id;

    INSERT INTO ctrl.capex_insumos
      (id_partida_fk, tipo, id_articulo_fk, descripcion, unidad, cantidad, precio_unitario, orden)
    SELECT
      r_partida.id,
      CASE mci.tipo
        WHEN 'mano_obra'         THEN 'mano_obra'
        WHEN 'material'          THEN 'material'
        WHEN 'equipo'            THEN 'maquinaria'
        WHEN 'herramienta_menor' THEN 'equipo_menor'
      END,
      CASE WHEN mci.tipo = 'material' THEN mi.id_articulo_fk ELSE NULL END,
      mci.descripcion, mci.unidad, mci.cantidad, mci.costo_unitario, mci.orden
    FROM ctrl.mant_conceptos_insumos mci
    LEFT JOIN ctrl.mant_insumos mi ON mi.id = mci.id_insumo_fk
    WHERE mci.id_concepto_fk = NEW.id
    ORDER BY mci.orden;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mant_concepto_sync_dependientes ON ctrl.mant_conceptos;
CREATE TRIGGER trg_mant_concepto_sync_dependientes
AFTER UPDATE ON ctrl.mant_conceptos
FOR EACH ROW
EXECUTE FUNCTION ctrl.mant_concepto_sync_dependientes();

COMMENT ON TABLE ctrl.ot_conceptos IS 'Conceptos del catálogo (ctrl.mant_conceptos) elegidos para una OT cuando por_conceptos=true. codigo/descripcion/unidad/costo_unitario se sincronizan en vivo con el catálogo vía trigger ctrl.mant_concepto_sync_dependientes — ya no es un snapshot congelado.';
COMMENT ON TABLE ctrl.capex_partidas IS 'Conceptos de obra CAPEX. Si id_concepto_fk está presente, descripcion/unidad/pu_* se sincronizan en vivo con ctrl.mant_conceptos vía trigger ctrl.mant_concepto_sync_dependientes.';
COMMENT ON TABLE ctrl.capex_insumos IS 'APU detalle por partida. Si la partida tiene id_concepto_fk, esta tabla se reemplaza automáticamente al editar el concepto de origen (ver ctrl.mant_concepto_sync_dependientes).';
