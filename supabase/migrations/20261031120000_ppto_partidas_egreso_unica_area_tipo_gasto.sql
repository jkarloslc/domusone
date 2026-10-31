-- Partidas de egreso únicas por (área, tipo de gasto)
--
-- Auditoría 2026-10-31: solo 2 pares duplicados activos, ambos creados el
-- 2026-10-09 sobre partidas originales de agosto. Ninguna de las 4 tiene
-- renglones en ppto_presupuesto_det, ppto_presupuesto_real_manual,
-- capex_insumos ni comp.flujo_version_lineas. Con fuente_real = 'op_area'
-- el Real de esas OP se contaba dos veces (una por partida).
--
--   Área Operacion Polo     · Electricidad → se conserva #104, se desactiva #533
--   Área Operacion Patron's · Nómina       → se conserva #228, se desactiva #532

UPDATE ctrl.ppto_partidas
   SET activo = false
 WHERE id IN (533, 532)
   AND tipo = 'egreso';

-- Candado: una sola partida de egreso activa por área + tipo de gasto.
-- Las partidas sin área o sin tipo de gasto (manuales, financieras sin
-- asignar) quedan fuera del índice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ppto_partidas_egreso_area_tipo_gasto
    ON ctrl.ppto_partidas (id_area_fk, id_tipo_gasto_fk)
 WHERE tipo = 'egreso'
   AND activo
   AND id_area_fk IS NOT NULL
   AND id_tipo_gasto_fk IS NOT NULL;
