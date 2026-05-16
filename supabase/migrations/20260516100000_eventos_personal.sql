-- Personal Operativo tab for eventos
-- Adds justificacion/notas fields to ctrl.eventos
-- Creates ctrl.eventos_personal table

ALTER TABLE ctrl.eventos
  ADD COLUMN IF NOT EXISTS justificacion_gasto_personal TEXT,
  ADD COLUMN IF NOT EXISTS notas_personal TEXT;

CREATE TABLE IF NOT EXISTS ctrl.eventos_personal (
  id               BIGSERIAL PRIMARY KEY,
  id_evento_fk     BIGINT NOT NULL REFERENCES ctrl.eventos(id) ON DELETE CASCADE,
  nombre_empleado  TEXT NOT NULL,
  dia              DATE NOT NULL,
  turno            TEXT,
  compensacion     NUMERIC(12,2) DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eventos_personal_evento ON ctrl.eventos_personal(id_evento_fk);

-- RLS: same policy as otras tablas del módulo ctrl
ALTER TABLE ctrl.eventos_personal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON ctrl.eventos_personal
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
