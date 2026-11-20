'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { LayoutDashboard, RefreshCw, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import FiltroAgrupadorCentro from '@/components/ui/FiltroAgrupadorCentro'
import { useAuth } from '@/lib/AuthContext'
import { dbCtrl, dbComp, dbCfg, dbGolf } from '@/lib/supabase'
import { fechaLocal, inicioDelDia } from '@/lib/dateUtils'
import {
  cargarCentrosAgrupados, idsCentrosFiltro,
  type CentroIngresoAgr, type AgrupadorIngreso,
} from '@/lib/centrosIngreso'

// ── Paleta de marca ──────────────────────────────────────────
const C = {
  carbon: '#1C1D21', gris: '#62666E', muted: '#7A7E87', borde: '#E6E8EB', plata: '#C9CCD3',
  panel: '#F4F5F7', verde: '#1F7A50', rojo: '#C23B3B', ambar: '#B5761A', teal: '#126B63',
  cielo: '#32789A', ciruela: '#6B4E79', naranja: '#A8501F', turq: '#19D3C5',
}
const NUM: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: C.carbon }

// ── Fechas (todas en hora de Ciudad de México, YYYY-MM-DD) ───
const TZ = 'America/Mexico_City'
const diaMx = (ts: string) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ })
function sumarDias(f: string, n: number) {
  const [y, m, d] = f.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d + n))
  return x.toISOString().slice(0, 10)
}
function lunesDe(f: string) {
  const [y, m, d] = f.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
  return sumarDias(f, -((dow + 6) % 7))
}
const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000) + 1
const fmtCorta = (f: string) => {
  const [y, m, d] = f.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

type PeriodoKey = 'hoy' | 'semana' | 'mes' | 'anio'
type Rango = { desde: string; hasta: string }
type Periodo = { key: PeriodoKey; label: string; actual: Rango; anterior: Rango | null; leyendaAnt: string }

function periodos(hoy: string): Periodo[] {
  const lunes = lunesDe(hoy)
  const nDiasSem = diasEntre(lunes, hoy)
  const iniMes = hoy.slice(0, 8) + '01'
  const diaMes = Number(hoy.slice(8, 10))
  const iniMesAnt = sumarDias(iniMes, -1).slice(0, 8) + '01'
  const finMesAnt = sumarDias(iniMes, -1)
  const hastaMesAnt = diaMes <= Number(finMesAnt.slice(8, 10)) ? iniMesAnt.slice(0, 8) + String(diaMes).padStart(2, '0') : finMesAnt
  return [
    { key: 'hoy', label: 'Hoy', actual: { desde: hoy, hasta: hoy }, anterior: { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) }, leyendaAnt: 'vs. ayer' },
    { key: 'semana', label: 'Semana', actual: { desde: lunes, hasta: hoy }, anterior: { desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, nDiasSem - 8) }, leyendaAnt: 'vs. semana anterior' },
    { key: 'mes', label: 'Mes', actual: { desde: iniMes, hasta: hoy }, anterior: { desde: iniMesAnt, hasta: hastaMesAnt }, leyendaAnt: 'vs. mismo corte mes anterior' },
    { key: 'anio', label: 'Acumulado ' + hoy.slice(0, 4), actual: { desde: hoy.slice(0, 4) + '-01-01', hasta: hoy }, anterior: null, leyendaAnt: '' },
  ]
}
const enRango = (f: string, r: Rango) => f >= r.desde && f <= r.hasta

// ── Formato ──────────────────────────────────────────────────
const money = (n: number) => '$' + Math.round(n).toLocaleString('es-MX')
const entero = (n: number) => Math.round(n).toLocaleString('es-MX')
function delta(act: number, ant: number) {
  if (!ant) return null
  return ((act - ant) / Math.abs(ant)) * 100
}

