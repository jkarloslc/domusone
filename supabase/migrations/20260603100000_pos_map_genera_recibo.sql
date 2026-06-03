-- Agrega flag para controlar si el corte POS genera recibo de ingreso automáticamente
-- Default FALSE — requiere configuración explícita cuando el mapeo de conceptos esté listo

ALTER TABLE golf.pos_centros_ingreso_map
  ADD COLUMN IF NOT EXISTS genera_recibo_automatico BOOLEAN NOT NULL DEFAULT FALSE;
