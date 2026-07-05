-- Permite volver a facturar una venta después de cancelar su CFDI:
-- golf.ctrl_ventas_cfdi se creó con UNIQUE(id_venta_fk), lo que forzaba a
-- sobreescribir (upsert) el CFDI cancelado al re-timbrar, perdiendo su historial.
-- Ahora puede haber varias filas por venta (una por cada timbrado/cancelación);
-- la app siempre toma la más reciente por fecha_timbrado.
ALTER TABLE golf.ctrl_ventas_cfdi DROP CONSTRAINT IF EXISTS ctrl_ventas_cfdi_id_venta_fk_key;

CREATE INDEX IF NOT EXISTS idx_ctrl_ventas_cfdi_venta_fecha
  ON golf.ctrl_ventas_cfdi (id_venta_fk, fecha_timbrado);
