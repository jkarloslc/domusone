-- ============================================================
-- Comparativo Presupuesto vs Real: Ingresos/Egresos sin IVA
-- ============================================================
-- El Comparativo (app/presupuestos/comparativo/page.tsx) comparaba
-- Presupuesto vs Real usando montos CON IVA. Se reconstruye para
-- que use subtotales (sin IVA) — mismo criterio que ya existe en
-- ordenes_pago (subtotal/iva, commit cb7fc54) para egresos.
--
-- Para ingresos por concepto (Golf/Hípico/Locales/Membresías/
-- Eventos/Polo — recibos_ingreso_conceptos) Y por sección
-- (Residencial — recibos_ingreso_secciones, sí causa IVA salvo casos
-- puntuales como la Cuota de Mantenimiento con iva_pct=0) no existía
-- ningún desglose: el monto llega con IVA incluido (desde
-- ctrl_ventas_det.total en el corte POS, o captura manual en
-- /ingresos). Se agrega subtotal/iva en ambas tablas, poblado desde
-- ahora en:
--   - app/golf/pos/distribucionIngreso.ts (dato real de ctrl_ventas_det,
--     solo aplica a recibos_ingreso_conceptos — el corte POS de Golf
--     no genera filas de recibos_ingreso_secciones)
--   - app/ingresos/page.tsx (mismo cálculo de 16% que ya usa calcFiscal()
--     para imprimir, ahora persistido, en ambas tablas)
--
-- Registros existentes quedan con subtotal=NULL — Comparativo hace
-- fallback al monto tal cual (decisión: no aproximar con /1.16 para
-- no distorsionar partidas exentas de IVA, ej. Nómina).
-- 2026-09-10
-- ============================================================

ALTER TABLE ctrl.recibos_ingreso_conceptos
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2),
  ADD COLUMN IF NOT EXISTS iva      numeric(14,2);

ALTER TABLE ctrl.recibos_ingreso_secciones
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2),
  ADD COLUMN IF NOT EXISTS iva      numeric(14,2);
