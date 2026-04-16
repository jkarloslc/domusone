-- Hilo de instrucciones / respuestas por orden de pago (admin ↔ tesorería, etc.)
-- Ejecutar en Supabase SQL Editor o: supabase db push

CREATE TABLE IF NOT EXISTS comp.ordenes_pago_instrucciones (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_op_fk      integer NOT NULL REFERENCES comp.ordenes_pago (id) ON DELETE CASCADE,
  autor_nombre  text,
  autor_rol     text,
  cuerpo        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordenes_pago_instrucciones_op_created
  ON comp.ordenes_pago_instrucciones (id_op_fk, created_at);

COMMENT ON TABLE comp.ordenes_pago_instrucciones IS
  'Mensajes de instrucción y respuesta asociados a una orden de pago (CXP).';

ALTER TABLE comp.ordenes_pago_instrucciones ENABLE ROW LEVEL SECURITY;

-- Lectura e inserción para usuarios autenticados (ajusta según tus políticas en otras tablas comp.*)
CREATE POLICY "ordenes_pago_instrucciones_select"
  ON comp.ordenes_pago_instrucciones FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "ordenes_pago_instrucciones_insert"
  ON comp.ordenes_pago_instrucciones FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- PostgREST usa el rol `authenticated` con JWT; hace falta GRANT además de RLS
GRANT SELECT, INSERT ON TABLE comp.ordenes_pago_instrucciones TO authenticated;

DO $$
DECLARE
  seqname text;
BEGIN
  seqname := pg_get_serial_sequence('comp.ordenes_pago_instrucciones', 'id');
  IF seqname IS NOT NULL THEN
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seqname);
  END IF;
END $$;
