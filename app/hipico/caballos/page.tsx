'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Search, RefreshCw, Edit2, Trash2, Eye, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 25

type CaballoCat = { id: number; clave: string; nombre: string | null }
type ArrendCat  = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }

export type Caballo = {
  id: number
  nombre: string
  registro: string | null
  raza: string | null
  color: string | null
  sexo: string | null
  fecha_nacimiento: string | null
  pais_origen: string | null
  chip: string | null
  id_arrendatario_fk: number | null
  id_caballeriza_fk: number | null
  fecha_ingreso: string | null
  fecha_salida: string | null
  status: string
  foto_url: string | null
  notas: string | null
  activo: boolean
  created_at: string
  // joins
  cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
  cat_caballerizas?: { clave: string; nombre: string | null }
}

const EMPTY = {
  nombre: '', registro: '', raza: '', color: '', sexo: 'Macho' as string,
  fecha_nacimiento: '', pais_origen: '', chip: '',
  id_arrendatario_fk: null as number | null,
  id_caballeriza_fk: null as number | null,
  fecha_ingreso: '', fecha_salida: '',
  status: 'Activo', foto_url: '', notas: '', activo: true,
}

const fmtNombreArr = (a?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }) => {
  if (!a) return '—'
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'Activo':        { bg: '#dcfce7', color: '#16a34a' },
  'Baja temporal': { bg: '#fef9c3', color: '#ca8a04' },
  'Dado de baja':  { bg: '#fee2e2', color: '#dc2626' },
}

