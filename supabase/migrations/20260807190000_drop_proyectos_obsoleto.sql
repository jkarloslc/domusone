-- Elimina el módulo Proyectos (obsoleto, reemplazado por Construcciones — ver
-- 20260807180000_construcciones.sql). Confirmado por el usuario: ctrl.proyectos
-- y ctrl.pagos_proyecto no tienen historial que preservar.
-- ctrl.afectaciones_proyectos / ctrl.afectaciones_notas NO se tocan: siguen en
-- uso desde /afectaciones (Servidumbres y Afectaciones).

DROP TABLE IF EXISTS ctrl.pagos_proyecto CASCADE;
DROP TABLE IF EXISTS ctrl.proyectos CASCADE;
