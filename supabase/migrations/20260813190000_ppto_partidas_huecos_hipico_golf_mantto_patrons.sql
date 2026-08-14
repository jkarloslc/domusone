-- Cierra huecos de cobertura en ctrl.ppto_partidas: áreas operativas activas
-- (con OP reales pagadas) que no tenían NINGUNA partida (ni catch-all ni
-- específica), por lo que sus gastos eran invisibles en Comparativo,
-- Dashboard y Flujo de Efectivo de Presupuestos.
--
-- Contexto: la auditoría del 2026-08-13 (ver project_ppto_partidas_huecos_doble_conteo
-- en memoria) solo detectó huecos en áreas que YA tenían alguna partida
-- (agrupando partidas existentes por id_area_fk). Áreas con CERO partidas
-- no aparecían en ese método. Esta migración corrige ese punto ciego.
--
-- Patron's es un caso aparte: el centro de costo completo (9 áreas,
-- $285,333 MXN en 32 OP reales desde mayo 2026) nunca se dio de alta como
-- módulo de Presupuestos. Requiere también el cambio de código ya aplicado
-- en app/presupuestos/captura/page.tsx y app/presupuestos/partidas/page.tsx
-- (commit c0aafe4) para aparecer en el selector de módulos.

BEGIN;

-- ── Nuevo presupuesto anual para Patron's (2026, borrador) ────────────────
INSERT INTO ctrl.ppto_presupuestos (anio, nombre, status, modulo)
VALUES (2026, 'Anual Patron''s 2026', 'borrador', 'Patron''s');

-- ── Hípico (CC id 3) — áreas sin ninguna partida ───────────────────────────
INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, id_centro_costo_fk, id_area_fk, orden, activo, fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo)
VALUES
  ('Otros Gastos [Caballerizas]', 'egreso', 3, 25, 1, true, 'op_area', NULL, 'Hípico', true, true),
  ('Otros Gastos [Pistas]',       'egreso', 3, 26, 1, true, 'op_area', NULL, 'Hípico', true, true),
  ('Otros Gastos [Paddocks]',     'egreso', 3, 29, 1, true, 'op_area', NULL, 'Hípico', true, true);
-- Área 35 "(Revisar)" se deja fuera a propósito: 0 OPs históricas, parece un
-- área placeholder sin uso real. Revisar si conviene eliminarla del catálogo.

-- ── Golf (CC id 2) — áreas sin ninguna partida ─────────────────────────────
INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, id_centro_costo_fk, id_area_fk, orden, activo, fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo)
VALUES
  ('Otros Gastos [Golf - Por Clasificar]', 'egreso', 2, 34, 1, true, 'op_area', NULL, 'Golf', true, true),
  ('Otros Gastos [Cuadrilla]',             'egreso', 2, 43, 1, true, 'op_area', NULL, 'Golf', true, true),
  ('Otros Gastos [Tee de Práctica]',       'egreso', 2, 44, 1, true, 'op_area', NULL, 'Golf', true, true);
-- Área 34 se llama literalmente "/revisar)" en cfg.areas y ya tiene $11,542
-- en una OP real — igual que la 35 de Hípico, parece un área placeholder que
-- terminó recibiendo gasto real por error de captura. Vale la pena revisar
-- y, si aplica, reclasificar esa OP a un área real y limpiar el catálogo.

-- ── Mantenimiento Residencial (CC id 1) — áreas sin ninguna partida ───────
INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, id_centro_costo_fk, id_area_fk, orden, activo, fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo)
VALUES
  ('Otros Gastos [Windsor Court]',      'egreso', 1, 19, 1, true, 'op_area', NULL, 'Mantenimiento', true, true),
  ('Otros Gastos [Windsor Garden]',     'egreso', 1, 20, 1, true, 'op_area', NULL, 'Mantenimiento', true, true),
  ('Otros Gastos [Acceso Zona Norte]',  'egreso', 1, 52, 1, true, 'op_area', NULL, 'Mantenimiento', true, true),
  ('Otros Gastos [Acceso Zona Sur]',    'egreso', 1, 53, 1, true, 'op_area', NULL, 'Mantenimiento', true, true);

-- ── Patron's (CC id 5) — módulo nuevo, sin ninguna partida previa ─────────
INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, id_centro_costo_fk, id_area_fk, orden, activo, fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo)
VALUES
  ('Otros Gastos [Patron''s]',              'egreso', 5, 42, 1, true, 'op_area', NULL, 'Patron''s', true, true), -- Admón. Patron's
  ('Otros Gastos [Casa Azul]',              'egreso', 5, 33, 2, true, 'op_area', NULL, 'Patron''s', true, true),
  ('Otros Gastos [Casa 1 Cerro Pelón]',     'egreso', 5, 37, 3, true, 'op_area', NULL, 'Patron''s', true, true),
  ('Otros Gastos [Casa 2 Cerro Pelón]',     'egreso', 5, 38, 4, true, 'op_area', NULL, 'Patron''s', true, true),
  ('Otros Gastos [Villa 7 B]',              'egreso', 5, 46, 5, true, 'op_area', NULL, 'Patron''s', true, true),
  ('Otros Gastos [Villa 1 B]',              'egreso', 5, 47, 6, true, 'op_area', NULL, 'Patron''s', true, true),
  ('Otros Gastos [Villa 6 A]',              'egreso', 5, 48, 7, true, 'op_area', NULL, 'Patron''s', true, true),
  ('Otros Gastos [Casa Maria]',             'egreso', 5, 49, 8, true, 'op_area', NULL, 'Patron''s', true, true),
  ('Otros Gastos [Casa Patron''s]',         'egreso', 5, 50, 9, true, 'op_area', NULL, 'Patron''s', true, true);

COMMIT;
