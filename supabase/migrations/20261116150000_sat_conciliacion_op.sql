-- ════════════════════════════════════════════════════════════════════
-- CFDI del SAT — fase 2: conciliación CFDI recibidos ↔ Órdenes de Pago
-- y estatus (vigente / cancelado) desde solicitudes de Metadata.
-- ════════════════════════════════════════════════════════════════════

-- UUID de la factura de la OP (se llena leyendo el XML que se subió a la OP)
ALTER TABLE comp.ordenes_pago ADD COLUMN IF NOT EXISTS uuid_factura text;
CREATE INDEX IF NOT EXISTS ordenes_pago_uuid_factura ON comp.ordenes_pago (upper(uuid_factura));

-- Tipos de gasto que no llevan CFDI de proveedor (no cuentan como "OP sin CFDI")
ALTER TABLE cfg.tipos_gasto ADD COLUMN IF NOT EXISTS requiere_cfdi boolean NOT NULL DEFAULT true;
UPDATE cfg.tipos_gasto SET requiere_cfdi = false
 WHERE id IN (5, 7, 10, 11, 14, 15, 16, 23, 24, 28, 38, 40);
 -- Comisiones bancarias, Depósitos en garantía, Finiquitos, Fonacot, ISN, IVA, IMSS,
 -- Nómina, Nómina quincenal, PTU, Impuestos municipales, ISR

-- Estatus del CFDI ante el SAT (Metadata trae vigentes y cancelados)
ALTER TABLE ctrl.cfdi_sat ADD COLUMN IF NOT EXISTS estatus_sat       text NOT NULL DEFAULT 'Vigente';
ALTER TABLE ctrl.cfdi_sat ADD COLUMN IF NOT EXISTS fecha_cancelacion timestamp;
ALTER TABLE ctrl.cfdi_sat ADD COLUMN IF NOT EXISTS tiene_xml         boolean NOT NULL DEFAULT true;

ALTER TABLE ctrl.sat_solicitudes ADD COLUMN IF NOT EXISTS tipo_solicitud text NOT NULL DEFAULT 'xml';
ALTER TABLE ctrl.sat_solicitudes DROP CONSTRAINT IF EXISTS sat_solicitudes_tipo_solicitud_check;
ALTER TABLE ctrl.sat_solicitudes ADD CONSTRAINT sat_solicitudes_tipo_solicitud_check
  CHECK (tipo_solicitud IN ('xml', 'metadata'));

-- Vínculo CFDI ↔ OP (N:M: una OP puede pagar varias facturas y una factura
-- puede pagarse en varias OP). uuid es vínculo suave a ctrl.cfdi_sat.uuid.
CREATE TABLE IF NOT EXISTS ctrl.cfdi_sat_op (
  id          bigserial PRIMARY KEY,
  uuid        text    NOT NULL,
  id_op_fk    integer NOT NULL REFERENCES comp.ordenes_pago(id) ON DELETE CASCADE,
  metodo      text    NOT NULL CHECK (metodo IN ('uuid', 'folio', 'monto', 'manual')),
  estado      text    NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('confirmado', 'sugerido', 'descartado')),
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (uuid, id_op_fk)
);
CREATE INDEX IF NOT EXISTS cfdi_sat_op_op ON ctrl.cfdi_sat_op (id_op_fk);

GRANT SELECT ON ctrl.cfdi_sat_op TO authenticated;
GRANT ALL    ON ctrl.cfdi_sat_op TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.cfdi_sat_op_id_seq TO service_role;
ALTER TABLE ctrl.cfdi_sat_op ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cfdi_sat_op_sel ON ctrl.cfdi_sat_op;
CREATE POLICY cfdi_sat_op_sel ON ctrl.cfdi_sat_op FOR SELECT TO authenticated USING (true);
