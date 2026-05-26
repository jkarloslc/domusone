-- Fix caja chica: reembolsos_detalle tenía id_seccion_fk → cfg.secciones
-- pero el módulo Compras usa cfg.areas como catálogo de áreas/secciones.
-- Renombrar columna y corregir FK para que el modal pueda insertar correctamente.

ALTER TABLE comp.reembolsos_detalle
  DROP CONSTRAINT IF EXISTS reembolsos_detalle_id_seccion_fk_fkey;

ALTER TABLE comp.reembolsos_detalle
  RENAME COLUMN id_seccion_fk TO id_area_fk;

ALTER TABLE comp.reembolsos_detalle
  ADD CONSTRAINT reembolsos_detalle_id_area_fk_fkey
  FOREIGN KEY (id_area_fk) REFERENCES cfg.areas(id);
