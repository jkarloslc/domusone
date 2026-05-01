-- Agrega columnas faltantes a ctrl_acceso_acomp
-- para registrar el tipo de acompañante (familiar, externo, pase)

ALTER TABLE ctrl_acceso_acomp
  ADD COLUMN IF NOT EXISTS id_familiar_fk  integer REFERENCES cat_familiares(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_externo      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origen_pago     text,
  ADD COLUMN IF NOT EXISTS id_pase_mov_fk  integer REFERENCES ctrl_pases_movimientos(id) ON DELETE SET NULL;

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_acceso_acomp_familiar  ON ctrl_acceso_acomp(id_familiar_fk)  WHERE id_familiar_fk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acceso_acomp_pase_mov  ON ctrl_acceso_acomp(id_pase_mov_fk)  WHERE id_pase_mov_fk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acceso_acomp_externo   ON ctrl_acceso_acomp(es_externo)       WHERE es_externo = true;

COMMENT ON COLUMN ctrl_acceso_acomp.id_familiar_fk  IS 'FK al familiar del socio (si aplica)';
COMMENT ON COLUMN ctrl_acceso_acomp.es_externo      IS 'true = invitado externo que consume pase o paga green fee';
COMMENT ON COLUMN ctrl_acceso_acomp.origen_pago     IS 'PASE | GREEN_FEE | null (para externos)';
COMMENT ON COLUMN ctrl_acceso_acomp.id_pase_mov_fk  IS 'Movimiento de pase consumido (si origen_pago = PASE)';
