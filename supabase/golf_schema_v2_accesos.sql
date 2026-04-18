-- ============================================================
--  GOLF SCHEMA — Fase 2: Salidas al Campo
--  Ejecutar en Supabase SQL Editor (una sola vez)
-- ============================================================

-- ============================================================
--  CATÁLOGO: Espacios Deportivos
--  Ej: Campo 18 Hoyos, Campo 9 Hoyos, Rango de Práctica, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS golf.cat_espacios_deportivos (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  descripcion TEXT,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_espacios_deportivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_cat_espacios_deportivos"
  ON golf.cat_espacios_deportivos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.cat_espacios_deportivos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_espacios_deportivos_id_seq TO authenticated;

INSERT INTO golf.cat_espacios_deportivos (nombre) VALUES
  ('Campo 18 Hoyos'),
  ('Campo 9 Hoyos'),
  ('Rango de Práctica'),
  ('Putting Green'),
  ('Chipping Area')
ON CONFLICT DO NOTHING;

-- ============================================================
--  CATÁLOGO: Formas de Juego
--  Ej: 18 Hoyos, 9 Hoyos, Práctica, Torneo, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS golf.cat_formas_juego (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_formas_juego ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_cat_formas_juego"
  ON golf.cat_formas_juego FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.cat_formas_juego TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_formas_juego_id_seq TO authenticated;

INSERT INTO golf.cat_formas_juego (nombre) VALUES
  ('18 Hoyos'),
  ('9 Hoyos'),
  ('Práctica'),
  ('Torneo'),
  ('Clase / Clínica')
ON CONFLICT DO NOTHING;

-- ============================================================
--  TRANSACCIONAL: Accesos (Salidas al Campo)
-- ============================================================
CREATE TABLE IF NOT EXISTS golf.ctrl_accesos (
  id                   SERIAL PRIMARY KEY,
  id_socio_fk          INTEGER REFERENCES golf.cat_socios(id),
  id_espacio_fk        INTEGER REFERENCES golf.cat_espacios_deportivos(id),
  id_forma_juego_fk    INTEGER REFERENCES golf.cat_formas_juego(id),
  id_familiar_fk       INTEGER REFERENCES golf.cat_familiares(id),
  fecha_entrada        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_salida         TIMESTAMPTZ,
  hoyo_inicio          INTEGER,          -- hoyo de salida (1-18)
  observaciones        TEXT,
  registrado_por       TEXT,             -- usuario que registró
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.ctrl_accesos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_ctrl_accesos"
  ON golf.ctrl_accesos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.ctrl_accesos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_accesos_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_ctrl_accesos_socio   ON golf.ctrl_accesos(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_ctrl_accesos_fecha   ON golf.ctrl_accesos(fecha_entrada);
CREATE INDEX IF NOT EXISTS idx_ctrl_accesos_espacio ON golf.ctrl_accesos(id_espacio_fk);

-- ============================================================
--  TRANSACCIONAL: Acompañantes por acceso
-- ============================================================
CREATE TABLE IF NOT EXISTS golf.ctrl_acceso_acomp (
  id              SERIAL PRIMARY KEY,
  id_acceso_fk    INTEGER NOT NULL REFERENCES golf.ctrl_accesos(id) ON DELETE CASCADE,
  orden           INTEGER NOT NULL DEFAULT 1,  -- 1-5
  nombre          TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.ctrl_acceso_acomp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_ctrl_acceso_acomp"
  ON golf.ctrl_acceso_acomp FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.ctrl_acceso_acomp TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_acceso_acomp_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_ctrl_acceso_acomp_acceso ON golf.ctrl_acceso_acomp(id_acceso_fk);

-- ============================================================
--  VERIFICACIÓN
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'golf' ORDER BY table_name;
