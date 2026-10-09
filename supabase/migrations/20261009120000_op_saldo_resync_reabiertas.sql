-- OP reabiertas y editadas conservaban el saldo del pago anulado (la edición
-- de monto no recalculaba saldo) y CXP precarga el pago con (saldo ?? monto).
-- Resincroniza saldo = monto - monto_pagado en OP abiertas sin autorización pendiente.
UPDATE comp.ordenes_pago
SET saldo = GREATEST(monto - COALESCE(monto_pagado, 0), 0)
WHERE status IN ('Pendiente', 'Abonada')
  AND saldo IS NOT NULL
  AND ABS(saldo - GREATEST(monto - COALESCE(monto_pagado, 0), 0)) > 0.01;
