-- Permite seleccionar ganadores por ítem en RFQ (puede haber ganadores de distintos proveedores)
ALTER TABLE comp.rfq_cotizaciones_det
  ADD COLUMN IF NOT EXISTS ganador boolean NOT NULL DEFAULT false;

GRANT UPDATE (ganador) ON comp.rfq_cotizaciones_det TO authenticated;
