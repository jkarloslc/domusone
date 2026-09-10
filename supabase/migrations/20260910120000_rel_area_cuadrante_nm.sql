-- =============================================================
-- Área ↔ Cuadrante pasa de 1:1 (cfg.areas.id_cuadrante_fk) a N:M
-- Un Área puede pertenecer a varios Cuadrantes a la vez (ej. el
-- área "Mantto. Agaves" cubre los 5 sub-cuadrantes "1 - Agaves"
-- .. "5 - Agaves"). La columna cfg.areas.id_cuadrante_fk se
-- conserva (no se elimina, no rompe relaciones existentes) pero
-- deja de ser la fuente de verdad: la UI y los filtros ahora usan
-- cfg.rel_area_cuadrante. Mismo patrón que cfg.rel_area_area_comun.
-- =============================================================

CREATE TABLE IF NOT EXISTS cfg.rel_area_cuadrante (
  id_area      INTEGER NOT NULL REFERENCES cfg.areas(id),
  id_cuadrante INTEGER NOT NULL REFERENCES cfg.cuadrantes(id),
  PRIMARY KEY (id_area, id_cuadrante)
);

CREATE INDEX IF NOT EXISTS idx_rel_ac_area      ON cfg.rel_area_cuadrante(id_area);
CREATE INDEX IF NOT EXISTS idx_rel_ac_cuadrante ON cfg.rel_area_cuadrante(id_cuadrante);

-- Backfill desde la relación 1:1 existente
INSERT INTO cfg.rel_area_cuadrante (id_area, id_cuadrante)
SELECT id, id_cuadrante_fk FROM cfg.areas WHERE id_cuadrante_fk IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE cfg.rel_area_cuadrante ENABLE ROW LEVEL SECURITY;

CREATE POLICY rel_area_cuadrante_select_auth
  ON cfg.rel_area_cuadrante FOR SELECT TO authenticated USING (true);
CREATE POLICY rel_area_cuadrante_insert_auth
  ON cfg.rel_area_cuadrante FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rel_area_cuadrante_delete_auth
  ON cfg.rel_area_cuadrante FOR DELETE TO authenticated USING (true);

-- Grants
GRANT SELECT ON cfg.rel_area_cuadrante TO anon;
GRANT SELECT, INSERT, DELETE ON cfg.rel_area_cuadrante TO authenticated;
GRANT ALL ON cfg.rel_area_cuadrante TO service_role;
