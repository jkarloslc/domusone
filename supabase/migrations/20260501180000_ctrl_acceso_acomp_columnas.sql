-- Agrega columnas faltantes a ctrl_acceso_acomp (tabla ya existe)

ALTER TABLE golf.ctrl_acceso_acomp
  ADD COLUMN IF NOT EXISTS id_familiar_fk  integer,
  ADD COLUMN IF NOT EXISTS es_externo      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origen_pago     text,
  ADD COLUMN IF NOT EXISTS id_pase_mov_fk  integer;

COMMENT ON COLUMN golf.ctrl_acceso_acomp.id_familiar_fk IS 'ID del familiar del socio (si aplica)';
COMMENT ON COLUMN golf.ctrl_acceso_acomp.es_externo     IS 'true = invitado externo';
COMMENT ON COLUMN golf.ctrl_acceso_acomp.origen_pago    IS 'PASE | GREEN_FEE (solo para externos)';
COMMENT ON COLUMN golf.ctrl_acceso_acomp.id_pase_mov_fk IS 'ID del movimiento de pase consumido';
