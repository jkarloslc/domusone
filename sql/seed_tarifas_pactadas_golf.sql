-- ═════════════════════════════════════════════════════════════════════════
-- SEMBRADO de golf.cuotas_socios desde la cobranza real
--
-- ⚠️ ORDEN: este script va ANTES de sql/fase2_reexpresion_condonacion_u1.sql.
-- El precio pactado se deriva de `monto_final − condonación`, y la Fase 2
-- borra la condonación. Después de reexpresar ya no hay de dónde derivarlo.
--
-- Requiere la migración 20260921180000 (golf.cuotas_socios) ya ejecutada.
-- Correr en el SQL Editor de Supabase. Es idempotente: re-correrlo no duplica.
--
-- QUÉ SIEMBRA Y QUÉ NO — tres reglas, todas revisables antes de correr:
--
--  1. Solo **MENSUALIDAD**. La inscripción se cobra una vez y ya ocurrió: no
--     hay cargo futuro que proteger. Para un socio nuevo, la tarifa de su
--     inscripción se captura a mano en «Tarifas pactadas» antes de generarla.
--     PENSION_CARRITO tampoco: sus cuotas nacen en PensionModal con monto
--     capturado, no pasan por el generador que lee esta tabla.
--
--  2. Solo si el precio pactado es **estable** (un solo valor distinto) Y
--     cubre **todas** las cuotas de ese tipo del socio. Si pagó 9 meses a
--     precio de lista y 3 con condonación, eso no es su tarifa: es un evento
--     puntual. Esos casos se listan al final para revisarlos a mano.
--
--  3. Vigencia **abierta** (`vigente_hasta = NULL`): un precio pactado con un
--     socio sigue vigente hasta que se renegocie. Si prefieres que caduque al
--     cierre de 2026 y obligar a una renovación explícita, cambia el NULL de
--     `vigente_hasta` por `'2026-12'` abajo — pero entonces en enero de 2027
--     los cargos vuelven a nacer al precio de lista.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. Precio pactado implícito, cuota por cuota ────────────────────────
-- Mismo prorrateo del diagnóstico: la parte condonada de cada línea del recibo
-- en proporción a lo que ese recibo aplicó a esa línea.
DROP TABLE IF EXISTS golf.tmp_pactado_por_cuota;
CREATE TABLE golf.tmp_pactado_por_cuota AS
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
lin AS (
  SELECT d.id_cuota_fk,
         ROUND(d.monto_final * (c.condonado / NULLIF(c.pagado_total, 0)), 2) AS condonado_linea
  FROM golf.recibos_golf_det d
  JOIN golf.recibos_golf r ON r.id = d.id_recibo_fk
  JOIN cond c              ON c.id_recibo_fk = d.id_recibo_fk
  WHERE r.status = 'VIGENTE' AND c.condonado > 0 AND d.id_cuota_fk IS NOT NULL
)
SELECT x.id                                        AS id_cuota,
       x.id_socio_fk,
       x.id_cuota_config_fk,
       x.tipo,
       x.periodo,
       x.monto_final                               AS lista,
       SUM(l.condonado_linea)::numeric(12,2)       AS condonado,
       ROUND(x.monto_final - SUM(l.condonado_linea), 2) AS pactado
FROM lin l
JOIN golf.cxc_golf x ON x.id = l.id_cuota_fk
WHERE x.status <> 'CANCELADO'
GROUP BY x.id, x.id_socio_fk, x.id_cuota_config_fk, x.tipo, x.periodo, x.monto_final;

-- ── 2. Agregado por socio × cuota, con las dos pruebas de estabilidad ───
DROP TABLE IF EXISTS golf.tmp_pactado_por_socio;
CREATE TABLE golf.tmp_pactado_por_socio AS
SELECT p.id_socio_fk,
       p.id_cuota_config_fk,
       p.tipo,
       COUNT(*)                                    AS cuotas_con_condonacion,
       -- Cuántas cuotas de ese tipo tiene en total (vivas). Si no coinciden,
       -- el precio pactado no cubre toda su cartera y no se siembra.
       (SELECT COUNT(*) FROM golf.cxc_golf y
         WHERE y.id_socio_fk = p.id_socio_fk
           AND y.id_cuota_config_fk = p.id_cuota_config_fk
           AND y.status <> 'CANCELADO')            AS cuotas_totales,
       COUNT(DISTINCT p.pactado)                   AS pactado_distintos,
       MIN(p.pactado)::numeric(12,2)               AS pactado,
       MAX(p.lista)::numeric(12,2)                 AS lista,
       MIN(p.periodo)                              AS periodo_min,
       MAX(p.periodo)                              AS periodo_max,
       SUM(p.condonado)::numeric(14,2)             AS condonado_total
