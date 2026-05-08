-- ════════════════════════════════════════════════════════════════
-- DOMUSONE — Campos fiscales en ctrl.recibos_ingreso
-- Migración: 20260508110000
-- ════════════════════════════════════════════════════════════════

ALTER TABLE ctrl.recibos_ingreso
  ADD COLUMN IF NOT EXISTS folio_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS facturable   BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_recibos_ingreso_folio_fiscal
  ON ctrl.recibos_ingreso(folio_fiscal) WHERE folio_fiscal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recibos_ingreso_facturable
  ON ctrl.recibos_ingreso(facturable) WHERE facturable = true;

-- GRANT (ya heredados de la tabla, pero explícitos por si acaso)
GRANT ALL ON ctrl.recibos_ingreso TO authenticated;
GRANT ALL ON ctrl.recibos_ingreso TO anon;
