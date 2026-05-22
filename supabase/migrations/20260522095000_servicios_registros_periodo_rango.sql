-- Cambiar campo de periodo a rango fecha_inicio – fecha_fin
ALTER TABLE ctrl.servicios_registros
  RENAME COLUMN fecha_periodo TO fecha_inicio;

ALTER TABLE ctrl.servicios_registros
  ADD COLUMN IF NOT EXISTS fecha_fin DATE;

-- Actualizar índice
DROP INDEX IF EXISTS ctrl.idx_svc_reg_periodo;
CREATE INDEX IF NOT EXISTS idx_svc_reg_periodo
  ON ctrl.servicios_registros (fecha_inicio DESC);
