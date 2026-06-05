-- programas_mantenimiento: el constraint id_seccion_fk apunta a cfg.secciones
-- (tabla residencial) pero id_area_fk debe referenciar cfg.areas.
-- Mismo patrón corregido en ordenes_trabajo y reembolsos_detalle.

ALTER TABLE ctrl.programas_mantenimiento
  DROP CONSTRAINT IF EXISTS programas_mantenimiento_id_seccion_fk_fkey;

ALTER TABLE ctrl.programas_mantenimiento
  DROP CONSTRAINT IF EXISTS programas_mantenimiento_id_area_fk_fkey;

ALTER TABLE ctrl.programas_mantenimiento
  ADD CONSTRAINT programas_mantenimiento_id_area_fk_fkey
  FOREIGN KEY (id_area_fk) REFERENCES cfg.areas(id);
