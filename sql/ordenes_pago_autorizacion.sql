-- ══════════════════════════════════════════════════════════════
-- Migración: Campos de Autorización en comp.ordenes_pago
-- Ejecutar en Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE comp.ordenes_pago
  ADD COLUMN IF NOT EXISTS autorizado_por      TEXT,
  ADD COLUMN IF NOT EXISTS fecha_autorizacion  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS instrucciones_pago  TEXT;

-- instrucciones_pago: texto libre que deja Tesorería / Admin con indicaciones
-- especiales para ejecutar el pago (ej. "Pagar antes del viernes", "Retener IVA")
-- autorizado_por / fecha_autorizacion: se llenan automáticamente al aprobar la OP
