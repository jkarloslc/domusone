// Helpers puros del módulo Flujo de Efectivo (Tesorería): lectura de estados de
// cuenta (CSV/Excel con layout), clasificación por reglas y fechas/meses.

export type Concepto = {
  id: number; id_padre_fk: number | null; nombre: string
  es_ingreso: boolean; es_egreso: boolean; orden: number; activo: boolean
}
export type Regla = {
  id: number; nombre: string; patron: string; tipo_mov: 'Cargo' | 'Abono' | null
  id_cuenta_fk: number | null; monto_min: number | null; monto_max: number | null
  id_concepto_fk: number; prioridad: number; activo: boolean
}
export type Layout = {
  id: number; nombre: string; id_cuenta_fk: number | null; fila_inicio: number
  col_fecha: number; col_descripcion: number; col_referencia: number | null
  col_cargo: number | null; col_abono: number | null; col_monto: number | null; col_saldo: number | null
  formato_fecha: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'; activo: boolean
}
export type MovParseado = {
  fecha: string; descripcion: string; referencia: string | null
  cargo: number; abono: number; saldo: number | null
}

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const mxn = (n: number) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export const mesISO = (anio: number, mes1a12: number) => `${anio}-${String(mes1a12).padStart(2, '0')}-01`

/** Lista de primeros-de-mes ISO entre dos primeros-de-mes (inclusive). */
export function mesesEntre(ini: string, fin: string): string[] {
  const out: string[] = []
  let y = Number(ini.slice(0, 4)), m = Number(ini.slice(5, 7))
  const yf = Number(fin.slice(0, 4)), mf = Number(fin.slice(5, 7))
  while (y < yf || (y === yf && m <= mf)) {
    out.push(mesISO(y, m))
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

export const etiquetaMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`

export function normalizar(s: string): string {
  return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── Lectura de celdas ─────────────────────────────────────────
export function aNumero(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  let s = String(v).trim()
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s)
  s = s.replace(/[^0-9.,]/g, '')
  // 1.234,56 (coma decimal) vs 1,234.56
  if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return neg ? -Math.abs(n) : n
}

export function aFechaISO(v: any, formato: Layout['formato_fecha']): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    // Excel entrega medianoche local; +12h evita saltos de día por zona horaria
    return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10)
  }
  if (typeof v === 'number') {
    // serial de Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  let y: number, mo: number, d: number
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3] }
  else {
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)
    if (!m) return null
    const a = +m[1], b = +m[2]
    y = +m[3]; if (y < 100) y += 2000
    if (formato === 'MM/DD/YYYY') { mo = a; d = b } else { d = a; mo = b }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Convierte filas crudas (matriz) a movimientos según el layout. */
export function parsearFilas(filas: any[][], layout: Layout): { movs: MovParseado[]; omitidas: number } {
  const movs: MovParseado[] = []
  let omitidas = 0
  const celda = (f: any[], col: number | null) => (col ? f[col - 1] : undefined)
  for (let i = Math.max(layout.fila_inicio - 1, 0); i < filas.length; i++) {
    const f = filas[i] ?? []
    if (f.every(c => c === null || c === undefined || String(c).trim() === '')) continue
    const fecha = aFechaISO(celda(f, layout.col_fecha), layout.formato_fecha)
    const descripcion = String(celda(f, layout.col_descripcion) ?? '').trim()
    let cargo = 0, abono = 0
    if (layout.col_cargo || layout.col_abono) {
      cargo = Math.abs(aNumero(celda(f, layout.col_cargo)))
      abono = Math.abs(aNumero(celda(f, layout.col_abono)))
    } else {
      const m = aNumero(celda(f, layout.col_monto))
      if (m < 0) cargo = -m; else abono = m
    }
    if (!fecha || !descripcion || (cargo === 0 && abono === 0)) { omitidas++; continue }
    const ref = celda(f, layout.col_referencia)
    const saldoRaw = celda(f, layout.col_saldo)
    movs.push({
      fecha, descripcion,
      referencia: ref !== undefined && String(ref).trim() !== '' ? String(ref).trim() : null,
      cargo, abono,
      saldo: saldoRaw !== undefined && String(saldoRaw).trim() !== '' ? aNumero(saldoRaw) : null,
    })
  }
  return { movs, omitidas }
}

/** Huella anti-duplicados; filas idénticas en el mismo archivo reciben consecutivo distinto. */
export function huellas(idCuenta: number, movs: MovParseado[]): string[] {
  const vistos = new Map<string, number>()
  return movs.map(m => {
    const base = `${idCuenta}|${m.fecha}|${normalizar(m.descripcion)}|${m.cargo.toFixed(2)}|${m.abono.toFixed(2)}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return `${base}|${n}`
  })
}

/** Primera regla activa (por prioridad) que aplica al movimiento. */
export function clasificar(
  mov: { id_cuenta_fk: number; descripcion: string; cargo: number; abono: number },
  reglas: Regla[],
): Regla | null {
  const desc = normalizar(mov.descripcion)
  const monto = mov.cargo > 0 ? mov.cargo : mov.abono
  const tipo = mov.cargo > 0 ? 'Cargo' : 'Abono'
  for (const r of reglas) {
    if (!r.activo) continue
    if (r.tipo_mov && r.tipo_mov !== tipo) continue
    if (r.id_cuenta_fk && r.id_cuenta_fk !== mov.id_cuenta_fk) continue
    if (r.monto_min !== null && monto < Number(r.monto_min)) continue
    if (r.monto_max !== null && monto > Number(r.monto_max)) continue
    if (!desc.includes(normalizar(r.patron))) continue
    return r
  }
  return null
}

/** Nombre con ruta del árbol ("Operativos › Impuestos"). */
export function rutaConcepto(id: number | null, porId: Map<number, Concepto>): string {
  const partes: string[] = []
  let c = id ? porId.get(id) : undefined
  let guard = 0
  while (c && guard++ < 10) {
    partes.unshift(c.nombre)
    c = c.id_padre_fk ? porId.get(c.id_padre_fk) : undefined
  }
  return partes.join(' › ')
}

/** Conceptos en orden de árbol con su nivel de sangría. */
export function aplanarArbol(conceptos: Concepto[]): (Concepto & { nivel: number })[] {
  const hijos = new Map<number | null, Concepto[]>()
  conceptos.forEach(c => {
    const k = c.id_padre_fk ?? null
    hijos.set(k, [...(hijos.get(k) ?? []), c])
  })
  const out: (Concepto & { nivel: number })[] = []
  const rec = (padre: number | null, nivel: number) => {
    ;(hijos.get(padre) ?? []).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .forEach(c => { out.push({ ...c, nivel }); rec(c.id, nivel + 1) })
  }
  rec(null, 0)
  return out
}
