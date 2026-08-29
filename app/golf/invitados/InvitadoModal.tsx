'use client'
import { useState } from 'react'
import { dbGolf } from '@/lib/supabase'
import { Save, Loader } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Invitado = {
  id: number
  nombre: string
  telefono: string | null
  email: string | null
  observaciones: string | null
  activo: boolean
}

type Props = {
  invitado: Invitado | null
  onClose: () => void
  onSaved: () => void
}

const inputStyle = {
  width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

export default function InvitadoModal({ invitado, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    nombre:        invitado?.nombre ?? '',
    telefono:      invitado?.telefono ?? '',
    email:         invitado?.email ?? '',
    observaciones: invitado?.observaciones ?? '',
    activo:        invitado?.activo ?? true,
  })

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')

    const payload = {
      nombre:        form.nombre.trim(),
      telefono:      form.telefono.trim() || null,
      email:         form.email.trim() || null,
      observaciones: form.observaciones.trim() || null,
      activo:        form.activo,
    }

    const { error: err } = invitado
      ? await dbGolf.from('cat_invitados').update(payload).eq('id', invitado.id)
      : await dbGolf.from('cat_invitados').insert(payload)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <ModalShell
      modulo="golf"
      titulo={invitado ? 'Editar Invitado' : 'Nuevo Invitado'}
      onClose={onClose}
      maxWidth={460}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button onClick={handleSave} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#d97706', color: '#fff', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={labelStyle}>Nombre completo *</label>
          <input style={inputStyle} value={form.nombre} onChange={e => set('nombre', e.target.value)} autoFocus />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Teléfono</label>
            <input style={inputStyle} value={form.telefono} onChange={e => set('telefono', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Observaciones</label>
          <textarea style={{ ...inputStyle, height: 64, resize: 'vertical' }} value={form.observaciones} onChange={e => set('observaciones', e.target.value)} placeholder="Notas sobre este invitado…" />
        </div>

        {invitado && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} />
            Activo (visible al buscar invitados en Accesos)
          </label>
        )}

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
