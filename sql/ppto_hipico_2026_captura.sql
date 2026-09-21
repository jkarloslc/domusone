-- ================================================================
-- Presupuesto 2026 de Hípico (id 5) — captura inicial
-- ================================================================
--
-- El presupuesto existe desde 2026-07-30 pero estaba en CERO celdas, mientras
-- el módulo ya genera ingreso real. Sin celdas, el Comparativo y el Flujo
-- muestran a Hípico sin nada contra qué medirse.
--
-- Las dos series se capturan con el MISMO valor (monto = cobro esperado,
-- monto_devengado = devengado esperado). La renta de caballeriza es mensual y
-- se cobra dentro del mes, así que caja y devengo casi coinciden; es el mismo
-- criterio que se usó en Eventos, Polo y Locales.
--
-- TODO en importes SIN IVA: así compara el Comparativo (ver migración
-- 20260910130000 y lib/cobranzaCuotas.ts).
--
-- DE DÓNDE SALE CADA NÚMERO (nada es inventado):
--
--  · Renta de Caballerizas (partida 91) — devengado real de hip.cxc_hip por
--    periodo, sin IVA al 16% (concepto 33, tasa del producto POS 13).
--    DECISIÓN DEL USUARIO: espejo del real, no capacidad plena. Ojo: los
--    216,800/mes de jul-dic son la operación completa (70 caballerizas ×
--    3,100) y los montos bajos de ene-jun son carga parcial de cartera
--    anterior al arranque (arranque_cobranza_hipico = 2026-07-01), no una
--    caída del negocio. Si algún día se quiere presupuestar a capacidad, el
--    número plano es 186,896.55 sin IVA.
--
--  · Eventos Ecuestres (partida 100) — espejo del único recibo real del año
--    (70,000 sin IVA en agosto). No hay subcuenta ni histórico del cual sacar
--    una forma; queda como marcador para que la partida no aparezca sin
--    capturar.
--
--  · Egresos (51 partidas op_area) — promedio mensual de los 6 meses con
--    operación real (abr-sep 2026) extendido a 12. El reparto por partida
--    replica EXACTAMENTE el mapeo del Comparativo (área + tipo_gasto, con la
--    partida comodín "Otros" absorbiendo lo que no cubre una específica, y las
--    OP distribuidas por ordenes_pago_det sumadas por su propia área), así que
--    presupuesto y real se leen sobre la misma base. Verificado: la suma por
--    partida da 548,247.22, idéntica al total de OP del CC 3 sin IVA — sin
--    doble conteo ni fugas.
--
--  · Intercompañías RBA / OOB / BPCC (113, 123, 133) — fuente_real 'manual' y
--    ctrl.ppto_presupuesto_real_manual está vacía: no hay de dónde derivar.
--    Se capturan en cero para que no salgan como "sin presupuesto".
--
-- Es una LÍNEA BASE derivada del comportamiento real, no una meta. Ajustar los
-- niveles encima es trabajo de quien presupuesta.
-- ================================================================

BEGIN;

-- Idempotente: re-correr esto reemplaza la captura completa del presupuesto 5.
DELETE FROM ctrl.ppto_presupuesto_det WHERE id_presupuesto_fk = 5;

-- ── 1. Renta de Caballerizas (partida 91) — perfil mensual de la cartera ──
INSERT INTO ctrl.ppto_presupuesto_det (id_presupuesto_fk, id_partida_fk, mes, monto, monto_devengado)
SELECT 5, v.pid, v.mes, v.monto, v.monto FROM (VALUES
    (91,  1,   64137.93),
    (91,  2,   66810.34),
    (91,  3,   66810.34),
    (91,  4,   56120.69),
    (91,  5,   74827.59),
    (91,  6,   45431.03),
    (91,  7,  174051.72),
    (91,  8,  184741.38),
    (91,  9,  186896.55),
    (91, 10,  186896.55),
    (91, 11,  186896.55),
    (91, 12,  186896.55)
) AS v(pid, mes, monto);

-- ── 2. Eventos Ecuestres (partida 100) — espejo del recibo real ──
INSERT INTO ctrl.ppto_presupuesto_det (id_presupuesto_fk, id_partida_fk, mes, monto, monto_devengado)
SELECT 5, v.pid, v.mes, v.monto, v.monto FROM (VALUES
    (100,  1,          0),
    (100,  2,          0),
    (100,  3,          0),
    (100,  4,          0),
    (100,  5,          0),
    (100,  6,          0),
    (100,  7,          0),
    (100,  8,      70000),
    (100,  9,          0),
    (100, 10,          0),
    (100, 11,          0),
    (100, 12,          0)
) AS v(pid, mes, monto);

