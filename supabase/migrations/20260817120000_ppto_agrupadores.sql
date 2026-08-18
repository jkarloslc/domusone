-- Catálogo de Agrupadores de Partidas Presupuestales: permite ver Dashboard,
-- Comparativo y Flujo de Efectivo con una vista sumarizada por grupo (toggle
-- en UI), sin perder el detalle por partida — ambas vistas coexisten.

CREATE TABLE IF NOT EXISTS ctrl.ppto_agrupadores (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  orden      INTEGER NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS id_agrupador_fk INTEGER REFERENCES ctrl.ppto_agrupadores(id);

CREATE INDEX IF NOT EXISTS idx_ppto_partidas_agrupador ON ctrl.ppto_partidas(id_agrupador_fk);

ALTER TABLE ctrl.ppto_agrupadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppto_agrupadores_all" ON ctrl.ppto_agrupadores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── GRANTS explícitos (tablas nuevas requieren GRANT o el insert falla en silencio) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.ppto_agrupadores TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.ppto_agrupadores_id_seq TO authenticated, service_role;
