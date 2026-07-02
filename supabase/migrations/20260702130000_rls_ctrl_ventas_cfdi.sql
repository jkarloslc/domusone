-- golf.ctrl_ventas_cfdi se creó en 20260514120000_pos_facturas_cfdi.sql con
-- RLS habilitado (probablemente vía Supabase Studio) pero sin políticas —
-- el insert desde saveFactura falla con
-- "new row violates row level security policy for table ctrl_ventas_cfdi".
-- Mismo patrón que 20260610120000_rls_recibos_golf_pagos.sql.

ALTER TABLE golf.ctrl_ventas_cfdi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ctrl_ventas_cfdi_select" ON golf.ctrl_ventas_cfdi;
CREATE POLICY "ctrl_ventas_cfdi_select"
  ON golf.ctrl_ventas_cfdi FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ctrl_ventas_cfdi_insert" ON golf.ctrl_ventas_cfdi;
CREATE POLICY "ctrl_ventas_cfdi_insert"
  ON golf.ctrl_ventas_cfdi FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "ctrl_ventas_cfdi_update" ON golf.ctrl_ventas_cfdi;
CREATE POLICY "ctrl_ventas_cfdi_update"
  ON golf.ctrl_ventas_cfdi FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "ctrl_ventas_cfdi_delete" ON golf.ctrl_ventas_cfdi;
CREATE POLICY "ctrl_ventas_cfdi_delete"
  ON golf.ctrl_ventas_cfdi FOR DELETE
  TO authenticated
  USING (true);
