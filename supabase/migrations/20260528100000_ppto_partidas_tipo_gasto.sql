-- Agrega tipo_gasto a ppto_partidas para filtrar OPs con mayor granularidad
ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS tipo_gasto TEXT;
