-- ─────────────────────────────────────────────────────────────────
-- Módulo de Presupuestos — schema ppto
-- ─────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS ppto;

-- ── 1. Catálogo de partidas presupuestales ───────────────────────
CREATE TABLE ppto.partidas (
  id                    SERIAL PRIMARY KEY,
  nombre                TEXT NOT NULL,
  descripcion           TEXT,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  -- Para egresos: vínculo a CC / área
  id_centro_costo_fk    INTEGER,
  id_area_fk            INTEGER,
  -- Para ingresos: vínculo a centro de ingreso
  id_centro_ingreso_fk  INTEGER,
  orden                 INTEGER DEFAULT 0,
  activo                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Cabecera del presupuesto anual ───────────────────────────
CREATE TABLE ppto.presupuestos (
  id          SERIAL PRIMARY KEY,
  anio        INTEGER NOT NULL,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  status      TEXT NOT NULL DEFAULT 'borrador'
              CHECK (status IN ('borrador', 'aprobado', 'cerrado')),
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (anio, nombre)
);

-- ── 3. Detalle mensual presupuestado por partida ─────────────────
CREATE TABLE ppto.presupuesto_det (
  id                  SERIAL PRIMARY KEY,
  id_presupuesto_fk   INTEGER NOT NULL
                      REFERENCES ppto.presupuestos(id) ON DELETE CASCADE,
  id_partida_fk       INTEGER NOT NULL
                      REFERENCES ppto.partidas(id),
  mes                 INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto               NUMERIC(14,2) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (id_presupuesto_fk, id_partida_fk, mes)
);

-- ── 4. Real manual (override / complemento al real automático) ───
CREATE TABLE ppto.presupuesto_real_manual (
  id                  SERIAL PRIMARY KEY,
  id_presupuesto_fk   INTEGER NOT NULL
                      REFERENCES ppto.presupuestos(id) ON DELETE CASCADE,
  id_partida_fk       INTEGER NOT NULL
                      REFERENCES ppto.partidas(id),
  mes                 INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto               NUMERIC(14,2) DEFAULT 0,
  concepto            TEXT,
  referencia          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── Permisos ─────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA ppto TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA ppto TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA ppto TO anon, authenticated;
