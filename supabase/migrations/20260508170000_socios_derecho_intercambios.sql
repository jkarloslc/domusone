-- Agrega columna derecho_intercambios a golf.cat_socios
ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS derecho_intercambios BOOLEAN NOT NULL DEFAULT FALSE;
