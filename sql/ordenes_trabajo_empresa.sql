-- ══════════════════════════════════════════════════════════════
-- Migración: Campo empresa en ctrl.ordenes_trabajo
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE ctrl.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS empresa TEXT NOT NULL DEFAULT 'Balvanera';

-- Todas las OTs existentes quedan como Balvanera automáticamente.
-- Valores válidos: 'Balvanera', 'Oitydisa'
