-- =============================================================
-- Condonación / Intercambio NO suma en ningún lado.
--
-- recibos_ingreso.monto_condonacion (migr. 20261113170000) se capturaba como
-- forma de cobro pero el recibo y sus líneas seguían sumándolo: el Real de
-- Comparativo, Flujo, reportes e Ingresos lo contaban como ingreso.
--
-- Ahora (lib/condonacionRecibo.ts → netearCondonacion):
--   recibos_ingreso.monto_total          = total NETO (sin condonación)
--   recibos_ingreso.monto_condonacion    = lo condonado (informativo)
--   *_conceptos / *_secciones.monto      = monto NETO de la línea
--   *_conceptos / *_secciones.monto_condonado = parte condonada de la línea
-- (monto + monto_condonado = lo capturado en pantalla; así se puede editar.)
-- =============================================================

ALTER TABLE ctrl.recibos_ingreso_conceptos ADD COLUMN IF NOT EXISTS monto_condonado NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE ctrl.recibos_ingreso_secciones ADD COLUMN IF NOT EXISTS monto_condonado NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Backfill: recibos con condonación capturada antes de este cambio.
-- Reparto proporcional al monto de cada línea.
WITH r AS (
  SELECT id, monto_condonacion c FROM ctrl.recibos_ingreso WHERE COALESCE(monto_condonacion, 0) > 0
),
l AS (
  SELECT 'c' t, x.id, x.id_recibo_fk, x.monto FROM ctrl.recibos_ingreso_conceptos x JOIN r ON r.id = x.id_recibo_fk WHERE x.monto_condonado = 0
  UNION ALL
  SELECT 's', x.id, x.id_recibo_fk, x.monto FROM ctrl.recibos_ingreso_secciones x JOIN r ON r.id = x.id_recibo_fk WHERE x.monto_condonado = 0
),
g AS (SELECT id_recibo_fk, SUM(monto) gross FROM l GROUP BY 1),
calc AS (
  SELECT l.t, l.id, l.monto,
         ROUND(l.monto * LEAST(r.c, g.gross) / NULLIF(g.gross, 0), 2) cond
  FROM l JOIN r ON r.id = l.id_recibo_fk JOIN g ON g.id_recibo_fk = l.id_recibo_fk
)
UPDATE ctrl.recibos_ingreso_conceptos x SET
  monto_condonado = calc.cond,
  subtotal = ROUND(COALESCE(x.subtotal, x.monto) * (x.monto - calc.cond) / NULLIF(x.monto, 0), 2),
  iva      = (x.monto - calc.cond) - ROUND(COALESCE(x.subtotal, x.monto) * (x.monto - calc.cond) / NULLIF(x.monto, 0), 2),
  monto    = x.monto - calc.cond
FROM calc WHERE calc.t = 'c' AND calc.id = x.id;

WITH r AS (
  SELECT id, monto_condonacion c FROM ctrl.recibos_ingreso WHERE COALESCE(monto_condonacion, 0) > 0
),
l AS (
  SELECT x.id, x.id_recibo_fk, x.monto FROM ctrl.recibos_ingreso_secciones x JOIN r ON r.id = x.id_recibo_fk WHERE x.monto_condonado = 0
),
g AS (
  SELECT id_recibo_fk, SUM(m) gross FROM (
    SELECT id_recibo_fk, monto + monto_condonado m FROM ctrl.recibos_ingreso_conceptos WHERE id_recibo_fk IN (SELECT id FROM r)
    UNION ALL SELECT id_recibo_fk, monto FROM l) z GROUP BY 1
),
calc AS (
  SELECT l.id, ROUND(l.monto * LEAST(r.c, g.gross) / NULLIF(g.gross, 0), 2) cond
  FROM l JOIN r ON r.id = l.id_recibo_fk JOIN g ON g.id_recibo_fk = l.id_recibo_fk
)
UPDATE ctrl.recibos_ingreso_secciones x SET
  monto_condonado = calc.cond,
  subtotal = ROUND(COALESCE(x.subtotal, x.monto) * (x.monto - calc.cond) / NULLIF(x.monto, 0), 2),
  iva      = (x.monto - calc.cond) - ROUND(COALESCE(x.subtotal, x.monto) * (x.monto - calc.cond) / NULLIF(x.monto, 0), 2),
  monto    = x.monto - calc.cond
FROM calc WHERE calc.id = x.id;

UPDATE ctrl.recibos_ingreso r SET monto_total = GREATEST(r.monto_total - r.monto_condonacion, 0)
WHERE COALESCE(r.monto_condonacion, 0) > 0
  AND ABS(r.monto_total - (
    SELECT COALESCE(SUM(monto + monto_condonado), 0) FROM ctrl.recibos_ingreso_conceptos WHERE id_recibo_fk = r.id) - (
    SELECT COALESCE(SUM(monto + monto_condonado), 0) FROM ctrl.recibos_ingreso_secciones WHERE id_recibo_fk = r.id)) < 0.05;
