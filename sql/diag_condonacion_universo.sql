-- ─────────────────────────────────────────────────────────────────────────
-- Universo de CONDONACIONES en cobranza (Golf / Hípico / Locales)
-- Correr en el SQL Editor de Supabase (proyecto Balvanera: lgftbeiafwyafvoodowr).
--
-- POR QUÉ EXISTE: las cuotas se cobraron a un PRECIO PACTADO por socio, pero el
-- cargo nació con el precio de LISTA de la categoría (golf.cat_cuotas_config_det).
-- La diferencia se liquidó con la forma de pago «Condonación» (SAT 15), que
-- extingue saldo igual que una transferencia. Resultado: cartera, devengado,
-- ticket POS, corte, recibo de ingreso y (si se facturó) el CFDI quedaron
-- inflados por dinero que nunca existió.
--
-- ESTE SCRIPT SOLO LEE. La reexpresión va en el bloque 9, comentada, y no debe
-- correrse antes de decidir el corte de universo (ver bloque 2).
--
-- CÓMO CORRERLO: los bloques 4, 5 y 9 dependen de la vista temporal
-- `v_cond_cuota` que crea el bloque 4, y una TEMP VIEW solo vive dentro de la
-- misma ejecución. Corre del bloque 4 en adelante de una sola vez (o vuelve a
-- crear la vista antes de cada bloque suelto).
--
-- Contexto: lib/cobranzaCuotas.ts (prorrateo de la condonación),
-- app/golf/carritos/CobrarCuotaModal.tsx (cadena cuota→recibo→ticket),
-- app/golf/pos/CorteModal.tsx (corte→recibo de ingreso).
-- ─────────────────────────────────────────────────────────────────────────


-- ══ 1. Qué formas de pago cuentan como condonación ══════════════════════
-- Al 2026-09-21: id 11 «Condonación» (SAT 15) e id 15 «Remisión de deuda»
-- (SAT 25), las dos YA INACTIVAS en el catálogo — o sea, hoy no se pueden
-- volver a elegir en los modales (filtran por activo = true).
SELECT id, nombre, codigo_sat, activo
FROM cfg.formas_pago
WHERE codigo_sat IN ('15', '25') OR nombre ILIKE '%condona%' OR nombre ILIKE '%remisi%'
ORDER BY id;


-- ══ 2. GOLF — el universo, segmentado por lo que se puede reexpresar ════
-- U1  sin ticket POS  → reexpresable sin consecuencias: no hay venta, ni corte,
--                        ni recibo de ingreso, ni CFDI. Es la carga inicial de
--                        cartera (arranque_cobranza_golf = 2026-07-01).
-- U2  ticket sin CFDI  → reexpresable, pero arrastra venta + corte + recibo de
--                        ingreso (libro de ingresos de un mes ya cerrado).
-- U3  ticket CON CFDI  → el pasado fiscal no se reescribe: cancelar y refacturar
--                        (POS → Ventas) o congelar. Decisión del usuario.
-- U0  recibo cancelado → nada que hacer.
WITH cond_por_recibo AS (
  SELECT p.id_recibo_fk,
         SUM(p.monto)                                                        AS pagado_total,
         SUM(p.monto) FILTER (WHERE f.codigo_sat IN ('15','25')
                                 OR p.forma_nombre ILIKE '%condona%'
                                 OR p.forma_nombre ILIKE '%remisi%')         AS condonado
  FROM golf.recibos_golf_pagos p
  LEFT JOIN cfg.formas_pago f ON f.id = p.id_forma_pago_fk
  GROUP BY p.id_recibo_fk
)
SELECT
  CASE
    WHEN r.status <> 'VIGENTE'                      THEN 'U0 · recibo no vigente'
    WHEN r.id_venta_pos_fk IS NULL                  THEN 'U1 · sin ticket POS (carga inicial)'
    WHEN v.folio_fiscal IS NULL                     THEN 'U2 · ticket POS sin CFDI'
    ELSE                                                 'U3 · ticket POS con CFDI timbrado'
  END                                                                        AS universo,
  COUNT(*)                                                                   AS recibos,
  SUM(c.condonado)::numeric(14,2)                                            AS condonado,
  SUM(r.total)::numeric(14,2)                                                AS total_recibos,
  SUM(c.condonado) FILTER (WHERE ABS(r.total - c.condonado) < 0.01)::numeric(14,2) AS solo_condonacion,
  COUNT(*) FILTER (WHERE v.id_corte_fk IS NOT NULL)                          AS con_corte,
  MIN(r.fecha_recibo)                                                        AS desde,
  MAX(r.fecha_recibo)                                                        AS hasta
