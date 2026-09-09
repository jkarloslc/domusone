-- Pago agrupado de OPs (CXP): una remesa cubre el 100% del saldo de varias
-- OPs de un mismo proveedor con un solo movimiento bancario, y es reversable
-- como unidad. "Remesa" (no "lote") para no confundir con Lotes de Residencial.
-- Ejecutar en Supabase SQL Editor o: supabase db push

-- 1. Folio REM-YYYY-#### vía secuencia atómica (mismo patrón que OP/OC/REQ)
CREATE SEQUENCE IF NOT EXISTS comp.seq_folio_rem;

CREATE OR REPLACE FUNCTION comp.fn_next_folio(prefijo TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  num  BIGINT;
  anio TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
BEGIN
  CASE prefijo
    WHEN 'OP'   THEN num := nextval('comp.seq_folio_op');
    WHEN 'OC'   THEN num := nextval('comp.seq_folio_oc');
    WHEN 'REQ'  THEN num := nextval('comp.seq_folio_req');
    WHEN 'TRF'  THEN num := nextval('comp.seq_folio_trf');
    WHEN 'RFQ'  THEN num := nextval('comp.seq_folio_rfq');
    WHEN 'REC'  THEN num := nextval('comp.seq_folio_rec');
    WHEN 'VAL'  THEN num := nextval('comp.seq_folio_val');
    WHEN 'PROV' THEN num := nextval('comp.seq_folio_prov');
    WHEN 'REM'  THEN num := nextval('comp.seq_folio_rem');
    WHEN 'ART'  THEN
      num := nextval('comp.seq_folio_art');
      RETURN prefijo || '-' || LPAD(num::TEXT, 4, '0');
    ELSE RAISE EXCEPTION 'Prefijo desconocido: %', prefijo;
  END CASE;
  RETURN prefijo || '-' || anio || '-' || LPAD(num::TEXT, 4, '0');
END;
$$;

GRANT USAGE ON SEQUENCE comp.seq_folio_rem TO authenticated;

-- 2. Cabecera de la remesa de pago
CREATE TABLE IF NOT EXISTS comp.cxp_pagos_remesa (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  folio                  text NOT NULL UNIQUE,
  id_proveedor_fk        integer NOT NULL REFERENCES comp.proveedores (id),
  fecha_pago             date NOT NULL,
  forma_pago             text NOT NULL,
  id_cuenta_bancaria_fk  integer REFERENCES cfg.cuentas_bancarias (id),
  monto_total            numeric NOT NULL,
  referencia             text,
  comprobante            text,
  complemento_pago       text,
  notas                  text,
  status                 text NOT NULL DEFAULT 'Aplicado' CHECK (status IN ('Aplicado', 'Cancelada')),
  cancelado_motivo       text,
  cancelado_by           text,
  cancelado_at           timestamptz,
  created_by             text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cxp_pagos_remesa_proveedor ON comp.cxp_pagos_remesa (id_proveedor_fk);
CREATE INDEX IF NOT EXISTS idx_cxp_pagos_remesa_status    ON comp.cxp_pagos_remesa (status);

COMMENT ON TABLE comp.cxp_pagos_remesa IS
  'Pago agrupado de varias OPs de un mismo proveedor en un solo movimiento bancario (CXP). Reversable como unidad.';

ALTER TABLE comp.cxp_pagos_remesa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cxp_pagos_remesa_select" ON comp.cxp_pagos_remesa FOR SELECT TO authenticated USING (true);
CREATE POLICY "cxp_pagos_remesa_insert" ON comp.cxp_pagos_remesa FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "cxp_pagos_remesa_update" ON comp.cxp_pagos_remesa FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- PostgREST usa el rol `authenticated` con JWT; hace falta GRANT además de RLS
GRANT SELECT, INSERT, UPDATE ON TABLE comp.cxp_pagos_remesa TO authenticated, service_role;

DO $$
DECLARE
  seqname text;
BEGIN
  seqname := pg_get_serial_sequence('comp.cxp_pagos_remesa', 'id');
  IF seqname IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated, service_role', seqname);
  END IF;
END $$;

-- 3. cxp_abonos: liga al abono con su remesa (si aplica) + status para poder
--    anular sin borrar (mismo criterio que "Cancelado" en reembolsos de Caja Chica)
ALTER TABLE comp.cxp_abonos
  ADD COLUMN IF NOT EXISTS id_remesa_fk bigint REFERENCES comp.cxp_pagos_remesa (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Aplicado' CHECK (status IN ('Aplicado', 'Cancelada'));

CREATE INDEX IF NOT EXISTS idx_cxp_abonos_remesa ON comp.cxp_abonos (id_remesa_fk);

-- 4. movimientos_bancarios: liga el cargo (o el abono de reverso) con su remesa
ALTER TABLE comp.movimientos_bancarios
  ADD COLUMN IF NOT EXISTS id_remesa_fk bigint REFERENCES comp.cxp_pagos_remesa (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_movimientos_bancarios_remesa ON comp.movimientos_bancarios (id_remesa_fk);

-- 5. ordenes_compra / requisiciones: guardan el status previo al cierre en
--    cascada por pago, para poder reabrirlas con precisión si el pago se reversa.
ALTER TABLE comp.ordenes_compra
  ADD COLUMN IF NOT EXISTS status_previo_cierre text;

ALTER TABLE comp.requisiciones
  ADD COLUMN IF NOT EXISTS status_previo_cierre text;
