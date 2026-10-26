-- Catálogo de Agrupadores de Centros de Venta (POS). Permite filtrar y totalizar
-- reportes/vistas por "Agrupador/Centro de Venta". Análogo a cfg.agrupadores_ingreso.
CREATE TABLE IF NOT EXISTS cfg.agrupadores_venta (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  orden      INTEGER NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE golf.cat_centros_venta
  ADD COLUMN IF NOT EXISTS id_agrupador_fk INTEGER REFERENCES cfg.agrupadores_venta(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cat_centros_venta_agrupador ON golf.cat_centros_venta(id_agrupador_fk);

ALTER TABLE cfg.agrupadores_venta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agrupadores_venta_all" ON cfg.agrupadores_venta;
CREATE POLICY "agrupadores_venta_all" ON cfg.agrupadores_venta FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- GRANTs explícitos (tablas nuevas requieren GRANT o el insert falla en silencio)
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.agrupadores_venta TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.agrupadores_venta_id_seq TO authenticated, service_role;
