-- ============================================================
--  GOLF — Pases: registrar usuario que carga/consume pases
-- ============================================================

ALTER TABLE golf.ctrl_pases
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE golf.ctrl_pases_movimientos
  ADD COLUMN IF NOT EXISTS created_by TEXT;
