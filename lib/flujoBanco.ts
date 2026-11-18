// Estados de cuenta bancarios (Tesorería › Flujo de Caja): lectura de Excel/CSV
// con layout, huella anti-duplicados y clasificación por reglas.
// Tablas: comp.flujo_mov_banco, flujo_cargas, flujo_reglas, flujo_layouts,
// flujo_conceptos (migraciones 20261030120000 y 20261118120000).

export type Cuenta = {
  id: number; banco: string; numero_cuenta: string | null; alias: string | null
  id_centro_costo_fk: number | null; activo: boolean
}
export type Concepto = {
  id: number; id_padre_fk: number | null; nombre: string; es_ingreso: boolean; es_egreso: boolean
  orden: number; activo: boolean; excluir_consolidado: boolean
}
export type Regla = {
  id: number; nombre: string; patron: string; tipo_mov: 'Cargo' | 'Abono' | null
  id_cuenta_fk: number | null; monto_min: number | null; monto_max: number | null
  id_concepto_fk: number | null; id_centro_costo_fk: number | null; id_tipo_gasto_fk: number | null
  prioridad: number; activo: boolean; nota: string | null
}
export type Layout = {
  id: number; nombre: string; banco: string | null; hoja: string | null; id_cuenta_fk: number | null
  fila_inicio: number; col_fecha: number; col_descripcion: number; col_referencia: number | null
  col_cargo: number | null; col_abono: number | null; col_monto: number | null; col_saldo: number | null
  formato_fecha: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'; activo: boolean
}
export type MovParseado = {
  fecha: string; descripcion: string; referencia: string | null
  cargo: number; abono: number; saldo: number | null
}
export type Clasificacion = {
  id_concepto_fk: number | null; id_regla_fk: number | null; clasificado_por: 'regla' | null
  id_centro_costo_fk: number | null; origen_segmento: 'cuenta' | 'regla' | null
  id_tipo_gasto_fk: number | null; origen_tipo_gasto: 'regla' | null
}
export type OrigenCampo = 'cuenta' | 'regla' | 'manual' | null

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export const mxn = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const nombreCuenta = (c: Pick<Cuenta, 'banco' | 'alias' | 'numero_cuenta'> | undefined | null) =>
  !c ? '—' : (c.alias ?? [c.banco, c.numero_cuenta].filter(Boolean).join(' · '))

/** Minúsculas, sin acentos ni signos; los caracteres raros que dejan algunos bancos (¢) se descartan. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// ── Lectura de celdas ─────────────────────────────────────────
export function aNumero(v: unknown): number {
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

const MES_TXT: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
}

export function aFechaISO(v: unknown, formato: Layout['formato_fecha']): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    // Excel entrega medianoche local; +12h evita saltos de día por zona horaria
    return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10)
  }
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null                         // no es serial de Excel
    const d = new Date(Math.round((v - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let y: number, mo: number, d: number
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3] }
  else if ((m = s.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3})[A-Za-z]*[\/\-. ](\d{2,4})/))) {
    // 01-ABR-2026, 01/Abr/26
    d = +m[1]; mo = MES_TXT[m[2].toLowerCase()] ?? 0; y = +m[3]; if (y < 100) y += 2000
  } else {
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
export function parsearFilas(filas: unknown[][], layout: Layout): { movs: MovParseado[]; omitidas: number } {
  const movs: MovParseado[] = []
  let omitidas = 0
  const celda = (f: unknown[], col: number | null) => (col ? f[col - 1] : undefined)
  const vacia = (c: unknown) => c === null || c === undefined || String(c).trim() === ''
  for (let i = Math.max(layout.fila_inicio - 1, 0); i < filas.length; i++) {
    const f = filas[i] ?? []
    if (f.every(vacia)) continue
    const fecha = aFechaISO(celda(f, layout.col_fecha), layout.formato_fecha)
    const descripcion = String(celda(f, layout.col_descripcion) ?? '').replace(/\s+/g, ' ').trim()
    let cargo = 0, abono = 0
    if (layout.col_cargo || layout.col_abono) {
      cargo = Math.abs(aNumero(celda(f, layout.col_cargo)))
      abono = Math.abs(aNumero(celda(f, layout.col_abono)))
    } else {
      const n = aNumero(celda(f, layout.col_monto))
      if (n < 0) cargo = -n; else abono = n
    }
    if (!fecha || !descripcion || (cargo === 0 && abono === 0)) { omitidas++; continue }
    const ref = celda(f, layout.col_referencia)
    const saldoRaw = celda(f, layout.col_saldo)
    movs.push({
      fecha, descripcion,
      referencia: !vacia(ref) ? String(ref).trim() : null,
      cargo: Math.round(cargo * 100) / 100, abono: Math.round(abono * 100) / 100,
      saldo: !vacia(saldoRaw) ? aNumero(saldoRaw) : null,
    })
  }
  return { movs, omitidas }
}

/**
 * Huella anti-duplicados: cuenta|fecha|descripción|cargo|abono|saldo|ocurrencia.
 * Filas idénticas del mismo archivo (dos comisiones iguales el mismo día) reciben
 * consecutivo distinto; al volver a subir el mismo periodo salen las mismas huellas.
 */
