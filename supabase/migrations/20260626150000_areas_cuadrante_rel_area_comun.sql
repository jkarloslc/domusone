-- =============================================================
-- Jerarquía Mantenimiento: Cuadrante → Área → Área Común
-- Reemplaza el intermediario Sección por Área en el módulo
-- de programas de mantenimiento.
-- =============================================================

-- 1. Agregar id_cuadrante_fk a cfg.areas (nullable, no rompe datos)
ALTER TABLE cfg.areas
  ADD COLUMN IF NOT EXISTS id_cuadrante_fk INTEGER REFERENCES cfg.cuadrantes(id);

CREATE INDEX IF NOT EXISTS idx_areas_cuadrante ON cfg.areas(id_cuadrante_fk);

-- 2. Tabla junction Área ↔ Área Común (N:M, igual que rel_area_frente)
CREATE TABLE IF NOT EXISTS cfg.rel_area_area_comun (
  id_area       INTEGER NOT NULL REFERENCES cfg.areas(id),
  id_area_comun INTEGER NOT NULL REFERENCES cfg.areas_comunes(id),
  PRIMARY KEY (id_area, id_area_comun)
);

CREATE INDEX IF NOT EXISTS idx_rel_aac_area       ON cfg.rel_area_area_comun(id_area);
CREATE INDEX IF NOT EXISTS idx_rel_aac_area_comun ON cfg.rel_area_area_comun(id_area_comun);

-- 3. RLS
ALTER TABLE cfg.rel_area_area_comun ENABLE ROW LEVEL SECURITY;

CREATE POLICY rel_area_area_comun_select_auth
  ON cfg.rel_area_area_comun FOR SELECT TO authenticated USING (true);
CREATE POLICY rel_area_area_comun_insert_auth
  ON cfg.rel_area_area_comun FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rel_area_area_comun_delete_auth
  ON cfg.rel_area_area_comun FOR DELETE TO authenticated USING (true);

-- 4. Grants
GRANT SELECT ON cfg.rel_area_area_comun TO anon;
GRANT SELECT, INSERT, DELETE ON cfg.rel_area_area_comun TO authenticated;
GRANT ALL ON cfg.rel_area_area_comun TO service_role;
