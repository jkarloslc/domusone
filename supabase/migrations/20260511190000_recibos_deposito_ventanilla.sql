-- Agregar forma de pago: Depósito en Ventanilla
ALTER TABLE ctrl.recibos_ingreso
  ADD COLUMN IF NOT EXISTS monto_deposito NUMERIC(14,2) DEFAULT 0 NOT NULL;
