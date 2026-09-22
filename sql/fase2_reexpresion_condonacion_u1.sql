-- ═════════════════════════════════════════════════════════════════════════
-- FASE 2 · Reexpresión del universo U1 — el cargo baja al precio pactado y
--          el pago condonado desaparece.
--
-- ⚠️ ORDEN: correr DESPUÉS de sql/seed_tarifas_pactadas_golf.sql. El sembrado
-- deriva el precio pactado de la condonación que este script borra.
--
-- ALCANCE: SOLO U1 = recibos VIGENTE, con condonación, y **sin ticket POS**
-- ($4,977,177.17 en 308 recibos). Ese universo no tiene venta, ni corte, ni
-- recibo de ingreso, ni CFDI: no toca el libro de ingresos ni lo fiscal.
-- U2 (1 recibo, $2,250) y U3 (3 CFDI, $13,000) quedan FUERA por decisión
-- explícita — el filtro `id_venta_pos_fk IS NULL` los excluye en todos lados.
-- Hípico ($3,100) también queda fuera: ahí la condonación fue quita real.
--
-- LA REGLA
--   `cxc_golf.monto_final` es GENERATED (monto_original − descuento), así que
--   se baja `monto_original`. **`saldo` NO se toca**: la parte condonada se
--   retira de los dos lados de la resta, así que el saldo sigue siendo el
--   correcto, también en los pagos parciales.
--
-- CÓMO CORRERLO
--   Bloques 1–3 primero (crean respaldo y tabla de trabajo, y validan; no
--   modifican nada). Si el bloque 3 devuelve filas, PARAR. El bloque 4 es un
--   solo DO: aplica todo o no aplica nada.
-- ═════════════════════════════════════════════════════════════════════════


-- ══ 1. RESPALDOS ════════════════════════════════════════════════════════
-- Foto previa completa de lo que se va a tocar. Sin esto no se corre nada.
DROP TABLE IF EXISTS golf.bkp_cond_cxc;
CREATE TABLE golf.bkp_cond_cxc AS
  SELECT now() AS tomado_en, x.* FROM golf.cxc_golf x
   WHERE x.id_recibo_fk IN (
     SELECT r.id FROM golf.recibos_golf r WHERE r.id_venta_pos_fk IS NULL AND r.status = 'VIGENTE')
      OR x.id IN (
     SELECT d.id_cuota_fk FROM golf.recibos_golf_det d
       JOIN golf.recibos_golf r ON r.id = d.id_recibo_fk
      WHERE r.id_venta_pos_fk IS NULL AND r.status = 'VIGENTE' AND d.id_cuota_fk IS NOT NULL);

DROP TABLE IF EXISTS golf.bkp_cond_recibos;
CREATE TABLE golf.bkp_cond_recibos AS
  SELECT now() AS tomado_en, r.* FROM golf.recibos_golf r
   WHERE r.id_venta_pos_fk IS NULL AND r.status = 'VIGENTE';

DROP TABLE IF EXISTS golf.bkp_cond_recibos_det;
CREATE TABLE golf.bkp_cond_recibos_det AS
  SELECT now() AS tomado_en, d.* FROM golf.recibos_golf_det d
   JOIN golf.recibos_golf r ON r.id = d.id_recibo_fk
  WHERE r.id_venta_pos_fk IS NULL AND r.status = 'VIGENTE';

DROP TABLE IF EXISTS golf.bkp_cond_recibos_pagos;
CREATE TABLE golf.bkp_cond_recibos_pagos AS
  SELECT now() AS tomado_en, p.* FROM golf.recibos_golf_pagos p
   JOIN golf.recibos_golf r ON r.id = p.id_recibo_fk
  WHERE r.id_venta_pos_fk IS NULL AND r.status = 'VIGENTE';


