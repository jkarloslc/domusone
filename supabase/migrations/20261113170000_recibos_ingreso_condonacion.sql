-- Recibos de ingreso: forma de cobro "Condonación / Intercambio".
-- Cuenta en la sumatoria de formas de cobro (cuadra contra el total del recibo),
-- pero no es caja: no se abona al kardex bancario.
ALTER TABLE ctrl.recibos_ingreso
  ADD COLUMN IF NOT EXISTS monto_condonacion NUMERIC(14,2) NOT NULL DEFAULT 0;
