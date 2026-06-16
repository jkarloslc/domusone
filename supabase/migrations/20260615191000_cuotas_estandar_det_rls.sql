-- RLS para cfg.cuotas_estandar_det
ALTER TABLE cfg.cuotas_estandar_det ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON cfg.cuotas_estandar_det
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
