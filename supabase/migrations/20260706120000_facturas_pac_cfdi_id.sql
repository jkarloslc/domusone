-- La API de cancelación de Facturama (DELETE /cfdi/{id}) requiere el Id
-- interno del PAC, no el folio_fiscal (UUID del SAT) que ya guardábamos.
-- ctrl.facturas nunca guardó ese Id — se agrega la columna para que
-- app/facturas/FacturaModal.tsx pueda guardarlo al timbrar y
-- app/facturas/FacturaDetail.tsx pueda cancelar.
--
-- NOTA: las facturas ya emitidas antes de esta migración no tendrán este
-- valor (no hay forma de recuperarlo retroactivamente desde la API de
-- Facturama con el UUID) — esas quedan sin poder cancelarse desde este
-- botón; deben cancelarse directamente en el portal de Facturama.
ALTER TABLE ctrl.facturas
  ADD COLUMN IF NOT EXISTS pac_cfdi_id TEXT;
