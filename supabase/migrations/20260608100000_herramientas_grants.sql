-- ============================================================
-- GRANTS para módulo Equipo & Herramienta
-- Ejecutar en Supabase → SQL Editor si aparece "permission denied"
-- ============================================================

-- ── cfg.herramientas ─────────────────────────────────────────
GRANT ALL ON cfg.herramientas TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.herramientas_id_seq TO anon, authenticated, service_role;

ALTER TABLE cfg.herramientas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "herramientas_all" ON cfg.herramientas;
CREATE POLICY "herramientas_all" ON cfg.herramientas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ctrl.prestamos_herramientas ──────────────────────────────
GRANT ALL ON ctrl.prestamos_herramientas TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.prestamos_herramientas_id_seq TO anon, authenticated, service_role;

ALTER TABLE ctrl.prestamos_herramientas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prestamos_herramientas_all" ON ctrl.prestamos_herramientas;
CREATE POLICY "prestamos_herramientas_all" ON ctrl.prestamos_herramientas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ctrl.mantenimiento_herramientas ──────────────────────────
GRANT ALL ON ctrl.mantenimiento_herramientas TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.mantenimiento_herramientas_id_seq TO anon, authenticated, service_role;

ALTER TABLE ctrl.mantenimiento_herramientas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mantto_herramientas_all" ON ctrl.mantenimiento_herramientas;
CREATE POLICY "mantto_herramientas_all" ON ctrl.mantenimiento_herramientas
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
