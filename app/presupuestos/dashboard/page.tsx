'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbPpto, dbCtrl, dbComp } from '@/lib/supabase'
import { Loader, RefreshCw, TrendingUp, TrendingDown, Scale, AlertTriangle, BookOpen } from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Presupuesto = { id: number; anio: number; nombre: string; status: string }
type Partida     = {
  id: number; nombre: string; tipo: 'ingreso' | 'egreso'
  id_centro_ingreso_fk: number | null
  id_centro_costo_fk:   number | null
  id_area_fk:           number | null
}
type DetMap      = Record<number, Record<number, number>>

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

// ── Página ───────────────────────────────────────────────────────────────────
export default function DashboardPpto() {
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [selId, setSelId]               = useState<number | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)

  const [partidas, setPartidas] = useState<Partida[]>([])
  const [detMap,   setDetMap]   = useState<DetMap>({})
  const [realMap,  setRealMap]  = useState<DetMap>({})

  const loadEverything = useCallback(async (pptoId: number, anio: number, silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)

    // Partidas activas
    const { data: pData } = await dbPpto.from('partidas')
      .select('id, nombre, tipo, id_centro_ingreso_fk, id_centro_costo_fk, id_area_fk')
      .eq('activo', true)
    const parts = (pData ?? []) as Partida[]
    setPartidas(parts)

    // Presupuesto detalle
    const { data: det } = await dbPpto.from('presupuesto_det')
      .select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', pptoId)
    const dm: DetMap = {}
    ;(det ?? []).forEach((r: any) => {
      if (!dm[r.id_partida_fk]) dm[r.id_partida_fk] = {}
      dm[r.id_partida_fk][r.mes] = Number(r.monto)
    })
    setDetMap(dm)

    // Real manual
    const { data: manual } = await dbPpto.from('presupuesto_real_manual')
      .select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', pptoId)

    // Real automático: ingresos
    const ingParts = parts.filter(p => p.tipo === 'ingreso' && p.id_centro_ingreso_fk)
    const ciIds    = [...new Set(ingParts.map(p => p.id_centro_ingreso_fk!))]

    const egrParts = parts.filter(p => p.tipo === 'egreso' && p.id_centro_costo_fk)
    const ccIds    = [...new Set(egrParts.map(p => p.id_centro_costo_fk!))]

    const [{ data: recibos }, { data: ops }] = await Promise.all([
      ciIds.length > 0
        ? dbCtrl.from('recibos_ingreso')
            .select('id_centro_ingreso_fk, fecha, monto_total')
            .in('id_centro_ingreso_fk', ciIds)
            .gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`)
            .neq('status', 'Cancelado')
        : Promise.resolve({ data: [] }),
      ccIds.length > 0
        ? dbComp.from('ordenes_pago')
            .select('id_centro_costo_fk, id_area_fk, fecha_op, monto')
            .in('id_centro_costo_fk', ccIds)
            .gte('fecha_op', `${anio}-01-01`).lte('fecha_op', `${anio}-12-31`)
            .not('status', 'in', '("Cancelada","Cancelado")')
        : Promise.resolve({ data: [] }),
    ])

    const rm: DetMap = {}

    // Agregar ingresos
    ingParts.forEach(p => {
      rm[p.id] = {}
      ;(recibos ?? [])
        .filter((r: any) => r.id_centro_ingreso_fk === p.id_centro_ingreso_fk)
        .forEach((r: any) => {
          const mes = new Date(r.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(r.monto_total)
        })
    })

    // Agregar egresos
    egrParts.forEach(p => {
      rm[p.id] = {}
      ;(ops ?? [])
        .filter((op: any) => {
          if (op.id_centro_costo_fk !== p.id_centro_costo_fk) return false
          if (p.id_area_fk && op.id_area_fk !== p.id_area_fk) return false
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
    dbPpto.from('presupuestos').select('id, anio, nombre, status')
      .order('anio', { ascending: false }).order('nombre')
      .then(({ data }) => {
        const list = (data ?? []) as Presupuesto[]
        setPresupuestos(list)
        if (list.length > 0) {
          setSelId(list[0].id)
          loadEverything(list[0].id, list[0].anio)
        } else {
          setLoading(false)
        }
      })
  }, [loadEverything])

  const selPpto = presupuestos.find(p => p.id === selId)

  function onChangePpto(id: number) {
    setSelId(id)
    const p = presupuestos.find(x => x.id === id)
    if (p) loadEverything(p.id, p.anio, true)
  }

  // ── Cálculos ──────────────────────────────────────────────────
  const ingresos = partidas.filter(p => p.tipo === 'ingreso')
  const egresos  = partidas.filter(p => p.tipo === 'egreso')

  const sumaAnual = (pid: number, map: DetMap) =>
    MESES.reduce((s, _, i) => s + (map[pid]?.[i + 1] ?? 0), 0)

  const totalPptoIng  = ingresos.reduce((s, p) => s + sumaAnual(p.id, detMap), 0)
  const totalPptoEgr  = egresos.reduce((s, p) => s + sumaAnual(p.id, detMap), 0)
  const totalRealIng  = ingresos.reduce((s, p) => s + sumaAnual(p.id, realMap), 0)
  const totalRealEgr  = egresos.reduce((s, p) => s + sumaAnual(p.id, realMap), 0)
  const balancePpto   = totalPptoIng - totalPptoEgr
  const balanceReal   = totalRealIng - totalRealEgr
  const pctIng        = pct(totalRealIng, totalPptoIng)
  const pctEgr        = pct(totalRealEgr, totalPptoEgr)

  // Datos gráfica 12 meses (ingresos)
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

  // Top 5 desvíos
  const desvios = partidas
    .map(p => {
      const pptoTotal = sumaAnual(p.id, detMap)
      const realTotal = sumaAnual(p.id, realMap)
      const varAbs    = realTotal - pptoTotal
      const varPct    = pptoTotal > 0 ? Math.round(((realTotal - pptoTotal) / pptoTotal) * 100) : null
      return { ...p, pptoTotal, realTotal, varAbs, varPct }
    })
    .filter(p => p.pptoTotal > 0 || p.realTotal > 0)
    .sort((a, b) => Math.abs(b.varAbs) - Math.abs(a.varAbs))
    .slice(0, 8)

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
          <button className="btn-ghost" onClick={() => selPpto && loadEverything(selPpto.id, selPpto.anio, true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
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

      {/* Top desvíos */}
      {desvios.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} color="#d97706" />
            <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
              Partidas con mayor desvío
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={th}>Partida</th>
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
                      {p.pptoTotal > 0 ? fmt(p.pptoTotal) : '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {p.realTotal > 0 ? fmt(p.realTotal) : '—'}
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
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 11,
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em',
}
const td: React.CSSProperties = { padding: '11px 16px', fontSize: 13, color: '#374151' }
