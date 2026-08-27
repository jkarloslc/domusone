-- Corrige 2 filas de ctrl.recibos_ingreso_conceptos contaminadas por un bug
-- real en el flujo Corte POS Golf → Recibo de Ingreso: al distribuir el
-- monto del corte por concepto, la consulta volvía a traer TODAS las ventas
-- del corte (golf.ctrl_ventas) sin filtrar status, incluyendo ventas ya
-- CANCELADAS — su monto terminaba sumado al concepto del producto vendido,
-- aunque el total del recibo (recibos_ingreso.monto_total) sí excluía
-- correctamente esa venta cancelada. Bug corregido en el código
-- (app/golf/pos/CorteModal.tsx, app/golf/pos/page.tsx,
-- app/golf/pos/distribucionIngreso.ts) — esta migración solo corrige el
-- histórico ya contaminado. Detectado y confirmado 2026-08-26.
--
-- Caso 1 — Recibo #133 (corte #128, Golf/Green Fees, 21-jul-2026): la venta
-- #415 ($2,400, "Green Fee 18 H. Lun a jue.") fue cancelada pero su monto
-- quedó sumado dentro del concepto "Green Fees". monto_total del recibo
-- ($4,800) ya era correcto — solo se corrige el desglose por concepto.
--
-- Caso 2 — Recibo #179 (corte #169, Hípico, 5-ago-2026): la venta #562
-- ($20,000) fue cancelada pero su monto quedó sumado dentro del concepto
-- "Renta de Caballeriza". monto_total del recibo ($12,400) ya era correcto.

BEGIN;

UPDATE ctrl.recibos_ingreso_conceptos
SET monto = 4800.00
WHERE id = 167 AND id_recibo_fk = 133 AND id_concepto_fk = 20 AND monto = 7200;

UPDATE ctrl.recibos_ingreso_conceptos
SET monto = 12400.00
WHERE id = 266 AND id_recibo_fk = 179 AND id_concepto_fk = 33 AND monto = 32400;

COMMIT;
