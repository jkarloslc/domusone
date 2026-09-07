-- Módulo HR > Rol de Pagos: captura semanal de asistencia de colaboradores
-- (cfg.colaboradores) y monto a pagar por día trabajado. Mismo patrón que
-- ctrl.vigilancia_extras_* (ver 20260803150000_vigilancia_extras.sql).
-- Esquema: ctrl (sin schema nuevo, ver feedback_no_new_supabase_schemas)

-- ── Lote semanal (la hoja completa de rol de pagos) ────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.rol_pagos_lotes (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT UNIQUE,
  fecha_desde         DATE NOT NULL,
  fecha_hasta         DATE NOT NULL,
  id_centro_costo_fk  INTEGER REFERENCES cfg.centros_costo(id),
  status              TEXT NOT NULL DEFAULT 'Capturado',
                      -- Capturado | Autorizado | Rechazado
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  captured_by         TEXT,
  captured_by_id      UUID,
  authorized_by       TEXT,
  authorized_by_id    UUID,
  fecha_autorizacion  TIMESTAMPTZ,
  motivo_rechazo      TEXT,
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rol_pagos_lotes_status ON ctrl.rol_pagos_lotes(status);

-- ── Colaborador dentro del lote ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.rol_pagos_colaboradores (
  id                SERIAL PRIMARY KEY,
  id_lote_fk        INTEGER NOT NULL REFERENCES ctrl.rol_pagos_lotes(id) ON DELETE CASCADE,
  id_colaborador_fk INTEGER REFERENCES cfg.colaboradores(id),  -- se elige vía popup de Colaboradores
  nombre            TEXT NOT NULL,           -- copia del nombre completo al momento de captura
  puesto            TEXT,
  costo_dia         NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias              INTEGER NOT NULL DEFAULT 0,        -- calculado desde asistencias
  costo             NUMERIC(12,2) NOT NULL DEFAULT 0,   -- monto a pagar, calculado desde asistencias
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rol_pagos_colabs_lote  ON ctrl.rol_pagos_colaboradores(id_lote_fk);
CREATE INDEX IF NOT EXISTS idx_rol_pagos_colabs_colab ON ctrl.rol_pagos_colaboradores(id_colaborador_fk);

-- ── Asistencia por día (la cuadrícula de la semana en el PDF) ───────────────
CREATE TABLE IF NOT EXISTS ctrl.rol_pagos_asistencias (
  id                          SERIAL PRIMARY KEY,
  id_colaborador_lote_fk      INTEGER NOT NULL REFERENCES ctrl.rol_pagos_colaboradores(id) ON DELETE CASCADE,
  fecha                       DATE NOT NULL,
  costo                       NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (id_colaborador_lote_fk, fecha)
);

CREATE INDEX IF NOT EXISTS idx_rol_pagos_asist_colab ON ctrl.rol_pagos_asistencias(id_colaborador_lote_fk);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE ctrl.rol_pagos_lotes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.rol_pagos_colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.rol_pagos_asistencias   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rol_pagos_lotes_all"         ON ctrl.rol_pagos_lotes         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rol_pagos_colaboradores_all" ON ctrl.rol_pagos_colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rol_pagos_asistencias_all"   ON ctrl.rol_pagos_asistencias   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── GRANTS explícitos (tablas nuevas requieren GRANT o el insert falla en silencio) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.rol_pagos_lotes         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.rol_pagos_colaboradores TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.rol_pagos_asistencias   TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.rol_pagos_lotes_id_seq         TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.rol_pagos_colaboradores_id_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.rol_pagos_asistencias_id_seq   TO authenticated, service_role;
