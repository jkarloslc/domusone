'use client'
import { useState } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { X, Printer, Mail, XCircle, Download, CheckCircle, Loader, AlertTriangle } from 'lucide-react'
import { cancelarCFDI } from '@/lib/pacService'

const fmt = (v: number | null | undefined) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

type Props = {
  factura:    any
  onClose:    () => void
  onCanceled: () => void
}

const MOTIVOS_CANCELACION = [
  { clave: '01', desc: 'Comprobante emitido con errores con relación' },
  { clave: '02', desc: 'Comprobante emitido sin relación' },
  { clave: '03', desc: 'No se llevó a cabo la operación' },
  { clave: '04', desc: 'Operación nominativa relacionada en la factura global' },
]

export default function FacturaDetail({ factura: f, onClose, onCanceled }: Props) {
  const [cancelando, setCancelando]     = useState(false)
  const [showCancelar, setShowCancelar] = useState(false)
  const [motivo, setMotivo]             = useState('02')
  const [enviando, setEnviando]         = useState(false)
  const [correoEnvio, setCorreoEnvio]   = useState(f.correo_enviado_a ?? '')
  const [showEmail, setShowEmail]       = useState(false)
  const [msg, setMsg]                   = useState('')

  const handleCancelar = async () => {
    setCancelando(true); setMsg('')
    const resultado = await cancelarCFDI(f.folio_fiscal, f.rfc_emisor, motivo)
    if (!resultado.ok) {
      setMsg('Error al cancelar: ' + resultado.error)
      setCancelando(false); return
    }
    await dbCtrl.from('facturas').update({
      status:             'Cancelada',
      fecha_cancelacion:  new Date().toISOString(),
      motivo_cancelacion: MOTIVOS_CANCELACION.find(m => m.clave === motivo)?.desc,
    }).eq('id', f.id)
    setCancelando(false)
    onCanceled()
  }

  const handleEnviarCorreo = async () => {
    if (!correoEnvio.trim()) { setMsg('Ingresa un correo válido'); return }
    setEnviando(true); setMsg('')
    // El envío real se implementa con el PAC o con un servicio de email (SendGrid, Resend, etc.)
    // Por ahora registramos el intento en BD
    await dbCtrl.from('facturas').update({
      correo_enviado_a: correoEnvio.trim(),
      fecha_envio:      new Date().toISOString(),
    }).eq('id', f.id)
    setMsg('✓ Factura marcada como enviada a ' + correoEnvio)
    setEnviando(false)
    setShowEmail(false)
  }

  const handleImprimir = () => {
    if (f.pdf_url) {
      window.open(f.pdf_url, '_blank')
      return
    }
    // Imprimir desde pantalla si no hay PDF timbrado
    window.print()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>
                {f.serie}{f.folio_interno}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                background: f.status === 'Vigente' ? '#f0fdf4' : f.status === 'Cancelada' ? '#fef2f2' : '#fffbeb',
                color:      f.status === 'Vigente' ? '#15803d' : f.status === 'Cancelada' ? '#dc2626' : '#d97706',
                border:     `1px solid ${f.status === 'Vigente' ? '#bbf7d0' : f.status === 'Cancelada' ? '#fecaca' : '#fde68a'}`,
              }}>
                {f.status}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {f.folio_fiscal ?? 'Sin folio fiscal'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {f.status === 'Vigente' && (
              <>
                <button className="btn-secondary" onClick={handleImprimir} style={{ fontSize: 12 }}>
                  <Printer size={13} /> {f.pdf_url ? 'PDF' : 'Imprimir'}
                </button>
                {f.pdf_url && (
                  <a href={f.pdf_url} download className="btn-secondary" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Download size={13} /> XML
                  </a>
                )}
                <button className="btn-secondary" onClick={() => setShowEmail(e => !e)} style={{ fontSize: 12 }}>
                  <Mail size={13} /> Enviar
                </button>
                <button className="btn-ghost" onClick={() => setShowCancelar(e => !e)} style={{ color: '#dc2626', fontSize: 12 }}>
                  <XCircle size={13} /> Cancelar
                </button>
              </>
            )}
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(88vh - 80px)', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {msg && (
            <div style={{ padding: '10px 14px', background: msg.startsWith('✓') ? '#f0fdf4' : '#fef2f2', border: `1px solid ${msg.startsWith('✓') ? '#bbf7d0' : '#fecaca'}`, borderRadius: 6, fontSize: 13, color: msg.startsWith('✓') ? '#15803d' : '#dc2626' }}>
              {msg}
            </div>
          )}

          {/* Panel envío por correo */}
          {showEmail && (
            <div style={{ padding: '14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, display: 'flex', flex: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--blue)', marginBottom: 8 }}>Enviar por correo electrónico</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" type="email" placeholder="correo@ejemplo.com" value={correoEnvio}
                  onChange={e => setCorreoEnvio(e.target.value)} style={{ flex: 1 }} />
                <button className="btn-primary" onClick={handleEnviarCorreo} disabled={enviando} style={{ fontSize: 12 }}>
                  {enviando ? <Loader size={13} className="animate-spin" /> : <Mail size={13} />}
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
              {f.correo_enviado_a && (
                <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 4 }}>
                  ✓ Enviado anteriormente a: {f.correo_enviado_a} — {fmtFecha(f.fecha_envio)}
                </div>
              )}
            </div>
          )}

          {/* Panel cancelación */}
          {showCancelar && f.status === 'Vigente' && (
            <div style={{ padding: '14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} /> Cancelar Factura
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="label">Motivo de Cancelación (SAT)</label>
                <select className="select" value={motivo} onChange={e => setMotivo(e.target.value)}>
                  {MOTIVOS_CANCELACION.map(m => <option key={m.clave} value={m.clave}>{m.clave} — {m.desc}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 10 }}>
                Esta acción no puede deshacerse. La cancelación se envía al SAT a través del PAC.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" onClick={() => setShowCancelar(false)} style={{ fontSize: 12 }}>Cancelar</button>
                <button onClick={handleCancelar} disabled={cancelando}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-body)' }}>
                  {cancelando ? <Loader size={13} className="animate-spin" /> : <XCircle size={13} />}
                  {cancelando ? 'Cancelando…' : 'Confirmar Cancelación'}
                </button>
              </div>
            </div>
          )}

          {/* Datos del CFDI */}
          <Section label="Comprobante">
            <Row2>
              <DataItem label="Folio Interno" value={`${f.serie}${f.folio_interno}`} mono />
              <DataItem label="Fecha Emisión" value={fmtFecha(f.fecha_emision)} />
            </Row2>
            <DataItem label="UUID / Folio Fiscal" value={f.folio_fiscal} mono />
            {f.status === 'Cancelada' && (
              <Row2>
                <DataItem label="Fecha Cancelación"   value={fmtFecha(f.fecha_cancelacion)} />
                <DataItem label="Motivo Cancelación"  value={f.motivo_cancelacion} />
              </Row2>
            )}
          </Section>

          <Section label="Emisor">
            <Row2>
              <DataItem label="RFC"          value={f.rfc_emisor} mono />
              <DataItem label="Razón Social" value={f.razon_social_emisor} />
            </Row2>
            <DataItem label="Régimen Fiscal" value={f.regimen_fiscal} />
          </Section>

          <Section label="Receptor">
            <Row2>
              <DataItem label="RFC"          value={f.rfc_receptor} mono />
              <DataItem label="Razón Social" value={f.razon_social_receptor} />
            </Row2>
            <Row2>
              <DataItem label="Uso CFDI"     value={f.uso_cfdi} />
              <DataItem label="Método Pago"  value={f.metodo_pago} />
            </Row2>
          </Section>

          <Section label="Totales">
            <Row2>
              <DataItem label="Subtotal" value={fmt(f.subtotal)} />
              <DataItem label="IVA"      value={fmt(f.iva)} />
            </Row2>
            <div style={{ padding: '10px 14px', background: 'var(--blue-pale)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>TOTAL</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(f.total)}</span>
            </div>
          </Section>

          {f.correo_enviado_a && (
            <Section label="Envío">
              <Row2>
                <DataItem label="Enviado a"   value={f.correo_enviado_a} />
                <DataItem label="Fecha Envío" value={fmtFecha(f.fecha_envio)} />
              </Row2>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

const Section = ({ label, children }: { children: React.ReactNode; label: string }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 5, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
  </div>
)
const Row2 = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
)
const DataItem = ({ label, value, mono = false }: { label: string; value?: any; mono?: boolean }) => (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13, color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: mono ? 'monospace' : undefined }}>{value ?? '—'}</div>
  </div>
)