-- ══ 2. TABLA DE TRABAJO ═════════════════════════════════════════════════
-- Congela el prorrateo ANTES de tocar nada: todos los UPDATE leen de aquí, no
-- de los datos vivos. Si leyeran de los datos vivos, borrar las líneas de pago
-- cambiaría el cálculo a media ejecución.
--
-- Incluye TODAS las líneas del recibo, también las de «Cargo adicional»
-- (id_cuota_fk NULL): la cabecera baja por el total condonado, así que la suma
-- de las líneas tiene que dar exactamente ese total.
DROP TABLE IF EXISTS golf.reexpresion_condonacion_u1;
CREATE TABLE golf.reexpresion_condonacion_u1 AS
WITH cond AS (
  SELECT p.id_recibo_fk,
         SUM(p.monto)                                                  AS pagado_total,
         SUM(p.monto) FILTER (WHERE f.codigo_sat IN ('15','25')
                                 OR p.forma_nombre ILIKE '%condona%'
                                 OR p.forma_nombre ILIKE '%remisi%')   AS condonado
  FROM golf.recibos_golf_pagos p
  LEFT JOIN cfg.formas_pago f ON f.id = p.id_forma_pago_fk
  GROUP BY p.id_recibo_fk
),
u1 AS (
  SELECT r.id, r.folio, r.fecha_recibo, r.subtotal, r.total, c.pagado_total, c.condonado
  FROM golf.recibos_golf r
  JOIN cond c ON c.id_recibo_fk = r.id
  WHERE r.status = 'VIGENTE'
    AND r.id_venta_pos_fk IS NULL     -- ← la frontera de U1
    AND c.condonado > 0
),
lin AS (
  SELECT d.id                                                              AS id_det,
         d.id_recibo_fk, d.id_cuota_fk, d.monto_final AS aplicado,
         u1.folio, u1.fecha_recibo, u1.condonado                           AS condonado_recibo,
         ROUND(d.monto_final * (u1.condonado / NULLIF(u1.pagado_total, 0)), 2) AS cond_linea,
         -- La línea más grande del recibo absorbe el residuo del redondeo,
         -- para que la suma de las líneas cuadre al centavo con la cabecera.
         ROW_NUMBER() OVER (PARTITION BY d.id_recibo_fk ORDER BY d.monto_final DESC, d.id) AS rn
  FROM golf.recibos_golf_det d
  JOIN u1 ON u1.id = d.id_recibo_fk
),
resid AS (
  SELECT id_recibo_fk,
         MAX(condonado_recibo) - SUM(cond_linea) AS residuo
  FROM lin GROUP BY id_recibo_fk
)
SELECT l.id_det, l.id_recibo_fk, l.folio, l.fecha_recibo, l.id_cuota_fk,
       l.aplicado,
       (l.cond_linea + CASE WHEN l.rn = 1 THEN COALESCE(re.residuo, 0) ELSE 0 END)::numeric(12,2)
                                                    AS cond_linea,
       l.condonado_recibo,
       now()                                        AS calculado_en
FROM lin l
LEFT JOIN resid re ON re.id_recibo_fk = l.id_recibo_fk;

CREATE INDEX ON golf.reexpresion_condonacion_u1 (id_cuota_fk);
CREATE INDEX ON golf.reexpresion_condonacion_u1 (id_recibo_fk);


-- ══ 3. VALIDACIONES PREVIAS — las tres deben devolver CERO filas ════════

-- 3a. Las líneas de cada recibo suman exactamente su condonación
SELECT id_recibo_fk, folio,
       MAX(condonado_recibo)  AS condonado_recibo,
       SUM(cond_linea)        AS suma_lineas
FROM golf.reexpresion_condonacion_u1
GROUP BY id_recibo_fk, folio
HAVING ABS(MAX(condonado_recibo) - SUM(cond_linea)) > 0.005
    OR SUM(cond_linea) IS NULL;   -- NULL = no se pudo prorratear (pagado_total en 0)

