-- ============================================================
-- POS Golf: mapeo explícito Centro de Venta -> Centro de Ingreso
-- Fecha: 2026-05-01
-- ============================================================

CREATE TABLE IF NOT EXISTS golf.pos_centros_ingreso_map (
  id                   SERIAL PRIMARY KEY,
  id_centro_venta_fk   INTEGER NOT NULL REFERENCES golf.cat_centros_venta(id) ON DELETE CASCADE,
  id_centro_ingreso_fk INTEGER NOT NULL REFERENCES cfg.centros_ingreso(id),
  activo               BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id_centro_venta_fk)
);

CREATE INDEX IF NOT EXISTS idx_pos_centros_ingreso_map_centro_ing
  ON golf.pos_centros_ingreso_map(id_centro_ingreso_fk);

-- Semilla inicial: alinear por ID (regla solicitada: id PV = id centro ingreso)
INSERT INTO golf.pos_centros_ingreso_map (id_centro_venta_fk, id_centro_ingreso_fk, activo)
SELECT cv.id, ci.id, true
FROM golf.cat_centros_venta cv
JOIN cfg.centros_ingreso ci ON ci.id = cv.id
ON CONFLICT (id_centro_venta_fk)
DO UPDATE SET
  id_centro_ingreso_fk = EXCLUDED.id_centro_ingreso_fk,
  activo = true,
  updated_at = NOW();

ALTER TABLE golf.pos_centros_ingreso_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_all_pos_centros_ingreso_map ON golf.pos_centros_ingreso_map;
CREATE POLICY auth_all_pos_centros_ingreso_map
  ON golf.pos_centros_ingreso_map FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT ALL ON golf.pos_centros_ingreso_map TO authenticated;
GRANT ALL ON golf.pos_centros_ingreso_map TO anon;
GRANT USAGE, SELECT ON SEQUENCE golf.pos_centros_ingreso_map_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.pos_centros_ingreso_map_id_seq TO anon;
