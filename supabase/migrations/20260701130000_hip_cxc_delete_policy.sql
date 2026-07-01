-- Permite DELETE en hip.cxc_hip solo para superadmin
CREATE POLICY "superadmin puede eliminar cuotas"
  ON hip.cxc_hip
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM cfg.usuarios u
      WHERE u.user_id = auth.uid()
        AND u.rol = 'superadmin'
    )
  );
