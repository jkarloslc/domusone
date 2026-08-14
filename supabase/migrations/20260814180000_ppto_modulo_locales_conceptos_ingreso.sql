-- Auditoría de proceso completa del módulo Presupuestos (2026-08-14): el
-- lado de ingresos por SECCIÓN estaba 100% cubierto, pero por CONCEPTO
-- tenía un hueco de $340,825.69 MXN en recibos_ingreso ya Confirmados —
-- los 7 conceptos pertenecen a id_centro_ingreso_fk=3 ("Locales
-- Comerciales"), un módulo que, igual que Patron's el día anterior, nunca
-- se dio de alta en Presupuestos (no está en MODULOS, no tiene
-- ppto_presupuestos). Fix de código en app/presupuestos/captura/page.tsx
-- y app/presupuestos/partidas/page.tsx (agrega 'Locales' a MODULOS/
-- MODULO_COLOR) va en un commit aparte; esta migración crea el
-- presupuesto y las partidas que activan la cobertura.

BEGIN;

INSERT INTO ctrl.ppto_presupuestos (anio, nombre, status, modulo)
VALUES (2026, 'Anual Locales 2026', 'borrador', 'Locales');

INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, id_centro_ingreso_fk, id_concepto_fk, orden, activo, fuente_real, modulo, incluir_presupuesto, incluir_flujo)
VALUES
  ('Renta Casa Balvanera',     'ingreso', 3, 25, 1, true, 'concepto', 'Locales', true, true),
  ('Fee AyB Casa Balvanera',   'ingreso', 3, 26, 2, true, 'concepto', 'Locales', true, true),
  ('Renta La Rambla',          'ingreso', 3, 28, 3, true, 'concepto', 'Locales', true, true),
  ('Servicio de Mantenimiento','ingreso', 3, 29, 4, true, 'concepto', 'Locales', true, true),
  ('Renta Carpa Carritos',     'ingreso', 3, 30, 5, true, 'concepto', 'Locales', true, true),
  ('Fee Carritos',             'ingreso', 3, 31, 6, true, 'concepto', 'Locales', true, true),
  ('Renta Villa 01 A',         'ingreso', 3, 35, 7, true, 'concepto', 'Locales', true, true);

-- Cierre de un residuo chico del lado de egresos, detectado en el mismo
-- corte: 1 OP nueva ($4,900 MXN) con tipo_gasto='Comisiones Bancarias' en
-- área 45 (Operaciones Hospitality) que ya no tenía partida específica —
-- apareció después del corte del 2026-08-14 que formalizó las otras 77
-- combinaciones área+tipo_gasto (ver project_ppto_categorias_sin_partida_masivo).
INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, id_centro_costo_fk, id_area_fk, orden, activo, fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo)
VALUES
  ('Comisiones Bancarias [Operaciones Hospitality]', 'egreso', 7, 45, 4, true, 'op_area', 'Comisiones Bancarias', 'Eventos', true, true);

COMMIT;
