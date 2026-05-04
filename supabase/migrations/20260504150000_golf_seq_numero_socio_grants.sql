-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos faltantes en la secuencia y función del consecutivo de socios
-- Sin estos grants el trigger falla con 403 al hacer INSERT en cat_socios
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE, SELECT, UPDATE ON SEQUENCE golf.seq_numero_socio TO authenticated;

GRANT EXECUTE ON FUNCTION golf.fn_auto_numero_socio() TO authenticated;
