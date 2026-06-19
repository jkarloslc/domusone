-- usuario_nomina: además de Nómina, ahora también ve/crea Servicios de Vigilancia (solo sus propios registros)
INSERT INTO cfg.rol_tipos_op (rol, tipo_gasto, modo, solo_propios)
VALUES ('usuario_nomina', 'Servicios de Vigilancia', 'ALLOW', true)
ON CONFLICT (rol, tipo_gasto) DO NOTHING;
