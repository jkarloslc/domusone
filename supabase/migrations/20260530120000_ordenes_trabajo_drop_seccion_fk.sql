-- Fix OT Cuadrilla / OT Balvanera: el constraint id_seccion_fk en ordenes_trabajo
-- apuntaba a cfg.secciones (tabla residencial) pero los módulos de Mantenimiento
-- (OrdenesTrabajoTab) no usan secciones residenciales y no envían ese campo.
-- Si la columna tiene un DEFAULT no válido, el INSERT falla con FK violation.
-- El módulo Servicios sigue funcionando porque envía id_seccion_fk explícitamente.

ALTER TABLE ctrl.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_id_seccion_fk_fkey;

-- Asegurar que la columna sea nullable sin DEFAULT implícito
ALTER TABLE ctrl.ordenes_trabajo
  ALTER COLUMN id_seccion_fk DROP DEFAULT,
  ALTER COLUMN id_seccion_fk DROP NOT NULL;
