-- ══════════════════════════════════════════════════════════
-- DomusOne — Módulo Comunicados y Avisos
-- Ejecutar en Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════

-- 1. Tabla principal de comunicados
CREATE TABLE IF NOT EXISTS ctrl.comunicados (
  id           BIGSERIAL PRIMARY KEY,
  titulo       TEXT NOT NULL,
  cuerpo       TEXT,
  tipo         TEXT NOT NULL DEFAULT 'Aviso',   -- Aviso | Comunicado | Urgente
  estado       TEXT NOT NULL DEFAULT 'Borrador',-- Borrador | Enviado
  total_envios INT  DEFAULT 0,
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Registro detallado de envíos
CREATE TABLE IF NOT EXISTS ctrl.comunicados_envios (
  id                BIGSERIAL PRIMARY KEY,
  id_comunicado_fk  BIGINT REFERENCES ctrl.comunicados(id) ON DELETE CASCADE,
  id_propietario_fk BIGINT,          -- referencia lógica a cat.propietarios.id
  correo_destino    TEXT NOT NULL,
  nombre_destino    TEXT,
  fecha_envio       TIMESTAMPTZ DEFAULT NOW(),
  status            TEXT DEFAULT 'Enviado', -- Enviado | Error
  error_msg         TEXT
);

-- 3. RLS
ALTER TABLE ctrl.comunicados        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.comunicados_envios ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comunicados' AND policyname = 'comunicados_auth') THEN
    CREATE POLICY "comunicados_auth" ON ctrl.comunicados FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comunicados' AND policyname = 'comunicados_anon') THEN
    CREATE POLICY "comunicados_anon" ON ctrl.comunicados FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comunicados_envios' AND policyname = 'com_envios_auth') THEN
    CREATE POLICY "com_envios_auth" ON ctrl.comunicados_envios FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'comunicados_envios' AND policyname = 'com_envios_anon') THEN
    CREATE POLICY "com_envios_anon" ON ctrl.comunicados_envios FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. GRANTs
GRANT USAGE ON SCHEMA ctrl TO anon, authenticated;
GRANT ALL ON TABLE ctrl.comunicados        TO anon, authenticated;
GRANT ALL ON TABLE ctrl.comunicados_envios TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.comunicados_id_seq        TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.comunicados_envios_id_seq TO anon, authenticated;

-- 5. Configuración SMTP en cfg.configuracion
-- Requiere que la columna 'clave' sea UNIQUE (normalmente lo es)
INSERT INTO cfg.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion)
VALUES
  ('smtp_host',       '',          'text',     'correo', 'Servidor SMTP',     'ej. smtp.gmail.com · smtp.office365.com · smtp.sendgrid.net'),
  ('smtp_port',       '587',       'text',     'correo', 'Puerto SMTP',       '587 = TLS (recomendado) · 465 = SSL · 25 = sin cifrado'),
  ('smtp_secure',     'false',     'text',     'correo', 'SSL/TLS',           'true = SSL (puerto 465) · false = STARTTLS (puerto 587)'),
  ('smtp_user',       '',          'text',     'correo', 'Usuario / Email',   'Correo de autenticación del servidor SMTP'),
  ('smtp_pass',       '',          'password', 'correo', 'Contraseña App',    'Contraseña o App Password del correo remitente'),
  ('smtp_from_name',  'DomusOne',  'text',     'correo', 'Nombre remitente',  'Nombre visible para el destinatario'),
  ('smtp_from_email', '',          'text',     'correo', 'Email remitente',   'Dirección From que verá el destinatario')
ON CONFLICT (clave) DO NOTHING;