-- 3b. Ninguna cuota quedaría con monto por debajo de su descuento ni de su saldo
--     (si aparece alguna, el prorrateo le está quitando más de lo que se le cobró)
SELECT x.id, x.concepto, x.periodo, x.monto_original, x.descuento, x.saldo,
       SUM(w.cond_linea) AS a_retirar,
       x.monto_original - SUM(w.cond_linea) AS monto_original_nuevo
FROM golf.reexpresion_condonacion_u1 w
JOIN golf.cxc_golf x ON x.id = w.id_cuota_fk
GROUP BY x.id, x.concepto, x.periodo, x.monto_original, x.descuento, x.saldo
HAVING x.monto_original - SUM(w.cond_linea) < COALESCE(x.descuento, 0)
    OR x.monto_original - SUM(w.cond_linea) - COALESCE(x.descuento, 0) < COALESCE(x.saldo, 0) - 0.005;

-- 3c. Ningún recibo quedaría con total negativo
SELECT r.id, r.folio, r.subtotal, r.total, SUM(w.cond_linea) AS a_retirar
FROM golf.reexpresion_condonacion_u1 w
JOIN golf.recibos_golf r ON r.id = w.id_recibo_fk
GROUP BY r.id, r.folio, r.subtotal, r.total
HAVING r.total - SUM(w.cond_linea) < -0.005 OR r.subtotal - SUM(w.cond_linea) < -0.005;

-- Control: esto es lo que se va a retirar en total (debe dar 4,977,177.17)
SELECT COUNT(DISTINCT id_recibo_fk) AS recibos,
       COUNT(DISTINCT id_cuota_fk)  AS cuotas,
       SUM(cond_linea)::numeric(14,2) AS condonacion_a_retirar
FROM golf.reexpresion_condonacion_u1;


-- ══ 4. APLICAR — un solo DO: o pasa todo, o no pasa nada ════════════════
DO $$
DECLARE
  v_malas       int;
  v_cuotas      int;
  v_recibos     int;
  v_canceladas  int;
  v_rec_cancel  int;
