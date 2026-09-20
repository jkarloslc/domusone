-- ════════════════════════════════════════════════════════════════
-- Presupuesto de dos series: cobro esperado y devengado esperado
-- Migración: 20260920200000
-- ════════════════════════════════════════════════════════════════
--
-- PROBLEMA
-- Hoy `ppto_presupuesto_det.monto` es una sola serie, y los dos
-- módulos que la consumen necesitan cosas distintas:
--
--   /presupuestos/flujo        compara COBRO esperado vs cobro real
--   /presupuestos/comparativo  mide el área mes a mes → DEVENGADO
--
-- Hoy los dos leen el mismo `monto` y solo se diferencian por
-- incluir_flujo / incluir_presupuesto. Con cobranza anualizada eso no
-- puede funcionar: el cobro esperado de enero lleva el pico de los
-- pagos anuales y el devengado esperado es plano. Una sola cifra no
-- puede ser las dos.
--
-- POR QUÉ SE AGREGA `monto_devengado` Y NO `monto_cobro`
-- El usuario confirmó (2026-09-20) que el presupuesto 2026 ya
-- capturado ES cobro esperado. Así que `monto` ya tiene la semántica
-- correcta para el Flujo: agregar la serie nueva del lado del
-- devengado deja intacto lo capturado, no migra ni un registro y no
-- toca /presupuestos/flujo. La alternativa (renombrar `monto` a
-- `monto_cobro` y estrenar `monto` como devengado) habría invertido
-- el significado de 7 presupuestos ya capturados.
--
-- SEMÁNTICA
-- NULL = devengado esperado no capturado. El Comparativo cae a
-- `monto` para no quedarse en blanco, pero lo MARCA en pantalla y
-- cuenta cuántas partidas están así — el mismo criterio que ya se usó
-- con subtotal/IVA en recibos (migración 20260910130000): degradar
-- visible, nunca en silencio.
--
-- Solo aplica a partidas de ingreso con cobranza por cuotas. Para
-- egresos la distinción cobro/devengado no cambia nada relevante hoy
-- (la OP ya se registra por fecha_op), así que quedan con NULL y
-- siguen comparando contra `monto`.
-- 2026-09-20
-- ════════════════════════════════════════════════════════════════

ALTER TABLE ctrl.ppto_presupuesto_det
  ADD COLUMN IF NOT EXISTS monto_devengado numeric(14,2);

COMMENT ON COLUMN ctrl.ppto_presupuesto_det.monto IS
  'Cobro esperado del mes (base caja). Lo consume /presupuestos/flujo. Es la serie que ya estaba capturada antes de 2026-09-20.';

COMMENT ON COLUMN ctrl.ppto_presupuesto_det.monto_devengado IS
  'Devengado esperado del mes (base de medición del área). Lo consume /presupuestos/comparativo. NULL = no capturado; el Comparativo cae a monto y lo marca en pantalla.';

-- Los reportes preguntan "¿cuántas partidas tienen devengado capturado?"
CREATE INDEX IF NOT EXISTS idx_ppto_det_devengado_capturado
  ON ctrl.ppto_presupuesto_det (id_presupuesto_fk)
  WHERE monto_devengado IS NOT NULL;
