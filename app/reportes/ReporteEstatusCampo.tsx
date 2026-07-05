'use client'
import { useState, useEffect } from 'react'
import { CloudRain, CheckCircle2, XCircle, AlertCircle, Route, CalendarDays } from 'lucide-react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'

type Status = 'abierto' | 'cerrado' | 'parcial'

type Estatus = {
  id: number
  fecha: string
  status_campo: Status
  status_caminos: Status
  franja: string | null
  motivo: string | null
  observaciones: string | null
}

type DiaResumen = {
  fecha: string
  statusCampo: Status
  statusCaminos: Status
  entradas: Estatus[]
}

const CAMPO_CFG: Record<Status, { label: string; color: string; bg: string; icon: React.ComponentType<any> }> = {
  abierto: { label: 'Abierto',              color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
  cerrado: { label: 'Cerrado',              color: '#dc2626', bg: '#fee2e2', icon: XCircle },
  parcial: { label: 'Abierto Parcialmente', color: '#d97706', bg: '#fef3c7', icon: AlertCircle },
}

const CAMINOS_CFG: Record<Status, { label: string; color: string; bg: string }> = {
  abierto: { label: 'Caminos Abiertos', color: '#0891b2', bg: '#e0f7fa' },
  cerrado: { label: 'Caminos Cerrados', color: '#7c3aed', bg: '#f5f3ff' },
  parcial: { label: 'Caminos Parcial',  color: '#b45309', bg: '#fef3c7' },
}

// Combina el/los registros de un mismo día en un solo status por dimensión.
// Si hay tanto 'abierto' como 'cerrado' el mismo día (ej. cierre matutino por
// lluvia y reapertura vespertina), el día se clasifica como 'parcial'.
function combinar(statuses: Status[]): Status {
  const set = new Set(statuses)
  if (set.has('parcial') || (set.has('abierto') && set.has('cerrado'))) return 'parcial'
  if (set.has('cerrado')) return 'cerrado'
  return 'abierto'
}

function diasDelPeriodo(desde: string, hasta: string): string[] {
  const dias: string[] = []
  const d = new Date(desde + 'T12:00:00')
  const fin = new Date(hasta + 'T12:00:00')
  while (d <= fin) {
    dias.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

function getIniMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function ReporteEstatusCampo() {
  const [fechaDesde, setFechaDesde] = useState(getIniMes())
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().slice(0, 10))
  const [registros, setRegistros] = useState<Estatus[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => { loadData() }, [fechaDesde, fechaHasta])

  async function loadData() {
    setLoading(true)
    const { data } = await dbGolf.from('estatus_campo')
      .select('*')
      .gte('fecha', fechaDesde).lte('fecha', fechaHasta)
      .order('fecha')
    setRegistros((data as Estatus[]) ?? [])
    setLoading(false)
  }

  // ── Días del periodo, cada uno con su clasificación combinada ────────────────
  const porFecha = new Map<string, Estatus[]>()
  registros.forEach(r => {
    if (!porFecha.has(r.fecha)) porFecha.set(r.fecha, [])
    porFecha.get(r.fecha)!.push(r)
  })

  const todosLosDias = diasDelPeriodo(fechaDesde, fechaHasta)
  const dias: DiaResumen[] = todosLosDias.map(fecha => {
    const entradas = porFecha.get(fecha) ?? []
    // Días sin registro se asumen Abierto / Caminos Abiertos (operación normal)
    const statusCampo   = entradas.length ? combinar(entradas.map(e => e.status_campo))   : 'abierto'
    const statusCaminos = entradas.length ? combinar(entradas.map(e => e.status_caminos)) : 'abierto'
    return { fecha, statusCampo, statusCaminos, entradas }
  })

  const totalDias = dias.length || 1
  const diasAbierto  = dias.filter(d => d.statusCampo === 'abierto').length
  const diasCerrado  = dias.filter(d => d.statusCampo === 'cerrado').length
  const diasParcial  = dias.filter(d => d.statusCampo === 'parcial').length
  const diasCaminosCerrados = dias.filter(d => d.statusCaminos === 'cerrado' || d.statusCaminos === 'parcial').length

  const diasConRegistro = dias.filter(d => d.entradas.length > 0)

  const pct = (n: number) => (n / totalDias * 100).toFixed(1) + '%'

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <PrintBar title="Reporte de Estatus del Campo" count={diasConRegistro.length} reportTitle="Estatus del Campo" />

      {/* Filtros */}
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
      </div>

      <div id="reporte-print-area">

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>Cargando datos…</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
              {[
                { label: 'Total Días del Periodo', value: String(totalDias), color: '#64748b', bg: '#f8fafc', icon: CalendarDays },
                { label: 'Días Abierto',           value: `${diasAbierto} (${pct(diasAbierto)})`, color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
                { label: 'Días Cerrado',           value: `${diasCerrado} (${pct(diasCerrado)})`, color: '#dc2626', bg: '#fee2e2', icon: XCircle },
                { label: 'Días Abierto Parcial.',  value: `${diasParcial} (${pct(diasParcial)})`, color: '#d97706', bg: '#fef3c7', icon: AlertCircle },
                { label: 'Días Caminos Cerrados',  value: `${diasCaminosCerrados} (${pct(diasCaminosCerrados)})`, color: '#7c3aed', bg: '#f5f3ff', icon: Route },
              ].map(k => {
                const Icon = k.icon
                return (
                  <div key={k.label} style={{ flex: '1 1 160px', maxWidth: 220, background: k.bg, borderRadius: 14, padding: '16px 18px', border: `1.5px solid ${k.color}22` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Icon size={14} style={{ color: k.color }} />
                      <span style={{ fontSize: 11, color: k.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{k.value}</div>
                  </div>
                )
              })}
            </div>

            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CloudRain size={13} />
              Los días sin registro capturado se asumen como operación normal (Abierto / Caminos Abiertos).
            </div>

            {/* Detalle diario — solo días con registro */}
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 12 }}>Detalle de Días con Registro</h3>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {['Fecha', 'Status Campo (día)', 'Status Caminos (día)', 'Registros del día'].map(h => (
                        <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {diasConRegistro.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                        Sin registros capturados en el período seleccionado.
                      </td></tr>
                    ) : diasConRegistro.map(d => {
                      const cCampo = CAMPO_CFG[d.statusCampo]
                      const cCaminos = CAMINOS_CFG[d.statusCaminos]
                      const IconCampo = cCampo.icon
                      return (
                        <tr key={d.fecha} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '11px 14px', fontWeight: 700, color: '#1e293b', verticalAlign: 'top' }}>{d.fecha}</td>
                          <td style={{ padding: '11px 14px', verticalAlign: 'top' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, color: cCampo.color, background: cCampo.bg }}>
                              <IconCampo size={12} /> {cCampo.label}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px', verticalAlign: 'top' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, color: cCaminos.color, background: cCaminos.bg }}>
                              <Route size={12} /> {cCaminos.label}
                            </span>
                          </td>
                          <td style={{ padding: '11px 14px', color: '#64748b', fontSize: 12 }}>
                            {d.entradas.map(e => (
                              <div key={e.id} style={{ marginBottom: 4 }}>
                                <span style={{ fontWeight: 600, color: '#475569' }}>{e.franja ?? 'Todo el día'}</span>
                                {' — '}
                                {CAMPO_CFG[e.status_campo].label} / {CAMINOS_CFG[e.status_caminos].label}
                                {e.motivo && <> · {e.motivo}</>}
                                {e.observaciones && <> · {e.observaciones}</>}
                              </div>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
