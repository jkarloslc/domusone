-- El vale de combustible no indicaba qué combustible se solicita
-- (Magna / Premium / Diesel / Gas LP). Se agrega la columna; los vales
-- existentes quedan en NULL y se muestran como "—".
ALTER TABLE ctrl.vales_combustible
  ADD COLUMN IF NOT EXISTS tipo_combustible TEXT;
