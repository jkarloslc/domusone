-- Columnas nuevas en ctrl_ventas (golf schema)
ALTER TABLE golf.ctrl_ventas
  ADD COLUMN IF NOT EXISTS pac_cfdi_id TEXT,
  ADD COLUMN IF NOT EXISTS facturada   BOOLEAN NOT NULL DEFAULT FALSE;

-- Tabla para almacenar documentos CFDI completos
CREATE TABLE IF NOT EXISTS golf.ctrl_ventas_cfdi (
  id              BIGSERIAL PRIMARY KEY,
  id_venta_fk     BIGINT NOT NULL REFERENCES golf.ctrl_ventas(id) ON DELETE CASCADE,
  folio_fiscal    TEXT NOT NULL,
  pac_cfdi_id     TEXT,
  xml_cfdi        TEXT,
  pdf_b64         TEXT,
  receptor_rfc    TEXT,
  receptor_nombre TEXT,
  receptor_email  TEXT,
  enviado_email   BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_envio     TIMESTAMPTZ,
  fecha_timbrado  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_timbra  TEXT,
  UNIQUE (id_venta_fk)
);

-- Sync: si ya hay ventas con folio_fiscal, marcarlas como facturadas
UPDATE golf.ctrl_ventas SET facturada = TRUE WHERE folio_fiscal IS NOT NULL AND folio_fiscal != '';
