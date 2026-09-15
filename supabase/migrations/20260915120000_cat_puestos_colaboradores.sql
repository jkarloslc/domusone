-- Catálogo de Puestos de Colaboradores — reemplaza la lista hardcodeada
-- PUESTOS_COLABORADOR de ColaboradoresPanel.tsx por una tabla real, para
-- poder administrarla desde /catalogos sin tocar código.
--
-- cfg.colaboradores.id_puesto_fk es ahora la fuente de verdad al capturar/
-- editar un colaborador. La columna cfg.colaboradores.puesto (texto) se
-- conserva sin cambios — se sigue escribiendo en cada guardado desde el
-- nombre del puesto elegido — porque ~10 pantallas ya la leen tal cual
-- (Rol de Pagos, Vigilancia Extras, ColaboradorPicker, Reportes, CAPEX,
-- Catálogos) y no es necesario tocarlas.

CREATE TABLE IF NOT EXISTS cfg.cat_puestos_colaboradores (
  id         SERIAL PRIMARY KEY,
  puesto     TEXT NOT NULL UNIQUE,
  orden      INTEGER,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semilla: los 18 puestos que vivían en el array PUESTOS_COLABORADOR
INSERT INTO cfg.cat_puestos_colaboradores (puesto, orden) VALUES
  ('Administrador de Fraccionamiento',   1),
  ('Auxiliar de Motor Lobby',            2),
  ('Auxiliar de Operaciones',            3),
  ('Ayudante General',                   4),
  ('Caja de Mantto Residencial',         5),
  ('Cajera Recepcionista',               6),
  ('Coordinador de Servicios Generales', 7),
  ('Electricista',                       8),
  ('Encargado',                          9),
  ('Encargado de Taller',               10),
  ('Mantenimiento Tee De Practica',     11),
  ('Operador',                          12),
  ('Operador Especializado',            13),
  ('Profesional de Golf',               14),
  ('Servicios Generales',               15),
  ('Starter',                           16),
  ('Superintendente',                   17),
  ('Supervisor',                        18),
  ('Vigilancia',                        19)
ON CONFLICT (puesto) DO NOTHING;

ALTER TABLE cfg.colaboradores
  ADD COLUMN IF NOT EXISTS id_puesto_fk INTEGER REFERENCES cfg.cat_puestos_colaboradores(id);

CREATE INDEX IF NOT EXISTS idx_colaboradores_puesto_fk ON cfg.colaboradores(id_puesto_fk);

-- Backfill: liga cada colaborador existente por coincidencia exacta de texto
UPDATE cfg.colaboradores c
SET id_puesto_fk = p.id
FROM cfg.cat_puestos_colaboradores p
WHERE c.puesto = p.puesto AND c.id_puesto_fk IS NULL;

-- RLS
ALTER TABLE cfg.cat_puestos_colaboradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_puestos_colaboradores_all" ON cfg.cat_puestos_colaboradores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grants (tabla nueva: requiere GRANT explícito o el insert falla en silencio)
GRANT SELECT, INSERT, UPDATE, DELETE ON cfg.cat_puestos_colaboradores TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE cfg.cat_puestos_colaboradores_id_seq TO authenticated, service_role;
