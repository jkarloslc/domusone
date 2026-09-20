-- ════════════════════════════════════════════════════════════════
-- Periodo de devengo de una cuota (reconocimiento diferido)
-- Migración: 20260920160000
-- ════════════════════════════════════════════════════════════════
--
-- PROBLEMA
-- La INSCRIPCIÓN anual de Golf se carga completa en un solo periodo
-- (enero 2026: 211 cuotas, $3,825,600). Como el devengado de un mes
-- es la suma de las cuotas de ese periodo, enero devenga $5.05M
-- contra ~$1.35M del resto del año — un pico que vuelve a desvirtuar
-- la medición mensual del área, que es justamente lo que la
-- estrategia de presentación de ingresos busca evitar.
--
-- El cobro no cambia: se sigue cobrando una vez. Lo que cambia es
-- cuántos meses de resultado absorbe ese cargo.
--
-- POR QUÉ UNA COLUMNA NUEVA Y NO `meses_aplicar`
-- golf.cat_cuotas_config.meses_aplicar ya existe pero significa lo
-- contrario: cuántos CARGOS mensuales genera la cuota (MENSUALIDAD
-- = 12 cargos, INSCRIPCION = 1 cargo). Lo que hace falta es cuántos
-- meses de RESULTADO absorbe cada cargo — dos conceptos ortogonales:
--
--   tipo          meses_aplicar   meses_devengo
--   MENSUALIDAD        12               1       12 cargos, cada uno de su mes
--   INSCRIPCION         1              12       1 cargo, repartido en 12 meses
--
-- Reutilizar meses_aplicar habría mezclado las dos dimensiones, que
-- es el error que ya se decidió no repetir en este proyecto.
--
-- SEMÁNTICA
-- meses_devengo = 1 (default) → la cuota se reconoce completa en su
-- propio periodo; el comportamiento actual no cambia para nadie.
-- meses_devengo = N > 1 → el cargo se reparte en N meses consecutivos
-- a partir de su periodo. La diferencia entre lo cargado y lo
-- reconocido es ingreso diferido, y el reporte de Composición del
-- Ingreso por Cuotas la muestra en columna propia para que el puente
-- devengado→caja siga cuadrando.
--
-- El reparto es de presentación: NO toca cargos, saldos, estados de
-- cuenta ni cobranza. Una inscripción de mitad de año reparte hacia
-- adelante y cruza al siguiente ejercicio, como corresponde.
-- 2026-09-20
-- ════════════════════════════════════════════════════════════════

-- 1) Golf — cuotas de socios (MENSUALIDAD / INSCRIPCION)
ALTER TABLE golf.cat_cuotas_config
  ADD COLUMN IF NOT EXISTS meses_devengo INTEGER NOT NULL DEFAULT 1;

ALTER TABLE golf.cat_cuotas_config
  DROP CONSTRAINT IF EXISTS cat_cuotas_config_meses_devengo_check;
ALTER TABLE golf.cat_cuotas_config
  ADD CONSTRAINT cat_cuotas_config_meses_devengo_check
  CHECK (meses_devengo BETWEEN 1 AND 60);

COMMENT ON COLUMN golf.cat_cuotas_config.meses_devengo IS
  'Meses de resultado que absorbe cada cargo de esta cuota. 1 = se reconoce completo en su periodo. 12 = se reparte en 12 meses (ingreso diferido). Distinto de meses_aplicar, que es cuántos cargos se generan.';

-- La inscripción anual se devenga a lo largo del año (decisión del
-- usuario, 2026-09-20). Cambiar este valor es lo único que hace falta
-- para volver al reconocimiento en el mes de cargo.
UPDATE golf.cat_cuotas_config SET meses_devengo = 12 WHERE tipo = 'INSCRIPCION';

-- 2) Fraccionamiento — cuotas estándar por lote
-- Hoy todas son 'Mensual' (meses_devengo = 1). La columna queda lista
-- para cuando se cargue el histórico en ctrl.cargos y aparezcan cuotas
-- anuales o semestrales.
ALTER TABLE cfg.cuotas_estandar
  ADD COLUMN IF NOT EXISTS meses_devengo INTEGER NOT NULL DEFAULT 1;

ALTER TABLE cfg.cuotas_estandar
  DROP CONSTRAINT IF EXISTS cuotas_estandar_meses_devengo_check;
ALTER TABLE cfg.cuotas_estandar
  ADD CONSTRAINT cuotas_estandar_meses_devengo_check
  CHECK (meses_devengo BETWEEN 1 AND 60);

COMMENT ON COLUMN cfg.cuotas_estandar.meses_devengo IS
  'Meses de resultado que absorbe cada cargo de esta cuota. 1 = se reconoce completo en su periodo.';
