-- Catálogo de Agrupadores de Centros de Ingreso. Permite filtrar reportes,
-- recibos y presupuestos por "Agrupador/Centro de Ingreso".
CREATE TABLE IF NOT EXISTS cfg.agrupadores_ingreso (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  orden      INTEGER NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE cfg.centros_ingreso
  ADD COLUMN IF NOT EXISTS id_agrupador_fk INTEGER REFERENCES cfg.agrupadores_ingreso(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_centros_ingreso_agrupador ON cfg.centros_ingreso(id_agrupador_fk);

ALTER TABLE cfg.agrupadores_ingreso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agrupadores_ingreso_all" ON cfg.agrupadores_ingreso;
CREATE POLICY "agrupadores_ingreso_all" ON cfg.agrupadores_ingreso FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- GRANTs explícitos (tablas nuevas requieren GRANT o el insert falla en silencio)
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.agrupadores_ingreso TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.agrupadores_ingreso_id_seq TO authenticated, service_role;
