-- Agrega monto_prometido a las 3 tablas de bitácora de cobranza.
-- Nullable: no todos los contactos resultan en un monto prometido.

ALTER TABLE golf.bitacora_cobranza
  ADD COLUMN IF NOT EXISTS monto_prometido NUMERIC(12,2);

ALTER TABLE ctrl.bitacora_cobranza_res
  ADD COLUMN IF NOT EXISTS monto_prometido NUMERIC(12,2);

ALTER TABLE hip.bitacora_cobranza
  ADD COLUMN IF NOT EXISTS monto_prometido NUMERIC(12,2);
