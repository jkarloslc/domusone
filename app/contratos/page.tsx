'use client'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/lib/useDebounce'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, FileText,
  Eye, Edit2, Trash2, X, ChevronLeft, ChevronRight
} from 'lucide-react'
import ContratoModal from './ContratoModal'
import ContratoDetail from './ContratoDetail'

const PAGE_SIZE = 20

export type Contrato = {
  id: number
  id_lote_fk: number
  sucesivo: string | null
  tipo_contrato: string | null
  parte_1: string | null
  parte_2: string | null
  objeto: string | null
  valor_operacion: number | null
  forma_pago: string | null
  moneda: string | null
  tipo_cambio: number | null
  fecha: string | null
  clausula_penal: string | null
  membresia: string | null
  cuotas_mantto: string | null
  descripcion: string | null
  adendum: string | null
  concesiones: string | null
  propietario_contrato: string | null
  created_at: string
  lotes?: { cve_lote: string | null; lote: number | null }
}

const fmt = (v: number | null) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

export default function ContratosPage() {
  const { canWrite, canDelete } = useAuth()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [search, setSearch]       = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Contrato | null>(null)
  const [detail, setDetail]       = useState<Contrato | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl
      .from('contratos')
      .select('*, lotes(cve_lote, lote)', { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (debouncedSearch) q = q.or(`propietario_contrato.ilike.%${debouncedSearch}%,tipo_contrato.ilike.%${debouncedSearch}%,sucesivo.ilike.%${debouncedSearch}%`)

    const { data, count, error } = await q
    if (!error) { setContratos(data as Contrato[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este contrato?')) return
    await dbCtrl.from('contratos').delete().eq('id', id)
    fetchData()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <FileText size={16} style={{ color: 'var(--gold)' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl" style={{ fontWeight: 400 }}>Contratos</h1>
          <p className="page-subtitle">{total} contratos registrados</p>
        </div>
        {canWrite('contratos') && (
          <div className="page-header-actions">
            <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
              <Plus size={14} /> Nuevo Contrato
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar propietario, tipo, sucesivo…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={13} /></button>}
        </div>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Sucesivo</th>
                <th>Lote</th>
                <th>Tipo</th>
                <th>Propietario</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Valor Operación</th>
                <th>Membresía</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              ) : contratos.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin contratos registrados</td></tr>
              ) : contratos.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gold-light)' }}>{c.sucesivo ?? `#${c.id}`}</td>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-secondary)' }}>
                    {(c as any).lotes?.cve_lote ?? `#${c.id_lote_fk}`}
                  </td>
                  <td><span className="badge badge-default">{c.tipo_contrato ?? '—'}</span></td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.propietario_contrato ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {c.fecha ? new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-MX') : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(c.valor_operacion)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.membresia ?? '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(c)}><Eye size={13} /></button>
                      {canWrite('contratos') && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(c); setModalOpen(true) }}><Edit2 size={13} /></button>}
                      {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(c.id)}><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page + 1} de {totalPages} · {total} registros</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && <ContratoModal contrato={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
      {detail    && <ContratoDetail contrato={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); setModalOpen(true) }} />}
    </div>
  )
}