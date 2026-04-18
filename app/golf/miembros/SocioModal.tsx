'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Save, Loader, Plus, Trash2, Users } from 'lucide-react'

export type Socio = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  id_categoria_fk: number | null
  email: string | null
  telefono: string | null
  fecha_nacimiento: string | null
  fecha_alta: string | null
  fecha_vencimiento: string | null
  rfc: string | null
  curp: string | null
  numero_tarjeta: string | null
  activo: boolean
  observaciones: string | null
  created_at: string
  // joins
  cat_categorias_socios?: { nombre: string } | null
}

type Categoria = { id: number; nombre: string; descripcion: string | null }

type Familiar = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  parentesco: string | null
  fecha_nacimiento: string | null
  activo: boolean
}

const PARENTESCOS = ['Cónyuge', 'Hijo', 'Hija', 'Padre', 'Madre', 'Hermano', 'Hermana', 'Otro']

type FamiliarForm = {
  nombre: string
  apellido_paterno: string
  apellido_materno: string
  parentesco: string
  fecha_nacimiento: string
}

const FAMILIAR_VACIO: FamiliarForm = {
  nombre: '', apellido_paterno: '', apellido_materno: '', parentesco: '', fecha_nacimiento: '',
}

type Props = {
  socio: Socio | null
  onClose: () => void
  onSaved: () => void
}

const TABS = ['Datos Personales', 'Membresía', 'Familiares', 'Notas']