FROM cond_por_recibo c
JOIN golf.recibos_golf r ON r.id = c.id_recibo_fk
LEFT JOIN golf.ctrl_ventas v ON v.id = r.id_venta_pos_fk
WHERE c.condonado > 0
GROUP BY 1
ORDER BY 1;


-- ══ 3. GOLF — control de totales ════════════════════════════════════════
-- Debe empatar con el reporte Composición del Ingreso por Cuotas 2026
-- ($5,000,177.17 condonados de $18,385,894.44 al 2026-09-21).
WITH cond AS (
  SELECT p.id_recibo_fk, SUM(p.monto) AS condonado
  FROM golf.recibos_golf_pagos p
  LEFT JOIN cfg.formas_pago f ON f.id = p.id_forma_pago_fk
  WHERE f.codigo_sat IN ('15','25') OR p.forma_nombre ILIKE '%condona%' OR p.forma_nombre ILIKE '%remisi%'
  GROUP BY 1
)
SELECT EXTRACT(YEAR FROM r.fecha_recibo)::int AS anio,
       TO_CHAR(r.fecha_recibo, 'YYYY-MM')     AS mes,
       COUNT(*)                               AS recibos,
       SUM(c.condonado)::numeric(14,2)        AS condonado
FROM cond c JOIN golf.recibos_golf r ON r.id = c.id_recibo_fk
WHERE r.status = 'VIGENTE'
GROUP BY 1, 2 ORDER BY 1, 2;


-- ══ 4. GOLF — prorrateo a nivel cuota y PRECIO PACTADO implícito ════════
-- El recibo guarda el monto de cada forma de pago pero no a qué línea tocó, así
-- que la parte condonada de cada cuota se reparte en proporción a lo que el
-- recibo aplicó a esa línea — el mismo criterio de `condonadoGolf` en
-- lib/cobranzaCuotas.ts (no se adivina: se calcula).
CREATE TEMP VIEW v_cond_cuota AS
WITH cond AS (
  SELECT p.id_recibo_fk,
         SUM(p.monto)                                                  AS pagado_total,
         SUM(p.monto) FILTER (WHERE f.codigo_sat IN ('15','25')
                                 OR p.forma_nombre ILIKE '%condona%'
                                 OR p.forma_nombre ILIKE '%remisi%')   AS condonado
  FROM golf.recibos_golf_pagos p
  LEFT JOIN cfg.formas_pago f ON f.id = p.id_forma_pago_fk
  GROUP BY 1
)
SELECT d.id_cuota_fk,
       d.id_recibo_fk,
       r.folio,
       r.fecha_recibo,
       d.monto_final                                                   AS aplicado_a_la_cuota,
       ROUND(d.monto_final * (c.condonado / NULLIF(c.pagado_total, 0)), 2) AS condonado_linea
FROM golf.recibos_golf_det d
JOIN golf.recibos_golf r ON r.id = d.id_recibo_fk
JOIN cond c              ON c.id_recibo_fk = d.id_recibo_fk
WHERE r.status = 'VIGENTE' AND c.condonado > 0 AND d.id_cuota_fk IS NOT NULL;

SELECT x.id                                          AS id_cuota,
       s.numero_socio,
       CONCAT_WS(' ', s.nombre, s.apellido_paterno, s.apellido_materno) AS socio,
       cat.nombre                                    AS categoria,
       x.tipo, x.periodo, x.status,
       x.monto_original                              AS lista,
       x.monto_final                                 AS cargado,
       SUM(vc.condonado_linea)::numeric(12,2)        AS condonado,
       (x.monto_final - SUM(vc.condonado_linea))::numeric(12,2) AS pactado_implicito,
       STRING_AGG(vc.folio, ', ' ORDER BY vc.fecha_recibo)      AS recibos
