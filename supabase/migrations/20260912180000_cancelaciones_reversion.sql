-- Permite marcar en la bitácora cuándo una cancelación fue revertida
-- (reapertura de recibo, solo superadmin). Ejecutar en Supabase SQL Editor
-- o: supabase db push

ALTER TABLE ctrl.cancelaciones
  ADD COLUMN IF NOT EXISTS revertida        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revertida_fecha  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revertida_por    TEXT;
