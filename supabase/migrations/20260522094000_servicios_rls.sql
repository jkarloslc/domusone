-- RLS para las tablas de servicios de suministros (faltaban en la migración original)
ALTER TABLE ctrl.servicios_catalogo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.servicios_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_servicios_catalogo"
  ON ctrl.servicios_catalogo FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_servicios_registros"
  ON ctrl.servicios_registros FOR ALL
  USING (true) WITH CHECK (true);
