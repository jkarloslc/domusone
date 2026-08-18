-- Renombra el tipo de gasto 'Mantenimiento' a 'Mantenimiento de Instalaciones
-- e Infraestructura' (aclara que no es 'Mantenimiento de Vehículos' ni el
-- módulo/área "Mantenimiento" — esos son valores independientes que no se
-- tocan aquí, solo la columna tipo_gasto).
-- Actualiza tanto las OP ya capturadas como el catálogo de partidas de
-- Presupuestos para que sigan casando por tipo_gasto tras el rename.
BEGIN;

UPDATE comp.ordenes_pago
SET tipo_gasto = 'Mantenimiento de Instalaciones e Infraestructura'
WHERE tipo_gasto = 'Mantenimiento';

UPDATE ctrl.ppto_partidas
SET tipo_gasto = 'Mantenimiento de Instalaciones e Infraestructura',
    nombre = REPLACE(nombre, 'Mantenimiento [', 'Mantenimiento de Instalaciones e Infraestructura [')
WHERE tipo_gasto = 'Mantenimiento';

COMMIT;
