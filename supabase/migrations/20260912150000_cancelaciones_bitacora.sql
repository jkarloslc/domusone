-- Bitácora de cancelaciones de recibos (Golf, Hípico, Locales, Residencial).
-- Un solo registro de auditoría por cancelación, independiente del campo
-- `observaciones` de cada recibo (que se sobreescribe/concatena y no es
-- consultable como listado). Ejecutar en Supabase SQL Editor o: supabase db push

CREATE TABLE IF NOT EXISTS ctrl.cancelaciones (
  id                BIGSERIAL PRIMARY KEY,
  modulo            TEXT NOT NULL CHECK (modulo IN ('golf', 'hipico', 'locales', 'residencial')),
  folio             TEXT,
  id_origen         BIGINT NOT NULL,          -- id del recibo cancelado (en su propia tabla, según módulo)
  id_venta_pos_fk   BIGINT,                   -- ticket en golf.ctrl_ventas, si existía
  monto             NUMERIC(14,2),
  cuotas_afectadas  INTEGER NOT NULL DEFAULT 0,
  motivo            TEXT,
  usuario           TEXT,
  fecha_cancelacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancelaciones_modulo_fecha ON ctrl.cancelaciones (modulo, fecha_cancelacion DESC);

GRANT SELECT, INSERT ON ctrl.cancelaciones TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.cancelaciones_id_seq TO anon, authenticated;
