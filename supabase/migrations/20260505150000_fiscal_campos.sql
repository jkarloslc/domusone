-- ================================================================
-- DOMUSONE — Campos fiscales SAT
-- Migración: 20260505150000
-- ================================================================

-- ── Campos fiscales en Golf / cat_socios ────────────────────────
ALTER TABLE golf.cat_socios
  ADD COLUMN IF NOT EXISTS razon_social_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS cp_fiscal           TEXT,
  ADD COLUMN IF NOT EXISTS regimen_fiscal      TEXT DEFAULT '626',
  ADD COLUMN IF NOT EXISTS uso_cfdi            TEXT DEFAULT 'G03',
  ADD COLUMN IF NOT EXISTS email_fiscal        TEXT;

-- ── Campos fiscales en cat.propietarios ─────────────────────────
ALTER TABLE cat.propietarios
  ADD COLUMN IF NOT EXISTS regimen_fiscal TEXT DEFAULT '626',
  ADD COLUMN IF NOT EXISTS uso_cfdi       TEXT DEFAULT 'G03',
  ADD COLUMN IF NOT EXISTS email_fiscal   TEXT;

-- ── Folio fiscal en POS (ctrl_ventas) ───────────────────────────
ALTER TABLE golf.ctrl_ventas
  ADD COLUMN IF NOT EXISTS folio_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS facturable   BOOLEAN DEFAULT false;

-- ── Folio fiscal y facturable en Hípico ─────────────────────────
ALTER TABLE hip.ctrl_pagos
  ADD COLUMN IF NOT EXISTS folio_fiscal TEXT,
  ADD COLUMN IF NOT EXISTS facturable   BOOLEAN DEFAULT false;

-- ── Índices ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ctrl_ventas_folio_fiscal
  ON golf.ctrl_ventas(folio_fiscal) WHERE folio_fiscal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ctrl_pagos_folio_fiscal
  ON hip.ctrl_pagos(folio_fiscal)  WHERE folio_fiscal IS NOT NULL;
