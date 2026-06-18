'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { ChevronLeft, Plus, Edit2, ToggleLeft, ToggleRight, Save, X, Loader, BookOpen, MapPin, Flag, Tag, DollarSign, Store } from 'lucide-react'
import Link from 'next/link'
import CuotasConfigPanel from '@/components/golf/CuotasConfigPanel'

// ── Estilos comunes ──────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block',
}
const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer',
}

// ── Componente genérico de catálogo ──────────────────────────
type CatItem = { id: number; nombre: string; descripcion?: string | null; activo: boolean }
type CatField = { key: 'nombre' | 'descripcion'; label: string; required?: boolean; placeholder?: string }

function CatalogoTab({ tabla, campos, puedeEscribir }: {
  tabla: string; campos: CatField[]; puedeEscribir: boolean
}) {
  const [items, setItems]       = useState<CatItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<CatItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState<{ nombre: string; descripcion: string }>({ nombre: '', descripcion: '' })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await dbGolf.from(tabla).select('id, nombre, descripcion, activo').order('nombre')
    setItems((data as CatItem[]) ?? [])
    setLoading(false)
  }, [tabla])

  useEffect(() => { fetchItems() }, [fetchItems])

  const openNew = () => {
    setEditing(null); setForm({ nombre: '', descripcion: '' }); setError(''); setShowForm(true)
  }
  const openEdit = (item: CatItem) => {
    setEditing(item); setForm({ nombre: item.nombre, descripcion: item.descripcion ?? '' }); setError(''); setShowForm(true)
  }
  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload: any = { nombre: form.nombre.trim() }
    if (campos.some(c => c.key === 'descripcion')) payload.descripcion = form.descripcion || null
    if (editing) {
      const { error: err } = await dbGolf.from(tabla).update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      payload.activo = true
      const { error: err } = await dbGolf.from(tabla).insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false); fetchItems()
  }
  const toggleActivo = async (item: CatItem) => {
    await dbGolf.from(tabla).update({ activo: !item.activo }).eq('id', item.id); fetchItems()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>{items.length} registros</span>
        {puedeEscribir && (
          <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Nuevo
          </button>
        )}
      </div>
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{editing ? 'Editar' : 'Nuevo registro'}</span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {campos.map(c => (
              <div key={c.key}>
                <label style={labelStyle}>{c.label}{c.required && ' *'}</label>
                <input style={inputStyle} value={form[c.key] ?? ''} onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))} placeholder={c.placeholder} autoFocus={c.key === 'nombre'} />
              </div>
            ))}
            {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                {editing ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Sin registros. Crea el primero.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre</th>
                {campos.some(c => c.key === 'descripcion') && (
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Descripción</th>
                )}
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estatus</th>
                {puedeEscribir && <th style={{ padding: '10px 16px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: item.activo ? 1 : 0.5 }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#1e293b' }}>{item.nombre}</td>
                  {campos.some(c => c.key === 'descripcion') && (
                    <td style={{ padding: '10px 16px', color: '#64748b', fontSize: 12 }}>{item.descripcion ?? '—'}</td>
                  )}
                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: item.activo ? '#dcfce7' : '#f1f5f9', color: item.activo ? '#16a34a' : '#94a3b8' }}>
                      {item.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {puedeEscribir && (
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Editar" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                        <button className="btn-ghost" style={{ padding: '4px 8px', color: item.activo ? '#dc2626' : '#16a34a' }} title={item.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(item)}>
                          {item.activo ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Tab de Cuotas de Golf ─────────────────────────────────────
function CuotasTab({ puedeEscribir }: { puedeEscribir: boolean }) {
  return <CuotasConfigPanel puedeEscribir={puedeEscribir} />
}

// ── Tab Centros de Venta POS ──────────────────────────────────
type CentroVenta   = { id: number; nombre: string; descripcion: string | null; activo: boolean; orden: number }
type CentroIngreso = { id: number; nombre: string; activo: boolean }
type IngresoMap    = { id: number; id_centro_venta_fk: number; id_centro_ingreso_fk: number; activo: boolean; genera_recibo_automatico: boolean }

const emptyCentroForm = () => ({ nombre: '', descripcion: '', orden: 1, id_centro_ingreso_fk: '' as string | number, genera_recibo_automatico: false })

function CentrosVentaPOSTab({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [items, setItems]           = useState<CentroVenta[]>([])
  const [centrosIng, setCentrosIng] = useState<CentroIngreso[]>([])
  const [maps, setMaps]             = useState<IngresoMap[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<CentroVenta | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [form, setForm]             = useState(emptyCentroForm())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: cvs }, { data: cis }, { data: ms }] = await Promise.all([
      dbGolf.from('cat_centros_venta').select('id, nombre, descripcion, activo, orden').order('orden'),
      dbCfg.from('centros_ingreso').select('id, nombre, activo').eq('activo', true).order('nombre'),
      dbGolf.from('pos_centros_ingreso_map').select('id, id_centro_venta_fk, id_centro_ingreso_fk, activo, genera_recibo_automatico'),
    ])
    setItems((cvs as CentroVenta[]) ?? [])
    setCentrosIng((cis as CentroIngreso[]) ?? [])
    setMaps((ms as IngresoMap[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const getMap = (id: number) => maps.find(m => m.id_centro_venta_fk === id)

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyCentroForm(), orden: items.length + 1 })
    setError(''); setShowForm(true)
  }
  const openEdit = (item: CentroVenta) => {
    const m = getMap(item.id)
    setEditing(item)
    setForm({ nombre: item.nombre, descripcion: item.descripcion ?? '', orden: item.orden, id_centro_ingreso_fk: m?.id_centro_ingreso_fk ?? '', genera_recibo_automatico: m?.genera_recibo_automatico ?? false })
    setError(''); setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload: any = { nombre: form.nombre.trim(), descripcion: form.descripcion || null, orden: Number(form.orden) }
    let centroId: number
    if (editing) {
      const { error: err } = await dbGolf.from('cat_centros_venta').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
      centroId = editing.id
    } else {
      payload.activo = true
      const { data, error: err } = await dbGolf.from('cat_centros_venta').insert(payload).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      centroId = (data as any).id
    }
    // Upsert / delete mapping
    const idIngreso = form.id_centro_ingreso_fk ? Number(form.id_centro_ingreso_fk) : null
    const existente = getMap(centroId)
    const genera = (form as any).genera_recibo_automatico ?? false
    if (idIngreso) {
      if (existente) {
        await dbGolf.from('pos_centros_ingreso_map').update({ id_centro_ingreso_fk: idIngreso, activo: true, genera_recibo_automatico: genera, updated_at: new Date().toISOString() }).eq('id', existente.id)
      } else {
        await dbGolf.from('pos_centros_ingreso_map').insert({ id_centro_venta_fk: centroId, id_centro_ingreso_fk: idIngreso, activo: true, genera_recibo_automatico: genera })
      }
    } else if (existente) {
      await dbGolf.from('pos_centros_ingreso_map').delete().eq('id', existente.id)
    }
    setSaving(false); setShowForm(false); fetchAll()
  }

  const toggleActivo = async (item: CentroVenta) => {
    await dbGolf.from('cat_centros_venta').update({ activo: !item.activo }).eq('id', item.id); fetchAll()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>{items.length} registros</span>
        {puedeEscribir && (
          <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Nuevo centro
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{editing ? 'Editar centro' : 'Nuevo centro'}</span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={form.nombre} autoFocus
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Golf Principal" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Descripción</label>
              <input style={inputStyle} value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción opcional" />
            </div>
            <div>
              <label style={labelStyle}>Orden</label>
              <input style={inputStyle} type="number" min="1" value={form.orden}
                onChange={e => setForm(f => ({ ...f, orden: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={labelStyle}>Centro de Ingreso (cortes)</label>
              <select style={selectStyle} value={String(form.id_centro_ingreso_fk)}
                onChange={e => setForm(f => ({ ...f, id_centro_ingreso_fk: e.target.value }))}>
                <option value="">Sin asignar</option>
                {centrosIng.map(ci => <option key={ci.id} value={String(ci.id)}>{ci.nombre}</option>)}
              </select>
            </div>
          </div>
          {/* Toggle genera recibo automático */}
          {form.id_centro_ingreso_fk && (
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8,
              background: (form as any).genera_recibo_automatico ? '#f0fdf4' : '#fef3c7',
              border: `1px solid ${(form as any).genera_recibo_automatico ? '#bbf7d0' : '#fde68a'}`,
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="chk-genera-recibo"
                checked={(form as any).genera_recibo_automatico ?? false}
                onChange={e => setForm(f => ({ ...f, genera_recibo_automatico: e.target.checked } as any))} />
              <label htmlFor="chk-genera-recibo" style={{ fontSize: 13, cursor: 'pointer',
                color: (form as any).genera_recibo_automatico ? '#15803d' : '#92400e', fontWeight: 500 }}>
                {(form as any).genera_recibo_automatico
                  ? 'Genera recibo de ingreso automáticamente al hacer corte'
                  : 'No genera recibo automático — captura manual requerida'}
              </label>
            </div>
          )}
          {error &&<div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              {editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Sin centros. Crea el primero.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                {['Nombre', 'Descripción', 'Orden', 'Centro de Ingreso', 'Recibo Auto', 'Estatus'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
                {puedeEscribir && <th style={{ padding: '10px 16px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const m = getMap(item.id)
                const ciNombre = m ? (centrosIng.find(ci => ci.id === m.id_centro_ingreso_fk)?.nombre ?? '—') : null
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: item.activo ? 1 : 0.5 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#1e293b' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Store size={13} color="#059669" />
                        {item.nombre}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748b', fontSize: 12 }}>{item.descripcion ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: '#64748b', textAlign: 'center' }}>{item.orden}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {ciNombre
                        ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: '#dcfce7', color: '#15803d' }}>{ciNombre}</span>
                        : <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Sin asignar</span>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {m ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20,
                          background: m.genera_recibo_automatico ? '#dcfce7' : '#fef3c7',
                          color: m.genera_recibo_automatico ? '#15803d' : '#92400e' }}>
                          {m.genera_recibo_automatico ? 'Activo' : 'Manual'}
                        </span>
                      ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: item.activo ? '#dcfce7' : '#f1f5f9', color: item.activo ? '#16a34a' : '#94a3b8' }}>
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {puedeEscribir && (
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Editar" onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                          <button className="btn-ghost" style={{ padding: '4px 8px', color: item.activo ? '#dc2626' : '#16a34a' }} title={item.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(item)}>
                            {item.activo ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Definición de tabs ────────────────────────────────────────
const TABS = [
  {
    key: 'categorias',
    label: 'Categorías de Socios',
    icon: Tag,
    tabla: 'cat_categorias_socios',
    campos: [
      { key: 'nombre' as const,       label: 'Nombre',      required: true,  placeholder: 'Ej. Socio Activo' },
      { key: 'descripcion' as const,  label: 'Descripción', placeholder: 'Descripción opcional' },
    ],
  },
  {
    key: 'espacios',
    label: 'Espacios Deportivos',
    icon: MapPin,
    tabla: 'cat_espacios_deportivos',
    campos: [
      { key: 'nombre' as const,       label: 'Nombre',      required: true,  placeholder: 'Ej. Campo 18 Hoyos' },
      { key: 'descripcion' as const,  label: 'Descripción', placeholder: 'Descripción opcional' },
    ],
  },
  {
    key: 'formas',
    label: 'Formas de Juego',
    icon: Flag,
    tabla: 'cat_formas_juego',
    campos: [
      { key: 'nombre' as const, label: 'Nombre', required: true, placeholder: 'Ej. 18 Hoyos' },
    ],
  },
  {
    key: 'cuotas',
    label: 'Cuotas',
    icon: DollarSign,
  },
  {
    key: 'centros_venta',
    label: 'Centros de Venta POS',
    icon: Store,
  },
]

// ── Página principal ──────────────────────────────────────────
export default function CatalogosClubPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf')
  const [tab, setTab] = useState(0)
  const active = TABS[tab]

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Link href="/golf" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', textDecoration: 'none', fontSize: 12, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#2563eb'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94a3b8'}>
            <ChevronLeft size={13} /> Club
          </Link>
          <span style={{ fontSize: 12, color: '#cbd5e1' }}>/</span>
          <BookOpen size={13} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Catálogos</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
          Catálogos del Club
        </h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 24, gap: 0, overflowX: 'auto' }}>
        {TABS.map((t, i) => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(i)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', fontSize: 13, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              fontWeight: tab === i ? 600 : 400,
              color: tab === i ? '#2563eb' : '#94a3b8',
              borderBottom: tab === i ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}>
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenido */}
      {active.key === 'cuotas' ? (
        <CuotasTab key="cuotas" puedeEscribir={puedeEscribir} />
      ) : active.key === 'centros_venta' ? (
        <CentrosVentaPOSTab key="centros_venta" puedeEscribir={puedeEscribir} />
      ) : (
        <CatalogoTab
          key={active.key}
          tabla={(active as any).tabla}
          campos={(active as any).campos}
          puedeEscribir={puedeEscribir}
        />
      )}
    </div>
  )
}
