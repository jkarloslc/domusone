-- ═════════════════════════════════════════════════════════════════════════
-- Presupuesto Golf 2026 (id 4): darle al DEVENGADO la forma de la cartera
--
-- PROBLEMA: las 16 partidas quedaron con `monto_devengado = monto`, o sea la
-- copia plana del cobro. Eso hace que el Comparativo en base devengado compare
-- el Real (prorrateado, plano) contra un presupuesto con el pico de caja de
-- enero y diciembre: la variación de esos meses no significa nada.
--
-- QUÉ HACE: para las partidas de CUOTA toma la **forma** mensual del devengado
-- real de la cartera y la aplica al **nivel ya presupuestado** — el total anual
-- de cada partida no se mueve ni un peso. Las partidas de venta diaria
-- (Green Fees, Torneos, Tee de Práctica…) no se tocan: ahí el servicio se
-- presta y se cobra el mismo día, así que `devengado = cobro` ya es correcto.
-- Tampoco se toca `monto`, que es lo que consume el Flujo de Efectivo.
--
-- POR QUÉ AHORA: la forma se deriva de la cartera, y la cartera acaba de
-- quedar limpia. Antes de la reexpresión traía $4.98M de condonación, así que
-- cualquier forma derivada de ahí habría heredado esa distorsión.
--
-- La regla de reparto es la misma del Comparativo: cada cuota se reparte en
-- `meses_devengo` meses desde su periodo (lib/clasificacionCobranza.ts →
-- repartirDevengo), y el concepto se resuelve prefiriendo el producto POS
-- sobre el concepto directo, igual que lib/cobranzaCuotas.ts. El IVA no
-- importa: se usa la proporción, no el monto, y dentro de una partida la tasa
-- es la misma.
-- ═════════════════════════════════════════════════════════════════════════


-- ══ 1. Forma real del devengado por concepto y mes ══════════════════════
DROP TABLE IF EXISTS ctrl.tmp_devengo_forma;
CREATE TABLE ctrl.tmp_devengo_forma AS
WITH cfg_pension AS (
  -- PENSION_CARRITO no tiene fila en cat_cuotas_config: su concepto vive en
  -- cfg_carritos, con la misma prioridad producto > concepto directo.
  SELECT COALESCE(pp.id_concepto_ingreso_fk, cc.id_concepto_ingreso_fk) AS id_concepto
  FROM golf.cfg_carritos cc
  LEFT JOIN golf.cat_productos_pos pp ON pp.id = cc.id_producto_pos_fk
  LIMIT 1
),
cuota_concepto AS (
  SELECT k.id                                                        AS id_cuota_config_fk,
         COALESCE(pp.id_concepto_ingreso_fk, k.id_concepto_ingreso_fk) AS id_concepto,
         GREATEST(COALESCE(k.meses_devengo, 1), 1)                   AS meses_devengo
  FROM golf.cat_cuotas_config k
  LEFT JOIN golf.cat_productos_pos pp ON pp.id = k.id_producto_pos_fk
),
base AS (
  SELECT x.id, x.periodo, x.monto_final,
         CASE WHEN x.tipo = 'PENSION_CARRITO' THEN (SELECT id_concepto FROM cfg_pension)
              ELSE cc.id_concepto END                               AS id_concepto,
         CASE WHEN x.tipo = 'PENSION_CARRITO' THEN 1
              ELSE COALESCE(cc.meses_devengo, 1) END                AS n
  FROM golf.cxc_golf x
  LEFT JOIN cuota_concepto cc ON cc.id_cuota_config_fk = x.id_cuota_config_fk
  WHERE x.status <> 'CANCELADO' AND x.periodo IS NOT NULL AND x.monto_final > 0
),
rebanadas AS (
  -- El último mes absorbe el redondeo, igual que repartirDevengo().
  SELECT b.id_concepto,
         TO_CHAR(TO_DATE(b.periodo || '-01', 'YYYY-MM-DD') + (i * INTERVAL '1 month'), 'YYYY-MM') AS periodo_dev,
         CASE WHEN i = b.n - 1
              THEN ROUND(b.monto_final - ROUND(b.monto_final / b.n, 2) * (b.n - 1), 2)
              ELSE ROUND(b.monto_final / b.n, 2) END AS monto
  FROM base b, generate_series(0, b.n - 1) AS i
  WHERE b.id_concepto IS NOT NULL
)
SELECT id_concepto,
       SUBSTRING(periodo_dev, 6, 2)::int AS mes,
       SUM(monto)::numeric(14,2)         AS devengado_real
