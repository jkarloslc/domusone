-- Permite ligar un registro de la Bitácora de Uso a un Vale de Combustible,
-- para "sacar" litros del vale (típicamente modalidad Garrafa: un pool de
-- litros para el área que se va consumiendo por equipo/uso) sin necesidad de
-- pasar por el tab de Cargas.
ALTER TABLE ctrl.bitacora_uso_equipos
  ADD COLUMN IF NOT EXISTS id_vale_combustible_fk INTEGER REFERENCES ctrl.vales_combustible(id);

CREATE INDEX IF NOT EXISTS idx_uso_equipos_vale ON ctrl.bitacora_uso_equipos(id_vale_combustible_fk);
