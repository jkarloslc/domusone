-- Agrega campo con_cargador a cat_carritos
ALTER TABLE golf.cat_carritos
  ADD COLUMN IF NOT EXISTS con_cargador BOOLEAN NOT NULL DEFAULT FALSE;