FROM rebanadas
WHERE periodo_dev LIKE '2026-%'
GROUP BY 1, 2;

-- Qué conceptos entraron (deben ser Inscripciones, Membresías y Pensión)
SELECT f.id_concepto, ci.nombre,
       SUM(f.devengado_real)::numeric(14,2) AS devengado_2026,
       COUNT(*)                             AS meses_con_dato
FROM ctrl.tmp_devengo_forma f
LEFT JOIN cfg.conceptos_ingreso ci ON ci.id = f.id_concepto
GROUP BY 1, 2 ORDER BY 3 DESC;


-- ══ 2. PREVISUALIZACIÓN — qué quedaría en cada celda ════════════════════
-- `total_anual` no cambia: solo se redistribuye entre los meses.
WITH anual AS (
  SELECT d.id_partida_fk, SUM(d.monto)::numeric(14,2) AS total
  FROM ctrl.ppto_presupuesto_det d
  WHERE d.id_presupuesto_fk = 4
  GROUP BY 1
),
partidas AS (
  SELECT p.id AS id_partida, p.nombre, p.id_concepto_fk, a.total
  FROM ctrl.ppto_partidas p
  JOIN anual a ON a.id_partida_fk = p.id
  WHERE p.fuente_real = 'concepto'
    AND p.id_concepto_fk IN (SELECT id_concepto FROM ctrl.tmp_devengo_forma)
    AND a.total > 0
),
forma AS (
  SELECT pa.id_partida, pa.nombre, pa.total, f.mes,
         f.devengado_real / NULLIF(SUM(f.devengado_real) OVER (PARTITION BY pa.id_partida), 0) AS share
  FROM partidas pa
  JOIN ctrl.tmp_devengo_forma f ON f.id_concepto = pa.id_concepto_fk
),
nuevo AS (
  SELECT fo.*, ROUND(fo.total * fo.share, 2) AS devengado,
         ROW_NUMBER() OVER (PARTITION BY fo.id_partida ORDER BY fo.mes DESC) AS rn_desc
  FROM forma fo
)
SELECT n.id_partida, n.nombre, n.mes,
       d.monto            AS cobro,
       d.monto_devengado  AS devengado_hoy,
       CASE WHEN n.rn_desc = 1
            THEN ROUND(n.total - SUM(n.devengado) OVER (PARTITION BY n.id_partida) + n.devengado, 2)
            ELSE n.devengado END AS devengado_nuevo
FROM nuevo n
LEFT JOIN ctrl.ppto_presupuesto_det d
       ON d.id_presupuesto_fk = 4 AND d.id_partida_fk = n.id_partida AND d.mes = n.mes
ORDER BY n.nombre, n.mes;


-- ══ 3. RESPALDO ═════════════════════════════════════════════════════════
DROP TABLE IF EXISTS ctrl.bkp_ppto_det_4_forma;
CREATE TABLE ctrl.bkp_ppto_det_4_forma AS
  SELECT now() AS tomado_en, d.* FROM ctrl.ppto_presupuesto_det d
   WHERE d.id_presupuesto_fk = 4;


-- ══ 4. APLICAR ══════════════════════════════════════════════════════════
-- INSERT … ON CONFLICT porque un mes sin cobro presupuestado puede no tener
-- fila, y con la forma de cartera sí le toca devengado (es justo el caso de
-- Inscripciones: se cobra en enero y diciembre, se devenga los 12 meses).
-- El INSERT nace con `monto = 0`, que es lo correcto: ese mes no espera cobro.
WITH anual AS (
  SELECT d.id_partida_fk, SUM(d.monto)::numeric(14,2) AS total
  FROM ctrl.ppto_presupuesto_det d
  WHERE d.id_presupuesto_fk = 4
  GROUP BY 1
),
partidas AS (
  SELECT p.id AS id_partida, p.id_concepto_fk, a.total
  FROM ctrl.ppto_partidas p
  JOIN anual a ON a.id_partida_fk = p.id
  WHERE p.fuente_real = 'concepto'
    AND p.id_concepto_fk IN (SELECT id_concepto FROM ctrl.tmp_devengo_forma)
    AND a.total > 0
),
forma AS (
  SELECT pa.id_partida, pa.total, f.mes,
         f.devengado_real / NULLIF(SUM(f.devengado_real) OVER (PARTITION BY pa.id_partida), 0) AS share
  FROM partidas pa
  JOIN ctrl.tmp_devengo_forma f ON f.id_concepto = pa.id_concepto_fk
),
nuevo AS (
  SELECT fo.id_partida, fo.mes, fo.total,
         ROUND(fo.total * fo.share, 2) AS devengado,
         ROW_NUMBER() OVER (PARTITION BY fo.id_partida ORDER BY fo.mes DESC) AS rn_desc
  FROM forma fo
),
final AS (
  SELECT n.id_partida, n.mes,
         CASE WHEN n.rn_desc = 1
              THEN ROUND(n.total - SUM(n.devengado) OVER (PARTITION BY n.id_partida) + n.devengado, 2)
              ELSE n.devengado END AS devengado
  FROM nuevo n
)
INSERT INTO ctrl.ppto_presupuesto_det (id_presupuesto_fk, id_partida_fk, mes, monto, monto_devengado)
SELECT 4, f.id_partida, f.mes, 0, f.devengado
FROM final f
ON CONFLICT (id_presupuesto_fk, id_partida_fk, mes)
DO UPDATE SET monto_devengado = EXCLUDED.monto_devengado;


