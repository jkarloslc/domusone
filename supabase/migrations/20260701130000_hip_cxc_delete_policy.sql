-- Permite DELETE en hip.cxc_hip para usuarios autenticados
-- (el control de rol superadmin se aplica en la aplicación)
CREATE POLICY "authenticated puede eliminar cuotas hip"
  ON hip.cxc_hip
  FOR DELETE
  TO authenticated
  USING (true);
