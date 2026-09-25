-- Dos partidas de ingreso con un centro distinto al de su concepto en el
-- catálogo. El Real se calcula por concepto, así que el monto no cambia; lo
-- que fallaba era el filtro por Centro de Ingreso del Comparativo y del Flujo.
-- Cada caso se corrige del lado que los recibos confirman.

-- 1) "Pension" (partida 75, presupuesto de Golf).
--    Catálogo: concepto 18 → centro 12 Pensiones (el único concepto de ese
--    centro). Los recibos de septiembre 2026 ya entran por Pensiones; los
--    anteriores entraban por Golf. Se alinea la partida al catálogo.
UPDATE ctrl.ppto_partidas
   SET id_centro_ingreso_fk = 12
 WHERE id = 75 AND id_concepto_fk = 18 AND id_centro_ingreso_fk = 1;

-- 2) "Renta de Salon" (partida 92, presupuesto de Eventos).
--    Aquí el que está mal es el catálogo: el concepto 34 "Renta Salon" estaba
--    en el centro 4 Hípico, pero sus 8 recibos de 2026 ($470k) entran todos
--    por el centro 9 Eventos, y Eventos no tenía ningún concepto propio.
--    La partida (centro 9) se queda como está.
UPDATE cfg.conceptos_ingreso
   SET id_centro_ingreso_fk = 9
 WHERE id = 34 AND id_centro_ingreso_fk = 4;
