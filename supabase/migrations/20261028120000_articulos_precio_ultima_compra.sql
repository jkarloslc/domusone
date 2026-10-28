-- ── Precio de última compra por artículo ──
-- Método de valuación: última compra. Se toma de la OC más reciente (fecha_oc)
-- vinculada a una OP ya autorizada (status Pendiente / Pago Parcial / Pagada).
-- Se recalcula por trigger cuando cambia el status de una OP, así que también
-- se corrige solo si una OP se rechaza/cancela después.

ALTER TABLE comp.articulos
  ADD COLUMN IF NOT EXISTS precio_ultima_compra numeric(14,4),
  ADD COLUMN IF NOT EXISTS fecha_ultima_compra  date,
  ADD COLUMN IF NOT EXISTS id_oc_ultima_fk      integer;

CREATE OR REPLACE FUNCTION comp.fn_recalc_precio_ultima_compra(p_articulos integer[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = comp, public AS $$
DECLARE n integer;
BEGIN
  WITH ocs_autorizadas AS (
    SELECT l.id_oc_fk FROM comp.ordenes_pago_oc l
      JOIN comp.ordenes_pago op ON op.id = l.id_op_fk
     WHERE op.status IN ('Pendiente','Pago Parcial','Pagada')
    UNION
    SELECT op.id_oc_fk FROM comp.ordenes_pago op
     WHERE op.id_oc_fk IS NOT NULL AND op.status IN ('Pendiente','Pago Parcial','Pagada')
  ),
  ultima AS (
    SELECT DISTINCT ON (d.id_articulo_fk)
           d.id_articulo_fk AS id_art,
           CASE WHEN COALESCE(d.cantidad,0) > 0 AND COALESCE(d.subtotal,0) > 0
                THEN d.subtotal / d.cantidad ELSE d.precio_unitario END AS precio,
           oc.fecha_oc, oc.id AS id_oc
      FROM comp.ordenes_compra_det d
      JOIN comp.ordenes_compra oc ON oc.id = d.id_oc_fk
     WHERE d.id_articulo_fk IS NOT NULL
       AND COALESCE(d.precio_unitario,0) > 0
       AND d.id_oc_fk IN (SELECT id_oc_fk FROM ocs_autorizadas)
       AND (p_articulos IS NULL OR d.id_articulo_fk = ANY(p_articulos))
     ORDER BY d.id_articulo_fk, oc.fecha_oc DESC NULLS LAST, oc.id DESC
  )
  UPDATE comp.articulos a
     SET precio_ultima_compra = ROUND(u.precio, 4),
         fecha_ultima_compra  = u.fecha_oc,
         id_oc_ultima_fk      = u.id_oc
    FROM ultima u
   WHERE a.id = u.id_art
     AND (a.precio_ultima_compra IS DISTINCT FROM ROUND(u.precio, 4)
          OR a.id_oc_ultima_fk IS DISTINCT FROM u.id_oc);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION comp.trg_op_actualiza_precio_articulos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = comp, public AS $$
DECLARE arts integer[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT d.id_articulo_fk) INTO arts
    FROM comp.ordenes_compra_det d
   WHERE d.id_articulo_fk IS NOT NULL
     AND d.id_oc_fk IN (
       SELECT id_oc_fk FROM comp.ordenes_pago_oc WHERE id_op_fk = NEW.id
       UNION SELECT NEW.id_oc_fk WHERE NEW.id_oc_fk IS NOT NULL);
  IF arts IS NOT NULL THEN PERFORM comp.fn_recalc_precio_ultima_compra(arts); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_op_precio_articulos ON comp.ordenes_pago;
CREATE TRIGGER trg_op_precio_articulos
  AFTER INSERT OR UPDATE OF status ON comp.ordenes_pago
  FOR EACH ROW EXECUTE FUNCTION comp.trg_op_actualiza_precio_articulos();

GRANT EXECUTE ON FUNCTION comp.fn_recalc_precio_ultima_compra(integer[]) TO authenticated, service_role;

-- Carga inicial con el histórico de OPs ya autorizadas
SELECT comp.fn_recalc_precio_ultima_compra(NULL);
