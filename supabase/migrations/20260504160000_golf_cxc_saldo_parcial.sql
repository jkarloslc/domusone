-- Cobros parciales: agrega saldo a cxc_golf
ALTER TABLE golf.cxc_golf ADD COLUMN IF NOT EXISTS saldo numeric(12,2);

UPDATE golf.cxc_golf
SET saldo = CASE
  WHEN status IN ('PAGADO','CANCELADO') THEN 0
  ELSE COALESCE(monto_final, monto_original - COALESCE(descuento, 0), 0)
END
WHERE saldo IS NULL;

ALTER TABLE golf.cxc_golf ALTER COLUMN saldo SET NOT NULL;
ALTER TABLE golf.cxc_golf ALTER COLUMN saldo SET DEFAULT 0;

GRANT SELECT, UPDATE ON golf.cxc_golf TO authenticated;
