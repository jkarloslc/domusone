-- Bitácora de Uso de Equipos — registro por turno/viaje/jornada
-- Objetivo: calcular rendimiento (km/L, hrs/L) y consumo acumulado por equipo
-- Esquema: ctrl

CREATE TABLE IF NOT EXISTS ctrl.bitacora_uso_equipos (
  id                SERIAL PRIMARY KEY,
  id_equipo_fk      INTEGER NOT NULL,       -- ref a cfg.equipos
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  operador          TEXT,
  actividad         TEXT,                   -- propósito de uso del turno
  odometro_inicio   NUMERIC(10,1),          -- lectura al inicio (km o hrs según equipo)
  odometro_fin      NUMERIC(10,1),          -- lectura al final
  horas_uso         NUMERIC(8,2),           -- horas trabajadas en el turno
  litros            NUMERIC(8,2),           -- combustible consumido / cargado
  tipo_combustible  TEXT DEFAULT 'Magna',   -- Magna | Premium | Diesel | Gas LP | Eléctrico
  costo_combustible NUMERIC(10,2),
  notas             TEXT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT
);

CREATE INDEX IF NOT EXISTS idx_uso_equipos_equipo ON ctrl.bitacora_uso_equipos(id_equipo_fk);
CREATE INDEX IF NOT EXISTS idx_uso_equipos_fecha  ON ctrl.bitacora_uso_equipos(fecha);

ALTER TABLE ctrl.bitacora_uso_equipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uso_equipos_all" ON ctrl.bitacora_uso_equipos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