-- ══ 5. VERIFICAR ════════════════════════════════════════════════════════

-- 5a. El total anual de cada partida NO debe haber cambiado en ninguna de las
--     dos series. Debe salir VACÍO.
SELECT p.nombre,
       SUM(b.monto)::numeric(14,2)            AS cobro_antes,
       SUM(d.monto)::numeric(14,2)            AS cobro_despues,
       SUM(b.monto_devengado)::numeric(14,2)  AS devengado_antes,
       SUM(d.monto_devengado)::numeric(14,2)  AS devengado_despues
FROM ctrl.ppto_presupuesto_det d
JOIN ctrl.ppto_partidas p ON p.id = d.id_partida_fk
LEFT JOIN ctrl.bkp_ppto_det_4_forma b
       ON b.id_partida_fk = d.id_partida_fk AND b.mes = d.mes
WHERE d.id_presupuesto_fk = 4
GROUP BY p.nombre
HAVING ABS(COALESCE(SUM(b.monto), 0) - SUM(d.monto)) > 0.05
    OR ABS(COALESCE(SUM(b.monto_devengado), 0) - SUM(d.monto_devengado)) > 0.05;

-- 5b. Cómo quedó la forma: cobro vs devengado mes a mes en las partidas de cuota
SELECT p.nombre, d.mes, d.monto AS cobro, d.monto_devengado AS devengado,
       ROUND(d.monto_devengado / NULLIF(SUM(d.monto_devengado) OVER (PARTITION BY p.nombre), 0) * 100, 1) AS pct_del_anio
FROM ctrl.ppto_presupuesto_det d
JOIN ctrl.ppto_partidas p ON p.id = d.id_partida_fk
WHERE d.id_presupuesto_fk = 4
  AND p.id_concepto_fk IN (SELECT id_concepto FROM ctrl.tmp_devengo_forma)
ORDER BY p.nombre, d.mes;

-- 5c. Ninguna celda de devengado sin capturar en las partidas tocadas
SELECT p.nombre, d.mes FROM ctrl.ppto_presupuesto_det d
JOIN ctrl.ppto_partidas p ON p.id = d.id_partida_fk
WHERE d.id_presupuesto_fk = 4 AND d.monto_devengado IS NULL
  AND p.id_concepto_fk IN (SELECT id_concepto FROM ctrl.tmp_devengo_forma);


-- ══ 6. VUELTA ATRÁS ═════════════════════════════════════════════════════
-- UPDATE ctrl.ppto_presupuesto_det d SET monto_devengado = b.monto_devengado
--   FROM ctrl.bkp_ppto_det_4_forma b
--  WHERE b.id_presupuesto_fk = d.id_presupuesto_fk AND b.id_partida_fk = d.id_partida_fk AND b.mes = d.mes;
-- (Las filas que el bloque 4 haya INSERTADO no están en el respaldo; se
--  identifican porque tienen monto = 0 y no aparecen en ctrl.bkp_ppto_det_4_forma.)


