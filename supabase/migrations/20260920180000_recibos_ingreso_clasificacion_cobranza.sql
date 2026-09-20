-- ════════════════════════════════════════════════════════════════
-- Clasificación de cobranza en el recibo de ingreso (F2)
-- Migración: 20260920180000
-- ════════════════════════════════════════════════════════════════
--
-- PROBLEMA
-- Fraccionamiento es el 52% del ingreso ($17.6M en 2026) y entra como
-- recibos de ingreso capturados a mano ("Cobranza Global Enero 2026")
-- con desglose SOLO por sección: sin periodo, sin cargo, sin lote.
-- ctrl.cargos tiene 1 fila de prueba, así que la subcuenta de cuotas
-- no está en operación.
--
-- Consecuencia: para más de la mitad del ingreso, la clasificación
-- vencido / corriente / anticipado no es derivable por ningún camino,
-- y es justo la que se necesita para que el Comparativo y el Estado
-- de Resultados dejen de mezclar flujos.
--
-- SOLUCIÓN (puente, no destino)
-- Tres montos capturables por fila de desglose. No es la matriz
-- completa de periodos — eso sería imposible de capturar a mano para
-- 19 secciones × 12 meses — sino los tres agregados que el área de
-- cobranza sí conoce al armar la cobranza global del mes.
--
-- El destino sigue siendo F4: llevar Fraccionamiento a ctrl.cargos y
-- derivar el recibo de ingreso de la cobranza real, con lo que estas
-- tres columnas se vuelven redundantes (pero no estorban).
--
-- SEMÁNTICA
-- NULL en las tres = fila sin clasificar (todo el histórico previo).
-- La suma de las tres NO se fuerza a igualar `monto` con un CHECK, a
-- propósito:
--   · el histórico ya cargado quedaría en violación
--   · una captura parcial (se conoce el anticipado pero no el resto)
--     es información útil, no un error
--   · una edición intermedia de `monto` dejaría la fila bloqueada
-- La validación vive en la UI (app/ingresos/page.tsx), que en modo
-- clasificación DERIVA `monto` como la suma de las tres — así no
-- pueden descuadrar de entrada. Lo que no se clasifique aparece como
-- banda "Sin clasificar" en el reporte, visible en vez de silenciosa.
-- 2026-09-20
-- ════════════════════════════════════════════════════════════════

ALTER TABLE ctrl.recibos_ingreso_secciones
  ADD COLUMN IF NOT EXISTS monto_vencido    numeric(14,2),
  ADD COLUMN IF NOT EXISTS monto_corriente  numeric(14,2),
  ADD COLUMN IF NOT EXISTS monto_anticipado numeric(14,2);

ALTER TABLE ctrl.recibos_ingreso_conceptos
  ADD COLUMN IF NOT EXISTS monto_vencido    numeric(14,2),
  ADD COLUMN IF NOT EXISTS monto_corriente  numeric(14,2),
  ADD COLUMN IF NOT EXISTS monto_anticipado numeric(14,2);

COMMENT ON COLUMN ctrl.recibos_ingreso_secciones.monto_vencido IS
  'Parte del monto que corresponde a cuotas de periodos anteriores (recuperación de cartera). NULL = sin clasificar.';
COMMENT ON COLUMN ctrl.recibos_ingreso_secciones.monto_corriente IS
  'Parte del monto que corresponde a la cuota del propio mes del recibo (desempeño del mes). NULL = sin clasificar.';
COMMENT ON COLUMN ctrl.recibos_ingreso_secciones.monto_anticipado IS
  'Parte del monto que corresponde a cuotas de periodos futuros (pago anualizado). NULL = sin clasificar.';

COMMENT ON COLUMN ctrl.recibos_ingreso_conceptos.monto_vencido IS
  'Parte del monto que corresponde a cuotas de periodos anteriores (recuperación de cartera). NULL = sin clasificar.';
COMMENT ON COLUMN ctrl.recibos_ingreso_conceptos.monto_corriente IS
  'Parte del monto que corresponde a la cuota del propio mes del recibo (desempeño del mes). NULL = sin clasificar.';
COMMENT ON COLUMN ctrl.recibos_ingreso_conceptos.monto_anticipado IS
  'Parte del monto que corresponde a cuotas de periodos futuros (pago anualizado). NULL = sin clasificar.';

-- Índices parciales: los reportes filtran "filas ya clasificadas".
CREATE INDEX IF NOT EXISTS idx_recibos_ing_secciones_clasificadas
  ON ctrl.recibos_ingreso_secciones (id_recibo_fk)
  WHERE monto_corriente IS NOT NULL OR monto_vencido IS NOT NULL OR monto_anticipado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recibos_ing_conceptos_clasificadas
  ON ctrl.recibos_ingreso_conceptos (id_recibo_fk)
  WHERE monto_corriente IS NOT NULL OR monto_vencido IS NOT NULL OR monto_anticipado IS NOT NULL;
