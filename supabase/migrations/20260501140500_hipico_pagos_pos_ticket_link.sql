-- ============================================================
-- Hípico Cobranza: vincular recibos de pago con ticket POS
-- Fecha: 2026-05-01
-- ============================================================

ALTER TABLE hip.ctrl_pagos
  ADD COLUMN IF NOT EXISTS id_venta_pos_fk INTEGER REFERENCES golf.ctrl_ventas(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hip_ctrl_pagos_venta_pos_uniq
  ON hip.ctrl_pagos(id_venta_pos_fk)
  WHERE id_venta_pos_fk IS NOT NULL;
