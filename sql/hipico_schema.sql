-- ============================================================
-- MÓDULO HÍPICO — Schema `hip`
-- Balvanera Golf & Residencial — DomusOne
-- 2026-04-23
-- ============================================================

CREATE SCHEMA IF NOT EXISTS hip;

-- ── 1. CATÁLOGOS ─────────────────────────────────────────────

-- Tipos de servicios veterinarios / herrajes / alimentos
CREATE TABLE IF NOT EXISTS hip.cat_tipos_servicio (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('veterinario','herraje','alimento','otro')),
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Arrendatarios (propietarios de caballos — catálogo propio, NO socios golf)
CREATE TABLE IF NOT EXISTS hip.cat_arrendatarios (
  id                  SERIAL PRIMARY KEY,
  nombre              TEXT NOT NULL,
  apellido_paterno    TEXT,
  apellido_materno    TEXT,
  razon_social        TEXT,                   -- si es persona moral
  tipo_persona        TEXT NOT NULL DEFAULT 'Física' CHECK (tipo_persona IN ('Física','Moral')),
  rfc                 TEXT,
  email               TEXT,
  telefono            TEXT,
  telefono_alt        TEXT,
  direccion           TEXT,
  contacto_emergencia TEXT,
  telefono_emergencia TEXT,
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Caballerizas (boxes/establos)
CREATE TABLE IF NOT EXISTS hip.cat_caballerizas (
  id          SERIAL PRIMARY KEY,
  clave       TEXT NOT NULL UNIQUE,           -- e.g. "A-01", "B-03"
  nombre      TEXT,                           -- alias opcional
  seccion     TEXT,                           -- Sección A, B, C...
  tipo        TEXT DEFAULT 'Box',             -- Box, Patio, Paddock
  metros2     NUMERIC(6,2),
  activo      BOOLEAN NOT NULL DEFAULT true,
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Caballos
CREATE TABLE IF NOT EXISTS hip.cat_caballos (
  id                  SERIAL PRIMARY KEY,
  nombre              TEXT NOT NULL,
  registro            TEXT,                   -- registro FMCH u otro
  raza                TEXT,
  color               TEXT,
  sexo                TEXT CHECK (sexo IN ('Macho','Hembra','Castrado')),
  fecha_nacimiento    DATE,
  pais_origen         TEXT,
  chip                TEXT,                   -- número de microchip
  id_arrendatario_fk  INT REFERENCES hip.cat_arrendatarios(id),
  id_caballeriza_fk   INT REFERENCES hip.cat_caballerizas(id),
  fecha_ingreso       DATE,
  fecha_salida        DATE,
  status              TEXT NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo','Baja temporal','Dado de baja')),
  foto_url            TEXT,
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. CONTRATOS DE ARRENDAMIENTO ────────────────────────────

CREATE TABLE IF NOT EXISTS hip.ctrl_contratos (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT NOT NULL UNIQUE,   -- HIP-2026-001
  id_arrendatario_fk  INT NOT NULL REFERENCES hip.cat_arrendatarios(id),
  id_caballeriza_fk   INT NOT NULL REFERENCES hip.cat_caballerizas(id),
  fecha_inicio        DATE NOT NULL,
  fecha_fin           DATE,
  renta_mensual       NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposito_garantia   NUMERIC(12,2) DEFAULT 0,
  moneda              TEXT NOT NULL DEFAULT 'MXN',
  dia_pago            INT DEFAULT 1,          -- día del mes que vence la renta
  status              TEXT NOT NULL DEFAULT 'Vigente' CHECK (status IN ('Vigente','Vencido','Cancelado','En negociación')),
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. CUOTAS Y COBRANZA ─────────────────────────────────────

-- Conceptos de cuota hípica (renta, mantenimiento, agua, etc.)
CREATE TABLE IF NOT EXISTS hip.cat_conceptos_cuota (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'Mensual' CHECK (tipo IN ('Mensual','Eventual','Anual')),
  monto       NUMERIC(12,2) DEFAULT 0,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cargos generados por arrendatario
CREATE TABLE IF NOT EXISTS hip.ctrl_cargos (
  id                  SERIAL PRIMARY KEY,
  id_arrendatario_fk  INT NOT NULL REFERENCES hip.cat_arrendatarios(id),
  id_contrato_fk      INT REFERENCES hip.ctrl_contratos(id),
  id_concepto_fk      INT REFERENCES hip.cat_conceptos_cuota(id),
  id_caballo_fk       INT REFERENCES hip.cat_caballos(id),
  descripcion         TEXT NOT NULL,
  mes_aplicacion      DATE,                   -- primer día del mes al que aplica
  monto               NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo               NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_vencimiento   DATE,
  status              TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','Pagado','Vencido','Cancelado')),
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pagos / recibos
CREATE TABLE IF NOT EXISTS hip.ctrl_pagos (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT NOT NULL UNIQUE,   -- RH-2026-001
  id_arrendatario_fk  INT NOT NULL REFERENCES hip.cat_arrendatarios(id),
  fecha_pago          DATE NOT NULL DEFAULT CURRENT_DATE,
  monto_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  forma_pago          TEXT DEFAULT 'Transferencia' CHECK (forma_pago IN ('Efectivo','Transferencia','Cheque','Tarjeta','Otro')),
  referencia          TEXT,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Detalle de pago: qué cargos cubre este pago
CREATE TABLE IF NOT EXISTS hip.ctrl_pagos_det (
  id          SERIAL PRIMARY KEY,
  id_pago_fk  INT NOT NULL REFERENCES hip.ctrl_pagos(id) ON DELETE CASCADE,
  id_cargo_fk INT NOT NULL REFERENCES hip.ctrl_cargos(id),
  monto       NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- ── 4. SERVICIOS / BITÁCORA ──────────────────────────────────

-- Registro de servicios veterinarios, herrajes, alimentos, etc.
CREATE TABLE IF NOT EXISTS hip.ctrl_servicios (
  id                  SERIAL PRIMARY KEY,
  id_caballo_fk       INT NOT NULL REFERENCES hip.cat_caballos(id),
  id_arrendatario_fk  INT NOT NULL REFERENCES hip.cat_arrendatarios(id),
  id_tipo_servicio_fk INT REFERENCES hip.cat_tipos_servicio(id),
  tipo                TEXT NOT NULL CHECK (tipo IN ('veterinario','herraje','alimento','otro')),
  descripcion         TEXT NOT NULL,
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  proveedor           TEXT,
  costo               NUMERIC(12,2) DEFAULT 0,
  cobrar_arrendatario BOOLEAN DEFAULT false,  -- si se traslada al arrendatario como cargo
  id_cargo_generado   INT REFERENCES hip.ctrl_cargos(id),
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. ÍNDICES ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_caballos_arrendatario  ON hip.cat_caballos(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_caballos_caballeriza   ON hip.cat_caballos(id_caballeriza_fk);
CREATE INDEX IF NOT EXISTS idx_contratos_arrendatario ON hip.ctrl_contratos(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_cargos_arrendatario    ON hip.ctrl_cargos(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_cargos_status          ON hip.ctrl_cargos(status);
CREATE INDEX IF NOT EXISTS idx_pagos_arrendatario     ON hip.ctrl_pagos(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_servicios_caballo      ON hip.ctrl_servicios(id_caballo_fk);

-- ── 6. RLS ───────────────────────────────────────────────────

ALTER TABLE hip.cat_arrendatarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.cat_caballerizas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.cat_caballos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.cat_tipos_servicio  ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.cat_conceptos_cuota ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.ctrl_contratos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.ctrl_cargos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.ctrl_pagos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.ctrl_pagos_det      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.ctrl_servicios      ENABLE ROW LEVEL SECURITY;

-- Políticas: authenticated puede leer y escribir todo
CREATE POLICY "hip_arrendatarios_all"   ON hip.cat_arrendatarios   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_caballerizas_all"    ON hip.cat_caballerizas    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_caballos_all"        ON hip.cat_caballos        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_tipos_servicio_all"  ON hip.cat_tipos_servicio  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_conceptos_cuota_all" ON hip.cat_conceptos_cuota FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_contratos_all"       ON hip.ctrl_contratos      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_cargos_all"          ON hip.ctrl_cargos         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_pagos_all"           ON hip.ctrl_pagos          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_pagos_det_all"       ON hip.ctrl_pagos_det      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_servicios_all"       ON hip.ctrl_servicios      FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 7. GRANTS ────────────────────────────────────────────────

GRANT USAGE ON SCHEMA hip TO authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA hip TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA hip TO authenticated;

-- ── 8. DATOS INICIALES ───────────────────────────────────────

INSERT INTO hip.cat_tipos_servicio (nombre, tipo) VALUES
  ('Consulta veterinaria',      'veterinario'),
  ('Vacunación',                'veterinario'),
  ('Desparasitación',           'veterinario'),
  ('Herrado normal',            'herraje'),
  ('Herrado con herradura',     'herraje'),
  ('Alimento — concentrado',    'alimento'),
  ('Alimento — heno',           'alimento'),
  ('Alimento — forraje',        'alimento'),
  ('Servicios varios',          'otro')
ON CONFLICT DO NOTHING;

INSERT INTO hip.cat_conceptos_cuota (nombre, tipo) VALUES
  ('Renta de caballeriza',      'Mensual'),
  ('Mantenimiento general',     'Mensual'),
  ('Agua y servicios',          'Mensual'),
  ('Servicio veterinario',      'Eventual'),
  ('Herraje',                   'Eventual'),
  ('Alimentos',                 'Mensual')
ON CONFLICT DO NOTHING;

-- ── 9. CHECK CONSTRAINT rol en cfg.usuarios ──────────────────
-- Agrega los roles que faltaban (ingresos, usuariogolf, usuariohipico)
-- Ejecutar solo si aún no están en el CHECK
ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN (
    'superadmin','admin','usuarioadmin','usuariomantto',
    'atencion_residentes','cobranza','vigilancia',
    'compras','compras_supervisor','almacen','mantenimiento',
    'fraccionamiento','tesoreria','seguridad',
    'ingresos','usuario_solicitante',
    'usuariogolf','usuariohipico'
  )
);
