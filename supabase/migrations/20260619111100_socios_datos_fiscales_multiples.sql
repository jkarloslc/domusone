-- Permite que un socio tenga múltiples conjuntos de datos fiscales
-- (RFC, razón social, etc.) y elegir a cuál se factura.

CREATE TABLE IF NOT EXISTS golf.cat_socios_datos_fiscales (
  id SERIAL PRIMARY KEY,
  id_socio_fk INTEGER NOT NULL REFERENCES golf.cat_socios(id) ON DELETE CASCADE,
  alias TEXT,
  rfc TEXT NOT NULL,
  razon_social_fiscal TEXT NOT NULL,
  cp_fiscal TEXT,
  regimen_fiscal TEXT DEFAULT '626',
  uso_cfdi TEXT DEFAULT 'G03',
  email_fiscal TEXT,
  es_principal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cat_socios_datos_fiscales_socio ON golf.cat_socios_datos_fiscales(id_socio_fk);

-- Backfill: el dato fiscal que ya existía en cat_socios se vuelve el registro "Principal"
INSERT INTO golf.cat_socios_datos_fiscales (id_socio_fk, alias, rfc, razon_social_fiscal, cp_fiscal, regimen_fiscal, uso_cfdi, email_fiscal, es_principal)
SELECT id, 'Principal', rfc,
       COALESCE(NULLIF(razon_social_fiscal, ''), TRIM(CONCAT(nombre,' ',COALESCE(apellido_paterno,''),' ',COALESCE(apellido_materno,'')))),
       cp_fiscal, COALESCE(regimen_fiscal,'626'), COALESCE(uso_cfdi,'G03'), email_fiscal, true
FROM golf.cat_socios
WHERE rfc IS NOT NULL AND rfc <> '';
