-- Separa torneos de Golf de Hípico y Eventos + catálogo de instalaciones con ocupación.
-- 2026-10-12
--  * ctrl.eventos sigue siendo la tabla única (modulo = 'hospitality' | 'hipico' | 'golf').
--    'hospitality' e 'hipico' se tratan como UN solo bucket "Hípico y Eventos" (política vigente).
--  * ctrl.cat_lugares gana modulo/tipo/ubicacion → catálogo de instalaciones.
--  * ctrl.lugares_ocupacion: bloqueos manuales (mantenimiento, clases, entrenamiento, etc.).

-- 1. Catálogo de instalaciones -------------------------------------------------
ALTER TABLE ctrl.cat_lugares
  ADD COLUMN IF NOT EXISTS modulo    TEXT NOT NULL DEFAULT 'hipico',
  ADD COLUMN IF NOT EXISTS tipo      TEXT,
  ADD COLUMN IF NOT EXISTS ubicacion TEXT;

ALTER TABLE ctrl.cat_lugares DROP CONSTRAINT IF EXISTS cat_lugares_modulo_check;
ALTER TABLE ctrl.cat_lugares ADD CONSTRAINT cat_lugares_modulo_check CHECK (modulo IN ('hipico','golf'));

-- "Campo de Golf" pertenece a Golf; el resto (salón, pistas, paddocks) a Hípico y Eventos
UPDATE ctrl.cat_lugares SET modulo = 'golf', tipo = COALESCE(tipo, 'Campo') WHERE nombre = 'Campo de Golf';
UPDATE ctrl.cat_lugares SET tipo = 'Salón'   WHERE modulo = 'hipico' AND tipo IS NULL AND nombre ILIKE 'Sal%';
UPDATE ctrl.cat_lugares SET tipo = 'Pista'   WHERE modulo = 'hipico' AND tipo IS NULL AND nombre ILIKE 'Pista%';
UPDATE ctrl.cat_lugares SET tipo = 'Paddock' WHERE modulo = 'hipico' AND tipo IS NULL AND nombre ILIKE 'Paddock%';

CREATE INDEX IF NOT EXISTS idx_cat_lugares_modulo ON ctrl.cat_lugares(modulo);

-- 2. Eventos de torneo de golf que estaban en hospitality pasan a modulo golf ----
--    (los hijos —ingresos, gastos, OPs, personal— cuelgan de id_evento_fk, no se tocan)
UPDATE ctrl.eventos e
   SET modulo = 'golf'
 WHERE e.modulo = 'hospitality'
   AND e.id_lugar_fk IN (SELECT id FROM ctrl.cat_lugares WHERE nombre = 'Campo de Golf');

-- 3. Ocupaciones manuales de instalaciones ------------------------------------
CREATE TABLE IF NOT EXISTS ctrl.lugares_ocupacion (
  id            BIGSERIAL PRIMARY KEY,
  id_lugar_fk   INTEGER NOT NULL REFERENCES ctrl.cat_lugares(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL DEFAULT 'Bloqueo'
                  CHECK (tipo IN ('Mantenimiento','Clase / Entrenamiento','Uso de arrendatario','Bloqueo','Otro')),
  titulo        TEXT NOT NULL,
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  hora_inicio   TIME,
  hora_fin      TIME,
  responsable   TEXT,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_lugares_ocupacion_lugar ON ctrl.lugares_ocupacion(id_lugar_fk, fecha_inicio, fecha_fin);

ALTER TABLE ctrl.lugares_ocupacion ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.lugares_ocupacion TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ctrl.lugares_ocupacion TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.lugares_ocupacion_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE ctrl.lugares_ocupacion_id_seq TO service_role;

DROP POLICY IF EXISTS "lugares_ocupacion_select" ON ctrl.lugares_ocupacion;
CREATE POLICY "lugares_ocupacion_select" ON ctrl.lugares_ocupacion FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lugares_ocupacion_insert" ON ctrl.lugares_ocupacion;
CREATE POLICY "lugares_ocupacion_insert" ON ctrl.lugares_ocupacion FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "lugares_ocupacion_update" ON ctrl.lugares_ocupacion;
CREATE POLICY "lugares_ocupacion_update" ON ctrl.lugares_ocupacion FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "lugares_ocupacion_delete" ON ctrl.lugares_ocupacion;
CREATE POLICY "lugares_ocupacion_delete" ON ctrl.lugares_ocupacion FOR DELETE TO authenticated USING (true);