export function huellas(idCuenta: number, movs: MovParseado[]): string[] {
  const vistos = new Map<string, number>()
  return movs.map(m => {
    const base = [idCuenta, m.fecha, normalizar(m.descripcion), m.cargo.toFixed(2), m.abono.toFixed(2),
      m.saldo == null ? '' : m.saldo.toFixed(2)].join('|')
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return `${base}|${n}`
  })
}

/** Cuadre de una carga contra la portada del banco (±$0.05). */
export function cuadra(saldoIni: number | null, saldoFin: number | null, abonos: number, cargos: number): boolean | null {
  if (saldoIni == null || saldoFin == null) return null
  return Math.abs(saldoIni + abonos - cargos - saldoFin) < 0.05
}

/** Saldo antes del primer movimiento y después del último, si el archivo trae columna de saldo. */
export function saldosDelArchivo(movs: MovParseado[]): { inicial: number | null; final: number | null } {
  if (!movs.length) return { inicial: null, final: null }
  // Hay bancos que listan del más reciente al más antiguo: se ordena por fecha conservando el orden del día
  const asc = movs[0].fecha <= movs[movs.length - 1].fecha
  const primero = asc ? movs[0] : movs[movs.length - 1]
  const ultimo = asc ? movs[movs.length - 1] : movs[0]
  return {
    inicial: primero.saldo == null ? null : Math.round((primero.saldo - primero.abono + primero.cargo) * 100) / 100,
    final: ultimo.saldo,
  }
}

function aplica(r: Regla, desc: string, idCuenta: number, tipo: 'Cargo' | 'Abono', monto: number): boolean {
  if (!r.activo) return false
  if (r.tipo_mov && r.tipo_mov !== tipo) return false
  if (r.id_cuenta_fk && r.id_cuenta_fk !== idCuenta) return false
  if (r.monto_min !== null && monto < Number(r.monto_min) - 0.005) return false
  if (r.monto_max !== null && monto > Number(r.monto_max) + 0.005) return false
  const p = normalizar(r.patron)
  return !!p && desc.includes(p)
}

/**
 * Clasifica un movimiento. Las reglas se recorren por prioridad y cada campo
 * (concepto, segmento, tipo de gasto) lo pone la primera regla que lo trae.
 * Sin regla de segmento, el segmento es el de la cuenta.
 */
