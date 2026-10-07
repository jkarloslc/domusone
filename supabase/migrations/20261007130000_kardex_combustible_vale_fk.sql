-- Liga la ENTRADA del Kardex con el vale (Garrafa) que la originó al pagarse
-- la OP, para poder evitar duplicados y eliminarla si se reversa el pago.
ALTER TABLE comp.combustible_movimientos
  ADD COLUMN IF NOT EXISTS id_vale_combustible_fk INTEGER;
CREATE INDEX IF NOT EXISTS idx_comb_mov_vale ON comp.combustible_movimientos(id_vale_combustible_fk);