export default function SocioModal({ socio, onClose, onSaved }: Props) {
  const isNew = !socio
  const [tab, setTab]       = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])

  // ── Familiares ──
  const [familiares, setFamiliares]     = useState<Familiar[]>([])
  const [loadingFam, setLoadingFam]     = useState(false)
  const [showFormFam, setShowFormFam]   = useState(false)
  const [savingFam, setSavingFam]       = useState(false)
  const [errorFam, setErrorFam]         = useState('')
  const [nuevoFam, setNuevoFam]         = useState<FamiliarForm>(FAMILIAR_VACIO)
  const [eliminando, setEliminando]     = useState<number | null>(null)

  const [form, setForm] = useState({
    numero_socio:      socio?.numero_socio      ?? '',
    nombre:            socio?.nombre            ?? '',
    apellido_paterno:  socio?.apellido_paterno  ?? '',
    apellido_materno:  socio?.apellido_materno  ?? '',
    id_categoria_fk:   socio?.id_categoria_fk   ?? '' as number | '',
    email:             socio?.email             ?? '',
    telefono:          socio?.telefono          ?? '',
    fecha_nacimiento:  socio?.fecha_nacimiento  ?? '',
    fecha_alta:        socio?.fecha_alta        ?? (new Date().toISOString().split('T')[0]),
    fecha_vencimiento: socio?.fecha_vencimiento ?? '',
    rfc:               socio?.rfc               ?? '',
    curp:              socio?.curp              ?? '',
    numero_tarjeta:    socio?.numero_tarjeta    ?? '',
    activo:            socio?.activo            ?? true,
    observaciones:     socio?.observaciones     ?? '',
  })

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))
  const setFam = (k: keyof FamiliarForm, v: string) => setNuevoFam(f => ({ ...f, [k]: v }))

  useEffect(() => {
    dbGolf.from('cat_categorias_socios').select('id, nombre, descripcion').eq('activo', true).order('nombre')
      .then(({ data }) => setCategorias(data ?? []))
  }, [])

  const fetchFamiliares = async () => {
    if (!socio) return
    setLoadingFam(true)
    const { data } = await dbGolf
      .from('cat_familiares')
      .select('id, nombre, apellido_paterno, apellido_materno, parentesco, fecha_nacimiento, activo')
      .eq('id_socio_fk', socio.id)
      .order('nombre')
    setFamiliares((data as Familiar[]) ?? [])
    setLoadingFam(false)
  }

  // Cargar familiares al entrar al tab
  useEffect(() => {
    if (tab === 2 && !isNew) fetchFamiliares()
  }, [tab])

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      numero_socio:      form.numero_socio      || null,
      nombre:            form.nombre.trim(),
      apellido_paterno:  form.apellido_paterno  || null,
      apellido_materno:  form.apellido_materno  || null,
      id_categoria_fk:   form.id_categoria_fk   || null,
      email:             form.email             || null,
      telefono:          form.telefono          || null,
      fecha_nacimiento:  form.fecha_nacimiento  || null,
      fecha_alta:        form.fecha_alta        || null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      rfc:               form.rfc               || null,
      curp:              form.curp              || null,
      numero_tarjeta:    form.numero_tarjeta    || null,
      activo:            form.activo,
      observaciones:     form.observaciones     || null,
    }
    const { error: err } = isNew
      ? await dbGolf.from('cat_socios').insert(payload)
      : await dbGolf.from('cat_socios').update(payload).eq('id', socio!.id)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const handleGuardarFamiliar = async () => {
    if (!nuevoFam.nombre.trim()) { setErrorFam('El nombre es obligatorio'); return }
    setSavingFam(true); setErrorFam('')
    const { error: err } = await dbGolf.from('cat_familiares').insert({
      id_socio_fk:      socio!.id,
      nombre:           nuevoFam.nombre.trim(),
      apellido_paterno: nuevoFam.apellido_paterno || null,
      apellido_materno: nuevoFam.apellido_materno || null,
      parentesco:       nuevoFam.parentesco       || null,
      fecha_nacimiento: nuevoFam.fecha_nacimiento || null,
    })
    if (err) { setErrorFam(err.message); setSavingFam(false); return }
    setNuevoFam(FAMILIAR_VACIO)
    setShowFormFam(false)
    setSavingFam(false)
    fetchFamiliares()
  }

  const handleEliminarFamiliar = async (id: number) => {
    if (!confirm('¿Eliminar este familiar?')) return
    setEliminando(id)
    await dbGolf.from('cat_familiares').delete().eq('id', id)
    setEliminando(null)
    fetchFamiliares()
  }

  const nombreCompleto = (f: Familiar) =>
    [f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')

  const inputStyle = {
    width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
    borderRadius: 8, background: '#fff', color: '#1e293b',
    fontFamily: 'inherit', outline: 'none',
  }
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' as const }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'inherit', fontSize: 20, fontWeight: 600 }}>
              {isNew ? 'Nuevo Socio' : 'Editar Socio'}
            </h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {TABS.map((t, i) => {
              const disabled = i === 2 && isNew
              return (
                <button key={t} onClick={() => !disabled && setTab(i)} style={{
                  padding: '8px 16px', fontSize: 13, background: 'none', border: 'none',
                  cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  fontWeight: tab === i ? 600 : 400,
                  color: disabled ? '#cbd5e1' : tab === i ? '#2563eb' : '#94a3b8',
                  borderBottom: tab === i ? '2px solid #2563eb' : '2px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {t}
                  {i === 2 && !isNew && familiares.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: tab === 2 ? '#dbeafe' : '#f1f5f9', color: tab === 2 ? '#1d4ed8' : '#64748b' }}>
                      {familiares.length}
                    </span>
                  )}
                  {i === 2 && isNew && (
                    <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 400 }}>(guardar primero)</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── Tab 0: Datos Personales ── */}
          {tab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Nombre *</label>
                  <input style={inputStyle} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre(s)" />
                </div>
                <div>
                  <label style={labelStyle}>Apellido Paterno</label>
                  <input style={inputStyle} value={form.apellido_paterno} onChange={e => set('apellido_paterno', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Apellido Materno</label>
                  <input style={inputStyle} value={form.apellido_materno} onChange={e => set('apellido_materno', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Fecha de Nacimiento</label>
                  <input style={inputStyle} type="date" value={form.fecha_nacimiento} onChange={e => set('fecha_nacimiento', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>RFC</label>
                  <input style={inputStyle} value={form.rfc} onChange={e => set('rfc', e.target.value.toUpperCase())} placeholder="XXXX000000XXX" />
                </div>
                <div>
                  <label style={labelStyle}>CURP</label>
                  <input style={inputStyle} value={form.curp} onChange={e => set('curp', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono</label>
                  <input style={inputStyle} value={form.telefono} onChange={e => set('telefono', e.target.value)} placeholder="(55) 1234-5678" />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 1: Membresía ── */}
          {tab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Número de Socio</label>
                  <input style={inputStyle} value={form.numero_socio} onChange={e => set('numero_socio', e.target.value)} placeholder="Ej. 1042" />
                </div>
                <div>
                  <label style={labelStyle}>Número de Tarjeta</label>
                  <input style={inputStyle} value={form.numero_tarjeta} onChange={e => set('numero_tarjeta', e.target.value)} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Categoría</label>
                  <select style={{ ...inputStyle }} value={form.id_categoria_fk} onChange={e => set('id_categoria_fk', e.target.value ? Number(e.target.value) : '')}>
                    <option value="">— Sin categoría —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Fecha de Alta</label>
                  <input style={inputStyle} type="date" value={form.fecha_alta} onChange={e => set('fecha_alta', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Vencimiento</label>
                  <input style={inputStyle} type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" id="activo" checked={form.activo} onChange={e => set('activo', e.target.checked)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <label htmlFor="activo" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>Socio activo</label>
                </div>
              </div>
            </div>
          )}

          {/* ── Tab 2: Familiares ── */}
          {tab === 2 && !isNew && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Header del tab */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={15} style={{ color: '#2563eb' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    Familiares del socio
                  </span>
                  {!loadingFam && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>({familiares.length})</span>
                  )}
                </div>
                {!showFormFam && (
                  <button
                    onClick={() => { setShowFormFam(true); setErrorFam('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                    <Plus size={13} /> Agregar familiar
                  </button>
                )}
              </div>

              {/* Formulario nuevo familiar */}
              {showFormFam && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Nuevo familiar</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Nombre *</label>
                      <input style={inputStyle} value={nuevoFam.nombre} onChange={e => setFam('nombre', e.target.value)} placeholder="Nombre(s)" autoFocus />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido Paterno</label>
                      <input style={inputStyle} value={nuevoFam.apellido_paterno} onChange={e => setFam('apellido_paterno', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Apellido Materno</label>
                      <input style={inputStyle} value={nuevoFam.apellido_materno} onChange={e => setFam('apellido_materno', e.target.value)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Parentesco</label>
                      <select style={inputStyle} value={nuevoFam.parentesco} onChange={e => setFam('parentesco', e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {PARENTESCOS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Fecha de Nacimiento</label>
                      <input style={inputStyle} type="date" value={nuevoFam.fecha_nacimiento} onChange={e => setFam('fecha_nacimiento', e.target.value)} />
                    </div>
                  </div>
                  {errorFam && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                      {errorFam}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setShowFormFam(false); setNuevoFam(FAMILIAR_VACIO); setErrorFam('') }}
                      style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button
                      onClick={handleGuardarFamiliar}
                      disabled={savingFam}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', opacity: savingFam ? 0.7 : 1 }}>
                      {savingFam ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                      Guardar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de familiares */}
              {loadingFam ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>
              ) : familiares.length === 0 && !showFormFam ? (
                <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👨‍👩‍👧‍👦</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Sin familiares registrados</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Agrega cónyuge, hijos u otros familiares del socio</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {familiares.map(f => (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', background: f.activo ? '#fff' : '#f8fafc',
                      border: '1px solid #e2e8f0', borderRadius: 8, gap: 12,
                      opacity: f.activo ? 1 : 0.6,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{nombreCompleto(f)}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', gap: 10 }}>
                          {f.parentesco && <span>{f.parentesco}</span>}
                          {f.fecha_nacimiento && (
                            <span>{new Date(f.fecha_nacimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          )}
                          {!f.activo && <span style={{ color: '#dc2626', fontWeight: 600 }}>Inactivo</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleEliminarFamiliar(f.id)}
                        disabled={eliminando === f.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, opacity: eliminando === f.id ? 0.5 : 1 }}
                        title="Eliminar familiar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab 3: Notas ── */}
          {tab === 3 && (
            <div>
              <label style={labelStyle}>Observaciones</label>
              <textarea
                style={{ ...inputStyle, height: 160, resize: 'vertical' }}
                value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)}
                placeholder="Notas internas del socio…"
              />
            </div>
          )}

          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer — ocultar botón guardar en tab Familiares */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose}>
            {tab === 2 ? 'Cerrar' : 'Cancelar'}
          </button>
          {tab !== 2 && (
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
              {isNew ? 'Crear Socio' : 'Guardar Cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
