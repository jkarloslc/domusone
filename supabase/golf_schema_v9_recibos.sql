-- ============================================================
-- GOLF SCHEMA v9 — Recibos de Cobro CXC Golf
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Tabla de recibos (cabecera)
CREATE TABLE IF NOT EXISTS golf.recibos_golf (
  id                SERIAL PRIMARY KEY,
  folio             TEXT NOT NULL,                    -- ej. RG-2026-00001
  id_socio_fk       INTEGER REFERENCES golf.cat_socios(id),
  fecha_recibo      DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0,
  descuento         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total             NUMERIC(10,2) NOT NULL DEFAULT 0,
  id_forma_pago_fk  INTEGER,                          -- referencia a cfg.formas_pago
  forma_pago_nombre TEXT,                             -- snapshot del nombre
  referencia_pago   TEXT,
  observaciones     TEXT,
  usuario_cobra     TEXT,
  status            TEXT NOT NULL DEFAULT 'VIGENTE',  -- VIGENTE | CANCELADO
  facturable        BOOLEAN NOT NULL DEFAULT false,
  folio_fiscal      TEXT,                             -- UUID SAT si se facturó
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recibos_golf_socio  ON golf.recibos_golf(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_recibos_golf_fecha  ON golf.recibos_golf(fecha_recibo);
CREATE INDEX IF NOT EXISTS idx_recibos_golf_folio  ON golf.recibos_golf(folio);

GRANT ALL ON golf.recibos_golf TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.recibos_golf_id_seq TO anon, authenticated;
ALTER TABLE golf.recibos_golf ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON golf.recibos_golf;
CREATE POLICY "allow_all" ON golf.recibos_golf
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. Tabla de detalle del recibo (qué cuotas incluye)
CREATE TABLE IF NOT EXISTS golf.recibos_golf_det (
  id               SERIAL PRIMARY KEY,
  id_recibo_fk     INTEGER NOT NULL REFERENCES golf.recibos_golf(id) ON DELETE CASCADE,
  id_cuota_fk      INTEGER REFERENCES golf.cxc_golf(id),
  concepto         TEXT NOT NULL,
  tipo             TEXT,                              -- INSCRIPCION | MENSUALIDAD | PENSION_CARRITO
  periodo          TEXT,
  monto_original   NUMERIC(10,2) NOT NULL DEFAULT 0,
  descuento        NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_final      NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recibos_golf_det_recibo ON golf.recibos_golf_det(id_recibo_fk);

GRANT ALL ON golf.recibos_golf_det TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.recibos_golf_det_id_seq TO anon, authenticated;
ALTER TABLE golf.recibos_golf_det ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON golf.recibos_golf_det;
CREATE POLICY "allow_all" ON golf.recibos_golf_det
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. Agregar id_recibo_fk a cxc_golf para trazar qué recibo cobró cada cuota
ALTER TABLE golf.cxc_golf
  ADD COLUMN IF NOT EXISTS id_recibo_fk INTEGER REFERENCES golf.recibos_golf(id);

-- 4. Función para generar folio correlativo
CREATE OR REPLACE FUNCTION golf.next_folio_recibo(anio INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO n
  FROM golf.recibos_golf
  WHERE EXTRACT(YEAR FROM fecha_recibo) = anio;
  RETURN 'RG-' || anio || '-' || LPAD(n::TEXT, 5, '0');
END;
$$;
