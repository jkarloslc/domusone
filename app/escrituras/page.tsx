'use client'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/lib/useDebounce'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { Plus, Search, RefreshCw, Building2, Eye, Edit2, Trash2, X, Save, Loader, ChevronLeft, ChevronRight } from 'lucide-react'
import FileUpload from '@/components/FileUpload'

const PAGE_SIZE = 20

type Escritura = {
  id: number
  id_lote_fk: number
  status: string | null
  no_escritura: string | null
  notaria: number | null
  notario: string | null
  fecha: string | null
  propietario: string | null
  created_at: string
  lotes?: { cve_lote: string | null; lote: number | null }
}

const STATUS_ESCRITURA = ['Pendiente', 'En Proceso', 'Firmada', 'Inscrita en RPP', 'Entregada']
const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX') : '—'

const STATUS_COLOR: Record<string, string> = {
  'Pendiente': 'badge-bloqueado',
  'En Proceso': 'badge-default',
  'Firmada': 'badge-libre',
  'Inscrita en RPP': 'badge-vendido',
  'Entregada': 'badge-vendido',
}

export default function EscriturasPage() {
  const { canWrite, canDelete } = useAuth()
  const [escrituras, setEscrituras] = useState<Escritura[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [search, setSearch]         = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilter]   = useState('')
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<Escritura | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl
      .from('escrituras')
      .select('*, lotes(cve_lote, lote)', { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (debouncedSearch)       q = q.or(`no_escritura.ilike.%${debouncedSearch}%,propietario.ilike.%${debouncedSearch}%,notario.ilike.%${debouncedSearch}%`)
    if (filterStatus) q = q.eq('status', filterStatus)

    const { data, count, error } = await q
    if (!error) { setEscrituras(data as Escritura[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, debouncedSearch, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta escritura?')) return
    await dbCtrl.from('escrituras').delete().eq('id', id)
    fetchData()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Stats por status
  const porStatus = STATUS_ESCRITURA.map(s => ({ label: s, count: escrituras.filter(e => e.status === s).length }))

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Building2 size={16} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em' }}>Escrituras</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>{total} escrituras registradas</p>
        </div>
        {canWrite('escrituras') && <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={14} /> Nueva Escritura
        </button>}
      </div>

      {/* Stats por status */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {porStatus.filter(s => s.count > 0).map(s => (
          <div key={s.label} className="card card-hover" style={{ padding: '10px 16px', cursor: 'pointer', minWidth: 110 }}
            onClick={() => setFilter(filterStatus === s.label ? '' : s.label)}>
            <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: filterStatus === s.label ? 'var(--gold-light)' : 'var(--text-primary)' }}>{s.count}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar no. escritura, propietario…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={13} /></button>}
        </div>
        <select className="select" style={{ width: 180 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
          <option value="">Todos los status</option>
          {STATUS_ESCRITURA.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>No. Escritura</th>
                <th>Lote</th>
                <th>Propietario</th>
                <th>Notaría</th>
                <th>Notario</th>
                <th>Fecha</th>
                <th>Status</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              ) : escrituras.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin escrituras registradas</td></tr>
              ) : escrituras.map(e => (
                <tr key={e.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--gold-light)' }}>{e.no_escritura ?? `#${e.id}`}</td>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-secondary)' }}>{(e as any).lotes?.cve_lote ?? `#${e.id_lote_fk}`}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.propietario ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.notaria ? `No. ${e.notaria}` : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notario ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtFecha(e.fecha)}</td>
                  <td><span className={`badge ${STATUS_COLOR[e.status ?? ''] ?? 'badge-default'}`}>{e.status ?? 'Sin status'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      {canWrite('escrituras') && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(e); setModalOpen(true) }}><Edit2 size={13} /></button>}
                      {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(e.id)}><Trash2 size={13} /></button>}
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

      {modalOpen && (
        <EscrituraModal escritura={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />
      )}
    </div>
  )
}

// ── Modal CRUD ───────────────────────────────────────────────
function EscrituraModal({ escritura, onClose, onSaved }: { escritura: Escritura | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !escritura
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [lotes, setLotes]       = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState(escritura ? ((escritura as any).lotes?.cve_lote ?? '') : '')

  const [form, setForm] = useState({
    id_lote_fk:   escritura?.id_lote_fk?.toString() ?? '',
    status:       escritura?.status ?? 'Pendiente',
    no_escritura: escritura?.no_escritura ?? '',
    notaria:      escritura?.notaria?.toString() ?? '',
    notario:      escritura?.notario ?? '',
    fecha:        escritura?.fecha ?? '',
    propietario:  escritura?.propietario ?? '',
    pdf_escritura: (escritura as any)?.pdf_escritura ?? null,
  })

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_lote_fk) { setError('Selecciona un lote'); return }
    setSaving(true); setError('')
    const payload = {
      id_lote_fk:   Number(form.id_lote_fk),
      status:       form.status || null,
      no_escritura: form.no_escritura.trim() || null,
      notaria:      form.notaria ? Number(form.notaria) : null,
      notario:      form.notario.trim() || null,
      fecha:        form.fecha || null,
      propietario:  form.propietario.trim() || null,
    }
    const { error: err } = isNew
      ? await dbCtrl.from('escrituras').insert(payload)
      : await dbCtrl.from('escrituras').update(payload).eq('id', escritura.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>{isNew ? 'Nueva Escritura' : `Escritura ${escritura.no_escritura ?? ''}`}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13 }}>{error}</div>}

          <div>
            <label className="label">Lote *</label>
            <input className="input" placeholder="Busca clave de lote…" value={loteSearch}
              onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
            {lotes.length > 0 && (
              <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                {lotes.map((l: any) => (
                  <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }}
                    style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 15 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-700)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    {l.cve_lote ?? `#${l.lote}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Status</label>
              <select className="select" value={form.status} onChange={set('status')}>
                {STATUS_ESCRITURA.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="label">No. Escritura</label><input className="input" value={form.no_escritura} onChange={set('no_escritura')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">No. Notaría</label><input className="input" type="number" value={form.notaria} onChange={set('notaria')} /></div>
            <div><label className="label">Notario</label><input className="input" value={form.notario} onChange={set('notario')} /></div>
          </div>
          <FileUpload
            value={(form as any).pdf_escritura}
            onChange={url => setForm((f: any) => ({ ...f, pdf_escritura: url }))}
            accept="pdf"
            folder="escrituras"
            label="PDF de la Escritura"
            preview={false}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Fecha</label><input className="input" type="date" value={form.fecha} onChange={set('fecha')} /></div>
            <div><label className="label">Propietario</label><input className="input" value={form.propietario} onChange={set('propietario')} /></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}