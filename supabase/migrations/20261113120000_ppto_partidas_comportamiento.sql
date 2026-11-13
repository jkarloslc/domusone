-- =============================================================
-- Comportamiento Fijo / Variable de cada partida, separado del agrupador.
--
-- Hasta hoy "fijo/variable" vivía en el NOMBRE del agrupador (Gastos Fijos,
-- Ingresos Variables Golf, …), mezclado con agrupadores de naturaleza
-- (Combustibles, Impuestos, Otros Gastos). Ahora el primer nivel de los
-- reportes es el rubro (cfg.rubros_financieros) y fijo/variable es una
-- dimensión propia, filtrable en Comparativo y Flujo de Efectivo.
-- NULL = sin definir (Intercompañías, Impuestos, Equipo).
-- =============================================================

ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS comportamiento TEXT CHECK (comportamiento IN ('fijo', 'variable'));

-- Backfill desde el agrupador actual (solo donde el nombre lo dice sin ambigüedad).
UPDATE ctrl.ppto_partidas p SET comportamiento = 'fijo'
FROM ctrl.ppto_agrupadores a
WHERE a.id = p.id_agrupador_fk AND p.comportamiento IS NULL
  AND (a.nombre ILIKE 'Gastos Fijos' OR a.nombre ILIKE 'Ingresos Fijos%' OR a.nombre ILIKE 'Cuotas de Mantenimiento');

UPDATE ctrl.ppto_partidas p SET comportamiento = 'variable'
FROM ctrl.ppto_agrupadores a
WHERE a.id = p.id_agrupador_fk AND p.comportamiento IS NULL
  AND (a.nombre ILIKE 'Gastos Variables' OR a.nombre ILIKE 'Ingresos Variables%'
       OR a.nombre ILIKE 'Combustibles' OR a.nombre ILIKE 'Comisiones Bancarias' OR a.nombre ILIKE 'Otros Gastos');
