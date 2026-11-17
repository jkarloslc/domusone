-- Servicios (CFE / Agua / Gas LP): Frente propio en el catálogo, para el
-- reporte CC → Área → Frente. Se replica en la tabla _mantto (Fraccionamiento).
ALTER TABLE ctrl.servicios_catalogo
  ADD COLUMN IF NOT EXISTS id_frente_fk bigint REFERENCES cfg.frentes(id);

ALTER TABLE ctrl.servicios_catalogo_mantto
  ADD COLUMN IF NOT EXISTS id_frente_fk bigint REFERENCES cfg.frentes(id);

CREATE INDEX IF NOT EXISTS servicios_catalogo_frente_idx        ON ctrl.servicios_catalogo (id_frente_fk);
CREATE INDEX IF NOT EXISTS servicios_catalogo_mantto_frente_idx ON ctrl.servicios_catalogo_mantto (id_frente_fk);
