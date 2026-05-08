-- ═══════════════════════════════════════════════════════════════
-- Golf: Cartas de Intercambio
-- 1. Campo derecho_intercambios en cat_socios
-- 2. Catálogo de clubes con intercambio
-- 3. Registro de cartas emitidas
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Campo derecho_intercambios en socios ─────────────────────
ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS derecho_intercambios BOOLEAN DEFAULT false;

-- ── 2. Catálogo de clubes con intercambio ───────────────────────
CREATE TABLE IF NOT EXISTS golf.cat_clubes_intercambio (
  id              SERIAL PRIMARY KEY,
  nombre          TEXT    NOT NULL,
  ciudad          TEXT,
  estado          TEXT,
  pais            TEXT    DEFAULT 'México',
  representante   TEXT,
  cargo_rep       TEXT,
  telefono_rep    TEXT,
  email_rep       TEXT,
  notas           TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Cartas de intercambio emitidas ───────────────────────────
CREATE TABLE IF NOT EXISTS golf.cartas_intercambio (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT UNIQUE,
  id_socio_fk         INTEGER NOT NULL REFERENCES golf.cat_socios(id) ON DELETE RESTRICT,
  id_club_fk          INTEGER NOT NULL REFERENCES golf.cat_clubes_intercambio(id) ON DELETE RESTRICT,
  fecha_elaboracion   DATE    NOT NULL DEFAULT CURRENT_DATE,
  fecha_visita        DATE,
  texto_carta         TEXT,
  elaborado_por       TEXT,
  notas               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cartas_intercambio_socio ON golf.cartas_intercambio(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_cartas_intercambio_club  ON golf.cartas_intercambio(id_club_fk);
CREATE INDEX IF NOT EXISTS idx_cartas_intercambio_fecha ON golf.cartas_intercambio(fecha_elaboracion);

-- ── RLS ─────────────────────────────────────────────────────────
ALTER TABLE golf.cat_clubes_intercambio ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf.cartas_intercambio     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_cat_clubes_intercambio ON golf.cat_clubes_intercambio;
CREATE POLICY auth_all_cat_clubes_intercambio
  ON golf.cat_clubes_intercambio FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_all_cartas_intercambio ON golf.cartas_intercambio;
CREATE POLICY auth_all_cartas_intercambio
  ON golf.cartas_intercambio FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── Grants ──────────────────────────────────────────────────────
GRANT ALL ON golf.cat_clubes_intercambio TO authenticated;
GRANT ALL ON golf.cat_clubes_intercambio TO anon;
GRANT ALL ON golf.cartas_intercambio     TO authenticated;
GRANT ALL ON golf.cartas_intercambio     TO anon;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_clubes_intercambio_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_clubes_intercambio_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE golf.cartas_intercambio_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cartas_intercambio_id_seq TO anon;
