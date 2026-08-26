-- El campo Área del vale de combustible era solo informativo (el origen real
-- del gasto se define en la OP que paga el vale, no en el vale mismo). Se
-- sustituye por Centro de Costo, que es el dato informativo que de verdad se
-- usa para ubicar el vale de un vistazo. id_area_fk se deja intacta (no se
-- borra) para no perder el histórico de vales ya capturados.
ALTER TABLE ctrl.vales_combustible
  ADD COLUMN IF NOT EXISTS id_centro_costo_fk INTEGER REFERENCES cfg.centros_costo(id);

UPDATE ctrl.vales_combustible v
SET id_centro_costo_fk = a.id_centro_costo_fk
FROM cfg.areas a
WHERE v.id_area_fk = a.id
  AND v.id_centro_costo_fk IS NULL;

CREATE INDEX IF NOT EXISTS idx_vales_combustible_cc ON ctrl.vales_combustible(id_centro_costo_fk);
