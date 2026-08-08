'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useAuth } from '@/lib/AuthContext'
import { useEffect, useState, useCallback } from 'react'
import { dbCtrl } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, Edit2, Trash2, HardHat,
  ChevronLeft, ChevronRight, ClipboardCheck,
} from 'lucide-react'
import { ETAPAS, MOTIVOS, STATUS_CONSTRUCCION, STATUS_COLOR, fmtFecha } from './constants'
import ConstruccionModal from './ConstruccionModal'

const PAGE_SIZE = 20

type Construccion = {
  id: number
  id_lote_fk: number
  motivo: string | null
  descripcion: string | null
  status: string
  fecha_apertura: string
  fecha_cierre: string | null
  responsable_obra: string | null
  telefono_responsable: string | null
  notas: string | null
  created_at: string
  lotes?: { cve_lote: string | null; lote: number | null }
  construcciones_checklist?: { completado: boolean }[]
}

export default function ConstruccionesPage() {
  const { can, canWrite, canDelete } = useAuth()
  const [items, setItems]           = useState<Construccion[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [search, setSearch]         = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMotivo, setFilterMotivo] = useState('')
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<Construccion | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('construcciones')
      .select('*, lotes(cve_lote, lote), construcciones_checklist(completado)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (debouncedSearch) q = q.or(`responsable_obra.ilike.%${debouncedSearch}%,descripcion.ilike.%${debouncedSearch}%`)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterMotivo) q = q.eq('motivo', filterMotivo)
    const { data, count, error } = await q
    if (!error) { setItems(data as unknown as Construccion[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, debouncedSearch, filterStatus, filterMotivo])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este expediente de construcción? Se eliminará también su checklist, avances, incidencias y documentos.')) return
    await dbCtrl.from('construcciones').delete().eq('id', id)
    fetchData()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (!can('construcciones')) {
    return <div style={{ padding: '48px 36px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin acceso a este módulo.</div>
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <HardHat size={16} style={{ color: '#d97706' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Construcciones</h1>
          <p className="page-subtitle">{total} expedientes de obra registrados</p>
        </div>
        {canWrite('construcciones') && (
          <div className="page-header-actions">
            <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={14} /> Nuevo Expediente</button>
          </div>
        )}
      </div>

      {/* Stats por status */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_CONSTRUCCION.map(s => {
          const count = items.filter(p => p.status === s).length
          if (!count) return null
          return (
            <div key={s} className="card card-hover" style={{ padding: '10px 16px', cursor: 'pointer', minWidth: 110 }}
              onClick={() => { setFilterStatus(filterStatus === s ? '' : s); setPage(0) }}>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: filterStatus === s ? '#d97706' : 'var(--text-primary)' }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 280 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar responsable, descripción…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <select className="select" style={{ width: 180 }} value={filterMotivo} onChange={e => { setFilterMotivo(e.target.value); setPage(0) }}>
          <option value="">Todos los motivos</option>
          {MOTIVOS.map(m => <option key={m}>{m}</option>)}
        </select>
        <select className="select" style={{ width: 160 }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }}>
          <option value="">Todos los status</option>
          {STATUS_CONSTRUCCION.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Lote</th><th>Motivo</th><th>Responsable de Obra</th>
              <th>Apertura</th><th>Cierre</th>
              <th>Checklist</th><th>Status</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
            : items.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin expedientes de construcción registrados</td></tr>
            : items.map(c => {
              const done = c.construcciones_checklist?.filter(e => e.completado).length ?? 0
              return (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => { setEditing(c); setModalOpen(true) }}>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: '#d97706', fontWeight: 600 }}>{c.lotes?.cve_lote ?? `#${c.id_lote_fk}`}</td>
                  <td>{c.motivo ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.responsable_obra ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtFecha(c.fecha_apertura)}</td>
                  <td style={{ fontSize: 12, color: c.fecha_cierre ? '#15803d' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(c.fecha_cierre)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ClipboardCheck size={13} style={{ color: done === ETAPAS.length ? '#15803d' : 'var(--text-muted)' }} />
                      <span style={{ fontSize: 12 }}>{done}/{ETAPAS.length}</span>
                    </div>
                  </td>
                  <td><span className={`badge ${STATUS_COLOR[c.status] ?? 'badge-default'}`}>{c.status}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      {canWrite('construcciones') && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(c); setModalOpen(true) }}><Edit2 size={13} /></button>}
                      {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(c.id)}><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page + 1} de {totalPages} · {total} registros</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <ConstruccionModal
          construccion={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}
