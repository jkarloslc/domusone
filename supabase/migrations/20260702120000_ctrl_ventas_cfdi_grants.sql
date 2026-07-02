-- Fix: golf.ctrl_ventas_cfdi se creó sin GRANT (20260514120000_pos_facturas_cfdi.sql),
-- por lo que anon/authenticated no podían insertar/leer y el upsert fallaba en silencio.
GRANT ALL ON golf.ctrl_ventas_cfdi TO authenticated;
GRANT ALL ON golf.ctrl_ventas_cfdi TO anon;
GRANT ALL ON golf.ctrl_ventas_cfdi TO service_role;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_cfdi_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_cfdi_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE golf.ctrl_ventas_cfdi_id_seq TO service_role;
