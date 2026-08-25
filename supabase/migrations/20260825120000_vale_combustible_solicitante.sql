-- El vale de combustible no capturaba quién lo solicita; se agrega para
-- mostrarlo en el encabezado del modal y en el formato de impresión
-- (junto con Área / Centro de Costo, que ya se resuelven vía cfg.areas).
ALTER TABLE ctrl.vales_combustible
  ADD COLUMN IF NOT EXISTS solicitante TEXT;
