'use client'
import { useState } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { X, BookOpen } from 'lucide-react'

type TipoEvento = 'SALIDA_TALLER' | 'REGRESO_TALLER' | 'PRESTAMO_TERCERO' | 'INCIDENCIA'

type Props = {
  idCarrito: number
  idPension: number | null
  idSocio: number | null
  nombreSocio: string
  descCarrito: string
  onClose: () => void
  onSaved: () => void
}

const TIPOS: { value: TipoEvento; label: string; color: string; bg: string }[] = [
  { value: 'SALIDA_TALLER',    label: '🔧 Salida a Taller',    color: '#d97706', bg: '#fffbeb' },
  { value: 'REGRESO_TALLER',   label: '✅ Regreso de Taller',   color: '#15803d', bg: '#f0fdf4' },
  { value: 'PRESTAMO_TERCERO', label: '🤝 Préstamo a Tercero',  color: '#2563eb', bg: '#eff6ff' },
  { value: 'INCIDENCIA',       label: '⚠️ Incidencia',          color: '#dc2626', bg: '#fef2f2' },
]

export default function BitacoraModal({ idCarrito, idPension, idSocio, nombreSocio, descCarrito, onClose, onSaved }: Props) {
  const { authUser } = useAuth()

  const [tipo, setTipo]                   = useState<TipoEvento>('SALIDA_TALLER')
  const [descripcion, setDescripcion]     = useState('')
  const [taller, setTaller]               = useState('')
  const [terceroNombre, setTerceroNombre] = useState('')
  const [terceroTel, setTerceroTel]       = useState('')
  const [costoEst, setCostoEst]           = useState<string>('')
  const [costoReal, setCostoReal]         = useState<string>('')
  const [urgencia, setUrgencia]           = useState<'BAJA' | 'MEDIA' | 'ALTA'>('MEDIA')
  const [fechaEvento, setFechaEvento]     = useState(new Date().toISOString().slice(0, 16))
  const [fechaFin, setFechaFin]           = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')

  const handleSave = async () => {
    if (!descripcion.trim()) { setError('La descripción es obligatoria'); return }
    setSaving(true)
    setError('')

    const payload: Record<string, unknown> = {
      id_carrito_fk:    idCarrito,
      id_pension_fk:    idPension ?? null,
      id_socio_fk:      idSocio ?? null,
      tipo_evento:      tipo,
      descripcion:      descripcion.trim(),
      fecha_evento:     new Date(fechaEvento).toISOString(),
      fecha_fin:        fechaFin ? new Date(fechaFin).toISOString() : null,
      observaciones:    observaciones.trim() || null,
      usuario_registra: authUser?.user?.email ?? null,
    }

    if (tipo === 'SALIDA_TALLER' || tipo === 'REGRESO_TALLER') {
      payload.taller        = taller.trim() || null
      payload.costo_estimado = costoEst ? parseFloat(costoEst) : null
      if (tipo === 'REGRESO_TALLER') payload.costo_real = costoReal ? parseFloat(costoReal) : null
    }
    if (tipo === 'PRESTAMO_TERCERO') {
      payload.tercero_nombre   = terceroNombre.trim() || null
      payload.tercero_telefono = terceroTel.trim() || null
    }
    if (tipo === 'INCIDENCIA') {
      payload.nivel_urgencia = urgencia
    }

    const { error: err } = await dbGolf.from('bitacora_carritos').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const inp = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    border: '1px solid #e2e8f0', borderRadius: 8,
    background: '#fff', color: '#1e293b',
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const,
  }
  const lbl = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' as const }
  const field = { display: 'flex' as const, flexDirection: 'column' as const, gap: 4 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <BookOpen size={16} style={{ color: '#475569' }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Nueva Entrada — Bitácora</span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{descCarrito} · {nombreSocio}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Tipo de evento */}
          <div style={field}>
            <label style={lbl}>Tipo de Evento *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {TIPOS.map(t => (
                <button key={t.value} onClick={() => setTipo(t.value)} style={{
                  padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: tipo === t.value ? 700 : 400,
                  border: `2px solid ${tipo === t.value ? t.color : '#e2e8f0'}`,
                  background: tipo === t.value ? t.bg : '#fff',
                  color: tipo === t.value ? t.color : '#64748b',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Descripción */}
          <div style={field}>
            <label style={lbl}>Descripción *</label>
            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
              placeholder="Detalla el evento…"
              style={{ ...inp, resize: 'vertical' as const }} />
          </div>

          {/* Campos condicionales: Taller */}
          {(tipo === 'SALIDA_TALLER' || tipo === 'REGRESO_TALLER') && (
            <>
              <div style={field}>
                <label style={lbl}>Nombre del Taller</label>
                <input style={inp} value={taller} onChange={e => setTaller(e.target.value)} placeholder="Ej. Taller Electrónica Golf…" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={field}>
                  <label style={lbl}>Costo Estimado ($)</label>
                  <input style={inp} type="number" min={0} step={0.01} value={costoEst} onChange={e => setCostoEst(e.target.value)} placeholder="0.00" />
                </div>
                {tipo === 'REGRESO_TALLER' && (
                  <div style={field}>
                    <label style={lbl}>Costo Real ($)</label>
                    <input style={inp} type="number" min={0} step={0.01} value={costoReal} onChange={e => setCostoReal(e.target.value)} placeholder="0.00" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Campos condicionales: Préstamo */}
          {tipo === 'PRESTAMO_TERCERO' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={field}>
                <label style={lbl}>Nombre del Tercero</label>
                <input style={inp} value={terceroNombre} onChange={e => setTerceroNombre(e.target.value)} placeholder="Nombre completo…" />
              </div>
              <div style={field}>
                <label style={lbl}>Teléfono</label>
                <input style={inp} value={terceroTel} onChange={e => setTerceroTel(e.target.value)} placeholder="55 0000 0000" />
              </div>
            </div>
          )}

          {/* Campos condicionales: Incidencia */}
          {tipo === 'INCIDENCIA' && (
            <div style={field}>
              <label style={lbl}>Nivel de Urgencia</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['BAJA', 'MEDIA', 'ALTA'] as const).map(u => {
                  const colors = { BAJA: { c: '#15803d', bg: '#f0fdf4' }, MEDIA: { c: '#d97706', bg: '#fffbeb' }, ALTA: { c: '#dc2626', bg: '#fef2f2' } }
                  const col = colors[u]
                  return (
                    <button key={u} onClick={() => setUrgencia(u)} style={{
                      flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: urgencia === u ? 700 : 400,
                      border: `2px solid ${urgencia === u ? col.c : '#e2e8f0'}`,
                      background: urgencia === u ? col.bg : '#fff',
                      color: urgencia === u ? col.c : '#64748b',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>{u}</button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={field}>
              <label style={lbl}>Fecha del Evento *</label>
              <input style={inp} type="datetime-local" value={fechaEvento} onChange={e => setFechaEvento(e.target.value)} />
            </div>
            <div style={field}>
              <label style={lbl}>Fecha Fin (opcional)</label>
              <input style={inp} type="datetime-local" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
            </div>
          </div>

          {/* Observaciones */}
          <div style={field}>
            <label style={lbl}>Observaciones adicionales</label>
            <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
              placeholder="Notas adicionales…"
              style={{ ...inp, resize: 'vertical' as const }} />
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '9px 18px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !descripcion.trim()} style={{
            padding: '9px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8,
            background: '#1e293b', color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
            opacity: (saving || !descripcion.trim()) ? 0.6 : 1,
          }}>
            {saving ? 'Guardando…' : 'Guardar Registro'}
          </button>
        </div>
      </div>
    </div>
  )
}