BEGIN
  -- Re-verificación de las validaciones del bloque 3, por si se corrió el 4
  -- sin mirar el 3.
  SELECT COUNT(*) INTO v_malas FROM (
    SELECT 1 FROM golf.reexpresion_condonacion_u1
     GROUP BY id_recibo_fk
    HAVING ABS(MAX(condonado_recibo) - SUM(cond_linea)) > 0.005
        OR SUM(cond_linea) IS NULL
  ) q;
  IF v_malas > 0 THEN
    RAISE EXCEPTION 'Hay % recibo(s) cuyas líneas no suman su condonación. Revisa el bloque 3a antes de aplicar.', v_malas;
  END IF;

  SELECT COUNT(*) INTO v_malas FROM (
    SELECT x.id FROM golf.reexpresion_condonacion_u1 w
      JOIN golf.cxc_golf x ON x.id = w.id_cuota_fk
     GROUP BY x.id, x.monto_original, x.descuento, x.saldo
    HAVING x.monto_original - SUM(w.cond_linea) < COALESCE(x.descuento, 0)
        OR x.monto_original - SUM(w.cond_linea) - COALESCE(x.descuento, 0) < COALESCE(x.saldo, 0) - 0.005
  ) q;
  IF v_malas > 0 THEN
    RAISE EXCEPTION 'Hay % cuota(s) que quedarían con monto por debajo de su saldo o su descuento. Revisa el bloque 3b.', v_malas;
  END IF;

  -- 4.1 El cargo baja al precio pactado. `saldo` intacto a propósito.
  WITH porcuota AS (
    SELECT id_cuota_fk, SUM(cond_linea) AS cond
    FROM golf.reexpresion_condonacion_u1
    WHERE id_cuota_fk IS NOT NULL
    GROUP BY id_cuota_fk
  )
  UPDATE golf.cxc_golf x
     SET monto_original = ROUND(x.monto_original - pc.cond, 2),
         observaciones  = CONCAT_WS(' | ', NULLIF(x.observaciones, ''),
           'Reexpresado a precio pactado el ' || CURRENT_DATE ||
           ': monto de lista ' || x.monto_original || ', condonación retirada ' || pc.cond || '.')
    FROM porcuota pc
   WHERE x.id = pc.id_cuota_fk;
  GET DIAGNOSTICS v_cuotas = ROW_COUNT;

  -- 4.2 Detalle del recibo (es la fuente del ticket y de la factura)
  UPDATE golf.recibos_golf_det d
     SET monto_final    = ROUND(d.monto_final - w.cond_linea, 2),
         monto_original = ROUND(d.monto_original - w.cond_linea, 2)
    FROM golf.reexpresion_condonacion_u1 w
   WHERE d.id = w.id_det;

  -- 4.3 Cabecera: el total baja a lo que sí entró
  WITH porrecibo AS (
    SELECT id_recibo_fk, SUM(cond_linea) AS cond
    FROM golf.reexpresion_condonacion_u1 GROUP BY id_recibo_fk
  )
  UPDATE golf.recibos_golf r
     SET subtotal = ROUND(r.subtotal - pr.cond, 2),
         total    = ROUND(r.total    - pr.cond, 2)
    FROM porrecibo pr
   WHERE r.id = pr.id_recibo_fk;
  GET DIAGNOSTICS v_recibos = ROW_COUNT;

  -- 4.4 Fuera las líneas de pago condonadas (solo de los recibos de U1)
  -- Mismo criterio exacto que el FILTER de la tabla de trabajo. Con USING +
  -- JOIN se escaparía una línea con id_forma_pago_fk NULL y nombre
  -- «Condonación»: contaría en el prorrateo pero no se borraría, y el recibo
  -- quedaría descuadrado contra sus pagos.
  DELETE FROM golf.recibos_golf_pagos p
   WHERE p.id_recibo_fk IN (SELECT DISTINCT id_recibo_fk FROM golf.reexpresion_condonacion_u1)
     AND (p.forma_nombre ILIKE '%condona%'
          OR p.forma_nombre ILIKE '%remisi%'
          OR EXISTS (SELECT 1 FROM cfg.formas_pago f
                      WHERE f.id = p.id_forma_pago_fk AND f.codigo_sat IN ('15','25')));

  -- 4.5 Rehacer el texto de formas de pago de la cabecera
  UPDATE golf.recibos_golf r
     SET forma_pago_nombre = sub.formas,
         id_forma_pago_fk  = sub.primera
    FROM (
      SELECT p.id_recibo_fk,
             STRING_AGG(p.forma_nombre, ' + ' ORDER BY p.id)  AS formas,
             (ARRAY_AGG(p.id_forma_pago_fk ORDER BY p.id))[1] AS primera
      FROM golf.recibos_golf_pagos p
      WHERE p.id_recibo_fk IN (SELECT DISTINCT id_recibo_fk FROM golf.reexpresion_condonacion_u1)
      GROUP BY p.id_recibo_fk
    ) sub
   WHERE r.id = sub.id_recibo_fk;

  -- 4.6 Recibos que se quedaron sin una sola forma de pago: nunca entró un
  --     peso, así que no hubo cobro. Se cancelan en vez de dejarlos en $0.
  UPDATE golf.recibos_golf r
     SET status            = 'CANCELADO',
         forma_pago_nombre = NULL,
         observaciones     = CONCAT_WS(' | ', NULLIF(r.observaciones, ''),
           'Cancelado el ' || CURRENT_DATE || ' al reexpresar: su importe era 100% condonación, no hubo cobro.')
   WHERE r.id IN (SELECT DISTINCT id_recibo_fk FROM golf.reexpresion_condonacion_u1)
     AND NOT EXISTS (SELECT 1 FROM golf.recibos_golf_pagos p WHERE p.id_recibo_fk = r.id);
  GET DIAGNOSTICS v_rec_cancel = ROW_COUNT;

  -- 4.7 Status de las cuotas tocadas, recalculado contra el monto nuevo.
  --     Una cuota que queda en cero es una cuota que no debió existir
  --     (inscripción perdonada, mensualidad en cortesía): se cancela, y así
  --     sale del devengado y de la cartera en vez de quedar como fila de $0.
  UPDATE golf.cxc_golf x
     SET status = CASE
                    WHEN x.monto_final <= 0.005                        THEN 'CANCELADO'
                    WHEN COALESCE(x.saldo, 0) <= 0.005                 THEN 'PAGADO'
                    WHEN COALESCE(x.saldo, 0) >= x.monto_final - 0.005 THEN 'PENDIENTE'
                    ELSE 'PAGO_PARCIAL'
                  END,
         -- Si ya no queda nada cobrado, tampoco queda fecha ni forma de pago:
         -- dejarlas sería un cobro fantasma en las medidas de caja.
         fecha_pago      = CASE WHEN x.monto_final - COALESCE(x.saldo, 0) <= 0.005 THEN NULL ELSE x.fecha_pago END,
         forma_pago      = CASE WHEN x.monto_final - COALESCE(x.saldo, 0) <= 0.005 THEN NULL ELSE x.forma_pago END,
         referencia_pago = CASE WHEN x.monto_final - COALESCE(x.saldo, 0) <= 0.005 THEN NULL ELSE x.referencia_pago END
   WHERE x.id IN (SELECT DISTINCT id_cuota_fk FROM golf.reexpresion_condonacion_u1 WHERE id_cuota_fk IS NOT NULL);

  -- 4.8 Y el texto de forma de pago de las que sí conservan cobro se rehace
  --     desde su recibo, que ya perdió la línea de condonación.
  UPDATE golf.cxc_golf x
     SET forma_pago = r.forma_pago_nombre
    FROM golf.recibos_golf r
   WHERE r.id = x.id_recibo_fk
     AND r.status = 'VIGENTE'
     AND x.monto_final - COALESCE(x.saldo, 0) > 0.005
     AND x.id IN (SELECT DISTINCT id_cuota_fk FROM golf.reexpresion_condonacion_u1 WHERE id_cuota_fk IS NOT NULL);

  SELECT COUNT(*) INTO v_canceladas
    FROM golf.cxc_golf x
    JOIN (SELECT DISTINCT id_cuota_fk FROM golf.reexpresion_condonacion_u1 WHERE id_cuota_fk IS NOT NULL) t
      ON t.id_cuota_fk = x.id
   WHERE x.status = 'CANCELADO';

  RAISE NOTICE 'Reexpresión U1 aplicada: % cuota(s) ajustadas (% canceladas por quedar en cero), % recibo(s) ajustados (% cancelados por ser 100%% condonación).',
    v_cuotas, v_canceladas, v_recibos, v_rec_cancel;
