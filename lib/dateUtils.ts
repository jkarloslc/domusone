/**
 * Utilidades de fecha con zona horaria fija: América/Ciudad de México (UTC-6),
 * la sede real de la operación (Balvanera, Querétaro, misma zona horaria).
 *
 * Problema histórico: `new Date().toISOString()` devuelve fecha/hora en UTC,
 * lo que después de las 18-19h locales ya cae en el "día UTC" siguiente,
 * corrompiendo filtros de rango ("hoy").
 *
 * Un primer intento resolvía esto apoyándose en la zona horaria del NAVEGADOR
 * (`toLocaleDateString('en-CA')` sin `timeZone`), pero eso desfasa resultados
 * si el equipo/navegador donde corre la app no tiene su reloj configurado a
 * Ciudad de México (detectado 2026-07-24 en la validación de folio POS de
 * Salidas al Campo). Ahora todo se calcula explícitamente contra
 * 'America/Mexico_City', sin importar la configuración del dispositivo.
 * México eliminó el horario de verano en el centro del país desde 2022,
 * así que esta zona es UTC-6 fijo todo el año (sin DST que calcular).
 */

const TZ_MX = 'America/Mexico_City'
const OFFSET_MX_MIN = 6 * 60 // UTC-6 fijo (sin horario de verano desde 2022)

/** Fecha en Ciudad de México como YYYY-MM-DD (fija, no depende de la TZ del dispositivo). */
export const fechaLocal = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: TZ_MX }) // en-CA → YYYY-MM-DD

/** ISO UTC equivalente a las 00:00:00 del día indicado, hora Ciudad de México. */
export const inicioDelDia = (localDate: string): string => {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) + OFFSET_MX_MIN * 60000).toISOString()
}

/** ISO UTC equivalente a las 23:59:59.999 del día indicado, hora Ciudad de México. */
export const finDelDia = (localDate: string): string => {
  const [y, m, d] = localDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) + OFFSET_MX_MIN * 60000).toISOString()
}

/**
 * Convierte un string YYYY-MM-DD o un timestamptz a una fecha legible en
 * español, en la zona horaria de Ciudad de México (fija, no la del dispositivo).
 */
export const fmtFechaLocal = (s: string | null | undefined): string => {
  if (!s) return '—'
  const iso = s.includes('T') ? s : s + 'T12:00:00'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ_MX,
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
