-- ============================================================
-- GOLF SCHEMA v7 — Extensión Socios
-- 1. Columna identificacion_url en cat_socios
-- 2. Tabla ctrl_contratos_membresia
-- Ejecutar completo en Supabase → SQL Editor
-- ============================================================

-- 1. Agregar columna de identificación al catálogo de socios
ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS identificacion_url TEXT;

-- 2. Tabla de contratos de membresía
CREATE TABLE IF NOT EXISTS golf.ctrl_contratos_membresia (
  id              SERIAL PRIMARY KEY,
  id_socio_fk     INTEGER NOT NULL REFERENCES golf.cat_socios(id) ON DELETE CASCADE,
  anio            INTEGER NOT NULL,                  -- año del contrato (ej. 2025)
  fecha_inicio    DATE,
  fecha_fin       DATE,
  monto           NUMERIC(12,2),
  vigente         BOOLEAN NOT NULL DEFAULT false,
  archivo_url     TEXT,                              -- PDF del contrato firmado
  notas           TEXT,
  usuario_crea    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para búsquedas por socio
CREATE INDEX IF NOT EXISTS idx_ctrl_contratos_membresia_socio
  ON golf.ctrl_contratos_membresia (id_socio_fk);

-- Solo puede haber un contrato vigente por socio (constraint parcial)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ctrl_contratos_membresia_vigente
  ON golf.ctrl_contratos_membresia (id_socio_fk)
  WHERE vigente = true;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION golf.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_contratos_updated_at ON golf.ctrl_contratos_membresia;
CREATE TRIGGER trg_contratos_updated_at
  BEFORE UPDATE ON golf.ctrl_contratos_membresia
  FOR EACH ROW EXECUTE FUNCTION golf.set_updated_at();

-- 3. GRANTs
GRANT ALL ON golf.ctrl_contratos_membresia TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_contratos_membresia_id_seq TO anon, authenticated;

-- 4. RLS
ALTER TABLE golf.ctrl_contratos_membresia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON golf.ctrl_contratos_membresia;
CREATE POLICY "allow_all" ON golf.ctrl_contratos_membresia
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. Storage bucket para identificaciones y contratos
-- Nota: Crear manualmente en Supabase Dashboard → Storage → Buckets:
--   Bucket: golf-docs  (Public: NO, recomendado privado)
--   Allowed MIME types: image/jpeg, image/png, application/pdf
--   File size limit: 5 MB
