-- ══════════════════════════════════════════════════════════════
-- Módulo: Equipo & Flota
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Catálogo de equipos y vehículos
CREATE TABLE IF NOT EXISTS cfg.equipos (
  id                  SERIAL PRIMARY KEY,
  nombre              TEXT    NOT NULL,
  tipo                TEXT    NOT NULL DEFAULT 'Vehículo',  -- Vehículo | Maquinaria | Herramienta
  marca               TEXT,
  modelo              TEXT,
  anio                INTEGER,
  no_serie            TEXT,
  placa               TEXT,
  id_area_fk          INTEGER REFERENCES cfg.areas(id),
  fecha_adquisicion   DATE,
  costo_adquisicion   NUMERIC(14,2),
  unidad_odometro     TEXT    NOT NULL DEFAULT 'km',        -- km | hrs
  odometro_actual     NUMERIC(10,2) DEFAULT 0,
  status              TEXT    NOT NULL DEFAULT 'Activo',    -- Activo | En Mantenimiento | Baja
  foto_url            TEXT,
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- 2. Bitácora de mantenimiento / reparaciones
CREATE TABLE IF NOT EXISTS ctrl.bitacora_equipos (
  id              SERIAL PRIMARY KEY,
  folio           TEXT    NOT NULL UNIQUE,
  id_equipo_fk    INTEGER NOT NULL REFERENCES cfg.equipos(id),
  tipo            TEXT    NOT NULL DEFAULT 'Preventivo',    -- Preventivo | Correctivo | Reparación
  descripcion     TEXT,
  fecha_inicio    DATE    NOT NULL,
  fecha_fin       DATE,
  status          TEXT    NOT NULL DEFAULT 'Abierto',       -- Abierto | En Proceso | Cerrado
  odometro_inicio NUMERIC(10,2),
  odometro_fin    NUMERIC(10,2),
  responsable     TEXT,
  costo_total     NUMERIC(14,2) DEFAULT 0,
  notas           TEXT,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Vinculación de OPs a cada entrada de bitácora
CREATE TABLE IF NOT EXISTS ctrl.bitacora_equipo_ops (
  id              SERIAL PRIMARY KEY,
  id_bitacora_fk  INTEGER NOT NULL REFERENCES ctrl.bitacora_equipos(id) ON DELETE CASCADE,
  id_op_fk        INTEGER NOT NULL REFERENCES comp.ordenes_pago(id),
  monto           NUMERIC(14,2),
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 4. Evidencias fotográficas por entrada de bitácora
CREATE TABLE IF NOT EXISTS ctrl.bitacora_equipo_evidencias (
  id              SERIAL PRIMARY KEY,
  id_bitacora_fk  INTEGER NOT NULL REFERENCES ctrl.bitacora_equipos(id) ON DELETE CASCADE,
  url             TEXT    NOT NULL,
  nombre          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_bitacora_equipo    ON ctrl.bitacora_equipos(id_equipo_fk);
CREATE INDEX IF NOT EXISTS idx_bitacora_ops       ON ctrl.bitacora_equipo_ops(id_bitacora_fk);
CREATE INDEX IF NOT EXISTS idx_bitacora_evidencias ON ctrl.bitacora_equipo_evidencias(id_bitacora_fk);
