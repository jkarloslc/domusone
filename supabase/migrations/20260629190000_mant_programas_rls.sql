-- RLS quedó habilitado en ctrl.mant_programas / ctrl.mant_ejecuciones sin
-- políticas (activado manualmente desde el dashboard de Supabase). Sin
-- políticas, RLS deniega todo por defecto aunque existan los GRANT de la
-- migración anterior. Se agregan las políticas estándar usadas en el resto
-- del esquema ctrl (ver ctrl.capex_proyectos como referencia).

ALTER TABLE ctrl.mant_programas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.mant_ejecuciones ENABLE ROW LEVEL SECURITY;

-- mant_programas
CREATE POLICY "mant_programas_select" ON ctrl.mant_programas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mant_programas_insert" ON ctrl.mant_programas
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mant_programas_update" ON ctrl.mant_programas
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mant_programas_delete" ON ctrl.mant_programas
  FOR DELETE TO authenticated USING (true);

-- mant_ejecuciones
CREATE POLICY "mant_ejecuciones_select" ON ctrl.mant_ejecuciones
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mant_ejecuciones_insert" ON ctrl.mant_ejecuciones
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "mant_ejecuciones_update" ON ctrl.mant_ejecuciones
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "mant_ejecuciones_delete" ON ctrl.mant_ejecuciones
  FOR DELETE TO authenticated USING (true);
