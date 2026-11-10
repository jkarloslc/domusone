-- =============================================================
-- Sección ↔ Zona (cfg.cuadrantes) pasa de 1:N a N:M
-- Una sección puede pertenecer a 2+ zonas. La columna
-- cfg.secciones.id_cuadrante_fk se conserva (no rompe nada) pero
-- deja de ser la fuente de verdad: la UI y los filtros usan
-- cfg.rel_seccion_cuadrante. Mismo patrón que cfg.rel_area_cuadrante.
-- Los lotes heredan las zonas de su sección.
-- =============================================================

CREATE TABLE IF NOT EXISTS cfg.rel_seccion_cuadrante (
  id_seccion   INTEGER NOT NULL REFERENCES cfg.secciones(id),
  id_cuadrante INTEGER NOT NULL REFERENCES cfg.cuadrantes(id),
  PRIMARY KEY (id_seccion, id_cuadrante)
);

CREATE INDEX IF NOT EXISTS idx_rel_sc_seccion   ON cfg.rel_seccion_cuadrante(id_seccion);
CREATE INDEX IF NOT EXISTS idx_rel_sc_cuadrante ON cfg.rel_seccion_cuadrante(id_cuadrante);

-- Backfill desde la relación 1:N existente
INSERT INTO cfg.rel_seccion_cuadrante (id_seccion, id_cuadrante)
SELECT id, id_cuadrante_fk FROM cfg.secciones WHERE id_cuadrante_fk IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE cfg.rel_seccion_cuadrante ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rel_seccion_cuadrante_select_auth ON cfg.rel_seccion_cuadrante;
DROP POLICY IF EXISTS rel_seccion_cuadrante_insert_auth ON cfg.rel_seccion_cuadrante;
DROP POLICY IF EXISTS rel_seccion_cuadrante_delete_auth ON cfg.rel_seccion_cuadrante;
CREATE POLICY rel_seccion_cuadrante_select_auth
  ON cfg.rel_seccion_cuadrante FOR SELECT TO authenticated USING (true);
CREATE POLICY rel_seccion_cuadrante_insert_auth
  ON cfg.rel_seccion_cuadrante FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY rel_seccion_cuadrante_delete_auth
  ON cfg.rel_seccion_cuadrante FOR DELETE TO authenticated USING (true);

-- Grants
GRANT SELECT ON cfg.rel_seccion_cuadrante TO anon;
GRANT SELECT, INSERT, DELETE ON cfg.rel_seccion_cuadrante TO authenticated;
GRANT ALL ON cfg.rel_seccion_cuadrante TO service_role;
