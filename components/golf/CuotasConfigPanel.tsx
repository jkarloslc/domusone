'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import {
  Plus, Edit2, ToggleLeft, ToggleRight, Save, X, Loader,
  DollarSign, RefreshCw, Eye, Trash2,
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

// ── Tipos ────────────────────────────────────────────────────
type Categoria = { id: number; nombre: string }

type CuotaConfig = {
  id: number
  tipo: string
  nombre: string
  id_categoria_fk: number | null    // solo se usa para PENSION_CARRITO
  monto: number                     // solo se usa para PENSION_CARRITO
  meses_aplicar: number
  dia_vencimiento: number
  activo: boolean
  notas: string | null
  cat_categorias_socios?: { nombre: string } | null
  _detCount?: number
}

type CuotaConfigDet = {
  id: number
  id_cuota_config_fk: number
  id_categoria_fk: number
  monto: number
  activo: boolean
  cat_categorias_socios?: { nombre: string }
}

const TIPO_CUOTA_OPTS = ['INSCRIPCION', 'MENSUALIDAD', 'PENSION_CARRITO']
const TIPO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  INSCRIPCION:      { label: 'Inscripción',     color: '#7c3aed', bg: '#f5f3ff' },
  MENSUALIDAD:      { label: 'Mensualidad',     color: '#0369a1', bg: '#e0f2fe' },
  PENSION_CARRITO:  { label: 'Pensión Carrito', color: '#b45309', bg: '#fef3c7' },
}

const emptyForm = () => ({
  tipo: 'MENSUALIDAD',
  nombre: '',
  id_categoria_fk: '' as string | number,   // solo PENSION_CARRITO
  monto: '',                                  // solo PENSION_CARRITO
  meses_aplicar: 12,
  dia_vencimiento: 10,
  notas: '',
})

const fmt$ = (v: number) => '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }

