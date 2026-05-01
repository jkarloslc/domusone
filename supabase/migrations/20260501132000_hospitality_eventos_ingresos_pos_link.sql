-- ============================================================
-- Hospitality Eventos: vincular ingresos con venta POS (Golf)
-- Fecha: 2026-05-01
-- ============================================================

ALTER TABLE ctrl.eventos_ingresos
  ADD COLUMN IF NOT EXISTS id_venta_pos_fk INTEGER REFERENCES golf.ctrl_ventas(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eventos_ingresos_venta_pos_uniq
  ON ctrl.eventos_ingresos(id_venta_pos_fk)
  WHERE id_venta_pos_fk IS NOT NULL;
