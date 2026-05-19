-- Mueve las tablas del módulo presupuestos de schema ppto → ctrl con prefijo ppto_
-- Razón: schema ppto no se expone correctamente en la API de Supabase

-- ── 1. Crear tablas en ctrl ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ctrl.ppto_partidas (
  id                    SERIAL PRIMARY KEY,
  nombre                TEXT NOT NULL,
  descripcion           TEXT,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  id_centro_costo_fk    INTEGER,
  id_area_fk            INTEGER,
  id_centro_ingreso_fk  INTEGER,
  orden                 INTEGER DEFAULT 0,
  activo                BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ctrl.ppto_presupuestos (
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

CREATE TABLE IF NOT EXISTS ctrl.ppto_presupuesto_det (
  id                  SERIAL PRIMARY KEY,
  id_presupuesto_fk   INTEGER NOT NULL
                      REFERENCES ctrl.ppto_presupuestos(id) ON DELETE CASCADE,
  id_partida_fk       INTEGER NOT NULL
                      REFERENCES ctrl.ppto_partidas(id),
  mes                 INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto               NUMERIC(14,2) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (id_presupuesto_fk, id_partida_fk, mes)
);

CREATE TABLE IF NOT EXISTS ctrl.ppto_presupuesto_real_manual (
  id                  SERIAL PRIMARY KEY,
  id_presupuesto_fk   INTEGER NOT NULL
                      REFERENCES ctrl.ppto_presupuestos(id) ON DELETE CASCADE,
  id_partida_fk       INTEGER NOT NULL
                      REFERENCES ctrl.ppto_partidas(id),
  mes                 INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto               NUMERIC(14,2) DEFAULT 0,
  concepto            TEXT,
  referencia          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Migrar datos existentes (si los hay) ───────────────────────────────────

DO $$
BEGIN
  -- Migrar partidas
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ppto' AND table_name = 'partidas') THEN
    INSERT INTO ctrl.ppto_partidas
      SELECT * FROM ppto.partidas
      ON CONFLICT (id) DO NOTHING;

    -- Sincronizar secuencia
    PERFORM setval('ctrl.ppto_partidas_id_seq',
      COALESCE((SELECT MAX(id) FROM ctrl.ppto_partidas), 0) + 1, false);
  END IF;

  -- Migrar presupuestos
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ppto' AND table_name = 'presupuestos') THEN
    INSERT INTO ctrl.ppto_presupuestos
      SELECT * FROM ppto.presupuestos
      ON CONFLICT DO NOTHING;

    PERFORM setval('ctrl.ppto_presupuestos_id_seq',
      COALESCE((SELECT MAX(id) FROM ctrl.ppto_presupuestos), 0) + 1, false);
  END IF;

  -- Migrar detalle (solo si los FK de presupuestos ya existen)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ppto' AND table_name = 'presupuesto_det') THEN
    INSERT INTO ctrl.ppto_presupuesto_det
      SELECT d.* FROM ppto.presupuesto_det d
      WHERE EXISTS (SELECT 1 FROM ctrl.ppto_presupuestos WHERE id = d.id_presupuesto_fk)
        AND EXISTS (SELECT 1 FROM ctrl.ppto_partidas    WHERE id = d.id_partida_fk)
      ON CONFLICT DO NOTHING;

    PERFORM setval('ctrl.ppto_presupuesto_det_id_seq',
      COALESCE((SELECT MAX(id) FROM ctrl.ppto_presupuesto_det), 0) + 1, false);
  END IF;

  -- Migrar real manual
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'ppto' AND table_name = 'presupuesto_real_manual') THEN
    INSERT INTO ctrl.ppto_presupuesto_real_manual
      SELECT r.* FROM ppto.presupuesto_real_manual r
      WHERE EXISTS (SELECT 1 FROM ctrl.ppto_presupuestos WHERE id = r.id_presupuesto_fk)
        AND EXISTS (SELECT 1 FROM ctrl.ppto_partidas    WHERE id = r.id_partida_fk)
      ON CONFLICT DO NOTHING;

    PERFORM setval('ctrl.ppto_presupuesto_real_manual_id_seq',
      COALESCE((SELECT MAX(id) FROM ctrl.ppto_presupuesto_real_manual), 0) + 1, false);
  END IF;
END $$;

-- ── 3. Grants ─────────────────────────────────────────────────────────────────
GRANT ALL ON ctrl.ppto_partidas                TO authenticated, service_role;
GRANT ALL ON ctrl.ppto_presupuestos            TO authenticated, service_role;
GRANT ALL ON ctrl.ppto_presupuesto_det         TO authenticated, service_role;
GRANT ALL ON ctrl.ppto_presupuesto_real_manual TO authenticated, service_role;

GRANT USAGE, SELECT ON SEQUENCE ctrl.ppto_partidas_id_seq                TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.ppto_presupuestos_id_seq            TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.ppto_presupuesto_det_id_seq         TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.ppto_presupuesto_real_manual_id_seq TO authenticated, service_role;