FROM v_cond_cuota vc
JOIN golf.cxc_golf x        ON x.id = vc.id_cuota_fk
LEFT JOIN golf.cat_socios s ON s.id = x.id_socio_fk
LEFT JOIN golf.cat_categorias_socios cat ON cat.id = s.id_categoria_fk
GROUP BY x.id, s.numero_socio, s.nombre, s.apellido_paterno, s.apellido_materno,
         cat.nombre, x.tipo, x.periodo, x.status, x.monto_original, x.monto_final
ORDER BY s.numero_socio, x.tipo, x.periodo;


-- ══ 5. GOLF — semilla del catálogo de TARIFA PACTADA por socio ══════════
-- Una fila por socio × tipo de cuota. `pactado_distintos = 1` significa que el
-- socio pagó siempre lo mismo → el precio pactado es un dato limpio y se puede
-- sembrar tal cual en golf.cuotas_socios. Si son varios, hay que revisarlo a
-- mano antes de sembrar (puede haber cambio de tarifa a media anualidad).
SELECT s.numero_socio,
       CONCAT_WS(' ', s.nombre, s.apellido_paterno, s.apellido_materno) AS socio,
       cat.nombre                                       AS categoria,
       x.tipo,
       COUNT(*)                                         AS cuotas_con_condonacion,
       MAX(x.monto_final)::numeric(12,2)                AS lista,
       COUNT(DISTINCT ROUND(x.monto_final - vc.cond, 2)) AS pactado_distintos,
       MIN(ROUND(x.monto_final - vc.cond, 2))::numeric(12,2) AS pactado_min,
       MAX(ROUND(x.monto_final - vc.cond, 2))::numeric(12,2) AS pactado_max,
       SUM(vc.cond)::numeric(14,2)                      AS condonado_total
FROM (SELECT id_cuota_fk, SUM(condonado_linea) AS cond FROM v_cond_cuota GROUP BY 1) vc
JOIN golf.cxc_golf x        ON x.id = vc.id_cuota_fk
LEFT JOIN golf.cat_socios s ON s.id = x.id_socio_fk
LEFT JOIN golf.cat_categorias_socios cat ON cat.id = s.id_categoria_fk
GROUP BY s.numero_socio, s.nombre, s.apellido_paterno, s.apellido_materno, cat.nombre, x.tipo
ORDER BY condonado_total DESC;


-- ══ 6. HÍPICO y LOCALES ═════════════════════════════════════════════════
-- Aquí el precio ya nace pactado (ctrl_asignaciones.monto_mensual /
-- loc_asignaciones.monto_mensual), así que una condonación NO es diferencia de
-- tarifa: es perdón de adeudo. Se listan aparte a propósito.
-- Nota: cxc_hip y loc_cxc no tienen id_recibo_fk (por eso lib/cobranzaCuotas.ts
-- las reporta como "indeterminado"), pero el detalle del recibo SÍ apunta a la
-- cuota, así que por SQL el reparto sí es exacto.
WITH hip AS (
  SELECT 'Hípico' AS modulo, r.id AS id_recibo, r.folio, r.fecha_recibo, r.total,
         SUM(p.monto) FILTER (WHERE f.codigo_sat IN ('15','25')
                                 OR p.forma_nombre ILIKE '%condona%'
                                 OR p.forma_nombre ILIKE '%remisi%') AS condonado,
         SUM(p.monto) AS pagado_total, r.id_venta_pos_fk
  FROM hip.recibos_hip r
  JOIN hip.recibos_hip_pagos p ON p.id_recibo_fk = r.id
  LEFT JOIN cfg.formas_pago f  ON f.id = p.id_forma_pago_fk
  WHERE r.status = 'VIGENTE'
  GROUP BY r.id, r.folio, r.fecha_recibo, r.total, r.id_venta_pos_fk
), loc AS (
  SELECT 'Locales' AS modulo, r.id AS id_recibo, r.folio, r.fecha_recibo, r.total,
         SUM(p.monto) FILTER (WHERE f.codigo_sat IN ('15','25')
                                 OR p.forma_nombre ILIKE '%condona%'
                                 OR p.forma_nombre ILIKE '%remisi%') AS condonado,
         SUM(p.monto) AS pagado_total, r.id_venta_pos_fk
  FROM ctrl.loc_recibos r
  JOIN ctrl.loc_recibos_pagos p ON p.id_recibo_fk = r.id
  LEFT JOIN cfg.formas_pago f   ON f.id = p.id_forma_pago_fk
  WHERE r.status = 'VIGENTE'
  GROUP BY r.id, r.folio, r.fecha_recibo, r.total, r.id_venta_pos_fk
)
SELECT modulo, COUNT(*) AS recibos, SUM(condonado)::numeric(14,2) AS condonado,
       COUNT(*) FILTER (WHERE id_venta_pos_fk IS NOT NULL) AS con_ticket_pos,
       MIN(fecha_recibo) AS desde, MAX(fecha_recibo) AS hasta
