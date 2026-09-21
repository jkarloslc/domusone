-- ─────────────────────────────────────────────────────────────────────────
-- Ubicar las cuotas con abono registrado pero SIN fecha de pago
-- (aviso del puente devengado→caja: "N cuota(s) con abono registrado pero
-- sin fecha de pago"). Correr en el SQL Editor de Supabase.
--
-- CAUSA: al cobrar, los modales guardaban la fecha solo si el pago liquidaba
-- la cuota completa, y escribían NULL en los pagos parciales. Corregido en
-- código (Golf/Hípico/Locales): desde ahora la fecha se guarda siempre. Esta
-- consulta ubica y repara los registros que quedaron de antes.
--
-- Golf se puede auditar por PostgREST; hip.cxc_hip y ctrl.loc_cxc no
-- (solo tienen GRANT para `authenticated`), por eso esto va aquí.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. LISTA: las cuotas, con la fecha que se les puede recuperar ────────
-- `fecha_sugerida` = fecha del recibo vigente más reciente que les abonó.
-- Es el mismo criterio que ya usa la columna para las cuotas liquidadas:
-- una sola fecha por cuota, la del último abono.

WITH golf AS (
  SELECT 'Golf' AS modulo, c.id, c.periodo, c.concepto, c.status,
         c.monto_final, c.saldo,
         c.monto_final - COALESCE(c.saldo, 0) AS cobrado,
         COALESCE(s.numero_socio, '') || ' ' ||
           CONCAT_WS(' ', s.nombre, s.apellido_paterno, s.apellido_materno) AS cliente,
         (SELECT MAX(r.fecha_recibo) FROM golf.recibos_golf r
           WHERE r.id = c.id_recibo_fk AND r.status = 'VIGENTE')            AS fecha_sugerida
  FROM golf.cxc_golf c
  LEFT JOIN golf.cat_socios s ON s.id = c.id_socio_fk
  WHERE c.status IN ('PAGADO', 'PAGO_PARCIAL') AND c.fecha_pago IS NULL
),
hip AS (
  SELECT 'Hípico' AS modulo, c.id, c.periodo, c.concepto, c.status,
         c.monto_final, c.saldo,
         c.monto_final - COALESCE(c.saldo, 0) AS cobrado,
         COALESCE(a.razon_social, CONCAT_WS(' ', a.nombre, a.apellido_paterno)) AS cliente,
         (SELECT MAX(r.fecha_recibo)
            FROM hip.recibos_hip_det d
            JOIN hip.recibos_hip r ON r.id = d.id_recibo_fk
           WHERE d.id_cuota_fk = c.id AND r.status = 'VIGENTE')            AS fecha_sugerida
  FROM hip.cxc_hip c
  LEFT JOIN hip.cat_arrendatarios a ON a.id = c.id_arrendatario_fk
  WHERE c.status IN ('PAGADO', 'PAGO_PARCIAL') AND c.fecha_pago IS NULL
),
loc AS (
  SELECT 'Locales' AS modulo, c.id, c.periodo, c.concepto, c.status,
         c.monto_final, c.saldo,
         c.monto_final - COALESCE(c.saldo, 0) AS cobrado,
         COALESCE(a.razon_social, CONCAT_WS(' ', a.nombre, a.apellido_paterno)) AS cliente,
         (SELECT MAX(r.fecha_recibo)
            FROM ctrl.loc_recibos_det d
            JOIN ctrl.loc_recibos r ON r.id = d.id_recibo_fk
           WHERE d.id_cuota_fk = c.id AND r.status = 'VIGENTE')            AS fecha_sugerida
  FROM ctrl.loc_cxc c
  LEFT JOIN ctrl.loc_arrendatarios a ON a.id = c.id_arrendatario_fk
  WHERE c.status IN ('PAGADO', 'PAGO_PARCIAL') AND c.fecha_pago IS NULL
)
SELECT * FROM (SELECT * FROM golf UNION ALL SELECT * FROM hip UNION ALL SELECT * FROM loc) t
WHERE cobrado > 0
ORDER BY modulo, periodo, id;

-- ── 2. REPARACIÓN: copiar la fecha del recibo que abonó la cuota ─────────
-- Correr SOLO después de revisar la lista de arriba. Las cuotas cuya
-- fecha_sugerida salga NULL no tienen recibo vigente del cual derivarla:
-- esas se capturan a mano en el módulo de cobranza.

-- BEGIN;

-- UPDATE golf.cxc_golf c SET fecha_pago = r.fecha_recibo
--   FROM golf.recibos_golf r
--  WHERE r.id = c.id_recibo_fk AND r.status = 'VIGENTE'
--    AND c.status IN ('PAGADO', 'PAGO_PARCIAL') AND c.fecha_pago IS NULL
--    AND c.monto_final - COALESCE(c.saldo, 0) > 0;

-- UPDATE hip.cxc_hip c SET fecha_pago = x.fecha
--   FROM (SELECT d.id_cuota_fk AS id, MAX(r.fecha_recibo) AS fecha
--           FROM hip.recibos_hip_det d
--           JOIN hip.recibos_hip r ON r.id = d.id_recibo_fk
--          WHERE r.status = 'VIGENTE' GROUP BY d.id_cuota_fk) x
--  WHERE x.id = c.id
--    AND c.status IN ('PAGADO', 'PAGO_PARCIAL') AND c.fecha_pago IS NULL
--    AND c.monto_final - COALESCE(c.saldo, 0) > 0;

-- UPDATE ctrl.loc_cxc c SET fecha_pago = x.fecha
--   FROM (SELECT d.id_cuota_fk AS id, MAX(r.fecha_recibo) AS fecha
--           FROM ctrl.loc_recibos_det d
--           JOIN ctrl.loc_recibos r ON r.id = d.id_recibo_fk
--          WHERE r.status = 'VIGENTE' GROUP BY d.id_cuota_fk) x
--  WHERE x.id = c.id
--    AND c.status IN ('PAGADO', 'PAGO_PARCIAL') AND c.fecha_pago IS NULL
--    AND c.monto_final - COALESCE(c.saldo, 0) > 0;

-- COMMIT;
