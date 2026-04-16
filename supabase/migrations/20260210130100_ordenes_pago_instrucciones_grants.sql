-- Si ya aplicaste la migración anterior sin GRANTs, ejecuta solo este archivo
-- (o deja que esta migración corra en entornos nuevos sin duplicar políticas)

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
