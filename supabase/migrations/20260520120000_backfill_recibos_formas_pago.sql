-- ============================================================
-- Backfill: recibos_ingreso_formas_pago
-- Pobla la tabla normalizada de formas de pago para recibos
-- creados antes del fix de 2026-05-20.
--
-- GRUPO A — Recibos generados por corte POS Golf (origen = 'POS_GOLF')
--   Fuente exacta: golf.ctrl_cortes_caja_det (id_forma_fk + nombre real)
--   Solo procesa recibos cuyo id_recibo_ingreso está vinculado a un corte.
--
-- GRUPO B — Recibos manuales con columnas legacy (monto_efectivo, etc.)
--   Fuente: columnas fijas de ctrl.recibos_ingreso
--   Resuelve id_forma_pago_fk por nombre en cfg.formas_pago.
--   Solo afecta recibos que aún no tienen filas en la tabla nueva.
-- ============================================================

-- ── GRUPO A: recibos POS ────────────────────────────────────
INSERT INTO ctrl.recibos_ingreso_formas_pago
  (id_recibo_fk, id_forma_pago_fk, nombre_forma_pago, monto)
SELECT
  r.id                AS id_recibo_fk,
  d.id_forma_fk       AS id_forma_pago_fk,
  d.forma_nombre      AS nombre_forma_pago,
  d.monto
FROM ctrl.recibos_ingreso r
JOIN golf.ctrl_cortes_caja    c ON c.id_recibo_ingreso = r.id
JOIN golf.ctrl_cortes_caja_det d ON d.id_corte_fk = c.id
WHERE d.monto > 0
  AND NOT EXISTS (
    SELECT 1 FROM ctrl.recibos_ingreso_formas_pago fp
    WHERE fp.id_recibo_fk = r.id
  );

-- ── GRUPO B: recibos manuales legacy ───────────────────────
-- Genera una fila por cada columna con monto > 0, cruzando el
-- nombre de la forma con cfg.formas_pago para obtener el id.
-- Columnas candidatas: monto_efectivo, monto_transferencia,
--   monto_tarjeta_debito, monto_tarjeta_credito, monto_cheque,
--   monto_deposito.
-- Se excluyen recibos ya procesados en el Grupo A o que ya
-- tienen filas en la tabla nueva.

WITH formas_cfg AS (
  -- Precargar IDs del catálogo para cada nombre canónico
  SELECT id, lower(trim(nombre)) AS nombre_lower
  FROM cfg.formas_pago
),
recibos_sin_formas AS (
  -- Solo recibos que aún no tienen ninguna fila en la tabla nueva
  SELECT r.*
  FROM ctrl.recibos_ingreso r
  WHERE NOT EXISTS (
    SELECT 1 FROM ctrl.recibos_ingreso_formas_pago fp
    WHERE fp.id_recibo_fk = r.id
  )
),
desglose AS (
  -- Expandir cada columna legacy a una fila
  SELECT id AS id_recibo_fk, 'efectivo'            AS nombre_key, monto_efectivo        AS monto FROM recibos_sin_formas WHERE COALESCE(monto_efectivo,       0) > 0
  UNION ALL
  SELECT id, 'transferencia',                                       monto_transferencia        FROM recibos_sin_formas WHERE COALESCE(monto_transferencia,   0) > 0
  UNION ALL
  SELECT id, 'tarjeta débito',                                      monto_tarjeta_debito       FROM recibos_sin_formas WHERE COALESCE(monto_tarjeta_debito,  0) > 0
  UNION ALL
  SELECT id, 'tarjeta crédito',                                     monto_tarjeta_credito      FROM recibos_sin_formas WHERE COALESCE(monto_tarjeta_credito, 0) > 0
  UNION ALL
  SELECT id, 'cheque',                                              monto_cheque               FROM recibos_sin_formas WHERE COALESCE(monto_cheque,          0) > 0
  UNION ALL
  SELECT id, 'depósito ventanilla',                                 monto_deposito             FROM recibos_sin_formas WHERE COALESCE(monto_deposito,        0) > 0
)
INSERT INTO ctrl.recibos_ingreso_formas_pago
  (id_recibo_fk, id_forma_pago_fk, nombre_forma_pago, monto)
SELECT
  d.id_recibo_fk,
  fc.id            AS id_forma_pago_fk,
  fp.nombre        AS nombre_forma_pago,   -- nombre oficial del catálogo
  d.monto
FROM desglose d
JOIN formas_cfg fc ON fc.nombre_lower = lower(trim(d.nombre_key))
JOIN cfg.formas_pago fp ON fp.id = fc.id
WHERE d.monto > 0;

-- ── Verificación ────────────────────────────────────────────
-- (ejecutar manualmente para validar antes/después)
--
-- SELECT
--   origen,
--   COUNT(DISTINCT r.id)                            AS total_recibos,
--   COUNT(fp.id)                                    AS filas_formas_pago,
--   COUNT(DISTINCT r.id) FILTER (WHERE fp.id IS NULL) AS sin_formas
-- FROM ctrl.recibos_ingreso r
-- LEFT JOIN ctrl.recibos_ingreso_formas_pago fp ON fp.id_recibo_fk = r.id
-- GROUP BY origen
-- ORDER BY origen;
