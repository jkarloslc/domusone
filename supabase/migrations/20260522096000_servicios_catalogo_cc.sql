ALTER TABLE ctrl.servicios_catalogo
  ADD COLUMN IF NOT EXISTS id_centro_costo_fk BIGINT REFERENCES cfg.centros_costo(id);

CREATE INDEX IF NOT EXISTS idx_svc_cat_cc ON ctrl.servicios_catalogo (id_centro_costo_fk);
