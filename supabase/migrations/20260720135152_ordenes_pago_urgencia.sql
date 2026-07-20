-- Campo Urgencia en Órdenes de Pago (Crítica, Alta, Media, Baja)
ALTER TABLE comp.ordenes_pago ADD COLUMN IF NOT EXISTS urgencia text DEFAULT 'Media';

ALTER TABLE comp.ordenes_pago DROP CONSTRAINT IF EXISTS ordenes_pago_urgencia_check;
ALTER TABLE comp.ordenes_pago ADD CONSTRAINT ordenes_pago_urgencia_check CHECK (
  urgencia IS NULL OR urgencia IN ('Crítica', 'Alta', 'Media', 'Baja')
);
