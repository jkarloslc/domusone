-- ============================================================
-- Módulo Locales: migra de schema propio "loc" a "ctrl" (prefijo loc_)
-- "loc" no quedó operativo vía PostgREST aunque se agregó a Exposed
-- Schemas en Supabase — mismo problema ya resuelto antes para otros
-- módulos (ctrl.mant_*, ctrl.capex_*, ctrl.ppto_*, ctrl.torneo_*):
-- se estandariza todo dentro del schema "ctrl" ya expuesto.
-- 2026-07-14
-- ============================================================

-- ── 1. Mover tablas de loc.* a ctrl.* (si "loc" llegó a crearse) ─────
ALTER TABLE IF EXISTS loc.cat_arrendatarios SET SCHEMA ctrl;
ALTER TABLE IF EXISTS ctrl.cat_arrendatarios RENAME TO loc_arrendatarios;

ALTER TABLE IF EXISTS loc.cat_propiedades SET SCHEMA ctrl;
ALTER TABLE IF EXISTS ctrl.cat_propiedades RENAME TO loc_propiedades;

ALTER TABLE IF EXISTS loc.ctrl_asignaciones SET SCHEMA ctrl;
ALTER TABLE IF EXISTS ctrl.ctrl_asignaciones RENAME TO loc_asignaciones;

ALTER TABLE IF EXISTS loc.cxc_loc SET SCHEMA ctrl;
ALTER TABLE IF EXISTS ctrl.cxc_loc RENAME TO loc_cxc;

ALTER TABLE IF EXISTS loc.recibos_loc SET SCHEMA ctrl;
ALTER TABLE IF EXISTS ctrl.recibos_loc RENAME TO loc_recibos;

ALTER TABLE IF EXISTS loc.recibos_loc_det SET SCHEMA ctrl;
ALTER TABLE IF EXISTS ctrl.recibos_loc_det RENAME TO loc_recibos_det;

ALTER TABLE IF EXISTS loc.recibos_loc_pagos SET SCHEMA ctrl;
ALTER TABLE IF EXISTS ctrl.recibos_loc_pagos RENAME TO loc_recibos_pagos;

-- Las secuencias SERIAL viajan junto con SET SCHEMA pero conservan su
-- nombre original; se renombran para que coincidan con la tabla nueva.
ALTER SEQUENCE IF EXISTS ctrl.cat_arrendatarios_id_seq RENAME TO loc_arrendatarios_id_seq;
ALTER SEQUENCE IF EXISTS ctrl.cat_propiedades_id_seq   RENAME TO loc_propiedades_id_seq;
ALTER SEQUENCE IF EXISTS ctrl.ctrl_asignaciones_id_seq RENAME TO loc_asignaciones_id_seq;
ALTER SEQUENCE IF EXISTS ctrl.cxc_loc_id_seq           RENAME TO loc_cxc_id_seq;
ALTER SEQUENCE IF EXISTS ctrl.recibos_loc_id_seq       RENAME TO loc_recibos_id_seq;
ALTER SEQUENCE IF EXISTS ctrl.recibos_loc_det_id_seq   RENAME TO loc_recibos_det_id_seq;
ALTER SEQUENCE IF EXISTS ctrl.recibos_loc_pagos_id_seq RENAME TO loc_recibos_pagos_id_seq;

DROP SCHEMA IF EXISTS loc CASCADE;

