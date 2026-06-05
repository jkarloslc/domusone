-- ============================================================
-- Carga masiva: ejecución programa de riego Balvanera 2026
-- Rango: 2026-01-01 → 2026-05-31
-- Lógica: por cada día del rango, inserta un registro de
-- ejecución por cada actividad activa del programa cuyo
-- dia_semana coincida con el día de la semana del calendario.
-- Status 'completado' — ajustar a 'no_realizado' o 'pendiente'
-- si se prefiere dejar sin validar.
-- ON CONFLICT DO NOTHING → idempotente (seguro re-ejecutar).
-- ============================================================

INSERT INTO golf.riego_ejecucion (
  id_programa_fk,
  fecha_prog,
  semana_iso,
  anio,
  status,
  hora_inicio_real,
  hora_fin_real,
  horas_real,
  m3_real
)
SELECT
  p.id,
  d.fecha::DATE,
  EXTRACT(WEEK    FROM d.fecha)::SMALLINT   AS semana_iso,
  EXTRACT(YEAR    FROM d.fecha)::SMALLINT   AS anio,
  'completado'                              AS status,
  p.hora_inicio                             AS hora_inicio_real,
  p.hora_fin                                AS hora_fin_real,
  p.horas_prog                              AS horas_real,
  p.m3_prog                                 AS m3_real
FROM generate_series(
       '2026-01-01'::DATE,
       '2026-05-31'::DATE,
       '1 day'::INTERVAL
     ) AS d(fecha)
JOIN golf.riego_programa p
  ON  p.activo = TRUE
  AND p.dia_semana = CASE EXTRACT(DOW FROM d.fecha)::INT
                       WHEN 0 THEN 'Domingo'
                       WHEN 1 THEN 'Lunes'
                       WHEN 2 THEN 'Martes'
                       WHEN 3 THEN 'Miercoles'
                       WHEN 4 THEN 'Jueves'
                       WHEN 5 THEN 'Viernes'
                       WHEN 6 THEN 'Sabado'
                     END
ON CONFLICT (id_programa_fk, fecha_prog) DO NOTHING;
