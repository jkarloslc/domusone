-- Nueva dimensión "clasificacion" en ctrl.ppto_partidas, ORTOGONAL a `tipo`
-- (ingreso/egreso) — separa Operativo de Financiero e Intercompañías para
-- poder mostrar apartados propios en Comparativo/Flujo/Captura/Dashboard sin
-- tocar la lógica de signo/color que ya depende exclusivamente de `tipo`.
-- Mismo criterio documentado en CLAUDE.md: no reutilizar una columna
-- existente para una dimensión distinta — se agrega columna nueva en vez de
-- extender el CHECK de `tipo` a 4 valores.

ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS clasificacion TEXT NOT NULL DEFAULT 'operativo';

ALTER TABLE ctrl.ppto_partidas DROP CONSTRAINT IF EXISTS ppto_partidas_clasificacion_check;
ALTER TABLE ctrl.ppto_partidas ADD CONSTRAINT ppto_partidas_clasificacion_check
  CHECK (clasificacion IN ('operativo', 'financiero', 'intercompanias'));

CREATE INDEX IF NOT EXISTS idx_ppto_partidas_clasificacion ON ctrl.ppto_partidas(clasificacion);

-- Reclasifica las 15 partidas de egreso "Intercompañías BPCC/OOB/RBA" (una
-- por módulo, ver 20260814130000) que hoy viven dentro del Total de Egresos
-- operativo — pasan al nuevo apartado "Egreso Intercompañías" y dejan de
-- sumar en Egresos operativo (decisión confirmada: sin datos históricos de
-- OP con esos tipo_gasto que migrar).
UPDATE ctrl.ppto_partidas
SET clasificacion = 'intercompanias'
WHERE tipo_gasto IN ('Intercompañías BPCC', 'Intercompañías OOB', 'Intercompañías RBA');

-- Siembra la contraparte de ingreso (espejo) de cada una de las 15 anteriores.
-- No existe fuente automática de captura de intercompañías entrantes, así
-- que quedan con fuente_real='manual' (se captura vía "+ Manual" en
-- Comparativo/Flujo, igual que aportaciones de socios / financiamiento).
INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, modulo, clasificacion, fuente_real, orden, activo, incluir_presupuesto, incluir_flujo)
SELECT
  'Ingreso ' || src.tipo_gasto || ' [' || src.modulo || ']',
  'ingreso', src.modulo, 'intercompanias', 'manual', src.orden, true,
  src.incluir_presupuesto, src.incluir_flujo
FROM ctrl.ppto_partidas src
WHERE src.tipo_gasto IN ('Intercompañías BPCC', 'Intercompañías OOB', 'Intercompañías RBA')
  AND src.clasificacion = 'intercompanias'
  AND NOT EXISTS (
    SELECT 1 FROM ctrl.ppto_partidas dst
    WHERE dst.modulo = src.modulo AND dst.tipo = 'ingreso' AND dst.clasificacion = 'intercompanias'
      AND dst.nombre = 'Ingreso ' || src.tipo_gasto || ' [' || src.modulo || ']'
  );
