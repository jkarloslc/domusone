-- Separa "a qué reporte aplica la partida" (Presupuesto / Flujo) de "modulo" (área operativa).
-- Flujo NO es un módulo: una partida de Golf/Mantenimiento/etc. puede aplicar a Presupuesto,
-- a Flujo, o a ambos. Default true/true preserva el comportamiento actual para toda partida
-- existente (sigue apareciendo en ambos reportes sin cambios).

ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS incluir_presupuesto BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS incluir_flujo        BOOLEAN NOT NULL DEFAULT true;
