-- ══════════════════════════════════════════════════════════
-- OT "Por Conceptos": costeo de la OT eligiendo conceptos del
-- catálogo (ctrl.mant_conceptos) en vez de capturar Mano de Obra/
-- Recursos manualmente. La explosión de insumos (incluida mano de
-- obra) se deriva en el cliente a partir de ctrl.mant_conceptos_insumos
-- multiplicando por la cantidad elegida en la OT — no se duplica aquí.
-- ══════════════════════════════════════════════════════════

ALTER TABLE ctrl.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS por_conceptos boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ctrl.ot_conceptos (
  id              BIGSERIAL PRIMARY KEY,
  id_ot_fk        BIGINT NOT NULL REFERENCES ctrl.ordenes_trabajo(id) ON DELETE CASCADE,
  id_concepto_fk  BIGINT REFERENCES ctrl.mant_conceptos(id) ON DELETE SET NULL,
  codigo          TEXT,
  descripcion     TEXT NOT NULL,
  unidad          TEXT,
  cantidad        NUMERIC(14,4) NOT NULL DEFAULT 0,
  costo_unitario  NUMERIC(14,4) NOT NULL DEFAULT 0,
  importe         NUMERIC(14,4) GENERATED ALWAYS AS (ROUND(cantidad * costo_unitario, 4)) STORED,
  orden           INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ctrl.ot_conceptos IS 'Conceptos del catálogo (ctrl.mant_conceptos) elegidos para una OT cuando por_conceptos=true. costo_unitario es una copia del PU venta del concepto al momento de elegirlo.';

CREATE INDEX IF NOT EXISTS idx_ot_conceptos_ot       ON ctrl.ot_conceptos(id_ot_fk);
CREATE INDEX IF NOT EXISTS idx_ot_conceptos_concepto ON ctrl.ot_conceptos(id_concepto_fk);

ALTER TABLE ctrl.ot_conceptos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ot_conceptos_all" ON ctrl.ot_conceptos;
CREATE POLICY "ot_conceptos_all" ON ctrl.ot_conceptos
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.ot_conceptos TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.ot_conceptos_id_seq TO anon, authenticated;
