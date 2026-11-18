/**
 * Flujo de caja por cuenta bancaria a partir de los estados de cuenta cargados
 * (comp.flujo_mov_banco) y de las portadas (comp.flujo_portadas).
 *
 * Saldos: cada movimiento trae el saldo que reporta el banco después de él. El
 * orden dentro del día no es confiable (hay bancos que listan del más reciente
 * al más antiguo y un día puede llegar en dos cargas), así que la apertura y el
 * cierre del día se buscan encadenando: apertura = saldo − abono + cargo de un
 * movimiento, cierre = saldo de otro, y cierre − apertura = neto del día.
 */
import { normalizar, type Concepto, type Cuenta } from '@/lib/flujoBanco'

export type MovFlujo = {
  id: number; id_cuenta_fk: number; fecha: string; descripcion: string
  cargo: number; abono: number; saldo: number | null
  id_concepto_fk: number | null; id_centro_costo_fk: number | null; id_tipo_gasto_fk: number | null
}
export type Portada = {
  id: number; id_cuenta_fk: number; periodo: string
  saldo_inicial: number; depositos: number; retiros: number; saldo_final: number
  sin_movimientos: boolean; notas: string | null
}

export type Grupo = 'operacion' | 'interco' | 'capex' | 'inversion' | 'traspaso'
export type Clase = { grupo: Grupo; categoria: string }

