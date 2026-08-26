-- Elimina el mecanismo de "catch-all" (partida con tipo_gasto = NULL) en
-- egresos de Presupuestos. A partir de ahora la partida "Otros Gastos"
-- (tipo_gasto = 'Otros') de cada área es el único comodín — el código de
-- app/presupuestos/{comparativo,flujo,dashboard}/page.tsx ya se actualizó
-- para tratar tipo_gasto='Otros' como comodín (ver lib/pptoComodin.ts).
--
-- Contexto: la auditoría de mapeo partidas↔tipos_gasto del 2026-08-26
-- encontró que 21 áreas tenían DOS partidas comodín activas a la vez
-- (una "Otros Gastos" preexistente + un catch-all NULL creado en el fix
-- del 2026-08-24 para tapar el hueco de esas áreas) y otras 23 áreas
-- (las más antiguas del sistema) solo tenían el catch-all NULL original,
-- sin partida "Otros" — inconsistencia de diseño entre áreas viejas y
-- nuevas. Se unifica todo a un solo patrón: SIEMPRE "Otros Gastos" /
-- tipo_gasto='Otros', nunca NULL.

BEGIN;

-- ── 1) Convierte los 23 catch-all NULL originales (las áreas más antiguas,
-- que nunca tuvieron partida "Otros" separada) a tipo_gasto='Otros'. Se
-- actualiza la MISMA fila (no se borra ni se recrea) para conservar su
-- historial de presupuesto ya capturado en ppto_presupuesto_det — en
-- particular #84 "Campo de Golf" tiene los 12 meses de 2026 capturados.
UPDATE ctrl.ppto_partidas
SET tipo_gasto = 'Otros', nombre = 'Otros Gastos', id_agrupador_fk = 4
WHERE id IN (84, 459, 20, 37, 21, 22, 23, 24, 25, 26, 27, 28, 29, 32, 31, 33, 34, 35, 36, 38, 90, 19, 30)
  AND tipo_gasto IS NULL;

-- ── 2) Desactiva los 21 catch-all NULL creados el 2026-08-24 — quedaron
-- redundantes porque esas 21 áreas ya tenían su propia partida "Otros
-- Gastos" desde antes. Confirmado sin presupuesto capturado (se crearon
-- hace 2 días, nadie alcanzó a capturarles nada).
UPDATE ctrl.ppto_partidas
SET activo = false
WHERE id IN (476, 475, 465, 468, 460, 478, 254, 479, 477, 461, 467, 473, 474, 466, 462, 470, 471, 472, 463, 464, 469)
  AND tipo_gasto IS NULL;

-- ── 3) Alta de 32 partidas específicas nuevas — cubren las combinaciones
-- área+tipo_gasto con gasto real detectadas en la auditoría que hoy caen
-- al comodín "Otros" de su área en vez de tener su propio desglose
-- ($607,669.84 acumulados). Agrupador tomado del más usado para ese mismo
-- tipo_gasto en el resto del sistema.
INSERT INTO ctrl.ppto_partidas
  (nombre, descripcion, tipo, id_centro_costo_fk, id_area_fk, orden, activo,
   fuente_real, tipo_gasto, modulo, incluir_presupuesto, incluir_flujo,
   id_agrupador_fk, clasificacion)
