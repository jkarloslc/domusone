-- ============================================================
--  GOLF — Fase 3b: Visitante externo en Reservaciones
--  Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE golf.ctrl_reservaciones
  ADD COLUMN IF NOT EXISTS es_externo       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nombre_externo   TEXT,
  ADD COLUMN IF NOT EXISTS telefono_externo TEXT;
