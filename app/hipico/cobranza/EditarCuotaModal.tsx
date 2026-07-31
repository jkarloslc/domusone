'use client'
import { useState } from 'react'
import { dbHip } from '@/lib/supabase'
import { Save, Loader } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

export type CuotaEditData = {
  id: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  saldo: number | null
  status: string
  fecha_vencimiento: string | null
  nombreArrendatario: string
}

type Props = {
  cuota: CuotaEditData
  onClose: () => void
  onSaved: () => void
}

const inputStyle = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

export default function EditarCuotaModal({ cuota, onClose, onSaved }: Props) {
  const bloqueada = cuota.status === 'PAGADO' || cuota.status === 'CANCELADO'
  const saldoOriginal = cuota.saldo ?? (cuota.status === 'PAGADO' ? 0 : cuota.monto_final)

  const [form, setForm] = useState({
    concepto:          cuota.concepto,
    periodo:           cuota.periodo ?? '',
    monto_original:    cuota.monto_original,
    descuento:         cuota.descuento,
    fecha_vencimiento: cuota.fecha_vencimiento ?? '',
    status:            cuota.status,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const montoFinalNuevo = Math.max(0, form.monto_original - form.descuento)

  const handleSave = async () => {
    if (!form.concepto.trim()) { setErr('El concepto es obligatorio'); return }
    if (form.monto_original < 0 || form.descuento < 0) { setErr('Los montos no pueden ser negativos'); return }
    setSaving(true); setErr('')

    let payload: Record<string, unknown>

    if (bloqueada) {
      payload = {
        concepto:          form.concepto,
        periodo:           form.periodo || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
      }
    } else {
      const nuevoSaldo = Math.max(0, Math.min(montoFinalNuevo, saldoOriginal + (montoFinalNuevo - cuota.monto_final)))
      const nuevoStatus = nuevoSaldo <= 0 ? 'PAGADO' : nuevoSaldo < montoFinalNuevo ? 'PAGO_PARCIAL' : 'PENDIENTE'
      payload = {
        concepto:          form.concepto,
        periodo:           form.periodo || null,
        monto_original:    form.monto_original,
        descuento:         form.descuento,
        monto_final:       montoFinalNuevo,
        saldo:             nuevoSaldo,
        status:            nuevoStatus,
        fecha_vencimiento: form.fecha_vencimiento || null,
      }
    }

    const { error } = await dbHip.from('cxc_hip').update(payload).eq('id', cuota.id)
    if (error) { setErr(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell
      modulo="hipico"
      titulo="Editar Cuota"
      subtitulo={cuota.nombreArrendatario}
      onClose={onClose}
      maxWidth={480}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#b45309' }}>
            {saving ? <Loader size={13} /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar Cambios'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {bloqueada && (
          <div style={{ fontSize: 12, color: '#b45309', background: '#fff7ed', border: '1px solid #fde68a', padding: '8px 12px', borderRadius: 8 }}>
            Esta cuota está {cuota.status === 'PAGADO' ? 'pagada' : 'cancelada'}. Solo puedes editar el concepto, periodo y fecha de vencimiento.
          </div>
        )}

        <div>
          <label style={labelStyle}>Concepto *</label>
          <input style={inputStyle} value={form.concepto} onChange={e => set('concepto', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Periodo (YYYY-MM)</label>
            <input style={inputStyle} placeholder="2026-07" value={form.periodo} onChange={e => set('periodo', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Fecha vencimiento</label>
            <input style={inputStyle} type="date" value={form.fecha_vencimiento} onChange={e => set('fecha_vencimiento', e.target.value)} />
          </div>
        </div>

        {!bloqueada && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Monto original</label>
                <input style={inputStyle} type="number" min={0} step={0.01}
                  value={form.monto_original}
                  onChange={e => set('monto_original', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label style={labelStyle}>Descuento</label>
                <input style={inputStyle} type="number" min={0} step={0.01}
                  value={form.descuento}
                  onChange={e => set('descuento', parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#64748b' }}>Monto final</span>
              <span style={{ fontWeight: 700, color: '#b45309' }}>${montoFinalNuevo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
          </>
        )}

        {err && (
          <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
            {err}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
