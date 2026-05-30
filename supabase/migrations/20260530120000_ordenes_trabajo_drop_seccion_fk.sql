-- ordenes_trabajo debe trabajar con cfg.areas, no con cfg.secciones.
-- 1. Eliminar el FK incorrecto (constraint nombrado *_id_seccion_fk_fkey)
-- 2. Asegurar FK correcto en id_area_fk → cfg.areas

ALTER TABLE ctrl.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_id_seccion_fk_fkey;

ALTER TABLE ctrl.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_id_area_fk_fkey;

ALTER TABLE ctrl.ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_id_area_fk_fkey
  FOREIGN KEY (id_area_fk) REFERENCES cfg.areas(id);
