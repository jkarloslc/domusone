-- ============================================================
-- Locales / Propiedades: cuota adicional "Servicios de Mantto"
-- Cargo mensual variable por propiedad, independiente de la renta,
-- que se cobra junto con ella (misma mecánica de cuotas en loc_cxc).
-- 2026-09-01
-- ============================================================

ALTER TABLE ctrl.loc_asignaciones
  ADD COLUMN IF NOT EXISTS monto_mantenimiento NUMERIC(12,2) NOT NULL DEFAULT 0;
