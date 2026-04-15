-- ══════════════════════════════════════════════════════════════
-- MIGRACIONES PENDIENTES — Ejecutar en Supabase SQL Editor
-- Orden de ejecución: de arriba hacia abajo
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. Columna referencia_pago en comp.ordenes_pago
--    (ya corriste autorizado_por, fecha_autorizacion, instrucciones_pago
--     pero faltó referencia_pago)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS referencia_pago TEXT;

-- ─────────────────────────────────────────────────────────────
-- 2. Columna costo_promedio en comp.inventario
--    (requerido por recepciones y modal de movimientos)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE comp.inventario
  ADD COLUMN IF NOT EXISTS costo_promedio NUMERIC(14, 4) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────
-- 3. Secuencias atómicas para folios (elimina duplicate key en OPs y más)
-- ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_op;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_oc;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_req;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_trf;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_rfq;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_rec;
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_val;

SELECT setval('comp.seq_folio_op',  GREATEST(1, (SELECT COUNT(*) FROM comp.ordenes_pago)));
SELECT setval('comp.seq_folio_oc',  GREATEST(1, (SELECT COUNT(*) FROM comp.ordenes_compra)));
SELECT setval('comp.seq_folio_req', GREATEST(1, (SELECT COUNT(*) FROM comp.requisiciones)));
SELECT setval('comp.seq_folio_trf', GREATEST(1, (SELECT COUNT(*) FROM comp.transferencias)));
SELECT setval('comp.seq_folio_rfq', GREATEST(1, (SELECT COUNT(*) FROM comp.rfq)));
SELECT setval('comp.seq_folio_rec', GREATEST(1, (SELECT COUNT(*) FROM comp.recepciones)));

CREATE OR REPLACE FUNCTION comp.fn_next_folio(prefijo TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  num  BIGINT;
  anio TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
BEGIN
  CASE prefijo
    WHEN 'OP'  THEN num := nextval('comp.seq_folio_op');
    WHEN 'OC'  THEN num := nextval('comp.seq_folio_oc');
    WHEN 'REQ' THEN num := nextval('comp.seq_folio_req');
    WHEN 'TRF' THEN num := nextval('comp.seq_folio_trf');
    WHEN 'RFQ' THEN num := nextval('comp.seq_folio_rfq');
    WHEN 'REC' THEN num := nextval('comp.seq_folio_rec');
    WHEN 'VAL' THEN num := nextval('comp.seq_folio_val');
    ELSE RAISE EXCEPTION 'Prefijo desconocido: %', prefijo;
  END CASE;
  RETURN prefijo || '-' || anio || '-' || LPAD(num::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION comp.fn_next_folio(TEXT) TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_op  TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_oc  TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_req TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_trf TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_rfq TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_rec TO authenticated;
GRANT USAGE ON SEQUENCE comp.seq_folio_val TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Columna empresa en ordenes_trabajo (OT Balvanera vs Oitydisa)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE mant.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS empresa TEXT NOT NULL DEFAULT 'Balvanera'
  CHECK (empresa IN ('Balvanera', 'Oitydisa'));
