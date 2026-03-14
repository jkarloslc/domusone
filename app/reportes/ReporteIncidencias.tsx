'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { RefreshCw, Search } from 'lucide-react'
import { PrintBar } from './utils'

const fmtFecha = (d: string | null) => d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('es-MX') : '—'

export default function ReporteIncidencias() {
  const [incidencias, setIncidencias] = useState<any[]>([])
  const [lotes, setLotes]             = useState<any[]>([])
  const [loteSearch, setLoteSearch]   = useState('')
  const [loteId, setLoteId]           = useState<number | null>(null)
  const [loteNombre, setLoteNombre]   = useState('Todos los lotes')
  const [loading, setLoading]         = useState(false)
  const [filterStatus, setFilter]     = useState('')

  useEffect(() => {
    // Carga inicial con todos los registros
    fetchIncidencias(null)
  }, [])

  const fetchIncidencias = (id: number | null) => {
    setLoading(true)
    let q = dbCtrl.from('incidencias').select('*, lotes(cve_lote, lote)').order('fecha', { ascending: false })
    if (id) q = q.eq('id_lote_fk', id)
    q.then(({ data }) => { setIncidencias(data ?? []); setLoading(false) })
  }

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const selectLote = (l: any) => {
    setLoteId(l.id); setLoteNombre(l.cve_lote ?? `#${l.lote}`)
    setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([])
    fetchIncidencias(l.id)
  }

  const clearLote = () => {
    setLoteId(null); setLoteNombre('Todos los lotes')
    setLoteSearch(''); setLotes([])
    fetchIncidencias(null)
  }

  const STATUS_COLOR: Record<string, string> = {
    'Abierta': '#dc2626', 'En Proceso': '#1d4ed8', 'En Espera': '#94a3b8', 'Cerrada': '#15803d', 'Cancelada': '#94a3b8',
  }

  const filtered = filterStatus ? incidencias.filter(i => i.status === filterStatus) : incidencias

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30, width: 240 }} placeholder="Buscar lote…"
            value={loteSearch} onChange={e => setLoteSearch(e.target.value)} />
          {lotes.length > 0 && (
            <div className="card" style={{ position: 'absolute', zIndex: 10, width: '100%', marginTop: 4, padding: '4px 0' }}>
              {lotes.map((l: any) => (
                <button key={l.id} onClick={() => selectLote(l)}
                  style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 14, fontWeight: 600 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  {l.cve_lote ?? `#${l.lote}`}
                </button>
              ))}
            </div>
          )}
        </div>
        {loteId && (
          <button className="btn-secondary" onClick={clearLote} style={{ fontSize: 12 }}>
            Ver todos los lotes
          </button>
        )}
        <select className="select" style={{ width: 160 }} value={filterStatus} onChange={e => setFilter(e.target.value)}>
          <option value="">Todos los status</option>
          {['Abierta','En Proceso','En Espera','Cerrada','Cancelada'].map(s => <option key={s}>{s}</option>)}
        </select>
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)', marginTop: 10 }} />}
      </div>

      {loteId && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: 'var(--blue-pale)', borderRadius: 7, fontSize: 13, color: 'var(--blue-dark)', fontWeight: 500 }}>
          Lote: {loteNombre}
        </div>
      )}

      <PrintBar title={`Incidencias_${loteNombre.replace(/\s/g, '_')}`} count={filtered.length} reportTitle="Incidencias por Lote" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Lote</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th>Área</th>
              <th>Responsable</th>
              <th>Fecha</th>
              <th>Fecha Cierre</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin incidencias</td></tr>
            ) : filtered.map(i => (
              <tr key={i.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>#{i.id}</td>
                <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{i.lotes?.cve_lote ?? (i.id_lote_fk ? `#${i.id_lote_fk}` : '—')}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{i.tipo ?? '—'}</td>
                <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descripcion ?? '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{i.area_responsable ?? '—'}</td>
                <td style={{ fontSize: 12 }}>{i.responsable ?? '—'}</td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtFecha(i.fecha)}</td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: i.fecha_cierre ? '#15803d' : 'var(--text-muted)' }}>{fmtFecha(i.fecha_cierre)}</td>
                <td style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[i.status ?? ''] ?? 'var(--text-muted)' }}>{i.status ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
