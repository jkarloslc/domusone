-- ============================================================
--  GOLF — Pases: reemplaza catálogo de tipos de pase
-- ============================================================

-- Liberar referencias existentes antes de eliminar el catálogo anterior
UPDATE golf.ctrl_pases
  SET id_config_fk = NULL
  WHERE id_config_fk IN (SELECT id FROM golf.cat_pases_config);

DELETE FROM golf.cat_pases_config;

INSERT INTO golf.cat_pases_config (nombre) VALUES
  ('Pases Pago Cuotas Anual'),
  ('Pase Pago Cuota Mensual'),
  ('Cupones'),
  ('Cortesias');
