-- ══════════════════════════════════════════════════════════════
-- Módulo: Control de Combustible
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- 1. Vales de Combustible
--    Un vale puede ser mensual (Gasolinería) y admite cargas parciales
--    hasta agotar litros_autorizados. Para Garrafa cubre la entrega al área.
CREATE TABLE IF NOT EXISTS ctrl.vales_combustible (
  id                  SERIAL PRIMARY KEY,
  folio               TEXT    NOT NULL UNIQUE,          -- VAL-YYYY-NNNN
  tipo_suministro     TEXT    NOT NULL DEFAULT 'Gasolinería', -- Gasolinería | Garrafa
  id_area_fk          INTEGER NOT NULL REFERENCES cfg.areas(id),
  id_equipo_fk        INTEGER REFERENCES cfg.equipos(id), -- obligatorio en Gasolinería
  periodo             TEXT,                              -- ej. 'Abril 2026'
  litros_autorizados  NUMERIC(10,2) NOT NULL,
  litros_usados       NUMERIC(10,2) NOT NULL DEFAULT 0,  -- suma de cargas vinculadas
  monto_autorizado    NUMERIC(14,2),
  vigencia            DATE,
  status              TEXT    NOT NULL DEFAULT 'Emitido', -- Emitido | Parcial | Agotado | Entregado | Cerrado | Cancelado
  id_op_fk            INTEGER REFERENCES comp.ordenes_pago(id),
  emitido_por         TEXT,
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- 2. Cargas de Combustible
--    Gasolinería: cada carga parcial al mes vinculada al vale mensual
--    Entrega Garrafa: almacén entrega litros al área (cierra el ciclo del vale)
--    Consumo Garrafa: área registra consumo por equipo desde su garrafa
CREATE TABLE IF NOT EXISTS ctrl.cargas_combustible (
  id                  SERIAL PRIMARY KEY,
  id_vale_fk          INTEGER REFERENCES ctrl.vales_combustible(id), -- nullable (emergencia sin vale)
  id_equipo_fk        INTEGER REFERENCES cfg.equipos(id),            -- requerido en Gasolinería y Consumo Garrafa
  id_area_fk          INTEGER NOT NULL REFERENCES cfg.areas(id),
  tipo_carga          TEXT    NOT NULL DEFAULT 'Gasolinería', -- Gasolinería | Entrega Garrafa | Consumo Garrafa
  fecha               DATE    NOT NULL DEFAULT CURRENT_DATE,
  litros              NUMERIC(10,2) NOT NULL,
  precio_unitario     NUMERIC(10,4),
  monto_total         NUMERIC(14,2),
  odometro            NUMERIC(10,2),                   -- km u horas al momento de la carga
  comprobante_url     TEXT,                             -- foto del ticket
  registrado_por      TEXT,
  notas               TEXT,
  activo              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_vales_area     ON ctrl.vales_combustible(id_area_fk);
CREATE INDEX IF NOT EXISTS idx_vales_equipo   ON ctrl.vales_combustible(id_equipo_fk);
CREATE INDEX IF NOT EXISTS idx_vales_status   ON ctrl.vales_combustible(status);
CREATE INDEX IF NOT EXISTS idx_cargas_vale    ON ctrl.cargas_combustible(id_vale_fk);
CREATE INDEX IF NOT EXISTS idx_cargas_equipo  ON ctrl.cargas_combustible(id_equipo_fk);
CREATE INDEX IF NOT EXISTS idx_cargas_area    ON ctrl.cargas_combustible(id_area_fk);
CREATE INDEX IF NOT EXISTS idx_cargas_fecha   ON ctrl.cargas_combustible(fecha);

-- ══════════════════════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════════════════════
ALTER TABLE ctrl.vales_combustible  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctrl.cargas_combustible ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vales_select"   ON ctrl.vales_combustible  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "vales_insert"   ON ctrl.vales_combustible  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "vales_update"   ON ctrl.vales_combustible  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "cargas_select"  ON ctrl.cargas_combustible FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "cargas_insert"  ON ctrl.cargas_combustible FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "cargas_update"  ON ctrl.cargas_combustible FOR UPDATE USING (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════════════════════
-- GRANTs
-- ══════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.vales_combustible  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.cargas_combustible TO authenticated;
GRANT USAGE ON SEQUENCE ctrl.vales_combustible_id_seq           TO authenticated;
GRANT USAGE ON SEQUENCE ctrl.cargas_combustible_id_seq          TO authenticated;
