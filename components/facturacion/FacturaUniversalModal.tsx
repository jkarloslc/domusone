'use client'
import { useState, useEffect } from 'react'
import { dbCfg } from '@/lib/supabase'
import { Loader, CheckCircle, FileCheck, Send, X, ChevronRight } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import {
  timbrarCFDI, USOS_CFDI, FORMAS_PAGO_SAT, METODOS_PAGO,
  REGIMENES_FISCALES, type DatosFactura,
} from '@/lib/pacService'

// ── Tipos ──────────────────────────────────────────────────────────
export type ReceptorPreFill = {
  rfc?:            string
  razon_social?:   string
  cp?:             string
  regimen_fiscal?: string
  uso_cfdi?:       string
  email?:          string
}

type Concepto = { descripcion: string; importe: number }

export type Props = {
  titulo:         string       // e.g. "Facturar Recibo RG-2026-001"
  folio:          string       // folio interno del recibo
  total:          number
  fecha:          string       // YYYY-MM-DD
  conceptos:      Concepto[]
  receptorInit?:  ReceptorPreFill
  formaPagoStr?:  string       // nombre de la forma de pago (para mapear al SAT)
  onClose:        () => void
  onSaved:        (folio_fiscal: string) => void
  saveFactura:    (folio_fiscal: string, xml?: string, pdf_url?: string) => Promise<void>
}

// ── Helpers ────────────────────────────────────────────────────────
const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

const mapFormaPagoSAT = (nombre: string): string => {
  const n = nombre.toLowerCase()
  if (n.includes('efectivo'))   return '01'
  if (n.includes('cheque'))     return '02'
  if (n.includes('transferencia') || n.includes('transfer')) return '03'
  if (n.includes('tarjeta') && n.includes('crédito'))        return '04'
  if (n.includes('tarjeta') && n.includes('débito'))         return '28'
  if (n.includes('tarjeta'))    return '04'
  return '99'  // Por definir
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 13,
  border: '1px solid #e2e8f0', borderRadius: 8,
  background: '#fff', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#64748b',
  display: 'block', marginBottom: 4,
}
const selectStyle: React.CSSProperties = { ...inputStyle }

const PASOS = ['Receptor', 'Comprobante', 'Confirmar', 'Emitida']

