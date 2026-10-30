-- Informe por servicio (CFE): campos de catálogo y detalle de recibo por periodo.
-- Todos opcionales: la captura actual (consumo + monto) sigue funcionando igual.

ALTER TABLE ctrl.servicios_catalogo
  ADD COLUMN IF NOT EXISTS id_area_fk   BIGINT REFERENCES cfg.areas(id),
  ADD COLUMN IF NOT EXISTS tarifa       TEXT,
  ADD COLUMN IF NOT EXISTS medidor      TEXT,
  ADD COLUMN IF NOT EXISTS carga_kw     NUMERIC,
  ADD COLUMN IF NOT EXISTS responsable  TEXT;

CREATE INDEX IF NOT EXISTS idx_svc_cat_area ON ctrl.servicios_catalogo (id_area_fk);

ALTER TABLE ctrl.servicios_registros
  ADD COLUMN IF NOT EXISTS demanda_max_kw   NUMERIC,
  ADD COLUMN IF NOT EXISTS factor_potencia  NUMERIC,
  ADD COLUMN IF NOT EXISTS cargo_fp         NUMERIC,
  ADD COLUMN IF NOT EXISTS bonif_fp         NUMERIC,
  ADD COLUMN IF NOT EXISTS subtotal         NUMERIC,
  ADD COLUMN IF NOT EXISTS iva              NUMERIC,
  ADD COLUMN IF NOT EXISTS dap              NUMERIC,
  ADD COLUMN IF NOT EXISTS tipo_lectura     TEXT;

ALTER TABLE ctrl.servicios_registros DROP CONSTRAINT IF EXISTS servicios_registros_tipo_lectura_check;
ALTER TABLE ctrl.servicios_registros ADD CONSTRAINT servicios_registros_tipo_lectura_check
  CHECK (tipo_lectura IS NULL OR tipo_lectura IN ('Medida', 'Estimada'));
