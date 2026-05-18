'use client'
import { useState, useEffect } from 'react'
import { Droplets, TrendingUp, TrendingDown, BarChart2 } from 'lucide-react'
import { dbCtrl } from '@/lib/supabase'
import { PrintBar } from './utils'

// ── Types ────────────────────────────────────────────────────────────────────
type ConsumoDiario = {
  id: string
  fecha: string
  origen: string
  m3_programado: number | null
  horas_bomba: number | null
  lectura_inicio: number | null
  lectura_fin: number | null
  m3_real: number | null
  observaciones: string | null
}

type Ejecucion = {
  id: string
  id_programa_fk: string
  fecha_prog: string
  semana_iso: number
  anio: number
  status: string
  m3_real: number | null
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ORIGENES = ['Lago 7', 'Lago 2', 'Ordeña', 'Lago 12']
const ORIGEN_COLOR: Record<string, string> = {
  'Lago 7':  '#2563eb',
  'Lago 2':  '#0ea5e9',
  'Ordeña':  '#7c3aed',
  'Lago 12': '#16a34a',
}

// M³ programado semanal por origen (del Excel)
const M3_PROG_SEMANA: Record<string, number> = {
  'Lago 7':  7072,
  'Lago 2':  1184,
  'Ordeña':  735,
  'Lago 12': 354,
}

function fmtM3(v: number | null): string {
  if (v == null) return '—'
  return v.toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' m³'
}

function fmtPct(real: number, prog: number): string {
  if (!prog) return '—'
  return (real / prog * 100).toFixed(1) + '%'
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ReporteRiegoConsumo() {
  const today = new Date()
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date(today)
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [fechaHasta, setFechaHasta] = useState(today.toISOString().slice(0, 10))
  const [filtroOrigen, setFiltroOrigen] = useState<string>('todos')
  const [consumos, setConsumos]   = useState<ConsumoDiario[]>([])
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [fechaDesde, fechaHasta])

  async function loadData() {
    setLoading(true)
    const [{ data: cd }, { data: ej }] = await Promise.all([
      dbCtrl.from('golf.riego_consumo_diario').select('*')
        .gte('fecha', fechaDesde).lte('fecha', fechaHasta).order('fecha'),
      dbCtrl.from('golf.riego_ejecucion').select('id,id_programa_fk,fecha_prog,semana_iso,anio,status,m3_real')
        .gte('fecha_prog', fechaDesde).lte('fecha_prog', fechaHasta),
    ])
    if (cd) setConsumos(cd as ConsumoDiario[])
    if (ej) setEjecuciones(ej as Ejecucion[])
    setLoading(false)
  }

  // ── Derived data ────────────────────────────────────────────────────────────
  const fechas = Array.from(new Set(consumos.map(c => c.fecha))).sort()
  const totalDias = fechas.length || 1

  // Totals by origen
  const byOrigen = ORIGENES.map(origen => {
    const rows = consumos.filter(c => c.origen === origen && (filtroOrigen === 'todos' || c.origen === filtroOrigen))
    const m3Real = rows.reduce((s, c) => s + (c.m3_real ?? 0), 0)
    const m3Prog = (M3_PROG_SEMANA[origen] / 7) * totalDias
    const hrsBomba = rows.reduce((s, c) => s + (c.horas_bomba ?? 0), 0)
    const gap = m3Real - m3Prog
    return { origen, m3Real, m3Prog, hrsBomba, gap, diasReg: rows.length }
  })

  const totalReal = byOrigen.reduce((s, o) => s + o.m3Real, 0)
  const totalProg = byOrigen.reduce((s, o) => s + o.m3Prog, 0)
  const totalHrs  = byOrigen.reduce((s, o) => s + o.hrsBomba, 0)
  const totalGap  = totalReal - totalProg

  // Weekly breakdown
  type WeekRow = { semana: number; anio: number; fechaInicio: string; m3Real: number; m3Prog: number; gap: number; actividadesCompletas: number; actividadesTotal: number }
  const semanas: WeekRow[] = []
  const semanasSet = new Map<string, WeekRow>()
  consumos.forEach(c => {
    const d = new Date(c.fecha + 'T12:00:00')
    const anio = d.getFullYear()
    const jan4 = new Date(anio, 0, 4)
    const startW1 = new Date(jan4); startW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
    const sem = 1 + Math.round(((d.getTime() - startW1.getTime()) / 86400000 - 3 + ((startW1.getDay() + 6) % 7)) / 7)
    const key = `${anio}-${sem}`
    if (!semanasSet.has(key)) {
      const monday = new Date(startW1); monday.setDate(startW1.getDate() + (sem - 1) * 7)
      semanasSet.set(key, { semana: sem, anio, fechaInicio: monday.toISOString().slice(0, 10), m3Real: 0, m3Prog: M3_PROG_SEMANA['Lago 7'] + M3_PROG_SEMANA['Lago 2'] + M3_PROG_SEMANA['Ordeña'] + M3_PROG_SEMANA['Lago 12'], gap: 0, actividadesCompletas: 0, actividadesTotal: 0 })
    }
    const row = semanasSet.get(key)!
    row.m3Real += c.m3_real ?? 0
    row.gap = row.m3Real - row.m3Prog
  })
  ejecuciones.forEach(e => {
    const d = new Date(e.fecha_prog + 'T12:00:00')
    const anio = d.getFullYear()
    const jan4 = new Date(anio, 0, 4)
    const startW1 = new Date(jan4); startW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
    const sem = 1 + Math.round(((d.getTime() - startW1.getTime()) / 86400000 - 3 + ((startW1.getDay() + 6) % 7)) / 7)
    const key = `${anio}-${sem}`
    if (semanasSet.has(key)) {
      const row = semanasSet.get(key)!
      row.actividadesTotal++
      if (e.status === 'completado') row.actividadesCompletas++
    }
  })
  semanasSet.forEach(v => semanas.push(v))
  semanas.sort((a, b) => a.anio !== b.anio ? a.anio - b.anio : a.semana - b.semana)

  // Daily detail
  const detalleFiltered = consumos.filter(c => filtroOrigen === 'todos' || c.origen === filtroOrigen)

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <PrintBar title="Reporte Consumo de Agua — Riego Golf" />

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Fecha desde</label>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Fecha hasta</label>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Origen</label>
          <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}>
            <option value="todos">Todos los orígenes</option>
            {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div id="reporte-print-area">

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>Cargando datos…</div>
        ) : (
          <>
            {/* KPI Summary Cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
              {[
                { label: 'M³ Real Total',   value: fmtM3(totalReal), color: '#7c3aed', bg: '#f5f3ff', icon: Droplets },
                { label: 'M³ Programado',   value: fmtM3(totalProg), color: '#0ea5e9', bg: '#e0f2fe', icon: BarChart2 },
                { label: 'Gap Acumulado',   value: (totalGap >= 0 ? '+' : '') + fmtM3(totalGap), color: totalGap > 0 ? '#dc2626' : '#16a34a', bg: totalGap > 0 ? '#fee2e2' : '#dcfce7', icon: totalGap > 0 ? TrendingUp : TrendingDown },
                { label: '% vs Programa',   value: fmtPct(totalReal, totalProg), color: '#2563eb', bg: '#eff6ff', icon: BarChart2 },
                { label: 'Días Registrados', value: String(totalDias), color: '#64748b', bg: '#f8fafc', icon: Droplets },
                { label: 'Hrs Bomba Total', value: totalHrs.toFixed(1) + ' hrs', color: '#d97706', bg: '#fef3c7', icon: BarChart2 },
              ].map(k => {
                const Icon = k.icon
                return (
                  <div key={k.label} style={{ flex: '1 1 140px', maxWidth: 200, background: k.bg, borderRadius: 14, padding: '16px 18px', border: `1.5px solid ${k.color}22` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Icon size={14} style={{ color: k.color }} />
                      <span style={{ fontSize: 11, color: k.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{k.value}</div>
                  </div>
                )
              })}
            </div>

            {/* By Origen table */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Droplets size={16} style={{ color: '#0ea5e9' }} /> Consumo por Origen de Agua
              </h3>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {['Origen','Días Reg.','M³ Programado','M³ Real','Gap m³','% vs Prog','Hrs Bomba'].map(h => (
                        <th key={h} style={{ padding: '11px 14px', textAlign: h === 'Origen' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: '#64748b' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byOrigen.filter(o => filtroOrigen === 'todos' || o.origen === filtroOrigen).map(o => (
                      <tr key={o.origen} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: ORIGEN_COLOR[o.origen], display: 'inline-block' }} />
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{o.origen}</span>
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', color: '#64748b' }}>{o.diasReg}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', color: '#0ea5e9', fontWeight: 600 }}>{fmtM3(o.m3Prog)}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: o.m3Real > 0 ? '#7c3aed' : '#cbd5e1' }}>{fmtM3(o.m3Real)}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: o.gap > 0 ? '#dc2626' : o.gap < 0 ? '#16a34a' : '#94a3b8' }}>
                          {o.m3Real > 0 ? (o.gap >= 0 ? '+' : '') + fmtM3(o.gap) : '—'}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', color: '#475569' }}>
                          {o.m3Real > 0 ? fmtPct(o.m3Real, o.m3Prog) : '—'}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'right', color: '#64748b' }}>
                          {o.hrsBomba > 0 ? o.hrsBomba.toFixed(1) + ' hrs' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                      <td style={{ padding: '11px 14px', color: '#1e293b' }}>TOTAL</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: '#64748b' }}>—</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: '#0ea5e9' }}>{fmtM3(totalProg)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: '#7c3aed' }}>{fmtM3(totalReal)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: totalGap > 0 ? '#dc2626' : '#16a34a' }}>
                        {totalReal > 0 ? (totalGap >= 0 ? '+' : '') + fmtM3(totalGap) : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: '#475569' }}>
                        {totalReal > 0 ? fmtPct(totalReal, totalProg) : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: '#64748b' }}>{totalHrs.toFixed(1)} hrs</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Weekly breakdown */}
            {semanas.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Resumen por Semana</h3>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        {['Semana','Inicio','M³ Programado','M³ Real','Gap','% Cumplim.','Actividades'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Semana' || h === 'Inicio' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: '#64748b' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {semanas.map(s => {
                        const pct = s.actividadesTotal > 0 ? Math.round(s.actividadesCompletas / s.actividadesTotal * 100) : null
                        return (
                          <tr key={`${s.anio}-${s.semana}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>Sem {s.semana} / {s.anio}</td>
                            <td style={{ padding: '10px 14px', color: '#64748b' }}>{s.fechaInicio}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0ea5e9', fontWeight: 600 }}>{fmtM3(s.m3Prog)}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: s.m3Real > 0 ? '#7c3aed' : '#cbd5e1' }}>{fmtM3(s.m3Real)}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: s.gap > 0 ? '#dc2626' : s.gap < 0 ? '#16a34a' : '#94a3b8' }}>
                              {s.m3Real > 0 ? (s.gap >= 0 ? '+' : '') + fmtM3(s.gap) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                              {pct != null ? (
                                <span style={{ color: pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626', fontWeight: 700 }}>{pct}%</span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', color: '#64748b' }}>
                              {s.actividadesTotal > 0 ? `${s.actividadesCompletas}/${s.actividadesTotal}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Daily detail */}
            {detalleFiltered.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Detalle Diario</h3>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        {['Fecha','Origen','M³ Prog.','Hrs Bomba','Lect. Inicio','Lect. Fin','M³ Real','Gap','Observaciones'].map(h => (
                          <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detalleFiltered.map(c => {
                        const gap = c.m3_real != null && c.m3_programado != null ? c.m3_real - c.m3_programado : null
                        return (
                          <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '8px 12px', color: '#1e293b', fontWeight: 600 }}>{c.fecha}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ORIGEN_COLOR[c.origen] ?? '#94a3b8', display: 'inline-block' }} />
                                {c.origen}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', color: '#0ea5e9' }}>{c.m3_programado?.toFixed(1) ?? '—'}</td>
                            <td style={{ padding: '8px 12px', color: '#64748b' }}>{c.horas_bomba?.toFixed(1) ?? '—'}</td>
                            <td style={{ padding: '8px 12px', color: '#64748b' }}>{c.lectura_inicio?.toFixed(2) ?? '—'}</td>
                            <td style={{ padding: '8px 12px', color: '#64748b' }}>{c.lectura_fin?.toFixed(2) ?? '—'}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#7c3aed' }}>{c.m3_real?.toFixed(1) ?? '—'}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: gap == null ? '#94a3b8' : gap > 0 ? '#dc2626' : '#16a34a' }}>
                              {gap != null ? (gap > 0 ? '+' : '') + gap.toFixed(1) : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 11 }}>{c.observaciones ?? '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detalleFiltered.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                <Droplets size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
                <div>No hay registros de consumo para el período seleccionado.</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>Registra el consumo diario desde el módulo de Riego en Golf.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
