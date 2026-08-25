-- Auditoría de integridad de ctrl.ppto_partidas (2026-08-22) contra datos
-- reales en Supabase. Ver memoria de sesión para el detalle completo del
-- diagnóstico; aquí solo las correcciones confirmadas con el usuario.

BEGIN;

-- ── 1) Reconstruye cfg.conceptos_ingreso — la tabla estaba VACÍA (0 filas)
-- aunque 26 partidas (ctrl.ppto_partidas.id_concepto_fk) y 295 recibos
-- (ctrl.recibos_ingreso_conceptos.id_concepto_fk, $15,044,607 acumulados)
-- seguían apuntando consistentemente a estos mismos IDs entre sí — el
-- dinero se sigue contando bien, pero el catálogo administrable no
-- existía (dropdown de "Concepto de Ingreso" vacío al crear una partida,
-- nombre en blanco en cualquier pantalla que lo muestre). Nombres
-- reconstruidos a partir del nombre de la partida que ya usa cada ID
-- (confirmados con el usuario). id_centro_ingreso_fk se deja NULL
-- (aplica a cualquier centro) por no tener forma de reconstruirlo con
-- certeza.
INSERT INTO cfg.conceptos_ingreso (id, nombre, activo) VALUES
  (1,  'Ingresos pendientes de identificar', true),
  (2,  'Autorización / Revisión de Proyectos', true),
  (3,  'Deslindes', true),
  (4,  'Tag''s', true),
  (5,  'Intereses', true),
  (6,  'Otros Servicios', true),
  (16, 'Inscripciones', true),
  (17, 'Membresías', true),
  (18, 'Pensión', true),
  (19, 'Operación Tee de Práctica', true),
  (20, 'Green Fees', true),
  (21, 'Fee AyB La Práctica', true),
  (22, 'Torneos', true),
  (23, 'Otros', true),
  (24, 'Renta Cancha Fut Bol', true),
  (25, 'Renta Casa Balvanera', true),
  (26, 'Fee AyB Casa Balvanera', true),
  (28, 'Renta La Rambla', true),
  (29, 'Servicio de Mantenimiento', true),
  (30, 'Renta Carpa Carritos', true),
  (31, 'Fee Carritos', true),
  (33, 'Renta Caballerizas', true),
  (34, 'Renta de Salón', true),
  (35, 'Renta Villa 01 A', true),
  (36, 'Depósitos en Garantía y Fianzas', true),
  (37, 'Eventos Ecuestres', true)
ON CONFLICT (id) DO NOTHING;

-- La tabla usa id SERIAL — como se insertaron IDs explícitos, hay que
-- adelantar la secuencia para que el próximo alta desde /catalogos no
-- choque con estos.
SELECT setval(
  pg_get_serial_sequence('cfg.conceptos_ingreso', 'id'),
  (SELECT MAX(id) FROM cfg.conceptos_ingreso)
);

-- ── 2) Desactiva partida duplicada — #105 y #144 son la MISMA combinación
-- (Golf / Operación Golf / tipo_gasto "Otros"), creadas un día de
-- diferencia; cualquier OP de esa área+tipo se sumaba en las dos,
-- duplicando el monto en Total Egresos de Golf. #105 tiene $1,500,000 de
-- presupuesto ya capturado en los 12 meses; #144 tiene $0 → se desactiva
-- #144.
UPDATE ctrl.ppto_partidas SET activo = false WHERE id = 144;

-- ── 3) Desactiva partidas huérfanas — apuntan a áreas que ya no existen
-- en cfg.areas (#278 → área 19 "Mantto. Windsor Court", eliminada) o que
-- eran un placeholder sin uso real (#161 → área 34, literalmente
-- "/revisar)"). Ninguna de las dos tiene presupuesto capturado ni OPs
-- reales — sin impacto financiero, solo limpieza de catálogo.
UPDATE ctrl.ppto_partidas SET activo = false WHERE id IN (278, 161);

COMMIT;
