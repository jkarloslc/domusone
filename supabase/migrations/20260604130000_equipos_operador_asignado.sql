-- Agrega campo operador_asignado (texto libre) a cfg.equipos
ALTER TABLE cfg.equipos ADD COLUMN IF NOT EXISTS operador_asignado TEXT;
