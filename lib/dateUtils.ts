/**
 * Utilidades de fecha con zona horaria local correcta.
 *
 * Problema: `new Date().toISOString()` devuelve fecha/hora en UTC.
 * En México (UTC-5 CDT / UTC-6 CST) esto provoca que a partir de las
 * 18-19h el "día UTC" ya sea el siguiente, corrompiendo filtros de rango.
 *
 * Solución:
 *  - `fechaLocal()` usa `toLocaleDateString('en-CA')` que respeta la TZ del navegador.
 *  - `inicioDelDia` / `finDelDia` construyen un `Date` con componentes locales
 *    (el constructor Date(y,m,d,h) trata los valores como hora local)
 *    y lo convierten a ISO UTC para enviarlo a Supabase.
 */

/** Fecha local del navegador como YYYY-MM-DD (usa TZ local, no UTC). */
export const fechaLocal = (): string =>
  new Date().toLocaleDateString('en-CA') // en-CA → YYYY-MM-DD

/** ISO UTC equivalente a las 00:00:00 del día local indicado. */
export const inicioDelDia = (localDate: string): string => {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
}

/** ISO UTC equivalente a las 23:59:59.999 del día local indicado. */
export const finDelDia = (localDate: string): string => {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()
}

/**
 * Convierte un string YYYY-MM-DD o un timestamptz a una fecha local
 * legible en español. Agrega T12:00:00 cuando no tiene hora para evitar
 * que el parser UTC lo desplace un día.
 */
export const fmtFechaLocal = (s: string | null | undefined): string => {
  if (!s) return '—'
  const iso = s.includes('T') ? s : s + 'T12:00:00'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

/** Antigüedad legible ("2 años 3 meses") entre una fecha de ingreso (YYYY-MM-DD) y hoy. */
export const antiguedad = (fechaIngreso: string | null | undefined): string => {
  if (!fechaIngreso) return '—'
  const ingreso = new Date(fechaIngreso + 'T00:00:00')
  const hoy = new Date()
  if (ingreso > hoy) return '—'
  let years  = hoy.getFullYear() - ingreso.getFullYear()
  let months = hoy.getMonth() - ingreso.getMonth()
  if (hoy.getDate() < ingreso.getDate()) months--
  if (months < 0) { years--; months += 12 }
  const partes: string[] = []
  if (years > 0)  partes.push(`${years} año${years !== 1 ? 's' : ''}`)
  partes.push(`${months} mes${months !== 1 ? 'es' : ''}`)
  return partes.join(' ')
}
