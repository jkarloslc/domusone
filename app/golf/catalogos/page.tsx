'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { ChevronLeft, Plus, Edit2, ToggleLeft, ToggleRight, Save, X, Loader, BookOpen, MapPin, Flag, Tag, DollarSign } from 'lucide-react'
import Link from 'next/link'

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
type Categoria = { id: number; nombre: string }
type CuotaConfig = {
  id: number
  id_categoria_fk: number | null
  tipo: string
  nombre: string
  monto: number
  meses_aplicar: number
  dia_vencimiento: number
  activo: boolean
  notas: string | null
  cat_categorias_socios?: { nombre: string } | null
}

const TIPO_CUOTA_OPTS = ['INSCRIPCION', 'MENSUALIDAD', 'PENSION_CARRITO']
const TIPO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  INSCRIPCION:      { label: 'Inscripción',    color: '#7c3aed', bg: '#f5f3ff' },
  MENSUALIDAD:      { label: 'Mensualidad',    color: '#0369a1', bg: '#e0f2fe' },
  PENSION_CARRITO:  { label: 'Pensión Carrito',color: '#b45309', bg: '#fef3c7' },
}

const emptyForm = () => ({
  id_categoria_fk: '' as string | number,
  tipo: 'MENSUALIDAD',
  nombre: '',
  monto: '',
  meses_aplicar: 12,
  dia_vencimiento: 10,
  notas: '',
})

