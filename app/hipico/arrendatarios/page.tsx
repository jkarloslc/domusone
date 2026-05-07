'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Search, RefreshCw, Edit2, Trash2, Eye, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 25

export type Arrendatario = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  razon_social: string | null
  tipo_persona: string
  rfc: string | null
  email: string | null
  telefono: string | null
  telefono_alt: string | null
  direccion: string | null
  contacto_emergencia: string | null
  telefono_emergencia: string | null
  notas: string | null
  activo: boolean
  created_at: string
}

const EMPTY: Omit<Arrendatario, 'id' | 'created_at'> = {
  nombre: '', apellido_paterno: '', apellido_materno: '', razon_social: '',
  tipo_persona: 'Física', rfc: '', email: '', telefono: '', telefono_alt: '',
  direccion: '', contacto_emergencia: '', telefono_emergencia: '', notas: '', activo: true,
}

const fmtNombre = (a: Arrendatario) =>
  a.tipo_persona === 'Moral' && a.razon_social
    ? a.razon_social
    : [a.nombre, a.apellido_paterno, a.apellido_materno].filter(Boolean).join(' ')

export default function ArrendatariosPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('hipico-arrendatarios')
  const puedeEliminar = canDelete()

  const [items, setItems]           = useState<Arrendatario[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [search, setSearch]         = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroActivo, setFiltroActivo] = useState('')
  const [loading, setLoading]       = useState(true)
  const [deleting, setDeleting]     = useState<number | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [editItem, setEditItem]     = useState<Arrendatario | null>(null)
  const [detailItem, setDetailItem] = useState<Arrendatario | null>(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState<Omit<Arrendatario, 'id' | 'created_at'>>(EMPTY)
  const [err, setErr]               = useState('')
  const [kpis, setKpis] = useState({ activos: 0, inactivos: 0, morales: 0, fisicas: 0 })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = dbHip
      .from('cat_arrendatarios')
      .select('*', { count: 'exact' })
      .order('apellido_paterno', { ascending: true })
      .order('nombre', { ascending: true })
      .range(from, to)
    let kpiQ = dbHip
      .from('cat_arrendatarios')
      .select('activo, tipo_persona')
    if (search.trim()) {
      q = q.or(`nombre.ilike.%${search}%,apellido_paterno.ilike.%${search}%,razon_social.ilike.%${search}%,email.ilike.%${search}%,telefono.ilike.%${search}%`)
      kpiQ = kpiQ.or(`nombre.ilike.%${search}%,apellido_paterno.ilike.%${search}%,razon_social.ilike.%${search}%,email.ilike.%${search}%,telefono.ilike.%${search}%`)
    }
    if (filtroTipo) {
      q = q.eq('tipo_persona', filtroTipo)
      kpiQ = kpiQ.eq('tipo_persona', filtroTipo)
    }
    if (filtroActivo) {
      const esActivo = filtroActivo === 'true'
      q = q.eq('activo', esActivo)
      kpiQ = kpiQ.eq('activo', esActivo)
    }
    const [{ data, count }, { data: kpiData }] = await Promise.all([q, kpiQ])
    setItems((data as Arrendatario[]) ?? [])
    setTotal(count ?? 0)
    const all = (kpiData ?? []) as { activo: boolean; tipo_persona: string }[]
    setKpis({
      activos: all.filter(x => x.activo).length,
      inactivos: all.filter(x => !x.activo).length,
      morales: all.filter(x => x.tipo_persona === 'Moral').length,
      fisicas: all.filter(x => x.tipo_persona !== 'Moral').length,
    })
    setLoading(false)
  }, [page, search, filtroTipo, filtroActivo])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openNew = () => { setForm(EMPTY); setEditItem(null); setErr(''); setShowModal(true) }
  const openEdit = (a: Arrendatario) => {
    setForm({ ...a })
    setEditItem(a)
    setErr('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { setErr('El nombre es obligatorio'); return }
    setSaving(true); setErr('')
    const payload = {
      nombre: form.nombre.trim(),
      apellido_paterno: form.apellido_paterno || null,
      apellido_materno: form.apellido_materno || null,
      razon_social: form.tipo_persona === 'Moral' ? (form.razon_social || null) : null,
      tipo_persona: form.tipo_persona,
      rfc: form.rfc || null,
      email: form.email || null,
      telefono: form.telefono || null,
      telefono_alt: form.telefono_alt || null,
      direccion: form.direccion || null,
      contacto_emergencia: form.contacto_emergencia || null,
      telefono_emergencia: form.telefono_emergencia || null,
      notas: form.notas || null,
      activo: form.activo,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editItem) {
      ;({ error } = await dbHip.from('cat_arrendatarios').update(payload).eq('id', editItem.id))
    } else {
      ;({ error } = await dbHip.from('cat_arrendatarios').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false)
    fetchItems()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este arrendatario?')) return
    setDeleting(id)
    await dbHip.from('cat_arrendatarios').delete().eq('id', id)
    setDeleting(null)
    fetchItems()
  }

  const F = (label: string, key: keyof typeof form, opts?: { half?: boolean; area?: boolean }) => (
    <div style={{ gridColumn: opts?.half ? 'span 1' : 'span 2' }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {opts?.area
        ? <textarea value={(form[key] as string) ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className="input" rows={3} style={{ resize: 'vertical', width: '100%' }} />
        : <input className="input" value={(form[key] as string) ?? ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: '100%' }} />
      }
    </div>
  )

  const totalPags = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '24px 28px' }}>
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/hipico" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
              <ChevronLeft size={14} /> Hípico
            </Link>
          </div>
          <h1 className="page-title-xl" style={{ marginBottom: 4 }}>Arrendatarios</h1>
          <p className="page-subtitle">Padrón de arrendatarios con información fiscal y contacto</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={fetchItems}><RefreshCw size={13} /></button>
          {puedeEscribir && <button className="btn-primary" onClick={openNew}><Plus size={13} /> Nuevo</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Total', value: total, color: '#1d4ed8', bg: '#eff6ff' },
          { label: 'Activos', value: kpis.activos, color: '#15803d', bg: '#f0fdf4' },
          { label: 'Inactivos', value: kpis.inactivos, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Persona Física', value: kpis.fisicas, color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Persona Moral', value: kpis.morales, color: '#a16207', bg: '#fefce8' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 14px', background: k.bg }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input" placeholder="Buscar..." value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }}
            style={{ paddingLeft: 30, width: 220, fontSize: 12 }}
          />
        </div>
        <select className="input" value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPage(0) }} style={{ width: 170, fontSize: 12 }}>
          <option value="">Todos los tipos</option>
          <option value="Física">Persona Física</option>
          <option value="Moral">Persona Moral</option>
        </select>
        <select className="input" value={filtroActivo} onChange={e => { setFiltroActivo(e.target.value); setPage(0) }} style={{ width: 150, fontSize: 12 }}>
          <option value="">Todos</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
              {['Nombre / Razón Social', 'RFC', 'Teléfono', 'Email', 'Tipo', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : items.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-primary)' }}>{fmtNombre(a)}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{a.rfc ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{a.telefono ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{a.email ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{a.tipo_persona}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                    background: a.activo ? '#dcfce7' : '#fee2e2',
                    color: a.activo ? '#16a34a' : '#dc2626',
                  }}>{a.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setDetailItem(a)}><Eye size={13} /></button>
                    {puedeEscribir && <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => openEdit(a)}><Edit2 size={13} /></button>}
                    {puedeEliminar && <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} disabled={deleting === a.id} onClick={() => handleDelete(a.id)}><Trash2 size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPags > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Pág. {page + 1} / {totalPags}</span>
          <button className="btn-ghost" disabled={page >= totalPags - 1} onClick={() => setPage(p => p + 1)}>Siguiente</button>
        </div>
      )}

      {/* Modal detalle */}
      {detailItem && (
        <ModalShell modulo="hipico" titulo={fmtNombre(detailItem)} subtitulo={`${detailItem.tipo_persona} · ${detailItem.activo ? 'Activo' : 'Inactivo'}`}
          onClose={() => setDetailItem(null)} maxWidth={500}
          footer={puedeEscribir ? <button className="btn-secondary" onClick={() => { setDetailItem(null); openEdit(detailItem) }}><Edit2 size={13} /> Editar</button> : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['RFC', detailItem.rfc],
              ['Teléfono', detailItem.telefono],
              ['Tel. alternativo', detailItem.telefono_alt],
              ['Email', detailItem.email],
              ['Dirección', detailItem.direccion],
              ['Contacto emergencia', detailItem.contacto_emergencia],
              ['Tel. emergencia', detailItem.telefono_emergencia],
              ['Notas', detailItem.notas],
            ].map(([label, val]) => val ? (
              <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' }}>{val}</span>
              </div>
            ) : null)}
          </div>
        </ModalShell>
      )}

      {/* Modal form */}
      {showModal && (
        <ModalShell modulo="hipico" titulo={editItem ? 'Editar Arrendatario' : 'Nuevo Arrendatario'}
          onClose={() => setShowModal(false)} maxWidth={600}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Tipo persona */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo Persona</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['Física', 'Moral'].map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, tipo_persona: t }))}
                    className={form.tipo_persona === t ? 'btn-primary' : 'btn-ghost'}
                    style={{ flex: 1, fontSize: 12, padding: '6px 0' }}
                  >{t}</button>
                ))}
              </div>
            </div>

            {form.tipo_persona === 'Física' ? (
              <>
                {F('Nombre *', 'nombre', { half: false })}
                {F('Apellido Paterno', 'apellido_paterno', { half: true })}
                {F('Apellido Materno', 'apellido_materno', { half: true })}
              </>
            ) : (
              <>
                {F('Razón Social', 'razon_social')}
                {F('Nombre Representante', 'nombre', { half: true })}
                {F('Apellido Paterno', 'apellido_paterno', { half: true })}
              </>
            )}

            {F('RFC', 'rfc', { half: true })}
            {F('Email', 'email', { half: true })}
            {F('Teléfono', 'telefono', { half: true })}
            {F('Tel. Alternativo', 'telefono_alt', { half: true })}
            {F('Dirección', 'direccion')}
            {F('Contacto Emergencia', 'contacto_emergencia', { half: true })}
            {F('Tel. Emergencia', 'telefono_emergencia', { half: true })}
            {F('Notas', 'notas', { area: true })}

            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="activo-arr" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
              <label htmlFor="activo-arr" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Activo</label>
            </div>

            {err && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
