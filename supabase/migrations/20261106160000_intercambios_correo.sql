-- Remitente SMTP propio para cartas de intercambio (distinto al de facturación)
INSERT INTO cfg.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion) VALUES
  ('smtp_intercambios_host',       '',    'text',     'correo', 'Intercambios — Servidor SMTP',   'Servidor SMTP del correo que envía las cartas de intercambio'),
  ('smtp_intercambios_port',       '587', 'text',     'correo', 'Intercambios — Puerto',          '587 (STARTTLS) o 465 (SSL)'),
  ('smtp_intercambios_secure',     'false','text',    'correo', 'Intercambios — SSL (true/false)','true para puerto 465'),
  ('smtp_intercambios_user',       '',    'text',     'correo', 'Intercambios — Usuario',         'Usuario de autenticación'),
  ('smtp_intercambios_pass',       '',    'password', 'correo', 'Intercambios — Contraseña',      'Contraseña o app password'),
  ('smtp_intercambios_from_name',  '',    'text',     'correo', 'Intercambios — Nombre remitente','Nombre que verá el club destino'),
  ('smtp_intercambios_from_email', '',    'text',     'correo', 'Intercambios — Correo remitente','Dirección del remitente (si se deja vacío usa el usuario)')
ON CONFLICT (clave) DO NOTHING;

-- Seguimiento de envíos
ALTER TABLE golf.cartas_intercambio
  ADD COLUMN IF NOT EXISTS enviada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS enviada_a  TEXT;
