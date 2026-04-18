-- ============================================================
--  GOLF — Fase 5: Carritos + CXC Golf
--  Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. Catálogo de slots (cajones) ──────────────────────────
CREATE TABLE IF NOT EXISTS golf.cat_slots (
  id         SERIAL PRIMARY KEY,
  numero     TEXT NOT NULL UNIQUE,   -- ej. "1", "42", "A-12"
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_cat_slots"
  ON golf.cat_slots FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.cat_slots TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_slots_id_seq TO authenticated;

-- ── 2. Catálogo de carritos (propiedad del socio) ───────────
CREATE TABLE IF NOT EXISTS golf.cat_carritos (
  id             SERIAL PRIMARY KEY,
  id_socio_fk    INTEGER NOT NULL REFERENCES golf.cat_socios(id) ON DELETE CASCADE,
  marca          TEXT,
  modelo         TEXT,
  anio           INTEGER,
  color          TEXT,
  numero_serie   TEXT,
  placa          TEXT,
  tipo           TEXT NOT NULL DEFAULT 'ELECTRICO',  -- ELECTRICO | GASOLINERO | OTRO
  activo         BOOLEAN NOT NULL DEFAULT true,
  observaciones  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_carritos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_cat_carritos"
  ON golf.cat_carritos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.cat_carritos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_carritos_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_cat_carritos_socio ON golf.cat_carritos(id_socio_fk);

-- ── 3. Contratos de pensión ─────────────────────────────────
CREATE TABLE IF NOT EXISTS golf.ctrl_pensiones (
  id              SERIAL PRIMARY KEY,
  id_socio_fk     INTEGER NOT NULL REFERENCES golf.cat_socios(id),
  id_carrito_fk   INTEGER NOT NULL REFERENCES golf.cat_carritos(id),
  id_slot_fk      INTEGER REFERENCES golf.cat_slots(id),
  fecha_inicio    DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin       DATE,                              -- NULL = indefinido
  monto_mensual   NUMERIC(10,2) NOT NULL,            -- tarifa al momento de crear
  activo          BOOLEAN NOT NULL DEFAULT true,
  observaciones   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.ctrl_pensiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_ctrl_pensiones"
  ON golf.ctrl_pensiones FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.ctrl_pensiones TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_pensiones_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_ctrl_pensiones_socio   ON golf.ctrl_pensiones(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_ctrl_pensiones_carrito ON golf.ctrl_pensiones(id_carrito_fk);
CREATE INDEX IF NOT EXISTS idx_ctrl_pensiones_slot    ON golf.ctrl_pensiones(id_slot_fk);

-- ── 4. Configuración global de carritos (1 fila) ────────────
CREATE TABLE IF NOT EXISTS golf.cfg_carritos (
  id              SERIAL PRIMARY KEY,
  tarifa_mensual  NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cfg_carritos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_cfg_carritos"
  ON golf.cfg_carritos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.cfg_carritos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cfg_carritos_id_seq TO authenticated;

-- Insertar fila inicial
INSERT INTO golf.cfg_carritos (tarifa_mensual) VALUES (0)
ON CONFLICT DO NOTHING;

-- ── 5. CXC Golf — cuotas de membresía y pensiones ───────────
CREATE TABLE IF NOT EXISTS golf.cxc_golf (
  id               SERIAL PRIMARY KEY,
  id_socio_fk      INTEGER NOT NULL REFERENCES golf.cat_socios(id),
  tipo             TEXT NOT NULL,              -- MEMBRESIA | PENSION_CARRITO
  id_pension_fk    INTEGER REFERENCES golf.ctrl_pensiones(id),
  concepto         TEXT NOT NULL,              -- descripción legible
  periodo          TEXT,                       -- ej. '2026-03'
  monto_original   NUMERIC(10,2) NOT NULL,
  descuento        NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_final      NUMERIC(10,2) GENERATED ALWAYS AS (monto_original - descuento) STORED,
  status           TEXT NOT NULL DEFAULT 'PENDIENTE',  -- PENDIENTE | PAGADO | CANCELADO
  fecha_emision    DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  fecha_pago       DATE,
  forma_pago       TEXT,                       -- EFECTIVO | TRANSFERENCIA | TARJETA | OTRO
  referencia_pago  TEXT,
  observaciones    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cxc_golf ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_cxc_golf"
  ON golf.cxc_golf FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
GRANT ALL ON golf.cxc_golf TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cxc_golf_id_seq TO authenticated;

CREATE INDEX IF NOT EXISTS idx_cxc_golf_socio    ON golf.cxc_golf(id_socio_fk);
CREATE INDEX IF NOT EXISTS idx_cxc_golf_status   ON golf.cxc_golf(status);
CREATE INDEX IF NOT EXISTS idx_cxc_golf_tipo     ON golf.cxc_golf(tipo);
CREATE INDEX IF NOT EXISTS idx_cxc_golf_pension  ON golf.cxc_golf(id_pension_fk);
CREATE INDEX IF NOT EXISTS idx_cxc_golf_periodo  ON golf.cxc_golf(periodo);
