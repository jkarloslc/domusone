-- ─────────────────────────────────────────────────────────────────────────────
-- Reinicia IDs de ctrl_ventas y tablas relacionadas desde 1
-- CASCADE elimina registros dependientes (det, pagos) en el mismo paso
-- ─────────────────────────────────────────────────────────────────────────────

TRUNCATE golf.ctrl_ventas RESTART IDENTITY CASCADE;
