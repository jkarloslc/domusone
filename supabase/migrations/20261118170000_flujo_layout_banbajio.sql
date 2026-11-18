-- Layout del Excel "ConsultaMovimientos" de Conecta BanBajío (mismo formato para todas las cuentas)
-- Encabezado en la fila 10: # | Fecha Movimiento | Hora | Recibo | Descripción | Cargos | Abonos | Saldo
INSERT INTO comp.flujo_layouts (nombre, banco, hoja, id_cuenta_fk, fila_inicio, col_fecha, col_descripcion,
  col_referencia, col_cargo, col_abono, col_monto, col_saldo, formato_fecha, activo)
SELECT 'BanBajío · Consulta de Movimientos', 'BanBajío', 'ConsultaMovimientos', NULL, 11, 2, 5, 4, 6, 7, NULL, 8, 'YYYY-MM-DD', true
WHERE NOT EXISTS (SELECT 1 FROM comp.flujo_layouts WHERE nombre = 'BanBajío · Consulta de Movimientos');

-- Transferencias BanBajío ↔ BanBajío con terceros (las propias ya caen antes por número de cuenta / "traspaso entre cuentas")
INSERT INTO comp.flujo_reglas (nombre, patron, tipo_mov, id_concepto_fk, prioridad, activo)
SELECT v.nombre, v.patron, v.tipo, v.concepto, v.prio, true
FROM (VALUES
  ('Transferencia recibida (BanBajío a BanBajío)', 'entrega de recursos', 'Abono', 31, 905),
  ('Pago por transferencia (BanBajío a BanBajío)', 'retiro de recursos', 'Cargo', 28, 953)
) AS v(nombre, patron, tipo, concepto, prio)
WHERE NOT EXISTS (SELECT 1 FROM comp.flujo_reglas r WHERE r.patron = v.patron AND r.tipo_mov = v.tipo);
