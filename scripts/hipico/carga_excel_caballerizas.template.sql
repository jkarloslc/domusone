-- ════════════════════════════════════════════════════════════════
-- Hípico · Carga inicial de caballerizas desde Excel
-- "Caballerizas_por_mes_v2.xlsx" (Tablas Master, corte 31/10/2026)
-- Generada por scripts/hipico/carga_excel_caballerizas.cjs — NO editar a mano.
-- ════════════════════════════════════════════════════════════════
-- Qué hace (decisiones del usuario 2026-11-12):
--  1. Asignaciones históricas cerradas: Ricardo J25–J31, Sofia B4–B8,
--     Mariana J18–J19, Saúl Medina LS22.
--  2. Cuotas faltantes por censo (ene–oct): solo inserta n_excel − n_base
--     por (arrendatario, mes); nunca borra.
--  3. Rocío: cuotas ene–sep PENDIENTES de las 8 cortesías B29–B36.
--  4. Recibos de carga inicial RHI-2026-NNN (sin ticket POS) por cada
--     depósito ene–jun (excepto Rocío y German, ya cargados) + 04/07 Sofia
--     y 10/07 Mariana. Aplicación FIFO sobre las cuotas creadas aquí.
--  5. Ajustes jul–oct: reaplica pagos de cuotas que sobran (LS18/LS19 ago
--     de Saúl Medina → LS3/LS10; B20 ago de Jaime → B18 nov), cancela
--     cuotas que sobran, cierra asignaciones y recalcula status de
--     caballerizas. RH-2026-038/039 NO se tocan (ajuste manual).
--  6. Validación: saldos por arrendatario, totales y conteos; si algo no
--     cuadra → RAISE EXCEPTION (rollback de todo).
-- Idempotencia: si ya existen folios RHI-2026-* no hace nada (NOTICE y sale).
-- No crea tablas permanentes (solo TEMP) → no requiere GRANT.
-- ════════════════════════════════════════════════════════════════
DO $mig$
DECLARE
  v_dry      boolean := __DRY__;
  k_mes      text[]  := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  k_obs_rec  text    := 'Carga inicial · Tablas Master 2026 v2 (corte 31/10/2026)';
  k_obs_asig text    := 'Histórica · carga inicial Excel Caballerizas v2 (2026-11)';
  k_obs_cier text    := 'Cerrada por carga inicial Excel Caballerizas v2 (2026-11)';
  k_fp       text;
  r record; rs record; q record;
  v_per text; v_have int; v_need int; v_id int; v_rec int; v_n int := 0;
  v_rest numeric; v_apl numeric; v_cnt int; v_sum numeric; v_sum2 numeric;
  v_src record; v_dst record;
  v_err text := ''; v_rep text := '';
