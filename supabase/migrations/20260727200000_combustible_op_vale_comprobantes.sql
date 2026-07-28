-- El vínculo Vale <-> OP ahora se administra desde la Orden de Pago (tipo de
-- gasto Combustible), no desde el modal del vale — ctrl.vales_combustible.id_op_fk
-- ya existía y se sigue usando igual, solo cambia quién lo escribe.
--
-- Documentos adjuntos: el vale puede llevar su propio PDF/imagen, y cada
-- registro de Bitácora de Uso puede llevar el comprobante de la carga.
ALTER TABLE ctrl.vales_combustible
  ADD COLUMN IF NOT EXISTS comprobante_url TEXT;

ALTER TABLE ctrl.bitacora_uso_equipos
  ADD COLUMN IF NOT EXISTS comprobante_url TEXT;
