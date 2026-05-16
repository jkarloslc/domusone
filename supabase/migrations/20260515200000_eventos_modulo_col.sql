-- Agregar columna modulo a ctrl.eventos para separar por módulo
ALTER TABLE ctrl.eventos ADD COLUMN IF NOT EXISTS modulo TEXT NOT NULL DEFAULT 'hospitality';

-- Marcar todos los eventos existentes como hospitality
UPDATE ctrl.eventos SET modulo = 'hospitality' WHERE modulo = 'hospitality';

-- Índice para filtrado eficiente
CREATE INDEX IF NOT EXISTS idx_eventos_modulo ON ctrl.eventos(modulo);
