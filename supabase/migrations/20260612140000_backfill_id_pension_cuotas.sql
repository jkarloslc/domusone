-- Backfill de id_pension_fk en cuotas de pensión de carrito.
-- Las cuotas creadas antes de ligar pensión (o desde la página Cuotas) tienen
-- id_pension_fk NULL; el cobro por carrito cae entonces al fallback por socio
-- y las cuotas de dos carritos del mismo socio salen agrupadas.

-- Diagnóstico (ejecutar primero para dimensionar):
-- SELECT COUNT(*) FROM golf.cxc_golf WHERE tipo = 'PENSION_CARRITO' AND id_pension_fk IS NULL;

-- 1) Socios con UNA sola pensión: asignación directa, sin ambigüedad.
UPDATE golf.cxc_golf c
SET id_pension_fk = unica.id_pension
FROM (
  SELECT id_socio_fk, MIN(id) AS id_pension
  FROM golf.ctrl_pensiones
  GROUP BY id_socio_fk
  HAVING COUNT(*) = 1
) unica
WHERE c.tipo = 'PENSION_CARRITO'
  AND c.id_pension_fk IS NULL
  AND c.id_socio_fk = unica.id_socio_fk;

-- 2) Socios con VARIAS pensiones: empatar por la descripción del carrito que
--    PensionModal incluye en el concepto ("Pensión Carrito {marca modelo} — …").
--    Solo se asigna cuando el match es único.
UPDATE golf.cxc_golf c
SET id_pension_fk = m.id_pension
FROM (
  SELECT c2.id AS id_cuota, MIN(p.id) AS id_pension
  FROM golf.cxc_golf c2
  JOIN golf.ctrl_pensiones p  ON p.id_socio_fk = c2.id_socio_fk
  JOIN golf.cat_carritos  car ON car.id = p.id_carrito_fk
  WHERE c2.tipo = 'PENSION_CARRITO'
    AND c2.id_pension_fk IS NULL
    AND TRIM(COALESCE(car.marca, '') || ' ' || COALESCE(car.modelo, '')) <> ''
    AND c2.concepto ILIKE '%' || TRIM(COALESCE(car.marca, '') || ' ' || COALESCE(car.modelo, '')) || '%'
  GROUP BY c2.id
  HAVING COUNT(DISTINCT p.id) = 1
) m
WHERE c.id = m.id_cuota;

-- 3) Verificación: lo que quede aquí requiere asignación manual
--    (socio con varios carritos de la misma marca/modelo, o concepto editado).
-- SELECT c.id, c.id_socio_fk, c.concepto, c.periodo
-- FROM golf.cxc_golf c
-- WHERE c.tipo = 'PENSION_CARRITO' AND c.id_pension_fk IS NULL;
