-- El campo "Pertenece a Asociación de Condóminos" vivía en cat.propietarios,
-- pero la rectoría de la base de datos es el Lote, no el propietario
-- (un lote puede tener varios propietarios y el dato es del inmueble).
-- Se mueve a cat.lotes (tab Cuotas del modal de Lotes).
ALTER TABLE cat.lotes
  ADD COLUMN IF NOT EXISTS pertenece_asociacion BOOLEAN NOT NULL DEFAULT false;

-- Migra el valor existente: si algún propietario del lote pertenecía a la
-- asociación, el lote hereda ese valor.
UPDATE cat.lotes l
SET pertenece_asociacion = true
WHERE EXISTS (
  SELECT 1
  FROM ctrl.propietarios_lotes pl
  JOIN cat.propietarios p ON p.id = pl.id_propietario_fk
  WHERE pl.id_lote_fk = l.id
    AND p.pertenece_asociacion = true
);

ALTER TABLE cat.propietarios
  DROP COLUMN IF EXISTS pertenece_asociacion;
