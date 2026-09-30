-- Partidas Financiero / Intercompañías son movimientos netos (bancarios): Flujo
-- no debe grosar su presupuesto con IVA. Decisión 2026-09-30.
UPDATE ctrl.ppto_partidas SET iva_pct = 0
 WHERE clasificacion IN ('financiero', 'intercompanias');
