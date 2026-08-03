-- Fix: los vales de combustible no se pueden "sacar" desde la Bitácora de Uso
-- porque ctrl.bitacora_uso_equipos nunca tuvo GRANT (se creó el 2026-06-01 sin
-- ninguna sentencia GRANT, solo la política RLS — que no sustituye al GRANT).
-- Confirmado con inserts de prueba: "permission denied for table bitacora_uso_equipos".
--
-- De paso se re-aplica el GRANT de comp.combustible_movimientos: la migración
-- 20260727180000_combustible_vale_workflow.sql lo incluía pero sigue sin
-- ejecutarse en Supabase (mismo error de permiso confirmado hoy).

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.bitacora_uso_equipos      TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.bitacora_uso_equipos_id_seq       TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON comp.combustible_movimientos   TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE comp.combustible_movimientos_id_seq    TO authenticated, service_role;
