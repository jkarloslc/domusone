-- Cartas de intercambio: familiares (beneficiarios) acompañantes en una misma carta
CREATE TABLE IF NOT EXISTS golf.cartas_intercambio_familiares (
  id             SERIAL PRIMARY KEY,
  id_carta_fk    INTEGER NOT NULL REFERENCES golf.cartas_intercambio(id) ON DELETE CASCADE,
  id_familiar_fk INTEGER NOT NULL REFERENCES golf.cat_familiares(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (id_carta_fk, id_familiar_fk)
);
CREATE INDEX IF NOT EXISTS idx_cartas_int_fam_carta ON golf.cartas_intercambio_familiares(id_carta_fk);

ALTER TABLE golf.cartas_intercambio_familiares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_all_cartas_int_fam ON golf.cartas_intercambio_familiares;
CREATE POLICY auth_all_cartas_int_fam ON golf.cartas_intercambio_familiares
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON golf.cartas_intercambio_familiares TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cartas_intercambio_familiares_id_seq TO authenticated;
