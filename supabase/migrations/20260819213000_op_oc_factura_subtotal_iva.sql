-- Orden de Pago: datos de la factura del proveedor (fecha/folio) + desglose
-- Subtotal/IVA. El campo `monto` sigue siendo el total a pagar; en captura
-- manual (sin OC, sin distribución por área) monto = subtotal + iva.
ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS fecha_factura date,
  ADD COLUMN IF NOT EXISTS folio_factura text,
  ADD COLUMN IF NOT EXISTS subtotal      numeric(14,2),
  ADD COLUMN IF NOT EXISTS iva           numeric(14,2);

-- Orden de Compra: ya tiene subtotal/iva/total (calculados de las líneas).
-- Solo falta la referencia a la factura del proveedor cuando se captura
-- de una vez al dar de alta la OC.
ALTER TABLE comp.ordenes_compra
  ADD COLUMN IF NOT EXISTS fecha_factura date,
  ADD COLUMN IF NOT EXISTS folio_factura text;
