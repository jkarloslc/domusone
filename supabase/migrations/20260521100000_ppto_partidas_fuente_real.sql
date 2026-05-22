-- Agrega vínculos de fuente real a ppto_partidas
-- fuente_real: 'seccion' | 'concepto' | 'op_area' | 'manual'

ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS fuente_real    TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS id_seccion_fk  INTEGER,
  ADD COLUMN IF NOT EXISTS id_concepto_fk INTEGER;

ALTER TABLE ctrl.ppto_partidas
  ADD CONSTRAINT ppto_partidas_fuente_real_check
  CHECK (fuente_real IN ('seccion', 'concepto', 'op_area', 'manual'));

-- Actualizar partidas de egreso existentes que ya tienen área vinculada
UPDATE ctrl.ppto_partidas
  SET fuente_real = 'op_area'
  WHERE tipo = 'egreso' AND id_area_fk IS NOT NULL AND fuente_real = 'manual';
