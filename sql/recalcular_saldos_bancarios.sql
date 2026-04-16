-- ============================================================
-- RECALCULAR SALDOS BANCARIOS — DomusOne
-- Corrige movimientos donde Math.max(0) impidió saldos negativos
-- y recalcula el saldo actual de cada cuenta bancaria.
--
-- EJECUTAR EN DOS PASOS:
--   1. Primero corre la sección PREVIEW para revisar qué cambiará.
--   2. Luego corre la sección CORRECCIÓN para aplicar.
-- ============================================================


-- ── 0. PREVIEW — ¿qué cuentas tienen diferencia? ────────────
-- Muestra el saldo actual (almacenado) vs el saldo correcto
-- calculado desde los movimientos. Sin hacer cambios.

WITH base AS (
  -- Saldo_antes del primer movimiento de cada cuenta =
  -- balance correcto antes de cualquier operación registrada.
  SELECT DISTINCT ON (id_cuenta_fk)
    id_cuenta_fk,
    saldo_antes AS saldo_inicial
  FROM comp.movimientos_bancarios
  ORDER BY id_cuenta_fk, fecha_movimiento ASC, created_at ASC
),
saldo_calculado AS (
  SELECT
    id_cuenta_fk,
    b.saldo_inicial
      + SUM(CASE tipo WHEN 'Abono' THEN monto ELSE -monto END) AS saldo_correcto
  FROM comp.movimientos_bancarios mb
  JOIN base b USING (id_cuenta_fk)
  GROUP BY id_cuenta_fk, b.saldo_inicial
)
SELECT
  cb.id,
  cb.banco,
  cb.saldo                  AS saldo_actual_bd,
  sc.saldo_correcto,
  cb.saldo - sc.saldo_correcto AS diferencia,
  CASE
    WHEN ABS(cb.saldo - sc.saldo_correcto) < 0.01 THEN '✓ correcto'
    ELSE '⚠ necesita corrección'
  END AS estado
FROM cfg.cuentas_bancarias cb
LEFT JOIN saldo_calculado sc ON cb.id = sc.id_cuenta_fk
ORDER BY cb.banco;


-- ── 1. CORRECCIÓN — Recalcular saldo_antes / saldo_despues ──
-- Reproduce la secuencia correcta de movimientos para cada cuenta
-- y actualiza los campos que quedaron mal con Math.max(0).

BEGIN;

WITH base AS (
  SELECT DISTINCT ON (id_cuenta_fk)
    id_cuenta_fk,
    saldo_antes AS saldo_inicial
  FROM comp.movimientos_bancarios
  ORDER BY id_cuenta_fk, fecha_movimiento ASC, created_at ASC
),
movs AS (
  SELECT
    mb.id,
    mb.id_cuenta_fk,
    mb.tipo,
    mb.monto,
    ROW_NUMBER() OVER (
      PARTITION BY mb.id_cuenta_fk
      ORDER BY mb.fecha_movimiento ASC, mb.created_at ASC
    ) AS rn
  FROM comp.movimientos_bancarios mb
),
saldos AS (
  -- Suma acumulada: saldo_inicial + delta de cada movimiento en orden
  SELECT
    m.id,
    m.id_cuenta_fk,
    m.tipo,
    m.monto,
    b.saldo_inicial + SUM(
      CASE m.tipo
        WHEN 'Abono' THEN  m.monto
        WHEN 'Cargo' THEN -m.monto
        ELSE 0
      END
    ) OVER (
      PARTITION BY m.id_cuenta_fk
      ORDER BY m.rn
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS saldo_despues_correcto
  FROM movs m
  JOIN base b ON m.id_cuenta_fk = b.id_cuenta_fk
)
UPDATE comp.movimientos_bancarios mb
SET
  saldo_despues = s.saldo_despues_correcto,
  -- saldo_antes = saldo_despues inverso según tipo
  saldo_antes   = s.saldo_despues_correcto
                  - CASE s.tipo
                      WHEN 'Abono' THEN  s.monto
                      WHEN 'Cargo' THEN -s.monto
                      ELSE 0
                    END
FROM saldos s
WHERE mb.id = s.id
  AND mb.saldo_despues IS DISTINCT FROM s.saldo_despues_correcto;


-- ── 2. CORRECCIÓN — Actualizar saldo en cuentas_bancarias ───
-- El saldo de cada cuenta = saldo_despues del último movimiento.

UPDATE cfg.cuentas_bancarias cb
SET
  saldo      = ultimo.saldo_despues,
  updated_at = now()
FROM (
  SELECT DISTINCT ON (id_cuenta_fk)
    id_cuenta_fk,
    saldo_despues
  FROM comp.movimientos_bancarios
  ORDER BY id_cuenta_fk, fecha_movimiento DESC, created_at DESC
) ultimo
WHERE cb.id = ultimo.id_cuenta_fk
  AND ABS(cb.saldo - ultimo.saldo_despues) > 0.001; -- solo si hay diferencia real


-- ── 3. VERIFICACIÓN ─────────────────────────────────────────
SELECT
  cb.banco,
  cb.saldo                                                   AS saldo_final,
  COUNT(mb.id)                                               AS movimientos,
  SUM(CASE mb.tipo WHEN 'Abono' THEN mb.monto ELSE 0 END)   AS total_abonos,
  SUM(CASE mb.tipo WHEN 'Cargo' THEN mb.monto ELSE 0 END)   AS total_cargos,
  MIN(mb.saldo_despues)                                      AS saldo_minimo_historico
FROM cfg.cuentas_bancarias cb
LEFT JOIN comp.movimientos_bancarios mb ON mb.id_cuenta_fk = cb.id
GROUP BY cb.id, cb.banco, cb.saldo
ORDER BY cb.banco;

COMMIT;
