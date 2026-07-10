/**
 * Lógica de ocurrencias de Programas de Mantenimiento — compartida entre
 * la UI de Ejecución Semanal (app/mantenimiento/gestion/page.tsx) y el
 * cierre automático de periodo (app/api/mantenimiento/cerrar-periodo).
 * Vive aquí para no duplicar el cálculo de frecuencias en dos lugares.
 */

export const FRECUENCIAS = ['Diario', 'Semanal', 'Quincenal', 'Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual']

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function monthDiff(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function getSemana(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

export function estaActivoEnFecha(frecuencia: string, fechaInicio: string | null, fechaFin: string | null, fecha: Date): boolean {
  if (!fechaInicio) return false
  const inicio = startOfDay(new Date(fechaInicio + 'T12:00:00'))
  const fin = fechaFin ? startOfDay(new Date(fechaFin + 'T12:00:00')) : null
  const f = startOfDay(fecha)
  if (f < inicio) return false
  if (fin && f > fin) return false
  const diffDias = Math.round((f.getTime() - inicio.getTime()) / 86400000)
  switch (frecuencia) {
    case 'Diario':     return true
    case 'Semanal':    return diffDias % 7 === 0
    case 'Quincenal':  return diffDias % 14 === 0
    case 'Mensual':    return f.getDate() === inicio.getDate()
    case 'Bimestral':  return f.getDate() === inicio.getDate() && monthDiff(inicio, f) % 2 === 0
    case 'Trimestral': return f.getDate() === inicio.getDate() && monthDiff(inicio, f) % 3 === 0
    case 'Semestral':  return f.getDate() === inicio.getDate() && monthDiff(inicio, f) % 6 === 0
    case 'Anual':      return f.getDate() === inicio.getDate() && f.getMonth() === inicio.getMonth()
    default: return false
  }
}

/** Próximas N ocurrencias a partir de `desde` (uso: previsualización en UI). */
export function proximasFechas(prog: { frecuencia: string; fecha_inicio: string | null; fecha_fin: string | null }, n: number, desde = new Date()): Date[] {
  const out: Date[] = []
  let cursor = startOfDay(desde)
  const fin = prog.fecha_fin ? startOfDay(new Date(prog.fecha_fin + 'T12:00:00')) : null
  let guard = 0
  while (out.length < n && guard < 2000) {
    guard++
    if (fin && cursor > fin) break
    if (estaActivoEnFecha(prog.frecuencia, prog.fecha_inicio, prog.fecha_fin, cursor)) out.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return out
}

/** Todas las ocurrencias entre `desde` y `hasta` (inclusive), acotado — uso: cierre de periodo. */
export function ocurrenciasEnRango(prog: { frecuencia: string; fecha_inicio: string | null; fecha_fin: string | null }, desde: Date, hasta: Date): Date[] {
  const out: Date[] = []
  let cursor = startOfDay(desde)
  const fin = startOfDay(hasta)
  let guard = 0
  while (cursor <= fin && guard < 2000) {
    guard++
    if (estaActivoEnFecha(prog.frecuencia, prog.fecha_inicio, prog.fecha_fin, cursor)) out.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return out
}
