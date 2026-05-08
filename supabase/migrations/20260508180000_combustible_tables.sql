-- Tablas de control de combustible (módulo equipo-flota)
-- Esquema: ctrl

-- ── Vales de combustible ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.vales_combustible (
  id                 SERIAL PRIMARY KEY,
  folio              TEXT UNIQUE,
  tipo_suministro    TEXT NOT NULL,          -- 'Gasolinería' | 'Garrafa'
  id_area_fk         INTEGER REFERENCES cfg.areas(id),
  id_equipo_fk       INTEGER,               -- ref a cfg.equipos (nullable para Garrafa)
  periodo            TEXT,
  litros_autorizados NUMERIC(10,2),
  litros_consumidos  NUMERIC(10,2) DEFAULT 0,
  monto_autorizado   NUMERIC(12,2),
  vigencia           DATE,
  status             TEXT NOT NULL DEFAULT 'Emitido',
                     -- Emitido | Parcial | Agotado | Entregado | Cerrado | Cancelado
  id_op_fk           INTEGER,               -- ref a ordenes_pago
  emitido_por        TEXT,
  notas              TEXT,
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vales_combustible_area   ON ctrl.vales_combustible(id_area_fk);
CREATE INDEX IF NOT EXISTS idx_vales_combustible_status ON ctrl.vales_combustible(status);

-- ── Cargas / consumos de combustible ────────────────────────────────
CREATE TABLE IF NOT EXISTS ctrl.cargas_combustible (
  id               SERIAL PRIMARY KEY,
  tipo_carga       TEXT NOT NULL,            -- 'Gasolinería' | 'Entrega Garrafa' | 'Consumo Garrafa'
  id_vale_fk       INTEGER REFERENCES ctrl.vales_combustible(id),
  id_equipo_fk     INTEGER,                 -- ref a cfg.equipos
  id_area_fk       INTEGER REFERENCES cfg.areas(id),
  fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
  litros           NUMERIC(10,2) NOT NULL,
  precio_unitario  NUMERIC(10,4),
  monto_total      NUMERIC(12,2),
  odometro         NUMERIC(10,1),
  comprobante_url  TEXT,
  registrado_por   TEXT,
  notas            TEXT,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cargas_combustible_vale  ON ctrl.cargas_combustible(id_vale_fk);
CREATE INDEX IF NOT EXISTS idx_cargas_combustible_area  ON ctrl.cargas_combustible(id_area_fk);
CREATE INDEX IF NOT EXISTS idx_cargas_combustible_fecha ON ctrl.cargas_combustible(fecha);

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE ctrl.vales_combustible  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.cargas_combustible ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vales_combustible_all"  ON ctrl.vales_combustible  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cargas_combustible_all" ON ctrl.cargas_combustible FOR ALL TO authenticated USING (true) WITH CHECK (true);
