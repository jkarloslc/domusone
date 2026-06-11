-- Agrega campo Empresa a cfg.secciones (catálogo Secciones)
ALTER TABLE cfg.secciones
  ADD COLUMN IF NOT EXISTS empresa TEXT;
