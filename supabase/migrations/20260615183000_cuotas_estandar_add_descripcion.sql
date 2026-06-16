-- Agrega columna descripcion a cfg.cuotas_estandar
ALTER TABLE cfg.cuotas_estandar
  ADD COLUMN IF NOT EXISTS descripcion text;
