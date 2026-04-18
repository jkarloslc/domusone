-- ============================================================
--  GOLF — Fase 4: Pases de invitación
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. Ampliar ctrl_accesos ─────────────────────────────────
-- Identificar entradas de público general (green fee desde POS)
ALTER TABLE golf.ctrl_accesos
  ADD COLUMN IF NOT EXISTS es_externo    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nombre_externo TEXT,
  ADD COLUMN IF NOT EXISTS origen        TEXT NOT NULL DEFAULT 'MANUAL';
  -- origen: 'MANUAL' | 'POS'

-- ── 2. Ampliar ctrl_acceso_acomp ────────────────────────────
-- Marcar si el acompañante es externo (invitado con/sin pase) y origen del pago
ALTER TABLE golf.ctrl_acceso_acomp
  ADD COLUMN IF NOT EXISTS es_externo    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origen_pago   TEXT;
  -- origen_pago: 'PASE' | 'GREEN_FEE' | NULL (para familiares/conocidos)

-- ── 3. Catálogo de tipos de pase ────────────────────────────
CREATE TABLE IF NOT EXISTS golf.cat_pases_config (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_pases_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_cat_pases_config"
  ON golf.cat_pases_config FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.cat_pases_config TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_pases_config_id_seq TO authenticated;

-- Valores iniciales
INSERT INTO golf.cat_pases_config (nombre, descripcion) VALUES
  ('Pase Estándar',  'Invitación estándar para un acompañante externo'),
  ('Pase Premium',   'Invitación con acceso a servicios adicionales')
ON CONFLICT DO NOTHING;

-- ── 4. Lotes de pases asignados por socio ───────────────────
CREATE TABLE IF NOT EXISTS golf.ctrl_pases (
  id                 SERIAL PRIMARY KEY,
  id_socio_fk        INTEGER NOT NULL REFERENCES golf.cat_socios(id) ON DELETE CASCADE,
  id_config_fk       INTEGER REFERENCES golf.cat_pases_config(id),
  cantidad_otorgada  INTEGER NOT NULL DEFAULT 0,
  cantidad_usada     INTEGER NOT NULL DEFAULT 0,
  periodo            TEXT,                   -- ej. "Mayo 2026", "Q2 2026"
  fecha_inicio       DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento  DATE NOT NULL,
  observaciones      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columna calculada: pases disponibles
ALTER TABLE golf.ctrl_pases
  ADD COLUMN IF NOT EXISTS cantidad_disponible INTEGER
  GENERATED ALWAYS AS (cantidad_otorgada - cantidad_usada) STORED;

ALTER TABLE golf.ctrl_pases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_ctrl_pases"
  ON golf.ctrl_pases FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.ctrl_pases TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_pases_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_ctrl_pases_socio      ON golf.ctrl_pases(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_ctrl_pases_vencimiento ON golf.ctrl_pases(fecha_vencimiento);

-- ── 5. Kardex de movimientos de pases ───────────────────────
CREATE TABLE IF NOT EXISTS golf.ctrl_pases_movimientos (
  id           SERIAL PRIMARY KEY,
  id_pase_fk   INTEGER NOT NULL REFERENCES golf.ctrl_pases(id) ON DELETE CASCADE,
  id_socio_fk  INTEGER NOT NULL REFERENCES golf.cat_socios(id),
  tipo         TEXT NOT NULL,        -- 'ASIGNACION' | 'CONSUMO' | 'AJUSTE'
  cantidad     INTEGER NOT NULL,     -- positivo = suma, negativo = resta
  motivo       TEXT,
  id_acceso_fk INTEGER REFERENCES golf.ctrl_accesos(id),   -- FK cuando viene de salida al campo
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.ctrl_pases_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_ctrl_pases_movimientos"
  ON golf.ctrl_pases_movimientos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.ctrl_pases_movimientos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_pases_movimientos_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_pases_mov_pase   ON golf.ctrl_pases_movimientos(id_pase_fk);
CREATE INDEX IF NOT EXISTS idx_pases_mov_socio  ON golf.ctrl_pases_movimientos(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_pases_mov_acceso ON golf.ctrl_pases_movimientos(id_acceso_fk);

-- ── 6. FK en ctrl_acceso_acomp → movimiento de pase ─────────
ALTER TABLE golf.ctrl_acceso_acomp
  ADD COLUMN IF NOT EXISTS id_pase_mov_fk INTEGER REFERENCES golf.ctrl_pases_movimientos(id);