const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function CaballosPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('hipico-caballos')
  const puedeEliminar = canDelete()

  const [items, setItems]       = useState<Caballo[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]     = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Caballo | null>(null)
  const [detailItem, setDetailItem] = useState<Caballo | null>(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState<typeof EMPTY>(EMPTY)
  const [err, setErr]           = useState('')

  const [arrendatarios, setArrendatarios] = useState<ArrendCat[]>([])
  const [caballerizas, setCaballerizas]   = useState<CaballoCat[]>([])

  useEffect(() => {
    dbHip.from('cat_arrendatarios').select('id, nombre, apellido_paterno, razon_social, tipo_persona').eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setArrendatarios(data ?? []))
    ;dbHip.from('cat_caballerizas').select('id, clave, nombre').eq('activo', true).order('clave')
      .then(({ data }: any) => setCaballerizas(data ?? []))
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = dbHip
      .from('cat_caballos')
      .select('*, cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), cat_caballerizas(clave, nombre)', { count: 'exact' })
      .order('nombre', { ascending: true })
      .range(from, to)
    if (search.trim()) {
      q = q.or(`nombre.ilike.%${search}%,raza.ilike.%${search}%,registro.ilike.%${search}%,chip.ilike.%${search}%`)
    }
    const { data, count } = await q
    setItems((data as Caballo[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openNew = () => { setForm(EMPTY); setEditItem(null); setErr(''); setShowModal(true) }
  const openEdit = (c: Caballo) => {
    setForm({
      nombre: c.nombre, registro: c.registro ?? '', raza: c.raza ?? '',
      color: c.color ?? '', sexo: c.sexo ?? 'Macho',
      fecha_nacimiento: c.fecha_nacimiento ?? '', pais_origen: c.pais_origen ?? '',
      chip: c.chip ?? '', id_arrendatario_fk: c.id_arrendatario_fk,
      id_caballeriza_fk: c.id_caballeriza_fk, fecha_ingreso: c.fecha_ingreso ?? '',
      fecha_salida: c.fecha_salida ?? '', status: c.status,
      foto_url: c.foto_url ?? '', notas: c.notas ?? '', activo: c.activo,
    })
    setEditItem(c); setErr(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { setErr('El nombre es obligatorio'); return }
    setSaving(true); setErr('')
    const payload = {
      nombre: form.nombre.trim(),
      registro: form.registro || null,
      raza: form.raza || null,
      color: form.color || null,
      sexo: form.sexo || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      pais_origen: form.pais_origen || null,
      chip: form.chip || null,
      id_arrendatario_fk: form.id_arrendatario_fk ?? null,
      id_caballeriza_fk: form.id_caballeriza_fk ?? null,
      fecha_ingreso: form.fecha_ingreso || null,
      fecha_salida: form.fecha_salida || null,
      status: form.status,
      notas: form.notas || null,
      activo: form.activo,
      updated_at: new Date().toISOString(),
    }
    let error
    if (editItem) {
      ;({ error } = await dbHip.from('cat_caballos').update(payload).eq('id', editItem.id))
    } else {
      ;({ error } = await dbHip.from('cat_caballos').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false)
    fetchItems()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este caballo?')) return
    setDeleting(id)
    await dbHip.from('cat_caballos').delete().eq('id', id)
    setDeleting(null)
    fetchItems()
  }

  const totalPags = Math.ceil(total / PAGE_SIZE)

  const Field = (label: string, key: keyof typeof form, opts?: { half?: boolean; type?: string }) => (
    <div style={{ gridColumn: opts?.half ? 'span 1' : 'span 2' }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input className="input" type={opts?.type ?? 'text'}
        value={(form[key] as string) ?? ''}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width: '100%' }} />
    </div>
  )

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link href="/hipico" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
          <ChevronLeft size={14} /> Hípico
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Caballos</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" placeholder="Buscar nombre, raza…" value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(0) } }}
              style={{ paddingLeft: 30, width: 200, fontSize: 12 }} />
          </div>
          <button className="btn-ghost" onClick={fetchItems}><RefreshCw size={13} /></button>
          {puedeEscribir && <button className="btn-primary" onClick={openNew}><Plus size={13} /> Nuevo</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        {total} caballo{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}
      </div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
              {['Nombre', 'Raza / Color', 'Arrendatario', 'Caballeriza', 'Ingreso', 'Status', ''].map(h => (
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
              const sc = STATUS_COLOR[c.status] ?? { bg: '#f8fafc', color: '#64748b' }
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.nombre}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {[c.raza, c.color].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{fmtNombreArr(c.cat_arrendatarios)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: 'var(--gold-light)', fontWeight: 600 }}>
                    {c.cat_caballerizas?.clave ?? '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{fmtFecha(c.fecha_ingreso)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{c.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setDetailItem(c)}><Eye size={13} /></button>
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

      {/* Detalle */}
      {detailItem && (
        <ModalShell modulo="hipico" titulo={detailItem.nombre} subtitulo={`${detailItem.raza ?? ''} · ${detailItem.status}`}
          onClose={() => setDetailItem(null)} maxWidth={520}
          footer={puedeEscribir ? <button className="btn-secondary" onClick={() => { setDetailItem(null); openEdit(detailItem) }}><Edit2 size={13} /> Editar</button> : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {([
              ['Registro', detailItem.registro],
              ['Raza', detailItem.raza],
              ['Color', detailItem.color],
              ['Sexo', detailItem.sexo],
              ['Nacimiento', fmtFecha(detailItem.fecha_nacimiento)],
              ['País de origen', detailItem.pais_origen],
              ['Microchip', detailItem.chip],
              ['Arrendatario', fmtNombreArr(detailItem.cat_arrendatarios)],
              ['Caballeriza', detailItem.cat_caballerizas ? `${detailItem.cat_caballerizas.clave}${detailItem.cat_caballerizas.nombre ? ' — ' + detailItem.cat_caballerizas.nombre : ''}` : null],
              ['Fecha ingreso', fmtFecha(detailItem.fecha_ingreso)],
              ['Fecha salida', fmtFecha(detailItem.fecha_salida)],
              ['Notas', detailItem.notas],
            ] as [string, string | null][]).map(([label, val]) => val && val !== '—' ? (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' }}>{val}</span>
              </div>
            ) : null)}
          </div>
        </ModalShell>
      )}

      {/* Form modal */}
      {showModal && (
        <ModalShell modulo="hipico" titulo={editItem ? `Editar — ${editItem.nombre}` : 'Nuevo Caballo'}
          onClose={() => setShowModal(false)} maxWidth={620}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Field('Nombre *', 'nombre', { half: true })}
            {Field('Registro (FMCH)', 'registro', { half: true })}
            {Field('Raza', 'raza', { half: true })}
            {Field('Color', 'color', { half: true })}

            {/* Sexo */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Sexo</label>
              <select className="input" value={form.sexo} onChange={e => setForm(f => ({ ...f, sexo: e.target.value }))} style={{ width: '100%' }}>
                {['Macho', 'Hembra', 'Castrado'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {Field('País de Origen', 'pais_origen', { half: true })}
            {Field('Fecha de Nacimiento', 'fecha_nacimiento', { half: true, type: 'date' })}
            {Field('Microchip', 'chip', { half: true })}

            {/* Arrendatario */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Arrendatario</label>
              <select className="input" value={form.id_arrendatario_fk ?? ''} onChange={e => setForm(f => ({ ...f, id_arrendatario_fk: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%' }}>
                <option value="">— Sin asignar —</option>
                {arrendatarios.map(a => (
                  <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>
                ))}
              </select>
            </div>

            {/* Caballeriza */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Caballeriza</label>
              <select className="input" value={form.id_caballeriza_fk ?? ''} onChange={e => setForm(f => ({ ...f, id_caballeriza_fk: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%' }}>
                <option value="">— Sin asignar —</option>
                {caballerizas.map(c => (
                  <option key={c.id} value={c.id}>{c.clave}{c.nombre ? ` — ${c.nombre}` : ''}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: '100%' }}>
                {['Activo', 'Baja temporal', 'Dado de baja'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {Field('Fecha Ingreso', 'fecha_ingreso', { half: true, type: 'date' })}
            {Field('Fecha Salida', 'fecha_salida', { half: true, type: 'date' })}

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea className="input" rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
            </div>

            {err && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
