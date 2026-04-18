'use client'
import { useState } from 'react'
import { dbGolf } from '@/lib/supabase'
import { X, Save, Loader, CheckCircle } from 'lucide-react'

type Cuota = {
  id: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  status: string
  fecha_vencimiento: string | null
  tipo: string
}

type Props = {
  cuotas: Cuota[]           // cuotas preseleccionadas (puede ser 1 o varias)
  nombreSocio: string
  onClose: () => void
  onSaved: () => void
}

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

const FORMAS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE', 'OTRO']

export default function CobrarCuotaModal({ cuotas, nombreSocio, onClose, onSaved }: Props) {
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set(cuotas.map(c => c.id)))

  const [forma_pago, setFormaPago]         = useState('EFECTIVO')
  const [referencia, setReferencia]        = useState('')
  const [fecha_pago, setFechaPago]         = useState(new Date().toISOString().split('T')[0])
  const [observaciones, setObservaciones]  = useState('')

  const toggleCuota = (id: number) => {
    setSeleccionadas(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const cuotasSelec = cuotas.filter(c => seleccionadas.has(c.id))
  const totalCobro  = cuotasSelec.reduce((a, c) => a + c.monto_final, 0)

  const handleSave = async () => {
    if (cuotasSelec.length === 0) { setError('Selecciona al menos una cuota'); return }
    setSaving(true); setError('')

    const { error: err } = await dbGolf
      .from('cxc_golf')
      .update({
        status:          'PAGADO',
        fecha_pago:      fecha_pago,
        forma_pago:      forma_pago,
        referencia_pago: referencia || null,
        observaciones:   observaciones || null,
      })
      .in('id', Array.from(seleccionadas))

    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  const hoy = new Date().toISOString().split('T')[0]
  const vencida = (f: string | null) => f ? f < hoy : false

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b' }}>Cobrar Cuotas</h2>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{nombreSocio}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Lista de cuotas seleccionables */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
              Cuotas pendientes ({cuotas.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cuotas.map(c => {
                const sel = seleccionadas.has(c.id)
                const venc = vencida(c.fecha_vencimiento)
                return (
                  <div key={c.id}
                    onClick={() => toggleCuota(c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1px solid ${sel ? '#059669' : '#e2e8f0'}`, borderRadius: 8, background: sel ? '#ecfdf5' : '#fff', cursor: 'pointer', transition: 'all 0.1s' }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? '#059669' : '#cbd5e1'}`, background: sel ? '#059669' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {sel && <CheckCircle size={12} color="#fff" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{c.concepto}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', gap: 8 }}>
                        {c.fecha_vencimiento && (
                          <span style={{ color: venc ? '#dc2626' : '#94a3b8' }}>
                            {venc ? '⚠ Vencida' : 'Vence'} {new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                        <span style={{ padding: '1px 6px', borderRadius: 20, background: c.tipo === 'PENSION_CARRITO' ? '#ecfdf5' : '#eff6ff', color: c.tipo === 'PENSION_CARRITO' ? '#065f46' : '#1d4ed8', fontWeight: 600, fontSize: 10 }}>
                          {c.tipo === 'PENSION_CARRITO' ? 'Pensión' : 'Membresía'}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {c.descuento > 0 && <div style={{ fontSize: 10, color: '#16a34a', textDecoration: 'line-through' }}>{fmt$(c.monto_original)}</div>}
                      <div style={{ fontSize: 14, fontWeight: 700, color: sel ? '#065f46' : '#475569' }}>{fmt$(c.monto_final)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Forma de pago */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Forma de Pago *</label>
              <select style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
                value={forma_pago} onChange={e => setFormaPago(e.target.value)}>
                {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Fecha de Pago</label>
              <input style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
                type="date" value={fecha_pago} onChange={e => setFechaPago(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Referencia / No. operación</label>
            <input style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
              value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Folio, transferencia, etc." />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Observaciones</label>
            <textarea style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', height: 56, resize: 'vertical' }}
              value={observaciones} onChange={e => setObservaciones(e.target.value)} />
          </div>

          {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
        </div>

        {/* Footer con total */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{cuotasSelec.length} cuota{cuotasSelec.length !== 1 ? 's' : ''} seleccionada{cuotasSelec.length !== 1 ? 's' : ''}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>{fmt$(totalCobro)}</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving || cuotasSelec.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (saving || cuotasSelec.length === 0) ? 0.6 : 1 }}>
              {saving ? <Loader size={14} /> : <Save size={14} />}
              Registrar Cobro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
