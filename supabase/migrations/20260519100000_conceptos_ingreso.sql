-- ─────────────────────────────────────────────────────────────────
-- Catálogo de conceptos de cobro (para recibos de ingreso)
-- ─────────────────────────────────────────────────────────────────

-- 1. Catálogo administrable de conceptos
CREATE TABLE IF NOT EXISTS cfg.conceptos_ingreso (
  id                    serial PRIMARY KEY,
  nombre                text NOT NULL,
  clave                 text,
  id_centro_ingreso_fk  int REFERENCES cfg.centros_ingreso(id) ON DELETE SET NULL,
  activo                boolean NOT NULL DEFAULT true,
  orden                 int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Índice para filtrar por centro
CREATE INDEX IF NOT EXISTS idx_conceptos_ingreso_centro
  ON cfg.conceptos_ingreso (id_centro_ingreso_fk, activo);

-- 2. Desglose de conceptos por recibo
CREATE TABLE IF NOT EXISTS ctrl.recibos_ingreso_conceptos (
  id               serial PRIMARY KEY,
  id_recibo_fk     int NOT NULL REFERENCES ctrl.recibos_ingreso(id) ON DELETE CASCADE,
  id_concepto_fk   int NOT NULL REFERENCES cfg.conceptos_ingreso(id),
  nombre_concepto  text NOT NULL,
  monto            numeric(14,2) NOT NULL DEFAULT 0,
  notas            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_conceptos_recibo
  ON ctrl.recibos_ingreso_conceptos (id_recibo_fk);

-- 3. Semilla: conceptos para Cuotas Residencial
--    Busca el centro por código CUO; si no existe, queda id_centro_ingreso_fk = NULL
INSERT INTO cfg.conceptos_ingreso (nombre, clave, id_centro_ingreso_fk, activo, orden)
SELECT nombre, clave,
       (SELECT id FROM cfg.centros_ingreso WHERE codigo = 'CUO' LIMIT 1),
       true, orden
FROM (VALUES
  ('No identificados',                     'no_identificados',   1),
  ('Revisión y autorización de proyectos', 'revision_proyectos', 2),
  ('Deslindes',                            'deslindes',          3),
  ('Tags',                                 'tags',               4),
  ('Intereses',                            'intereses',          5),
  ('Otros servicios',                      'otros_servicios',    6)
) AS t(nombre, clave, orden);