export default function FacturaUniversalModal({
  titulo, folio, total, fecha, conceptos,
  receptorInit = {}, formaPagoStr = '',
  onClose, onSaved, saveFactura,
}: Props) {
  const [paso, setPaso] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState(false)
  const [resultado, setResultado] = useState<{ folio_fiscal: string; pdf_url?: string }>()

  // Datos del emisor (desde cfg.configuracion)
  const [emisor, setEmisor] = useState({ rfc: '', razon_social: '', regimen_fiscal: '626' })

  // Datos del receptor
  const [receptor, setReceptor] = useState({
    rfc:            receptorInit.rfc           ?? '',
    razon_social:   receptorInit.razon_social  ?? '',
    cp:             receptorInit.cp            ?? '',
    regimen_fiscal: receptorInit.regimen_fiscal ?? '626',
    uso_cfdi:       receptorInit.uso_cfdi       ?? 'G03',
    email:          receptorInit.email          ?? '',
  })

  // Datos del comprobante
  const [cfdi, setCfdi] = useState({
    serie:          'A',
    metodo_pago:    'PUE',
    forma_pago:     mapFormaPagoSAT(formaPagoStr),
    descripcion:    conceptos.length === 1
      ? conceptos[0].descripcion
      : 'Servicios de club y membresía',
    clave_prod_serv: '80101601',
  })

  const setR = (k: keyof typeof receptor, v: string) => setReceptor(r => ({ ...r, [k]: v }))
  const setC = (k: keyof typeof cfdi,     v: string) => setCfdi(c => ({ ...c, [k]: v }))

  // Cargar emisor desde cfg.configuracion
  useEffect(() => {
    dbCfg.from('configuracion').select('clave, valor')
      .in('clave', ['org_rfc', 'org_nombre', 'org_regimen_fiscal'])
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((r: any) => { map[r.clave] = r.valor ?? '' })
        setEmisor({
          rfc:            map['org_rfc']            ?? '',
          razon_social:   map['org_nombre']         ?? '',
          regimen_fiscal: map['org_regimen_fiscal'] ?? '626',
        })
      })
  }, [])

  // ── Timbrar CFDI ─────────────────────────────────────────────
  const handleTimbrar = async () => {
    if (!receptor.rfc.trim())          { setError('RFC del receptor es obligatorio'); return }
    if (!receptor.razon_social.trim()) { setError('Razón Social es obligatoria'); return }
    if (!receptor.cp.trim())           { setError('Código Postal es obligatorio'); return }
    if (!emisor.rfc)                   { setError('Configura el RFC del emisor en Configuración'); return }

    setSaving(true); setError('')

    const datosFactura: DatosFactura = {
      rfc_emisor:            emisor.rfc,
      razon_social_emisor:   emisor.razon_social,
      regimen_fiscal:        emisor.regimen_fiscal,
      rfc_receptor:          receptor.rfc.toUpperCase().trim(),
      razon_social_receptor: receptor.razon_social.trim(),
      uso_cfdi:              receptor.uso_cfdi,
      regimen_fiscal_receptor: receptor.regimen_fiscal,
      cp_receptor:           receptor.cp.trim(),
      serie:                 cfdi.serie,
      folio_interno:         folio,
      metodo_pago:           cfdi.metodo_pago,
      forma_pago:            cfdi.forma_pago,
      moneda:                'MXN',
      tipo_cambio:           1,
      conceptos: conceptos.map(c => ({
        cantidad:          1,
        unidad:            'E48',
        clave_prod_serv:   cfdi.clave_prod_serv,
        descripcion:       c.descripcion || cfdi.descripcion,
        precio_unitario:   c.importe,
        importe:           c.importe,
        objeto_imp:        '02',
        tasa_iva:          0,
      })),
    }

    const res = await timbrarCFDI(datosFactura)
    if (!res.ok) {
      setError(res.error ?? 'Error al timbrar')
      setSaving(false)
      return
    }

    // Guardar folio_fiscal en la BD
    try {
      await saveFactura(res.folio_fiscal!, res.xml_cfdi, res.pdf_url)
    } catch (e: any) {
      setError('Factura timbrada pero no se pudo guardar el folio: ' + e.message)
      setSaving(false)
      return
    }

    setResultado({ folio_fiscal: res.folio_fiscal!, pdf_url: res.pdf_url })
    setSaving(false)
    setPaso(4)
  }

  // ── Enviar email ───────────────────────────────────────────────
  const handleEnviarEmail = async () => {
    if (!receptor.email || !resultado) return
    setEnviandoEmail(true)
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:      receptor.email,
          subject: `Factura ${resultado.folio_fiscal} — ${folio}`,
          html: `
            <p>Estimado cliente,</p>
            <p>Adjuntamos la factura electrónica con los siguientes datos:</p>
            <ul>
              <li><strong>Folio fiscal (UUID):</strong> ${resultado.folio_fiscal}</li>
              <li><strong>Recibo:</strong> ${folio}</li>
              <li><strong>Monto:</strong> ${fmt$(total)}</li>
              <li><strong>Fecha:</strong> ${fecha}</li>
            </ul>
            ${resultado.pdf_url ? `<p><a href="${resultado.pdf_url}">Descargar PDF de la factura</a></p>` : ''}
            <p>Para cualquier aclaración, comuníquese con administración.</p>
            <p><em>${emisor.razon_social}</em></p>
          `,
        }),
      })
      setEmailEnviado(true)
    } catch (e: any) {
      setError('No se pudo enviar el correo: ' + e?.message)
    }
    setEnviandoEmail(false)
  }

  // ── Render ─────────────────────────────────────────────────────
  const stepDot = (n: number) => (
    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: paso > n ? '#7c3aed' : paso === n ? '#ede9fe' : '#f1f5f9',
        color:      paso > n ? '#fff'    : paso === n ? '#7c3aed' : '#94a3b8',
        border: paso === n ? '2px solid #7c3aed' : '2px solid transparent',
      }}>
        {paso > n ? '✓' : n}
      </div>
      <span style={{ fontSize: 12, color: paso === n ? '#7c3aed' : paso > n ? '#475569' : '#94a3b8', fontWeight: paso === n ? 700 : 400 }}>
        {PASOS[n - 1]}
      </span>
      {n < 4 && <ChevronRight size={12} color="#cbd5e1" />}
    </div>
  )

  const footer = paso < 4 ? (
    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
      {paso > 1 && paso < 4 && (
        <button onClick={() => setPaso(p => p - 1)} disabled={saving}
          style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
          Atrás
        </button>
      )}
      <button onClick={onClose} disabled={saving}
        style={{ padding: '8px 14px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
        Cancelar
      </button>
      {paso < 3 && (
        <button onClick={() => setPaso(p => p + 1)}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer' }}>
          Siguiente →
        </button>
      )}
      {paso === 3 && (
        <button onClick={handleTimbrar} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? <Loader size={14} className="animate-spin" /> : <FileCheck size={14} />}
          {saving ? 'Timbrando…' : 'Timbrar CFDI'}
        </button>
      )}
    </div>
  ) : (
    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
      {receptor.email && !emailEnviado && (
        <button onClick={handleEnviarEmail} disabled={enviandoEmail}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: '1px solid #a7f3d0', borderRadius: 8, background: '#ecfdf5', color: '#047857', cursor: 'pointer', opacity: enviandoEmail ? 0.6 : 1 }}>
          {enviandoEmail ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
          Enviar por email
        </button>
      )}
      {emailEnviado && <span style={{ fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /> Email enviado</span>}
      <button onClick={() => onSaved(resultado?.folio_fiscal ?? '')}
        style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer' }}>
        Cerrar
      </button>
    </div>
  )

  return (
    <ModalShell modulo="facturacion" titulo={titulo} subtitulo={`Recibo ${folio} · ${fmt$(total)}`}
      maxWidth={560} icono={FileCheck} onClose={onClose} footer={footer}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(n => stepDot(n))}
        </div>

        {/* ── Paso 1: Datos del Receptor ── */}
        {paso === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>Datos del Receptor (Quien recibe la factura)</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>RFC *</label>
                <input style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
                  value={receptor.rfc} onChange={e => setR('rfc', e.target.value.toUpperCase())} placeholder="XAXX010101000" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Nombre / Razón Social *</label>
                <input style={inputStyle}
                  value={receptor.razon_social} onChange={e => setR('razon_social', e.target.value)} placeholder="Nombre completo o razón social" />
              </div>
              <div>
                <label style={labelStyle}>Código Postal *</label>
                <input style={inputStyle} type="text" maxLength={5}
                  value={receptor.cp} onChange={e => setR('cp', e.target.value)} placeholder="76001" />
              </div>
              <div>
                <label style={labelStyle}>Régimen Fiscal</label>
                <select style={selectStyle} value={receptor.regimen_fiscal} onChange={e => setR('regimen_fiscal', e.target.value)}>
                  {REGIMENES_FISCALES.map(r => <option key={r.clave} value={r.clave}>{r.clave} — {r.desc}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Uso CFDI</label>
                <select style={selectStyle} value={receptor.uso_cfdi} onChange={e => setR('uso_cfdi', e.target.value)}>
                  {USOS_CFDI.map(u => <option key={u.clave} value={u.clave}>{u.clave} — {u.desc}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Correo electrónico (para envío)</label>
                <input style={inputStyle} type="email"
                  value={receptor.email} onChange={e => setR('email', e.target.value)} placeholder="correo@ejemplo.com" />
              </div>
            </div>
          </div>
        )}

        {/* ── Paso 2: Datos del Comprobante ── */}
        {paso === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>Datos del Comprobante</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Descripción (concepto principal)</label>
                <input style={inputStyle}
                  value={cfdi.descripcion} onChange={e => setC('descripcion', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Método de Pago</label>
                <select style={selectStyle} value={cfdi.metodo_pago} onChange={e => setC('metodo_pago', e.target.value)}>
                  {METODOS_PAGO.map(m => <option key={m.clave} value={m.clave}>{m.clave} — {m.desc}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Forma de Pago SAT</label>
                <select style={selectStyle} value={cfdi.forma_pago} onChange={e => setC('forma_pago', e.target.value)}>
                  {FORMAS_PAGO_SAT.map(f => <option key={f.clave} value={f.clave}>{f.clave} — {f.desc}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Serie</label>
                <input style={inputStyle} value={cfdi.serie} onChange={e => setC('serie', e.target.value)} placeholder="A" />
              </div>
              <div>
                <label style={labelStyle}>Clave Prod/Serv SAT</label>
                <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={cfdi.clave_prod_serv} onChange={e => setC('clave_prod_serv', e.target.value)} placeholder="80101601" />
              </div>
            </div>

            {/* Resumen conceptos */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginTop: 4 }}>
              <div style={{ padding: '8px 12px', background: '#f8fafc', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Conceptos a facturar
              </div>
              {conceptos.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #f1f5f9', fontSize: 12 }}>
                  <span style={{ color: '#475569' }}>{c.descripcion}</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{fmt$(c.importe)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderTop: '2px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#7c3aed', background: '#faf5ff' }}>
                <span>Total</span>
                <span>{fmt$(total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Paso 3: Confirmación ── */}
        {paso === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>Confirmar y Timbrar</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 16px', background: '#f8fafc', borderRadius: 10, fontSize: 12 }}>
              <div><span style={{ color: '#94a3b8' }}>Emisor RFC: </span><strong>{emisor.rfc || '—'}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Receptor RFC: </span><strong>{receptor.rfc}</strong></div>
              <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#94a3b8' }}>Receptor: </span><strong>{receptor.razon_social}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Uso CFDI: </span><strong>{receptor.uso_cfdi}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>CP: </span><strong>{receptor.cp}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Método pago: </span><strong>{cfdi.metodo_pago}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Forma pago: </span><strong>{cfdi.forma_pago}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Folio interno: </span><strong>{folio}</strong></div>
              <div><span style={{ color: '#94a3b8' }}>Total: </span><strong style={{ color: '#7c3aed' }}>{fmt$(total)}</strong></div>
            </div>

            {!emisor.rfc && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                ⚠ Configura el RFC del emisor en <strong>Configuración → Organización</strong> antes de timbrar.
              </div>
            )}
          </div>
        )}

        {/* ── Paso 4: Factura emitida ── */}
        {paso === 4 && resultado && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle size={48} color="#7c3aed" style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>¡Factura timbrada exitosamente!</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>El folio fiscal ha sido vinculado al recibo.</div>

            <div style={{ background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>UUID / Folio Fiscal</div>
              <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#4c1d95', wordBreak: 'break-all' }}>{resultado.folio_fiscal}</div>
            </div>

            {resultado.pdf_url && (
              <a href={resultado.pdf_url} target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: '1px solid #ddd6fe', borderRadius: 8, background: '#ede9fe', color: '#7c3aed', textDecoration: 'none', marginBottom: 12 }}>
                <FileCheck size={14} /> Ver PDF
              </a>
            )}

            {receptor.email && (
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {emailEnviado
                  ? <span style={{ color: '#15803d' }}>✓ Comprobante enviado a {receptor.email}</span>
                  : `Puedes enviar el comprobante a ${receptor.email}`}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
