ALTER TABLE cfg.colaboradores
  ADD COLUMN IF NOT EXISTS costo_mensual numeric(12,2),
  ADD COLUMN IF NOT EXISTS no_empleado   text;

COMMENT ON COLUMN cfg.colaboradores.costo_mensual IS 'Costo mensual total para la empresa (sueldo + cargas/prestaciones).';
COMMENT ON COLUMN cfg.colaboradores.no_empleado   IS 'Número de empleado (texto libre).';
