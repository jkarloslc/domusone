-- Distingue fotos "Antes" y "Después" en evidencias de Órdenes de Trabajo
ALTER TABLE ctrl.ot_evidencias ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'despues';
ALTER TABLE ctrl.ot_evidencias DROP CONSTRAINT IF EXISTS ot_evidencias_tipo_check;
ALTER TABLE ctrl.ot_evidencias ADD CONSTRAINT ot_evidencias_tipo_check CHECK (tipo IN ('antes', 'despues'));
