-- Las partidas de ingreso del módulo Eventos (Renta de Salon id 92, Eventos Ecuestres id 100)
-- tenían su presupuesto capturado en el presupuesto de Hípico (id 5), por lo que aparecían
-- en ambos comparativos (en Eventos con presupuesto $0 y el mismo Real).
-- Se mueve su captura al presupuesto de Eventos (id 12). Ya ejecutada el 2026-11-06.
UPDATE ctrl.ppto_presupuesto_det
   SET id_presupuesto_fk = 12
 WHERE id_presupuesto_fk = 5 AND id_partida_fk IN (92, 100);
