-- Detalle dinámico de formas de pago por recibo de ingreso
CREATE TABLE IF NOT EXISTS ctrl.recibos_ingreso_formas_pago (
  id                serial PRIMARY KEY,
  id_recibo_fk      int  NOT NULL REFERENCES ctrl.recibos_ingreso(id) ON DELETE CASCADE,
  id_forma_pago_fk  int  NOT NULL REFERENCES cfg.formas_pago(id),
  nombre_forma_pago text NOT NULL,
  monto             numeric(14,2) NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recibos_ing_formas_recibo
  ON ctrl.recibos_ingreso_formas_pago (id_recibo_fk);

ALTER TABLE ctrl.recibos_ingreso_formas_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_recibos_ing_formas_pago"
  ON ctrl.recibos_ingreso_formas_pago FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON ctrl.recibos_ingreso_formas_pago TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ctrl.recibos_ingreso_formas_pago_id_seq
  TO authenticated, service_role;

-- Semilla: asegurar que existan las formas de pago básicas en cfg.formas_pago
INSERT INTO cfg.formas_pago (nombre, activo)
SELECT nombre, true
FROM (VALUES
  ('Efectivo'),
  ('Transferencia'),
  ('Tarjeta Débito'),
  ('Tarjeta Crédito'),
  ('Cheque'),
  ('Depósito Ventanilla')
) AS t(nombre)
WHERE NOT EXISTS (
  SELECT 1 FROM cfg.formas_pago WHERE lower(nombre) = lower(t.nombre)
);
