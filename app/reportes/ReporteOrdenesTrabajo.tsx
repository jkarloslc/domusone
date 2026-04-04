'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw } from 'lucide-react'

const STATUSES   = ['Pendiente','En Proceso','En Pausa','Completada','Cancelada']
const PRIORIDADES = ['Urgente','Alta','Media','Baja']
const TIPOS = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Otro']

const statusColor = (s: string) =>
  s === 'Completada' ? '#15803d' : s === 'En Proceso' ? '#2563eb' :
  s === 'En Pausa' ? '#7c3aed' : s === 'Cancelada' ? '#94a3b8' : '#d97706'

const prioColor = (p: string) =>
  p === 'Urgente' ? '#dc2626' : p === 'Alta' ? '#ea580c' :
  p === 'Media' ? '#d97706' : '#64748b'

export default function ReporteOrdenesTrabajo() {
  const [rows,    setRows]    = useState<any[]>([])
  const [secMap,  setSecMap]  = useState<Record<number, string>>({})
  const [secciones, setSecs]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [filtroSec,    setFiltroSec]    = useState('')
  const [filtroPrio,   setFiltroPrio]   = useState('')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ots }, { data: secs }] = await Promise.all([
      dbCtrl.from('ordenes_trabajo').select('*').order('created_at', { ascending: false }),
      dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setSecs(secs ?? [])
    const sm: Record<number, string> = {}
    ;(secs ?? []).forEach((s: any) => { sm[s.id] = s.nombre })
    setSecMap(sm)

    let result = ots ?? []
    if (filtroStatus) result = result.filter((r: any) => r.status       === filtroStatus)
    if (filtroTipo)   result = result.filter((r: any) => r.tipo_trabajo  === filtroTipo)
    if (filtroSec)    result = result.filter((r: any) => r.id_seccion_fk === Number(filtroSec))
    if (filtroPrio)   result = result.filter((r: any) => r.prioridad     === filtroPrio)
    if (filtroDe)     result = result.filter((r: any) => r.fecha_inicio  >= filtroDe)
    if (filtroA)      result = result.filter((r: any) => r.fecha_inicio  <= filtroA)

    setRows(result)
    setLoading(false)
  }, [filtroStatus, filtroTipo, filtroSec, filtroPrio, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 150 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroSec} onChange={e => setFiltroSec(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 130 }} value={filtroPrio} onChange={e => setFiltroPrio(e.target.value)}>
          <option value="">Todas las prioridades</option>
          {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Ordenes-de-Trabajo" count={rows.length} reportTitle="Órdenes de Trabajo — Mantenimiento" />

      {/* Resumen por status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {STATUSES.map(s => {
          const n = rows.filter(r => r.status === s).length
          return (
            <div key={s} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: statusColor(s) }}>{n}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>órdenes</div>
            </div>
          )
        })}
      </div>

      <div id="reporte-print-area">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table id="reporte-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Título</th>
                <th>Sección</th>
                <th>Tipo</th>
                <th>Prioridad</th>
                <th>Asignado a</th>
                <th>Fecha Inicio</th>
                <th>Fecha Límite</th>
                <th>Fecha Cierre</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.folio}</td>
                  <td style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_seccion_fk ? (secMap[r.id_seccion_fk] ?? `#${r.id_seccion_fk}`) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.tipo_trabajo ?? '—'}</td>
                  <td>
                    {r.prioridad && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                        color: prioColor(r.prioridad), background: prioColor(r.prioridad) + '15',
                        border: `1px solid ${prioColor(r.prioridad)}40` }}>
                        {r.prioridad}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.asignado_a ?? '—'}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(r.fecha_inicio)}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: r.fecha_limite && new Date(r.fecha_limite) < new Date() && r.status !== 'Completada' ? '#dc2626' : 'var(--text-secondary)' }}>
                    {fmtF(r.fecha_limite)}
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#15803d' }}>{fmtF(r.fecha_cierre)}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      color: statusColor(r.status), background: statusColor(r.status) + '15',
                      border: `1px solid ${statusColor(r.status)}40` }}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
