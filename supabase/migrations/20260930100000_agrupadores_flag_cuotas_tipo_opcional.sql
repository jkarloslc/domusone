-- Regla funcional "centros de cuotas de fraccionamiento" (Cobranza y reporte de
-- Cuotas) pasa de centros_ingreso.tipo = 'cuotas' a un campo explícito del
-- agrupador. El campo tipo se retira de la UI y queda opcional.
ALTER TABLE cfg.agrupadores_ingreso
  ADD COLUMN IF NOT EXISTS es_cuotas_fraccionamiento BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN cfg.agrupadores_ingreso.es_cuotas_fraccionamiento IS
  'true = los centros de este agrupador son cuotas de Mantto. Fraccionamiento: Cobranza solo ve sus recibos y el reporte de Cuotas solo los considera.';

UPDATE cfg.agrupadores_ingreso SET es_cuotas_fraccionamiento = true WHERE id = 3;

ALTER TABLE cfg.centros_ingreso ALTER COLUMN tipo DROP NOT NULL;
ALTER TABLE cfg.centros_ingreso ALTER COLUMN tipo SET DEFAULT 'otro';
