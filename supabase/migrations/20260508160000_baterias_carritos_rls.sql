-- RLS para golf.baterias_carritos
-- La tabla se creó sin políticas; el anon key recibe 403.

ALTER TABLE golf.baterias_carritos ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado
CREATE POLICY "baterias_carritos_select"
  ON golf.baterias_carritos FOR SELECT
  TO authenticated
  USING (true);

-- Escritura: cualquier usuario autenticado
CREATE POLICY "baterias_carritos_insert"
  ON golf.baterias_carritos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "baterias_carritos_update"
  ON golf.baterias_carritos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "baterias_carritos_delete"
  ON golf.baterias_carritos FOR DELETE
  TO authenticated
  USING (true);
