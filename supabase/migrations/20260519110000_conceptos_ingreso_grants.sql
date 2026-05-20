-- Permisos para las tablas de conceptos de ingreso

ALTER TABLE cfg.conceptos_ingreso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_conceptos_ingreso" ON cfg.conceptos_ingreso FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON cfg.conceptos_ingreso TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.conceptos_ingreso_id_seq TO authenticated, service_role;

ALTER TABLE ctrl.recibos_ingreso_conceptos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_recibos_ingreso_conceptos" ON ctrl.recibos_ingreso_conceptos FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON ctrl.recibos_ingreso_conceptos TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.recibos_ingreso_conceptos_id_seq TO authenticated, service_role;