-- ══ 7. ¿SE VE BIEN EL COMPARATIVO? ══════════════════════════════════════
-- Reproduce lo que el Comparativo dibuja en base Devengado para las partidas
-- de ingreso de Golf 2026: presupuesto contra Real. Calca la regla del código
-- (lib/cobranzaCuotas.ts → fetchDevengadoSinIvaPorPartida):
--   · el Real se prorratea en meses_devengo desde el periodo de la cuota;
--   · se le quita el IVA con la tasa del CONCEPTO, resuelta desde
--     cat_productos_pos — si los productos de un concepto no coinciden en tasa,
--     el código lo EXCLUYE, así que aquí también sale NULL y hay que verlo.
-- Si estos números no empatan con la pantalla, el problema está en el reporte,
-- no en los datos.
WITH tasa AS (
  SELECT pp.id_concepto_ingreso_fk AS id_concepto,
         CASE WHEN COUNT(DISTINCT CASE WHEN pp.aplica_iva IS FALSE THEN 0
                                       ELSE COALESCE(pp.iva_pct, 0) END) = 1
              THEN MIN(CASE WHEN pp.aplica_iva IS FALSE THEN 0
                            ELSE COALESCE(pp.iva_pct, 0) END)
              ELSE NULL END AS iva_pct
  FROM golf.cat_productos_pos pp
  WHERE pp.id_concepto_ingreso_fk IS NOT NULL
  GROUP BY 1
),
real_sin_iva AS (
  SELECT f.id_concepto, f.mes,
         ROUND(f.devengado_real / (1 + t.iva_pct / 100.0), 2) AS real_sin_iva,
         t.iva_pct
  FROM ctrl.tmp_devengo_forma f
  LEFT JOIN tasa t ON t.id_concepto = f.id_concepto
),
ppto AS (
  SELECT d.id_partida_fk, d.mes, d.monto_devengado, p.nombre, p.id_concepto_fk
  FROM ctrl.ppto_presupuesto_det d
  JOIN ctrl.ppto_partidas p ON p.id = d.id_partida_fk
  WHERE d.id_presupuesto_fk = 4 AND p.fuente_real = 'concepto' AND p.id_concepto_fk IS NOT NULL
)
SELECT pp.nombre, pp.mes,
       pp.monto_devengado::numeric(14,2)              AS presupuesto,
       COALESCE(r.real_sin_iva, 0)::numeric(14,2)     AS real_devengado,
       (COALESCE(r.real_sin_iva, 0) - pp.monto_devengado)::numeric(14,2) AS variacion,
       r.iva_pct   -- NULL aquí = el Comparativo EXCLUYE ese concepto del Real
FROM ppto pp
LEFT JOIN real_sin_iva r ON r.id_concepto = pp.id_concepto_fk AND r.mes = pp.mes
ORDER BY pp.nombre, pp.mes;

-- 7b. Resumen anual por partida — la foto de una línea
WITH tasa AS (
  SELECT pp.id_concepto_ingreso_fk AS id_concepto,
         CASE WHEN COUNT(DISTINCT CASE WHEN pp.aplica_iva IS FALSE THEN 0
                                       ELSE COALESCE(pp.iva_pct, 0) END) = 1
              THEN MIN(CASE WHEN pp.aplica_iva IS FALSE THEN 0
                            ELSE COALESCE(pp.iva_pct, 0) END)
              ELSE NULL END AS iva_pct
  FROM golf.cat_productos_pos pp
  WHERE pp.id_concepto_ingreso_fk IS NOT NULL
  GROUP BY 1
)
SELECT p.nombre,
       SUM(d.monto)::numeric(14,2)                           AS ppto_cobro,
       SUM(d.monto_devengado)::numeric(14,2)                 AS ppto_devengado,
       COALESCE(SUM(ROUND(f.devengado_real / (1 + t.iva_pct / 100.0), 2)), 0)::numeric(14,2) AS real_devengado,
       MAX(t.iva_pct)                                        AS iva_pct,
       -- Pico del año: cuántas veces el mes mayor sobre el promedio. Si el
       -- devengado sigue picudo (>1.5), la forma no se aplicó donde debía.
       ROUND(MAX(d.monto_devengado) / NULLIF(AVG(d.monto_devengado), 0), 2) AS pico_devengado,
       ROUND(MAX(d.monto)           / NULLIF(AVG(d.monto), 0), 2)           AS pico_cobro
FROM ctrl.ppto_presupuesto_det d
JOIN ctrl.ppto_partidas p ON p.id = d.id_partida_fk
LEFT JOIN ctrl.tmp_devengo_forma f ON f.id_concepto = p.id_concepto_fk AND f.mes = d.mes
LEFT JOIN tasa t ON t.id_concepto = p.id_concepto_fk
WHERE d.id_presupuesto_fk = 4
GROUP BY p.nombre
ORDER BY ppto_cobro DESC;
