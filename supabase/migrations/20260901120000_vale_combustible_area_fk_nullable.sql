-- El modal de Vale de Combustible dejó de escribir id_area_fk desde el
-- 2026-08-25 (commit 2ff19a4, sustituido por id_centro_costo_fk — ver
-- 20260825130000_vale_combustible_centro_costo.sql). La columna se dejó
-- intacta para no perder el histórico, pero en producción tiene un NOT NULL
-- que no quedó reflejado en las migraciones del repo, y que ahora rechaza
-- todo insert nuevo con "null value in column id_area_fk violates not-null
-- constraint". Se relaja para permitir NULL en vales nuevos.
ALTER TABLE ctrl.vales_combustible ALTER COLUMN id_area_fk DROP NOT NULL;
