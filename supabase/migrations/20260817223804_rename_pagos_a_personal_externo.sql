-- Renombra el tipo de gasto 'Pagos a Personal' a 'Pagos a Personal Externo'
-- (aclara que es personal externo/eventual, no nómina interna).
-- Actualiza tanto las OP ya capturadas como el catálogo de partidas de
-- Presupuestos para que sigan casando por tipo_gasto tras el rename.
BEGIN;

UPDATE comp.ordenes_pago
SET tipo_gasto = 'Pagos a Personal Externo'
WHERE tipo_gasto = 'Pagos a Personal';

UPDATE ctrl.ppto_partidas
SET tipo_gasto = 'Pagos a Personal Externo',
    nombre = REPLACE(nombre, 'Pagos a Personal [', 'Pagos a Personal Externo [')
WHERE tipo_gasto = 'Pagos a Personal';

COMMIT;