-- ── 2. Red de seguridad: crear las tablas si "loc" nunca llegó a existir ──
CREATE TABLE IF NOT EXISTS ctrl.loc_arrendatarios (
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

CREATE TABLE IF NOT EXISTS ctrl.loc_propiedades (
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

-- La renta (monto_mensual) vive en la asignación, no en la propiedad:
-- así cada local puede tener una renta distinta y actualizable.
CREATE TABLE IF NOT EXISTS ctrl.loc_asignaciones (
  id                  SERIAL PRIMARY KEY,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES ctrl.loc_arrendatarios(id),
  id_propiedad_fk     INTEGER NOT NULL REFERENCES ctrl.loc_propiedades(id),
  fecha_inicio        DATE NOT NULL,
  fecha_fin           DATE,
  monto_mensual       NUMERIC(12,2) NOT NULL DEFAULT 0,
  dia_pago            INTEGER NOT NULL DEFAULT 1
                        CHECK (dia_pago BETWEEN 1 AND 31),
  activo              BOOLEAN NOT NULL DEFAULT true,
  observaciones       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ctrl.loc_cxc (
  id                  SERIAL PRIMARY KEY,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES ctrl.loc_arrendatarios(id),
  id_asignacion_fk    INTEGER REFERENCES ctrl.loc_asignaciones(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS ctrl.loc_recibos (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT NOT NULL UNIQUE,
  fecha_recibo        DATE NOT NULL,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES ctrl.loc_arrendatarios(id),
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

CREATE TABLE IF NOT EXISTS ctrl.loc_recibos_det (
  id              SERIAL PRIMARY KEY,
  id_recibo_fk    INTEGER NOT NULL REFERENCES ctrl.loc_recibos(id) ON DELETE CASCADE,
  id_cuota_fk     INTEGER REFERENCES ctrl.loc_cxc(id) ON DELETE SET NULL,
  concepto        TEXT,
  tipo            TEXT DEFAULT 'RENTA_LOCAL',
  periodo         TEXT,
  monto_original  NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento       NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_final     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ctrl.loc_recibos_pagos (
  id               SERIAL PRIMARY KEY,
  id_recibo_fk     INTEGER NOT NULL REFERENCES ctrl.loc_recibos(id) ON DELETE CASCADE,
  id_forma_pago_fk INTEGER REFERENCES cfg.formas_pago(id),
  forma_nombre     TEXT NOT NULL,
  monto            NUMERIC(12,2) NOT NULL DEFAULT 0,
  referencia       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── 3. Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loc_arrendatarios_activo    ON ctrl.loc_arrendatarios(activo);
CREATE INDEX IF NOT EXISTS idx_loc_propiedades_status      ON ctrl.loc_propiedades(status);
CREATE INDEX IF NOT EXISTS idx_loc_propiedades_activo      ON ctrl.loc_propiedades(activo);
CREATE INDEX IF NOT EXISTS idx_loc_asig_arrendatario       ON ctrl.loc_asignaciones(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_loc_asig_propiedad          ON ctrl.loc_asignaciones(id_propiedad_fk);
CREATE INDEX IF NOT EXISTS idx_loc_asig_activo             ON ctrl.loc_asignaciones(activo);
CREATE INDEX IF NOT EXISTS idx_loc_cxc_arrendatario        ON ctrl.loc_cxc(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_loc_cxc_asignacion          ON ctrl.loc_cxc(id_asignacion_fk);
CREATE INDEX IF NOT EXISTS idx_loc_cxc_status              ON ctrl.loc_cxc(status);
CREATE INDEX IF NOT EXISTS idx_loc_cxc_periodo             ON ctrl.loc_cxc(periodo);
CREATE INDEX IF NOT EXISTS idx_loc_recibos_arrendatario    ON ctrl.loc_recibos(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_loc_recibos_fecha           ON ctrl.loc_recibos(fecha_recibo);
CREATE INDEX IF NOT EXISTS idx_loc_recibos_det_recibo      ON ctrl.loc_recibos_det(id_recibo_fk);

-- ── 4. GRANTs (patrón ctrl.mant_conceptos) ─────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.loc_arrendatarios TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.loc_arrendatarios_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.loc_propiedades TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.loc_propiedades_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.loc_asignaciones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.loc_asignaciones_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.loc_cxc TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.loc_cxc_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.loc_recibos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.loc_recibos_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.loc_recibos_det TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.loc_recibos_det_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.loc_recibos_pagos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.loc_recibos_pagos_id_seq TO authenticated;

-- ── 5. RLS + políticas explícitas por acción ───────────────────
ALTER TABLE ctrl.loc_arrendatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.loc_propiedades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.loc_asignaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.loc_cxc           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.loc_recibos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.loc_recibos_det   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.loc_recibos_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loc_arrendatarios_select" ON ctrl.loc_arrendatarios;
DROP POLICY IF EXISTS "loc_arrendatarios_insert" ON ctrl.loc_arrendatarios;
DROP POLICY IF EXISTS "loc_arrendatarios_update" ON ctrl.loc_arrendatarios;
DROP POLICY IF EXISTS "loc_arrendatarios_delete" ON ctrl.loc_arrendatarios;
CREATE POLICY "loc_arrendatarios_select" ON ctrl.loc_arrendatarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc_arrendatarios_insert" ON ctrl.loc_arrendatarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loc_arrendatarios_update" ON ctrl.loc_arrendatarios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_arrendatarios_delete" ON ctrl.loc_arrendatarios FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "loc_propiedades_select" ON ctrl.loc_propiedades;
DROP POLICY IF EXISTS "loc_propiedades_insert" ON ctrl.loc_propiedades;
DROP POLICY IF EXISTS "loc_propiedades_update" ON ctrl.loc_propiedades;
DROP POLICY IF EXISTS "loc_propiedades_delete" ON ctrl.loc_propiedades;
CREATE POLICY "loc_propiedades_select" ON ctrl.loc_propiedades FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc_propiedades_insert" ON ctrl.loc_propiedades FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loc_propiedades_update" ON ctrl.loc_propiedades FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_propiedades_delete" ON ctrl.loc_propiedades FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "loc_asignaciones_select" ON ctrl.loc_asignaciones;
DROP POLICY IF EXISTS "loc_asignaciones_insert" ON ctrl.loc_asignaciones;
DROP POLICY IF EXISTS "loc_asignaciones_update" ON ctrl.loc_asignaciones;
DROP POLICY IF EXISTS "loc_asignaciones_delete" ON ctrl.loc_asignaciones;
CREATE POLICY "loc_asignaciones_select" ON ctrl.loc_asignaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc_asignaciones_insert" ON ctrl.loc_asignaciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loc_asignaciones_update" ON ctrl.loc_asignaciones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_asignaciones_delete" ON ctrl.loc_asignaciones FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "loc_cxc_select" ON ctrl.loc_cxc;
DROP POLICY IF EXISTS "loc_cxc_insert" ON ctrl.loc_cxc;
DROP POLICY IF EXISTS "loc_cxc_update" ON ctrl.loc_cxc;
DROP POLICY IF EXISTS "loc_cxc_delete" ON ctrl.loc_cxc;
CREATE POLICY "loc_cxc_select" ON ctrl.loc_cxc FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc_cxc_insert" ON ctrl.loc_cxc FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loc_cxc_update" ON ctrl.loc_cxc FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_cxc_delete" ON ctrl.loc_cxc FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "loc_recibos_select" ON ctrl.loc_recibos;
DROP POLICY IF EXISTS "loc_recibos_insert" ON ctrl.loc_recibos;
DROP POLICY IF EXISTS "loc_recibos_update" ON ctrl.loc_recibos;
DROP POLICY IF EXISTS "loc_recibos_delete" ON ctrl.loc_recibos;
CREATE POLICY "loc_recibos_select" ON ctrl.loc_recibos FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc_recibos_insert" ON ctrl.loc_recibos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loc_recibos_update" ON ctrl.loc_recibos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_recibos_delete" ON ctrl.loc_recibos FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "loc_recibos_det_select" ON ctrl.loc_recibos_det;
DROP POLICY IF EXISTS "loc_recibos_det_insert" ON ctrl.loc_recibos_det;
DROP POLICY IF EXISTS "loc_recibos_det_update" ON ctrl.loc_recibos_det;
DROP POLICY IF EXISTS "loc_recibos_det_delete" ON ctrl.loc_recibos_det;
CREATE POLICY "loc_recibos_det_select" ON ctrl.loc_recibos_det FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc_recibos_det_insert" ON ctrl.loc_recibos_det FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loc_recibos_det_update" ON ctrl.loc_recibos_det FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_recibos_det_delete" ON ctrl.loc_recibos_det FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "loc_recibos_pagos_select" ON ctrl.loc_recibos_pagos;
DROP POLICY IF EXISTS "loc_recibos_pagos_insert" ON ctrl.loc_recibos_pagos;
DROP POLICY IF EXISTS "loc_recibos_pagos_update" ON ctrl.loc_recibos_pagos;
DROP POLICY IF EXISTS "loc_recibos_pagos_delete" ON ctrl.loc_recibos_pagos;
CREATE POLICY "loc_recibos_pagos_select" ON ctrl.loc_recibos_pagos FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc_recibos_pagos_insert" ON ctrl.loc_recibos_pagos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loc_recibos_pagos_update" ON ctrl.loc_recibos_pagos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "loc_recibos_pagos_delete" ON ctrl.loc_recibos_pagos FOR DELETE TO authenticated USING (true);
