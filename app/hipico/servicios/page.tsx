'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, Edit2, Trash2, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 30

type CaballoCat    = { id: number; nombre: string }
type ArrendCat     = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
type TipoServCat   = { id: number; nombre: string; tipo: string }

type Servicio = {
  id: number
  id_caballo_fk: number
  id_arrendatario_fk: number
  id_tipo_servicio_fk: number | null
  tipo: string
  descripcion: string
  fecha: string
  proveedor: string | null
  costo: number | null
  cobrar_arrendatario: boolean
  notas: string | null
  created_at: string
  cat_caballos?: { nombre: string }
  cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
  cat_tipos_servicio?: { nombre: string }
}

const TIPO_ICON: Record<string, string> = {
  'veterinario': '🩺',
  'herraje':     '🔨',
  'alimento':    '🌾',
  'otro':        '📋',
}

const TIPO_COLOR: Record<string, { bg: string; color: string }> = {
  'veterinario': { bg: '#ecfeff', color: '#0891b2' },
  'herraje':     { bg: '#fffbeb', color: '#b45309' },
  'alimento':    { bg: '#f0fdf4', color: '#16a34a' },
  'otro':        { bg: '#f8fafc', color: '#64748b' },
}

const EMPTY = {
  id_caballo_fk: null as number | null,
  id_arrendatario_fk: null as number | null,
  id_tipo_servicio_fk: null as number | null,
  tipo: 'veterinario',
  descripcion: '', fecha: new Date().toISOString().split('T')[0],
  proveedor: '', costo: null as number | null, cobrar_arrendatario: false, notas: '',
}

const fmtNombreArr = (a?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }) => {
  if (!a) return '—'
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}

const fmt$ = (v: number | null) => v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

