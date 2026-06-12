-- =============================================================
-- N:M Secciones ↔ Áreas Comunes
-- Reemplaza el FK 1:N (areas_comunes.id_seccion_fk) por una
-- tabla junction que permite que un área común pertenezca
-- a varias secciones y viceversa.
-- La columna id_seccion_fk en areas_comunes se conserva para
-- no romper datos existentes, pero deja de ser el vínculo principal.
-- =============================================================

-- 1. Tabla junction
CREATE TABLE IF NOT EXISTS cfg.rel_seccion_area_comun (
  id_seccion_fk    INTEGER NOT NULL REFERENCES cfg.secciones(id),
  id_area_comun_fk INTEGER NOT NULL REFERENCES cfg.areas_comunes(id),
  PRIMARY KEY (id_seccion_fk, id_area_comun_fk)
);

-- 2. Migrar relaciones 1:N existentes → junction
INSERT INTO cfg.rel_seccion_area_comun (id_seccion_fk, id_area_comun_fk)
SELECT id_seccion_fk, id
FROM cfg.areas_comunes
WHERE id_seccion_fk IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. RLS
ALTER TABLE cfg.rel_seccion_area_comun ENABLE ROW LEVEL SECURITY;

CREATE POLICY rel_seccion_area_comun_select_auth
  ON cfg.rel_seccion_area_comun FOR SELECT TO authenticated USING (true);
CREATE POLICY rel_seccion_area_comun_insert_auth
  ON cfg.rel_seccion_area_comun FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rel_seccion_area_comun_delete_auth
  ON cfg.rel_seccion_area_comun FOR DELETE TO authenticated USING (true);

-- 4. Grants
GRANT SELECT ON cfg.rel_seccion_area_comun TO anon;
GRANT SELECT, INSERT, DELETE ON cfg.rel_seccion_area_comun TO authenticated;
GRANT ALL ON cfg.rel_seccion_area_comun TO service_role;
