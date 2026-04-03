'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { RefreshCw, Filter, ChevronDown, ChevronRight } from 'lucide-react'
import { PrintBar } from './utils'

const fmtFecha = (d: string | null) =>
  d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('es-MX') : '—'

const STATUS_COLOR: Record<string, string> = {
  'Abierta':    '#d97706',
  'En Proceso': '#2563eb',
  'Resuelta':   '#15803d',
  'Cerrada':    '#64748b',
}

export default function ReporteIncidenciasSeccion() {
  const [rows,      setRows]      = useState<any[]>([])   // incidencias enriquecidas
  const [secciones, setSecciones] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filterSec,    setFilterSec]    = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDe,     setFilterDe]     = useState('')
  const [filterA,      setFilterA]      = useState('')
  const [expandidas,   setExpandidas]   = useState<Record<string, boolean>>({})

  // Cargar secciones para el filtro
  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)

    // 1. Incidencias con filtros básicos
    let q = dbCtrl.from('incidencias').select('*').order('fecha', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterDe)     q = q.gte('fecha', filterDe)
    if (filterA)      q = q.lte('fecha', filterA)
    const { data: incs } = await q

    if (!incs?.length) { setRows([]); setLoading(false); return }

    // 2. Obtener lotes de las incidencias (solo los que tienen id_lote_fk)
    const loteIds = [...new Set(incs.filter(i => i.id_lote_fk).map(i => i.id_lote_fk))]
    const { data: lotes } = loteIds.length
      ? await dbCat.from('lotes').select('id, cve_lote, lote, id_seccion_fk').in('id', loteIds)
      : { data: [] }

    // 3. Obtener secciones de esos lotes
    const secIds = [...new Set((lotes ?? []).filter(l => l.id_seccion_fk).map(l => l.id_seccion_fk))]
    const { data: secs } = secIds.length
      ? await dbCfg.from('secciones').select('id, nombre').in('id', secIds)
      : { data: [] }

    // 4. Construir mapas
    const loteMap: Record<number, any> = {}
    ;(lotes ?? []).forEach((l: any) => { loteMap[l.id] = l })
    const secMap: Record<number, string> = {}
    ;(secs ?? []).forEach((s: any) => { secMap[s.id] = s.nombre })

    // 5. Enriquecer incidencias con sección
    let enriched = incs.map(inc => {
      const lote    = inc.id_lote_fk ? loteMap[inc.id_lote_fk] : null
      const secId   = lote?.id_seccion_fk ?? null
      const secNombre = secId ? (secMap[secId] ?? 'Sin sección') : 'Sin sección'
      return { ...inc, _lote: lote, _seccion: secNombre, _seccion_id: secId }
    })

    // 6. Filtrar por sección si se seleccionó
    if (filterSec) {
      enriched = enriched.filter(i => i._seccion_id === Number(filterSec))
    }

    setRows(enriched)
    setLoading(false)
  }, [filterStatus, filterSec, filterDe, filterA])

  useEffect(() => { fetchData() }, [fetchData])

  // Agrupar por sección
  const porSeccion: Record<string, any[]> = {}
  rows.forEach(r => {
    const key = r._seccion
    if (!porSeccion[key]) porSeccion[key] = []
    porSeccion[key].push(r)
  })
  const seccionesOrdenadas = Object.keys(porSeccion).sort()

  const toggleSeccion = (sec: string) =>
    setExpandidas(e => ({ ...e, [sec]: !e[sec] }))

  const STATUSES = ['Abierta', 'En Proceso', 'Resuelta', 'Cerrada']

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 180 }} value={filterSec} onChange={e => setFilterSec(e.target.value)}>
            <option value="">Todas las secciones</option>
            {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <select className="select" style={{ minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filterDe} onChange={e => setFilterDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filterA}  onChange={e => setFilterA(e.target.value)}  style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <PrintBar title="Incidencias-por-Seccion" count={rows.length} reportTitle="Incidencias por Sección" />

      {/* KPIs por status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {STATUSES.map(s => {
          const n = rows.filter(r => r.status === s).length
          const color = STATUS_COLOR[s] ?? '#64748b'
          return (
            <div key={s} className="card" style={{ padding: '10px 14px', borderTop: `3px solid ${color}` }}>
              <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s}</div>
            </div>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Sin incidencias para los filtros seleccionados
        </div>
      ) : (
        <div id="reporte-print-area" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {seccionesOrdenadas.map(sec => {
            const incs       = porSeccion[sec]
            const expanded   = expandidas[sec] !== false  // expandido por default
            const abiertas   = incs.filter(i => i.status === 'Abierta' || i.status === 'En Proceso').length
            const resueltas  = incs.filter(i => i.status === 'Resuelta' || i.status === 'Cerrada').length

            return (
              <div key={sec} className="card" style={{ overflow: 'hidden' }}>
                {/* Header sección */}
                <button
                  onClick={() => toggleSeccion(sec)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--blue-pale)', border: 'none', cursor: 'pointer',
                    borderBottom: expanded ? '1px solid #e2e8f0' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {expanded
                      ? <ChevronDown size={14} style={{ color: 'var(--blue)' }} />
                      : <ChevronRight size={14} style={{ color: 'var(--blue)' }} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{sec}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {incs.length} incidencia{incs.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    {abiertas > 0 && (
                      <span style={{ color: '#d97706', fontWeight: 600 }}>{abiertas} activa{abiertas !== 1 ? 's' : ''}</span>
                    )}
                    {resueltas > 0 && (
                      <span style={{ color: '#15803d' }}>{resueltas} resuelta{resueltas !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </button>

                {/* Tabla de incidencias */}
                {expanded && (
                  <table>
                    <thead>
                      <tr>
                        <th>Lote</th>
                        <th>Tipo</th>
                        <th>Descripción</th>
                        <th>Fecha</th>
                        <th>Asignado</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incs.map(inc => {
                        const color = STATUS_COLOR[inc.status] ?? '#64748b'
                        return (
                          <tr key={inc.id}>
                            <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold-light)', whiteSpace: 'nowrap' }}>
                              {inc._lote?.cve_lote ?? (inc.id_lote_fk ? `#${inc.id_lote_fk}` : '—')}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{inc.tipo ?? '—'}</td>
                            <td style={{ fontSize: 13, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {inc.descripcion ?? '—'}
                            </td>
                            <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtFecha(inc.fecha)}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{inc.responsable ?? '—'}</td>
                            <td>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                                color, background: color + '15', border: `1px solid ${color}40` }}>
                                {inc.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
