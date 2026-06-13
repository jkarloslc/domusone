-- ============================================================
-- Hípico: Reconstrucción completa del módulo de cobranza
-- Elimina ctrl_contratos/ctrl_cargos/ctrl_pagos y crea
-- ctrl_asignaciones + cxc_hip + recibos_hip (mirrors Golf Pensiones)
-- 2026-06-14
-- ============================================================

-- ── 1. Eliminar tablas antiguas (cascade) ────────────────────
DROP TABLE IF EXISTS hip.ctrl_pagos_formas  CASCADE;
DROP TABLE IF EXISTS hip.ctrl_pagos_det     CASCADE;
DROP TABLE IF EXISTS hip.ctrl_pagos         CASCADE;
DROP TABLE IF EXISTS hip.ctrl_cargos        CASCADE;
DROP TABLE IF EXISTS hip.ctrl_contratos     CASCADE;

-- ── 2. cfg_hip — tarifa global de renta ──────────────────────
CREATE TABLE IF NOT EXISTS hip.cfg_hip (
  id              SERIAL PRIMARY KEY,
  tarifa_mensual  NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Fila única inicial
INSERT INTO hip.cfg_hip (id, tarifa_mensual) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON hip.cfg_hip TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hip.cfg_hip_id_seq TO authenticated;

-- ── 3. ctrl_asignaciones — asignación arrendatario ↔ caballeriza
CREATE TABLE IF NOT EXISTS hip.ctrl_asignaciones (
  id                  SERIAL PRIMARY KEY,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES hip.cat_arrendatarios(id),
  id_caballeriza_fk   INTEGER NOT NULL REFERENCES hip.cat_caballerizas(id),
  fecha_inicio        DATE NOT NULL,
  fecha_fin           DATE,
  monto_mensual       NUMERIC(12,2) NOT NULL DEFAULT 0,
  dia_pago            INTEGER NOT NULL DEFAULT 1
                        CHECK (dia_pago BETWEEN 1 AND 31),
  activo              BOOLEAN NOT NULL DEFAULT true,
  observaciones       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asig_arrendatario ON hip.ctrl_asignaciones(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_asig_caballeriza  ON hip.ctrl_asignaciones(id_caballeriza_fk);
CREATE INDEX IF NOT EXISTS idx_asig_activo       ON hip.ctrl_asignaciones(activo);

GRANT SELECT, INSERT, UPDATE ON hip.ctrl_asignaciones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hip.ctrl_asignaciones_id_seq TO authenticated;

-- ── 4. cxc_hip — cuotas mensuales de renta ───────────────────
CREATE TABLE IF NOT EXISTS hip.cxc_hip (
  id                  SERIAL PRIMARY KEY,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES hip.cat_arrendatarios(id),
  id_asignacion_fk    INTEGER REFERENCES hip.ctrl_asignaciones(id) ON DELETE SET NULL,
  concepto            TEXT NOT NULL,
  periodo             TEXT,                -- YYYY-MM
  monto_original      NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento           NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_final         NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo               NUMERIC(12,2),       -- saldo pendiente (null = no calculado aún)
  status              TEXT NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (status IN ('PENDIENTE','PAGADO','CANCELADO','PAGO_PARCIAL')),
  fecha_emision       DATE,
  fecha_vencimiento   DATE,
  fecha_pago          DATE,
  forma_pago          TEXT,
  tipo                TEXT NOT NULL DEFAULT 'RENTA_CABALLERIZA',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cxc_hip_arrendatario  ON hip.cxc_hip(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_cxc_hip_asignacion     ON hip.cxc_hip(id_asignacion_fk);
CREATE INDEX IF NOT EXISTS idx_cxc_hip_status         ON hip.cxc_hip(status);
CREATE INDEX IF NOT EXISTS idx_cxc_hip_periodo        ON hip.cxc_hip(periodo);

GRANT SELECT, INSERT, UPDATE ON hip.cxc_hip TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hip.cxc_hip_id_seq TO authenticated;

-- ── 5. recibos_hip — recibos de cobro (como recibos_golf) ────
CREATE TABLE IF NOT EXISTS hip.recibos_hip (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT NOT NULL UNIQUE,
  fecha_recibo        DATE NOT NULL,
  id_arrendatario_fk  INTEGER NOT NULL REFERENCES hip.cat_arrendatarios(id),
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
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_hip_arrendatario ON hip.recibos_hip(id_arrendatario_fk);
CREATE INDEX IF NOT EXISTS idx_recibos_hip_fecha        ON hip.recibos_hip(fecha_recibo);

GRANT SELECT, INSERT, UPDATE ON hip.recibos_hip TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hip.recibos_hip_id_seq TO authenticated;

-- ── 6. recibos_hip_det — líneas del recibo ───────────────────
CREATE TABLE IF NOT EXISTS hip.recibos_hip_det (
  id              SERIAL PRIMARY KEY,
  id_recibo_fk    INTEGER NOT NULL REFERENCES hip.recibos_hip(id) ON DELETE CASCADE,
  id_cuota_fk     INTEGER REFERENCES hip.cxc_hip(id) ON DELETE SET NULL,
  concepto        TEXT,
  tipo            TEXT DEFAULT 'RENTA_CABALLERIZA',
  periodo         TEXT,
  monto_original  NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento       NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_final     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_hip_det_recibo ON hip.recibos_hip_det(id_recibo_fk);

GRANT SELECT, INSERT, UPDATE ON hip.recibos_hip_det TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hip.recibos_hip_det_id_seq TO authenticated;

-- ── 7. recibos_hip_pagos — formas de pago del recibo ─────────
CREATE TABLE IF NOT EXISTS hip.recibos_hip_pagos (
  id               SERIAL PRIMARY KEY,
  id_recibo_fk     INTEGER NOT NULL REFERENCES hip.recibos_hip(id) ON DELETE CASCADE,
  id_forma_pago_fk INTEGER REFERENCES cfg.formas_pago(id),
  forma_nombre     TEXT NOT NULL,
  monto            NUMERIC(12,2) NOT NULL DEFAULT 0,
  referencia       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON hip.recibos_hip_pagos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE hip.recibos_hip_pagos_id_seq TO authenticated;

-- ── 8. RLS (Row Level Security) ───────────────────────────────
ALTER TABLE hip.cfg_hip           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.ctrl_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.cxc_hip           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.recibos_hip       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.recibos_hip_det   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hip.recibos_hip_pagos ENABLE ROW LEVEL SECURITY;

-- Políticas: acceso total para usuarios autenticados
CREATE POLICY "hip_cfg_authenticated"           ON hip.cfg_hip           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_asignaciones_authenticated"  ON hip.ctrl_asignaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_cxc_authenticated"           ON hip.cxc_hip           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_recibos_authenticated"       ON hip.recibos_hip       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_recibos_det_authenticated"   ON hip.recibos_hip_det   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "hip_recibos_pagos_authenticated" ON hip.recibos_hip_pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);
