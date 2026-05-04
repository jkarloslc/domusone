-- ─────────────────────────────────────────────────────────────────────────────
-- Renumera el registro id=5 a id=1 en ctrl_ventas y tablas relacionadas
-- ─────────────────────────────────────────────────────────────────────────────

SET session_replication_role = replica;  -- desactiva FK checks temporalmente

UPDATE golf.ctrl_ventas       SET id          = 1 WHERE id          = 5;
UPDATE golf.ctrl_ventas_det   SET id_venta_fk = 1 WHERE id_venta_fk = 5;
UPDATE golf.ctrl_ventas_pagos SET id_venta_fk = 1 WHERE id_venta_fk = 5;

-- Reiniciar también los IDs de det si hay solo un registro
-- (opcional: ajusta el setval al MAX actual si hay más registros)
SELECT setval('golf.ctrl_ventas_id_seq',     1, true);
SELECT setval('golf.ctrl_ventas_det_id_seq', (SELECT COALESCE(MAX(id), 1) FROM golf.ctrl_ventas_det), true);

SET session_replication_role = DEFAULT;  -- reactiva FK checks
