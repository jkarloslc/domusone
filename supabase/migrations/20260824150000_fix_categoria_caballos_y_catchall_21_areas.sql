-- Auditoría de mapeo partidas ↔ tipos de gasto (2026-08-24). Dos hallazgos
-- reales corregidos aquí:
--
-- 1) comp.articulos.categoria = "Alimento para caballos" (minúscula) en 2
--    artículos no hacía match con el catálogo real "Alimento para Caballos"
--    (cfg.tipos_gasto), así que sus compras vía OC (~$105,600, 5 líneas de
--    OC, 4 de ellas en área Caballerizas) nunca podían atribuirse a ninguna
--    partida específica.
--
-- 2) 21 áreas activas no tenían partida catch-all (tipo_gasto = NULL). Como
--    el catch-all filtra por id_area_fk exacto, cualquier OP de esas áreas
--    con un tipo_gasto sin partida específica no aparecía en NINGÚN lado de
--    Real (ni partida específica ni catch-all) — se perdía del reporte.
--    Verificado contra datos reales: $749,317.53 de gasto histórico en esas
--    áreas no estaba capturado en ninguna partida.

BEGIN;

-- ── 1) Corrige categoría mal escrita ──
UPDATE comp.articulos
SET categoria = 'Alimento para Caballos'
WHERE categoria = 'Alimento para caballos';

-- ── 2) Alta de partida catch-all (tipo_gasto = NULL) para las 21 áreas sin
-- ninguna. Nombre = nombre del área (mismo patrón que los catch-all ya
-- existentes, ej. "Mantto. South Hill Fairway", "Vigilancia"). Agrupador =
-- "Gastos Variables" (id 6), igual que los catch-all no ligados a
-- mantenimiento de una propiedad residencial específica (Vigilancia,
-- Mantto. Campo De Golf, Polo). orden = siguiente disponible dentro de
-- cada área, para que aparezca al final de su lista.
INSERT INTO ctrl.ppto_partidas
  (nombre, descripcion, tipo, id_centro_costo_fk, id_area_fk, orden, activo,
   fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo,
   id_agrupador_fk, clasificacion)
VALUES
  ('Casa Club',                       'Egreso Golf Casa Club',                        'egreso', 2, 24, 4,  true, 'op_area', NULL, 'Golf',           true, true, 6, 'operativo'),
  ('Caballerizas',                    'Egreso Hípico Caballerizas',                   'egreso', 3, 25, 4,  true, 'op_area', NULL, 'Hípico',         true, true, 6, 'operativo'),
  ('Pistas',                          'Egreso Hípico Pistas',                         'egreso', 3, 26, 8,  true, 'op_area', NULL, 'Hípico',         true, true, 6, 'operativo'),
  ('Paddocks',                        'Egreso Hípico Paddocks',                       'egreso', 3, 29, 7,  true, 'op_area', NULL, 'Hípico',         true, true, 6, 'operativo'),
  ('Casa Azul',                       'Egreso Patron''s Casa Azul',                   'egreso', 5, 33, 3,  true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Casa 1 Cerro Pelón',              'Egreso Patron''s Casa 1 Cerro Pelón',          'egreso', 5, 37, 4,  true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Casa 2 Cerro Pelón',              'Egreso Patron''s Casa 2 Cerro Pelón',          'egreso', 5, 38, 5,  true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Tee de Practica',                 'Egreso Golf Tee de Practica',                  'egreso', 2, 44, 4,  true, 'op_area', NULL, 'Golf',           true, true, 6, 'operativo'),
  ('Cuadrilla',                       'Egreso Golf Cuadrilla',                        'egreso', 2, 43, 4,  true, 'op_area', NULL, 'Golf',           true, true, 6, 'operativo'),
  ('Villa 7 B',                       'Egreso Patron''s Villa 7 B',                   'egreso', 5, 46, 6,  true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Villa 1 B',                       'Egreso Patron''s Villa 1 B',                   'egreso', 5, 47, 7,  true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Villa 6 A',                       'Egreso Patron''s Villa 6 A',                   'egreso', 5, 48, 8,  true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Casa Maria',                      'Egreso Patron''s Casa Maria',                  'egreso', 5, 49, 9,  true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Casa Patron''s',                  'Egreso Patron''s Casa Patron''s',              'egreso', 5, 50, 10, true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Acceso Zona Norte',               'Egreso Mantenimiento Acceso Zona Norte',       'egreso', 1, 52, 4,  true, 'op_area', NULL, 'Mantenimiento',  true, true, 6, 'operativo'),
  ('Acceso Zona Sur',                 'Egreso Mantenimiento Acceso Zona Sur',         'egreso', 1, 53, 2,  true, 'op_area', NULL, 'Mantenimiento',  true, true, 6, 'operativo'),
  ('Operacion Golf',                  'Egreso Golf Operacion Golf',                   'egreso', 2, 39, 10, true, 'op_area', NULL, 'Golf',           true, true, 6, 'operativo'),
  ('Operación Hípico',                'Egreso Hípico Operación Hípico',               'egreso', 3, 40, 7,  true, 'op_area', NULL, 'Hípico',         true, true, 6, 'operativo'),
  ('Operacion Patron''s',             'Egreso Patron''s Operacion Patron''s',         'egreso', 5, 42, 7,  true, 'op_area', NULL, 'Patron''s',      true, true, 6, 'operativo'),
  ('Operación Mantto Residencial',    'Egreso Mantenimiento Operación Mantto Residencial', 'egreso', 1, 21, 26, true, 'op_area', NULL, 'Mantenimiento', true, true, 6, 'operativo'),
  ('Operación Eventos',               'Egreso Eventos Operación Eventos',             'egreso', 7, 45, 7,  true, 'op_area', NULL, 'Eventos',        true, true, 6, 'operativo');

COMMIT;