END $$;


-- ══ 5. VERIFICACIÓN POSTERIOR ═══════════════════════════════════════════

-- 5a. Condonación que queda viva. Debe ser SOLO U2 ($2,250) + U3 ($13,000).
SELECT CASE WHEN r.id_venta_pos_fk IS NULL THEN 'sin ticket (U1 — debe dar 0)'
            WHEN v.folio_fiscal IS NULL    THEN 'U2 · ticket sin CFDI'
            ELSE                                'U3 · ticket con CFDI' END AS universo,
       COUNT(DISTINCT r.id)        AS recibos,
       SUM(p.monto)::numeric(14,2) AS condonado
FROM golf.recibos_golf_pagos p
JOIN golf.recibos_golf r ON r.id = p.id_recibo_fk AND r.status = 'VIGENTE'
LEFT JOIN golf.ctrl_ventas v ON v.id = r.id_venta_pos_fk
LEFT JOIN cfg.formas_pago f ON f.id = p.id_forma_pago_fk
WHERE f.codigo_sat IN ('15','25') OR p.forma_nombre ILIKE '%condona%' OR p.forma_nombre ILIKE '%remisi%'
GROUP BY 1;

-- 5b. Cada recibo tocado: su total debe ser exactamente la suma de sus pagos
SELECT r.id, r.folio, r.total, COALESCE(SUM(p.monto), 0) AS suma_pagos, r.status
FROM golf.recibos_golf r
LEFT JOIN golf.recibos_golf_pagos p ON p.id_recibo_fk = r.id
WHERE r.id IN (SELECT DISTINCT id_recibo_fk FROM golf.reexpresion_condonacion_u1)
GROUP BY r.id, r.folio, r.total, r.status
HAVING ABS(r.total - COALESCE(SUM(p.monto), 0)) > 0.005 AND r.status = 'VIGENTE';