BEGIN
  -- ── 0. Idempotencia y catálogos ──────────────────────────────
  IF EXISTS (SELECT 1 FROM hip.recibos_hip WHERE folio LIKE 'RHI-2026-%') THEN
    RAISE NOTICE 'Carga inicial de caballerizas ya aplicada (existen folios RHI-2026-*): no se hace nada';
    RETURN;
  END IF;
  SELECT nombre INTO k_fp FROM cfg.formas_pago WHERE id = 3;
  IF k_fp IS NULL THEN RAISE EXCEPTION 'No existe cfg.formas_pago id 3 (transferencia)'; END IF;

  CREATE TEMP TABLE t_cen (a int, m int, n int, cuota numeric) ON COMMIT DROP;
  INSERT INTO t_cen VALUES
    __CEN__;
  CREATE TEMP TABLE t_dep (f date, monto numeric, a int) ON COMMIT DROP;
  INSERT INTO t_dep VALUES
    __DEP__;
  CREATE TEMP TABLE t_new    (id int, a int, kind text) ON COMMIT DROP;
  CREATE TEMP TABLE t_newrec (id int) ON COMMIT DROP;
  CREATE TEMP TABLE t_cab    (id int) ON COMMIT DROP;
  CREATE TEMP TABLE t_touch  (id int) ON COMMIT DROP;   -- cuotas existentes cuyo saldo se modifica

  SELECT sum(n * cuota) INTO v_sum FROM t_cen;
  IF v_sum <> 2054000 THEN RAISE EXCEPTION 'Censo × cuota del Excel = %, se esperaba 2,054,000', v_sum; END IF;
  SELECT count(*), sum(monto) INTO v_cnt, v_sum FROM t_dep;
  IF v_cnt <> 115 OR v_sum <> 1347500 THEN RAISE EXCEPTION 'Depósitos del Excel: % por %, se esperaba 115 por 1,347,500', v_cnt, v_sum; END IF;

  -- ── 1. Asignaciones históricas (cerradas) ────────────────────
  CREATE TEMP TABLE t_hist (a int, clave text, monto numeric) ON COMMIT DROP;
  INSERT INTO t_hist VALUES
    (5,'J25',2800),(5,'J26',2800),(5,'J27',2800),(5,'J28',2800),(5,'J29',2800),(5,'J30',2800),(5,'J31',2800),
    (11,'B4',3100),(11,'B5',3100),(11,'B6',3100),(11,'B7',3100),(11,'B8',3100),
    (12,'J18',3100),(12,'J19',3100),
    (4,'LS22',3100);
  IF EXISTS (SELECT 1 FROM t_hist h JOIN hip.cat_caballerizas cb ON cb.clave = h.clave
               JOIN hip.ctrl_asignaciones s ON s.id_caballeriza_fk = cb.id) THEN
    RAISE EXCEPTION 'Alguna caballeriza para asignación histórica ya tiene asignaciones';
  END IF;
  INSERT INTO hip.ctrl_asignaciones (id_arrendatario_fk, id_caballeriza_fk, fecha_inicio, fecha_fin, monto_mensual, dia_pago, activo, observaciones)
  SELECT h.a, cb.id, DATE '2026-01-01', DATE '2026-01-31', h.monto, 1, false, k_obs_asig
  FROM t_hist h JOIN hip.cat_caballerizas cb ON cb.clave = h.clave;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 15 THEN RAISE EXCEPTION 'Asignaciones históricas: % de 15 (falta alguna clave)', v_cnt; END IF;
  INSERT INTO t_cab SELECT cb.id FROM t_hist h JOIN hip.cat_caballerizas cb ON cb.clave = h.clave;
  v_rep := v_rep || format('asignaciones históricas: %s | ', v_cnt);

  -- ── 2. Orden de uso de asignaciones por arrendatario ─────────
  -- Activas primero (por fecha de inicio y clave natural), históricas al final.
  -- Las 8 cortesías de Rocío y B3 se manejan aparte.
  CREATE TEMP TABLE t_slot (asig int, a int, dia_pago int, ord int) ON COMMIT DROP;
  INSERT INTO t_slot
  SELECT s.id, s.id_arrendatario_fk, s.dia_pago,
         row_number() OVER (PARTITION BY s.id_arrendatario_fk
                            ORDER BY (s.observaciones IS NOT DISTINCT FROM k_obs_asig), s.fecha_inicio,
                                     regexp_replace(cb.clave, '\d+$', ''), coalesce(substring(cb.clave from '\d+$'), '0')::int)
  FROM hip.ctrl_asignaciones s JOIN hip.cat_caballerizas cb ON cb.id = s.id_caballeriza_fk
  WHERE (s.activo OR s.observaciones IS NOT DISTINCT FROM k_obs_asig)
    AND NOT (s.id_arrendatario_fk = 2 AND cb.clave IN ('B3','B29','B30','B31','B32','B33','B34','B35','B36'));

  -- ── 3. Cuotas faltantes según censo ──────────────────────────
  FOR r IN SELECT * FROM t_cen ORDER BY a, m LOOP
    v_per := to_char(make_date(2026, r.m, 1), 'YYYY-MM');
    SELECT count(*) INTO v_have FROM hip.cxc_hip x
     WHERE x.id_arrendatario_fk = r.a AND x.periodo = v_per AND x.status <> 'CANCELADO';
    v_need := r.n - v_have;
    CONTINUE WHEN v_need <= 0;
    FOR rs IN SELECT t.* FROM t_slot t
              WHERE t.a = r.a
                AND NOT EXISTS (SELECT 1 FROM hip.cxc_hip x WHERE x.id_asignacion_fk = t.asig AND x.periodo = v_per AND x.status <> 'CANCELADO')
              ORDER BY t.ord LIMIT v_need LOOP
      INSERT INTO hip.cxc_hip (id_arrendatario_fk, id_asignacion_fk, concepto, periodo, monto_original, descuento, monto_final,
                               saldo, status, fecha_emision, fecha_vencimiento, tipo)
      VALUES (r.a, rs.asig, 'Renta Caballeriza — ' || k_mes[r.m] || ' 2026', v_per, r.cuota, 0, r.cuota,
              r.cuota, 'PENDIENTE', make_date(2026, r.m, 1),
              make_date(2026, r.m, least(rs.dia_pago, extract(day from (make_date(2026, r.m, 1) + interval '1 month - 1 day'))::int)),
              'RENTA_CABALLERIZA')
      RETURNING id INTO v_id;
      INSERT INTO t_new VALUES (v_id, r.a, 'censo');
      v_need := v_need - 1;
    END LOOP;
    IF v_need > 0 THEN
      RAISE EXCEPTION 'No hay asignaciones suficientes: arrendatario % mes % (faltan %)', r.a, r.m, v_need;
    END IF;
  END LOOP;
  SELECT count(*), coalesce(sum(x.monto_final), 0) INTO v_cnt, v_sum FROM t_new n JOIN hip.cxc_hip x ON x.id = n.id WHERE n.kind = 'censo';
  v_rep := v_rep || format('cuotas censo: %s por %s | ', v_cnt, v_sum);

  -- ── 4. Cortesías de Rocío: cuotas ene–sep pendientes ─────────
  v_cnt := 0;
  FOR rs IN SELECT s.id, s.monto_mensual, s.dia_pago
             FROM hip.ctrl_asignaciones s JOIN hip.cat_caballerizas cb ON cb.id = s.id_caballeriza_fk
            WHERE s.id_arrendatario_fk = 2 AND s.activo
              AND cb.clave IN ('B29','B30','B31','B32','B33','B34','B35','B36') LOOP
    v_cnt := v_cnt + 1;
    FOR v_need IN 1..9 LOOP
      v_per := to_char(make_date(2026, v_need, 1), 'YYYY-MM');
      CONTINUE WHEN EXISTS (SELECT 1 FROM hip.cxc_hip x WHERE x.id_asignacion_fk = rs.id AND x.periodo = v_per AND x.status <> 'CANCELADO');
      INSERT INTO hip.cxc_hip (id_arrendatario_fk, id_asignacion_fk, concepto, periodo, monto_original, descuento, monto_final,
                               saldo, status, fecha_emision, fecha_vencimiento, tipo)
      VALUES (2, rs.id, 'Renta Caballeriza — ' || k_mes[v_need] || ' 2026', v_per, rs.monto_mensual, 0, rs.monto_mensual,
              rs.monto_mensual, 'PENDIENTE', make_date(2026, v_need, 1),
              make_date(2026, v_need, least(rs.dia_pago, extract(day from (make_date(2026, v_need, 1) + interval '1 month - 1 day'))::int)),
              'RENTA_CABALLERIZA')
      RETURNING id INTO v_id;
      INSERT INTO t_new VALUES (v_id, 2, 'cortesia');
    END LOOP;
  END LOOP;
  IF v_cnt <> 8 THEN RAISE EXCEPTION 'Cortesías de Rocío: % asignaciones B29–B36 activas, se esperaban 8', v_cnt; END IF;
  SELECT count(*), coalesce(sum(x.monto_final), 0) INTO v_cnt, v_sum FROM t_new n JOIN hip.cxc_hip x ON x.id = n.id WHERE n.kind = 'cortesia';
  IF v_cnt <> 72 THEN RAISE EXCEPTION 'Cuotas de cortesía: %, se esperaban 72', v_cnt; END IF;
  v_rep := v_rep || format('cuotas cortesía Rocío: %s por %s | ', v_cnt, v_sum);

  -- ── 5. Fechas de las asignaciones según las cuotas nuevas ────
  UPDATE hip.ctrl_asignaciones s SET fecha_inicio = least(s.fecha_inicio, z.ini)
    FROM (SELECT x.id_asignacion_fk AS asig, min(to_date(x.periodo || '-01', 'YYYY-MM-DD')) AS ini
            FROM hip.cxc_hip x JOIN t_new n ON n.id = x.id GROUP BY 1) z
   WHERE s.id = z.asig AND s.observaciones IS DISTINCT FROM k_obs_asig;
  UPDATE hip.ctrl_asignaciones s
     SET fecha_inicio = z.ini, fecha_fin = (z.fin + interval '1 month - 1 day')::date
    FROM (SELECT x.id_asignacion_fk AS asig, min(to_date(x.periodo || '-01', 'YYYY-MM-DD')) AS ini,
                 max(to_date(x.periodo || '-01', 'YYYY-MM-DD')) AS fin
            FROM hip.cxc_hip x JOIN t_new n ON n.id = x.id GROUP BY 1) z
   WHERE s.id = z.asig AND s.observaciones = k_obs_asig;
  IF EXISTS (SELECT 1 FROM hip.ctrl_asignaciones s WHERE s.observaciones = k_obs_asig
               AND NOT EXISTS (SELECT 1 FROM hip.cxc_hip x WHERE x.id_asignacion_fk = s.id)) THEN
    RAISE EXCEPTION 'Hay asignaciones históricas que no recibieron cuotas';
  END IF;

  -- ── 6. Recibos de carga inicial (FIFO) ───────────────────────
  FOR r IN SELECT * FROM t_dep
            WHERE (f < DATE '2026-07-01' AND a NOT IN (2, 3))
               OR (a = 11 AND f = DATE '2026-07-04' AND monto = 6200)
               OR (a = 12 AND f = DATE '2026-07-10' AND monto = 6200)
            ORDER BY f, a, monto LOOP
    v_n := v_n + 1;
    INSERT INTO hip.recibos_hip (folio, fecha_recibo, id_arrendatario_fk, subtotal, descuento, total, forma_pago_nombre,
                                 referencia_pago, observaciones, usuario_cobra, status, id_venta_pos_fk, id_forma_pago_fk, facturable)
    VALUES ('RHI-2026-' || lpad(v_n::text, 3, '0'), r.f, r.a, r.monto, 0, r.monto, k_fp,
            'Depósito ' || to_char(r.f, 'DD/MM/YYYY'), k_obs_rec, 'carga_inicial', 'VIGENTE', NULL, 3, false)
    RETURNING id INTO v_rec;
    INSERT INTO t_newrec VALUES (v_rec);
    INSERT INTO hip.recibos_hip_pagos (id_recibo_fk, id_forma_pago_fk, forma_nombre, monto, referencia)
    VALUES (v_rec, 3, k_fp, r.monto, 'Depósito ' || to_char(r.f, 'DD/MM/YYYY'));
    v_rest := r.monto;
    FOR q IN SELECT x.id, x.concepto, x.periodo, x.monto_final, x.saldo
               FROM hip.cxc_hip x JOIN t_new n ON n.id = x.id AND n.kind = 'censo'
              WHERE x.id_arrendatario_fk = r.a AND x.saldo > 0
              ORDER BY x.periodo, x.fecha_vencimiento, x.id LOOP
      EXIT WHEN v_rest <= 0;
      v_apl := least(v_rest, q.saldo);
      INSERT INTO hip.recibos_hip_det (id_recibo_fk, id_cuota_fk, concepto, tipo, periodo, monto_original, descuento, monto_final)
      VALUES (v_rec, q.id, q.concepto, 'RENTA_CABALLERIZA', q.periodo, q.monto_final, 0, v_apl);
      UPDATE hip.cxc_hip
         SET saldo = saldo - v_apl,
             status = CASE WHEN saldo - v_apl = 0 THEN 'PAGADO' ELSE 'PAGO_PARCIAL' END,
             fecha_pago = r.f, forma_pago = k_fp
       WHERE id = q.id;
      v_rest := v_rest - v_apl;
    END LOOP;
    IF v_rest > 0 THEN
      RAISE EXCEPTION 'Depósito % del arrendatario % por % no alcanza cuotas (sobran %)', r.f, r.a, r.monto, v_rest;
    END IF;
  END LOOP;
  SELECT count(*), coalesce(sum(total), 0) INTO v_cnt, v_sum FROM hip.recibos_hip WHERE id IN (SELECT id FROM t_newrec);
  v_rep := v_rep || format('recibos RHI: %s por %s | ', v_cnt, v_sum);

  -- ── 7a. Reaplicar pagos de cuotas que sobran ─────────────────
  CREATE TEMP TABLE t_move (a int, src text, sper text, dst text, dper text) ON COMMIT DROP;
  INSERT INTO t_move VALUES
    (4,  'LS18', '2026-08', 'LS3',  '2026-08'),
    (4,  'LS19', '2026-08', 'LS10', '2026-08'),
    (13, 'B20',  '2026-08', 'B18',  '2026-11');
  FOR r IN SELECT * FROM t_move LOOP
    SELECT x.* INTO STRICT v_src FROM hip.cxc_hip x JOIN hip.ctrl_asignaciones s ON s.id = x.id_asignacion_fk
      JOIN hip.cat_caballerizas cb ON cb.id = s.id_caballeriza_fk
     WHERE s.id_arrendatario_fk = r.a AND cb.clave = r.src AND x.periodo = r.sper AND x.status <> 'CANCELADO';
    SELECT x.* INTO STRICT v_dst FROM hip.cxc_hip x JOIN hip.ctrl_asignaciones s ON s.id = x.id_asignacion_fk
      JOIN hip.cat_caballerizas cb ON cb.id = s.id_caballeriza_fk
     WHERE s.id_arrendatario_fk = r.a AND cb.clave = r.dst AND x.periodo = r.dper AND x.status <> 'CANCELADO';
    SELECT coalesce(sum(d.monto_final), 0) INTO v_sum
      FROM hip.recibos_hip_det d JOIN hip.recibos_hip rc ON rc.id = d.id_recibo_fk
     WHERE rc.status = 'VIGENTE' AND d.id_cuota_fk = v_src.id;
    IF v_sum <> v_src.monto_final - coalesce(v_src.saldo, v_src.monto_final) THEN
      RAISE EXCEPTION 'Cuota % (%/%): lo cobrado en recibos (%) no coincide con su saldo', v_src.id, r.src, r.sper, v_sum;
    END IF;
    IF v_dst.status <> 'PENDIENTE' OR v_dst.saldo < v_sum THEN
      RAISE EXCEPTION 'Cuota destino % (%/%) no está pendiente o no alcanza', v_dst.id, r.dst, r.dper;
    END IF;
    UPDATE hip.recibos_hip_det d SET id_cuota_fk = v_dst.id, periodo = v_dst.periodo, concepto = v_dst.concepto
      FROM hip.recibos_hip rc
     WHERE rc.id = d.id_recibo_fk AND rc.status = 'VIGENTE' AND d.id_cuota_fk = v_src.id;
    UPDATE hip.cxc_hip
       SET saldo = saldo - v_sum,
           status = CASE WHEN saldo - v_sum = 0 THEN 'PAGADO' ELSE 'PAGO_PARCIAL' END,
           fecha_pago = v_src.fecha_pago, forma_pago = v_src.forma_pago
     WHERE id = v_dst.id;
    UPDATE hip.cxc_hip SET status = 'CANCELADO' WHERE id = v_src.id;
    INSERT INTO t_touch VALUES (v_dst.id), (v_src.id);
  END LOOP;
  v_rep := v_rep || 'pagos reaplicados: 3 | ';

  -- ── 7b. Cancelar cuotas que sobran ───────────────────────────
  CREATE TEMP TABLE t_cancel (a int, clave text, desde text) ON COMMIT DROP;
  INSERT INTO t_cancel VALUES (4,'LS18','2026-09'), (4,'LS19','2026-09'), (4,'LS17','2026-10'), (2,'B3','2026-01');
  -- German: sobra 1 cuota en sep → la de la última asignación (orden de uso) que la tenga pendiente
  INSERT INTO t_cancel
  SELECT 3, cb.clave, '2026-09'
    FROM t_slot t JOIN hip.ctrl_asignaciones s ON s.id = t.asig JOIN hip.cat_caballerizas cb ON cb.id = s.id_caballeriza_fk
    JOIN hip.cxc_hip x ON x.id_asignacion_fk = t.asig AND x.periodo = '2026-09' AND x.status = 'PENDIENTE'
   WHERE t.a = 3
   ORDER BY t.ord DESC LIMIT 1;
  CREATE TEMP TABLE t_cxl (id int) ON COMMIT DROP;
  INSERT INTO t_cxl
  SELECT x.id FROM t_cancel c
    JOIN hip.cat_caballerizas cb ON cb.clave = c.clave
    JOIN hip.ctrl_asignaciones s ON s.id_caballeriza_fk = cb.id AND s.id_arrendatario_fk = c.a AND s.activo
    JOIN hip.cxc_hip x ON x.id_asignacion_fk = s.id AND x.status <> 'CANCELADO'
                       AND x.periodo >= c.desde AND (c.a <> 3 OR x.periodo = c.desde);
  IF EXISTS (SELECT 1 FROM t_cxl l JOIN hip.cxc_hip x ON x.id = l.id
              WHERE x.status <> 'PENDIENTE' OR x.saldo <> x.monto_final
                 OR EXISTS (SELECT 1 FROM hip.recibos_hip_det d JOIN hip.recibos_hip rc ON rc.id = d.id_recibo_fk
                             WHERE rc.status = 'VIGENTE' AND d.id_cuota_fk = x.id)) THEN
    RAISE EXCEPTION 'Alguna cuota a cancelar no está totalmente pendiente';
  END IF;
  SELECT count(*) INTO v_cnt FROM t_cxl;
  IF v_cnt <> 15 THEN RAISE EXCEPTION 'Cuotas a cancelar: %, se esperaban 15', v_cnt; END IF;
  UPDATE hip.cxc_hip SET status = 'CANCELADO' WHERE id IN (SELECT id FROM t_cxl);
  SELECT string_agg(DISTINCT c.clave, ',') INTO v_per FROM t_cancel c WHERE c.a = 3;
  v_rep := v_rep || format('cuotas canceladas: %s + 3 reaplicadas (German sep: %s) | ', v_cnt, v_per);

  -- ── 7c. Cerrar asignaciones que sobran ───────────────────────
  CREATE TEMP TABLE t_close (a int, clave text, fin date) ON COMMIT DROP;
  INSERT INTO t_close VALUES
    (4,'LS18','2026-07-31'), (4,'LS19','2026-07-31'), (4,'LS17','2026-09-30'),
    (4,'LS20','2026-06-30'), (4,'LS21','2026-06-30'),
    (6,'D35','2026-10-31'), (6,'E1','2026-10-31'), (6,'E2','2026-10-31'), (6,'E3','2026-10-31'), (6,'E4','2026-10-31'), (6,'E5','2026-10-31'),
    (2,'B3', NULL), (13,'B20', NULL);
  UPDATE hip.ctrl_asignaciones s
     SET activo = false,
         fecha_fin = coalesce(c.fin, s.fecha_inicio),
         observaciones = coalesce(nullif(s.observaciones, '') || ' · ', '') || k_obs_cier
    FROM t_close c JOIN hip.cat_caballerizas cb ON cb.clave = c.clave
   WHERE s.id_caballeriza_fk = cb.id AND s.id_arrendatario_fk = c.a AND s.activo;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt <> 13 THEN RAISE EXCEPTION 'Asignaciones cerradas: %, se esperaban 13', v_cnt; END IF;
  INSERT INTO t_cab SELECT cb.id FROM t_close c JOIN hip.cat_caballerizas cb ON cb.clave = c.clave;
  IF EXISTS (SELECT 1 FROM hip.ctrl_asignaciones s JOIN hip.cxc_hip x ON x.id_asignacion_fk = s.id
              WHERE s.observaciones LIKE '%' || k_obs_cier AND x.status <> 'CANCELADO'
                AND to_date(x.periodo || '-01', 'YYYY-MM-DD') > s.fecha_fin) THEN
    RAISE EXCEPTION 'Quedan cuotas vivas después de la fecha de cierre de alguna asignación';
  END IF;
  v_rep := v_rep || format('asignaciones cerradas: %s | ', v_cnt);

  -- ── 7d. Monto de asignación = cuota real (Ricardo y Yunuen 2,800) ─
  UPDATE hip.ctrl_asignaciones SET monto_mensual = 2800
   WHERE id_arrendatario_fk IN (5, 9) AND activo AND monto_mensual = 3100;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_rep := v_rep || format('asignaciones a 2,800: %s | ', v_cnt);

  -- ── 7e. Status de caballerizas tocadas ───────────────────────
  UPDATE hip.cat_caballerizas cb
     SET status = CASE WHEN EXISTS (SELECT 1 FROM hip.ctrl_asignaciones s WHERE s.id_caballeriza_fk = cb.id AND s.activo)
                       THEN 'Rentada' ELSE 'Libre' END
   WHERE cb.id IN (SELECT id FROM t_cab) AND cb.status IN ('Rentada', 'Libre');
  -- J25–J31 estaban 'Rentada' sin asignación activa (ahora son históricas de Ricardo)
  UPDATE hip.cat_caballerizas cb SET status = 'Libre'
   WHERE cb.clave IN ('J25','J26','J27','J28','J29','J30','J31') AND cb.status = 'Rentada'
     AND NOT EXISTS (SELECT 1 FROM hip.ctrl_asignaciones s WHERE s.id_caballeriza_fk = cb.id AND s.activo);

  -- ── 8. Validación ────────────────────────────────────────────
  -- 8a. Saldo por arrendatario (periodos ≤ 2026-10)
  FOR r IN
    WITH esp(a, saldo) AS (VALUES (1,0),(2,248100),(3,259100),(4,233200),(5,113400),(6,0),(7,6200),(8,0),
                                  (9,0),(10,0),(11,0),(12,0),(13,0),(14,55800),(15,0)),
         real AS (SELECT id_arrendatario_fk a, sum(coalesce(saldo, monto_final)) s
                    FROM hip.cxc_hip WHERE status <> 'CANCELADO' AND periodo <= '2026-10' GROUP BY 1)
    SELECT e.a, e.saldo, coalesce(real.s, 0) s FROM esp e LEFT JOIN real USING (a)
  LOOP
    IF abs(r.s - r.saldo) > 0.01 THEN v_err := v_err || format('saldo arr %s = %s (esperado %s); ', r.a, r.s, r.saldo); END IF;
  END LOOP;
  SELECT sum(coalesce(saldo, monto_final)) INTO v_sum FROM hip.cxc_hip WHERE status <> 'CANCELADO' AND periodo <= '2026-10';
  v_rep := v_rep || format('SALDO ≤ oct: %s (esperado 915,800) | ', v_sum);
  IF abs(v_sum - 915800) > 0.01 THEN v_err := v_err || format('saldo total %s; ', v_sum); END IF;

  -- 8b. Cargos y recibos ene–oct
  SELECT sum(monto_final) INTO v_sum FROM hip.cxc_hip WHERE status <> 'CANCELADO' AND periodo BETWEEN '2026-01' AND '2026-10';
  IF v_sum <> 2314400 THEN v_err := v_err || format('cargos ene–oct %s (esperado 2,314,400); ', v_sum); END IF;
  SELECT sum(total) INTO v_sum2 FROM hip.recibos_hip
   WHERE status = 'VIGENTE' AND fecha_recibo BETWEEN '2026-01-01' AND '2026-10-31' AND coalesce(forma_pago_nombre, '') <> 'Condonación';
  IF v_sum2 <> 1398600 THEN v_err := v_err || format('recibos ene–oct %s (esperado 1,398,600); ', v_sum2); END IF;
  v_rep := v_rep || format('cargos ene–oct %s · recibos ene–oct %s | ', v_sum, v_sum2);

  -- 8c. Caballerizas cobradas por mes = censo del Excel (+8 cortesías Rocío; +2 jul Fernanda y Saúl Corona, ajuste manual)
  FOR r IN
    SELECT c.a, c.m, c.n + CASE WHEN c.a = 2 THEN 8 ELSE 0 END + CASE WHEN c.a IN (6, 10) AND c.m = 7 THEN 2 ELSE 0 END AS esp,
           (SELECT count(*) FROM hip.cxc_hip x WHERE x.id_arrendatario_fk = c.a AND x.status <> 'CANCELADO'
               AND x.periodo = to_char(make_date(2026, c.m, 1), 'YYYY-MM')) AS n
      FROM t_cen c
  LOOP
    IF r.n <> r.esp THEN v_err := v_err || format('cuotas arr %s mes %s = %s (esperado %s); ', r.a, r.m, r.n, r.esp); END IF;
  END LOOP;

  -- 8d. Integridad
  IF EXISTS (SELECT 1 FROM hip.cxc_hip WHERE status <> 'CANCELADO' AND id_asignacion_fk IS NOT NULL
              GROUP BY id_asignacion_fk, periodo HAVING count(*) > 1) THEN
    v_err := v_err || 'cuotas duplicadas por (asignación, periodo); ';
  END IF;
  IF EXISTS (SELECT 1 FROM hip.cxc_hip WHERE status <> 'CANCELADO' AND (saldo < 0 OR saldo > monto_final)) THEN
    v_err := v_err || 'cuotas con saldo fuera de rango; ';
  END IF;
  IF EXISTS (SELECT 1 FROM hip.recibos_hip rc WHERE rc.id IN (SELECT id FROM t_newrec)
              AND (rc.total <> (SELECT coalesce(sum(monto_final), 0) FROM hip.recibos_hip_det d WHERE d.id_recibo_fk = rc.id)
                OR rc.total <> (SELECT coalesce(sum(monto), 0) FROM hip.recibos_hip_pagos p WHERE p.id_recibo_fk = rc.id))) THEN
    v_err := v_err || 'recibo RHI con detalle o pagos que no suman el total; ';
  END IF;
  IF EXISTS (SELECT 1 FROM hip.cxc_hip x
              WHERE (x.id IN (SELECT id FROM t_new) OR x.id IN (SELECT id FROM t_touch)) AND x.status <> 'CANCELADO'
                AND x.monto_final - x.saldo <> (SELECT coalesce(sum(d.monto_final), 0) FROM hip.recibos_hip_det d
                                                  JOIN hip.recibos_hip rc ON rc.id = d.id_recibo_fk
                                                 WHERE rc.status = 'VIGENTE' AND d.id_cuota_fk = x.id)) THEN
    v_err := v_err || 'cuota tocada cuyo cobrado no coincide con su detalle de recibos; ';
  END IF;
  IF EXISTS (SELECT 1 FROM hip.cxc_hip x WHERE x.id IN (SELECT id FROM t_new) AND x.status <> CASE
               WHEN x.saldo = 0 THEN 'PAGADO' WHEN x.saldo = x.monto_final THEN 'PENDIENTE' ELSE 'PAGO_PARCIAL' END) THEN
    v_err := v_err || 'status inconsistente en cuotas nuevas; ';
  END IF;

  -- Resumen por arrendatario para el reporte
  SELECT string_agg(format('%s=%s', a, s), ' ' ORDER BY a) INTO v_per
    FROM (SELECT id_arrendatario_fk a, sum(coalesce(saldo, monto_final)) s FROM hip.cxc_hip
           WHERE status <> 'CANCELADO' AND periodo <= '2026-10' GROUP BY 1) z;
  v_rep := v_rep || 'saldos: ' || coalesce(v_per, '');

  IF v_err <> '' THEN
    RAISE EXCEPTION 'VALIDACION FALLIDA (rollback): % || %', v_err, v_rep;
  END IF;
  IF v_dry THEN
    RAISE EXCEPTION 'DRY-RUN OK (rollback, nada se guardó): %', v_rep;
  END IF;
  RAISE NOTICE 'Carga inicial aplicada: %', v_rep;
END
$mig$;
