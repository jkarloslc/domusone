-- ============================================================
-- FIX: Normalizar OCs históricas con id_frente_fk / id_area_fk
--      / id_centro_costo_fk NULL (creadas antes del 2026-04-17)
-- ============================================================
-- INSTRUCCIONES:
--   1. Ejecuta primero los SELECTs de diagnóstico para ver qué hay.
--   2. Ejecuta el UPDATE masivo si todas las OCs pertenecen al mismo
--      frente, o usa el UPDATE individual por OC.
--   3. Repite para ordenes_pago si heredaron los mismos NULLs.
--   4. Verifica con el SELECT de validación al final.
-- ============================================================


-- ============================================================
-- A) DIAGNÓSTICO — ¿Cuántas OCs tienen campos NULL?
-- ============================================================

SELECT
    COUNT(*)                                              AS total_ocs,
    COUNT(*) FILTER (WHERE id_centro_costo_fk IS NULL)   AS sin_cc,
    COUNT(*) FILTER (WHERE id_area_fk         IS NULL)   AS sin_area,
    COUNT(*) FILTER (WHERE id_frente_fk       IS NULL)   AS sin_frente
FROM comp.ordenes_compra;


-- ============================================================
-- B) LISTADO DETALLADO — OCs con al menos un campo NULL
--    (para identificar qué CC/Área/Frente corresponde a cada una)
-- ============================================================

SELECT
    oc.id,
    oc.folio,
    oc.created_at::date                    AS fecha,
    oc.id_centro_costo_fk,
    cc.nombre                              AS centro_costo,
    oc.id_area_fk,
    ar.nombre                              AS area,
    oc.id_frente_fk,
    fr.nombre                              AS frente,
    oc.proveedor_nombre,
    oc.status
FROM comp.ordenes_compra oc
LEFT JOIN cfg.centros_costo cc ON cc.id = oc.id_centro_costo_fk
LEFT JOIN cfg.areas          ar ON ar.id = oc.id_area_fk
LEFT JOIN cfg.frentes        fr ON fr.id = oc.id_frente_fk
WHERE oc.id_centro_costo_fk IS NULL
   OR oc.id_area_fk         IS NULL
   OR oc.id_frente_fk       IS NULL
ORDER BY oc.created_at;


-- ============================================================
-- C) CATÁLOGOS — Ver IDs disponibles para elegir los valores
-- ============================================================

-- Centros de Costo
SELECT id, nombre FROM cfg.centros_costo ORDER BY nombre;

-- Áreas (filtra por CC si ya sabes cuál es)
SELECT a.id, a.nombre, cc.nombre AS centro_costo
FROM cfg.areas a
JOIN cfg.centros_costo cc ON cc.id = a.id_centro_costo_fk
ORDER BY cc.nombre, a.nombre;

-- Frentes (filtra por Área si ya sabes cuál es)
SELECT f.id, f.nombre, a.nombre AS area, cc.nombre AS centro_costo
FROM cfg.frentes f
JOIN cfg.areas          a  ON a.id  = f.id_area_fk
JOIN cfg.centros_costo  cc ON cc.id = a.id_centro_costo_fk
ORDER BY cc.nombre, a.nombre, f.nombre;


-- ============================================================
-- D) UPDATE MASIVO — Si TODAS las OCs sin frente pertenecen
--    al mismo CC / Área / Frente (caso más común en Balvanera)
--
--    ⚠ Reemplaza los valores ?? con los IDs reales del paso C
-- ============================================================

/*
UPDATE comp.ordenes_compra
SET
    id_centro_costo_fk = ??::int,   -- ej. 1  (Administración)
    id_area_fk         = ??::int,   -- ej. 3  (Operaciones)
    id_frente_fk       = ??::int    -- ej. 5  (General)
WHERE id_frente_fk IS NULL
   OR id_area_fk   IS NULL;
*/


-- ============================================================
-- E) UPDATE INDIVIDUAL — Si cada OC tiene un frente distinto
--    Repite un bloque por cada OC a corregir
-- ============================================================

/*
UPDATE comp.ordenes_compra
SET
    id_centro_costo_fk = ??::int,
    id_area_fk         = ??::int,
    id_frente_fk       = ??::int
WHERE id = ??;     -- id de la OC específica
*/


-- ============================================================
-- F) DIAGNÓSTICO ordenes_pago — heredaron NULL de las OCs?
-- ============================================================

SELECT
    COUNT(*)                                              AS total_ops,
    COUNT(*) FILTER (WHERE id_centro_costo_fk IS NULL)   AS sin_cc,
    COUNT(*) FILTER (WHERE id_area_fk         IS NULL)   AS sin_area,
    COUNT(*) FILTER (WHERE id_frente_fk       IS NULL)   AS sin_frente
FROM comp.ordenes_pago;

-- Detalle OPs con NULL (incluye las que vienen de OC y las directas)
SELECT
    op.id,
    op.folio,
    op.created_at::date          AS fecha,
    op.id_orden_compra_fk,
    op.id_centro_costo_fk,
    cc.nombre                    AS centro_costo,
    op.id_area_fk,
    ar.nombre                    AS area,
    op.id_frente_fk,
    fr.nombre                    AS frente,
    op.concepto,
    op.status
FROM comp.ordenes_pago op
LEFT JOIN cfg.centros_costo cc ON cc.id = op.id_centro_costo_fk
LEFT JOIN cfg.areas          ar ON ar.id = op.id_area_fk
LEFT JOIN cfg.frentes        fr ON fr.id = op.id_frente_fk
WHERE op.id_centro_costo_fk IS NULL
   OR op.id_area_fk         IS NULL
   OR op.id_frente_fk       IS NULL
ORDER BY op.created_at;


-- ============================================================
-- G) UPDATE OPs — Propagar CC/Área/Frente desde su OC origen
--    (para las OPs que tienen id_orden_compra_fk)
-- ============================================================

/*
UPDATE comp.ordenes_pago op
SET
    id_centro_costo_fk = oc.id_centro_costo_fk,
    id_area_fk         = oc.id_area_fk,
    id_frente_fk       = oc.id_frente_fk
FROM comp.ordenes_compra oc
WHERE op.id_orden_compra_fk = oc.id
  AND (
      op.id_centro_costo_fk IS NULL OR
      op.id_area_fk         IS NULL OR
      op.id_frente_fk       IS NULL
  )
  AND oc.id_frente_fk IS NOT NULL;   -- solo si la OC ya fue normalizada
*/


-- ============================================================
-- H) UPDATE OPs directas (sin OC) — igual que paso E pero para op
-- ============================================================

/*
UPDATE comp.ordenes_pago
SET
    id_centro_costo_fk = ??::int,
    id_area_fk         = ??::int,
    id_frente_fk       = ??::int
WHERE id_orden_compra_fk IS NULL
  AND id_frente_fk IS NULL;
*/


-- ============================================================
-- I) VALIDACIÓN FINAL — Debe devolver 0 en sin_frente
-- ============================================================

SELECT 'ordenes_compra' AS tabla,
    COUNT(*) FILTER (WHERE id_frente_fk IS NULL) AS sin_frente
FROM comp.ordenes_compra
UNION ALL
SELECT 'ordenes_pago',
    COUNT(*) FILTER (WHERE id_frente_fk IS NULL)
FROM comp.ordenes_pago;
