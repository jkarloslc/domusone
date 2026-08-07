-- usuario_nomina: además de Nómina y Servicios de Vigilancia, ahora también
-- ve/crea IMSS, Vales Despensa, Fonacot, Finiquitos y Liquidaciones, PTU
-- (todos con solo_propios=true, mismo criterio que los tipos ya asignados)
INSERT INTO cfg.rol_tipos_op (rol, tipo_gasto, modo, solo_propios)
VALUES
  ('usuario_nomina', 'IMSS', 'ALLOW', true),
  ('usuario_nomina', 'Vales Despensa', 'ALLOW', true),
  ('usuario_nomina', 'Fonacot', 'ALLOW', true),
  ('usuario_nomina', 'Finiquitos y Liquidaciones', 'ALLOW', true),
  ('usuario_nomina', 'PTU', 'ALLOW', true)
ON CONFLICT (rol, tipo_gasto) DO NOTHING;
