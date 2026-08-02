// Reparte un cobro (con posible descuento adicional y/o pago parcial) entre las cuotas
// seleccionadas, devolviendo el MONTO NETO ya descontado por cuota — no un monto bruto
// más una línea de "Descuento" aparte. Así el detalle guardado (y por lo tanto ticket
// POS / factura, que se construyen a partir de ese detalle) nunca desglosa el descuento:
// cada línea ya trae su importe final.
//
// poolBruto0 = lo que se estaría cubriendo si no hubiera descuento (monto a cobrar - cargo
//              adicional aplicado + descuento) — determina QUÉ cuotas quedan cubiertas y
//              hasta qué parte de su saldo, igual que el reparto greedy original.
// poolNeto   = lo que realmente se cobra por cuotas (monto a cobrar - cargo adicional
//              aplicado, sin sumar de vuelta el descuento) — es la suma exacta que deben
//              dar las líneas devueltas.
export function prorratearDescuento<T>(
  items: T[],
  getSaldo: (item: T) => number,
  poolBruto0: number,
  poolNeto: number,
): { item: T; montoNeto: number }[] {
  let rem = poolBruto0
  const brutoRows = items
    .map(item => {
      const saldo = getSaldo(item)
      const aplicar = Math.min(rem, saldo)
      rem = parseFloat((rem - aplicar).toFixed(2))
      return { item, brutoAplicado: aplicar }
    })
    .filter(r => r.brutoAplicado > 0)

  const poolBruto = brutoRows.reduce((a, r) => a + r.brutoAplicado, 0)
  const factor = poolBruto > 0 ? poolNeto / poolBruto : 1

  let acumNeto = 0
  return brutoRows
    .map((r, i) => {
      const esUltimo = i === brutoRows.length - 1
      const montoNeto = esUltimo
        ? parseFloat((poolNeto - acumNeto).toFixed(2))
        : parseFloat((r.brutoAplicado * factor).toFixed(2))
      acumNeto = parseFloat((acumNeto + montoNeto).toFixed(2))
      return { item: r.item, montoNeto: Math.max(0, montoNeto) }
    })
    .filter(r => r.montoNeto > 0)
}
