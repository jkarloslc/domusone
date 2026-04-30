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
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_art;

-- Inicializar desde el MÁXIMO número de folio (no COUNT, por si hay huecos o registros borrados)
SELECT setval('comp.seq_folio_op',  GREATEST(1, COALESCE((SELECT MAX(CAST(SPLIT_PART(folio,'-',3) AS INTEGER)) FROM comp.ordenes_pago   WHERE folio ~ '^OP-[0-9]+-[0-9]+$'),  1)));
SELECT setval('comp.seq_folio_oc',  GREATEST(1, COALESCE((SELECT MAX(CAST(SPLIT_PART(folio,'-',3) AS INTEGER)) FROM comp.ordenes_compra  WHERE folio ~ '^OC-[0-9]+-[0-9]+$'),  1)));
SELECT setval('comp.seq_folio_req', GREATEST(1, COALESCE((SELECT MAX(CAST(SPLIT_PART(folio,'-',3) AS INTEGER)) FROM comp.requisiciones   WHERE folio ~ '^REQ-[0-9]+-[0-9]+$'), 1)));
SELECT setval('comp.seq_folio_trf', GREATEST(1, COALESCE((SELECT MAX(CAST(SPLIT_PART(folio,'-',3) AS INTEGER)) FROM comp.transferencias   WHERE folio ~ '^TRF-[0-9]+-[0-9]+$'), 1)));
SELECT setval('comp.seq_folio_rfq', GREATEST(1, COALESCE((SELECT MAX(CAST(SPLIT_PART(folio,'-',3) AS INTEGER)) FROM comp.rfq              WHERE folio ~ '^RFQ-[0-9]+-[0-9]+$'), 1)));
SELECT setval('comp.seq_folio_rec', GREATEST(1, COALESCE((SELECT MAX(CAST(SPLIT_PART(folio,'-',3) AS INTEGER)) FROM comp.recepciones      WHERE folio ~ '^REC-[0-9]+-[0-9]+$'), 1)));
SELECT setval('comp.seq_folio_art', GREATEST(1, COALESCE((SELECT MAX(CAST(SPLIT_PART(clave,'-',2) AS INTEGER))      FROM comp.articulos       WHERE clave ~ '^ART-[0-9]+$'), 1)));

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
    WHEN 'ART' THEN
      num := nextval('comp.seq_folio_art');
      RETURN prefijo || '-' || LPAD(num::TEXT, 4, '0');
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
GRANT USAGE ON SEQUENCE comp.seq_folio_art TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. Columna empresa en ordenes_trabajo (OT Balvanera vs Oitydisa)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE ctrl.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS empresa TEXT NOT NULL DEFAULT 'Balvanera'
  CHECK (empresa IN ('Balvanera', 'Oitydisa'));

-- ─────────────────────────────────────────────────────────────
-- 5. Relación N:M gobernada Áreas ↔ Frentes (2026-04-24)
--    Ver supabase/migrations/20260424120000_rel_area_frente_nm.sql
-- ─────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS cfg.rel_area_frente (
  id         BIGSERIAL PRIMARY KEY,
  id_area    BIGINT NOT NULL REFERENCES cfg.areas(id)   ON DELETE CASCADE,
  id_frente  BIGINT NOT NULL REFERENCES cfg.frentes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rel_area_frente_unq UNIQUE (id_area, id_frente)
);

CREATE INDEX IF NOT EXISTS idx_rel_af_area   ON cfg.rel_area_frente(id_area);
CREATE INDEX IF NOT EXISTS idx_rel_af_frente ON cfg.rel_area_frente(id_frente);

-- Migrar datos históricos (1:N existente → N:M)
INSERT INTO cfg.rel_area_frente (id_area, id_frente)
SELECT f.id_area_fk, f.id
FROM   cfg.frentes f
WHERE  f.id_area_fk IS NOT NULL
ON CONFLICT (id_area, id_frente) DO NOTHING;

-- Back-compat: id_area_fk queda NULLable como "área principal" opcional
ALTER TABLE cfg.frentes
  ALTER COLUMN id_area_fk DROP NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.rel_area_frente                 TO anon, authenticated;
GRANT USAGE,  SELECT                 ON SEQUENCE cfg.rel_area_frente_id_seq TO anon, authenticated;

ALTER TABLE cfg.rel_area_frente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rel_area_frente_all" ON cfg.rel_area_frente;
CREATE POLICY "rel_area_frente_all" ON cfg.rel_area_frente
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

COMMIT;
