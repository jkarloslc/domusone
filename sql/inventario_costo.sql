-- ══════════════════════════════════════════════════════════════
-- Migración: Agregar costo_ultima_compra a comp.inventario
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE comp.inventario
  ADD COLUMN IF NOT EXISTS costo_promedio NUMERIC(14, 4) NOT NULL DEFAULT 0;
