'use client'
import { useEffect, useState } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { RefreshCw } from 'lucide-react'
import { PrintBar } from './utils'

const fmtFecha = (d: string | null) => d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('es-MX') : '—'

const STATUS_COLOR: Record<string, string> = {
  'Abierta': '#dc2626', 'En Proceso': '#1d4ed8', 'En Espera': '#94a3b8', 'Cerrada': '#15803d', 'Cancelada': '#94a3b8',
}

export default function ReporteIncidenciasAsignado() {
  const [incidencias, setIncidencias] = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [filterAsignado, setFilter]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filtroDe, setFiltroDe]       = useState('')
  const [filtroA,  setFiltroA]        = useState('')
  const [asignados, setAsignados]     = useState<string[]>([])

  useEffect(() => {
    setLoading(true)
    dbCtrl.from('incidencias').select('*, lotes(cve_lote, lote)').order('responsable').order('fecha', { ascending: false })
      .then(({ data }) => {
        setIncidencias(data ?? [])
        // Extraer asignados únicos
        const uniq = [...new Set((data ?? []).map((i: any) => i.responsable).filter(Boolean))] as string[]
        setAsignados(uniq.sort())
        setLoading(false)
      })
  }, [])

  const filtered = incidencias.filter(i => {
    const matchA = !filterAsignado || i.responsable === filterAsignado
    const matchS = !filterStatus   || i.status === filterStatus
    const matchD = !filtroDe || (i.fecha && i.fecha >= filtroDe)
    const matchF = !filtroA  || (i.fecha && i.fecha <= filtroA)
    return matchA && matchS && matchD && matchF
  })

  // Agrupar por asignado para la vista
  const grupos: Record<string, any[]> = {}
  filtered.forEach(i => {
    const key = i.responsable ?? 'Sin asignar'
    if (!grupos[key]) grupos[key] = []
    grupos[key].push(i)
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 220 }} value={filterAsignado} onChange={e => setFilter(e.target.value)}>
          <option value="">Todos los responsables</option>
          {asignados.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="select" style={{ width: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {['Abierta','En Proceso','En Espera','Cerrada','Cancelada'].map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        </div>
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
      </div>

      <PrintBar title="Incidencias_por_Asignado" count={filtered.length} reportTitle="Incidencias por Asignado" />

      {/* Vista agrupada */}
      <div id="reporte-print-area">
      {Object.entries(grupos).map(([asignado, items]) => (
        <div key={asignado} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{asignado}</div>
            <span style={{ fontSize: 11, background: 'var(--blue-pale)', color: 'var(--blue)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
              {items.length} incidencia{items.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 500 }}>
              {items.filter(i => i.status === 'Abierta').length} abiertas
            </span>
          </div>
          <div className="card" style={{ overflow: 'hidden', marginBottom: 4 }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Lote</th>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Fecha</th>
                  <th>Fecha Cierre</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>#{i.id}</td>
                    <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{i.lotes?.cve_lote ?? (i.id_lote_fk ? `#${i.id_lote_fk}` : '—')}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{i.tipo ?? '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descripcion ?? '—'}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtFecha(i.fecha)}</td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: i.fecha_cierre ? '#15803d' : 'var(--text-muted)' }}>{fmtFecha(i.fecha_cierre)}</td>
                    <td style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[i.status ?? ''] ?? 'var(--text-muted)' }}>{i.status ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {filtered.length === 0 && !loading && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin incidencias</div>
      )}
      </div>
    </div>
  )
}
