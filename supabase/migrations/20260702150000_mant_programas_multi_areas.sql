-- =============================================================
-- Programas de Mantenimiento — un programa puede aplicar a
-- múltiples Áreas Comunes (antes: 1 FK singular obligaba a crear
-- un programa idéntico por cada área común, inflando altas y la
-- grilla de Ejecución Semanal).
-- =============================================================

-- 1. Tabla puente programa ↔ áreas comunes
CREATE TABLE IF NOT EXISTS ctrl.mant_programa_areas (
  id                SERIAL PRIMARY KEY,
  id_programa_fk    INTEGER NOT NULL REFERENCES ctrl.mant_programas(id) ON DELETE CASCADE,
  id_area_comun_fk  INTEGER NOT NULL REFERENCES cfg.areas_comunes(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (id_programa_fk, id_area_comun_fk)
);

CREATE INDEX IF NOT EXISTS idx_mant_programa_areas_programa ON ctrl.mant_programa_areas (id_programa_fk);
CREATE INDEX IF NOT EXISTS idx_mant_programa_areas_area     ON ctrl.mant_programa_areas (id_area_comun_fk);

-- 2. Migrar la relación 1:1 existente hacia la tabla puente
INSERT INTO ctrl.mant_programa_areas (id_programa_fk, id_area_comun_fk)
SELECT id, id_area_comun_fk FROM ctrl.mant_programas
WHERE id_area_comun_fk IS NOT NULL
ON CONFLICT (id_programa_fk, id_area_comun_fk) DO NOTHING;

-- 3. La columna singular queda reemplazada por la tabla puente
ALTER TABLE ctrl.mant_programas DROP COLUMN IF EXISTS id_area_comun_fk;

-- 4. Ejecuciones: se desglosan por área común dentro del mismo programa
--    (id_area_comun_fk nulo = ejecución registrada a nivel programa,
--    caso de programas sin áreas comunes asignadas)
ALTER TABLE ctrl.mant_ejecuciones
  ADD COLUMN IF NOT EXISTS id_area_comun_fk INTEGER REFERENCES cfg.areas_comunes(id);

ALTER TABLE ctrl.mant_ejecuciones DROP CONSTRAINT IF EXISTS mant_ejecuciones_id_programa_fk_fecha_prog_key;
ALTER TABLE ctrl.mant_ejecuciones
  ADD CONSTRAINT mant_ejecuciones_programa_area_fecha_key
  UNIQUE (id_programa_fk, id_area_comun_fk, fecha_prog);

CREATE INDEX IF NOT EXISTS idx_mant_ejecuciones_area ON ctrl.mant_ejecuciones (id_area_comun_fk);

-- 5. Permisos (patrón repetido varias veces en este proyecto: tablas
--    nuevas sin GRANT explícito fallan en silencio para 'authenticated')
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.mant_programa_areas TO authenticated;
GRANT ALL ON ctrl.mant_programa_areas TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.mant_programa_areas_id_seq TO authenticated;

-- 6. RLS — este esquema requiere políticas explícitas aunque el
--    GRANT exista (ver 20260629190000_mant_programas_rls.sql)
ALTER TABLE ctrl.mant_programa_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mant_programa_areas_select" ON ctrl.mant_programa_areas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mant_programa_areas_insert" ON ctrl.mant_programa_areas
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mant_programa_areas_update" ON ctrl.mant_programa_areas
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mant_programa_areas_delete" ON ctrl.mant_programa_areas
  FOR DELETE TO authenticated USING (true);
