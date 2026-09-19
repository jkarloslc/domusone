// Lógica de proyección de caja de Tesorería — motor puro (sin React/Supabase).
// Puerto generalizado del modelo "Flujo de Caja 4T 2026": ya no asume un
// trimestre fijo, las reglas de calendario se evalúan contra el rango de
// fechas del periodo elegido.

export type ConceptoId = 'NS' | 'NQ' | 'PPE' | 'COMBS' | 'CFE' | 'PROV' | 'I' | 'IMSSM' | 'IMSSB' | 'AG' | 'AGQ'
export type GrupoId = 'nom' | 'imss' | 'imp' | 'prov' | 'agu' | 'ops'

export type Concepto = {
  id: ConceptoId
  nombre: string
  sigla: string
  calendarioDesc: string
  grupo: GrupoId
}

export const GRUPOS: { id: GrupoId; nombre: string; color: string }[] = [
  { id: 'nom',  nombre: 'Nómina (NS + NQ + PPE)', color: '#2563A8' },
  { id: 'imss', nombre: 'IMSS',                   color: '#0E8A6B' },
  { id: 'imp',  nombre: 'Impuestos',               color: '#E0A028' },
  { id: 'prov', nombre: 'Proveedores',              color: '#C2437A' },
  { id: 'agu',  nombre: "Aguinaldos (AG + AGQ)",    color: '#6B4FA8' },
  { id: 'ops',  nombre: 'CFE + combustible',        color: '#8A8F98' },
]
export const GCOLOR: Record<GrupoId, string> = Object.fromEntries(GRUPOS.map(g => [g.id, g.color])) as Record<GrupoId, string>

export const CONCEPTOS: Concepto[] = [
  { id: 'NS',    nombre: 'Nómina semanal',          sigla: 'NS',    calendarioDesc: 'cada viernes',                    grupo: 'nom' },
  { id: 'NQ',    nombre: 'Nómina quincenal',        sigla: 'NQ',    calendarioDesc: 'día 15 y último día del mes',     grupo: 'nom' },
  { id: 'PPE',   nombre: 'Personal extraordinario', sigla: 'PPE',   calendarioDesc: 'cada viernes',                    grupo: 'nom' },
  { id: 'COMBS', nombre: 'Combustible',              sigla: 'COMBS', calendarioDesc: 'cada viernes',                    grupo: 'ops' },
  { id: 'CFE',   nombre: 'CFE',                      sigla: 'CFE',   calendarioDesc: 'día 22',                          grupo: 'ops' },
  { id: 'PROV',  nombre: 'Proveedores',              sigla: 'PROV',  calendarioDesc: 'según frecuencia elegida',        grupo: 'prov' },
  { id: 'I',     nombre: 'Impuestos',                sigla: 'I',     calendarioDesc: 'día de pago elegido (17 o 22)',   grupo: 'imp' },
  { id: 'IMSSM', nombre: 'IMSS mensual',             sigla: 'IMSSM', calendarioDesc: 'día 17, meses sin pago bimestral', grupo: 'imss' },
  { id: 'IMSSB', nombre: 'IMSS bimestral',           sigla: 'IMSSB', calendarioDesc: 'día 17, cada 2 meses desde el mes ancla', grupo: 'imss' },
  { id: 'AG',    nombre: 'Aguinaldo',                sigla: 'AG',    calendarioDesc: '15 de diciembre',                grupo: 'agu' },
  { id: 'AGQ',   nombre: 'Aguinaldo quincenal',      sigla: 'AGQ',   calendarioDesc: '15 de diciembre',                grupo: 'agu' },
]
export const CPT: Record<ConceptoId, Concepto> = Object.fromEntries(CONCEPTOS.map(c => [c.id, c])) as Record<ConceptoId, Concepto>

export type CentroCosto = { id: number; nombre: string; tipo?: 'negocio' | 'costo' }

// matriz: concepto -> id_centro_costo -> monto por pago
export type Matriz = Partial<Record<ConceptoId, Record<number, number>>>
// ingresos: id_centro_costo -> 'YYYY-MM-01' -> monto mensual
export type Ingresos = Record<number, Record<string, number>>

export type ConfigPeriodo = {
  fechaInicio: string // YYYY-MM-DD
  fechaFin: string    // YYYY-MM-DD
  saldoInicial: number
  diaPagoImpuestos: 17 | 22
  frecuenciaProveedores: 'semanal' | 'mensual'
  mesAnclaImssBimestral: string | null // YYYY-MM-01
}

