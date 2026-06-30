-- =============================================================
-- Programa de Mantenimiento General — estructura separada de Golf
-- Reemplaza el uso de ctrl.programas_mantenimiento/programa_tareas
-- (modulo='mantenimiento') por tablas propias, con generación
-- de ejecuciones BAJO DEMANDA (no se materializan las 365 filas
-- de un programa Diario al crearlo).
-- ctrl.programas_mantenimiento/programa_tareas quedan exclusivas
-- de Golf (modulo='golf').
-- =============================================================

-- 1. Plantilla del programa (1 fila por regla, no por ocurrencia)
CREATE TABLE IF NOT EXISTS ctrl.mant_programas (
  id                 SERIAL PRIMARY KEY,
  nombre             TEXT    NOT NULL,
  anio               INTEGER NOT NULL,
  tipo_trabajo       TEXT,
  frecuencia         TEXT    NOT NULL, -- Diario, Semanal, Quincenal, Mensual, Bimestral, Trimestral, Semestral, Anual
  mes_inicio         INTEGER NOT NULL DEFAULT 1,
  fecha_inicio       DATE,
  fecha_fin          DATE,
  id_cuadrante_fk    INTEGER REFERENCES cfg.cuadrantes(id),
  id_area_fk         INTEGER REFERENCES cfg.areas(id),
  id_area_comun_fk   INTEGER REFERENCES cfg.areas_comunes(id),
  id_responsable_fk  INTEGER,
  responsable        TEXT,
  descripcion        TEXT,
  presupuesto_est    NUMERIC DEFAULT 0,
  activo             BOOLEAN NOT NULL DEFAULT true,
  created_by         TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mant_programas_anio   ON ctrl.mant_programas (anio);
CREATE INDEX IF NOT EXISTS idx_mant_programas_activo ON ctrl.mant_programas (activo);

-- 2. Ejecuciones — solo existe una fila cuando alguien REGISTRA
--    algo (cambia status o genera OT) para esa fecha programada.
--    Si no existe fila, la fecha se considera "Pendiente" (calculado
--    en el frontend a partir de la frecuencia, no almacenado).
CREATE TABLE IF NOT EXISTS ctrl.mant_ejecuciones (
  id              SERIAL PRIMARY KEY,
  id_programa_fk  INTEGER NOT NULL REFERENCES ctrl.mant_programas(id) ON DELETE CASCADE,
  fecha_prog      DATE    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'Pendiente', -- Pendiente, En Proceso, Completada, Omitida
  id_ot_fk        INTEGER REFERENCES ctrl.ordenes_trabajo(id),
  observaciones   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (id_programa_fk, fecha_prog)
);

CREATE INDEX IF NOT EXISTS idx_mant_ejecuciones_programa ON ctrl.mant_ejecuciones (id_programa_fk);
CREATE INDEX IF NOT EXISTS idx_mant_ejecuciones_fecha    ON ctrl.mant_ejecuciones (fecha_prog);

-- 3. Migrar programas existentes (modulo='mantenimiento') desde la
--    tabla compartida con Golf hacia la nueva tabla independiente.
INSERT INTO ctrl.mant_programas
  (nombre, anio, tipo_trabajo, frecuencia, mes_inicio, fecha_inicio, fecha_fin,
   id_cuadrante_fk, id_area_fk, id_area_comun_fk, id_responsable_fk, responsable,
   descripcion, presupuesto_est, activo, created_by, created_at)
SELECT
  nombre, anio, tipo_trabajo, frecuencia, mes_inicio, fecha_inicio, fecha_fin,
  id_cuadrante_fk, id_area_fk, id_area_comun_fk, id_responsable_fk, responsable,
  descripcion, presupuesto_est, activo, created_by, created_at
FROM ctrl.programas_mantenimiento
WHERE modulo = 'mantenimiento';

-- 4. Migrar las ejecuciones ya registradas (status distinto de
--    'Pendiente' u OT vinculada) preservando la fecha; las que
--    seguían en 'Pendiente' sin OT no se migran — se recalculan
--    bajo demanda con la nueva lógica de ocurrencias.
INSERT INTO ctrl.mant_ejecuciones
  (id_programa_fk, fecha_prog, status, id_ot_fk, created_at, updated_at)
SELECT
  mp.id, pt.fecha_prog, pt.status, pt.id_ot_fk, pt.created_at, pt.updated_at
FROM ctrl.programa_tareas pt
JOIN ctrl.programas_mantenimiento pm ON pm.id = pt.id_programa_fk AND pm.modulo = 'mantenimiento'
JOIN ctrl.mant_programas mp ON mp.nombre = pm.nombre AND mp.anio = pm.anio
  AND mp.created_at = pm.created_at
WHERE pt.status <> 'Pendiente' OR pt.id_ot_fk IS NOT NULL
ON CONFLICT (id_programa_fk, fecha_prog) DO NOTHING;

-- 5. Permisos
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.mant_programas    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.mant_ejecuciones  TO authenticated;
GRANT ALL ON ctrl.mant_programas   TO service_role;
GRANT ALL ON ctrl.mant_ejecuciones TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.mant_programas_id_seq   TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.mant_ejecuciones_id_seq TO authenticated;
