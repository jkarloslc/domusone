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

ALTER TABLE golf.ctrl_tee_practica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "golf_tee_practica_all" ON golf.ctrl_tee_practica
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON golf.ctrl_tee_practica TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_tee_practica_id_seq TO authenticated;
