-- Corrige duplicidad latente en ctrl.ppto_partidas: 5 áreas (Mantenimiento,
-- Golf, Hípico, Polo, Eventos) tienen 3 partidas de egreso "Intercompañías
-- BPCC/RBA/OOB [Módulo] [Egreso]" que compartían el MISMO tipo_gasto
-- ('Intercompañías'). El matching de Comparativo/Dashboard/Flujo solo filtra
-- por (id_area_fk, tipo_gasto) — no distingue contraparte — así que cualquier
-- OP con tipo_gasto='Intercompañías' se sumaría triplicada, una vez por cada
-- partida hermana del área.
--
-- Verificado en producción (2026-08-14): 0 OP usan hoy tipo_gasto=
-- 'Intercompañías', así que no hay datos históricos que migrar — el fix es
-- solo renombrar el tipo_gasto de estas 15 partidas a un valor específico por
-- empresa relacionada, para que cada una matchee solo sus propias OP en
-- adelante. El catálogo de Tipo de Gasto (TIPOS_GASTO) en
-- app/compras/ordenes-pago/page.tsx y app/presupuestos/partidas/page.tsx ya
-- se actualizó (commit siguiente) para ofrecer 'Intercompañías BPCC' /
-- 'Intercompañías OOB' / 'Intercompañías RBA' en vez del valor genérico.

BEGIN;

UPDATE ctrl.ppto_partidas SET tipo_gasto = 'Intercompañías BPCC'
WHERE id IN (136, 137, 138, 139, 140);

UPDATE ctrl.ppto_partidas SET tipo_gasto = 'Intercompañías RBA'
WHERE id IN (116, 117, 118, 119, 120);

UPDATE ctrl.ppto_partidas SET tipo_gasto = 'Intercompañías OOB'
WHERE id IN (126, 127, 128, 129, 130);

COMMIT;