FROM (SELECT * FROM hip UNION ALL SELECT * FROM loc) t
WHERE condonado > 0
GROUP BY modulo;


-- ══ 7. Rastro hacia el LIBRO DE INGRESOS y la caja ══════════════════════
-- app/golf/pos/CorteModal.tsx → mapFormasPago(): la condonación no cae en
-- ninguna rama conocida, así que entra por el `else` final a monto_efectivo.
-- Esto mide cuánta condonación se convirtió en "efectivo" dentro de un corte y
-- de su recibo de ingreso (y de ahí al Estado de Resultados y a la conciliación).
WITH cond AS (
  SELECT p.id_recibo_fk, SUM(p.monto) AS condonado
  FROM golf.recibos_golf_pagos p
  LEFT JOIN cfg.formas_pago f ON f.id = p.id_forma_pago_fk
  WHERE f.codigo_sat IN ('15','25') OR p.forma_nombre ILIKE '%condona%' OR p.forma_nombre ILIKE '%remisi%'
  GROUP BY 1
)
SELECT co.id                                   AS id_corte,
       co.id_recibo_ingreso,
       ri.fecha, ri.descripcion,
       ri.monto_total::numeric(14,2),
       ri.monto_efectivo::numeric(14,2),
       SUM(c.condonado)::numeric(14,2)         AS condonado_dentro_del_corte
FROM cond c
JOIN golf.recibos_golf r  ON r.id = c.id_recibo_fk AND r.status = 'VIGENTE'
JOIN golf.ctrl_ventas v   ON v.id = r.id_venta_pos_fk
JOIN golf.ctrl_cortes_caja co ON co.id = v.id_corte_fk
LEFT JOIN ctrl.recibos_ingreso ri ON ri.id = co.id_recibo_ingreso
GROUP BY co.id, co.id_recibo_ingreso, ri.fecha, ri.descripcion, ri.monto_total, ri.monto_efectivo
ORDER BY ri.fecha;

-- Y la condonación que quedó escrita como forma de pago del recibo de ingreso:
SELECT ri.id, ri.fecha, ri.descripcion, fp.nombre_forma_pago, fp.monto::numeric(14,2)
FROM ctrl.recibos_ingreso_formas_pago fp
JOIN ctrl.recibos_ingreso ri ON ri.id = fp.id_recibo_fk
WHERE fp.nombre_forma_pago ILIKE '%condona%' OR fp.nombre_forma_pago ILIKE '%remisi%'
ORDER BY ri.fecha;


-- ══ 8. Contraste con el presupuesto (corroboración de la hipótesis) ═════
-- Si la condonación es diferencia de tarifa, el devengado de la cartera debe
-- estar por arriba del presupuesto 2026 de Golf casi exactamente en el monto
-- condonado (al 2026-09-21: hueco de $4.81M vs $5.00M condonados).
SELECT pd.id_partida_fk, pa.nombre AS partida,
       SUM(pd.monto)::numeric(14,2)            AS ppto_cobro,
       SUM(pd.monto_devengado)::numeric(14,2)  AS ppto_devengado
FROM ctrl.ppto_presupuesto_det pd
JOIN ctrl.ppto_partidas pa ON pa.id = pd.id_partida_fk
WHERE pd.id_presupuesto_fk = 4      -- Golf 2026
GROUP BY pd.id_partida_fk, pa.nombre
ORDER BY 2;
-- (Presupuestos vive en ctrl.ppto_*, no en un schema propio — ver la regla de
-- "no crear schemas nuevos" en la memoria del proyecto.)


