-- Fix caja chica: el constraint id_seccion_fk en reembolsos_detalle
-- apuntaba a cfg.secciones (tabla residencial) pero la columna id_area_fk
-- debe referenciar cfg.areas (catálogo Compras).
-- La columna ya se llama id_area_fk; solo se corrige el FK.

ALTER TABLE comp.reembolsos_detalle
  DROP CONSTRAINT IF EXISTS reembolsos_detalle_id_seccion_fk_fkey;

ALTER TABLE comp.reembolsos_detalle
  DROP CONSTRAINT IF EXISTS reembolsos_detalle_id_area_fk_fkey;

ALTER TABLE comp.reembolsos_detalle
  ADD CONSTRAINT reembolsos_detalle_id_area_fk_fkey
  FOREIGN KEY (id_area_fk) REFERENCES cfg.areas(id);
