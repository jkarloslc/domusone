-- Agrega campo para registrar quién autorizó una venta con forma de pago Condonación
ALTER TABLE golf.ctrl_ventas
  ADD COLUMN IF NOT EXISTS autoriza_condonacion TEXT;