export default function ServiciosPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('hipico-servicios')
  const puedeEliminar = canDelete()

  const [items, setItems]       = useState<Servicio[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState<typeof EMPTY>(EMPTY)
  const [err, setErr]           = useState('')

  const [caballos, setCaballos]       = useState<CaballoCat[]>([])
  const [arrendatarios, setArrendatarios] = useState<ArrendCat[]>([])
  const [tiposServ, setTiposServ]     = useState<TipoServCat[]>([])
  const [tiposFiltrados, setTiposFiltrados] = useState<TipoServCat[]>([])

  useEffect(() => {
    dbHip.from('cat_caballos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }: any) => setCaballos(data ?? []))
    ;dbHip.from('cat_arrendatarios').select('id, nombre, apellido_paterno, razon_social, tipo_persona').eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setArrendatarios(data ?? []))
    ;dbHip.from('cat_tipos_servicio').select('id, nombre, tipo').eq('activo', true).order('nombre')
      .then(({ data }: any) => {
        // Deduplicar por nombre+tipo (por si hay duplicados en BD)
        const seen = new Set<string>()
        const unique = (data ?? []).filter((t: TipoServCat) => {
          const key = `${t.tipo}|${t.nombre.trim().toLowerCase()}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setTiposServ(unique)
      })
  }, [])

  // Filtrar tipos por el tipo seleccionado en el form
  useEffect(() => {
    setTiposFiltrados(tiposServ.filter(t => t.tipo === form.tipo))
    setForm(f => ({ ...f, id_tipo_servicio_fk: null }))
  }, [form.tipo, tiposServ])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = dbHip
      .from('ctrl_servicios')
      .select('*, cat_caballos(nombre), cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), cat_tipos_servicio(nombre)', { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(from, to)
    if (filtroTipo) q = q.eq('tipo', filtroTipo)
    const { data, count } = await q
    setItems((data as Servicio[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, filtroTipo])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openNew = () => { setForm(EMPTY); setErr(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.id_caballo_fk)         { setErr('Selecciona un caballo'); return }
    if (!form.id_arrendatario_fk)    { setErr('Selecciona un arrendatario'); return }
    if (!form.descripcion.trim())    { setErr('La descripción es obligatoria'); return }
    setSaving(true); setErr('')
    const payload = {
      id_caballo_fk: form.id_caballo_fk,
      id_arrendatario_fk: form.id_arrendatario_fk,
      id_tipo_servicio_fk: form.id_tipo_servicio_fk ?? null,
      tipo: form.tipo,
      descripcion: form.descripcion.trim(),
      fecha: form.fecha,
      proveedor: form.proveedor || null,
      costo: form.costo ?? null,
      cobrar_arrendatario: form.cobrar_arrendatario,
      notas: form.notas || null,
    }
    const { error } = await dbHip.from('ctrl_servicios').insert(payload)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false)
    fetchItems()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return
    setDeleting(id)
    await dbHip.from('ctrl_servicios').delete().eq('id', id)
    setDeleting(null)
    fetchItems()
  }

  const totalPags = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link href="/hipico" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
          <ChevronLeft size={14} /> Hípico
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Bitácora de Servicios</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <select className="input" value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPage(0) }} style={{ fontSize: 12 }}>
            <option value="">Todos los tipos</option>
            {['veterinario', 'herraje', 'alimento', 'otro'].map(t => (
              <option key={t} value={t}>{TIPO_ICON[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <button className="btn-ghost" onClick={fetchItems}><RefreshCw size={13} /></button>
          {puedeEscribir && <button className="btn-primary" onClick={openNew}><Plus size={13} /> Registrar</button>}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{total} registro{total !== 1 ? 's' : ''}</div>

      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
              {['Fecha', 'Tipo', 'Caballo', 'Arrendatario', 'Descripción', 'Proveedor', 'Costo', ''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : items.map((s, i) => {
              const tc = TIPO_COLOR[s.tipo] ?? { bg: '#f8fafc', color: '#64748b' }
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtFecha(s.fecha)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: tc.bg, color: tc.color }}>
                      {TIPO_ICON[s.tipo]} {s.tipo}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-primary)' }}>{s.cat_caballos?.nombre ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{fmtNombreArr(s.cat_arrendatarios)}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: 200 }}>{s.descripcion}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{s.proveedor ?? '—'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt$(s.costo)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {puedeEliminar && (
                      <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} disabled={deleting === s.id} onClick={() => handleDelete(s.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
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

      {/* Modal */}
      {showModal && (
        <ModalShell modulo="hipico" titulo="Registrar Servicio" onClose={() => setShowModal(false)} maxWidth={580}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Tipo */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Tipo de Servicio</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['veterinario', 'herraje', 'alimento', 'otro'].map(t => {
                  const tc = TIPO_COLOR[t]
                  return (
                    <button key={t} onClick={() => setForm(f => ({ ...f, tipo: t }))}
                      style={{
                        flex: 1, padding: '8px 4px', borderRadius: 8, border: `1px solid ${form.tipo === t ? tc.color : 'var(--border)'}`,
                        background: form.tipo === t ? tc.bg : 'var(--surface-800)', cursor: 'pointer',
                        fontSize: 12, color: form.tipo === t ? tc.color : 'var(--text-muted)',
                        fontWeight: form.tipo === t ? 600 : 400,
                      }}>
                      {TIPO_ICON[t]}<br />{t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Caballo */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Caballo *</label>
              <select className="input" value={form.id_caballo_fk ?? ''} onChange={e => setForm(f => ({ ...f, id_caballo_fk: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%' }}>
                <option value="">— Seleccionar —</option>
                {caballos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            {/* Arrendatario */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Arrendatario *</label>
              <select className="input" value={form.id_arrendatario_fk ?? ''} onChange={e => setForm(f => ({ ...f, id_arrendatario_fk: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%' }}>
                <option value="">— Seleccionar —</option>
                {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>)}
              </select>
            </div>

            {/* Tipo servicio específico */}
            {tiposFiltrados.length > 0 && (
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo específico</label>
                <select className="input" value={form.id_tipo_servicio_fk ?? ''} onChange={e => {
                  const ts = tiposServ.find(t => t.id === Number(e.target.value))
                  setForm(f => ({ ...f, id_tipo_servicio_fk: e.target.value ? Number(e.target.value) : null, descripcion: ts?.nombre ?? f.descripcion }))
                }} style={{ width: '100%' }}>
                  <option value="">— Genérico —</option>
                  {tiposFiltrados.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
            )}

            {/* Descripción */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Descripción *</label>
              <input className="input" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} style={{ width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Proveedor / Médico</label>
              <input className="input" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} style={{ width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Costo</label>
              <input className="input" type="number" value={form.costo ?? ''} onChange={e => setForm(f => ({ ...f, costo: e.target.value === '' ? null : Number(e.target.value) }))} style={{ width: '100%' }} />
            </div>

            <div style={{ gridColumn: 'span 1', display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
              <input type="checkbox" id="cobrar-arrendatario" checked={form.cobrar_arrendatario} onChange={e => setForm(f => ({ ...f, cobrar_arrendatario: e.target.checked }))} />
              <label htmlFor="cobrar-arrendatario" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Cobrar al arrendatario</label>
            </div>

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
