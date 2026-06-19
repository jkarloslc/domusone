-- golf.cat_socios_datos_fiscales se creó (20260619111100) sin GRANTs ni políticas RLS.
-- El cliente de la app usa el anon key + rol authenticated, así que sin esto
-- toda consulta a la tabla falla con 403 / "row violates row level security policy".

ALTER TABLE golf.cat_socios_datos_fiscales ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON golf.cat_socios_datos_fiscales TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_socios_datos_fiscales_id_seq TO authenticated;

DROP POLICY IF EXISTS "cat_socios_datos_fiscales_select" ON golf.cat_socios_datos_fiscales;
CREATE POLICY "cat_socios_datos_fiscales_select"
  ON golf.cat_socios_datos_fiscales FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cat_socios_datos_fiscales_insert" ON golf.cat_socios_datos_fiscales;
CREATE POLICY "cat_socios_datos_fiscales_insert"
  ON golf.cat_socios_datos_fiscales FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "cat_socios_datos_fiscales_update" ON golf.cat_socios_datos_fiscales;
CREATE POLICY "cat_socios_datos_fiscales_update"
  ON golf.cat_socios_datos_fiscales FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "cat_socios_datos_fiscales_delete" ON golf.cat_socios_datos_fiscales;
CREATE POLICY "cat_socios_datos_fiscales_delete"
  ON golf.cat_socios_datos_fiscales FOR DELETE
  TO authenticated
  USING (true);
