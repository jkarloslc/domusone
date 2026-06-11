-- Empresa en cfg.secciones — FK a comp.proveedores (en UI se filtran por interno = true)
-- Si se ejecutó la versión anterior de esta migración (empresa TEXT), se elimina esa columna.
ALTER TABLE cfg.secciones DROP COLUMN IF EXISTS empresa;
ALTER TABLE cfg.secciones
  ADD COLUMN IF NOT EXISTS id_empresa_fk INTEGER REFERENCES comp.proveedores(id);
