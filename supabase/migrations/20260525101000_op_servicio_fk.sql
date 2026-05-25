-- Vincula una OP al servicio de suministro que pagó (útil para provider id=75)
ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS id_servicio_fk BIGINT;

-- Registra qué OP originó cada registro de consumo (trazabilidad)
ALTER TABLE ctrl.servicios_registros
  ADD COLUMN IF NOT EXISTS id_op_fk BIGINT;