-- 5c. Y su total debe ser la suma de su detalle
SELECT r.id, r.folio, r.total, COALESCE(SUM(d.monto_final), 0) AS suma_detalle
FROM golf.recibos_golf r
LEFT JOIN golf.recibos_golf_det d ON d.id_recibo_fk = r.id
WHERE r.id IN (SELECT DISTINCT id_recibo_fk FROM golf.reexpresion_condonacion_u1)
GROUP BY r.id, r.folio, r.total
HAVING ABS(r.total - COALESCE(SUM(d.monto_final), 0)) > 0.005;

-- 5d. Devengado de Golf antes vs después (el hueco contra el presupuesto
--     2026 —$4.81M— tiene que cerrarse casi por completo)
SELECT 'antes' AS momento, SUM(b.monto_final)::numeric(14,2) AS devengado
  FROM golf.bkp_cond_cxc b WHERE b.status <> 'CANCELADO'
UNION ALL
SELECT 'después', SUM(x.monto_final)::numeric(14,2)
  FROM golf.cxc_golf x
 WHERE x.status <> 'CANCELADO'
   AND x.id IN (SELECT id FROM golf.bkp_cond_cxc);

-- 5e. Ninguna cuota tocada puede haber quedado con monto negativo
SELECT id, concepto, periodo, monto_original, descuento, monto_final, saldo, status
FROM golf.cxc_golf
WHERE id IN (SELECT DISTINCT id_cuota_fk FROM golf.reexpresion_condonacion_u1 WHERE id_cuota_fk IS NOT NULL)
  AND (monto_final < 0 OR monto_original < 0);


-- ══ 6. VUELTA ATRÁS (si algo salió mal) ═════════════════════════════════
-- Los respaldos del bloque 1 tienen la foto completa. Para revertir:
--
-- UPDATE golf.cxc_golf x SET monto_original = b.monto_original, descuento = b.descuento,
--        status = b.status, saldo = b.saldo, fecha_pago = b.fecha_pago,
--        forma_pago = b.forma_pago, referencia_pago = b.referencia_pago,
--        observaciones = b.observaciones
--   FROM golf.bkp_cond_cxc b WHERE b.id = x.id;
-- UPDATE golf.recibos_golf r SET subtotal = b.subtotal, total = b.total, status = b.status,
--        forma_pago_nombre = b.forma_pago_nombre, id_forma_pago_fk = b.id_forma_pago_fk,
--        observaciones = b.observaciones
--   FROM golf.bkp_cond_recibos b WHERE b.id = r.id;
-- UPDATE golf.recibos_golf_det d SET monto_final = b.monto_final, monto_original = b.monto_original
--   FROM golf.bkp_cond_recibos_det b WHERE b.id = d.id;
-- INSERT INTO golf.recibos_golf_pagos (id, id_recibo_fk, id_forma_pago_fk, forma_nombre, monto, referencia, created_at)
--   SELECT b.id, b.id_recibo_fk, b.id_forma_pago_fk, b.forma_nombre, b.monto, b.referencia, b.created_at
--     FROM golf.bkp_cond_recibos_pagos b
--    WHERE NOT EXISTS (SELECT 1 FROM golf.recibos_golf_pagos p WHERE p.id = b.id);
