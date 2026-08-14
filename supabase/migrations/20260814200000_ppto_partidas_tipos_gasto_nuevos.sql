-- Nuevos tipo_gasto en el catálogo de Órdenes de Pago (Desazolves, Pagos a
-- Personal, Mantenimiento de Vehículos) + su partida presupuestal en el
-- área "Admón./General" de cada uno de los 6 módulos con Centro de Costo
-- (Locales no tiene CC, solo ingresos — sin partidas de egreso aquí) —
-- mismo criterio ya usado para Seguros/Comisiones Bancarias/Intercompañías:
-- gasto a nivel módulo, no replicado por cada área operativa.

BEGIN;

INSERT INTO ctrl.ppto_partidas
  (nombre, tipo, id_centro_costo_fk, id_area_fk, orden, activo, fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo)
VALUES
  -- Golf (CC 2, Admón. Golf = área 39)
  ('Desazolves [Admón. Golf]',                    'egreso', 2, 39, 5, true, 'op_area', 'Desazolves', 'Golf', true, true),
  ('Pagos a Personal [Admón. Golf]',               'egreso', 2, 39, 5, true, 'op_area', 'Pagos a Personal', 'Golf', true, true),
  ('Mantenimiento de Vehículos [Admón. Golf]',     'egreso', 2, 39, 5, true, 'op_area', 'Mantenimiento de Vehículos', 'Golf', true, true),

  -- Mantenimiento (CC 1, Admón. Mantto Residencial = área 21)
  ('Desazolves [Admón. Mantto. Res.]',                'egreso', 1, 21, 5, true, 'op_area', 'Desazolves', 'Mantenimiento', true, true),
  ('Pagos a Personal [Admón. Mantto. Res.]',           'egreso', 1, 21, 5, true, 'op_area', 'Pagos a Personal', 'Mantenimiento', true, true),
  ('Mantenimiento de Vehículos [Admón. Mantto. Res.]', 'egreso', 1, 21, 5, true, 'op_area', 'Mantenimiento de Vehículos', 'Mantenimiento', true, true),

  -- Hípico (CC 3, Admón. Hípico = área 40)
  ('Desazolves [Hípico]',                    'egreso', 3, 40, 5, true, 'op_area', 'Desazolves', 'Hípico', true, true),
  ('Pagos a Personal [Hípico]',               'egreso', 3, 40, 5, true, 'op_area', 'Pagos a Personal', 'Hípico', true, true),
  ('Mantenimiento de Vehículos [Hípico]',     'egreso', 3, 40, 5, true, 'op_area', 'Mantenimiento de Vehículos', 'Hípico', true, true),

  -- Polo (CC 4, Admon. Polo = área 41)
  ('Desazolves [Polo]',                    'egreso', 4, 41, 5, true, 'op_area', 'Desazolves', 'Polo', true, true),
  ('Pagos a Personal [Polo]',               'egreso', 4, 41, 5, true, 'op_area', 'Pagos a Personal', 'Polo', true, true),
  ('Mantenimiento de Vehículos [Polo]',     'egreso', 4, 41, 5, true, 'op_area', 'Mantenimiento de Vehículos', 'Polo', true, true),

  -- Eventos (CC 7, Operaciones Hospitality = área 45)
  ('Desazolves [Eventos]',                    'egreso', 7, 45, 5, true, 'op_area', 'Desazolves', 'Eventos', true, true),
  ('Pagos a Personal [Eventos]',               'egreso', 7, 45, 5, true, 'op_area', 'Pagos a Personal', 'Eventos', true, true),
  ('Mantenimiento de Vehículos [Eventos]',     'egreso', 7, 45, 5, true, 'op_area', 'Mantenimiento de Vehículos', 'Eventos', true, true),

  -- Patron's (CC 5, Admón. Patron's = área 42)
  ('Desazolves [Patron''s]',                    'egreso', 5, 42, 5, true, 'op_area', 'Desazolves', 'Patron''s', true, true),
  ('Pagos a Personal [Patron''s]',               'egreso', 5, 42, 5, true, 'op_area', 'Pagos a Personal', 'Patron''s', true, true),
  ('Mantenimiento de Vehículos [Patron''s]',     'egreso', 5, 42, 5, true, 'op_area', 'Mantenimiento de Vehículos', 'Patron''s', true, true);

COMMIT;