-- ══ 9. REEXPRESIÓN — NO CORRER SIN DECIDIR EL UNIVERSO ══════════════════
-- Regla: el cargo baja al precio pactado y el pago condonado desaparece. Como
-- cxc_golf.monto_final es GENERATED (monto_original - descuento), se baja
-- `monto_original`; `saldo` NO se toca (la parte condonada se retira de los dos
-- lados de la resta, así que el saldo sigue siendo el correcto).
--
-- ORDEN OBLIGATORIO: respaldo → cuotas → detalle del recibo → cabecera del
-- recibo → pagos → (solo U2) venta POS, corte y recibo de ingreso.
--
-- 9.0 Respaldo — nunca reexpresar sin foto previa
-- CREATE TABLE IF NOT EXISTS golf.bkp_condonacion_2026 AS
--   SELECT now() AS tomado_en, x.* FROM golf.cxc_golf x
--   WHERE x.id IN (SELECT id_cuota_fk FROM v_cond_cuota);
-- CREATE TABLE IF NOT EXISTS golf.bkp_condonacion_recibos_2026 AS
--   SELECT now() AS tomado_en, r.* FROM golf.recibos_golf r
--   WHERE r.id IN (SELECT DISTINCT id_recibo_fk FROM v_cond_cuota);
-- CREATE TABLE IF NOT EXISTS golf.bkp_condonacion_pagos_2026 AS
--   SELECT now() AS tomado_en, p.* FROM golf.recibos_golf_pagos p
--   WHERE p.id_recibo_fk IN (SELECT DISTINCT id_recibo_fk FROM v_cond_cuota);
--
-- 9.1 Cuotas: el cargo pasa de lista a pactado
-- UPDATE golf.cxc_golf x
--    SET monto_original = ROUND(x.monto_original - vc.cond, 2),
--        observaciones  = CONCAT_WS(' | ', x.observaciones,
--          'Reexpresado a precio pactado el ' || CURRENT_DATE ||
--          ' (antes ' || x.monto_original || ', condonación retirada ' || vc.cond || ')')
--   FROM (SELECT id_cuota_fk, SUM(condonado_linea) AS cond FROM v_cond_cuota GROUP BY 1) vc
--  WHERE x.id = vc.id_cuota_fk;
--
-- 9.2 Detalle del recibo (es la fuente del ticket y del CFDI)
-- UPDATE golf.recibos_golf_det d
--    SET monto_final    = ROUND(d.monto_final - vc.condonado_linea, 2),
--        monto_original = ROUND(d.monto_original - vc.condonado_linea, 2)
--   FROM v_cond_cuota vc
--  WHERE vc.id_recibo_fk = d.id_recibo_fk AND vc.id_cuota_fk = d.id_cuota_fk;
--
-- 9.3 Cabecera del recibo: el total baja a lo que sí entró
-- UPDATE golf.recibos_golf r
--    SET subtotal = ROUND(r.subtotal - c.condonado, 2),
--        total    = ROUND(r.total    - c.condonado, 2)
--   FROM (SELECT id_recibo_fk, SUM(condonado_linea) AS condonado FROM v_cond_cuota GROUP BY 1) c
--  WHERE r.id = c.id_recibo_fk;
--
-- 9.4 Borrar las líneas de pago condonadas (y recalcular el texto del header)
-- DELETE FROM golf.recibos_golf_pagos p
--  USING cfg.formas_pago f
--  WHERE f.id = p.id_forma_pago_fk AND f.codigo_sat IN ('15','25');
-- UPDATE golf.recibos_golf r SET forma_pago_nombre = sub.formas
--   FROM (SELECT id_recibo_fk, STRING_AGG(forma_nombre, ' + ' ORDER BY id) AS formas
--           FROM golf.recibos_golf_pagos GROUP BY 1) sub
--  WHERE r.id = sub.id_recibo_fk;
-- UPDATE golf.cxc_golf x SET forma_pago = r.forma_pago_nombre
--   FROM golf.recibos_golf r WHERE r.id = x.id_recibo_fk;
--
-- 9.5 Solo U2 (ticket POS sin CFDI): venta, líneas, pagos, corte y recibo de
--     ingreso. Cada uno mueve un libro distinto, así que va en su propia
--     migración y con su propio control de totales. U3 (con CFDI) NO se toca
--     por SQL: se cancela y refactura desde POS → Ventas.
