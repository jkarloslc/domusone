'use client'
import { useState, useEffect } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Save, Loader } from 'lucide-react'

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

type Props = {
  socio: Socio | null
  onClose: () => void
  onSaved: () => void
}

const TABS = ['Datos Personales', 'Membresía', 'Notas']

export default function SocioModal({ socio, onClose, onSaved }: Props) {
  const isNew = !socio
  const [tab, setTab]       = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [categorias, setCategorias] = useState<Categoria[]>([])

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

  useEffect(() => {
    dbGolf.from('cat_categorias_socios').select('id, nombre, descripcion').eq('activo', true).order('nombre')
      .then(({ data }) => setCategorias(data ?? []))
  }, [])

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
            {TABS.map((t, i) => (
              <button key={t} onClick={() => setTab(i)} style={{
                padding: '8px 16px', fontSize: 13, background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
                fontWeight: tab === i ? 600 : 400,
                color: tab === i ? '#2563eb' : '#94a3b8',
                borderBottom: tab === i ? '2px solid #2563eb' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s',
              }}>{t}</button>
            ))}
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

          {/* ── Tab 2: Notas ── */}
          {tab === 2 && (
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

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            {isNew ? 'Crear Socio' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
