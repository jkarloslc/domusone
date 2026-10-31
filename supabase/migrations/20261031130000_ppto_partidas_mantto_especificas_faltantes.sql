-- Partidas específicas faltantes en áreas de Mantto. Residencial
--
-- Auditoría 2026-10-31: 13 combinaciones (área, tipo de gasto) con OP en 2026
-- (encabezado + líneas distribuidas) sin partida propia en su área, por lo
-- que su Real caía en "Otros Gastos" de esa área (~$93k). La partida del
-- tipo existía, pero en otra área (casi siempre Operación Mantto Residencial).
--
-- Cada partida nueva copia nombre, agrupador, orden, IVA e incluir_flujo de
-- la partida de Mantenimiento más antigua del mismo tipo de gasto (molde), y
-- toma el CC del área. Arrancan sin presupuesto capturado ($0).
-- Respeta ux_ppto_partidas_egreso_area_tipo_gasto (NOT EXISTS).

WITH faltantes(id_area_fk, id_tipo_gasto_fk) AS (VALUES
  (52, 54),  -- Acceso Zona Norte        · Construcción, Ferretería y Pinturas
  ( 1,  3),  -- Mantto. Agaves           · Asesoría
  ( 1,  6),  -- Mantto. Agaves           · Combustible
  ( 1, 56),  -- Mantto. Agaves           · Limpieza y Suministros
  ( 3, 54),  -- Mantto. Fairway          · Construcción, Ferretería y Pinturas
  ( 3, 59),  -- Mantto. Fairway          · Refacciones
  (16, 54),  -- Mantto. Fairway VIP      · Construcción, Ferretería y Pinturas
  ( 7, 53),  -- Mantto. Privada Palermo  · Agroquímicos
  ( 9, 54),  -- Mantto. South Hill       · Construcción, Ferretería y Pinturas
  (18,  9),  -- Mantto. Villas Balvanera · Electricidad
  ( 4, 54),  -- Mantto. Windsor          · Construcción, Ferretería y Pinturas
  (36, 26),  -- Vigilancia               · Pagos a Personal Externo
  (36, 59)   -- Vigilancia               · Refacciones
), molde AS (
  SELECT DISTINCT ON (id_tipo_gasto_fk)
         id_tipo_gasto_fk, nombre, id_agrupador_fk, orden, iva_pct, incluir_flujo
    FROM ctrl.ppto_partidas
   WHERE modulo = 'Mantenimiento' AND tipo = 'egreso' AND activo
     AND id_tipo_gasto_fk IN (SELECT id_tipo_gasto_fk FROM faltantes)
   ORDER BY id_tipo_gasto_fk, id
)
INSERT INTO ctrl.ppto_partidas
  (nombre, descripcion, tipo, modulo, fuente_real, clasificacion,
   id_centro_costo_fk, id_area_fk, id_tipo_gasto_fk, tipo_gasto,
   id_agrupador_fk, orden, iva_pct, incluir_presupuesto, incluir_flujo,
   devengado_igual_a_cobro, activo)
SELECT m.nombre, 'Egreso Mantenimiento ' || a.nombre, 'egreso', 'Mantenimiento', 'op_area', 'operativo',
       a.id_centro_costo_fk, f.id_area_fk, f.id_tipo_gasto_fk, t.nombre,
       m.id_agrupador_fk, m.orden, m.iva_pct, true, m.incluir_flujo,
       false, true
  FROM faltantes f
  JOIN cfg.areas       a ON a.id = f.id_area_fk
  JOIN cfg.tipos_gasto t ON t.id = f.id_tipo_gasto_fk
  JOIN molde           m ON m.id_tipo_gasto_fk = f.id_tipo_gasto_fk
 WHERE NOT EXISTS (
   SELECT 1 FROM ctrl.ppto_partidas x
    WHERE x.tipo = 'egreso' AND x.activo
      AND x.id_area_fk = f.id_area_fk AND x.id_tipo_gasto_fk = f.id_tipo_gasto_fk
 );
