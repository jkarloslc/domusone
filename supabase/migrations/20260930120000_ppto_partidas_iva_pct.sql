-- ctrl.ppto_partidas.iva_pct — tasa de IVA con la que Flujo (con IVA) grava el
-- presupuesto, que se captura sin IVA. Comparativo NO lo usa (va sin IVA).
-- Precarga (2026-09-30): ingresos 16%; egresos 16% salvo los exentos / con
-- deducciones que se dejan al monto pleno.
ALTER TABLE ctrl.ppto_partidas
  ADD COLUMN IF NOT EXISTS iva_pct numeric(5,2) NOT NULL DEFAULT 16;

COMMENT ON COLUMN ctrl.ppto_partidas.iva_pct IS
  'IVA % con el que Flujo grava el presupuesto capturado sin IVA. 16 = grava, 0 = exento.';

UPDATE ctrl.ppto_partidas SET iva_pct = 0
 WHERE tipo = 'egreso' AND (
   tipo_gasto ILIKE 'Nómina%' OR tipo_gasto IN (
     'Electricidad','Combustible','Seguros','Alimento para Caballos','Pipas de Agua',
     'Depósitos en Garantía (Fianzas)','Perimetrales','Fonacot',
     'Impuestos, Derechos y Aprovech. municipales')
 );
