-- Permite asociar cada forma de cobro de un recibo de ingreso a la cuenta bancaria
-- donde efectivamente entró el dinero, para poder cuadrar contra el auxiliar de bancos.
-- El monto en Efectivo puede quedar sin cuenta (no entra directo a banco).

ALTER TABLE ctrl.recibos_ingreso_formas_pago
  ADD COLUMN IF NOT EXISTS id_cuenta_bancaria_fk integer REFERENCES cfg.cuentas_bancarias(id);

CREATE INDEX IF NOT EXISTS idx_recibos_ingreso_formas_pago_cuenta
  ON ctrl.recibos_ingreso_formas_pago(id_cuenta_bancaria_fk);

-- Vínculo inverso desde el kardex bancario hacia el recibo de ingreso que originó
-- el abono (igual que id_abono_fk ya vincula un cargo con su abono de CXP).
ALTER TABLE comp.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS id_recibo_ingreso_fk integer REFERENCES ctrl.recibos_ingreso(id);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_recibo_ingreso
  ON comp.movimientos_bancarios(id_recibo_ingreso_fk);
