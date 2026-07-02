-- Mapeo Producto POS -> Concepto de Ingreso, para distribuir el ingreso
-- del corte por concepto (cfg.centros_ingreso.tipo_desglose = 'conceptos').
-- Sin esto, el recibo generado desde un corte traía el monto_total correcto
-- pero sin filas en ctrl.recibos_ingreso_conceptos, así que el ingreso
-- quedaba "sin distribuir" en el módulo de Ingresos.

ALTER TABLE golf.cat_productos_pos
  ADD COLUMN IF NOT EXISTS id_concepto_ingreso_fk INTEGER REFERENCES cfg.conceptos_ingreso(id);
