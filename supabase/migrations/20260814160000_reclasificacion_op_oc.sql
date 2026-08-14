-- Soporte para que superadmin pueda reclasificar CC/Área/Frente (y Tipo de
-- Gasto en OP) de una Orden de Pago u Orden de Compra ya capturada, sin
-- importar su status, sin tocar montos ni pagos. Columnas de auditoría
-- livianas, mismo patrón que autorizado_por/fecha_autorizacion.

ALTER TABLE comp.ordenes_pago   ADD COLUMN IF NOT EXISTS reclasificado_por text;
ALTER TABLE comp.ordenes_pago   ADD COLUMN IF NOT EXISTS fecha_reclasificacion timestamptz;
ALTER TABLE comp.ordenes_compra ADD COLUMN IF NOT EXISTS reclasificado_por text;
ALTER TABLE comp.ordenes_compra ADD COLUMN IF NOT EXISTS fecha_reclasificacion timestamptz;
