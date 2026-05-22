-- Marca proveedores internos (empresas del grupo Balvanera) para uso como titulares de servicios
ALTER TABLE comp.proveedores ADD COLUMN IF NOT EXISTS interno BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_prov_interno ON comp.proveedores (interno) WHERE interno = TRUE;