FROM golf.tmp_pactado_por_cuota p
WHERE p.id_cuota_config_fk IS NOT NULL
GROUP BY p.id_socio_fk, p.id_cuota_config_fk, p.tipo;

-- ── 3. Sembrar ──────────────────────────────────────────────────────────
INSERT INTO golf.cuotas_socios
  (id_socio_fk, id_cuota_config_fk, monto, vigente_desde, vigente_hasta, motivo_excepcion, usuario_crea)
SELECT s.id_socio_fk,
       s.id_cuota_config_fk,
       s.pactado,
       s.periodo_min,
       NULL,                                  -- ← '2026-12' si la quieres cerrada
       'Precio pactado derivado de la cobranza real ' || s.periodo_min || '–' || s.periodo_max ||
         ' (lista $' || s.lista || ', pactado $' || s.pactado || '). Sembrado el ' || CURRENT_DATE ||
         ' al retirar la condonación. Revisar contra el convenio del socio.',
       'sembrado-condonacion'
FROM golf.tmp_pactado_por_socio s
WHERE s.tipo = 'MENSUALIDAD'
  AND s.pactado_distintos = 1
  AND s.cuotas_con_condonacion = s.cuotas_totales
  AND s.pactado >= 0
ON CONFLICT DO NOTHING;

-- ── 4. Qué se sembró ────────────────────────────────────────────────────
SELECT COUNT(*)                                   AS tarifas_sembradas,
       COUNT(*) FILTER (WHERE monto = 0)          AS en_cortesia,
       MIN(monto)::numeric(12,2)                  AS min_pactado,
       MAX(monto)::numeric(12,2)                  AS max_pactado
FROM golf.cuotas_socios
WHERE usuario_crea = 'sembrado-condonacion';

-- ── 5. Qué NO se sembró y por qué — revisar a mano ──────────────────────
SELECT COALESCE(so.numero_socio, '') || ' ' ||
         CONCAT_WS(' ', so.nombre, so.apellido_paterno, so.apellido_materno) AS socio,
       s.tipo,
       s.cuotas_con_condonacion, s.cuotas_totales,
       s.pactado_distintos, s.lista, s.pactado,
       s.periodo_min, s.periodo_max, s.condonado_total,
       CASE
         WHEN s.tipo <> 'MENSUALIDAD'                        THEN 'Cuota no recurrente (inscripción/pensión): se captura a mano si hace falta'
         WHEN s.pactado_distintos > 1                        THEN 'Pagó dos precios distintos en el año: decidir cuál es la tarifa vigente'
         WHEN s.cuotas_con_condonacion <> s.cuotas_totales   THEN 'La condonación cubre solo parte de sus cuotas: evento puntual, no tarifa'
         ELSE 'Otro'
       END                                                   AS motivo
FROM golf.tmp_pactado_por_socio s
LEFT JOIN golf.cat_socios so ON so.id = s.id_socio_fk
WHERE NOT (s.tipo = 'MENSUALIDAD'
           AND s.pactado_distintos = 1
           AND s.cuotas_con_condonacion = s.cuotas_totales)
ORDER BY s.condonado_total DESC;

-- ── 6. Cuotas sin config: no se les puede colgar una tarifa ─────────────
-- (PENSION_CARRITO histórico sobre todo; se cargan desde PensionModal.)
SELECT COUNT(*) AS cuotas_sin_cuota_config, SUM(condonado)::numeric(14,2) AS condonado
FROM golf.tmp_pactado_por_cuota WHERE id_cuota_config_fk IS NULL;

-- Las tablas golf.tmp_pactado_* se dejan a propósito: la Fase 2 las vuelve a
-- calcular por su cuenta, pero sirven para auditar de dónde salió cada tarifa.
