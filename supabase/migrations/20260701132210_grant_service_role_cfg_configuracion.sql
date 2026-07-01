-- ── Fix: service_role no podía leer cfg.configuracion ─────────
-- Bug: app/api/pac/timbrar (y cancelar/descargar) usan la service role key
-- para leer pac_url/pac_user/pac_pass y saltarse RLS, pero el schema cfg
-- nunca le otorgó USAGE a service_role. La query fallaba en silencio
-- (42501 permission denied for schema cfg), el código caía a los
-- defaults hardcodeados ('domusonetest' + sandbox) y Facturama Sandbox
-- respondía 401 con body vacío — el error reportado en el modal de facturación.
GRANT USAGE ON SCHEMA cfg TO service_role;
GRANT SELECT ON cfg.configuracion TO service_role;
