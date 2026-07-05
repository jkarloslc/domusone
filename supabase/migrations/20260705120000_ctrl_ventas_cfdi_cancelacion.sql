-- Permite cancelar (ante el SAT/PAC) el CFDI de una venta POS de golf
-- sin perder el historial de timbrado.
ALTER TABLE golf.ctrl_ventas_cfdi
  ADD COLUMN IF NOT EXISTS status              TEXT NOT NULL DEFAULT 'Vigente',
  ADD COLUMN IF NOT EXISTS fecha_cancelacion    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion   TEXT;

ALTER TABLE golf.ctrl_ventas_cfdi DROP CONSTRAINT IF EXISTS ctrl_ventas_cfdi_status_check;
ALTER TABLE golf.ctrl_ventas_cfdi ADD CONSTRAINT ctrl_ventas_cfdi_status_check
  CHECK (status IN ('Vigente', 'Cancelada'));
