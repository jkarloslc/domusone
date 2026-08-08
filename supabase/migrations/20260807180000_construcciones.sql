-- Módulo Construcciones (Residencial): expediente de obra por lote.
-- Master sigue siendo cat.lotes; cat.lotes.status_lote_proyectos (columna ya
-- existente, sin uso hasta ahora) pasa a reflejar el estado físico del lote:
-- 'Terreno' | 'Construcción' | 'Casa'.
-- Esquema: ctrl (sin schema nuevo, ver feedback_no_new_supabase_schemas).

CREATE TABLE IF NOT EXISTS ctrl.construcciones (
  id                    SERIAL PRIMARY KEY,
  id_lote_fk            INTEGER NOT NULL REFERENCES cat.lotes(id),
  motivo                TEXT NOT NULL DEFAULT 'Construcción Nueva',
  descripcion           TEXT,
  status                TEXT NOT NULL DEFAULT 'Abierto',
  fecha_apertura        DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_cierre          DATE,
  responsable_obra      TEXT,
  telefono_responsable  TEXT,
  notas                 TEXT,
  created_by            TEXT,
  created_by_id         UUID,
  activo                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_construcciones_lote   ON ctrl.construcciones(id_lote_fk);
CREATE INDEX IF NOT EXISTS idx_construcciones_status ON ctrl.construcciones(status);

-- Checklist de etapas (7 ítems fijos sembrados al crear el expediente).
-- Documento de soporte va directo en la fila de la etapa (patrón de URL
-- única en columna, igual que lotes.imagen_lote / proyectos.pdf_proyecto).
CREATE TABLE IF NOT EXISTS ctrl.construcciones_checklist (
  id                  SERIAL PRIMARY KEY,
  id_construccion_fk  INTEGER NOT NULL REFERENCES ctrl.construcciones(id) ON DELETE CASCADE,
  etapa               TEXT NOT NULL,
  orden               INTEGER NOT NULL DEFAULT 0,
  completado          BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_completado    DATE,
  completado_por      TEXT,
  documento_url       TEXT,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(id_construccion_fk, etapa)
);
CREATE INDEX IF NOT EXISTS idx_construcciones_checklist_construccion ON ctrl.construcciones_checklist(id_construccion_fk);

-- Bitácora de avances de obra.
CREATE TABLE IF NOT EXISTS ctrl.construcciones_avances (
  id                  SERIAL PRIMARY KEY,
  id_construccion_fk  INTEGER NOT NULL REFERENCES ctrl.construcciones(id) ON DELETE CASCADE,
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  porcentaje_avance   NUMERIC(5,2),
  descripcion         TEXT,
  imagenes            TEXT[] NOT NULL DEFAULT '{}',
  registrado_por      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_construcciones_avances_construccion ON ctrl.construcciones_avances(id_construccion_fk);

-- Incidencias de obra, con multa opcional que se traduce en un cargo (CxC).
CREATE TABLE IF NOT EXISTS ctrl.construcciones_incidencias (
  id                  SERIAL PRIMARY KEY,
  id_construccion_fk  INTEGER NOT NULL REFERENCES ctrl.construcciones(id) ON DELETE CASCADE,
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo                TEXT,
  descripcion         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'Abierta',
  tiene_multa         BOOLEAN NOT NULL DEFAULT FALSE,
  monto_multa         NUMERIC(12,2),
  id_cargo_fk         INTEGER,
  imagenes            TEXT[] NOT NULL DEFAULT '{}',
  registrado_por      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_construcciones_incidencias_construccion ON ctrl.construcciones_incidencias(id_construccion_fk);

-- Documentos generales del expediente (no ligados a una etapa específica del checklist).
CREATE TABLE IF NOT EXISTS ctrl.construcciones_documentos (
  id                  SERIAL PRIMARY KEY,
  id_construccion_fk  INTEGER NOT NULL REFERENCES ctrl.construcciones(id) ON DELETE CASCADE,
  etapa               TEXT,
  nombre_archivo      TEXT NOT NULL,
  url                 TEXT NOT NULL,
  subido_por          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_construcciones_documentos_construccion ON ctrl.construcciones_documentos(id_construccion_fk);

-- Back-reference desde Cargos hacia la incidencia de obra que originó la multa.
ALTER TABLE ctrl.cargos ADD COLUMN IF NOT EXISTS id_construccion_incidencia_fk INTEGER REFERENCES ctrl.construcciones_incidencias(id);

-- ── RLS ──
ALTER TABLE ctrl.construcciones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.construcciones_checklist    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.construcciones_avances      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.construcciones_incidencias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.construcciones_documentos   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "construcciones_all"             ON ctrl.construcciones             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "construcciones_checklist_all"   ON ctrl.construcciones_checklist   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "construcciones_avances_all"     ON ctrl.construcciones_avances     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "construcciones_incidencias_all" ON ctrl.construcciones_incidencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "construcciones_documentos_all"  ON ctrl.construcciones_documentos  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── GRANTS explícitos (tablas nuevas requieren GRANT o el insert falla en silencio) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.construcciones             TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.construcciones_checklist   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.construcciones_avances     TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.construcciones_incidencias TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.construcciones_documentos  TO authenticated, service_role;

GRANT USAGE, SELECT ON SEQUENCE ctrl.construcciones_id_seq             TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.construcciones_checklist_id_seq   TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.construcciones_avances_id_seq     TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.construcciones_incidencias_id_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.construcciones_documentos_id_seq  TO authenticated, service_role;

COMMENT ON COLUMN cat.lotes.status_lote_proyectos IS 'Estado físico del lote respecto a construcción: Terreno | Construcción | Casa. Sincronizado por el módulo Construcciones (ctrl.construcciones).';