-- ── 3. Egresos con gasto real — promedio abr-sep, plano los 12 meses ──
INSERT INTO ctrl.ppto_presupuesto_det (id_presupuesto_fk, id_partida_fk, mes, monto, monto_devengado)
SELECT 5, v.pid, m.mes, v.monto, v.monto
FROM (VALUES
    (182,   17397.62),   -- área 40 · Combustible
    (434,   16208.44),   -- área 29 · Pipas de Agua
    (187,   13262.87),   -- área 25 · Mantto. de Instalaciones e Infraestructura
    (186,    11716.5),   -- área 25 · Electricidad
    (102,    8091.91),   -- área 40 · Nómina Semanal
    (141,    7868.12),   -- área 25 · Otros
    (191,    4696.33),   -- área 29 · Electricidad
    (142,    4472.04),   -- área 26 · Otros
    (301,    3533.33),   -- área 40 · Pagos a Personal Externo
    (480,    1955.33),   -- área 25 · Desazolves
    (108,    1564.46),   -- área 40 · Otros
    (481,     372.56),   -- área 26 · Construcción, Ferreteria y Pinturas
    (428,     202.02),   -- área 25 · Gas LP
    (255,         19),   -- área 25 · Construcción, Ferreteria y Pinturas
    (143,         14)   -- área 29 · Otros
) AS v(pid, monto)
CROSS JOIN generate_series(1, 12) AS m(mes);

-- ── 4. El resto de las partidas activas del módulo, en cero ──
-- Así ninguna queda marcada como "sin presupuesto capturado", y si aparece un
-- gasto nuevo el Comparativo lo muestra como variación y no como hueco.
INSERT INTO ctrl.ppto_presupuesto_det (id_presupuesto_fk, id_partida_fk, mes, monto, monto_devengado)
SELECT 5, p.id, m.mes, 0, 0
FROM ctrl.ppto_partidas p
CROSS JOIN generate_series(1, 12) AS m(mes)
WHERE p.modulo = 'Hípico' AND p.activo = true
  AND NOT EXISTS (
    SELECT 1 FROM ctrl.ppto_presupuesto_det d
     WHERE d.id_presupuesto_fk = 5 AND d.id_partida_fk = p.id AND d.mes = m.mes);

-- ── Verificación ──
DO $$
DECLARE n_celdas int; n_part int; n_esp int; tot_ing numeric; tot_egr numeric;
BEGIN
  SELECT COUNT(*), COUNT(DISTINCT id_partida_fk) INTO n_celdas, n_part
    FROM ctrl.ppto_presupuesto_det WHERE id_presupuesto_fk = 5;
  SELECT COUNT(*) INTO n_esp
    FROM ctrl.ppto_partidas WHERE modulo = 'Hípico' AND activo = true;

  IF n_part <> n_esp OR n_celdas <> n_esp * 12 THEN
    RAISE EXCEPTION 'Se esperaban % partidas × 12 = % celdas; hay % partidas y % celdas',
      n_esp, n_esp * 12, n_part, n_celdas;
  END IF;
  IF EXISTS (SELECT 1 FROM ctrl.ppto_presupuesto_det
              WHERE id_presupuesto_fk = 5 AND monto_devengado IS DISTINCT FROM monto) THEN
    RAISE EXCEPTION 'Hay celdas con las dos series distintas; deberían ser iguales';
  END IF;

  SELECT COALESCE(SUM(d.monto), 0) INTO tot_ing
    FROM ctrl.ppto_presupuesto_det d JOIN ctrl.ppto_partidas p ON p.id = d.id_partida_fk
   WHERE d.id_presupuesto_fk = 5 AND p.tipo = 'ingreso';
  SELECT COALESCE(SUM(d.monto), 0) INTO tot_egr
    FROM ctrl.ppto_presupuesto_det d JOIN ctrl.ppto_partidas p ON p.id = d.id_partida_fk
   WHERE d.id_presupuesto_fk = 5 AND p.tipo = 'egreso';

  RAISE NOTICE 'Presupuesto 5: % celdas en % partidas. Ingreso %, egreso %, resultado %',
    n_celdas, n_part, round(tot_ing, 2), round(tot_egr, 2), round(tot_ing - tot_egr, 2);
END $$;

COMMIT;
