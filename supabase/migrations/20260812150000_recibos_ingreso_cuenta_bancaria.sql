-- Permite asociar un recibo de ingreso completo a la cuenta bancaria donde entró
-- el dinero (todas las formas de cobro del recibo se depositan a la misma cuenta),
-- para poder cuadrar contra el auxiliar de bancos.

ALTER TABLE ctrl.recibos_ingreso
  ADD COLUMN IF NOT EXISTS id_cuenta_bancaria_fk integer REFERENCES cfg.cuentas_bancarias(id);

CREATE INDEX IF NOT EXISTS idx_recibos_ingreso_cuenta
  ON ctrl.recibos_ingreso(id_cuenta_bancaria_fk);

-- Vínculo inverso desde el kardex bancario hacia el recibo de ingreso que originó
-- el abono (igual que id_abono_fk ya vincula un cargo con su abono de CXP).
ALTER TABLE comp.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS id_recibo_ingreso_fk integer REFERENCES ctrl.recibos_ingreso(id);

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_recibo_ingreso
  ON comp.movimientos_bancarios(id_recibo_ingreso_fk);

-- Si ya ejecutaste una versión anterior de esta migración que agregaba la columna
-- a recibos_ingreso_formas_pago (enfoque descartado: cuenta por forma de cobro en
-- vez de por recibo completo), puedes eliminarla — ya no se usa:
ALTER TABLE ctrl.recibos_ingreso_formas_pago DROP COLUMN IF EXISTS id_cuenta_bancaria_fk;
