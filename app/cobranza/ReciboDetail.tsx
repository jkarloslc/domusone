'use client'
import { useEffect, useState } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { X, Ban, Printer, CheckCircle } from 'lucide-react'
import { type Recibo, type ReciboDetalle, type ReciboPago, fmt } from './types'

type Props = { recibo: Recibo; onClose: () => void; onCanceled: () => void }

export default function ReciboDetail({ recibo: r, onClose, onCanceled }: Props) {
  const [detalle, setDetalle]   = useState<ReciboDetalle[]>([])
  const [pagos, setPagos]       = useState<ReciboPago[]>([])
  const [canceling, setCanceling] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [motivo, setMotivo]     = useState('')

  useEffect(() => {
    dbCtrl.from('recibos_detalle').select('*').eq('id_recibo_fk', r.id).order('id')
      .then(({ data }) => setDetalle(data as ReciboDetalle[] ?? []))
    dbCtrl.from('recibos_pagos').select('*, formas_pago(nombre)').eq('id_recibo_fk', r.id)
      .then(({ data }) => setPagos((data ?? []).map((p: any) => ({ ...p, forma_nombre: p.formas_pago?.nombre }))))
  }, [r.id])

  const handleCancel = async () => {
    if (!motivo.trim()) return
    setCanceling(true)
    await dbCtrl.from('recibos').update({
      activo: false,
      usuario_cancela: 'sistema',
      fecha_cancela: new Date().toISOString(),
      motivo_cancelacion: motivo.trim(),
    }).eq('id', r.id)
    setCanceling(false)
    onCanceled()
  }

  const fmtFecha = (d: string | null) =>
    d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)' }}>
                {r.folio ?? `Recibo #${r.id}`}
              </span>
              <span className={`badge ${r.activo ? 'badge-vendido' : 'badge-bloqueado'}`}>
                {r.activo ? 'Activo' : 'Cancelado'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {r.tipo_concepto} · {r.tipo_cobranza} · {r.periodicidad}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {r.activo && (
              <button className="btn-ghost" style={{ color: '#f87171' }} onClick={() => setShowCancel(true)}>
                <Ban size={13} /> Cancelar
              </button>
            )}
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Cancelación */}
          {!r.activo && r.motivo_cancelacion && (
            <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: '#f87171', fontWeight: 600, marginBottom: 4 }}>RECIBO CANCELADO</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Motivo: {r.motivo_cancelacion}</div>
              {r.fecha_cancela && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtFecha(r.fecha_cancela.split('T')[0])}</div>}
            </div>
          )}

          {/* Cabecera datos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
            <InfoRow label="Lote" value={(r as any).lotes?.cve_lote ?? `#${r.id_lote_fk}`} gold />
            <InfoRow label="Propietario" value={r.propietario} />
            <InfoRow label="Fecha Recibo" value={fmtFecha(r.fecha_recibo)} />
            <InfoRow label="Fecha Pago" value={fmtFecha(r.fecha_pago)} />
            {r.fecha_de && <InfoRow label="Período" value={`${fmtFecha(r.fecha_de)} – ${fmtFecha(r.fecha_a ?? null)}`} />}
            <InfoRow label="Empresa" value={r.empresa} />
            {r.rfc_factura && <InfoRow label="RFC" value={r.rfc_factura} mono />}
            {r.folio_factura && <InfoRow label="Folio Factura" value={r.folio_factura} mono />}
          </div>

          {/* Detalle de líneas */}
          <div>
            <SectionLabel>Conceptos</SectionLabel>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Concepto', 'Cant.', 'P.U.', 'Desc.', 'Total'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Concepto' ? 'left' : 'right', padding: '6px 8px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalle.map((d, i) => (
                  <tr key={i}>
                    <td style={{ padding: '8px', color: 'var(--text-primary)' }}>
                      {d.concepto}
                      {(d.periodo_mes || d.periodo_anio) && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.periodo_mes} {d.periodo_anio}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{d.cantidad}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.precio_unitario)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{d.descuento ? fmt(d.descuento) : '—'}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--gold-light)' }}>{fmt(d.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ padding: '10px 8px', textAlign: 'right', fontSize: 13, fontWeight: 600, borderTop: '1px solid var(--border)' }}>TOTAL</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 15, fontWeight: 600, color: 'var(--gold-light)', borderTop: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.monto)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Formas de pago */}
          {pagos.length > 0 && (
            <div>
              <SectionLabel>Formas de Pago</SectionLabel>
              {pagos.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--surface-700)', borderRadius: 6, marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 13 }}>{p.forma_nombre ?? 'Efectivo'}</span>
                    {p.referencia && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{p.referencia}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {p.fecha && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtFecha(p.fecha)}</span>}
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#4ade80' }}>{fmt(p.monto)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formulario cancelación */}
          {showCancel && (
            <div style={{ padding: '14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: '#f87171', fontWeight: 600, marginBottom: 8 }}>Cancelar Recibo</div>
              <label className="label">Motivo de cancelación *</label>
              <textarea className="input" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Describe el motivo de la cancelación…" style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowCancel(false)}>Cancelar</button>
                <button className="btn-primary" style={{ background: '#ef4444' }} onClick={handleCancel} disabled={canceling || !motivo.trim()}>
                  {canceling ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /></> : <Ban size={13} />}
                  Confirmar Cancelación
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>{children}</div>
}
function InfoRow({ label, value, gold, mono }: { label: string; value?: string | null; gold?: boolean; mono?: boolean }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: gold ? 'var(--gold-light)' : 'var(--text-primary)', fontFamily: gold ? 'var(--font-display)' : mono ? 'monospace' : 'inherit' }}>{value}</div>
    </div>
  )
}
