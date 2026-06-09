-- =============================================================
-- PROGRAMA ANUAL: Cuadrantes, Secciones y Áreas Comunes
-- Nueva jerarquía: Cuadrante → Sección (cfg.secciones) → Área Común
-- Reemplaza CC/Área/Frente del catálogo en el modal de programas.
-- Las columnas antiguas (id_centro_costo_fk, id_area_fk, id_frente_fk)
-- se conservan para no romper relaciones existentes.
-- =============================================================

-- 1. Tabla de Cuadrantes (catálogo propio)
CREATE TABLE IF NOT EXISTS cfg.cuadrantes (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT    NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. Asociar Secciones a Cuadrantes (nullable — no rompe datos existentes)
ALTER TABLE cfg.secciones
  ADD COLUMN IF NOT EXISTS id_cuadrante_fk INTEGER REFERENCES cfg.cuadrantes(id);

-- 3. Tabla de Áreas Comunes por Sección
CREATE TABLE IF NOT EXISTS cfg.areas_comunes (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT    NOT NULL,
  descripcion   TEXT,
  id_seccion_fk INTEGER REFERENCES cfg.secciones(id),
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. Nuevas columnas en programas_mantenimiento
--    (id_seccion_fk ya existe en la tabla, solo necesita su FK reconstruida)
ALTER TABLE ctrl.programas_mantenimiento
  ADD COLUMN IF NOT EXISTS id_cuadrante_fk  INTEGER REFERENCES cfg.cuadrantes(id),
  ADD COLUMN IF NOT EXISTS id_area_comun_fk INTEGER REFERENCES cfg.areas_comunes(id);

-- Reconectar id_seccion_fk → cfg.secciones (columna existe, FK fue eliminada antes)
ALTER TABLE ctrl.programas_mantenimiento
  DROP CONSTRAINT IF EXISTS programas_mantenimiento_id_seccion_fk_fkey;
ALTER TABLE ctrl.programas_mantenimiento
  ADD CONSTRAINT programas_mantenimiento_id_seccion_fk_fkey
  FOREIGN KEY (id_seccion_fk) REFERENCES cfg.secciones(id)
  NOT VALID;  -- no valida filas existentes para evitar conflictos con datos antiguos

-- 5. Permisos
GRANT SELECT ON cfg.cuadrantes    TO anon;
GRANT SELECT ON cfg.areas_comunes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.cuadrantes    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.areas_comunes TO authenticated;
GRANT ALL ON cfg.cuadrantes    TO service_role;
GRANT ALL ON cfg.areas_comunes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.cuadrantes_id_seq    TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE cfg.areas_comunes_id_seq TO anon, authenticated;
