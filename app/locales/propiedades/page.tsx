'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Search, RefreshCw, Edit2, Trash2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 25

type Propiedad = {
  id: number
  clave: string
  nombre: string | null
  ubicacion: string | null
  tipo: string | null
  metros2: number | null
  status: string
  activo: boolean
  notas: string | null
  id_concepto_ingreso_fk: number | null
  created_at: string
}

const EMPTY: Omit<Propiedad, 'id' | 'created_at'> = {
  clave: '', nombre: '', ubicacion: '', tipo: 'Local Comercial', metros2: null, status: 'Libre', activo: true, notas: '',
  id_concepto_ingreso_fk: null,
}

const TIPOS = ['Local Comercial', 'Oficina', 'Bodega', 'Terreno', 'Otro']
const STATUSES = ['Libre', 'Rentada', 'Ocupada', 'Mantenimiento', 'Bloqueada']

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'Libre':         { bg: '#dcfce7', color: '#16a34a' },
  'Rentada':       { bg: '#dbeafe', color: '#1d4ed8' },
  'Ocupada':       { bg: '#fef9c3', color: '#b45309' },
  'Mantenimiento': { bg: '#f3e8ff', color: '#7c3aed' },
  'Bloqueada':     { bg: '#fee2e2', color: '#dc2626' },
}

export default function PropiedadesPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('locales')
  const puedeEliminar = canDelete()

  const [items, setItems]       = useState<Propiedad[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]         = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Propiedad | null>(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState<Omit<Propiedad, 'id' | 'created_at'>>(EMPTY)
  const [err, setErr]           = useState('')
  const [kpis, setKpis] = useState({ libres: 0, rentadas: 0, ocupadas: 0, mantenimiento: 0 })
  const [conceptosIngreso, setConceptosIngreso] = useState<{ id: number; nombre: string }[]>([])

  useEffect(() => {
    const fetchConceptos = async () => {
      const { data: centros } = await dbCfg.from('centros_ingreso').select('id, nombre').eq('activo', true)
      const centroLoc = ((centros ?? []) as { id: number; nombre: string }[])
        .find(c => c.nombre.toLowerCase().includes('local'))
      const q = dbCfg.from('conceptos_ingreso').select('id, nombre').eq('activo', true).order('nombre')
      const { data: cons } = centroLoc ? await q.eq('id_centro_ingreso_fk', centroLoc.id) : await q
      setConceptosIngreso((cons as { id: number; nombre: string }[]) ?? [])
    }
    fetchConceptos()
  }, [])

  const naturalSort = (a: string, b: string) =>
    a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl
      .from('loc_propiedades')
      .select('*')
    if (search.trim()) {
      q = q.or(`clave.ilike.%${search}%,nombre.ilike.%${search}%,ubicacion.ilike.%${search}%`)
    }
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data } = await q
    const sorted = ((data as Propiedad[]) ?? []).sort((a, b) => naturalSort(a.clave, b.clave))
    setTotal(sorted.length)
    setItems(sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))
    setKpis({
      libres: sorted.filter(x => x.status === 'Libre').length,
      rentadas: sorted.filter(x => x.status === 'Rentada').length,
      ocupadas: sorted.filter(x => x.status === 'Ocupada').length,
      mantenimiento: sorted.filter(x => x.status === 'Mantenimiento').length,
    })
    setLoading(false)
  }, [page, search, filtroStatus])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openNew = () => { setForm(EMPTY); setEditItem(null); setErr(''); setShowModal(true) }
  const openEdit = (c: Propiedad) => { setForm({ ...c }); setEditItem(c); setErr(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.clave.trim()) { setErr('La clave es obligatoria'); return }
    setSaving(true); setErr('')
    const payload = {
      clave: form.clave.trim().toUpperCase(),
      nombre: form.nombre || null,
      ubicacion: form.ubicacion || null,
      tipo: form.tipo || 'Local Comercial',
      metros2: form.metros2 ?? null,
      status: form.status || 'Libre',
      activo: form.activo,
      notas: form.notas || null,
      id_concepto_ingreso_fk: form.id_concepto_ingreso_fk || null,
    }
    let error
    if (editItem) {
      ;({ error } = await dbCtrl.from('loc_propiedades').update(payload).eq('id', editItem.id))
    } else {
      ;({ error } = await dbCtrl.from('loc_propiedades').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false)
    fetchItems()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta propiedad?')) return
    setDeleting(id)
    await dbCtrl.from('loc_propiedades').delete().eq('id', id)
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
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/locales" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
              <ChevronLeft size={14} /> Locales
            </Link>
          </div>
          <h1 className="page-title-xl" style={{ marginBottom: 4 }}>Locales / Propiedades</h1>
          <p className="page-subtitle">Disponibilidad, ubicación y control de estatus</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={fetchItems}><RefreshCw size={13} /></button>
          {puedeEscribir && <button className="btn-primary" onClick={openNew}><Plus size={13} /> Nueva</button>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(120px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Total', value: total, color: '#1d4ed8', bg: '#eff6ff' },
          { label: 'Libres', value: kpis.libres, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Rentadas', value: kpis.rentadas, color: '#1d4ed8', bg: '#eff6ff' },
          { label: 'Ocupadas', value: kpis.ocupadas, color: '#b45309', bg: '#fffbeb' },
          { label: 'Mantenimiento', value: kpis.mantenimiento, color: '#7c3aed', bg: '#f5f3ff' },
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
          <input className="input" placeholder="Buscar clave o ubicación…" value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }}
            style={{ paddingLeft: 30, width: 220, fontSize: 12 }} />
        </div>
        <select className="input" value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(0) }} style={{ width: 170, fontSize: 12 }}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
              {['Clave', 'Nombre', 'Ubicación', 'Tipo', 'Metros²', 'Status', ''].map(h => (
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
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f766e', fontFamily: 'monospace' }}>{c.clave}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{c.nombre ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{c.ubicacion ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{c.tipo ?? 'Local Comercial'}</td>
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
        <ModalShell modulo="locales" titulo={editItem ? `Editar — ${editItem.clave}` : 'Nueva Propiedad'}
          onClose={() => setShowModal(false)} maxWidth={500}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {F('Clave *  (ej: L-01)', 'clave', { half: true })}
            {F('Nombre', 'nombre', { half: true })}
            {F('Ubicación', 'ubicacion', { half: true })}

            {/* Tipo */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select className="input" value={form.tipo ?? 'Local Comercial'} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: '100%' }}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
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
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Concepto de Ingreso</label>
              <select className="input" value={form.id_concepto_ingreso_fk ?? ''}
                onChange={e => setForm(f => ({ ...f, id_concepto_ingreso_fk: e.target.value ? Number(e.target.value) : null }))}
                style={{ width: '100%' }}>
                <option value="">— Usar el concepto global de Locales —</option>
                {conceptosIngreso.map(co => <option key={co.id} value={co.id}>{co.nombre}</option>)}
              </select>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                Para que los tickets POS de esta renta se distribuyan a su propia partida de presupuesto en vez de caer en el concepto general
              </div>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea className="input" rows={2} value={form.notas ?? ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="activo-prop" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
              <label htmlFor="activo-prop" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Activa</label>
            </div>

            {err && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
