-- Columnas faltantes en golf.cat_socios referenciadas en SocioModal
-- (derecho_intercambios y rfc ya fueron agregadas en migraciones anteriores)

ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS curp               TEXT,
  ADD COLUMN IF NOT EXISTS numero_tarjeta     TEXT,
  ADD COLUMN IF NOT EXISTS razon_social_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS cp_fiscal          TEXT,
  ADD COLUMN IF NOT EXISTS regimen_fiscal     TEXT,
  ADD COLUMN IF NOT EXISTS uso_cfdi           TEXT,
  ADD COLUMN IF NOT EXISTS email_fiscal       TEXT;
