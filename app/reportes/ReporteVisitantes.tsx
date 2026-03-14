'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { Search, RefreshCw } from 'lucide-react'
import { PrintBar } from './utils'

export default function ReporteVisitantes() {
  const [rows, setRows]             = useState<any[]>([])
  const [lotes, setLotes]           = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState('')
  const [loteId, setLoteId]         = useState<number | null>(null)
  const [loteNombre, setLoteNombre] = useState('Todos los lotes')
  const [loading, setLoading]       = useState(false)

  useEffect(() => { fetchData(null) }, [])

  const fetchData = (id: number | null) => {
    setLoading(true)
    let q = dbCtrl.from('visitantes_autorizados_lotes')
      .select('tipo_pase, vigencia_desde, vigencia_hasta, activo, lotes(cve_lote, lote), visitantes(nombre, apellido_paterno, apellido_materno, tipo_visitante, parentesco, identificacion_tipo, identificacion_num)')
      .eq('activo', true)
      .order('id')
    if (id) q = q.eq('id_lote_fk', id)
    q.then(({ data }) => { setRows(data ?? []); setLoading(false) })
  }

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const selectLote = (l: any) => {
    setLoteId(l.id); setLoteNombre(l.cve_lote ?? `#${l.lote}`)
    setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([])
    fetchData(l.id)
  }

  const clearLote = () => {
    setLoteId(null); setLoteNombre('Todos los lotes')
    setLoteSearch(''); fetchData(null)
  }

  const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX') : '—'

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
        {loteId && <button className="btn-secondary" onClick={clearLote} style={{ fontSize: 12 }}>Ver todos</button>}
        {loading && <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)', marginTop: 10 }} />}
      </div>

      {loteId && (
        <div style={{ marginBottom: 12, padding: '8px 14px', background: 'var(--blue-pale)', borderRadius: 7, fontSize: 13, color: 'var(--blue-dark)', fontWeight: 500 }}>
          Lote: {loteNombre}
        </div>
      )}

      <PrintBar title={`Visitantes_${loteNombre.replace(/\s/g, '_')}`} count={rows.length} reportTitle="Visitantes por Lote" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Visitante</th>
              <th>Tipo</th>
              <th>Parentesco</th>
              <th>Identificación</th>
              <th>Tipo Pase</th>
              <th>Vigencia Desde</th>
              <th>Vigencia Hasta</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin visitantes autorizados</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{r.lotes?.cve_lote ?? '—'}</td>
                <td style={{ fontWeight: 500 }}>
                  {[r.visitantes?.nombre, r.visitantes?.apellido_paterno, r.visitantes?.apellido_materno].filter(Boolean).join(' ') || '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.visitantes?.tipo_visitante ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.visitantes?.parentesco ?? '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {r.visitantes?.identificacion_tipo ? `${r.visitantes.identificacion_tipo}: ${r.visitantes.identificacion_num ?? ''}` : '—'}
                </td>
                <td style={{ fontSize: 12 }}>{r.tipo_pase ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtFecha(r.vigencia_desde)}</td>
                <td style={{ fontSize: 12, color: r.vigencia_hasta ? '#15803d' : 'var(--text-muted)' }}>{fmtFecha(r.vigencia_hasta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
