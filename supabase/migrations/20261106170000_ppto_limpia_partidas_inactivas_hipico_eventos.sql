-- Limpieza: partidas inactivas sin tipo de gasto, sin montos ni referencias
-- (Caballerizas, Pistas, Paddocks, Operación Hípico, Operación Eventos).
-- Ya ejecutada en producción el 2026-11-06.
DELETE FROM ctrl.ppto_partidas
WHERE id IN (460, 461, 462, 476, 479) AND activo = false;
