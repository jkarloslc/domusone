-- Agrega fecha_inicio y fecha_fin al programa de mantenimiento
ALTER TABLE ctrl.programas_mantenimiento
  ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin     DATE;
