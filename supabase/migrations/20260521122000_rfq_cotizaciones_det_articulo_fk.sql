-- Agrega id_articulo_fk faltante en rfq_cotizaciones_det
-- Esta columna fue añadida al código en abril pero nunca a la tabla,
-- causando que todos los INSERTs fallaran silenciosamente.
ALTER TABLE comp.rfq_cotizaciones_det
  ADD COLUMN IF NOT EXISTS id_articulo_fk integer REFERENCES comp.articulos(id);
