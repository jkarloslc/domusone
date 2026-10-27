-- ── Pre-órdenes de pago ──
-- Cotización / compromiso futuro que NO es una OP: no entra a CXP, Flujo,
-- Comparativo ni reportes de OP. Al autorizarse como "Vigente" puede
-- convertirse en una OP real (status 'Pendiente Auth') y desde ahí sigue el
-- flujo normal de doble autorización. Tabla separada a propósito: varios
-- consumidores de comp.ordenes_pago filtran por lista negra de status.

CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_pre START 1;
GRANT USAGE, SELECT ON SEQUENCE comp.seq_folio_pre TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS comp.pre_ordenes_pago (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  folio                text NOT NULL UNIQUE DEFAULT (
                         'PRE-' || to_char(now(), 'YYYY') || '-' ||
                         lpad(nextval('comp.seq_folio_pre')::text, 4, '0')),
  id_proveedor_fk      integer REFERENCES comp.proveedores (id),
  proveedor_prospecto  text,   -- texto libre si el proveedor aún no está dado de alta
  concepto             text NOT NULL,
  monto                numeric NOT NULL DEFAULT 0,
  subtotal             numeric,
  iva                  numeric,
  fecha_estimada_pago  date NOT NULL,
  vigencia_cotizacion  date,
  esquema_comprobante  text NOT NULL DEFAULT 'Factura previa al pago'
                         CHECK (esquema_comprobante IN ('Factura previa al pago', 'Factura posterior al pago')),
  id_centro_costo_fk   integer REFERENCES cfg.centros_costo (id),
  id_area_fk           integer REFERENCES cfg.areas (id),
  id_frente_fk         integer REFERENCES cfg.frentes (id),
  id_tipo_gasto_fk     integer REFERENCES cfg.tipos_gasto (id),
  urgencia             text DEFAULT 'Media'
                         CHECK (urgencia IS NULL OR urgencia IN ('Crítica', 'Alta', 'Media', 'Baja')),
  adjunto_cotizacion   text,
  notas                text,
  status               text NOT NULL DEFAULT 'Borrador'
                         CHECK (status IN ('Borrador', 'Vigente', 'Convertida', 'Descartada')),
  motivo_descarte      text,
  id_op_fk             bigint REFERENCES comp.ordenes_pago (id) ON DELETE SET NULL,
  created_by           text,
  created_by_id        uuid,
  autorizado_por       text,
  fecha_autorizacion   timestamptz,
  convertido_por       text,
  fecha_conversion     timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pre_op_status ON comp.pre_ordenes_pago (status);
CREATE INDEX IF NOT EXISTS idx_pre_op_fecha  ON comp.pre_ordenes_pago (fecha_estimada_pago);
CREATE INDEX IF NOT EXISTS idx_pre_op_op     ON comp.pre_ordenes_pago (id_op_fk);

COMMENT ON TABLE comp.pre_ordenes_pago IS
  'Pre-orden de pago: compromiso futuro cotizado. No impacta CXP, Flujo ni Presupuesto hasta convertirse en OP.';

-- Trazabilidad inversa: de qué pre-orden nació la OP
ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS id_pre_orden_fk bigint REFERENCES comp.pre_ordenes_pago (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS esquema_comprobante text;

ALTER TABLE comp.pre_ordenes_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pre_op_select" ON comp.pre_ordenes_pago FOR SELECT TO authenticated USING (true);
CREATE POLICY "pre_op_insert" ON comp.pre_ordenes_pago FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pre_op_update" ON comp.pre_ordenes_pago FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pre_op_delete" ON comp.pre_ordenes_pago FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE comp.pre_ordenes_pago TO authenticated, service_role;
DO $$
DECLARE seqname text;
BEGIN
  seqname := pg_get_serial_sequence('comp.pre_ordenes_pago', 'id');
  IF seqname IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', seqname);
  END IF;
END $$;
