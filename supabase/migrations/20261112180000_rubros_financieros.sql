-- =============================================================
-- Rubros financieros (Fase 2 del Árbol de Comparativo / Flujo)
--
-- Primer nivel del reporte jerárquico. Se asignan en el CATÁLOGO, no por
-- partida, para que toda partida nueva herede su rubro:
--   Egresos  → cfg.tipos_gasto.id_rubro_fk
--   Ingresos → cfg.conceptos_ingreso.id_rubro_fk (override)
--              ?? cfg.centros_ingreso.id_rubro_fk (default del centro;
--                 cubre partidas por sección, p.ej. cuotas de Fraccionamiento)
-- Regla de negocio: un rubro de ingreso no mezcla centros de ingreso
-- (Rentas de Locales ≠ Caballerizas ≠ Renta de Salón).
-- Partidas sin rubro caen al agrupador (ppto_agrupadores) como respaldo.
-- =============================================================

CREATE TABLE IF NOT EXISTS cfg.rubros_financieros (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  orden      INTEGER NOT NULL DEFAULT 0,
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tipo, nombre)
);

ALTER TABLE cfg.tipos_gasto       ADD COLUMN IF NOT EXISTS id_rubro_fk INTEGER REFERENCES cfg.rubros_financieros(id) ON DELETE SET NULL;
ALTER TABLE cfg.conceptos_ingreso ADD COLUMN IF NOT EXISTS id_rubro_fk INTEGER REFERENCES cfg.rubros_financieros(id) ON DELETE SET NULL;
ALTER TABLE cfg.centros_ingreso   ADD COLUMN IF NOT EXISTS id_rubro_fk INTEGER REFERENCES cfg.rubros_financieros(id) ON DELETE SET NULL;

ALTER TABLE cfg.rubros_financieros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rubros_financieros_all" ON cfg.rubros_financieros;
CREATE POLICY "rubros_financieros_all" ON cfg.rubros_financieros FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.rubros_financieros TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.rubros_financieros_id_seq TO authenticated, service_role;

-- ── Semilla de rubros ─────────────────────────────────────────
INSERT INTO cfg.rubros_financieros (nombre, tipo, orden) VALUES
  ('Personal',                         'egreso', 1),
  ('Mantenimiento e Infraestructura',  'egreso', 2),
  ('Servicios Básicos',                'egreso', 3),
  ('Seguridad',                        'egreso', 4),
  ('Combustibles y Flota',             'egreso', 5),
  ('Insumos Operativos',               'egreso', 6),
  ('Arrendamientos',                   'egreso', 7),
  ('Administración y Tecnología',      'egreso', 8),
  ('Comercial y Publicidad',           'egreso', 9),
  ('Impuestos y Derechos',             'egreso', 10),
  ('Inversión (Activo Fijo)',          'egreso', 11),
  ('Financieros',                      'egreso', 12),
  ('Intercompañías',                   'egreso', 13),
  ('Otros Gastos',                     'egreso', 14),
  ('Cuotas de Mantenimiento',          'ingreso', 1),
  ('Servicios y Otros Fraccionamiento','ingreso', 2),
  ('Membresías e Inscripciones',       'ingreso', 3),
  ('Green Fees y Torneos',             'ingreso', 4),
  ('La Práctica',                      'ingreso', 5),
  ('Pensiones de Carritos',            'ingreso', 6),
  ('Carritos',                         'ingreso', 7),
  ('Rentas Locales Comerciales',       'ingreso', 8),
  ('Caballerizas y Eventos Ecuestres', 'ingreso', 9),
  ('Renta de Salón',                   'ingreso', 10),
  ('Polo',                             'ingreso', 11),
  ('Intercompañías',                   'ingreso', 12)
ON CONFLICT (tipo, nombre) DO NOTHING;

-- ── Egresos: rubro por tipo de gasto ──────────────────────────
WITH m(rubro, ids) AS (VALUES
  ('Personal',                        ARRAY[23,24,26,10,16,11,37,28,14,4,66]),
  ('Mantenimiento e Infraestructura', ARRAY[21,54,8,27,62,32,55]),
  ('Servicios Básicos',               ARRAY[9,41,1,46,36,30,52]),
  ('Seguridad',                       ARRAY[34,67,45,49]),
  ('Combustibles y Flota',            ARRAY[6,22,59]),
  ('Insumos Operativos',              ARRAY[50,53,65,51,64,56,44,12]),
  ('Arrendamientos',                  ARRAY[2,31]),
  ('Administración y Tecnología',     ARRAY[20,35,13,3,42,43,58,61,33]),
  ('Comercial y Publicidad',          ARRAY[29,48]),
  ('Impuestos y Derechos',            ARRAY[40,15,38]),
  ('Inversión (Activo Fijo)',         ARRAY[47]),
  ('Financieros',                     ARRAY[5]),
  ('Intercompañías',                  ARRAY[17,18,19]),
  ('Otros Gastos',                    ARRAY[25,57,60,7])
)
UPDATE cfg.tipos_gasto tg SET id_rubro_fk = r.id
FROM m JOIN cfg.rubros_financieros r ON r.nombre = m.rubro AND r.tipo = 'egreso'
WHERE tg.id = ANY(m.ids) AND tg.id_rubro_fk IS NULL;

-- ── Ingresos: rubro por centro (default) ──────────────────────
WITH m(rubro, centro) AS (VALUES
  ('Green Fees y Torneos', 1), ('Cuotas de Mantenimiento', 2), ('Rentas Locales Comerciales', 3),
  ('Caballerizas y Eventos Ecuestres', 4), ('Renta de Salón', 9), ('Polo', 10),
  ('Membresías e Inscripciones', 11), ('Pensiones de Carritos', 12), ('La Práctica', 13), ('Carritos', 14)
)
UPDATE cfg.centros_ingreso ci SET id_rubro_fk = r.id
FROM m JOIN cfg.rubros_financieros r ON r.nombre = m.rubro AND r.tipo = 'ingreso'
WHERE ci.id = m.centro AND ci.id_rubro_fk IS NULL;

-- ── Ingresos: overrides por concepto ──────────────────────────
-- Fraccionamiento: los servicios (deslindes, tags, proyectos, intereses…) no son cuota.
UPDATE cfg.conceptos_ingreso c SET id_rubro_fk = r.id
FROM cfg.rubros_financieros r
WHERE r.nombre = 'Servicios y Otros Fraccionamiento' AND r.tipo = 'ingreso'
  AND c.id_centro_ingreso_fk = 2 AND c.nombre <> 'Cuota de Mantenimiento' AND c.id_rubro_fk IS NULL;

UPDATE cfg.conceptos_ingreso c SET id_rubro_fk = r.id
FROM cfg.rubros_financieros r
WHERE r.nombre = 'Intercompañías' AND r.tipo = 'ingreso'
  AND c.nombre ILIKE 'Intercompañías%' AND c.id_rubro_fk IS NULL;
