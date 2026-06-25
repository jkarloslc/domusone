-- Agrega campo soporte_url a ordenes_pago para adjuntar documentos de soporte
-- (cotización, contrato, correo escaneado, etc.) independiente de la factura fiscal
ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS soporte_url TEXT;
