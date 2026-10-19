ALTER TABLE cfg.colaboradores
  ADD COLUMN IF NOT EXISTS tipo_nomina text,
  ADD COLUMN IF NOT EXISTS sueldo_neto_semanal_quincenal numeric(12,2);

ALTER TABLE cfg.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_tipo_nomina_check;
ALTER TABLE cfg.colaboradores ADD CONSTRAINT colaboradores_tipo_nomina_check
  CHECK (tipo_nomina IS NULL OR tipo_nomina IN ('Semanal', 'Quincenal'));

COMMENT ON COLUMN cfg.colaboradores.sueldo_neto_semanal_quincenal IS 'Sueldo neto por periodo de pago (según tipo_nomina). sueldo_neto_mensual se calcula desde aquí: Quincenal x2, Semanal x52/12.';
