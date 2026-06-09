-- Separador de módulo para programas_mantenimiento
-- Valores: 'mantenimiento' (general) | 'golf' | 'hipico' | 'hospitality'

ALTER TABLE ctrl.programas_mantenimiento
  ADD COLUMN IF NOT EXISTS modulo TEXT NOT NULL DEFAULT 'mantenimiento';

-- Marcar programas de Golf (cargados por migración masiva)
UPDATE ctrl.programas_mantenimiento
  SET modulo = 'golf'
  WHERE created_by = 'programa_golf_2026';

-- Índice para filtrado rápido
CREATE INDEX IF NOT EXISTS idx_programas_mant_modulo
  ON ctrl.programas_mantenimiento (modulo);