export function clasificar(
  mov: { id_cuenta_fk: number; descripcion: string; cargo: number; abono: number },
  reglas: Regla[], cuentas: Cuenta[],
): Clasificacion {
  const desc = normalizar(mov.descripcion)
  const tipo = mov.cargo > 0 ? 'Cargo' : 'Abono'
  const monto = mov.cargo > 0 ? mov.cargo : mov.abono
  const out: Clasificacion = {
    id_concepto_fk: null, id_regla_fk: null, clasificado_por: null,
    id_centro_costo_fk: null, origen_segmento: null, id_tipo_gasto_fk: null, origen_tipo_gasto: null,
  }
  const ordenadas = [...reglas].sort((a, b) => a.prioridad - b.prioridad || a.id - b.id)
  for (const r of ordenadas) {
    if (out.id_concepto_fk && out.id_centro_costo_fk && out.id_tipo_gasto_fk) break
    if (!aplica(r, desc, mov.id_cuenta_fk, tipo, monto)) continue
    if (r.id_concepto_fk && !out.id_concepto_fk) { out.id_concepto_fk = r.id_concepto_fk; out.id_regla_fk = r.id; out.clasificado_por = 'regla' }
    if (r.id_centro_costo_fk && !out.id_centro_costo_fk) { out.id_centro_costo_fk = r.id_centro_costo_fk; out.origen_segmento = 'regla' }
    if (r.id_tipo_gasto_fk && !out.id_tipo_gasto_fk) { out.id_tipo_gasto_fk = r.id_tipo_gasto_fk; out.origen_tipo_gasto = 'regla' }
  }
  if (!out.id_centro_costo_fk) {
    const cc = cuentas.find(c => c.id === mov.id_cuenta_fk)?.id_centro_costo_fk ?? null
    if (cc) { out.id_centro_costo_fk = cc; out.origen_segmento = 'cuenta' }
  }
  return out
}

/** Cuántos movimientos tocaría una regla (para la vista previa al crearla). */
export function coincideRegla(r: Regla, mov: { id_cuenta_fk: number; descripcion: string; cargo: number; abono: number }): boolean {
  const tipo = mov.cargo > 0 ? 'Cargo' : 'Abono'
  return aplica(r, normalizar(mov.descripcion), mov.id_cuenta_fk, tipo, mov.cargo > 0 ? mov.cargo : mov.abono)
}

/** Conceptos en orden de árbol: grupo › categoría. */
export function arbolConceptos(conceptos: Concepto[]): { grupo: Concepto; hijos: Concepto[] }[] {
  const raices = conceptos.filter(c => !c.id_padre_fk).sort((a, b) => a.orden - b.orden)
  return raices.map(g => ({
    grupo: g,
    hijos: conceptos.filter(c => c.id_padre_fk === g.id).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)),
  }))
}

export function rutaConcepto(id: number | null, conceptos: Concepto[]): string {
  if (!id) return ''
  const c = conceptos.find(x => x.id === id)
  if (!c) return ''
  const p = c.id_padre_fk ? conceptos.find(x => x.id === c.id_padre_fk) : null
  return p ? `${p.nombre} › ${c.nombre}` : c.nombre
}

/** Nombre de banco comparable: «BanBajío», «Bajio» → bajio; «Scotia Bank», «Scotiabank» → scotia. */
export function claveBanco(s: string | null | undefined): string {
  return normalizar(s ?? '').replace(/\s+/g, '').replace(/bank|banco/g, '').replace(/^ban(?=b)/, '')
}

/**
 * Cuenta a la que pertenece un archivo: números de 7+ dígitos del nombre del
 * archivo y, si no basta, del encabezado (primeras 8 filas; BanBajío pone
 * «Número cliente»), comparados contra el número de cuenta. Solo devuelve
 * algo si hay una sola coincidencia.
 */
export function cuentaDelArchivo(nombre: string, filas: unknown[][], cuentas: Cuenta[]): Cuenta | null {
  const buscar = (textos: string[]) => {
    const numeros = Array.from(new Set(textos.flatMap(t => t.match(/\d{7,}/g) ?? [])))
    const hallaz = cuentas.filter(c => {
      const nc = (c.numero_cuenta ?? '').replace(/\D/g, '')
      return nc.length >= 7 && numeros.some(n => nc.includes(n) || n.includes(nc))
    })
    return hallaz.length === 1 ? hallaz[0] : null
  }
  return buscar([nombre]) ?? buscar(filas.slice(0, 8).flat().map(c => (c == null ? '' : String(c))))
}
