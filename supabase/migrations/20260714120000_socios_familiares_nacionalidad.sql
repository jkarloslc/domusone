-- Campo Nacionalidad para socios y sus familiares

ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS nacionalidad TEXT;

ALTER TABLE golf.cat_familiares
  ADD COLUMN IF NOT EXISTS nacionalidad TEXT;
