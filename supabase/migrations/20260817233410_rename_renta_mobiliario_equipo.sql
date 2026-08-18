-- Renombra el tipo de gasto 'Renta de Mobiliario' a 'Renta de Mobiliario y
-- Equipo'. Actualiza tanto las OP ya capturadas como el catálogo de
-- partidas de Presupuestos para que sigan casando por tipo_gasto tras el
-- rename.
BEGIN;

UPDATE comp.ordenes_pago
SET tipo_gasto = 'Renta de Mobiliario y Equipo'
WHERE tipo_gasto = 'Renta de Mobiliario';

UPDATE ctrl.ppto_partidas
SET tipo_gasto = 'Renta de Mobiliario y Equipo',
    nombre = REPLACE(nombre, 'Renta de Mobiliario [', 'Renta de Mobiliario y Equipo [')
WHERE tipo_gasto = 'Renta de Mobiliario';

COMMIT;
