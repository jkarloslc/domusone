-- Vínculo recibo residencial ↔ ticket POS (golf.ctrl_ventas), igual que
-- recibos_golf.id_venta_pos_fk y recibos_hip.id_venta_pos_fk.
-- Evita duplicar la venta POS al reimprimir el ticket desde el modal de cobranza.
ALTER TABLE ctrl.recibos ADD COLUMN IF NOT EXISTS id_venta_pos_fk INTEGER;

CREATE INDEX IF NOT EXISTS idx_recibos_venta_pos ON ctrl.recibos(id_venta_pos_fk);