// ── Carga paginada (PostgREST devuelve máx. 1000 filas) ──────
async function todo<T = any>(q: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

// ── Tipos de datos ───────────────────────────────────────────
type Recibo = { id: number; fecha: string; id_centro_ingreso_fk: number | null; monto_total: number | null }
type LineaConc = { id_recibo_fk: number; id_concepto_fk: number | null; nombre_concepto: string | null; monto: number | null }
type LineaSecc = { id_recibo_fk: number; id_seccion_fk: number | null; nombre_seccion: string | null; monto: number | null }
type OP = { id: number; fecha_op: string; monto: number | null; id_centro_costo_fk: number | null; id_tipo_gasto_fk: number | null; tipo_gasto: string | null }
type OPPend = { id: number; status: string; monto: number | null; saldo: number | null; fecha_vencimiento: string | null; id_centro_costo_fk: number | null }
type Abono = { fecha_abono: string; monto: number | null; ordenes_pago: { id_centro_costo_fk: number | null } | null }
type Acceso = { fecha: string; familiar: boolean; acomp: { origen_pago: string | null; es_externo: boolean | null }[] }

// ── Componentes visuales ─────────────────────────────────────
function Seccion({ titulo, nota, children, derecha }: { titulo: string; nota?: string; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gris }}>{titulo}</div>
          {nota && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{nota}</div>}
        </div>
        {derecha}
      </div>
      {children}
    </section>
  )
}

const Punto = ({ color }: { color: string }) => (
  <span style={{ width: 8, height: 8, borderRadius: 4, background: color, display: 'inline-block', flexShrink: 0 }} />
)

function Delta({ v, invertir = false }: { v: number | null; invertir?: boolean }) {
  if (v === null || !isFinite(v)) return <span style={{ color: C.muted }}>sin base</span>
  const bueno = invertir ? v <= 0 : v >= 0
  return (
    <span style={{ color: bueno ? C.verde : C.rojo, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      {v >= 0 ? '+' : ''}{v.toFixed(1)}%
    </span>
  )
}

function Grid({ children, min = 220 }: { children: React.ReactNode; min?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>
}

/** Tarjeta de periodo: ingresos, egresos, neto y pagado */
function CardPeriodo({ p, ing, ingAnt, egr, egrAnt, pag, nRec }: {
  p: Periodo; ing: number; ingAnt: number; egr: number; egrAnt: number; pag: number; nRec: number
}) {
  const neto = ing - egr
  return (
    <div className="card" style={{ background: '#fff', border: `1px solid ${C.plata}`, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.carbon }}>{p.label}</span>
        <span style={{ fontSize: 11, color: C.muted }}>
          {p.actual.desde === p.actual.hasta ? fmtCorta(p.actual.desde) : `${fmtCorta(p.actual.desde)} – ${fmtCorta(p.actual.hasta)}`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.gris }}><Punto color={C.verde} /> Ingresos</div>
      <div style={{ ...NUM, fontSize: 24, margin: '2px 0 2px' }}>{money(ing)}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
        {entero(nRec)} recibo{nRec === 1 ? '' : 's'}{p.anterior && <> · <Delta v={delta(ing, ingAnt)} /> {p.leyendaAnt}</>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.gris }}><Punto color={C.rojo} /> Egresos (OP emitidas)</div>
      <div style={{ ...NUM, fontSize: 20, margin: '2px 0 2px' }}>{money(egr)}</div>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
        {p.anterior ? <><Delta v={delta(egr, egrAnt)} invertir /> {p.leyendaAnt}</> : <>&nbsp;</>}
      </div>

      <div style={{ borderTop: `1px solid ${C.borde}`, paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.gris }}><Punto color={C.carbon} /> Neto</div>
          <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 15, color: neto >= 0 ? C.verde : C.rojo }}>
            {neto < 0 ? '−' : ''}{money(Math.abs(neto))}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.gris }}><Punto color={C.teal} /> Pagado</div>
          <div style={{ ...NUM, fontSize: 15 }}>{money(pag)}</div>
        </div>
      </div>
    </div>
  )
}

/** Tarjeta secundaria: un concepto/sección/centro/tipo de gasto */
function CardDesglose({ nombre, monto, total, extra, color }: { nombre: string; monto: number; total: number; extra?: string; color: string }) {
  const pct = total ? (monto / total) * 100 : 0
  return (
    <div className="card" style={{ background: '#fff', border: `1px solid ${C.plata}`, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.gris, minWidth: 0 }}>
        <Punto color={color} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nombre}>{nombre}</span>
      </div>
      <div style={{ ...NUM, fontSize: 18, margin: '4px 0 6px' }}>{money(monto)}</div>
      <div style={{ height: 3, background: C.borde, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: C.carbon }} />
      </div>
      <div style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
        {pct.toFixed(1)}% del total{extra ? ` · ${extra}` : ''}
      </div>
    </div>
  )
}

