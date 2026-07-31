-- Fix de datos: pagos duplicados del 2026-07-31 (bug de grid sin refresh en CXP)
-- OP-2026-0507 (id 524): abono 278 + movimiento 248 duplicados (cuenta 4, $3,406)
-- OP-2026-0173 (id 190): abono 289 + movimiento 259 duplicados (cuenta 1, $3,873)
-- Se conserva el primer abono de cada OP (277 y 287).

-- 1. Eliminar cargos bancarios y abonos duplicados
DELETE FROM comp.movimientos_bancarios WHERE id IN (248, 259);
DELETE FROM comp.cxp_abonos WHERE id IN (278, 289);

-- 2. Devolver lo descontado de más a las cuentas
UPDATE cfg.cuentas_bancarias SET saldo = saldo + 3406, updated_at = now() WHERE id = 4;
UPDATE cfg.cuentas_bancarias SET saldo = saldo + 3873, updated_at = now() WHERE id = 1;

-- 3. Re-encadenar saldo_antes/saldo_despues de los movimientos posteriores a los eliminados
UPDATE comp.movimientos_bancarios
   SET saldo_antes = saldo_antes + 3406, saldo_despues = saldo_despues + 3406
 WHERE id_cuenta_fk = 4 AND id > 248;

UPDATE comp.movimientos_bancarios
   SET saldo_antes = saldo_antes + 3873, saldo_despues = saldo_despues + 3873
 WHERE id_cuenta_fk = 1 AND id > 259;

-- Verificación (debe regresar 1 abono por OP y suma = monto_pagado):
-- SELECT id_op_fk, count(*), sum(monto) FROM comp.cxp_abonos WHERE id_op_fk IN (524, 190) GROUP BY id_op_fk;
