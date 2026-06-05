-- ============================================================
-- Carga masiva: consumo diario de agua programa de riego 2026
-- Rango: 2026-01-01 → 2026-05-31
-- Lógica: por cada día del rango, agrupa m3_prog y horas_prog
-- del programa activo por origen de agua (Lago 7, Lago 2,
-- Ordeña, Lago 12).
-- m3_real se inicializa igual a m3_programado (consumo base).
-- ON CONFLICT DO UPDATE → corrige filas existentes con m3_real NULL.
-- ============================================================

INSERT INTO golf.riego_consumo_diario (
  fecha,
  origen,
  m3_programado,
  horas_bomba,
  m3_real,
  lectura_inicio,
  lectura_fin
)
SELECT
  d.fecha::DATE,
  p.origen,
  SUM(p.m3_prog)::NUMERIC(10,2)    AS m3_programado,
  SUM(p.horas_prog)::NUMERIC(6,2)  AS horas_bomba,
  SUM(p.m3_prog)::NUMERIC(10,2)    AS m3_real,
  NULL::NUMERIC(12,2)               AS lectura_inicio,
  NULL::NUMERIC(12,2)               AS lectura_fin
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
GROUP BY d.fecha, p.origen
ON CONFLICT (fecha, origen) DO UPDATE
  SET m3_programado = EXCLUDED.m3_programado,
      horas_bomba   = EXCLUDED.horas_bomba,
      m3_real       = EXCLUDED.m3_real,
      updated_at    = NOW();
