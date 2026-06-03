-- Agrega campo modulo a partidas y presupuestos
-- Permite clasificar partidas por área operativa y filtrar al capturar presupuesto

ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS modulo TEXT NOT NULL DEFAULT 'General';

ALTER TABLE ctrl.ppto_presupuestos
  ADD COLUMN IF NOT EXISTS modulo TEXT NOT NULL DEFAULT 'General';