const r2 = (n: number) => Math.round(n * 100) / 100
const casi = (a: number, b: number, tol = 0.015) => Math.abs(a - b) < tol
export const mesDe = (fecha: string) => fecha.slice(0, 7)          // 'YYYY-MM'
export const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const etiquetaMes = (m: string) => `${MESES_CORTO[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

/** Grupo y categoría de cada concepto (el grupo sale del concepto raíz). */
export function clasesDeConceptos(conceptos: Concepto[]): Map<number, Clase> {
  const porId = new Map(conceptos.map(c => [c.id, c]))
  const grupoDe = (raiz: Concepto): Grupo => {
    const n = normalizar(raiz.nombre)
    if (raiz.excluir_consolidado || n.includes('traspaso')) return 'traspaso'
    if (n.includes('capex')) return 'capex'
    if (n.includes('inversion')) return 'inversion'
    if (n.includes('intercompan')) return 'interco'
    return 'operacion'
  }
  const out = new Map<number, Clase>()
  for (const c of conceptos) {
    let raiz = c
    while (raiz.id_padre_fk && porId.get(raiz.id_padre_fk)) raiz = porId.get(raiz.id_padre_fk)!
    out.set(c.id, { grupo: grupoDe(raiz), categoria: c.nombre })
  }
  return out
}
export const SIN_CLASIFICAR = 'Sin clasificar'
export function claseDe(m: MovFlujo, clases: Map<number, Clase>): Clase {
  return (m.id_concepto_fk && clases.get(m.id_concepto_fk)) || { grupo: 'operacion', categoria: SIN_CLASIFICAR }
}
export function contraparteInterco(descripcion: string): string {
  return /organismo operador/i.test(normalizar(descripcion)) ? 'Organismo Operador (OOB)' : 'Residencial Balvanera'
}

// ── Saldos por día y por mes ─────────────────────────────────────────────

export type DiaCuenta = { fecha: string; apertura: number | null; cierre: number | null; abonos: number; cargos: number }

/** Apertura y cierre de cada día de UNA cuenta (movimientos de cualquier orden). */
export function diasDeCuenta(movs: MovFlujo[]): DiaCuenta[] {
  const porDia = new Map<string, MovFlujo[]>()
  for (const m of movs) porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m])
  return Array.from(porDia.keys()).sort().map(fecha => {
    const ms = porDia.get(fecha)!
    const abonos = r2(ms.reduce((s, m) => s + m.abono, 0))
    const cargos = r2(ms.reduce((s, m) => s + m.cargo, 0))
    const neto = abonos - cargos
    const conSaldo = ms.filter(m => m.saldo != null)
    let apertura: number | null = null, cierre: number | null = null
    buscar:
    for (const a of conSaldo) {
      const ap = r2(a.saldo! - a.abono + a.cargo)
      for (const c of conSaldo) {
        if (casi(c.saldo! - ap, neto)) { apertura = ap; cierre = r2(c.saldo!); break buscar }
      }
    }
    // Sin encadenamiento exacto (falta un movimiento del día): el saldo más
    // reciente cargado y la apertura implícita, para no perder el día.
    if (apertura == null && conSaldo.length) {
      const ult = conSaldo.reduce((x, y) => (y.id > x.id ? y : x))
      cierre = r2(ult.saldo!); apertura = r2(cierre - neto)
    }
    return { fecha, apertura, cierre, abonos, cargos }
  })
}

export type MesCuenta = {
  id_cuenta_fk: number; mes: string
  apertura: number | null; abonos: number; cargos: number; cierre: number | null
  movimientos: number
  /** apertura + abonos − cargos = cierre, y cada día abre con el cierre del anterior */
  cuadraInterno: boolean | null
  /** días cuya apertura no coincide con el cierre del día anterior (faltan movimientos) */
  huecos: number
  /** último día con movimientos (para meses en curso) */
  ultimoDia: string | null
  portada: Portada | null
  /** diferencias contra la portada del banco (null si no hay portada) */
  difPortada: { inicial: number; depositos: number; retiros: number; final: number } | null
}

/**
 * Resumen por cuenta y mes. Un mes sin movimientos arrastra el último cierre
 * conocido (apertura = cierre). `meses` son 'YYYY-MM' en orden.
 */
export function resumenMensual(movs: MovFlujo[], portadas: Portada[], cuentas: Cuenta[], meses: string[]): MesCuenta[] {
  const out: MesCuenta[] = []
  for (const cta of cuentas) {
    const propios = movs.filter(m => m.id_cuenta_fk === cta.id)
    const dias = diasDeCuenta(propios)
    const conteo = new Map<string, number>()
    for (const m of propios) conteo.set(mesDe(m.fecha), (conteo.get(mesDe(m.fecha)) ?? 0) + 1)
    let ultimoCierre: number | null = null
    // Cierre previo al primer mes pedido (los movimientos pueden incluir meses anteriores)
    for (const d of dias) if (mesDe(d.fecha) < meses[0] && d.cierre != null) ultimoCierre = d.cierre
    let mesPrevioConDatos = ultimoCierre != null
    for (const mes of meses) {
      const dm = dias.filter(d => mesDe(d.fecha) === mes)
      const portada = portadas.find(p => p.id_cuenta_fk === cta.id && p.periodo.slice(0, 7) === mes) ?? null
      let apertura: number | null, cierre: number | null, huecos = 0
      const abonos = r2(dm.reduce((s, d) => s + d.abonos, 0)), cargos = r2(dm.reduce((s, d) => s + d.cargos, 0))
      if (dm.length) {
        apertura = dm[0].apertura; cierre = dm[dm.length - 1].cierre
        // Un mes anterior sin cargar no se cuenta como hueco de este mes (ese mes ya sale como «–»)
        let prev = mesPrevioConDatos ? ultimoCierre : null
        for (const d of dm) {
          if (prev != null && d.apertura != null && !casi(prev, d.apertura, 0.05)) huecos++
          if (d.cierre != null) prev = d.cierre
        }
        if (cierre != null) ultimoCierre = cierre
      } else if (portada) {
        apertura = Number(portada.saldo_inicial); cierre = Number(portada.saldo_final); ultimoCierre = cierre
      } else {
        apertura = ultimoCierre; cierre = ultimoCierre
      }
      mesPrevioConDatos = dm.length > 0 || portada != null
      const cuadraInterno = !dm.length ? null
        : apertura == null || cierre == null ? false
        : casi(apertura + abonos - cargos, cierre, 0.05) && huecos === 0
      const difPortada = portada && dm.length ? {
        inicial: r2((apertura ?? 0) - Number(portada.saldo_inicial)),
        depositos: r2(abonos - Number(portada.depositos)),
        retiros: r2(cargos - Number(portada.retiros)),
        final: r2((cierre ?? 0) - Number(portada.saldo_final)),
      } : null
      out.push({
        id_cuenta_fk: cta.id, mes, apertura, abonos, cargos, cierre, movimientos: conteo.get(mes) ?? 0,
        cuadraInterno, huecos, ultimoDia: dm.length ? dm[dm.length - 1].fecha : null, portada, difPortada,
      })
    }
  }
  return out
}

export function cuadraPortada(m: MesCuenta): boolean | null {
  if (!m.difPortada) return null
  const d = m.difPortada
  return [d.inicial, d.depositos, d.retiros, d.final].every(x => Math.abs(x) < 0.05)
}

// ── Estado de flujo de efectivo ──────────────────────────────────────────

export type NivelFila = 'saldo' | 'sec' | 'ing' | 'egr' | 'ic' | 'total' | 'neto' | 'otro'
export type FilaEstado = {
  clave: string; etiqueta: string; nivel: NivelFila
  /** mes → monto (null = sin dato) */
  valores: Record<string, number | null>; total: number | null
  /** filas que suman movimientos: clave para el detalle */
  detalle?: boolean
}

type OpcionesEstado = {
  meses: string[]
  /** saldos por mes (null si no aplica: vista por segmento) */
  saldos: Record<string, { apertura: number | null; cierre: number | null }> | null
  ordenCategorias: string[]
  nombreTipoGasto: (id: number) => string | undefined
  /** egresos operativos por tipo de gasto cuando lo tienen (si no, por categoría) */
  porTipoGasto: boolean
}

/** Clave de la fila del estado a la que va un movimiento (para el detalle). */
export function filaDeMov(m: MovFlujo, clases: Map<number, Clase>, o: Pick<OpcionesEstado, 'nombreTipoGasto' | 'porTipoGasto'>): string {
  const c = claseDe(m, clases)
  if (c.grupo === 'operacion') {
    if (m.abono > 0) return 'ing:' + c.categoria
    const tg = o.porTipoGasto && m.id_tipo_gasto_fk ? o.nombreTipoGasto(m.id_tipo_gasto_fk) : undefined
    return 'egr:' + (tg ?? c.categoria)
  }
  if (c.grupo === 'interco') return (m.abono > 0 ? 'ic_rec:' : 'ic_env:') + contraparteInterco(m.descripcion)
  return c.grupo
}

export function estadoFlujo(movs: MovFlujo[], clases: Map<number, Clase>, o: OpcionesEstado): FilaEstado[] {
  const val = new Map<string, Record<string, number>>()
  const add = (k: string, mes: string, x: number) => {
    const v = val.get(k) ?? {}; v[mes] = (v[mes] ?? 0) + x; val.set(k, v)
  }
  const cats = { ing: new Set<string>(), egr: new Set<string>(), tg: new Set<string>() }
  for (const m of movs) {
    const mes = mesDe(m.fecha)
    if (!o.meses.includes(mes)) continue
    const k = filaDeMov(m, clases, o)
    const c = claseDe(m, clases)
    if (c.grupo === 'operacion') {
      if (k.startsWith('ing:')) { cats.ing.add(k.slice(4)); add(k, mes, m.abono); add('total_ing', mes, m.abono) }
      else {
        const nombre = k.slice(4)
        if (nombre !== c.categoria) cats.tg.add(nombre); else cats.egr.add(nombre)
        add(k, mes, m.cargo); add('total_egr', mes, m.cargo)
      }
    } else if (c.grupo === 'interco') {
      add(k, mes, m.abono + m.cargo); add('interco', mes, m.abono - m.cargo)
    } else {
      add(k, mes, m.abono - m.cargo)
    }
  }
  const ordenar = (set: Set<string>) => [
    ...o.ordenCategorias.filter(k => set.has(k)),
    ...Array.from(set).filter(k => !o.ordenCategorias.includes(k)).sort((a, b) => a.localeCompare(b)),
  ]
  const g = (k: string, mes: string) => val.get(k)?.[mes] ?? 0
  const calc: Record<string, (mes: string) => number | null> = {
    neto_op: mes => g('total_ing', mes) - g('total_egr', mes),
    neto_ic: mes => g('total_ing', mes) - g('total_egr', mes) + g('interco', mes),
    flujo_neto: mes => g('total_ing', mes) - g('total_egr', mes) + g('interco', mes) + g('capex', mes) + g('inversion', mes) + g('traspaso', mes),
    saldo_inicial: mes => o.saldos?.[mes]?.apertura ?? null,
    saldo_final: mes => o.saldos?.[mes]?.cierre ?? null,
  }
  const def: [string, string, NivelFila, boolean?][] = [
    ['saldo_inicial', 'Saldo inicial', 'saldo'],
    ['sec_ing', 'Ingresos operativos', 'sec'],
    ...ordenar(cats.ing).map(k => ['ing:' + k, k, 'ing', true] as [string, string, NivelFila, boolean]),
    ['total_ing', 'Total ingresos operativos', 'total'],
    ['sec_egr', 'Egresos operativos', 'sec'],
    ...[...ordenar(cats.egr), ...ordenar(cats.tg).filter(k => !cats.egr.has(k))]
      .map(k => ['egr:' + k, k, 'egr', true] as [string, string, NivelFila, boolean]),
    ['total_egr', 'Total egresos operativos', 'total'],
    ['neto_op', 'Flujo operativo neto', 'neto'],
    ['sec_ic', 'Intercompañía', 'sec'],
    ['ic_rec:Residencial Balvanera', 'Recibido de Residencial Balvanera', 'ic', true],
    ['ic_rec:Organismo Operador (OOB)', 'Recibido de Organismo Operador (OOB)', 'ic', true],
    ['ic_env:Residencial Balvanera', 'Enviado a Residencial Balvanera', 'ic', true],
    ['ic_env:Organismo Operador (OOB)', 'Enviado a Organismo Operador (OOB)', 'ic', true],
    ['interco', 'Intercompañía neto', 'total'],
    ['neto_ic', 'Flujo operativo + intercompañía', 'neto'],
    ['sec_otros', 'Otros movimientos de efectivo', 'sec'],
    ['capex', 'CAPEX: obra y equipo (neto)', 'otro', true],
    ['inversion', 'Inversión / mercado de dinero (neto)', 'otro', true],
    ['traspaso', 'Traspasos entre cuentas propias (neto)', 'otro', true],
    ['flujo_neto', 'Flujo neto del periodo', 'neto'],
    ['saldo_final', 'Saldo final', 'saldo'],
  ]
  const filas: FilaEstado[] = []
  for (const [clave, etiqueta, nivel, detalle] of def) {
    if (nivel === 'saldo' && !o.saldos) continue
    const valores: Record<string, number | null> = {}
    for (const mes of o.meses) {
      valores[mes] = nivel === 'sec' ? null : calc[clave] ? calc[clave](mes) : g(clave, mes)
      if (valores[mes] != null) valores[mes] = r2(valores[mes]!)
    }
    // Filas de detalle sin ningún monto no se muestran (salvo traspasos/capex/inversión, que se ven en cero)
    if ((nivel === 'ing' || nivel === 'egr' || nivel === 'ic') && o.meses.every(m => !valores[m])) continue
    const nums = o.meses.map(m => valores[m]).filter((x): x is number => x != null)
    const total = nivel === 'sec' ? null
      : clave === 'saldo_inicial' ? (nums[0] ?? null)
      : clave === 'saldo_final' ? (nums[nums.length - 1] ?? null)
      : r2(nums.reduce((s, x) => s + x, 0))
    filas.push({ clave, etiqueta, nivel, valores, total, detalle })
  }
  return filas
}

/** Entradas y salidas del periodo (operativas y otras), sin traspasos si se pide. */
export function totalesPeriodo(movs: MovFlujo[], clases: Map<number, Clase>, conTraspasos: boolean) {
  let entOp = 0, entOtras = 0, salOp = 0, salOtras = 0
  for (const m of movs) {
    const g = claseDe(m, clases).grupo
    if (g === 'traspaso' && !conTraspasos) continue
    if (g === 'operacion') { entOp += m.abono; salOp += m.cargo } else { entOtras += m.abono; salOtras += m.cargo }
  }
  return { entOp: r2(entOp), entOtras: r2(entOtras), salOp: r2(salOp), salOtras: r2(salOtras) }
}
