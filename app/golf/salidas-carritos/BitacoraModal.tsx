'use client'
import { useState } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Save, Loader } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { cuotaExigible } from './adeudos'

type TipoEvento = 'SALIDA_TALLER' | 'REGRESO_TALLER' | 'PRESTAMO_TERCERO' | 'INCIDENCIA' | 'SALIDA_DEFINITIVA'

type Props = {
  idCarrito: number
  idPension: number | null
  idSlot: number | null
  idSocio: number | null
  nombreSocio: string
  descCarrito: string
  onClose: () => void
  onSaved: () => void
}

const TIPOS: { value: TipoEvento; label: string; color: string; bg: string; full?: boolean }[] = [
  { value: 'SALIDA_TALLER',      label: '🔧 Salida a Taller',    color: '#d97706', bg: '#fffbeb' },
  { value: 'REGRESO_TALLER',     label: '✅ Regreso de Taller',   color: '#15803d', bg: '#f0fdf4' },
  { value: 'PRESTAMO_TERCERO',   label: '🤝 Préstamo a Tercero',  color: '#2563eb', bg: '#eff6ff' },
  { value: 'INCIDENCIA',         label: '⚠️ Incidencia',          color: '#dc2626', bg: '#fef2f2' },
  { value: 'SALIDA_DEFINITIVA',  label: '🚗 Salida Definitiva',   color: '#7c3aed', bg: '#f5f3ff', full: true },
]

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  border: '1px solid #e2e8f0', borderRadius: 8,
  background: '#fff', color: '#1e293b',
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

