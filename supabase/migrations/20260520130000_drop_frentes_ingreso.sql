-- ============================================================
-- Eliminar funcionalidad de Frentes de Ingreso
-- Sustituida por cfg.conceptos_ingreso (más flexible).
-- No hay datos en estas tablas ni centros con tipo_desglose='frentes'.
-- ============================================================

-- 1. Tabla de detalle en recibos
DROP TABLE IF EXISTS ctrl.recibos_ingreso_frentes;

-- 2. Catálogo de frentes
DROP TABLE IF EXISTS cfg.frentes_ingreso;

-- 3. Quitar 'frentes' como valor válido en centros_ingreso.tipo_desglose
--    (si existe un CHECK constraint; si no, es no-op)
ALTER TABLE cfg.centros_ingreso
  DROP CONSTRAINT IF EXISTS centros_ingreso_tipo_desglose_check;

ALTER TABLE cfg.centros_ingreso
  ADD CONSTRAINT centros_ingreso_tipo_desglose_check
  CHECK (tipo_desglose IN ('unico', 'secciones'));
