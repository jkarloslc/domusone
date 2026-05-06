'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter } from 'lucide-react'
import { inicioDelDia, finDelDia } from '@/lib/dateUtils'

export default function ReporteTransferencias() {
  const [rows, setRows]         = useState<any[]>([])
  const [almacenes, setAlms]    = useState<any[]>([])
  const [almMap, setAlmMap]     = useState<Record<number, string>>({})
  const [artsMap, setArtsMap]   = useState<Record<number, any>>({})
  const [loading, setLoading]   = useState(true)
  const [filtroOrigen, setFiltroOrigen] = useState('')
  const [filtroDestino, setFiltroDestino] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroDe, setFiltroDe] = useState('')
  const [filtroA,  setFiltroA]  = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [detMap, setDetMap]     = useState<Record<number, any[]>>({})

  useEffect(() => {
    dbComp.from('almacenes').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setAlms(data ?? [])
        const m: Record<number, string> = {}
        ;(data ?? []).forEach((a: any) => { m[a.id] = a.nombre })
        setAlmMap(m)
      })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('transferencias').select('*').order('created_at', { ascending: false })
    if (filtroOrigen)  q = q.eq('id_almacen_origen',  Number(filtroOrigen))
    if (filtroDestino) q = q.eq('id_almacen_destino', Number(filtroDestino))
    if (filtroStatus)  q = q.eq('status', filtroStatus)
    if (filtroDe)      q = q.gte('created_at', inicioDelDia(filtroDe))
    if (filtroA)       q = q.lte('created_at', finDelDia(filtroA))

    const { data } = await q
    setRows(data ?? [])
    setExpanded(new Set())
    setDetMap({})
    setLoading(false)
  }, [filtroOrigen, filtroDestino, filtroStatus, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const cargarDetalle = async (trans: any) => {
    const id = trans.id
    if (detMap[id]) {
      // toggle
      setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
      return
    }
    const { data: det } = await dbComp.from('transferencias_det').select('*').eq('id_transferencia_fk', id)
    const artIds = Array.from(new Set((det ?? []).map((d: any) => d.id_articulo_fk).filter(Boolean)))
    const { data: arts } = artIds.length
      ? await dbComp.from('articulos').select('id, clave, nombre, unidad').in('id', artIds)
      : { data: [] }
    const am: Record<number, any> = { ...artsMap }
    ;(arts ?? []).forEach((a: any) => { am[a.id] = a })
    setArtsMap(am)
    setDetMap(prev => ({ ...prev, [id]: det ?? [] }))
    setExpanded(prev => { const n = new Set(prev); n.add(id); return n })
  }

  const fmtF = (s: string | null) => s
    ? new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

  const STATUS = ['Solicitada', 'Autorizada', 'Enviada', 'Completada', 'Rechazada']
  const statusColor = (s: string) =>
    s === 'Solicitada'  ? '#d97706' :
    s === 'Autorizada'  ? '#2563eb' :
    s === 'Enviada'     ? '#7c3aed' :
    s === 'Completada'  ? '#15803d' :
    s === 'Rechazada'   ? '#dc2626' : '#64748b'

  const totalDocs = rows.length
  const completadas = rows.filter(r => r.status === 'Completada').length
  const pendientes  = rows.filter(r => r.status === 'Solicitada' || r.status === 'Autorizada').length

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ minWidth: 190 }} value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)}>
          <option value="">Todos los orígenes</option>
          {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 190 }} value={filtroDestino} onChange={e => setFiltroDestino(e.target.value)}>
          <option value="">Todos los destinos</option>
          {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUS.map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <PrintBar title="Transferencias" count={totalDocs} reportTitle="Reporte de Transferencias" />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total transferencias', value: String(totalDocs),   color: 'var(--blue)' },
          { label: 'Completadas',           value: String(completadas), color: '#15803d' },
          { label: 'En proceso',            value: String(pendientes),  color: '#d97706' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div id="reporte-print-area">
      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Folio</th>
              <th>Área / Solicitante</th>
              <th>Origen</th>
              <th>Destino</th>
              <th>Fecha Solicitud</th>
              <th>Fecha Transferencia</th>
              <th>Status</th>
              <th>Autorizado por</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Sin transferencias para los filtros seleccionados
              </td></tr>
            ) : rows.map(r => (
              <>
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => cargarDetalle(r)}>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    {expanded.has(r.id) ? '▲' : '▼'}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.area_solicitante || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.solicitante}</div>
                  </td>
                  <td style={{ fontSize: 13 }}>{almMap[r.id_almacen_origen] ?? `#${r.id_almacen_origen}`}</td>
                  <td style={{ fontSize: 13, fontWeight: 500, color: 'var(--blue)' }}>{almMap[r.id_almacen_destino] ?? `#${r.id_almacen_destino}`}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtF(r.fecha_solicitud ?? r.created_at)}</td>
                  <td style={{ fontSize: 12, color: r.fecha_transferencia ? '#15803d' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {fmtF(r.fecha_transferencia)}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      color: statusColor(r.status),
                      background: statusColor(r.status) + '15',
                      border: `1px solid ${statusColor(r.status)}40` }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.autorizado_por ?? '—'}</td>
                </tr>

                {/* Detalle artículos */}
                {expanded.has(r.id) && detMap[r.id] && (
                  <tr key={`det-${r.id}`}>
                    <td colSpan={9} style={{ padding: 0, background: '#f8fafc' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9' }}>
                            <th style={{ padding: '6px 16px 6px 48px', textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Artículo</th>
                            <th style={{ padding: '6px 16px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Solicitado</th>
                            <th style={{ padding: '6px 16px', textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Enviado</th>
                            <th style={{ padding: '6px 16px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Unidad</th>
                            <th style={{ padding: '6px 16px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Notas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detMap[r.id].map((d, i) => {
                            const art = artsMap[d.id_articulo_fk]
                            return (
                              <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '8px 16px 8px 48px' }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)' }}>{art?.clave ?? '—'}</span>
                                  <span style={{ fontSize: 13, marginLeft: 8 }}>{art?.nombre ?? `#${d.id_articulo_fk}`}</span>
                                </td>
                                <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                  {Number(d.cantidad_solicitada).toLocaleString('es-MX', { maximumFractionDigits: 3 })}
                                </td>
                                <td style={{ padding: '8px 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                                  color: d.cantidad_enviada ? '#15803d' : 'var(--text-muted)', fontWeight: d.cantidad_enviada ? 600 : 400 }}>
                                  {d.cantidad_enviada != null
                                    ? Number(d.cantidad_enviada).toLocaleString('es-MX', { maximumFractionDigits: 3 })
                                    : '—'}
                                </td>
                                <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>{art?.unidad ?? d.unidad ?? '—'}</td>
                                <td style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{d.notas ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {r.justificacion && (
                        <div style={{ padding: '8px 16px 10px 48px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Justificación: {r.justificacion}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}
