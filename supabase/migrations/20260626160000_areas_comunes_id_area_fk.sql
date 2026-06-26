-- =============================================================
-- areas_comunes: reemplaza id_seccion_fk por id_area_fk
-- Anteriormente areas_comunes se relacionaba con cfg.secciones;
-- ahora se relaciona con cfg.areas (intermediario correcto).
-- Se conserva id_seccion_fk nullable para no romper datos existentes.
-- =============================================================

ALTER TABLE cfg.areas_comunes
  ADD COLUMN IF NOT EXISTS id_area_fk INTEGER REFERENCES cfg.areas(id);

CREATE INDEX IF NOT EXISTS idx_areas_comunes_area ON cfg.areas_comunes(id_area_fk);
