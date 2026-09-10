-- ============================================================
-- Comparativo Presupuesto vs Real: Ingresos/Egresos sin IVA
-- ============================================================
-- El Comparativo (app/presupuestos/comparativo/page.tsx) comparaba
-- Presupuesto vs Real usando montos CON IVA. Se reconstruye para
-- que use subtotales (sin IVA) — mismo criterio que ya existe en
-- ordenes_pago (subtotal/iva, commit cb7fc54) para egresos.
--
-- Para ingresos por concepto (Golf/Hípico/Locales/Membresías/
-- Eventos/Polo — recibos_ingreso_conceptos) no existía ningún
-- desglose: el monto llega con IVA incluido (desde ctrl_ventas_det.total
-- en el corte POS, o captura manual en /ingresos). Se agrega
-- subtotal/iva aquí, poblado desde ahora en:
--   - app/golf/pos/distribucionIngreso.ts (dato real de ctrl_ventas_det)
--   - app/ingresos/page.tsx (mismo cálculo de 16% que ya usa calcFiscal()
--     para imprimir, ahora persistido)
--
-- Registros existentes quedan con subtotal=NULL — Comparativo hace
-- fallback al monto tal cual (decisión: no aproximar con /1.16 para
-- no distorsionar partidas exentas de IVA, ej. Nómina).
--
-- Nota: recibos_ingreso_secciones (Residencial) NO se toca — ese
-- centro no cobra IVA, así que su `monto` ya es sin IVA de origen.
-- 2026-09-10
-- ============================================================

ALTER TABLE ctrl.recibos_ingreso_conceptos
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2),
  ADD COLUMN IF NOT EXISTS iva      numeric(14,2);