export default function BitacoraModal({ idCarrito, idPension, idSlot, idSocio, nombreSocio, descCarrito, onClose, onSaved }: Props) {
  const { authUser } = useAuth()

  const [tipo, setTipo]                   = useState<TipoEvento>('SALIDA_TALLER')
  const [descripcion, setDescripcion]     = useState('')
  const [taller, setTaller]               = useState('')
  const [terceroNombre, setTerceroNombre] = useState('')
  const [terceroTel, setTerceroTel]       = useState('')
  const [costoEst, setCostoEst]           = useState('')
  const [costoReal, setCostoReal]         = useState('')
  const [urgencia, setUrgencia]           = useState<'BAJA' | 'MEDIA' | 'ALTA'>('MEDIA')
  const [fechaEvento, setFechaEvento]     = useState(new Date().toISOString().slice(0, 16))
  const [fechaFin, setFechaFin]           = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')

  const handleSave = async () => {
    if (!descripcion.trim()) { setError('La descripción es obligatoria'); return }
    if (tipo === 'SALIDA_DEFINITIVA' && !idPension) { setError('No hay pensión activa asociada a este carrito'); return }
    setSaving(true); setError('')

    const hoyISO = new Date().toISOString().split('T')[0]

    // Salida definitiva: bloquear si hay adeudo exigible (regla del día 10).
    // Hasta el día 10 solo bloquean cuotas de meses anteriores; del 11 en
    // adelante la cuota del mes en curso también debe estar cobrada.
    if (tipo === 'SALIDA_DEFINITIVA' && idPension) {
      const { data: cxc, error: errCxc } = await dbGolf.from('cxc_golf')
        .select('saldo, monto_final, periodo, fecha_vencimiento')
        .eq('id_pension_fk', idPension)
        .eq('tipo', 'PENSION_CARRITO')
        .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      if (errCxc) { setError('No se pudo validar el adeudo de cuotas: ' + errCxc.message); setSaving(false); return }

      const exigibles = ((cxc ?? []) as { saldo: number | null; monto_final: number | null; periodo: string | null; fecha_vencimiento: string | null }[])
        .filter(c => cuotaExigible(c))
      if (exigibles.length > 0) {
        const monto = exigibles.reduce((a, c) => a + (c.saldo ?? c.monto_final ?? 0), 0)
        const periodos = exigibles.map(c => c.periodo).filter(Boolean).join(', ')
        setError(`No se puede registrar la salida definitiva: el carrito tiene ${exigibles.length} cuota${exigibles.length !== 1 ? 's' : ''} exigible${exigibles.length !== 1 ? 's' : ''} por $${monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}${periodos ? ` (${periodos})` : ''}. Cobra la cuota antes de dar salida.`)
        setSaving(false)
        return
      }
    }

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
      payload.taller         = taller.trim() || null
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

    // 1. Insertar entrada de bitácora
    const { error: err } = await dbGolf.from('bitacora_carritos').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }

    // 2. Salida definitiva: liberar slot + cerrar pensión + cancelar cuotas pendientes
    if (tipo === 'SALIDA_DEFINITIVA' && idPension) {
      // Cerrar pensión y liberar slot
      const { error: errP } = await dbGolf.from('ctrl_pensiones')
        .update({ activo: false, fecha_fin: hoyISO, id_slot_fk: null })
        .eq('id', idPension)
      if (errP) { setError('Bitácora guardada pero error al cerrar pensión: ' + errP.message); setSaving(false); return }

      // Cancelar cuotas pendientes (saldo → 0, status → CANCELADO)
      const { error: errC } = await dbGolf.from('cxc_golf')
        .update({ saldo: 0, status: 'CANCELADO' })
        .eq('id_pension_fk', idPension)
        .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      if (errC) { setError('Pensión cerrada pero error al cancelar cuotas: ' + errC.message); setSaving(false); return }
    }

    onSaved()
  }

  return (
    <ModalShell
      modulo="golf-carritos"
      titulo="Nueva Entrada — Bitácora"
      subtitulo={`${descCarrito} · ${nombreSocio}`}
      maxWidth={560}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving || !descripcion.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: tipo === 'SALIDA_DEFINITIVA' ? '#7c3aed' : '#059669', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: (saving || !descripcion.trim()) ? 0.6 : 1 }}>
          {saving ? <Loader size={14} /> : <Save size={14} />}
          {tipo === 'SALIDA_DEFINITIVA' ? 'Confirmar Salida Definitiva' : 'Guardar Registro'}
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Tipo de evento */}
        <div>
          <label style={lbl}>Tipo de Evento *</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TIPOS.map(t => (
              <button key={t.value} onClick={() => setTipo(t.value)} style={{
                padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: tipo === t.value ? 700 : 400,
                border: `2px solid ${tipo === t.value ? t.color : '#e2e8f0'}`,
                background: tipo === t.value ? t.bg : '#fff',
                color: tipo === t.value ? t.color : '#64748b',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                gridColumn: t.full ? '1 / -1' : undefined,
              }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Panel de advertencia — Salida Definitiva */}
        {tipo === 'SALIDA_DEFINITIVA' && (
          <div style={{ padding: '14px 16px', background: '#f5f3ff', border: '2px solid #c4b5fd', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9', marginBottom: 6 }}>
                  Esta acción realizará los siguientes cambios de forma permanente:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#5b21b6', lineHeight: 1.8 }}>
                  <li>La <strong>pensión quedará cerrada</strong> (inactiva) con fecha de salida hoy.</li>
                  <li>El <strong>slot asignado será liberado</strong> para un nuevo carrito.</li>
                  <li>Las <strong>cuotas futuras pendientes serán canceladas</strong> con saldo $0.</li>
                  <li>Requiere <strong>no tener adeudo exigible</strong>: cuotas de meses anteriores y, a partir del día 11, también la del mes en curso.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Descripción */}
        <div>
          <label style={lbl}>Descripción *</label>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
            placeholder="Detalla el evento…"
            style={{ ...inp, resize: 'vertical' }} />
        </div>

        {/* Taller */}
        {(tipo === 'SALIDA_TALLER' || tipo === 'REGRESO_TALLER') && (
          <>
            <div>
              <label style={lbl}>Nombre del Taller</label>
              <input style={inp} value={taller} onChange={e => setTaller(e.target.value)} placeholder="Ej. Taller Electrónica Golf…" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Costo Estimado ($)</label>
                <input style={inp} type="number" min={0} step={0.01} value={costoEst} onChange={e => setCostoEst(e.target.value)} placeholder="0.00" />
              </div>
              {tipo === 'REGRESO_TALLER' && (
                <div>
                  <label style={lbl}>Costo Real ($)</label>
                  <input style={inp} type="number" min={0} step={0.01} value={costoReal} onChange={e => setCostoReal(e.target.value)} placeholder="0.00" />
                </div>
              )}
            </div>
          </>
        )}

        {/* Préstamo a tercero */}
        {tipo === 'PRESTAMO_TERCERO' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Nombre del Tercero</label>
              <input style={inp} value={terceroNombre} onChange={e => setTerceroNombre(e.target.value)} placeholder="Nombre completo…" />
            </div>
            <div>
              <label style={lbl}>Teléfono</label>
              <input style={inp} value={terceroTel} onChange={e => setTerceroTel(e.target.value)} placeholder="55 0000 0000" />
            </div>
          </div>
        )}

        {/* Incidencia — urgencia */}
        {tipo === 'INCIDENCIA' && (
          <div>
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
          <div>
            <label style={lbl}>Fecha del Evento *</label>
            <input style={inp} type="datetime-local" value={fechaEvento} onChange={e => setFechaEvento(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Fecha Fin (opcional)</label>
            <input style={inp} type="datetime-local" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
        </div>

        {/* Observaciones */}
        <div>
          <label style={lbl}>Observaciones adicionales</label>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={2}
            placeholder="Notas adicionales…"
            style={{ ...inp, resize: 'vertical' }} />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
