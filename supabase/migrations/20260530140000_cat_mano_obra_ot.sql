-- ══════════════════════════════════════════════════════════
-- Catálogo de Categorías de Mano de Obra
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cfg.cat_categorias_mano_obra (
  id                    BIGSERIAL PRIMARY KEY,
  categoria             TEXT NOT NULL,
  sueldo_diario         NUMERIC(10,2) NOT NULL DEFAULT 0,
  costo_hora_referencia NUMERIC(10,2) GENERATED ALWAYS AS (ROUND(sueldo_diario / 8.0, 2)) STORED,
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cfg.cat_categorias_mano_obra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cat_mano_obra_all" ON cfg.cat_categorias_mano_obra;
CREATE POLICY "cat_mano_obra_all" ON cfg.cat_categorias_mano_obra
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.cat_categorias_mano_obra TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE cfg.cat_categorias_mano_obra_id_seq TO anon, authenticated;

-- ══════════════════════════════════════════════════════════
-- Mano de Obra por OT
-- ══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ctrl.ot_mano_obra (
  id              BIGSERIAL PRIMARY KEY,
  id_ot_fk        BIGINT NOT NULL REFERENCES ctrl.ordenes_trabajo(id) ON DELETE CASCADE,
  id_categoria_fk BIGINT REFERENCES cfg.cat_categorias_mano_obra(id),
  trabajadores    INTEGER NOT NULL DEFAULT 1,
  horas           NUMERIC(6,2) NOT NULL DEFAULT 0,
  costo_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ctrl.ot_mano_obra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ot_mano_obra_all" ON ctrl.ot_mano_obra;
CREATE POLICY "ot_mano_obra_all" ON ctrl.ot_mano_obra
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.ot_mano_obra TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.ot_mano_obra_id_seq TO anon, authenticated;

-- ══════════════════════════════════════════════════════════
-- Campo tipo en ot_recursos (Material / Equipo)
-- ══════════════════════════════════════════════════════════
ALTER TABLE ctrl.ot_recursos
  ADD COLUMN IF NOT EXISTS tipo TEXT;
