-- Fix: rfq_cotizaciones_det y rfq_cotizaciones sin SELECT grant ni RLS policy
-- Causa: las tablas fueron creadas directamente en Supabase sin migration completa

-- rfq_cotizaciones_det
ALTER TABLE comp.rfq_cotizaciones_det ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_rfq_cotizaciones_det" ON comp.rfq_cotizaciones_det;
CREATE POLICY "allow_all_rfq_cotizaciones_det" ON comp.rfq_cotizaciones_det
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON comp.rfq_cotizaciones_det TO authenticated, service_role;

-- rfq_cotizaciones (por si también le falta)
ALTER TABLE comp.rfq_cotizaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_rfq_cotizaciones" ON comp.rfq_cotizaciones;
CREATE POLICY "allow_all_rfq_cotizaciones" ON comp.rfq_cotizaciones
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON comp.rfq_cotizaciones TO authenticated, service_role;

-- rfq (cabecera)
ALTER TABLE comp.rfq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_rfq" ON comp.rfq;
CREATE POLICY "allow_all_rfq" ON comp.rfq
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON comp.rfq TO authenticated, service_role;
