-- ============================================================
-- Homologación de facturación: cada módulo de cobranza recurrente
-- (Golf, Hípico, Locales, Residencial) gana una columna de enlace a
-- un producto real del catálogo POS (golf.cat_productos_pos), que
-- pasa a ser la fuente de clasificación de la línea del ticket
-- (concepto de ingreso + clave SAT), en vez de resolver el concepto
-- de ingreso directo como hasta ahora.
--
-- Solo agrega columnas — sin riesgo, no crea ni vincula nada todavía
-- (ver migraciones siguientes). El concepto de ingreso directo se
-- conserva en su columna original como respaldo si a una fila le
-- falta el producto.
-- 2026-09-02
-- ============================================================

ALTER TABLE golf.cat_cuotas_config ADD COLUMN IF NOT EXISTS id_producto_pos_fk INTEGER REFERENCES golf.cat_productos_pos(id);
ALTER TABLE golf.cfg_carritos      ADD COLUMN IF NOT EXISTS id_producto_pos_fk INTEGER REFERENCES golf.cat_productos_pos(id);
ALTER TABLE hip.cfg_hip            ADD COLUMN IF NOT EXISTS id_producto_pos_fk INTEGER REFERENCES golf.cat_productos_pos(id);
ALTER TABLE ctrl.loc_propiedades   ADD COLUMN IF NOT EXISTS id_producto_pos_fk INTEGER REFERENCES golf.cat_productos_pos(id);
ALTER TABLE cfg.cuotas_estandar    ADD COLUMN IF NOT EXISTS id_producto_pos_fk INTEGER REFERENCES golf.cat_productos_pos(id);