VALUES
  ('Desazolves',                              'Egreso Mantenimiento Mantto. Agaves',              'egreso', 1, 1,  4,  true, 'op_area', 'Desazolves',                              'Mantenimiento', true, true, 6,  'operativo'),
  ('Pipas de Agua',                           'Egreso Mantenimiento Mantto. Agaves',              'egreso', 1, 1,  5,  true, 'op_area', 'Pipas de Agua',                           'Mantenimiento', true, true, 6,  'operativo'),
  ('Depósitos en Garantía (Fianzas)',         'Egreso Mantenimiento Mantto. Agaves',              'egreso', 1, 1,  6,  true, 'op_area', 'Depósitos en Garantía (Fianzas)',         'Mantenimiento', true, true, 4,  'operativo'),
  ('Mantto. de Vehículos y Maquinaria',       'Egreso Mantenimiento Mantto. Panorámica',          'egreso', 1, 2,  13, true, 'op_area', 'Mantto. de Vehículos y Maquinaria',       'Mantenimiento', true, true, 6,  'operativo'),
  ('Mantto. de Vehículos y Maquinaria',       'Egreso Mantenimiento Mantto. Palermo Balvanera',   'egreso', 1, 5,  10, true, 'op_area', 'Mantto. de Vehículos y Maquinaria',       'Mantenimiento', true, true, 6,  'operativo'),
  ('Desazolves',                              'Egreso Mantenimiento Mantto. Palermo Balvanera',   'egreso', 1, 5,  11, true, 'op_area', 'Desazolves',                              'Mantenimiento', true, true, 6,  'operativo'),
  ('Pipas de Agua',                           'Egreso Mantenimiento Mantto. Privada Palermo',     'egreso', 1, 7,  14, true, 'op_area', 'Pipas de Agua',                           'Mantenimiento', true, true, 6,  'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Mantenimiento Mantto. Palermo Soho',     'egreso', 1, 8,  12, true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Mantenimiento', true, true, 6, 'operativo'),
  ('Mantto. de Equipo en Gral',               'Egreso Mantenimiento Mantto. South Hill',          'egreso', 1, 9,  15, true, 'op_area', 'Mantto. de Equipo en Gral',               'Mantenimiento', true, true, 6,  'operativo'),
  ('Compra Maquinaria y Equipo',              'Egreso Mantenimiento Mantto. South Hill',          'egreso', 1, 9,  16, true, 'op_area', 'Compra Maquinaria y Equipo',              'Mantenimiento', true, true, 6,  'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Mantenimiento Mantto. Fundadores',       'egreso', 1, 11, 8,  true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Mantenimiento', true, true, 6, 'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Mantenimiento Mantto. Cordillera II',    'egreso', 1, 15, 5,  true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Mantenimiento', true, true, 6, 'operativo'),
  ('Desazolves',                              'Egreso Mantenimiento Mantto. Fairway VIP',         'egreso', 1, 16, 7,  true, 'op_area', 'Desazolves',                              'Mantenimiento', true, true, 6,  'operativo'),
  ('Renta de Mobiliario y Equipo',            'Egreso Mantenimiento Mantto. Circuito Balvanera',  'egreso', 1, 22, 20, true, 'op_area', 'Renta de Mobiliario y Equipo',            'Mantenimiento', true, true, 4,  'operativo'),
  ('Mantto. de Vehículos y Maquinaria',       'Egreso Mantenimiento Mantto. Circuito Balvanera',  'egreso', 1, 22, 21, true, 'op_area', 'Mantto. de Vehículos y Maquinaria',       'Mantenimiento', true, true, 6,  'operativo'),
  ('Pagos a Personal Externo',                'Egreso Mantenimiento Mantto. Circuito Balvanera',  'egreso', 1, 22, 22, true, 'op_area', 'Pagos a Personal Externo',                'Mantenimiento', true, true, 10, 'operativo'),
  ('Desazolves',                              'Egreso Mantenimiento Mantto. Circuito Balvanera',  'egreso', 1, 22, 23, true, 'op_area', 'Desazolves',                              'Mantenimiento', true, true, 6,  'operativo'),
  ('Limpieza y Suministros',                  'Egreso Patron''s Casa Azul',                       'egreso', 5, 33, 4,  true, 'op_area', 'Limpieza y Suministros',                  'Patron''s',     true, true, 6,  'operativo'),
  ('Mantto. de Vehículos y Maquinaria',       'Egreso Mantenimiento Vigilancia',                  'egreso', 1, 36, 27, true, 'op_area', 'Mantto. de Vehículos y Maquinaria',       'Mantenimiento', true, true, 6,  'operativo'),
  ('Agua en Garrafón',                        'Egreso Mantenimiento Vigilancia',                  'egreso', 1, 36, 28, true, 'op_area', 'Agua en Garrafón',                        'Mantenimiento', true, true, 6,  'operativo'),
  ('Renta de Mobiliario y Equipo',            'Egreso Mantenimiento Vigilancia',                  'egreso', 1, 36, 29, true, 'op_area', 'Renta de Mobiliario y Equipo',            'Mantenimiento', true, true, 4,  'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Mantenimiento Vigilancia',                'egreso', 1, 36, 30, true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Mantenimiento', true, true, 6, 'operativo'),
  ('Equipo de Computo y Tecnología',          'Egreso Mantenimiento Vigilancia',                  'egreso', 1, 36, 31, true, 'op_area', 'Equipo de Computo y Tecnología',          'Mantenimiento', true, true, 6,  'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Patron''s Casa 1 Cerro Pelón',            'egreso', 5, 37, 5,  true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Patron''s',     true, true, 6, 'operativo'),
  ('Publicidad y Utilitarios',                'Egreso Patron''s Operacion Patron''s',             'egreso', 5, 42, 8,  true, 'op_area', 'Publicidad y Utilitarios',                'Patron''s',     true, true, 6,  'operativo'),
  ('Mantto. de Equipo en Gral',               'Egreso Patron''s Villa 7 B',                       'egreso', 5, 46, 7,  true, 'op_area', 'Mantto. de Equipo en Gral',               'Patron''s',     true, true, 6,  'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Patron''s Villa 1 B',                     'egreso', 5, 47, 8,  true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Patron''s',     true, true, 6, 'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Patron''s Villa 6 A',                     'egreso', 5, 48, 9,  true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Patron''s',     true, true, 6, 'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Patron''s Casa Patron''s',                'egreso', 5, 50, 11, true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Patron''s',     true, true, 6, 'operativo'),
  ('Pagos a Personal Externo',                'Egreso Patron''s Casa Patron''s',                  'egreso', 5, 50, 12, true, 'op_area', 'Pagos a Personal Externo',                'Patron''s',     true, true, 10, 'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Mantenimiento Mantto. South Hill Fairway', 'egreso', 1, 51, 16, true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Mantenimiento', true, true, 6, 'operativo'),
  ('Mantto. de Instalaciones e Infraestructura', 'Egreso Mantenimiento Acceso Zona Norte',         'egreso', 1, 52, 5,  true, 'op_area', 'Mantto. de Instalaciones e Infraestructura', 'Mantenimiento', true, true, 6, 'operativo');

COMMIT;
