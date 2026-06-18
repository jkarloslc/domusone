-- Catálogo de Colaboradores — usado para asignar personal a OT (Asignado a / Supervisor)
CREATE TABLE IF NOT EXISTS cfg.colaboradores (
  id                     SERIAL PRIMARY KEY,
  nombre                 TEXT NOT NULL,
  apellido_paterno       TEXT,
  apellido_materno       TEXT,
  fecha_ingreso          DATE,
  puesto                 TEXT,
  sueldo_bruto_mensual   NUMERIC(12,2),
  sueldo_neto_mensual    NUMERIC(12,2),
  es_asignado            BOOLEAN NOT NULL DEFAULT FALSE,
  es_supervisor          BOOLEAN NOT NULL DEFAULT FALSE,
  id_cuadrante_fk        INTEGER REFERENCES cfg.cuadrantes(id),
  id_seccion_fk          INTEGER REFERENCES cfg.secciones(id),
  id_centro_costo_fk     INTEGER REFERENCES cfg.centros_costo(id),
  id_area_fk             INTEGER REFERENCES cfg.areas(id),
  activo                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_es_asignado   ON cfg.colaboradores(es_asignado);
CREATE INDEX IF NOT EXISTS idx_colaboradores_es_supervisor ON cfg.colaboradores(es_supervisor);
CREATE INDEX IF NOT EXISTS idx_colaboradores_cuadrante     ON cfg.colaboradores(id_cuadrante_fk);
CREATE INDEX IF NOT EXISTS idx_colaboradores_seccion       ON cfg.colaboradores(id_seccion_fk);
CREATE INDEX IF NOT EXISTS idx_colaboradores_centro_costo  ON cfg.colaboradores(id_centro_costo_fk);
CREATE INDEX IF NOT EXISTS idx_colaboradores_area          ON cfg.colaboradores(id_area_fk);

ALTER TABLE cfg.colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "colaboradores_all" ON cfg.colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);
