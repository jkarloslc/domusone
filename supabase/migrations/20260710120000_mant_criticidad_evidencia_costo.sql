-- =============================================================
-- Fase 1 de rediseño de seguimiento de Mantenimiento (ver memoria
-- de proyecto "mant_estrategia_seguimiento" del 2026-07-10):
-- las áreas comunes rutinarias se agrupan en rondas de un solo tap
-- (por excepción); las críticas mantienen check-off individual.
-- Este cambio es aditivo — no toca la relación N:N existente
-- (mant_programas ↔ mant_programa_areas) ni rompe datos.
-- =============================================================

-- 1. Criticidad de cada área común (crítico = seguridad vial / imagen
--    institucional / riesgo de drenaje; rutinario = todo lo demás).
ALTER TABLE cfg.areas_comunes
  ADD COLUMN IF NOT EXISTS criticidad TEXT NOT NULL DEFAULT 'rutinario'
  CHECK (criticidad IN ('critico', 'rutinario'));

-- Regla aprobada por el usuario (30/54 sobre las 84 áreas activas al
-- 2026-07-10): crítico si el nombre o descripción menciona acceso,
-- caseta, glorieta, canal pluvial, carretera, talud, túnel, carril o
-- estacionamiento general.
UPDATE cfg.areas_comunes
SET criticidad = 'critico'
WHERE nombre      ILIKE ANY (ARRAY['%acceso%','%caseta%','%glorieta%','%talud%','%tunel%','%túnel%','%carril%'])
   OR descripcion ILIKE ANY (ARRAY['%acceso%','%caseta%','%glorieta%','%talud%','%tunel%','%túnel%','%carril%',
                                    '%canal pluvial%','%carretera%','%estacionamiento general%']);

-- 2. Evidencia y costo de campo por ejecución (ronda o ítem crítico).
--    Costo se captura agregado por ejecución/ronda, no por área común
--    individual dentro de la ronda (decisión de usabilidad 2026-07-10).
ALTER TABLE ctrl.mant_ejecuciones
  ADD COLUMN IF NOT EXISTS hallazgo         TEXT,
  ADD COLUMN IF NOT EXISTS foto_url         TEXT,
  ADD COLUMN IF NOT EXISTS costo_mano_obra  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_materiales NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 3. Flag para correctivos mayores que deben generar OT automáticamente
--    al llegar su fecha programada, sin esperar una excepción reportada
--    en campo (ej. servicio anual de un tramo).
ALTER TABLE ctrl.mant_programas
  ADD COLUMN IF NOT EXISTS genera_ot_automatica BOOLEAN NOT NULL DEFAULT false;

-- Nota: no se requieren GRANTs nuevos — estas son columnas aditivas
-- sobre tablas existentes que ya tienen permisos de authenticated/
-- service_role (ver 20260609120000, 20260629180000, 20260702150000).