/** KPI simple: punto + etiqueta + cifra + nota */
function Kpi({ label, valor, nota, color }: { label: string; valor: string; nota?: React.ReactNode; color: string }) {
  return (
    <div className="card" style={{ background: '#fff', border: `1px solid ${C.plata}`, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.gris }}><Punto color={color} /> {label}</div>
      <div style={{ ...NUM, fontSize: 20, margin: '4px 0 2px' }}>{valor}</div>
      {nota && <div style={{ fontSize: 11, color: C.muted }}>{nota}</div>}
    </div>
  )
}

function ChipsPeriodo({ valor, setValor, lista }: { valor: PeriodoKey; setValor: (k: PeriodoKey) => void; lista: Periodo[] }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.borde}` }}>
      {lista.map(p => (
        <button key={p.key} onClick={() => setValor(p.key)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 12,
            fontWeight: valor === p.key ? 700 : 500, color: valor === p.key ? C.carbon : C.gris,
            borderBottom: `2px solid ${valor === p.key ? C.turq : 'transparent'}`, marginBottom: -1,
          }}>
          {p.label}
        </button>
      ))}
    </div>
  )
}

const PALETA_DESG = [C.verde, C.teal, C.cielo, C.ciruela, C.ambar, C.naranja, C.carbon, C.gris]
const MAX_CARDS = 11 // el resto se agrupa en "Otros"
const ID_CI_GREEN_FEES = 1 // cfg.centros_ingreso 'Green Fees'

function topN(m: Map<string, { monto: number; n: number }>) {
  const arr = Array.from(m.entries()).map(([nombre, v]) => ({ nombre, ...v })).filter(x => Math.abs(x.monto) >= 0.5).sort((a, b) => b.monto - a.monto)
  if (arr.length <= MAX_CARDS + 1) return arr
  const top = arr.slice(0, MAX_CARDS)
  const resto = arr.slice(MAX_CARDS)
  top.push({ nombre: `Otros (${resto.length})`, monto: resto.reduce((a, x) => a + x.monto, 0), n: resto.reduce((a, x) => a + x.n, 0) })
  return top
}

// ══════════════════════════════════════════════════════════════
export default function DashboardsPage() {
  const { authUser } = useAuth()
  const verGolf = authUser?.lado !== 'fracc'
  const [hoy, setHoy] = useState(fechaLocal())
  const pers = useMemo(() => periodos(hoy), [hoy])

  // Catálogos
  const [centros, setCentros] = useState<CentroIngresoAgr[]>([])
  const [agrupadores, setAgrupadores] = useState<AgrupadorIngreso[]>([])
  const [ccs, setCcs] = useState<{ id: number; nombre: string }[]>([])
  const [tiposGasto, setTiposGasto] = useState<Map<number, string>>(new Map())

  // Datos
  const [recibos, setRecibos] = useState<Recibo[]>([])
  const [lConc, setLConc] = useState<LineaConc[]>([])
  const [lSecc, setLSecc] = useState<LineaSecc[]>([])
  const [ops, setOps] = useState<OP[]>([])
  const [opsPend, setOpsPend] = useState<OPPend[]>([])
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [accesos, setAccesos] = useState<Acceso[]>([])

  // Filtros
  const [filtroAgr, setFiltroAgr] = useState('')
  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroCC, setFiltroCC] = useState('')
  const [perDesg, setPerDesg] = useState<PeriodoKey>('mes')

  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [actualizado, setActualizado] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true); setError('')
    const h = fechaLocal(); setHoy(h)
    const ps = periodos(h)
    // Desde lo más antiguo que se necesite: 1-ene o el inicio del periodo anterior
    const desde = [ps[3].actual.desde, ...ps.map(p => p.anterior?.desde ?? '9999')].sort()[0]
    try {
      const [cat, ccRes, tgRes] = await Promise.all([
        cargarCentrosAgrupados('tipo_desglose, activo'),
        dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
        dbCfg.from('tipos_gasto').select('id, nombre'),
      ])
      setCentros(cat.centros); setAgrupadores(cat.agrupadores)
      setCcs((ccRes.data ?? []) as any)
      setTiposGasto(new Map(((tgRes.data ?? []) as any[]).map(t => [t.id, t.nombre])))

      const [rec, lc, ls, op, opp, ab, acc] = await Promise.all([
        todo<Recibo>(() => dbCtrl.from('recibos_ingreso').select('id, fecha, id_centro_ingreso_fk, monto_total')
          .eq('status', 'Confirmado').gte('fecha', desde).lte('fecha', h).order('id')),
        todo<LineaConc>(() => dbCtrl.from('recibos_ingreso_conceptos')
          .select('id_recibo_fk, id_concepto_fk, nombre_concepto, monto, recibos_ingreso!inner(fecha, status)')
          .eq('recibos_ingreso.status', 'Confirmado').gte('recibos_ingreso.fecha', desde).order('id')),
        todo<LineaSecc>(() => dbCtrl.from('recibos_ingreso_secciones')
          .select('id_recibo_fk, id_seccion_fk, nombre_seccion, monto, recibos_ingreso!inner(fecha, status)')
          .eq('recibos_ingreso.status', 'Confirmado').gte('recibos_ingreso.fecha', desde).order('id')),
        todo<OP>(() => dbComp.from('ordenes_pago').select('id, fecha_op, monto, id_centro_costo_fk, id_tipo_gasto_fk, tipo_gasto')
          .not('status', 'in', '("Cancelada","Rechazada")').gte('fecha_op', desde).lte('fecha_op', h).order('id')),
        todo<OPPend>(() => dbComp.from('ordenes_pago').select('id, status, monto, saldo, fecha_vencimiento, id_centro_costo_fk')
          .in('status', ['Pendiente', 'Pago Parcial', 'Pendiente Auth', 'Pendiente Auth Finanzas']).order('id')),
        todo<Abono>(() => dbComp.from('cxp_abonos').select('fecha_abono, monto, ordenes_pago!inner(id_centro_costo_fk)')
          .eq('status', 'Aplicado').gte('fecha_abono', desde).lte('fecha_abono', h).order('id')),
        verGolf
          ? todo<any>(() => dbGolf.from('ctrl_accesos').select('id, fecha_entrada, id_familiar_fk, ctrl_acceso_acomp(origen_pago, es_externo)')
              .gte('fecha_entrada', inicioDelDia(desde)).order('id'))
          : Promise.resolve([]),
      ])
      setRecibos(rec); setLConc(lc); setLSecc(ls); setOps(op); setOpsPend(opp); setAbonos(ab)
      setAccesos((acc as any[]).map(a => ({ fecha: diaMx(a.fecha_entrada), familiar: !!a.id_familiar_fk, acomp: a.ctrl_acceso_acomp ?? [] })))
      setActualizado(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: TZ }))
    } catch (e: any) {
      setError(e?.message ?? String(e))
    }
    setCargando(false)
  }, [verGolf])

  useEffect(() => { if (authUser) cargar() }, [authUser, cargar])

  // ── Filtros aplicados ─────────────────────────────────────
  const idsCentros = useMemo(() => idsCentrosFiltro(centros, filtroAgr, filtroCentro), [centros, filtroAgr, filtroCentro])
  const recFilt = useMemo(() => recibos.filter(r => !idsCentros || (r.id_centro_ingreso_fk != null && idsCentros.has(r.id_centro_ingreso_fk))), [recibos, idsCentros])
  const ccId = filtroCC ? Number(filtroCC) : null
  const opsFilt = useMemo(() => ops.filter(o => !ccId || o.id_centro_costo_fk === ccId), [ops, ccId])
  const abFilt = useMemo(() => abonos.filter(a => !ccId || a.ordenes_pago?.id_centro_costo_fk === ccId), [abonos, ccId])
  const pendFilt = useMemo(() => opsPend.filter(o => !ccId || o.id_centro_costo_fk === ccId), [opsPend, ccId])

  const sumaRec = (r: Rango) => recFilt.reduce((a, x) => enRango(x.fecha, r) ? a + Number(x.monto_total ?? 0) : a, 0)
  const cuentaRec = (r: Rango) => recFilt.reduce((a, x) => enRango(x.fecha, r) ? a + 1 : a, 0)
  const sumaOp = (r: Rango) => opsFilt.reduce((a, x) => enRango(x.fecha_op, r) ? a + Number(x.monto ?? 0) : a, 0)
  const sumaAb = (r: Rango) => abFilt.reduce((a, x) => enRango(x.fecha_abono, r) ? a + Number(x.monto ?? 0) : a, 0)

  const pDesg = pers.find(p => p.key === perDesg)!

  // ── Desglose de ingresos ───────────────────────────────────
  const centroSel = filtroCentro ? centros.find(c => c.id === Number(filtroCentro)) : null
  const modoDesg: 'centro' | 'concepto' | 'seccion' = !centroSel ? 'centro' : centroSel.tipo_desglose === 'secciones' ? 'seccion' : 'concepto'
  const desgIng = useMemo(() => {
    const m = new Map<string, { monto: number; n: number }>()
    const add = (k: string, v: number) => { const x = m.get(k) ?? { monto: 0, n: 0 }; x.monto += v; x.n += 1; m.set(k, x) }
    const recEnPer = new Map(recFilt.filter(r => enRango(r.fecha, pDesg.actual)).map(r => [r.id, r]))
    if (modoDesg === 'centro') {
      const nom = new Map(centros.map(c => [c.id, c.label]))
      recEnPer.forEach(r => add(nom.get(r.id_centro_ingreso_fk ?? -1) ?? 'Sin centro', Number(r.monto_total ?? 0)))
    } else if (modoDesg === 'seccion') {
      lSecc.forEach(l => { if (recEnPer.has(l.id_recibo_fk)) add(l.nombre_seccion || 'Sin sección', Number(l.monto ?? 0)) })
    } else {
      lConc.forEach(l => { if (recEnPer.has(l.id_recibo_fk)) add(l.nombre_concepto || 'Sin concepto', Number(l.monto ?? 0)) })
    }
    return topN(m)
  }, [recFilt, pDesg, modoDesg, centros, lSecc, lConc])
  const totDesgIng = desgIng.reduce((a, x) => a + x.monto, 0)

  // ── Desglose de egresos por tipo de gasto ─────────────────
  const desgEgr = useMemo(() => {
    const m = new Map<string, { monto: number; n: number }>()
    opsFilt.forEach(o => {
      if (!enRango(o.fecha_op, pDesg.actual)) return
      const k = (o.id_tipo_gasto_fk && tiposGasto.get(o.id_tipo_gasto_fk)) || o.tipo_gasto || 'Sin tipo de gasto'
      const x = m.get(k) ?? { monto: 0, n: 0 }; x.monto += Number(o.monto ?? 0); x.n += 1; m.set(k, x)
    })
    return topN(m)
  }, [opsFilt, pDesg, tiposGasto])
  const totDesgEgr = desgEgr.reduce((a, x) => a + x.monto, 0)

  // ── Por pagar ─────────────────────────────────────────────
  const saldoOp = (o: OPPend) => Number(o.saldo ?? o.monto ?? 0)
  const porPagar = pendFilt.filter(o => o.status === 'Pendiente' || o.status === 'Pago Parcial')
  const vencidas = porPagar.filter(o => o.fecha_vencimiento && o.fecha_vencimiento < hoy)
  const venceSemana = porPagar.filter(o => o.fecha_vencimiento && o.fecha_vencimiento >= hoy && o.fecha_vencimiento <= sumarDias(hoy, 7))
  const porAutorizar = pendFilt.filter(o => o.status === 'Pendiente Auth' || o.status === 'Pendiente Auth Finanzas')
  const suma = (l: OPPend[]) => l.reduce((a, o) => a + saldoOp(o), 0)

  // ── Golf ──────────────────────────────────────────────────
  const golf = (r: Rango) => {
    const g = { titulares: 0, familiares: 0, acompSocios: 0, greenFee: 0, pase: 0, intercambio: 0, total: 0 }
    accesos.forEach(a => {
      if (!enRango(a.fecha, r)) return
      if (a.familiar) g.familiares++; else g.titulares++
      a.acomp.forEach(x => {
        const o = (x.origen_pago ?? '').toUpperCase()
        if (o === 'GREEN_FEE') g.greenFee++
        else if (o === 'PASE') g.pase++
        else if (o === 'INTERCAMBIO') g.intercambio++
        else g.acompSocios++
      })
    })
    g.total = g.titulares + g.familiares + g.acompSocios + g.greenFee + g.pase + g.intercambio
    return g
  }
  const ingresoGF = (r: Rango) => recibos.reduce((a, x) => x.id_centro_ingreso_fk === ID_CI_GREEN_FEES && enRango(x.fecha, r) ? a + Number(x.monto_total ?? 0) : a, 0)
  const gDesg = golf(pDesg.actual)
  const gfMonto = ingresoGF(pDesg.actual)
  const diasPer = diasEntre(pDesg.actual.desde, pDesg.actual.hasta)

  const selectorPeriodo = <ChipsPeriodo valor={perDesg} setValor={setPerDesg} lista={pers} />

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        variant="xl"
        icon={LayoutDashboard}
        eyebrowLabel="Módulo"
        title="Dashboard"
        subtitle="Vista ejecutiva de la operación"
        actions={
          <button className="btn-ghost" onClick={cargar} disabled={cargando} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> {cargando ? 'Actualizando…' : `Actualizado ${actualizado}`}
          </button>
        }
      />

      {/* Filtros */}
      <div className="card" style={{ background: '#fff', border: `1px solid ${C.borde}`, padding: '12px 14px', marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.gris, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ingresos</span>
        <FiltroAgrupadorCentro centros={centros} agrupadores={agrupadores}
          filtroAgr={filtroAgr} setFiltroAgr={setFiltroAgr} filtroCentro={filtroCentro} setFiltroCentro={setFiltroCentro} />
        <span style={{ width: 1, height: 24, background: C.borde, margin: '0 4px' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.gris, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Egresos</span>
        <select className="select" style={{ width: 'auto', minWidth: 200 }} value={filtroCC} onChange={e => setFiltroCC(e.target.value)}>
          <option value="">Todos los centros de costo</option>
          {ccs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ background: C.panel, border: `1px solid ${C.borde}`, borderLeft: `3px solid ${C.rojo}`, color: C.rojo, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <AlertTriangle size={14} /> No se pudo cargar la información: {error}
        </div>
      )}

      {/* 1. Resumen por periodo */}
      <Seccion titulo="Ingresos y egresos" nota="Ingresos = recibos confirmados (netos de condonación). Egresos = órdenes de pago emitidas por fecha de OP (sin canceladas ni rechazadas). Pagado = abonos aplicados.">
        <Grid min={240}>
          {pers.map(p => (
            <CardPeriodo key={p.key} p={p}
              ing={sumaRec(p.actual)} ingAnt={p.anterior ? sumaRec(p.anterior) : 0}
              egr={sumaOp(p.actual)} egrAnt={p.anterior ? sumaOp(p.anterior) : 0}
              pag={sumaAb(p.actual)} nRec={cuentaRec(p.actual)} />
          ))}
        </Grid>
      </Seccion>

      {/* 2. Desglose de ingresos */}
      <Seccion
        titulo={`Ingresos por ${modoDesg === 'centro' ? 'centro de ingreso' : modoDesg === 'seccion' ? 'sección' : 'concepto'}`}
        nota={`${pDesg.label} · ${money(totDesgIng)}${modoDesg === 'centro' ? ' · elige un centro de ingreso para verlo por concepto o sección' : ''}`}
        derecha={selectorPeriodo}>
        {desgIng.length === 0
          ? <div style={{ fontSize: 12, color: C.muted, padding: '14px 0' }}>Sin ingresos en el periodo.</div>
          : <Grid>{desgIng.map((x, i) => (
              <CardDesglose key={x.nombre} nombre={x.nombre} monto={x.monto} total={totDesgIng} color={PALETA_DESG[i % PALETA_DESG.length]}
                extra={modoDesg === 'centro' ? `${entero(x.n)} recibo${x.n === 1 ? '' : 's'}` : undefined} />
            ))}</Grid>}
      </Seccion>

      {/* 3. Desglose de egresos */}
      <Seccion titulo="Egresos por tipo de gasto" nota={`${pDesg.label} · ${money(totDesgEgr)}`} derecha={selectorPeriodo}>
        {desgEgr.length === 0
          ? <div style={{ fontSize: 12, color: C.muted, padding: '14px 0' }}>Sin órdenes de pago en el periodo.</div>
          : <Grid>{desgEgr.map((x, i) => (
              <CardDesglose key={x.nombre} nombre={x.nombre} monto={x.monto} total={totDesgEgr} color={PALETA_DESG[i % PALETA_DESG.length]}
                extra={`${entero(x.n)} OP${x.n === 1 ? '' : 's'}`} />
            ))}</Grid>}
      </Seccion>

      {/* 4. Cuentas por pagar */}
      <Seccion titulo="Cuentas por pagar" nota="Saldo vigente a hoy, sin importar la fecha de la OP.">
        <Grid>
          <Kpi label="Saldo por pagar" valor={money(suma(porPagar))} color={C.ambar} nota={`${entero(porPagar.length)} OP pendientes de pago`} />
          <Kpi label="Vencido" valor={money(suma(vencidas))} color={C.rojo} nota={`${entero(vencidas.length)} OP con vencimiento pasado`} />
          <Kpi label="Vence en 7 días" valor={money(suma(venceSemana))} color={C.naranja} nota={`${entero(venceSemana.length)} OP`} />
          <Kpi label="Por autorizar" valor={money(suma(porAutorizar))} color={C.ciruela} nota={`${entero(porAutorizar.length)} OP en Pendiente Auth`} />
        </Grid>
      </Seccion>

      {/* 5. Golf */}
      {verGolf && (
        <>
          <Seccion titulo="Golf · salidas al campo" nota="Jugadores registrados en Control de Accesos (titular o familiar + acompañantes).">
            <Grid>
              {pers.map(p => {
                const g = golf(p.actual)
                const ga = p.anterior ? golf(p.anterior) : null
                return (
                  <Kpi key={p.key} label={p.label} valor={`${entero(g.total)} jugadores`} color={C.verde}
                    nota={<>{entero(g.greenFee)} green fee{g.greenFee === 1 ? '' : 's'}{ga && <> · <Delta v={delta(g.total, ga.total)} /> {p.leyendaAnt}</>}</>} />
                )
              })}
            </Grid>
          </Seccion>

          <Seccion titulo="Golf · detalle de jugadores" nota={`${pDesg.label} · ${entero(gDesg.total)} jugadores en ${entero(diasPer)} día${diasPer === 1 ? '' : 's'}`} derecha={selectorPeriodo}>
            <Grid min={190}>
              <Kpi label="Socios titulares" valor={entero(gDesg.titulares)} color={C.carbon} />
              <Kpi label="Familiares de socio" valor={entero(gDesg.familiares)} color={C.gris} />
              <Kpi label="Acompañantes socios" valor={entero(gDesg.acompSocios)} color={C.cielo} nota="Socios o familiares que acompañan" />
              <Kpi label="Green fees" valor={entero(gDesg.greenFee)} color={C.verde} nota="Externos que pagan green fee" />
              <Kpi label="Pases" valor={entero(gDesg.pase)} color={C.teal} nota="Invitados con pase del socio" />
              <Kpi label="Intercambios" valor={entero(gDesg.intercambio)} color={C.ciruela} nota="Jugadores de otros clubes" />
              <Kpi label="Ingreso green fees" valor={money(gfMonto)} color={C.verde} nota="Centro de ingreso Green Fees" />
              <Kpi label="Ingreso promedio por green fee" valor={gDesg.greenFee ? money(gfMonto / gDesg.greenFee) : '—'} color={C.ambar} />
              <Kpi label="Promedio diario" valor={(gDesg.total / diasPer).toLocaleString('es-MX', { maximumFractionDigits: 1 })} color={C.carbon} nota="Jugadores por día" />
              <Kpi label="Externos" valor={gDesg.total ? `${(((gDesg.greenFee + gDesg.pase + gDesg.intercambio) / gDesg.total) * 100).toFixed(1)}%` : '—'} color={C.naranja} nota="Green fee + pase + intercambio" />
            </Grid>
          </Seccion>
        </>
      )}
    </div>
  )
}
