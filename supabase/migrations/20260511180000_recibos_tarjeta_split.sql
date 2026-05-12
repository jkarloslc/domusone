-- Separar campo Tarjeta en Tarjeta Débito y Tarjeta Crédito en recibos de ingreso
ALTER TABLE ctrl.recibos_ingreso
  ADD COLUMN IF NOT EXISTS monto_tarjeta_debito  NUMERIC(14,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS monto_tarjeta_credito NUMERIC(14,2) DEFAULT 0 NOT NULL;

-- monto_tarjeta sigue igual para retrocompatibilidad (= débito + crédito en registros nuevos)
-- Registros existentes quedan con monto_tarjeta_debito = 0 y monto_tarjeta_credito = 0
-- El sistema UI los mostrará usando monto_tarjeta como fallback en la columna débito
