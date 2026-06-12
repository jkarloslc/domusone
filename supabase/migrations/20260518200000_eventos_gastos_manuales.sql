-- ============================================================
-- Módulo Hospitality: Gastos manuales por evento
-- Permite registrar gastos sin OP existente y vincularlos después
-- ============================================================

CREATE TABLE IF NOT EXISTS ctrl.eventos_gastos (
  id            BIGSERIAL    PRIMARY KEY,
  id_evento_fk  BIGINT       NOT NULL REFERENCES ctrl.eventos(id) ON DELETE CASCADE,
  concepto      TEXT         NOT NULL,
  proveedor     TEXT,                          -- texto libre, sin FK (aún no hay OP)
  tipo_gasto    TEXT,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha         DATE,
  notas         TEXT,
  id_op_fk      BIGINT,                        -- FK opcional a comp.ordenes_pago.id al vincular
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eventos_gastos_evento ON ctrl.eventos_gastos(id_evento_fk);
CREATE INDEX IF NOT EXISTS idx_eventos_gastos_op     ON ctrl.eventos_gastos(id_op_fk);

ALTER TABLE ctrl.eventos_gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_eventos_gastos" ON ctrl.eventos_gastos
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON ctrl.eventos_gastos TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.eventos_gastos_id_seq TO authenticated, service_role;
