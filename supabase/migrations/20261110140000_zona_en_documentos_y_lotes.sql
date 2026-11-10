-- =============================================================
-- Zona guardada en Requisición, OC, OP, líneas de distribución de OP y Lotes
-- Captura CC → Zona → Área: la zona solo aplica si el CC tiene
-- usa_zonas. Nullable: documentos de otros CC la dejan en NULL.
-- (La tabla de zonas sigue llamándose cfg.cuadrantes.)
-- =============================================================

ALTER TABLE comp.requisiciones     ADD COLUMN IF NOT EXISTS id_cuadrante_fk INTEGER REFERENCES cfg.cuadrantes(id);
ALTER TABLE comp.ordenes_compra    ADD COLUMN IF NOT EXISTS id_cuadrante_fk INTEGER REFERENCES cfg.cuadrantes(id);
ALTER TABLE comp.ordenes_pago      ADD COLUMN IF NOT EXISTS id_cuadrante_fk INTEGER REFERENCES cfg.cuadrantes(id);
ALTER TABLE comp.ordenes_pago_det  ADD COLUMN IF NOT EXISTS id_cuadrante_fk INTEGER REFERENCES cfg.cuadrantes(id);

CREATE INDEX IF NOT EXISTS idx_requisiciones_cuadrante    ON comp.requisiciones(id_cuadrante_fk);
CREATE INDEX IF NOT EXISTS idx_ordenes_compra_cuadrante   ON comp.ordenes_compra(id_cuadrante_fk);
CREATE INDEX IF NOT EXISTS idx_ordenes_pago_cuadrante     ON comp.ordenes_pago(id_cuadrante_fk);
CREATE INDEX IF NOT EXISTS idx_ordenes_pago_det_cuadrante ON comp.ordenes_pago_det(id_cuadrante_fk);

-- Backfill: documentos existentes cuya área pertenece a UNA sola zona
-- y cuyo CC usa zonas. Las áreas en varias zonas (ej. Mantto. Agaves)
-- quedan en NULL: no hay forma de saber a cuál corresponde.
WITH area_unica AS (
  SELECT r.id_area, min(r.id_cuadrante) AS id_cuadrante
  FROM cfg.rel_area_cuadrante r
  JOIN cfg.areas a ON a.id = r.id_area
  JOIN cfg.centros_costo cc ON cc.id = a.id_centro_costo_fk AND cc.usa_zonas
  GROUP BY r.id_area
  HAVING count(*) = 1
)
UPDATE comp.requisiciones d SET id_cuadrante_fk = u.id_cuadrante
FROM area_unica u WHERE d.id_area_fk = u.id_area AND d.id_cuadrante_fk IS NULL;

WITH area_unica AS (
  SELECT r.id_area, min(r.id_cuadrante) AS id_cuadrante
  FROM cfg.rel_area_cuadrante r
  JOIN cfg.areas a ON a.id = r.id_area
  JOIN cfg.centros_costo cc ON cc.id = a.id_centro_costo_fk AND cc.usa_zonas
  GROUP BY r.id_area
  HAVING count(*) = 1
)
UPDATE comp.ordenes_compra d SET id_cuadrante_fk = u.id_cuadrante
FROM area_unica u WHERE d.id_area_fk = u.id_area AND d.id_cuadrante_fk IS NULL;

WITH area_unica AS (
  SELECT r.id_area, min(r.id_cuadrante) AS id_cuadrante
  FROM cfg.rel_area_cuadrante r
  JOIN cfg.areas a ON a.id = r.id_area
  JOIN cfg.centros_costo cc ON cc.id = a.id_centro_costo_fk AND cc.usa_zonas
  GROUP BY r.id_area
  HAVING count(*) = 1
)
UPDATE comp.ordenes_pago d SET id_cuadrante_fk = u.id_cuadrante
FROM area_unica u WHERE d.id_area_fk = u.id_area AND d.id_cuadrante_fk IS NULL;

WITH area_unica AS (
  SELECT r.id_area, min(r.id_cuadrante) AS id_cuadrante
  FROM cfg.rel_area_cuadrante r
  JOIN cfg.areas a ON a.id = r.id_area
  JOIN cfg.centros_costo cc ON cc.id = a.id_centro_costo_fk AND cc.usa_zonas
  GROUP BY r.id_area
  HAVING count(*) = 1
)
UPDATE comp.ordenes_pago_det d SET id_cuadrante_fk = u.id_cuadrante
FROM area_unica u WHERE d.id_area_fk = u.id_area AND d.id_cuadrante_fk IS NULL;

-- =============================================================
-- Lotes con zona propia
-- Una sección puede repartirse entre 2+ zonas (ej. Fairway), así que
-- la zona del lote no siempre se deduce de su sección:
--   - sección en UNA zona  → el lote toma esa zona (backfill abajo)
--   - sección en VARIAS    → se asigna por lote (Catálogos › Zonas › Lotes)
-- =============================================================
ALTER TABLE cat.lotes ADD COLUMN IF NOT EXISTS id_cuadrante_fk INTEGER REFERENCES cfg.cuadrantes(id);
CREATE INDEX IF NOT EXISTS idx_lotes_cuadrante ON cat.lotes(id_cuadrante_fk);

-- Backfill sin tocar updated_at
ALTER TABLE cat.lotes DISABLE TRIGGER trg_updated_at;
WITH secc_unica AS (
  SELECT id_seccion, min(id_cuadrante) AS id_cuadrante
  FROM cfg.rel_seccion_cuadrante
  GROUP BY id_seccion
  HAVING count(*) = 1
)
UPDATE cat.lotes l SET id_cuadrante_fk = u.id_cuadrante
FROM secc_unica u WHERE l.id_seccion_fk = u.id_seccion AND l.id_cuadrante_fk IS NULL;
ALTER TABLE cat.lotes ENABLE TRIGGER trg_updated_at;