function CuotasTab({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [items, setItems]         = useState<CuotaConfig[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<CuotaConfig | null>(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [form, setForm]           = useState(emptyForm())
  const [filtroCat, setFiltroCat] = useState<string>('all')
  const [filtroTipo, setFiltroTipo] = useState<string>('all')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: cuotas }, { data: cats }] = await Promise.all([
      dbGolf.from('cat_cuotas_config')
        .select('*, cat_categorias_socios(nombre)')
        .order('id_categoria_fk').order('tipo').order('nombre'),
      dbGolf.from('cat_categorias_socios').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setItems((cuotas as unknown as CuotaConfig[]) ?? [])
    setCategorias((cats as Categoria[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openNew = () => {
    setEditing(null); setForm(emptyForm()); setError(''); setShowForm(true)
  }
  const openEdit = (item: CuotaConfig) => {
    setEditing(item)
    setForm({
      id_categoria_fk: item.id_categoria_fk ?? '',
      tipo: item.tipo,
      nombre: item.nombre,
      monto: String(item.monto),
      meses_aplicar: item.meses_aplicar,
      dia_vencimiento: item.dia_vencimiento,
      notas: item.notas ?? '',
    })
    setError(''); setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) < 0) { setError('Monto inválido'); return }
    setSaving(true); setError('')
    const payload: any = {
      id_categoria_fk: form.id_categoria_fk !== '' ? Number(form.id_categoria_fk) : null,
      tipo:            form.tipo,
      nombre:          form.nombre.trim(),
      monto:           Number(form.monto),
      meses_aplicar:   Number(form.meses_aplicar),
      dia_vencimiento: Number(form.dia_vencimiento),
      notas:           form.notas || null,
    }
    if (editing) {
      const { error: err } = await dbGolf.from('cat_cuotas_config').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      payload.activo = true
      const { error: err } = await dbGolf.from('cat_cuotas_config').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false); fetchAll()
  }

  const toggleActivo = async (item: CuotaConfig) => {
    await dbGolf.from('cat_cuotas_config').update({ activo: !item.activo }).eq('id', item.id)
    fetchAll()
  }

  const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const filtered = items.filter(i =>
    (filtroCat  === 'all' || String(i.id_categoria_fk) === filtroCat) &&
    (filtroTipo === 'all' || i.tipo === filtroTipo)
  )

  return (
    <div>
      {/* Barra superior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
            style={{ ...selectStyle, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
            <option value="all">Todas las categorías</option>
            {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            style={{ ...selectStyle, width: 'auto', fontSize: 12, padding: '6px 10px' }}>
            <option value="all">Todos los tipos</option>
            {TIPO_CUOTA_OPTS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]?.label ?? t}</option>)}
          </select>
          <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>{filtered.length} registros</span>
        </div>
        {puedeEscribir && (
          <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Nueva cuota
          </button>
        )}
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
              {editing ? 'Editar cuota' : 'Nueva cuota'}
            </span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
            {/* Categoría */}
            <div>
              <label style={labelStyle}>Categoría de socio</label>
              <select style={selectStyle} value={String(form.id_categoria_fk)} onChange={e => setForm(f => ({ ...f, id_categoria_fk: e.target.value }))}>
                <option value="">— Aplica a todas —</option>
                {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
              </select>
            </div>

            {/* Tipo */}
            <div>
              <label style={labelStyle}>Tipo *</label>
              <select style={selectStyle} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {TIPO_CUOTA_OPTS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]?.label ?? t}</option>)}
              </select>
            </div>

            {/* Nombre */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Mensualidad Platino" autoFocus />
            </div>

            {/* Monto */}
            <div>
              <label style={labelStyle}>Monto *</label>
              <input style={inputStyle} type="number" min="0" step="0.01" value={form.monto}
                onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
            </div>

            {/* Meses aplica — solo si tipo es MENSUALIDAD */}
            {form.tipo === 'MENSUALIDAD' && (
              <div>
                <label style={labelStyle}>Meses a generar</label>
                <input style={inputStyle} type="number" min="1" max="24" value={form.meses_aplicar}
                  onChange={e => setForm(f => ({ ...f, meses_aplicar: Number(e.target.value) }))} />
              </div>
            )}

            {/* Día de vencimiento — solo si tipo es MENSUALIDAD o PENSION_CARRITO */}
            {(form.tipo === 'MENSUALIDAD' || form.tipo === 'PENSION_CARRITO') && (
              <div>
                <label style={labelStyle}>Día de vencimiento</label>
                <input style={inputStyle} type="number" min="1" max="31" value={form.dia_vencimiento}
                  onChange={e => setForm(f => ({ ...f, dia_vencimiento: Number(e.target.value) }))} />
              </div>
            )}

            {/* Notas */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notas</label>
              <input style={inputStyle} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Observaciones opcionales" />
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              {editing ? 'Guardar cambios' : 'Crear cuota'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            {items.length === 0 ? 'Sin cuotas configuradas. Crea la primera.' : 'Sin resultados con los filtros aplicados.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nombre</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categoría</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Monto</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meses</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vence día</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estatus</th>
                {puedeEscribir && <th style={{ padding: '10px 16px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const tipoInfo = TIPO_LABEL[item.tipo]
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: item.activo ? 1 : 0.5 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: '#1e293b' }}>
                      {item.nombre}
                      {item.notas && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.notas}</div>}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#475569', fontSize: 12 }}>
                      {item.cat_categorias_socios?.nombre ?? <span style={{ color: '#94a3b8' }}>Todas</span>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: tipoInfo?.bg ?? '#f1f5f9', color: tipoInfo?.color ?? '#64748b' }}>
                        {tipoInfo?.label ?? item.tipo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>
                      {fmt$(item.monto)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b' }}>
                      {item.tipo === 'MENSUALIDAD' ? item.meses_aplicar : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: '#64748b' }}>
                      {item.tipo !== 'INSCRIPCION' ? `día ${item.dia_vencimiento}` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: item.activo ? '#dcfce7' : '#f1f5f9', color: item.activo ? '#16a34a' : '#94a3b8' }}>
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {puedeEscribir && (
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Editar" onClick={() => openEdit(item)}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn-ghost" style={{ padding: '4px 8px', color: item.activo ? '#dc2626' : '#16a34a' }}
                            title={item.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(item)}>
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