const DAY_MS = 86400000
const INGRESO_SPLIT: Record<number, number> = { 5: 0.40, 8: 0.35, 10: 0.25 }
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const DIAS_SEM = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

export function parseISODateUTC(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
export function isoOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
export function mesKeyOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
function ultimoDiaMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
}
function contarViernesDelMes(y: number, m: number): number {
  let c = 0
  const dias = ultimoDiaMes(y, m)
  for (let d = 1; d <= dias; d++) {
    if (((new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7) === 4) c++
  }
  return c
}
const MXN_FMT = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
export const NUM_FMT = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
export function mxn0(v: number): string { return MXN_FMT.format(Math.round(v)) }
export function kFmt(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + ' M'
  if (a >= 1e3) return Math.round(v / 1e3) + ' k'
  return String(Math.round(v))
}

export function fdate(ts: number): string {
  const d = new Date(ts)
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}
export function flong(ts: number): string {
  const d = new Date(ts)
  return `${DIAS_SEM[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

/** Meses (1er día, ts) que caen dentro de [inicio,fin], para poblar selects de mes ancla / ingresos por mes. */
export function mesesDelPeriodo(cfg: ConfigPeriodo): number[] {
  const start = parseISODateUTC(cfg.fechaInicio)
  const end = parseISODateUTC(cfg.fechaFin)
  const out: number[] = []
  let t = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), 1)
  while (t <= end) {
    out.push(t)
    const d = new Date(t)
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  }
  return out
}

/** Mes ancla por default: el segundo mes del periodo (o el único, si solo hay uno). */
export function anclaImssPorDefecto(cfg: ConfigPeriodo): string {
  const meses = mesesDelPeriodo(cfg)
  const idx = meses.length > 1 ? 1 : 0
  return isoOf(meses[idx] ?? parseISODateUTC(cfg.fechaInicio))
}

function aplicaConcepto(concepto: ConceptoId, fecha: Date, cfg: ConfigPeriodo, anclaMesAbs: number): number {
  const dom = fecha.getUTCDate()
  const y = fecha.getUTCFullYear(), m = fecha.getUTCMonth()
  const dow = (fecha.getUTCDay() + 6) % 7
  const mesAbs = y * 12 + m
  switch (concepto) {
    case 'NS': case 'PPE': case 'COMBS':
      return dow === 4 ? 1 : 0
    case 'NQ':
      return (dom === 15 || dom === ultimoDiaMes(y, m)) ? 1 : 0
    case 'CFE':
      return dom === 22 ? 1 : 0
    case 'I':
      return dom === cfg.diaPagoImpuestos ? 1 : 0
    case 'IMSSM': {
      const dist = (((mesAbs - anclaMesAbs) % 2) + 2) % 2
      return (dom === 17 && dist !== 0) ? 1 : 0
    }
    case 'IMSSB': {
      const dist = (((mesAbs - anclaMesAbs) % 2) + 2) % 2
      return (dom === 17 && dist === 0) ? 1 : 0
    }
    case 'AG': case 'AGQ':
      return (m === 11 && dom === 15) ? 1 : 0
    case 'PROV':
      if (cfg.frecuenciaProveedores === 'semanal') {
        if (dow !== 4) return 0
        const total = contarViernesDelMes(y, m)
        return total > 0 ? 1 / total : 0
      }
      return dom === 25 ? 1 : 0
  }
  return 0
}

export type DiaCalc = {
  ts: number
  ingreso: number
  egreso: number
  detalleConcepto: Partial<Record<ConceptoId, number>>
  porGrupo: Partial<Record<GrupoId, number>>
  porCC: Record<number, number>
  saldo: number
}

export type SemanaCalc = {
  inicio: number
  fin: number
  ingreso: number
  egreso: number
  porGrupo: Partial<Record<GrupoId, number>>
  porCC: Record<number, number>
  saldo: number
}

export function construirDias(
  cfg: ConfigPeriodo,
  matriz: Matriz,
  ingresos: Ingresos,
  ccIds: number[],
  filtroCC: number | 'all',
): DiaCalc[] {
  const start = parseISODateUTC(cfg.fechaInicio)
  const end = parseISODateUTC(cfg.fechaFin)
  const anclaMesAbs = (() => {
    const iso = cfg.mesAnclaImssBimestral ?? anclaImssPorDefecto(cfg)
    const d = new Date(parseISODateUTC(iso))
    return d.getUTCFullYear() * 12 + d.getUTCMonth()
  })()
  const ccs = filtroCC === 'all' ? ccIds : [filtroCC]
  const dias: DiaCalc[] = []

  for (let t = start; t <= end; t += DAY_MS) {
    const fecha = new Date(t)
    const dom = fecha.getUTCDate()
    const mesKey = mesKeyOf(t)
    const detalleConcepto: Partial<Record<ConceptoId, number>> = {}
    const porGrupo: Partial<Record<GrupoId, number>> = {}
    const porCC: Record<number, number> = {}
    let egreso = 0

    for (const c of CONCEPTOS) {
      const k = aplicaConcepto(c.id, fecha, cfg, anclaMesAbs)
      if (!k) continue
      let montoDia = 0
      for (const cc of ccs) {
        const v = Math.round((matriz[c.id]?.[cc] ?? 0) * k)
        if (v) { porCC[cc] = (porCC[cc] ?? 0) + v; montoDia += v }
      }
      if (montoDia > 0) {
        detalleConcepto[c.id] = (detalleConcepto[c.id] ?? 0) + montoDia
        porGrupo[c.grupo] = (porGrupo[c.grupo] ?? 0) + montoDia
        egreso += montoDia
      }
    }

    let ingreso = 0
    const split = INGRESO_SPLIT[dom]
    if (split) {
      for (const cc of ccs) {
        const v = Math.round((ingresos[cc]?.[mesKey] ?? 0) * split)
        if (v) ingreso += v
      }
    }

    dias.push({ ts: t, ingreso, egreso, detalleConcepto, porGrupo, porCC, saldo: 0 })
  }

  let saldo = filtroCC === 'all' ? cfg.saldoInicial : 0
  for (const d of dias) { saldo += d.ingreso - d.egreso; d.saldo = saldo }
  return dias
}

export function agruparSemanas(dias: DiaCalc[]): SemanaCalc[] {
  const map = new Map<number, SemanaCalc>()
  const orden: number[] = []
  for (const x of dias) {
    const fecha = new Date(x.ts)
    const dow = (fecha.getUTCDay() + 6) % 7
    const lunTs = x.ts - dow * DAY_MS
    if (!map.has(lunTs)) {
      const w: SemanaCalc = { inicio: lunTs, fin: lunTs + 6 * DAY_MS, ingreso: 0, egreso: 0, porGrupo: {}, porCC: {}, saldo: 0 }
      map.set(lunTs, w)
      orden.push(lunTs)
    }
    const w = map.get(lunTs)!
    w.ingreso += x.ingreso
    w.egreso += x.egreso
    w.saldo = x.saldo
    for (const g in x.porGrupo) w.porGrupo[g as GrupoId] = (w.porGrupo[g as GrupoId] ?? 0) + (x.porGrupo[g as GrupoId] ?? 0)
    for (const cc in x.porCC) w.porCC[+cc] = (w.porCC[+cc] ?? 0) + x.porCC[+cc]
  }
  return orden.map(k => map.get(k)!)
}

export type Kpis = {
  ingreso: number
  egreso: number
  diasPago: number
  diasNegativos: number
  minSaldo: number
  minTs: number
  finSaldo: number
  falta: number
  ingresoEquilibrioMensual: number
  caja: number
  numMeses: number
}

export function calcularKpis(dias: DiaCalc[], cfg: ConfigPeriodo, filtroCC: number | 'all'): Kpis {
  let ingreso = 0, egreso = 0, diasPago = 0, diasNegativos = 0
  let min = { saldo: Infinity, ts: dias[0]?.ts ?? 0 }
  for (const x of dias) {
    ingreso += x.ingreso; egreso += x.egreso
    if (x.egreso > 0) diasPago++
    if (x.saldo < 0) diasNegativos++
    if (x.saldo < min.saldo) min = { saldo: x.saldo, ts: x.ts }
  }
  const caja = filtroCC === 'all' ? cfg.saldoInicial : 0
  const finSaldo = dias.length ? dias[dias.length - 1].saldo : 0
  const falta = min.saldo < 0 ? -min.saldo : 0
  const numMeses = Math.max(1, mesesDelPeriodo(cfg).length)
  const ingresoEquilibrioMensual = Math.max(0, egreso - caja) / numMeses
  return { ingreso, egreso, diasPago, diasNegativos, minSaldo: min.saldo, minTs: min.ts, finSaldo, falta, ingresoEquilibrioMensual, caja, numMeses }
}

/** Total de un concepto en el periodo (`dias` ya viene filtrado por CC desde construirDias). */
export function totalConcepto(concepto: ConceptoId, dias: DiaCalc[]): number {
  return dias.reduce((a, d) => a + (d.detalleConcepto[concepto] ?? 0), 0)
}
