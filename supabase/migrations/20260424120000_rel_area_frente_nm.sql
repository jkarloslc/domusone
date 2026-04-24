-- ═════════════════════════════════════════════════════════════════
-- Migración: Áreas ↔ Frentes — Relación N:M gobernada
-- Fecha: 2026-04-24
-- ═════════════════════════════════════════════════════════════════
-- ANTES:  cfg.frentes.id_area_fk → cfg.areas.id         (1:N estricto)
-- DESPUÉS: cfg.rel_area_frente (id_area, id_frente)     (N:M gobernada)
--          cfg.frentes.id_area_fk queda NULLable como "área principal"
--          (back-compat, se deprecará en una migración futura)
-- ═════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Tabla puente ---------------------------------------------------
CREATE TABLE IF NOT EXISTS cfg.rel_area_frente (
  id         BIGSERIAL PRIMARY KEY,
  id_area    BIGINT NOT NULL REFERENCES cfg.areas(id)   ON DELETE CASCADE,
  id_frente  BIGINT NOT NULL REFERENCES cfg.frentes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rel_area_frente_unq UNIQUE (id_area, id_frente)
);

CREATE INDEX IF NOT EXISTS idx_rel_af_area   ON cfg.rel_area_frente(id_area);
CREATE INDEX IF NOT EXISTS idx_rel_af_frente ON cfg.rel_area_frente(id_frente);

COMMENT ON TABLE  cfg.rel_area_frente             IS 'Relación N:M gobernada entre áreas y frentes. Un frente puede pertenecer a varias áreas y una área puede tener varios frentes.';
COMMENT ON COLUMN cfg.rel_area_frente.id_area     IS 'FK a cfg.areas.id';
COMMENT ON COLUMN cfg.rel_area_frente.id_frente   IS 'FK a cfg.frentes.id';

-- 2) Migración de datos históricos ---------------------------------
-- Cada frente con id_area_fk NOT NULL genera un registro en la tabla puente.
-- ON CONFLICT DO NOTHING protege contra re-ejecución idempotente.
INSERT INTO cfg.rel_area_frente (id_area, id_frente)
SELECT f.id_area_fk, f.id
FROM   cfg.frentes f
WHERE  f.id_area_fk IS NOT NULL
ON CONFLICT (id_area, id_frente) DO NOTHING;

-- 3) Hacer id_area_fk NULLable (back-compat) -----------------------
-- Se mantiene la columna para código legado que aún la lea.
-- Semánticamente pasa a ser "área principal" del frente (opcional).
ALTER TABLE cfg.frentes
  ALTER COLUMN id_area_fk DROP NOT NULL;

COMMENT ON COLUMN cfg.frentes.id_area_fk IS
  'DEPRECADO para uso exclusivo: la relación N:M vive en cfg.rel_area_frente. '
  'Se mantiene NULLable como "área principal" del frente (back-compat).';

-- 4) Grants (si aplica RLS en el proyecto) -------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.rel_area_frente           TO authenticated;
GRANT USAGE, SELECT                  ON SEQUENCE cfg.rel_area_frente_id_seq TO authenticated;

COMMIT;

-- ═════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-MIGRACIÓN
-- ═════════════════════════════════════════════════════════════════
-- SELECT COUNT(*) AS frentes_con_area FROM cfg.frentes WHERE id_area_fk IS NOT NULL;
-- SELECT COUNT(*) AS rel_filas        FROM cfg.rel_area_frente;
-- ▸ Ambos conteos deben coincidir inmediatamente después de ejecutar.
--
-- Ejemplo de consulta de frentes permitidos para un área:
--   SELECT f.* FROM cfg.frentes f
--   JOIN cfg.rel_area_frente r ON r.id_frente = f.id
--   WHERE r.id_area = :id_area AND f.activo = true
--   ORDER BY f.nombre;
