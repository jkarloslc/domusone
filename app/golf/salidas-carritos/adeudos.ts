// Regla del día 10 para adeudos de cuotas de pensión de carrito.
// Hasta el día 10 inclusive, la cuota del mes en curso aún no es exigible
// (solo bloquean meses anteriores); a partir del día 11 la cuota del mes
// en curso también cuenta como adeudo.

export const hoyISO = () => new Date().toISOString().split('T')[0]

export function periodoCorte(): string {
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  if (now.getDate() <= 10) {
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

// Cuotas sin periodo caen al criterio anterior (fecha de vencimiento ya pasada).
export function cuotaExigible(
  c: { periodo: string | null; fecha_vencimiento: string | null },
  corte: string = periodoCorte(),
  hoy: string = hoyISO(),
): boolean {
  return c.periodo
    ? c.periodo <= corte
    : (c.fecha_vencimiento != null && c.fecha_vencimiento < hoy)
}
