-- Módulo Tee de Práctica: registro de entradas con asignación de bolas
-- El tee está concesionado a un tercero; solo se registra la entrada/ticket.

CREATE TABLE IF NOT EXISTS golf.ctrl_tee_practica (
  id          SERIAL PRIMARY KEY,
  id_socio_fk INTEGER NOT NULL REFERENCES golf.cat_socios(id),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  num_bolas   INTEGER NOT NULL DEFAULT 50,
  usuario     TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ctrl_tee_practica_socio_idx ON golf.ctrl_tee_practica (id_socio_fk);
CREATE INDEX IF NOT EXISTS ctrl_tee_practica_fecha_idx ON golf.ctrl_tee_practica (fecha DESC);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON golf.ctrl_tee_practica TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_tee_practica_id_seq TO authenticated;

-- RLS
ALTER TABLE golf.ctrl_tee_practica ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tee_practica_select" ON golf.ctrl_tee_practica;
CREATE POLICY "tee_practica_select"
  ON golf.ctrl_tee_practica FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tee_practica_insert" ON golf.ctrl_tee_practica;
CREATE POLICY "tee_practica_insert"
  ON golf.ctrl_tee_practica FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "tee_practica_update" ON golf.ctrl_tee_practica;
CREATE POLICY "tee_practica_update"
  ON golf.ctrl_tee_practica FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "tee_practica_delete" ON golf.ctrl_tee_practica;
CREATE POLICY "tee_practica_delete"
  ON golf.ctrl_tee_practica FOR DELETE
  TO authenticated
  USING (true);
