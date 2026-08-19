'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp } from '@/lib/supabase'
import { Loader, RefreshCw, TrendingUp, TrendingDown, Scale, AlertTriangle, BookOpen, Layers, List } from 'lucide-react'
import { resolverCategoriasPorOp } from '@/lib/pptoOcCategoria'
import { prorratearDescuento } from '@/lib/prorateoDescuento'
import ModalShell from '@/components/ui/ModalShell'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Presupuesto = { id: number; anio: number; nombre: string; status: string; modulo: string }
type Clasificacion = 'operativo' | 'financiero' | 'intercompanias'
type Partida     = {
  id: number; nombre: string; tipo: 'ingreso' | 'egreso'
  fuente_real:          string | null
  id_centro_ingreso_fk: number | null
  id_centro_costo_fk:   number | null
  id_area_fk:           number | null
  id_seccion_fk:        number | null
  id_concepto_fk:       number | null
  tipo_gasto:           string | null
  id_agrupador_fk:      number | null
  clasificacion:        Clasificacion
}
type Agrupador = { id: number; nombre: string; orden: number }
type DetMap      = Record<number, Record<number, number>>

const CLASIFICACION_TITULOS: Record<Clasificacion, string> = {
  operativo:      'Operativo',
  financiero:     'Financiero',
  intercompanias: 'Intercompañías',
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmt  = (n: number) => '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const pct  = (real: number, ppto: number) => ppto > 0 ? Math.round((real / ppto) * 100) : null
const clrPct = (p: number | null, tipo: 'ingreso' | 'egreso') => {
  if (p === null) return '#94a3b8'
  if (tipo === 'ingreso') return p >= 90 ? '#15803d' : p >= 70 ? '#d97706' : '#dc2626'
  return p <= 100 ? '#15803d' : p <= 115 ? '#d97706' : '#dc2626'
}

// ── Gráfica de barras custom ──────────────────────────────────────────────────
function BarChart12({ datos }: {
  datos: { label: string; ppto: number; real: number }[]
}) {
  const max = Math.max(...datos.map(d => Math.max(d.ppto, d.real)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, padding: '0 4px' }}>
      {datos.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 116 }}>
            <div style={{
              flex: 1, background: '#93c5fd', borderRadius: '3px 3px 0 0',
              height: `${(d.ppto / max) * 100}%`, minHeight: d.ppto > 0 ? 3 : 0,
              transition: 'height 0.4s ease',
            }} title={`Ppto: ${fmt(d.ppto)}`} />
            <div style={{
              flex: 1, background: '#1d4ed8', borderRadius: '3px 3px 0 0',
              height: `${(d.real / max) * 100}%`, minHeight: d.real > 0 ? 3 : 0,
              transition: 'height 0.4s ease',
            }} title={`Real: ${fmt(d.real)}`} />
          </div>
          <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── KPI Card — patrón tesorería ───────────────────────────────────────────────
function KpiCard({ label, value, sub, color, bg, icon: Icon }: {
  label: string; value: string; sub?: string
  color: string; bg: string
  icon: React.ComponentType<any>
}) {
  return (
    <div className="card" style={{ padding: '14px 18px', flex: '1 1 175px', background: bg,
      display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9,
        background: color + '20',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700,
          color, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Bloque KPIs + gráficas de una clasificación (Operativo/Financiero/Intercompañías) ──
function ResumenClasificacion({ titulo, ingresos, egresos, detMap, realMap }: {
  titulo: string; ingresos: Partida[]; egresos: Partida[]; detMap: DetMap; realMap: DetMap
}) {
  const sumaAnual = (pid: number, map: DetMap) =>
    MESES.reduce((s, _, i) => s + (map[pid]?.[i + 1] ?? 0), 0)

  const totalPptoIng = ingresos.reduce((s, p) => s + sumaAnual(p.id, detMap), 0)
  const totalPptoEgr = egresos.reduce((s, p) => s + sumaAnual(p.id, detMap), 0)
  const totalRealIng = ingresos.reduce((s, p) => s + sumaAnual(p.id, realMap), 0)
  const totalRealEgr = egresos.reduce((s, p) => s + sumaAnual(p.id, realMap), 0)
  const balancePpto  = totalPptoIng - totalPptoEgr
  const balanceReal  = totalRealIng - totalRealEgr
  const pctIng       = pct(totalRealIng, totalPptoIng)
  const pctEgr       = pct(totalRealEgr, totalPptoEgr)

  const graficaIng = MESES.map((label, i) => ({
    label,
    ppto: ingresos.reduce((s, p) => s + (detMap[p.id]?.[i + 1] ?? 0), 0),
    real: ingresos.reduce((s, p) => s + (realMap[p.id]?.[i + 1] ?? 0), 0),
  }))
  const graficaEgr = MESES.map((label, i) => ({
    label,
    ppto: egresos.reduce((s, p) => s + (detMap[p.id]?.[i + 1] ?? 0), 0),
    real: egresos.reduce((s, p) => s + (realMap[p.id]?.[i + 1] ?? 0), 0),
  }))

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
          background: '#f1f5f9', color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em',
        }}>
          {titulo}
        </span>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <KpiCard
          label="% Ejercido Ingresos"
          value={pctIng !== null ? `${pctIng}%` : 'Sin ppto'}
          sub={`${fmt(totalRealIng)} de ${fmt(totalPptoIng)}`}
          color={clrPct(pctIng, 'ingreso')} bg={`${clrPct(pctIng, 'ingreso')}18`}
          icon={TrendingUp}
        />
        <KpiCard
          label="% Ejercido Egresos"
          value={pctEgr !== null ? `${pctEgr}%` : 'Sin ppto'}
          sub={`${fmt(totalRealEgr)} de ${fmt(totalPptoEgr)}`}
          color={clrPct(pctEgr, 'egreso')} bg={`${clrPct(pctEgr, 'egreso')}18`}
          icon={TrendingDown}
        />
        <KpiCard
          label="Balance Presupuestado"
          value={fmt(balancePpto)}
          sub={balancePpto >= 0 ? 'Superávit proyectado' : 'Déficit proyectado'}
          color={balancePpto >= 0 ? '#0f766e' : '#dc2626'}
          bg={balancePpto >= 0 ? '#f0fdfa' : '#fef2f2'}
          icon={Scale}
        />
        <KpiCard
          label="Balance Real"
          value={fmt(balanceReal)}
          sub={balanceReal >= 0 ? 'Superávit acumulado' : 'Déficit acumulado'}
          color={balanceReal >= 0 ? '#15803d' : '#dc2626'}
          bg={balanceReal >= 0 ? '#f0fdf4' : '#fef2f2'}
          icon={Scale}
        />
      </div>

      {/* Gráficas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { label: 'Ingresos — Ppto vs Real', datos: graficaIng },
          { label: 'Egresos — Ppto vs Real',  datos: graficaEgr },
        ].map(chart => (
          <div key={chart.label} className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{chart.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#94a3b8' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#93c5fd', display: 'inline-block' }} />
                  Presupuesto
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#1d4ed8', display: 'inline-block' }} />
                  Real
                </span>
              </div>
            </div>
            <BarChart12 datos={chart.datos} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MontoDrillButton({ monto, onClick }: { monto: number; onClick: () => void }) {
  return (
    <button onClick={onClick} title="Ver partidas que integran este monto"
      style={{
        font: 'inherit', fontWeight: 'inherit', color: 'inherit', background: 'none', border: 'none',
        padding: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
        textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
      }}>
      {fmt(monto)}
    </button>
  )
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function DashboardPpto() {
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [selId, setSelId]               = useState<number | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)

  const [partidas, setPartidas] = useState<Partida[]>([])
  const [detMap,   setDetMap]   = useState<DetMap>({})
  const [realMap,  setRealMap]  = useState<DetMap>({})
  const [agrupadores, setAgrupadores] = useState<Agrupador[]>([])
  const [vista, setVista] = useState<'detalle' | 'agrupado'>('detalle')
  const [drillGrupo, setDrillGrupo] = useState<{ nombre: string; tipo: 'ingreso' | 'egreso'; partidas: { id: number; nombre: string; pptoTotal: number; realTotal: number; varAbs: number; varPct: number | null }[] } | null>(null)

  const loadEverything = useCallback(async (pptoId: number, anio: number, modulo: string, silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    // Partidas activas filtradas por módulo del presupuesto
    let qPartidas = dbCtrl.from('ppto_partidas')
      .select('id, nombre, tipo, fuente_real, id_centro_ingreso_fk, id_centro_costo_fk, id_area_fk, id_seccion_fk, id_concepto_fk, tipo_gasto, id_agrupador_fk, clasificacion')
      .eq('activo', true)
      .eq('incluir_presupuesto', true)
    if (modulo) qPartidas = (qPartidas as any).eq('modulo', modulo)
    const { data: pData } = await qPartidas
    const parts = (pData ?? []) as Partida[]
    setPartidas(parts)

    // Presupuesto detalle
    const { data: det } = await dbCtrl.from('ppto_presupuesto_det')
      .select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', pptoId)
    const dm: DetMap = {}
    ;(det ?? []).forEach((r: any) => {
      if (!dm[r.id_partida_fk]) dm[r.id_partida_fk] = {}
      dm[r.id_partida_fk][r.mes] = Number(r.monto)
    })
    setDetMap(dm)

    // Real manual
    const { data: manual } = await dbCtrl.from('ppto_presupuesto_real_manual')
      .select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', pptoId)

    // ── Clasificar partidas por fuente real ──────────────────────
    const secParts  = parts.filter(p => p.fuente_real === 'seccion'  && p.id_seccion_fk)
    const concParts = parts.filter(p => p.fuente_real === 'concepto' && p.id_concepto_fk)
    const areaParts = parts.filter(p => p.fuente_real === 'op_area'  && p.id_area_fk)

    const secIds  = Array.from(new Set(secParts.map(p => p.id_seccion_fk!)))
    const concIds = Array.from(new Set(concParts.map(p => p.id_concepto_fk!)))
    const areaIds = Array.from(new Set(areaParts.map(p => p.id_area_fk!)))

    const [{ data: secData }, { data: concData }, { data: opsData }, { data: opsDetData }] = await Promise.all([
      secIds.length > 0
        ? (dbCtrl.from('recibos_ingreso_secciones') as any)
            .select('id_seccion_fk, monto, recibos_ingreso!inner(status, fecha)')
            .in('id_seccion_fk', secIds)
            .eq('recibos_ingreso.status', 'Confirmado')
            .gte('recibos_ingreso.fecha', `${anio}-01-01`)
            .lte('recibos_ingreso.fecha', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
      concIds.length > 0
        ? (dbCtrl.from('recibos_ingreso_conceptos') as any)
            .select('id_concepto_fk, monto, recibos_ingreso!inner(status, fecha)')
            .in('id_concepto_fk', concIds)
            .eq('recibos_ingreso.status', 'Confirmado')
            .gte('recibos_ingreso.fecha', `${anio}-01-01`)
            .lte('recibos_ingreso.fecha', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
      areaIds.length > 0
        ? dbComp.from('ordenes_pago')
            .select('id, id_centro_costo_fk, id_area_fk, tipo_gasto, fecha_op, monto, status, id_oc_fk')
            .in('id_area_fk', areaIds)
            .gte('fecha_op', `${anio}-01-01`)
            .lte('fecha_op', `${anio}-12-31`)
            .not('status', 'in', '("Cancelada","Rechazada","Sustituida")')
        : Promise.resolve({ data: [] }),
      // OP con distribución por área (ordenes_pago_det): el encabezado queda con
      // id_area_fk null, hay que sumar cada línea por su propia área.
      areaIds.length > 0
        ? (dbComp.from('ordenes_pago_det') as any)
            .select('id_area_fk, monto, ordenes_pago!inner(tipo_gasto, fecha_op, status, id_area_fk)')
            .in('id_area_fk', areaIds)
            .is('ordenes_pago.id_area_fk', null)
            .gte('ordenes_pago.fecha_op', `${anio}-01-01`)
            .lte('ordenes_pago.fecha_op', `${anio}-12-31`)
            .not('ordenes_pago.status', 'in', '("Cancelada","Rechazada","Sustituida")')
        : Promise.resolve({ data: [] }),
    ])
    const opsDistribuidas = (opsDetData ?? []).map((r: any) => ({
      id_area_fk: r.id_area_fk,
      tipo_gasto: r.ordenes_pago.tipo_gasto,
      fecha_op:   r.ordenes_pago.fecha_op,
      status:     r.ordenes_pago.status,
      monto:      r.monto,
    }))

    // OP con OC (tipo_gasto null por diseño): se reatribuyen a la categoría de
    // los artículos realmente comprados en vez de caer siempre en el catch-all.
    // Si aún no existe una partida específica para esa categoría en el área,
    // el catch-all la sigue capturando sin cambios (ver tiposEspecificosPorArea
    // más abajo) — seguro desplegar antes de crear esas partidas.
    const candidatosOC = (opsData ?? [])
      .filter((o: any) => o.tipo_gasto === null && o.id_oc_fk != null)
      .map((o: any) => ({ id: o.id, id_oc_fk: o.id_oc_fk }))
    const categoriasPorOp = await resolverCategoriasPorOp(candidatosOC)
    const opsCategoria: any[] = []
    ;(opsData ?? []).forEach((op: any) => {
      const shares = categoriasPorOp.get(op.id)
      if (!shares) return
      prorratearDescuento(shares, s => s.fraction, 1, Number(op.monto)).forEach(({ item, montoNeto }) => {
        opsCategoria.push({
          id_area_fk: op.id_area_fk, tipo_gasto: item.categoria,
          fecha_op: op.fecha_op, status: op.status, monto: montoNeto,
        })
      })
    })

    const opsTodas = [
      ...(opsData ?? []).filter((o: any) => !categoriasPorOp.has(o.id)),
      ...opsDistribuidas,
      ...opsCategoria,
    ]

    const rm: DetMap = {}

    // Por sección
    secParts.forEach(p => {
      rm[p.id] = {}
      ;(secData ?? []).filter((r: any) => r.id_seccion_fk === p.id_seccion_fk)
        .forEach((r: any) => {
          const mes = new Date(r.recibos_ingreso.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(r.monto)
        })
    })

    // Por concepto
    concParts.forEach(p => {
      rm[p.id] = {}
      ;(concData ?? []).filter((r: any) => r.id_concepto_fk === p.id_concepto_fk)
        .forEach((r: any) => {
          const mes = new Date(r.recibos_ingreso.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(r.monto)
        })
    })

    // Por área — una partida "catch-all" (sin tipo_gasto) de un área excluye los
    // tipo_gasto que ya cubre otra partida específica de esa misma área, para no
    // contar la misma OP dos veces.
    const tiposEspecificosPorArea: Record<number, Set<string>> = {}
    areaParts.forEach(p => {
      if (p.tipo_gasto && p.id_area_fk) {
        if (!tiposEspecificosPorArea[p.id_area_fk]) tiposEspecificosPorArea[p.id_area_fk] = new Set()
        tiposEspecificosPorArea[p.id_area_fk].add(p.tipo_gasto)
      }
    })

    areaParts.forEach(p => {
      rm[p.id] = {}
      const tiposCubiertos = !p.tipo_gasto && p.id_area_fk ? tiposEspecificosPorArea[p.id_area_fk] : null
      opsTodas.filter((op: any) => {
          if (p.id_area_fk && op.id_area_fk !== p.id_area_fk) return false
          if (p.tipo_gasto && op.tipo_gasto !== p.tipo_gasto) return false
          if (tiposCubiertos && op.tipo_gasto && tiposCubiertos.has(op.tipo_gasto)) return false
          return true
        })
        .forEach((op: any) => {
          if (!op.fecha_op) return
          const mes = new Date(op.fecha_op + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(op.monto)
        })
    })

    // Superponer real manual
    ;(manual ?? []).forEach((r: any) => {
      if (!rm[r.id_partida_fk]) rm[r.id_partida_fk] = {}
      rm[r.id_partida_fk][r.mes] = (rm[r.id_partida_fk][r.mes] ?? 0) + Number(r.monto)
    })

    setRealMap(rm)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    dbCtrl.from('ppto_presupuestos').select('id, anio, nombre, status, modulo')
      .order('anio', { ascending: false }).order('nombre')
      .then(({ data }) => {
        const list = (data ?? []) as Presupuesto[]
        setPresupuestos(list)
        if (list.length > 0) {
          setSelId(list[0].id)
          loadEverything(list[0].id, list[0].anio, list[0].modulo)
        } else {
          setLoading(false)
        }
      })
    dbCtrl.from('ppto_agrupadores').select('id, nombre, orden').eq('activo', true).order('orden').order('nombre')
      .then(({ data }) => setAgrupadores((data ?? []) as Agrupador[]))
  }, [loadEverything])

  const selPpto = presupuestos.find(p => p.id === selId)

  function onChangePpto(id: number) {
    setSelId(id)
    const p = presupuestos.find(x => x.id === id)
    if (p) loadEverything(p.id, p.anio, p.modulo, true)
  }

  // ── Cálculos ──────────────────────────────────────────────────
  const ingresos = partidas.filter(p => p.tipo === 'ingreso')
  const egresos  = partidas.filter(p => p.tipo === 'egreso')
  const porClasificacion = (lista: Partida[], clas: Clasificacion) =>
    lista.filter(p => (p.clasificacion ?? 'operativo') === clas)

  const sumaAnual = (pid: number, map: DetMap) =>
    MESES.reduce((s, _, i) => s + (map[pid]?.[i + 1] ?? 0), 0)

  const ingFinanciero = porClasificacion(ingresos, 'financiero')
  const egrFinanciero = porClasificacion(egresos, 'financiero')
  const ingIntercompanias = porClasificacion(ingresos, 'intercompanias')
  const egrIntercompanias = porClasificacion(egresos, 'intercompanias')

  // Top 8 desvíos — vista Detalle: por partida
  const desviosDetalle = partidas
    .map(p => {
      const pptoTotal = sumaAnual(p.id, detMap)
      const realTotal = sumaAnual(p.id, realMap)
      const varAbs    = realTotal - pptoTotal
      const varPct    = pptoTotal > 0 ? Math.round(((realTotal - pptoTotal) / pptoTotal) * 100) : null
      return { id: p.id as number | string, nombre: p.nombre, tipo: p.tipo, pptoTotal, realTotal, varAbs, varPct }
    })
    .filter(p => p.pptoTotal > 0 || p.realTotal > 0)
    .sort((a, b) => Math.abs(b.varAbs) - Math.abs(a.varAbs))
    .slice(0, 8)

  // Top 8 desvíos — vista Agrupado: por agrupador, sin mezclar ingreso/egreso
  const SIN_AGRUPADOR = 'Sin Agrupador'
  const desviosAgrupado = (() => {
    const map = new Map<string, {
      nombre: string; tipo: 'ingreso' | 'egreso'; pptoTotal: number; realTotal: number
      partidas: { id: number; nombre: string; pptoTotal: number; realTotal: number; varAbs: number; varPct: number | null }[]
    }>()
    partidas.forEach(p => {
      const pptoTotal = sumaAnual(p.id, detMap)
      const realTotal = sumaAnual(p.id, realMap)
      if (pptoTotal <= 0 && realTotal <= 0) return
      const agId = p.id_agrupador_fk ?? 0
      const ag = agId ? agrupadores.find(a => a.id === agId) : null
      const key = `${p.tipo}-${agId}`
      if (!map.has(key)) map.set(key, { nombre: ag?.nombre ?? SIN_AGRUPADOR, tipo: p.tipo, pptoTotal: 0, realTotal: 0, partidas: [] })
      const g = map.get(key)!
      const varAbsP = realTotal - pptoTotal
      const varPctP = pptoTotal > 0 ? Math.round(((realTotal - pptoTotal) / pptoTotal) * 100) : null
      g.pptoTotal += pptoTotal
      g.realTotal += realTotal
      g.partidas.push({ id: p.id, nombre: p.nombre, pptoTotal, realTotal, varAbs: varAbsP, varPct: varPctP })
    })
    return Array.from(map.entries())
      .map(([key, g]) => {
        const varAbs = g.realTotal - g.pptoTotal
        const varPct = g.pptoTotal > 0 ? Math.round(((g.realTotal - g.pptoTotal) / g.pptoTotal) * 100) : null
        return { id: key, nombre: g.nombre, tipo: g.tipo, pptoTotal: g.pptoTotal, realTotal: g.realTotal, varAbs, varPct, partidas: g.partidas }
      })
      .sort((a, b) => Math.abs(b.varAbs) - Math.abs(a.varAbs))
      .slice(0, 8)
  })()

  const desvios = vista === 'detalle' ? desviosDetalle : desviosAgrupado

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <Loader size={28} color="#94a3b8" className="animate-spin" />
    </div>
  )

  if (presupuestos.length === 0) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
      <p>No hay presupuestos. Crea uno en la pestaña <strong>Captura</strong>.</p>
    </div>
  )

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <BookOpen size={15} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Presupuestos</span>
          </div>
          <h1 className="page-title-xl">Dashboard Presupuestal</h1>
          <p className="page-subtitle">Seguimiento ejecutivo Presupuesto vs Real</p>
        </div>
        <div className="page-header-actions">
          <select className="input" style={{ minWidth: 240 }}
            value={selId ?? ''} onChange={e => onChangePpto(Number(e.target.value))}>
            {presupuestos.map(p => (
              <option key={p.id} value={p.id}>{p.anio} — {p.nombre}</option>
            ))}
          </select>
          <button className="btn-ghost" onClick={() => selPpto && loadEverything(selPpto.id, selPpto.anio, selPpto.modulo, true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPIs + Gráficas por clasificación */}
      <ResumenClasificacion titulo={CLASIFICACION_TITULOS.operativo}
        ingresos={porClasificacion(ingresos, 'operativo')} egresos={porClasificacion(egresos, 'operativo')}
        detMap={detMap} realMap={realMap} />

      {(ingFinanciero.length > 0 || egrFinanciero.length > 0) && (
        <ResumenClasificacion titulo={CLASIFICACION_TITULOS.financiero}
          ingresos={ingFinanciero} egresos={egrFinanciero}
          detMap={detMap} realMap={realMap} />
      )}

      {(ingIntercompanias.length > 0 || egrIntercompanias.length > 0) && (
        <ResumenClasificacion titulo={CLASIFICACION_TITULOS.intercompanias}
          ingresos={ingIntercompanias} egresos={egrIntercompanias}
          detMap={detMap} realMap={realMap} />
      )}

      {/* Top desvíos */}
      {(desviosDetalle.length > 0 || desviosAgrupado.length > 0) && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={15} color="#d97706" />
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                {vista === 'detalle' ? 'Partidas con mayor desvío' : 'Agrupadores con mayor desvío'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', borderRadius: 22, padding: '3px 4px' }}>
              {([
                { v: 'detalle',  label: 'Detalle',  icon: List },
                { v: 'agrupado', label: 'Agrupado', icon: Layers },
              ] as const).map(({ v, label, icon: Icon }) => (
                <button key={v} onClick={() => setVista(v)}
                  style={{
                    padding: '4px 14px', borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: vista === v ? '#fff' : 'transparent',
                    color: vista === v ? '#1e293b' : '#64748b',
                    fontWeight: vista === v ? 600 : 400,
                    boxShadow: vista === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                  }}>
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={th}>{vista === 'detalle' ? 'Partida' : 'Agrupador'}</th>
                <th style={{ ...th, textAlign: 'center' }}>Tipo</th>
                <th style={{ ...th, textAlign: 'right' }}>Presupuesto</th>
                <th style={{ ...th, textAlign: 'right' }}>Real</th>
                <th style={{ ...th, textAlign: 'right' }}>Variación</th>
                <th style={{ ...th, textAlign: 'center' }}>% Ejec.</th>
              </tr>
            </thead>
            <tbody>
              {desvios.map((p, i) => {
                const esPos  = p.varAbs >= 0
                const color  = p.tipo === 'ingreso'
                  ? (esPos ? '#15803d' : '#dc2626')
                  : (esPos ? '#dc2626' : '#15803d')
                const pctVal = p.varPct !== null ? `${p.varPct > 0 ? '+' : ''}${p.varPct}%` : '—'
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9',
                    background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</span></td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: p.tipo === 'ingreso' ? '#f0fdf4' : '#fef2f2',
                        color: p.tipo === 'ingreso' ? '#15803d' : '#b91c1c',
                      }}>
                        {p.tipo === 'ingreso' ? 'Ingreso' : 'Egreso'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {p.pptoTotal > 0
                        ? (vista === 'agrupado'
                            ? <MontoDrillButton monto={p.pptoTotal} onClick={() => setDrillGrupo({ nombre: p.nombre, tipo: p.tipo, partidas: (p as typeof desviosAgrupado[number]).partidas })} />
                            : fmt(p.pptoTotal))
                        : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {p.realTotal > 0
                        ? (vista === 'agrupado'
                            ? <MontoDrillButton monto={p.realTotal} onClick={() => setDrillGrupo({ nombre: p.nombre, tipo: p.tipo, partidas: (p as typeof desviosAgrupado[number]).partidas })} />
                            : fmt(p.realTotal))
                        : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color, fontWeight: 600 }}>
                      {p.varAbs !== 0 ? `${esPos ? '+' : ''}${fmt(p.varAbs)}` : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {p.varPct !== null ? (
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 10,
                          background: `${color}18`, color,
                        }}>
                          {pctVal}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Partidas que integran el monto agrupado */}
      {drillGrupo && (
        <ModalShell
          modulo="presupuestos"
          titulo={`Partidas — ${drillGrupo.nombre}`}
          subtitulo={`${drillGrupo.partidas.length} partida${drillGrupo.partidas.length !== 1 ? 's' : ''}`}
          icono={BookOpen}
          maxWidth={560}
          onClose={() => setDrillGrupo(null)}
          footer={<button className="btn-secondary" onClick={() => setDrillGrupo(null)}>Cerrar</button>}
        >
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={th}>Partida</th>
                  <th style={{ ...th, textAlign: 'right' }}>Presupuesto</th>
                  <th style={{ ...th, textAlign: 'right' }}>Real</th>
                  <th style={{ ...th, textAlign: 'right' }}>Variación</th>
                </tr>
              </thead>
              <tbody>
                {drillGrupo.partidas
                  .slice()
                  .sort((a, b) => b.realTotal - a.realTotal)
                  .map((p, i) => {
                    const esPos = p.varAbs >= 0
                    const color = drillGrupo.tipo === 'ingreso'
                      ? (esPos ? '#15803d' : '#dc2626')
                      : (esPos ? '#dc2626' : '#15803d')
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9',
                        background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={td}>{p.nombre}</td>
                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                          {p.pptoTotal > 0 ? fmt(p.pptoTotal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                          {p.realTotal > 0 ? fmt(p.realTotal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color, fontWeight: 600 }}>
                          {p.varAbs !== 0 ? `${esPos ? '+' : ''}${fmt(p.varAbs)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                  <td style={{ ...td, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569' }}>
                    Total
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(drillGrupo.partidas.reduce((s, p) => s + p.pptoTotal, 0))}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(drillGrupo.partidas.reduce((s, p) => s + p.realTotal, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 11,
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em',
}
const td: React.CSSProperties = { padding: '11px 16px', fontSize: 13, color: '#374151' }
