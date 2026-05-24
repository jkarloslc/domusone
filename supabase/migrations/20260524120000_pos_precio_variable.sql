-- Agrega campo precio_variable al catálogo de productos POS.
-- Cuando es TRUE, el cajero puede modificar el precio al registrar la venta.
-- Cuando es FALSE (default), el precio es fijo y no se puede cambiar en caja.

ALTER TABLE golf.cat_productos_pos
  ADD COLUMN IF NOT EXISTS precio_variable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN golf.cat_productos_pos.precio_variable
  IS 'Si true, permite al cajero modificar el precio al registrar la venta.';
