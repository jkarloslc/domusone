-- ordenes_trabajo debe trabajar con cfg.areas, no con cfg.secciones (residencial).
-- 1. Eliminar el FK incorrecto que apuntaba a cfg.secciones
-- 2. Limpiar id_seccion_fk (nullable, sin default)
-- 3. Asegurar FK correcto en id_area_fk → cfg.areas

ALTER TABLE ctrl.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_id_seccion_fk_fkey;

ALTER TABLE ctrl.ordenes_trabajo
  ALTER COLUMN id_seccion_fk DROP DEFAULT,
  ALTER COLUMN id_seccion_fk DROP NOT NULL;

ALTER TABLE ctrl.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_id_area_fk_fkey;

ALTER TABLE ctrl.ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_id_area_fk_fkey
  FOREIGN KEY (id_area_fk) REFERENCES cfg.areas(id);
