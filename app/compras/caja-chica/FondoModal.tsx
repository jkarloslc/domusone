'use client'
import { useState, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { X, Save, Loader } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import ModalShell from '@/components/ui/ModalShell'

type Props = {
  fondo?: any
  onClose: () => void
  onSaved: () => void
}

export default function FondoModal({ fondo, onClose, onSaved }: Props) {
  const isNew = !fondo
  const { authUser } = useAuth()
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [form, setForm] = useState({
    id_usuario_fk:  fondo?.id_usuario_fk  ?? '',
    usuario_nombre: fondo?.usuario_nombre ?? '',
    monto_asignado: fondo?.monto_asignado?.toString() ?? '',
    fecha_apertura: fondo?.fecha_apertura ?? new Date().toISOString().slice(0, 10),
    fecha_cierre:   fondo?.fecha_cierre   ?? '',
    status:         fondo?.status         ?? 'Activo',
    notas:          fondo?.notas          ?? '',
  })

  useEffect(() => {
    dbCfg.from('usuarios').select('id, nombre, rol').eq('activo', true).order('nombre')
      .then(({ data }) => setUsuarios(data ?? []))
  }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSelectUsuario = (id: string) => {
    const u = usuarios.find(u => u.id === id)
    setForm(f => ({
      ...f,
      id_usuario_fk:  id,
      usuario_nombre: u?.nombre ?? id,
    }))
  }

  const handleSubmit = async () => {
    if (!form.id_usuario_fk)    { setError('Selecciona un usuario'); return }
    if (!form.monto_asignado)   { setError('Ingresa el monto asignado'); return }
    if (!form.fecha_apertura)   { setError('Ingresa la fecha de apertura'); return }
    setSaving(true); setError('')

    const payload: any = {
      id_usuario_fk:   form.id_usuario_fk,
      usuario_nombre:  form.usuario_nombre || form.id_usuario_fk,
      monto_asignado:  Number(form.monto_asignado),
      saldo_disponible: Number(form.monto_asignado),  // se actualiza en pagos
      fecha_apertura:  form.fecha_apertura,
      fecha_cierre:    form.fecha_cierre || null,
      status:          form.status,
      notas:           form.notas.trim() || null,
    }

    if (isNew) {
      payload.created_by = authUser?.nombre ?? null
      const { error: err } = await dbComp.from('fondos_caja_chica').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await dbComp.from('fondos_caja_chica').update(payload).eq('id', fondo.id)
      if (err) { setError(err.message); setSaving(false); return }
    }

    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400 }}>
            {isNew ? 'Asignar Fondo de Caja Chica' : 'Editar Fondo'}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13 }}>{error}</div>}

          <div>
            <label className="label">Usuario beneficiario *</label>
            <select className="select" value={form.id_usuario_fk} onChange={e => handleSelectUsuario(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label">Monto asignado *</label>
              <input className="input" type="number" step="0.01" min="0" value={form.monto_asignado} onChange={set('monto_asignado')} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={set('status')}>
                <option>Activo</option>
                <option>Suspendido</option>
                <option>Cerrado</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="label">Fecha apertura *</label>
              <input className="input" type="date" value={form.fecha_apertura} onChange={set('fecha_apertura')} />
            </div>
            <div>
              <label className="label">Fecha cierre</label>
              <input className="input" type="date" value={form.fecha_cierre} onChange={set('fecha_cierre')} />
            </div>
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
