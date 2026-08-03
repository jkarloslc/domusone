-- Módulo Vigilancia Extras: captura semanal de guardias extra de empresas
-- externas (nómina tipo "LEON COMMERCE EXTERIEUR"), autorización por admin/
-- superadmin, y vínculo con Órdenes de Pago cuando tipo_gasto = 'Perimetrales'.
-- Esquema: ctrl (sin schema nuevo, ver feedback_no_new_supabase_schemas)

-- ── Lote semanal (la hoja completa de nómina de extras) ────────────────────
CREATE TABLE IF NOT EXISTS ctrl.vigilancia_extras_lotes (
  id                 SERIAL PRIMARY KEY,
  folio              TEXT UNIQUE,
  fecha_desde        DATE NOT NULL,
  fecha_hasta        DATE NOT NULL,
  id_area_fk         INTEGER REFERENCES cfg.areas(id),
  status             TEXT NOT NULL DEFAULT 'Capturado',
                     -- Capturado | Autorizado | Rechazado
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  captured_by        TEXT,
  captured_by_id     UUID,
  authorized_by      TEXT,
  authorized_by_id   UUID,
  fecha_autorizacion TIMESTAMPTZ,
  motivo_rechazo     TEXT,
  notas              TEXT,
  id_op_fk           INTEGER,               -- ref a comp.ordenes_pago, se llena al vincularse
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vig_extras_lotes_status ON ctrl.vigilancia_extras_lotes(status);
CREATE INDEX IF NOT EXISTS idx_vig_extras_lotes_op     ON ctrl.vigilancia_extras_lotes(id_op_fk);

-- ── Guardia dentro del lote ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.vigilancia_extras_guardias (
  id           SERIAL PRIMARY KEY,
  id_lote_fk   INTEGER NOT NULL REFERENCES ctrl.vigilancia_extras_lotes(id) ON DELETE CASCADE,
  nombre       TEXT NOT NULL,
  zona         TEXT,                        -- 'Recorrido' | 'Elite' | otro
  puesto       TEXT DEFAULT 'VIG.',
  costo_dia    NUMERIC(12,2) NOT NULL DEFAULT 0,
  dias         INTEGER NOT NULL DEFAULT 0,   -- calculado desde asistencias
  costo        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- calculado desde asistencias
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vig_extras_guardias_lote ON ctrl.vigilancia_extras_guardias(id_lote_fk);

-- ── Asistencia día x turno (la cuadrícula L-D del PDF) ──────────────────────
CREATE TABLE IF NOT EXISTS ctrl.vigilancia_extras_asistencias (
  id            SERIAL PRIMARY KEY,
  id_guardia_fk INTEGER NOT NULL REFERENCES ctrl.vigilancia_extras_guardias(id) ON DELETE CASCADE,
  fecha         DATE NOT NULL,
  turno         TEXT NOT NULL,               -- 'A-D' | 'A-M' | 'A-N'
  costo         NUMERIC(12,2) NOT NULL DEFAULT 0,
  UNIQUE (id_guardia_fk, fecha)
);

CREATE INDEX IF NOT EXISTS idx_vig_extras_asist_guardia ON ctrl.vigilancia_extras_asistencias(id_guardia_fk);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE ctrl.vigilancia_extras_lotes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.vigilancia_extras_guardias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.vigilancia_extras_asistencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vigilancia_extras_lotes_all"       ON ctrl.vigilancia_extras_lotes       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vigilancia_extras_guardias_all"    ON ctrl.vigilancia_extras_guardias    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "vigilancia_extras_asistencias_all" ON ctrl.vigilancia_extras_asistencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── GRANTS explícitos (tablas nuevas requieren GRANT o el insert falla en silencio) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vigilancia_extras_lotes       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vigilancia_extras_guardias    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vigilancia_extras_asistencias TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vigilancia_extras_lotes_id_seq       TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vigilancia_extras_guardias_id_seq    TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.vigilancia_extras_asistencias_id_seq TO authenticated, service_role;
