-- ════════════════════════════════════════════════════════════════
-- DOMUSONE — RFC fiscal en socios + claves de configuración
-- Migración: 20260508120000
-- ════════════════════════════════════════════════════════════════

-- ── 1. Campo RFC en cat_socios (golf) ───────────────────────────
ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS rfc TEXT;

-- ── 2. Campo RFC en cat.propietarios ────────────────────────────
ALTER TABLE cat.propietarios
  ADD COLUMN IF NOT EXISTS rfc TEXT;

-- ── 3. Claves de configuración fiscal y PAC ──────────────────────
-- Solo inserta si la clave no existe (ON CONFLICT DO NOTHING)
INSERT INTO cfg.configuracion (clave, valor, tipo, grupo, etiqueta, descripcion) VALUES
  -- Organización fiscal
  ('org_rfc',           '',    'text',     'fiscal', 'RFC del Emisor',             'RFC de la persona moral que emite los CFDIs'),
  ('org_regimen_fiscal','601', 'text',     'fiscal', 'Régimen Fiscal',             'Clave SAT del régimen fiscal del emisor (ej. 601, 603, 626)'),
  ('org_cp_fiscal',     '',    'text',     'fiscal', 'C.P. del Emisor',            'Código postal fiscal del emisor'),

  -- PAC (Proveedor Autorizado de Certificación)
  ('pac_url',           'https://apisandbox.facturama.mx', 'text',     'pac', 'URL del PAC',     'URL del API del PAC. Sandbox: apisandbox.facturama.mx · Producción: api.facturama.mx'),
  ('pac_user',          '',    'text',     'pac', 'Usuario PAC',                    'Usuario de autenticación del PAC'),
  ('pac_pass',          '',    'password', 'pac', 'Contraseña PAC',               'Contraseña de autenticación del PAC')
ON CONFLICT (clave) DO NOTHING;

-- ── Índice de búsqueda rápida por RFC ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_cat_socios_rfc
  ON golf.cat_socios(rfc) WHERE rfc IS NOT NULL;
