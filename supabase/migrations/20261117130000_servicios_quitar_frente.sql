-- Revierte 20261117120000: los servicios solo llevan Centro de Costo y Área.
-- La columna nunca se usó (0 registros con valor al quitarla).
DROP INDEX IF EXISTS ctrl.servicios_catalogo_frente_idx;
DROP INDEX IF EXISTS ctrl.servicios_catalogo_mantto_frente_idx;
ALTER TABLE ctrl.servicios_catalogo        DROP COLUMN IF EXISTS id_frente_fk;
ALTER TABLE ctrl.servicios_catalogo_mantto DROP COLUMN IF EXISTS id_frente_fk;
