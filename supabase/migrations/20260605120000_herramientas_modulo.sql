-- Módulo Equipo y Herramienta (Operaciones)
-- Catálogo de herramienta/equipo menor + bitácora de préstamos + bitácora de servicios de mantenimiento

-- ── Catálogo ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cfg.herramientas (
  id                SERIAL PRIMARY KEY,
  descripcion       TEXT NOT NULL,
  tipo              TEXT NOT NULL DEFAULT 'Herramienta',
                    -- Desbrozadora | Podadora | Motosierra | Sopladora | Bomba de Agua
                    -- | Generador | Compresor | Taladro | Esmeril | Otro
  marca             TEXT,
  modelo            TEXT,
  no_serie          TEXT,
  id_area_fk        INTEGER REFERENCES cfg.areas(id),
  status            TEXT NOT NULL DEFAULT 'Disponible',
                    -- Disponible | Prestado | En Mantenimiento | Baja
  fecha_adquisicion DATE,
  costo_adquisicion NUMERIC(12,2),
  foto_url          TEXT,
  notas             TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_herramientas_tipo   ON cfg.herramientas(tipo);
CREATE INDEX IF NOT EXISTS idx_herramientas_status ON cfg.herramientas(status);
CREATE INDEX IF NOT EXISTS idx_herramientas_area   ON cfg.herramientas(id_area_fk);

-- ── Bitácora de préstamo y entrega diario ─────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.prestamos_herramientas (
  id                   SERIAL PRIMARY KEY,
  folio                TEXT UNIQUE,
  id_herramienta_fk    INTEGER NOT NULL REFERENCES cfg.herramientas(id),
  solicitante          TEXT NOT NULL,
  id_area_fk           INTEGER REFERENCES cfg.areas(id),
  fecha_prestamo       DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_prestamo        TIME,
  fecha_entrega_prog   DATE,
  fecha_devolucion     DATE,
  hora_devolucion      TIME,
  condicion_entrega    TEXT,              -- Bueno | Regular | Dañado (al prestar)
  condicion_devolucion TEXT,              -- Bueno | Regular | Dañado (al devolver)
  entrega_responsable  TEXT,              -- quién entrega la herramienta
  recibe_responsable   TEXT,              -- quién recibe la devolución
  status               TEXT NOT NULL DEFAULT 'Prestado',
                       -- Prestado | Devuelto
  notas                TEXT,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by           TEXT
);

CREATE INDEX IF NOT EXISTS idx_prestamos_herr_herramienta ON ctrl.prestamos_herramientas(id_herramienta_fk);
CREATE INDEX IF NOT EXISTS idx_prestamos_herr_status      ON ctrl.prestamos_herramientas(status);
CREATE INDEX IF NOT EXISTS idx_prestamos_herr_fecha       ON ctrl.prestamos_herramientas(fecha_prestamo);

-- ── Bitácora de servicios de mantenimiento (mantenimientos, reparaciones) ──
CREATE TABLE IF NOT EXISTS ctrl.mantenimiento_herramientas (
  id                SERIAL PRIMARY KEY,
  folio             TEXT UNIQUE,
  id_herramienta_fk INTEGER NOT NULL REFERENCES cfg.herramientas(id),
  tipo              TEXT NOT NULL DEFAULT 'Preventivo',
                    -- Preventivo | Correctivo | Reparación
  descripcion       TEXT,
  fecha_inicio      DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin         DATE,
  costo_total       NUMERIC(12,2) DEFAULT 0,
  responsable       TEXT,
  status            TEXT NOT NULL DEFAULT 'Abierto',
                    -- Abierto | En Proceso | Cerrado
  notas             TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_mantto_herr_herramienta ON ctrl.mantenimiento_herramientas(id_herramienta_fk);
CREATE INDEX IF NOT EXISTS idx_mantto_herr_status      ON ctrl.mantenimiento_herramientas(status);

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE cfg.herramientas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.prestamos_herramientas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.mantenimiento_herramientas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "herramientas_all"             ON cfg.herramientas              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "prestamos_herramientas_all"   ON ctrl.prestamos_herramientas   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mantto_herramientas_all"      ON ctrl.mantenimiento_herramientas FOR ALL TO authenticated USING (true) WITH CHECK (true);
