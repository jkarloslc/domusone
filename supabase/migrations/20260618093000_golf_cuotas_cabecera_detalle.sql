-- ══════════════════════════════════════════════════════════════
-- Refactor cuotas de Golf (Membresía/Mensualidad e Inscripción):
-- una sola cabecera por tipo + detalle de precio por categoría de socio,
-- igual que cfg.cuotas_estandar / cuotas_estandar_det en Residencial.
--
-- PENSION_CARRITO no se toca: hoy no tiene registros y se sigue
-- gestionando con id_categoria_fk/monto directos en la cabecera
-- (se carga desde Carritos → Pensión).
-- ══════════════════════════════════════════════════════════════

-- 1. Tabla de precios por categoría
CREATE TABLE IF NOT EXISTS golf.cat_cuotas_config_det (
  id                  bigserial     PRIMARY KEY,
  id_cuota_config_fk  integer       NOT NULL REFERENCES golf.cat_cuotas_config(id) ON DELETE CASCADE,
  id_categoria_fk     integer       NOT NULL REFERENCES golf.cat_categorias_socios(id),
  monto               numeric(10,2) NOT NULL DEFAULT 0,
  activo              boolean       NOT NULL DEFAULT true,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (id_cuota_config_fk, id_categoria_fk)
);

CREATE INDEX IF NOT EXISTS idx_cat_cuotas_config_det_cuota ON golf.cat_cuotas_config_det(id_cuota_config_fk);

GRANT ALL ON golf.cat_cuotas_config_det TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.cat_cuotas_config_det_id_seq TO anon, authenticated;
ALTER TABLE golf.cat_cuotas_config_det ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON golf.cat_cuotas_config_det;
CREATE POLICY "allow_all" ON golf.cat_cuotas_config_det
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. Por cada tipo (MENSUALIDAD, INSCRIPCION), la fila con menor id se
--    vuelve la cabecera canónica; el resto se mueve a líneas de precio.
WITH canonico AS (
  SELECT tipo, MIN(id) AS id_cabecera
  FROM golf.cat_cuotas_config
  WHERE tipo IN ('MENSUALIDAD', 'INSCRIPCION')
  GROUP BY tipo
)
INSERT INTO golf.cat_cuotas_config_det (id_cuota_config_fk, id_categoria_fk, monto, activo)
SELECT k.id_cabecera, c.id_categoria_fk, c.monto, c.activo
FROM golf.cat_cuotas_config c
JOIN canonico k ON k.tipo = c.tipo
WHERE c.tipo IN ('MENSUALIDAD', 'INSCRIPCION') AND c.id_categoria_fk IS NOT NULL
ON CONFLICT (id_cuota_config_fk, id_categoria_fk) DO NOTHING;

-- 3. Reapuntar cxc_golf hacia la cabecera canónica antes de borrar duplicados
WITH canonico AS (
  SELECT tipo, MIN(id) AS id_cabecera
  FROM golf.cat_cuotas_config
  WHERE tipo IN ('MENSUALIDAD', 'INSCRIPCION')
  GROUP BY tipo
),
mapeo AS (
  SELECT c.id AS id_viejo, k.id_cabecera AS id_nuevo
  FROM golf.cat_cuotas_config c
  JOIN canonico k ON k.tipo = c.tipo
  WHERE c.id <> k.id_cabecera
)
UPDATE golf.cxc_golf x
SET id_cuota_config_fk = m.id_nuevo
FROM mapeo m
WHERE x.id_cuota_config_fk = m.id_viejo;

-- 4. Eliminar cabeceras ya colapsadas en el detalle
WITH canonico AS (
  SELECT tipo, MIN(id) AS id_cabecera
  FROM golf.cat_cuotas_config
  WHERE tipo IN ('MENSUALIDAD', 'INSCRIPCION')
  GROUP BY tipo
)
DELETE FROM golf.cat_cuotas_config c
USING canonico k
WHERE c.tipo IN ('MENSUALIDAD', 'INSCRIPCION') AND k.tipo = c.tipo AND c.id <> k.id_cabecera;

-- 5. Renombrar y limpiar las cabeceras canónicas: el precio ahora vive en el detalle
UPDATE golf.cat_cuotas_config
SET nombre = 'Membresía (Mensualidad)', id_categoria_fk = NULL, monto = 0
WHERE tipo = 'MENSUALIDAD';

UPDATE golf.cat_cuotas_config
SET nombre = 'Inscripción', id_categoria_fk = NULL, monto = 0
WHERE tipo = 'INSCRIPCION';
