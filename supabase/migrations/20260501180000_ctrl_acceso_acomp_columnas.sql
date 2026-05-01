-- Crea tabla ctrl_acceso_acomp para registrar acompañantes por salida al campo

CREATE TABLE IF NOT EXISTS ctrl_acceso_acomp (
  id              serial PRIMARY KEY,
  id_acceso_fk    integer NOT NULL REFERENCES ctrl_accesos(id) ON DELETE CASCADE,
  orden           integer NOT NULL DEFAULT 1,
  nombre          text    NOT NULL,
  id_familiar_fk  integer REFERENCES cat_familiares(id) ON DELETE SET NULL,
  es_externo      boolean NOT NULL DEFAULT false,
  origen_pago     text,    -- PASE | GREEN_FEE | null
  id_pase_mov_fk  integer REFERENCES ctrl_pases_movimientos(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acceso_acomp_acceso    ON ctrl_acceso_acomp(id_acceso_fk);
CREATE INDEX IF NOT EXISTS idx_acceso_acomp_familiar  ON ctrl_acceso_acomp(id_familiar_fk) WHERE id_familiar_fk IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acceso_acomp_externo   ON ctrl_acceso_acomp(es_externo) WHERE es_externo = true;

-- RLS: mismos permisos que ctrl_accesos
ALTER TABLE ctrl_acceso_acomp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acceso_acomp_select" ON ctrl_acceso_acomp FOR SELECT USING (true);
CREATE POLICY "acceso_acomp_insert" ON ctrl_acceso_acomp FOR INSERT WITH CHECK (true);
CREATE POLICY "acceso_acomp_update" ON ctrl_acceso_acomp FOR UPDATE USING (true);
CREATE POLICY "acceso_acomp_delete" ON ctrl_acceso_acomp FOR DELETE USING (true);

COMMENT ON TABLE  ctrl_acceso_acomp                IS 'Acompañantes por salida al campo';
COMMENT ON COLUMN ctrl_acceso_acomp.id_familiar_fk IS 'FK al familiar del socio (si aplica)';
COMMENT ON COLUMN ctrl_acceso_acomp.es_externo     IS 'true = invitado externo';
COMMENT ON COLUMN ctrl_acceso_acomp.origen_pago    IS 'PASE | GREEN_FEE (solo para externos)';
COMMENT ON COLUMN ctrl_acceso_acomp.id_pase_mov_fk IS 'Movimiento de pase consumido';
