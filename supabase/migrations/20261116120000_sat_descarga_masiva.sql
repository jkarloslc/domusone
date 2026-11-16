-- ════════════════════════════════════════════════════════════════════
-- Descarga Masiva de CFDI del SAT — fase 1 (XML recibidos/emitidos)
--
-- ctrl.sat_efirma       e.firma (FIEL) de la razón social. La llave privada
--                       y la contraseña van cifradas (AES-256-GCM) con la
--                       variable de entorno SAT_EFIRMA_SECRET. Solo la lee el
--                       servidor (service_role): sin GRANT a anon/authenticated.
-- ctrl.sat_solicitudes  Solicitudes presentadas al SAT y su avance.
-- ctrl.cfdi_sat         Un renglón por CFDI descargado (datos del XML).
-- ctrl.cfdi_sat_xml     XML íntegro, aparte para que el listado sea ligero.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ctrl.sat_efirma (
  id               bigserial PRIMARY KEY,
  rfc              text        NOT NULL,
  razon_social     text,
  no_certificado   text        NOT NULL,
  vigencia_inicio  timestamptz,
  vigencia_fin     timestamptz,
  cer_b64          text        NOT NULL,   -- certificado público (DER en base64)
  key_enc          text        NOT NULL,   -- llave privada cifrada
  pass_enc         text        NOT NULL,   -- contraseña cifrada
  activo           boolean     NOT NULL DEFAULT true,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sat_efirma_rfc_activa
  ON ctrl.sat_efirma (rfc) WHERE activo;

ALTER TABLE ctrl.sat_efirma ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ctrl.sat_efirma FROM anon, authenticated;
GRANT ALL ON ctrl.sat_efirma TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.sat_efirma_id_seq TO service_role;


CREATE TABLE IF NOT EXISTS ctrl.sat_solicitudes (
  id                    bigserial PRIMARY KEY,
  rfc                   text        NOT NULL,
  tipo                  text        NOT NULL CHECK (tipo IN ('recibidos', 'emitidos')),
  fecha_desde           date        NOT NULL,
  fecha_hasta           date        NOT NULL,
  id_solicitud_sat      text,
  -- Solicitada → En proceso → Lista → Descargada | Sin datos | Rechazada | Vencida | Error
  status                text        NOT NULL DEFAULT 'Solicitada',
  mensaje_sat           text,
  num_cfdis             integer,
  paquetes              text[]      NOT NULL DEFAULT '{}',
  paquetes_descargados  text[]      NOT NULL DEFAULT '{}',
  cfdis_guardados       integer     NOT NULL DEFAULT 0,
  ultima_verificacion   timestamptz,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sat_solicitudes_created ON ctrl.sat_solicitudes (created_at DESC);


CREATE TABLE IF NOT EXISTS ctrl.cfdi_sat (
  id                  bigserial PRIMARY KEY,
  uuid                text        NOT NULL UNIQUE,
  tipo_descarga       text        NOT NULL CHECK (tipo_descarga IN ('recibido', 'emitido')),
  version             text,
  serie               text,
  folio               text,
  fecha_emision       timestamp,
  fecha_timbrado      timestamp,
  tipo_comprobante    text,          -- I, E, T, N, P
  rfc_emisor          text        NOT NULL,
  nombre_emisor       text,
  regimen_emisor      text,
  rfc_receptor        text        NOT NULL,
  nombre_receptor     text,
  uso_cfdi            text,
  metodo_pago         text,
  forma_pago          text,
  moneda              text,
  tipo_cambio         numeric(14,6),
  subtotal            numeric(14,2),
  descuento           numeric(14,2),
  iva_trasladado      numeric(14,2),
  iva_retenido        numeric(14,2),
  isr_retenido        numeric(14,2),
  ieps                numeric(14,2),
  total               numeric(14,2),
  id_solicitud_fk     bigint REFERENCES ctrl.sat_solicitudes(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cfdi_sat_fecha       ON ctrl.cfdi_sat (fecha_emision DESC);
CREATE INDEX IF NOT EXISTS cfdi_sat_rfc_emisor  ON ctrl.cfdi_sat (rfc_emisor);
CREATE INDEX IF NOT EXISTS cfdi_sat_rfc_recep   ON ctrl.cfdi_sat (rfc_receptor);


CREATE TABLE IF NOT EXISTS ctrl.cfdi_sat_xml (
  uuid  text PRIMARY KEY REFERENCES ctrl.cfdi_sat(uuid) ON DELETE CASCADE,
  xml   text NOT NULL
);

-- Lectura desde la app (sesión iniciada). La escritura la hace el servidor
-- con service_role al descargar los paquetes del SAT.
GRANT SELECT ON ctrl.sat_solicitudes, ctrl.cfdi_sat, ctrl.cfdi_sat_xml TO authenticated;
GRANT ALL    ON ctrl.sat_solicitudes, ctrl.cfdi_sat, ctrl.cfdi_sat_xml TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.sat_solicitudes_id_seq, ctrl.cfdi_sat_id_seq TO service_role;

ALTER TABLE ctrl.sat_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.cfdi_sat        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.cfdi_sat_xml    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sat_solicitudes_sel ON ctrl.sat_solicitudes;
CREATE POLICY sat_solicitudes_sel ON ctrl.sat_solicitudes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cfdi_sat_sel ON ctrl.cfdi_sat;
CREATE POLICY cfdi_sat_sel ON ctrl.cfdi_sat FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cfdi_sat_xml_sel ON ctrl.cfdi_sat_xml;
CREATE POLICY cfdi_sat_xml_sel ON ctrl.cfdi_sat_xml FOR SELECT TO authenticated USING (true);
