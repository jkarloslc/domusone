-- ============================================================
-- Módulo: Renta de Locales Comerciales y Propiedades
-- Réplica de la arquitectura de Hípico/Caballerizas (schema loc)
-- 2026-07-14
-- ============================================================

CREATE SCHEMA IF NOT EXISTS loc;

-- ── 1. cat_arrendatarios — padrón de arrendatarios ────────────
CREATE TABLE IF NOT EXISTS loc.cat_arrendatarios (
  id                    SERIAL PRIMARY KEY,
  nombre                TEXT NOT NULL,
  apellido_paterno      TEXT,
  apellido_materno      TEXT,
  razon_social          TEXT,
  tipo_persona          TEXT NOT NULL DEFAULT 'Física'
                          CHECK (tipo_persona IN ('Física','Moral')),
  rfc                   TEXT,
  email                 TEXT,
  telefono              TEXT,
  telefono_alt          TEXT,
  direccion             TEXT,
  contacto_emergencia   TEXT,
  telefono_emergencia   TEXT,
  notas                 TEXT,
  activo                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loc_arrendatarios_activo ON loc.cat_arrendatarios(activo);

-- ── 2. cat_propiedades — catálogo de locales/propiedades ──────
CREATE TABLE IF NOT EXISTS loc.cat_propiedades (
  id            SERIAL PRIMARY KEY,
  clave         TEXT NOT NULL,
  nombre        TEXT,
  ubicacion     TEXT,
  tipo          TEXT DEFAULT 'Local Comercial',
  metros2       NUMERIC(12,2),
  status        TEXT NOT NULL DEFAULT 'Libre'
                  CHECK (status IN ('Libre','Rentada','Ocupada','Mantenimiento','Bloqueada')),
  activo        BOOLEAN NOT NULL DEFAULT true,
  notas         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loc_propiedades_status ON loc.cat_propiedades(status);
CREATE INDEX IF NOT EXISTS idx_loc_propiedades_activo ON loc.cat_propiedades(activo);

-- ── 3. ctrl_asignaciones — asignación arrendatario ↔ propiedad ─
-- La renta (monto_mensual) vive en la asignación, no en la propiedad:
-- así cada local puede tener una renta distinta y actualizable.
CREATE TABLE IF NOT EXISTS loc.ctrl_asignaciones (
  id                  SERIAL PRIMARY KEY,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES loc.cat_arrendatarios(id),
  id_propiedad_fk     INTEGER NOT NULL REFERENCES loc.cat_propiedades(id),
  fecha_inicio        DATE NOT NULL,
  fecha_fin           DATE,
  monto_mensual       NUMERIC(12,2) NOT NULL DEFAULT 0,
  dia_pago            INTEGER NOT NULL DEFAULT 1
                        CHECK (dia_pago BETWEEN 1 AND 31),
  activo              BOOLEAN NOT NULL DEFAULT true,
  observaciones       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loc_asig_arrendatario ON loc.ctrl_asignaciones(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_loc_asig_propiedad     ON loc.ctrl_asignaciones(id_propiedad_fk);
CREATE INDEX IF NOT EXISTS idx_loc_asig_activo        ON loc.ctrl_asignaciones(activo);

-- ── 4. cxc_loc — cuotas mensuales de renta ─────────────────────
CREATE TABLE IF NOT EXISTS loc.cxc_loc (
  id                  SERIAL PRIMARY KEY,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES loc.cat_arrendatarios(id),
  id_asignacion_fk    INTEGER REFERENCES loc.ctrl_asignaciones(id) ON DELETE SET NULL,
  concepto            TEXT NOT NULL,
  periodo             TEXT,                -- YYYY-MM
  monto_original      NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento           NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_final         NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo               NUMERIC(12,2),
  status              TEXT NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (status IN ('PENDIENTE','PAGADO','CANCELADO','PAGO_PARCIAL')),
  fecha_emision       DATE,
  fecha_vencimiento   DATE,
  fecha_pago          DATE,
  forma_pago          TEXT,
  tipo                TEXT NOT NULL DEFAULT 'RENTA_LOCAL',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cxc_loc_arrendatario ON loc.cxc_loc(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_cxc_loc_asignacion    ON loc.cxc_loc(id_asignacion_fk);
CREATE INDEX IF NOT EXISTS idx_cxc_loc_status        ON loc.cxc_loc(status);
CREATE INDEX IF NOT EXISTS idx_cxc_loc_periodo       ON loc.cxc_loc(periodo);

-- ── 5. recibos_loc — recibos de cobro ──────────────────────────
CREATE TABLE IF NOT EXISTS loc.recibos_loc (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT NOT NULL UNIQUE,
  fecha_recibo        DATE NOT NULL,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES loc.cat_arrendatarios(id),
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  forma_pago_nombre   TEXT,
  referencia_pago     TEXT,
  observaciones       TEXT,
  usuario_cobra       TEXT,
  status              TEXT NOT NULL DEFAULT 'VIGENTE'
                        CHECK (status IN ('VIGENTE','CANCELADO')),
  id_venta_pos_fk     INTEGER,            -- vínculo al ticket POS (golf.ctrl_ventas)
  id_forma_pago_fk    INTEGER REFERENCES cfg.formas_pago(id),
  facturable          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_loc_arrendatario ON loc.recibos_loc(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_recibos_loc_fecha        ON loc.recibos_loc(fecha_recibo);

-- ── 6. recibos_loc_det — líneas del recibo ─────────────────────
CREATE TABLE IF NOT EXISTS loc.recibos_loc_det (
  id              SERIAL PRIMARY KEY,
  id_recibo_fk    INTEGER NOT NULL REFERENCES loc.recibos_loc(id) ON DELETE CASCADE,
  id_cuota_fk     INTEGER REFERENCES loc.cxc_loc(id) ON DELETE SET NULL,
  concepto        TEXT,
  tipo            TEXT DEFAULT 'RENTA_LOCAL',
  periodo         TEXT,
  monto_original  NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento       NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_final     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_loc_det_recibo ON loc.recibos_loc_det(id_recibo_fk);

-- ── 7. recibos_loc_pagos — formas de pago del recibo ───────────
CREATE TABLE IF NOT EXISTS loc.recibos_loc_pagos (
  id               SERIAL PRIMARY KEY,
  id_recibo_fk     INTEGER NOT NULL REFERENCES loc.recibos_loc(id) ON DELETE CASCADE,
  id_forma_pago_fk INTEGER REFERENCES cfg.formas_pago(id),
  forma_nombre     TEXT NOT NULL,
  monto            NUMERIC(12,2) NOT NULL DEFAULT 0,
  referencia       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── 8. RLS (Row Level Security) ────────────────────────────────
ALTER TABLE loc.cat_arrendatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE loc.cat_propiedades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE loc.ctrl_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE loc.cxc_loc           ENABLE ROW LEVEL SECURITY;
ALTER TABLE loc.recibos_loc       ENABLE ROW LEVEL SECURITY;
ALTER TABLE loc.recibos_loc_det   ENABLE ROW LEVEL SECURITY;
ALTER TABLE loc.recibos_loc_pagos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loc_arrendatarios_authenticated"  ON loc.cat_arrendatarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_propiedades_authenticated"    ON loc.cat_propiedades   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_asignaciones_authenticated"   ON loc.ctrl_asignaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_cxc_authenticated"            ON loc.cxc_loc           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_recibos_authenticated"        ON loc.recibos_loc       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_recibos_det_authenticated"    ON loc.recibos_loc_det   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_recibos_pagos_authenticated"  ON loc.recibos_loc_pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 9. Grants — schema + tablas + secuencias ───────────────────
GRANT USAGE ON SCHEMA loc TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA loc TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA loc TO anon, authenticated;

-- ── 10. Centro de venta POS para tickets/facturación/corte ─────
-- Reutiliza el mismo mecanismo de golf.ctrl_ventas + pos_centros_ingreso_map
-- que ya usan Hípico y Hospitality; el mapeo a centro de ingreso se
-- configura en Configuración > Mapeo POS (ya existente).
INSERT INTO golf.cat_centros_venta (nombre, descripcion, orden)
SELECT 'Locales y Propiedades', 'Renta de locales comerciales y propiedades', COALESCE(MAX(orden), 0) + 1
FROM golf.cat_centros_venta
ON CONFLICT DO NOTHING;
