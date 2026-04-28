'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Search, RefreshCw, Edit2, Trash2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 25

type Caballeriza = {
  id: number
  clave: string
  nombre: string | null
  seccion: string | null
  tipo: string | null
  metros2: number | null
  status: string
  activo: boolean
  notas: string | null
  created_at: string
}

const EMPTY: Omit<Caballeriza, 'id' | 'created_at'> = {
  clave: '', nombre: '', seccion: '', tipo: 'Box', metros2: null, status: 'Libre', activo: true, notas: '',
}

const STATUSES = ['Libre', 'Rentada', 'Ocupada', 'Mantenimiento', 'Bloqueada']

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'Libre':         { bg: '#dcfce7', color: '#16a34a' },
  'Rentada':       { bg: '#dbeafe', color: '#1d4ed8' },
  'Ocupada':       { bg: '#fef9c3', color: '#b45309' },
  'Mantenimiento': { bg: '#f3e8ff', color: '#7c3aed' },
  'Bloqueada':     { bg: '#fee2e2', color: '#dc2626' },
}

export default function CaballerizasPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('hipico-caballerizas')
  const puedeEliminar = canDelete()

  const [items, setItems]       = useState<Caballeriza[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]         = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Caballeriza | null>(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState<Omit<Caballeriza, 'id' | 'created_at'>>(EMPTY)
  const [err, setErr]           = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = dbHip
      .from('cat_caballerizas')
      .select('*', { count: 'exact' })
      .order('clave', { ascending: true })
      .range(from, to)
    if (search.trim()) {
      q = q.or(`clave.ilike.%${search}%,nombre.ilike.%${search}%,seccion.ilike.%${search}%`)
    }
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data, count } = await q
    setItems((data as Caballeriza[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search, filtroStatus])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openNew = () => { setForm(EMPTY); setEditItem(null); setErr(''); setShowModal(true) }
  const openEdit = (c: Caballeriza) => { setForm({ ...c }); setEditItem(c); setErr(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.clave.trim()) { setErr('La clave es obligatoria'); return }
    setSaving(true); setErr('')
    const payload = {
      clave: form.clave.trim().toUpperCase(),
      nombre: form.nombre || null,
      seccion: form.seccion || null,
      tipo: form.tipo || 'Box',
      metros2: form.metros2 ?? null,
      status: form.status || 'Libre',
      activo: form.activo,
      notas: form.notas || null,
    }
    let error
    if (editItem) {
      ;({ error } = await dbHip.from('cat_caballerizas').update(payload).eq('id', editItem.id))
    } else {
      ;({ error } = await dbHip.from('cat_caballerizas').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false)
    fetchItems()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta caballeriza?')) return
    setDeleting(id)
    await dbHip.from('cat_caballerizas').delete().eq('id', id)
    setDeleting(null)
    fetchItems()
  }

  const F = (label: string, key: keyof typeof form, opts?: { half?: boolean; type?: string }) => (
    <div style={{ gridColumn: opts?.half ? 'span 1' : 'span 2' }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input className="input" type={opts?.type ?? 'text'}
        value={(form[key] as string | number) ?? ''}
        onChange={e => setForm(f => ({ ...f, [key]: opts?.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value }))}
        style={{ width: '100%' }} />
    </div>
  )

  const totalPags = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link href="/hipico" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
          <ChevronLeft size={14} /> Hípico
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Caballerizas</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" placeholder="Buscar clave o sección…" value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }}
              style={{ paddingLeft: 30, width: 200, fontSize: 12 }} />
          </div>
          <select className="input" value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(0) }} style={{ width: 150, fontSize: 12 }}>
            <option value="">Todos los status</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-ghost" onClick={fetchItems}><RefreshCw size={13} /></button>
          {puedeEscribir && <button className="btn-primary" onClick={openNew}><Plus size={13} /> Nueva</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        {total} caballeriza{total !== 1 ? 's' : ''} registrada{total !== 1 ? 's' : ''}
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
              {['Clave', 'Nombre', 'Sección', 'Tipo', 'Metros²', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : items.map((c, i) => {
              const sc = STATUS_COLOR[c.status] ?? { bg: '#f1f5f9', color: '#64748b' }
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--gold-light)', fontFamily: 'monospace' }}>{c.clave}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{c.nombre ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{c.seccion ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{c.tipo ?? 'Box'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{c.metros2 ?? '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>
                      {c.status ?? 'Libre'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {puedeEscribir && <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => openEdit(c)}><Edit2 size={13} /></button>}
                      {puedeEliminar && <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} disabled={deleting === c.id} onClick={() => handleDelete(c.id)}><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPags > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Pág. {page + 1} / {totalPags}</span>
          <button className="btn-ghost" disabled={page >= totalPags - 1} onClick={() => setPage(p => p + 1)}>Siguiente</button>
        </div>
      )}

      {showModal && (
        <ModalShell modulo="hipico" titulo={editItem ? `Editar — ${editItem.clave}` : 'Nueva Caballeriza'}
          onClose={() => setShowModal(false)} maxWidth={500}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {F('Clave *  (ej: A-01)', 'clave', { half: true })}
            {F('Nombre', 'nombre', { half: true })}
            {F('Sección', 'seccion', { half: true })}

            {/* Tipo */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select className="input" value={form.tipo ?? 'Box'} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: '100%' }}>
                {['Box', 'Patio', 'Paddock', 'Otro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            {/* Status */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%' }}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {F('Metros²', 'metros2', { half: true, type: 'number' })}

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea className="input" rows={2} value={form.notas ?? ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="activo-cab" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
              <label htmlFor="activo-cab" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Activa</label>
            </div>

            {err && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
