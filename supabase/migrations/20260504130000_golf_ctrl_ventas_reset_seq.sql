-- ─────────────────────────────────────────────────────────────────────────────
-- Reinicia el contador de IDs de ctrl_ventas y ctrl_ventas_det desde 1
-- No elimina ningún registro existente
-- ─────────────────────────────────────────────────────────────────────────────

SELECT setval('golf.ctrl_ventas_id_seq',     1, false);
SELECT setval('golf.ctrl_ventas_det_id_seq', 1, false);
