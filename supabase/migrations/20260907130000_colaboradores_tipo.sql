-- Distingue colaboradores internos (nómina) de externos (terceros/servicio)
-- Usado en el modal de Colaboradores (HR / Catálogos).

ALTER TABLE cfg.colaboradores ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'Interno';

ALTER TABLE cfg.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_tipo_check;
ALTER TABLE cfg.colaboradores ADD CONSTRAINT colaboradores_tipo_check CHECK (tipo IN ('Interno', 'Externo'));
