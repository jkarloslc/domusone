-- ============================================================
--  GOLF SCHEMA — Fase 1: Miembros
--  Ejecutar en Supabase SQL Editor (una sola vez)
-- ============================================================

-- 1. Crear schema
CREATE SCHEMA IF NOT EXISTS golf;

-- 2. Permisos de uso del schema
GRANT USAGE ON SCHEMA golf TO authenticated;
GRANT USAGE ON SCHEMA golf TO service_role;

-- ============================================================
--  CATÁLOGO: Categorías de socios
-- ============================================================
CREATE TABLE IF NOT EXISTS golf.cat_categorias_socios (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_categorias_socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_cat_categorias_socios"
  ON golf.cat_categorias_socios
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON golf.cat_categorias_socios TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_categorias_socios_id_seq TO authenticated;

-- Datos iniciales de categorías
INSERT INTO golf.cat_categorias_socios (nombre, descripcion) VALUES
  ('Socio Activo',        'Membresía completa con acceso a todos los servicios'),
  ('Socio Familiar',      'Acceso extendido para grupo familiar'),
  ('Socio Corporativo',   'Membresía corporativa para empresas'),
  ('Socio Junior',        'Membresía para menores de 25 años'),
  ('Socio Vitalicio',     'Membresía permanente sin vencimiento'),
  ('Visitante Frecuente', 'Acceso limitado sin membresía plena')
ON CONFLICT DO NOTHING;

-- ============================================================
--  CATÁLOGO: Socios
-- ============================================================
CREATE TABLE IF NOT EXISTS golf.cat_socios (
  id                  SERIAL PRIMARY KEY,
  numero_socio        TEXT,
  nombre              TEXT NOT NULL,
  apellido_paterno    TEXT,
  apellido_materno    TEXT,
  id_categoria_fk     INTEGER REFERENCES golf.cat_categorias_socios(id),
  email               TEXT,
  telefono            TEXT,
  fecha_nacimiento    DATE,
  fecha_alta          DATE,
  fecha_vencimiento   DATE,
  rfc                 TEXT,
  curp                TEXT,
  numero_tarjeta      TEXT,
  activo              BOOLEAN NOT NULL DEFAULT true,
  observaciones       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_cat_socios"
  ON golf.cat_socios
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON golf.cat_socios TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_socios_id_seq TO authenticated;

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_cat_socios_numero   ON golf.cat_socios(numero_socio);
CREATE INDEX IF NOT EXISTS idx_cat_socios_apellido ON golf.cat_socios(apellido_paterno, nombre);
CREATE INDEX IF NOT EXISTS idx_cat_socios_activo   ON golf.cat_socios(activo);
CREATE INDEX IF NOT EXISTS idx_cat_socios_categoria ON golf.cat_socios(id_categoria_fk);

-- ============================================================
--  CATÁLOGO: Familiares del socio (para fases futuras)
-- ============================================================
CREATE TABLE IF NOT EXISTS golf.cat_familiares (
  id               SERIAL PRIMARY KEY,
  id_socio_fk      INTEGER NOT NULL REFERENCES golf.cat_socios(id) ON DELETE CASCADE,
  nombre           TEXT NOT NULL,
  apellido_paterno TEXT,
  apellido_materno TEXT,
  parentesco       TEXT,         -- cónyuge, hijo, hija, etc.
  fecha_nacimiento DATE,
  activo           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_familiares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_cat_familiares"
  ON golf.cat_familiares
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT ALL ON golf.cat_familiares TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_familiares_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_cat_familiares_socio ON golf.cat_familiares(id_socio_fk);

-- ============================================================
--  VERIFICACIÓN (opcional — ejecutar para confirmar)
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'golf' ORDER BY table_name;
