-- ============================================================
-- Entrada/Salida de Carritos: registro de salidas de motor lobby
-- a ronda de juego y su regreso.
-- ============================================================

CREATE TABLE IF NOT EXISTS golf.ctrl_salidas_carritos (
  id               SERIAL PRIMARY KEY,
  id_carrito_fk    INTEGER NOT NULL REFERENCES golf.cat_carritos(id),
  id_pension_fk    INTEGER REFERENCES golf.ctrl_pensiones(id),
  id_socio_fk      INTEGER REFERENCES golf.cat_socios(id),
  fecha_salida     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_regreso    TIMESTAMPTZ,
  observaciones    TEXT,
  usuario_registra TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salidas_carritos_carrito ON golf.ctrl_salidas_carritos(id_carrito_fk);
CREATE INDEX IF NOT EXISTS idx_salidas_carritos_fecha   ON golf.ctrl_salidas_carritos(fecha_salida);

GRANT SELECT, INSERT, UPDATE, DELETE ON golf.ctrl_salidas_carritos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_salidas_carritos_id_seq TO authenticated;

ALTER TABLE golf.ctrl_salidas_carritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salidas_carritos_select" ON golf.ctrl_salidas_carritos;
CREATE POLICY "salidas_carritos_select"
  ON golf.ctrl_salidas_carritos FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "salidas_carritos_insert" ON golf.ctrl_salidas_carritos;
CREATE POLICY "salidas_carritos_insert"
  ON golf.ctrl_salidas_carritos FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "salidas_carritos_update" ON golf.ctrl_salidas_carritos;
CREATE POLICY "salidas_carritos_update"
  ON golf.ctrl_salidas_carritos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "salidas_carritos_delete" ON golf.ctrl_salidas_carritos;
CREATE POLICY "salidas_carritos_delete"
  ON golf.ctrl_salidas_carritos FOR DELETE
  TO authenticated
  USING (true);
