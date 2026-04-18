-- ============================================================
--  GOLF SCHEMA — Fase 3: Reservaciones
--  Ejecutar en Supabase SQL Editor (una sola vez)
-- ============================================================

CREATE TABLE IF NOT EXISTS golf.ctrl_reservaciones (
  id                  SERIAL PRIMARY KEY,
  id_socio_fk         INTEGER REFERENCES golf.cat_socios(id),
  id_espacio_fk       INTEGER REFERENCES golf.cat_espacios_deportivos(id),
  id_forma_juego_fk   INTEGER REFERENCES golf.cat_formas_juego(id),
  fecha_reservacion   DATE NOT NULL,
  hora_reservacion    TIME NOT NULL,
  num_jugadores       INTEGER NOT NULL DEFAULT 1,
  carro_golf          BOOLEAN NOT NULL DEFAULT false,
  monto               NUMERIC(10,2),
  monto_carro_golf    NUMERIC(10,2),
  observaciones       TEXT,
  cancelado           BOOLEAN NOT NULL DEFAULT false,
  fecha_cancelacion   TIMESTAMPTZ,
  registrado_por      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.ctrl_reservaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_ctrl_reservaciones"
  ON golf.ctrl_reservaciones FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.ctrl_reservaciones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_reservaciones_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_ctrl_reservaciones_fecha   ON golf.ctrl_reservaciones(fecha_reservacion);
CREATE INDEX IF NOT EXISTS idx_ctrl_reservaciones_socio   ON golf.ctrl_reservaciones(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_ctrl_reservaciones_espacio ON golf.ctrl_reservaciones(id_espacio_fk);

-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'golf' ORDER BY table_name;
