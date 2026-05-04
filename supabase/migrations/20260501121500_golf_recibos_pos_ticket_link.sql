-- ============================================================
-- Golf CxC: vincular recibo de cobro con ticket POS
-- Fecha: 2026-05-01
-- ============================================================

ALTER TABLE golf.recibos_golf
  ADD COLUMN IF NOT EXISTS id_venta_pos_fk INTEGER REFERENCES golf.ctrl_ventas(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recibos_golf_venta_pos_uniq
  ON golf.recibos_golf(id_venta_pos_fk)
  WHERE id_venta_pos_fk IS NOT NULL;