// ── Panel principal ──────────────────────────────────────────
export default function CuotasConfigPanel({ puedeEscribir }: { puedeEscribir: boolean }) {
  const [items, setItems]             = useState<CuotaConfig[]>([])
  const [categorias, setCategorias]   = useState<Categoria[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editing, setEditing]         = useState<CuotaConfig | null>(null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [form, setForm]               = useState(emptyForm())
  const [filtroTipo, setFiltroTipo]   = useState('all')
  const [preciosFor, setPreciosFor]   = useState<CuotaConfig | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: cuotas }, { data: cats }, { data: dets }] = await Promise.all([
      dbGolf.from('cat_cuotas_config').select('*, cat_categorias_socios(nombre)').order('tipo').order('nombre'),
      dbGolf.from('cat_categorias_socios').select('id, nombre').eq('activo', true).order('nombre'),
      dbGolf.from('cat_cuotas_config_det').select('id_cuota_config_fk').eq('activo', true),
    ])
    const countMap = new Map<number, number>()
    ;(dets ?? []).forEach((d: any) => countMap.set(d.id_cuota_config_fk, (countMap.get(d.id_cuota_config_fk) ?? 0) + 1))
    setItems(((cuotas as unknown as CuotaConfig[]) ?? []).map(c => ({ ...c, _detCount: countMap.get(c.id) ?? 0 })))
    setCategorias((cats as Categoria[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openNew = () => { setEditing(null); setForm(emptyForm()); setError(''); setShowForm(true) }
  const openEdit = (item: CuotaConfig) => {
    setEditing(item)
    setForm({
      tipo: item.tipo,
      nombre: item.nombre,
      id_categoria_fk: item.id_categoria_fk ?? '',
      monto: String(item.monto ?? 0),
      meses_aplicar: item.meses_aplicar,
      dia_vencimiento: item.dia_vencimiento,
      notas: item.notas ?? '',
    })
    setError(''); setShowForm(true)
  }

  const esPension = form.tipo === 'PENSION_CARRITO'

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (esPension && (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) < 0)) {
      setError('Monto inválido'); return
    }
    setSaving(true); setError('')
    const payload: any = {
      tipo:            form.tipo,
      nombre:          form.nombre.trim(),
      meses_aplicar:   Number(form.meses_aplicar),
      dia_vencimiento: Number(form.dia_vencimiento),
      notas:           form.notas || null,
      id_categoria_fk: esPension && form.id_categoria_fk !== '' ? Number(form.id_categoria_fk) : null,
      monto:           esPension ? Number(form.monto) : 0,
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

  const filtered = items.filter(i => filtroTipo === 'all' || i.tipo === filtroTipo)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#7c3aed18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={15} style={{ color: '#7c3aed' }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Cuotas de Membresía</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>
            Inscripción y mensualidad con precio por categoría · pensión de carrito por separado
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchAll} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nueva cuota
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 'auto', fontSize: 12, padding: '6px 10px' }}>
          <option value="all">Todos los tipos</option>
          {TIPO_CUOTA_OPTS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]?.label ?? t}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{filtered.length} registros</span>
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{editing ? 'Editar cuota' : 'Nueva cuota'}</span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
            <div>
              <label style={labelSt}>Tipo *</label>
              <select className="select" value={form.tipo} disabled={!!editing}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {TIPO_CUOTA_OPTS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]?.label ?? t}</option>)}
              </select>
              {editing && <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>El tipo no se puede cambiar al editar</p>}
            </div>

            <div>
              <label style={labelSt}>Nombre *</label>
              <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Membresía (Mensualidad)" autoFocus={!editing} />
            </div>

            {esPension && (
              <>
                <div>
                  <label style={labelSt}>Categoría de socio</label>
                  <select className="select" value={String(form.id_categoria_fk)} onChange={e => setForm(f => ({ ...f, id_categoria_fk: e.target.value }))}>
                    <option value="">— Aplica a todas —</option>
                    {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelSt}>Monto *</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
                </div>
              </>
            )}

            {!esPension && (
              <div style={{ gridColumn: '1 / -1', padding: '10px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 12, color: '#6d28d9' }}>
                El precio de esta cuota se configura por categoría desde el botón <strong>“Precios”</strong> de la tabla, después de guardar.
              </div>
            )}

            {form.tipo === 'MENSUALIDAD' && (
              <div>
                <label style={labelSt}>Meses a generar</label>
                <input className="input" type="number" min="1" max="24" value={form.meses_aplicar}
                  onChange={e => setForm(f => ({ ...f, meses_aplicar: Number(e.target.value) }))} />
              </div>
            )}

            {(form.tipo === 'MENSUALIDAD' || form.tipo === 'PENSION_CARRITO') && (
              <div>
                <label style={labelSt}>Día de vencimiento</label>
                <input className="input" type="number" min="1" max="31" value={form.dia_vencimiento}
                  onChange={e => setForm(f => ({ ...f, dia_vencimiento: Number(e.target.value) }))} />
              </div>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Notas</label>
              <input className="input" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
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
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Precio</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meses</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vence día</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estatus</th>
                {puedeEscribir && <th style={{ padding: '10px 16px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const tipoInfo = TIPO_LABEL[item.tipo]
                const esPensionRow = item.tipo === 'PENSION_CARRITO'
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: item.activo ? 1 : 0.5 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: '#1e293b' }}>
                      {item.nombre}
                      {item.notas && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.notas}</div>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: tipoInfo?.bg ?? '#f1f5f9', color: tipoInfo?.color ?? '#64748b' }}>
                        {tipoInfo?.label ?? item.tipo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {esPensionRow ? (
                        <div>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>{fmt$(item.monto)}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.cat_categorias_socios?.nombre ?? 'Todas'}</div>
                        </div>
                      ) : (
                        <button onClick={() => setPreciosFor(item)}
                          title="Ver / editar precios por categoría"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                            padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600,
                            background: (item._detCount ?? 0) > 0 ? '#dcfce7' : '#fef3c7',
                            color:      (item._detCount ?? 0) > 0 ? '#15803d' : '#92400e' }}>
                          <Eye size={11} />
                          {item._detCount ?? 0} categoría{(item._detCount ?? 0) !== 1 ? 's' : ''}
                        </button>
                      )}
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

      {preciosFor && (
        <CuotaPreciosModal
          cuota={preciosFor}
          categorias={categorias}
          puedeEscribir={puedeEscribir}
          onClose={() => { setPreciosFor(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ── Modal de líneas de precio por categoría ───────────────────
function CuotaPreciosModal({ cuota, categorias, puedeEscribir, onClose }: {
  cuota: CuotaConfig; categorias: Categoria[]; puedeEscribir: boolean; onClose: () => void
}) {
  const [lines, setLines]         = useState<CuotaConfigDet[]>([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState<number | null>(null)
  const [editMonto, setEditMonto] = useState('')
  const [newLine, setNewLine]     = useState({ id_categoria_fk: '', monto: '' })
  const [errorNew, setErrorNew]   = useState('')

  const fetchLines = useCallback(async () => {
    setLoading(true)
    const { data } = await dbGolf.from('cat_cuotas_config_det')
      .select('*, cat_categorias_socios(nombre)')
      .eq('id_cuota_config_fk', cuota.id)
      .order('id')
    setLines((data as unknown as CuotaConfigDet[]) ?? [])
    setLoading(false)
  }, [cuota.id])

  useEffect(() => { fetchLines() }, [fetchLines])

  const handleAdd = async () => {
    setErrorNew('')
    if (!newLine.id_categoria_fk || !newLine.monto) { setErrorNew('Completa todos los campos'); return }
    setSaving(true)
    const { error } = await dbGolf.from('cat_cuotas_config_det').insert({
      id_cuota_config_fk: cuota.id,
      id_categoria_fk:    Number(newLine.id_categoria_fk),
      monto:              Number(newLine.monto),
      activo:             true,
    })
    setSaving(false)
    if (error) {
      setErrorNew(error.code === '23505' ? 'Ya existe un precio para esa categoría' : error.message)
      return
    }
    setNewLine({ id_categoria_fk: '', monto: '' })
    fetchLines()
  }

  const handleSaveEdit = async (id: number) => {
    if (!editMonto) return
    await dbGolf.from('cat_cuotas_config_det').update({ monto: Number(editMonto) }).eq('id', id)
    setEditId(null)
    fetchLines()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta línea de precio?')) return
    await dbGolf.from('cat_cuotas_config_det').delete().eq('id', id)
    fetchLines()
  }

  const toggleLine = async (l: CuotaConfigDet) => {
    await dbGolf.from('cat_cuotas_config_det').update({ activo: !l.activo }).eq('id', l.id)
    fetchLines()
  }

  return (
    <ModalShell modulo="golf" titulo={`Precios — ${cuota.nombre}`} onClose={onClose} maxWidth={560}
      footer={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}
    >
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ display: 'flex', gap: 20, padding: '12px 0 16px', borderBottom: '1px solid #f1f5f9', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>Tipo</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{TIPO_LABEL[cuota.tipo]?.label ?? cuota.tipo}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>Categorías activas</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{lines.filter(l => l.activo).length}</div>
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden', marginBottom: puedeEscribir ? 16 : 0 }}>
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th style={{ width: 64, textAlign: 'center' }}>Activo</th>
                {puedeEscribir && <th style={{ width: 52 }}></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32 }}>
                  <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : lines.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                  Sin precios configurados. Agrega categorías abajo.
                </td></tr>
              ) : lines.map(l => (
                <tr key={l.id} style={{ opacity: l.activo ? 1 : 0.45 }}>
                  <td style={{ fontWeight: 500 }}>{(l as any).cat_categorias_socios?.nombre ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {editId === l.id ? (
                      <input className="input" type="number" step="0.01" value={editMonto} autoFocus
                        style={{ width: 110, textAlign: 'right', padding: '4px 8px' }}
                        onChange={e => setEditMonto(e.target.value)}
                        onBlur={() => handleSaveEdit(l.id)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(l.id); if (e.key === 'Escape') setEditId(null) }}
                      />
                    ) : (
                      <button onClick={() => { if (puedeEscribir) { setEditId(l.id); setEditMonto(l.monto.toString()) } }}
                        style={{ background: 'none', border: 'none', fontWeight: 600, fontSize: 13,
                          color: 'var(--blue)', fontVariantNumeric: 'tabular-nums',
                          cursor: puedeEscribir ? 'pointer' : 'default' }}
                        title={puedeEscribir ? 'Haz clic para editar el monto' : undefined}>
                        {fmt$(l.monto)}
                      </button>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => toggleLine(l)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', margin: '0 auto' }}>
                      {l.activo
                        ? <ToggleRight size={18} style={{ color: '#15803d' }} />
                        : <ToggleLeft  size={18} style={{ color: '#cbd5e1' }} />}
                    </button>
                  </td>
                  {puedeEscribir && (
                    <td>
                      <button className="btn-ghost" style={{ padding: '3px 6px', color: '#dc2626' }}
                        onClick={() => handleDelete(l.id)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {puedeEscribir && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Agregar precio por categoría
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', gap: 8, alignItems: 'flex-end' }}>
              <div>
                <label style={labelSt}>Categoría</label>
                <select className="select" value={newLine.id_categoria_fk}
                  onChange={e => setNewLine(n => ({ ...n, id_categoria_fk: e.target.value }))}>
                  <option value="">— Categoría —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Monto *</label>
                <input className="input" type="number" step="0.01" placeholder="0.00"
                  value={newLine.monto}
                  onChange={e => setNewLine(n => ({ ...n, monto: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              </div>
              <button className="btn-primary" onClick={handleAdd} disabled={saving}
                style={{ padding: '8px 14px', alignSelf: 'flex-end' }}>
                {saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
              </button>
            </div>
            {errorNew && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{errorNew}</div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
