'use client'
import { useState, useEffect, useRef } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { X, Save, Loader, CheckCircle, Printer, Receipt } from 'lucide-react'

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

type FormaPago = { id: number; nombre: string }

type Socio = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  numero_socio: string | null
  email: string | null
  telefono: string | null
  cat_categorias_socios?: { nombre: string } | null
}

type Props = {
  cuotas: Cuota[]
  nombreSocio: string
  idSocio: number
  onClose: () => void
  onSaved: () => void
}

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const hoy  = new Date().toISOString().split('T')[0]
const vencida = (f: string | null) => !!f && f < hoy

const TIPOS_LABEL: Record<string, string> = {
  INSCRIPCION:     'Inscripción',
  MENSUALIDAD:     'Mensualidad',
  PENSION_CARRITO: 'Pensión Carrito',
}

// ── Config de la institución (ajusta a tu realidad) ──────────
const INSTITUCION = {
  nombre:    'Club de Golf Balvanera',
  rfc:       'CGB000101AAA',
  domicilio: 'Balvanera, Corregidora, Querétaro',
  tel:       '',
  logo:      '/logo.png',   // opcional – si existe en /public
}

export default function CobrarCuotaModal({ cuotas, nombreSocio, idSocio, onClose, onSaved }: Props) {
  const { authUser } = useAuth()

  const [formasPago, setFormasPago]     = useState<FormaPago[]>([])
  const [socioInfo, setSocioInfo]       = useState<Socio | null>(null)
  const [loadingInit, setLoadingInit]   = useState(true)

  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set(cuotas.map(c => c.id)))
  const [descuentoExtra, setDescuentoExtra] = useState('')   // descuento adicional en $ sobre el total
  const [idFormaPago, setIdFormaPago]   = useState<number>(0)
  const [referencia, setReferencia]     = useState('')
  const [fechaPago, setFechaPago]       = useState(hoy)
  const [observaciones, setObservaciones] = useState('')
  const [facturable, setFacturable]     = useState(false)

  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [recibo, setRecibo]     = useState<{ id: number; folio: string } | null>(null)

  const printRef = useRef<HTMLDivElement>(null)

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre'),
      dbGolf.from('cat_socios')
        .select('id, nombre, apellido_paterno, apellido_materno, numero_socio, email, telefono, cat_categorias_socios(nombre)')
        .eq('id', idSocio).single(),
    ]).then(([{ data: fps }, { data: soc }]) => {
      const fpsList = (fps as FormaPago[]) ?? []
      setFormasPago(fpsList)
      if (fpsList.length) setIdFormaPago(fpsList[0].id)
      setSocioInfo(soc as unknown as Socio)
      setLoadingInit(false)
    })
  }, [idSocio])

  // ── Cálculos ───────────────────────────────────────────────
  const toggleCuota = (id: number) => {
    setSeleccionadas(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const cuotasSelec   = cuotas.filter(c => seleccionadas.has(c.id))
  const subtotalBruto = cuotasSelec.reduce((a, c) => a + c.monto_final, 0)
  const descExtra     = Math.min(parseFloat(descuentoExtra) || 0, subtotalBruto)
  const totalCobro    = Math.max(0, subtotalBruto - descExtra)
  const formaPagoNombre = formasPago.find(f => f.id === idFormaPago)?.nombre ?? ''

  // ── Guardar cobro ──────────────────────────────────────────
  const handleSave = async () => {
    if (cuotasSelec.length === 0) { setError('Selecciona al menos una cuota'); return }
    if (!idFormaPago) { setError('Selecciona forma de pago'); return }
    setSaving(true); setError('')

    // 1. Generar folio
    const anio = new Date().getFullYear()
    const { data: folioData } = await dbGolf.rpc('next_folio_recibo', { anio })
    const folio = (folioData as string) ?? `RG-${anio}-?????`

    // 2. Insertar recibo cabecera
    const { data: reciboData, error: e1 } = await dbGolf.from('recibos_golf').insert({
      folio,
      id_socio_fk:      idSocio,
      fecha_recibo:     fechaPago,
      subtotal:         subtotalBruto,
      descuento:        descExtra,
      total:            totalCobro,
      id_forma_pago_fk: idFormaPago,
      forma_pago_nombre: formaPagoNombre,
      referencia_pago:  referencia || null,
      observaciones:    observaciones || null,
      usuario_cobra:    authUser?.nombre ?? 'sistema',
      status:           'VIGENTE',
      facturable,
    }).select('id, folio').single()

    if (e1 || !reciboData) { setError(e1?.message ?? 'Error al crear recibo'); setSaving(false); return }
    const reciboId = (reciboData as { id: number; folio: string }).id
    const folioFinal = (reciboData as { id: number; folio: string }).folio

    // 3. Insertar detalle del recibo
    const detRows = cuotasSelec.map(c => ({
      id_recibo_fk:  reciboId,
      id_cuota_fk:   c.id,
      concepto:      c.concepto,
      tipo:          c.tipo,
      periodo:       c.periodo,
      monto_original: c.monto_original,
      descuento:     c.descuento,
      monto_final:   c.monto_final,
    }))
    const { error: e2 } = await dbGolf.from('recibos_golf_det').insert(detRows)
    if (e2) { setError(e2.message); setSaving(false); return }

    // 4. Marcar cuotas como PAGADO y vincular al recibo
    const { error: e3 } = await dbGolf.from('cxc_golf').update({
      status:          'PAGADO',
      fecha_pago:      fechaPago,
      forma_pago:      formaPagoNombre,
      referencia_pago: referencia || null,
      observaciones:   observaciones || null,
      usuario_cobra:   authUser?.nombre ?? null,
      id_recibo_fk:    reciboId,
    }).in('id', cuotasSelec.map(c => c.id))

    if (e3) { setError(e3.message); setSaving(false); return }

    setSaving(false)
    setRecibo({ id: reciboId, folio: folioFinal })
  }

  // ── Imprimir ───────────────────────────────────────────────
  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=750,height=900')
    if (!win || !printRef.current) return
    win.document.write(`
      <!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Recibo ${recibo?.folio}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #1e3a5f; padding-bottom: 16px; }
        .inst-name { font-size: 18px; font-weight: 700; color: #1e3a5f; }
        .inst-sub  { font-size: 11px; color: #64748b; margin-top: 2px; }
        .folio-box { text-align: right; }
        .folio-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
        .folio-val { font-size: 20px; font-weight: 700; color: #1e3a5f; }
        .section   { margin-bottom: 18px; }
        .section-title { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
        .info-item label { font-size: 10px; color: #64748b; display: block; margin-bottom: 1px; }
        .info-item span  { font-size: 12px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { padding: 7px 10px; background: #1e3a5f; color: #fff; font-size: 10px; text-align: left; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        tr:last-child td { border-bottom: none; }
        .right { text-align: right; }
        .totales { margin-left: auto; width: 260px; }
        .totales-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
        .totales-row.total { font-weight: 700; font-size: 15px; border-top: 2px solid #1e3a5f; padding-top: 8px; margin-top: 4px; color: #1e3a5f; }
        .pago-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
        .pago-label { font-size: 10px; color: #15803d; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
        .pago-val   { font-size: 14px; font-weight: 700; color: #15803d; }
        .firma-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
        .firma-line { border-top: 1px solid #1e293b; padding-top: 4px; font-size: 10px; color: #64748b; text-align: center; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
        .badge-fact { background: #eff6ff; color: #1d4ed8; }
        .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const nc = (s: Socio | null) => s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : nombreSocio
  const fechaFmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

  // ── Panel de recibo emitido ────────────────────────────────
  if (recibo) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
        <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: '#dcfce7', borderRadius: 8, padding: 8 }}><CheckCircle size={20} color="#16a34a" /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>Cobro registrado</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Folio: <strong>{recibo.folio}</strong></div>
              </div>
            </div>
            <button onClick={onSaved} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
          </div>

          {/* Vista previa del recibo */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            <div ref={printRef}>
              {/* ── RECIBO IMPRIMIBLE ── */}
              <div className="header">
                <div>
                  <div className="inst-name">{INSTITUCION.nombre}</div>
                  <div className="inst-sub">{INSTITUCION.domicilio}</div>
                  {INSTITUCION.rfc && <div className="inst-sub">RFC: {INSTITUCION.rfc}</div>}
                </div>
                <div className="folio-box">
                  <div className="folio-lbl">Recibo de Cobro</div>
                  <div className="folio-val">{recibo.folio}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fechaFmt(fechaPago)}</div>
                  {facturable && <span className="badge badge-fact" style={{ marginTop: 4 }}>Facturable</span>}
                </div>
              </div>

              <div className="section">
                <div className="section-title">Datos del Socio</div>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Nombre</label>
                    <span>{nc(socioInfo)}</span>
                  </div>
                  {socioInfo?.numero_socio && (
                    <div className="info-item">
                      <label>No. Socio</label>
                      <span>{socioInfo.numero_socio}</span>
                    </div>
                  )}
                  {socioInfo?.cat_categorias_socios?.nombre && (
                    <div className="info-item">
                      <label>Categoría</label>
                      <span>{socioInfo.cat_categorias_socios.nombre}</span>
                    </div>
                  )}
                  {socioInfo?.email && (
                    <div className="info-item">
                      <label>Email</label>
                      <span>{socioInfo.email}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="section">
                <div className="section-title">Detalle de Cuotas</div>
                <table>
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th>Tipo</th>
                      <th>Período</th>
                      <th className="right">Monto</th>
                      <th className="right">Desc.</th>
                      <th className="right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuotasSelec.map(c => (
                      <tr key={c.id}>
                        <td>{c.concepto}</td>
                        <td>{TIPOS_LABEL[c.tipo] ?? c.tipo}</td>
                        <td>{c.periodo ?? '—'}</td>
                        <td className="right">{fmt$(c.monto_original)}</td>
                        <td className="right">{c.descuento > 0 ? fmt$(c.descuento) : '—'}</td>
                        <td className="right" style={{ fontWeight: 600 }}>{fmt$(c.monto_final)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="totales">
                  <div className="totales-row">
                    <span>Subtotal</span>
                    <span>{fmt$(subtotalBruto)}</span>
                  </div>
                  {descExtra > 0 && (
                    <div className="totales-row">
                      <span>Descuento adicional</span>
                      <span style={{ color: '#dc2626' }}>– {fmt$(descExtra)}</span>
                    </div>
                  )}
                  <div className="totales-row total">
                    <span>TOTAL</span>
                    <span>{fmt$(totalCobro)}</span>
                  </div>
                </div>
              </div>

              <div className="pago-box">
                <div>
                  <div className="pago-label">Forma de pago</div>
                  <div className="pago-val">{formaPagoNombre}</div>
                </div>
                {referencia && (
                  <div style={{ marginLeft: 32 }}>
                    <div className="pago-label">Referencia</div>
                    <div className="pago-val" style={{ fontSize: 12 }}>{referencia}</div>
                  </div>
                )}
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div className="pago-label">Emitido por</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>{authUser?.nombre ?? '—'}</div>
                </div>
              </div>

              {observaciones && (
                <div style={{ fontSize: 11, color: '#64748b', padding: '8px 12px', background: '#f8fafc', borderRadius: 6, marginBottom: 16 }}>
                  <strong>Observaciones:</strong> {observaciones}
                </div>
              )}

              <div className="firma-area">
                <div className="firma-line">Firma del Socio</div>
                <div className="firma-line">Cajero / Recibí</div>
              </div>

              <div className="footer">
                Este recibo es comprobante de pago de cuotas del club. Para facturación, presentar este folio en administración.<br/>
                {INSTITUCION.nombre} · {new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {cuotasSelec.length} cuota{cuotasSelec.length !== 1 ? 's' : ''} cobrada{cuotasSelec.length !== 1 ? 's' : ''} · {fmt$(totalCobro)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onSaved} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cerrar</button>
              <button onClick={handlePrint}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#1e3a5f', color: '#fff', cursor: 'pointer' }}>
                <Printer size={14} /> Imprimir Recibo
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Formulario de cobro ────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>

        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Receipt size={18} color="#059669" />
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>Cobrar Cuotas</h2>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{nombreSocio}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loadingInit ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}><Loader size={20} className="animate-spin" /></div>
          ) : (
            <>
              {/* Lista de cuotas seleccionables */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
                  Cuotas pendientes — selecciona las que vas a cobrar
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cuotas.map(c => {
                    const sel  = seleccionadas.has(c.id)
                    const venc = vencida(c.fecha_vencimiento)
                    return (
                      <div key={c.id} onClick={() => toggleCuota(c.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1px solid ${sel ? '#059669' : '#e2e8f0'}`, borderRadius: 8, background: sel ? '#ecfdf5' : '#fff', cursor: 'pointer', transition: 'all 0.1s' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? '#059669' : '#cbd5e1'}`, background: sel ? '#059669' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <CheckCircle size={12} color="#fff" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{c.concepto}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', gap: 8 }}>
                            {c.periodo && <span>{c.periodo}</span>}
                            {c.fecha_vencimiento && (
                              <span style={{ color: venc ? '#dc2626' : '#94a3b8' }}>
                                {venc ? '⚠ Vencida' : 'Vence'} {new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                            <span style={{ padding: '1px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 600 }}>
                              {TIPOS_LABEL[c.tipo] ?? c.tipo}
                            </span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {c.descuento > 0 && <div style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(c.monto_original)}</div>}
                          <div style={{ fontSize: 14, fontWeight: 700, color: sel ? '#059669' : '#475569' }}>{fmt$(c.monto_final)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Descuento adicional */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Descuento adicional ($)</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                    type="number" min="0" step="0.01"
                    value={descuentoExtra}
                    onChange={e => setDescuentoExtra(e.target.value)}
                    placeholder="0.00"
                  />
                  {descExtra > 0 && (
                    <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>– {fmt$(descExtra)} sobre el total</div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Fecha de pago</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                    type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
                  />
                </div>
              </div>

              {/* Forma de pago */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Forma de pago *</label>
                  <select
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                    value={idFormaPago} onChange={e => setIdFormaPago(Number(e.target.value))}>
                    <option value={0}>— Seleccionar —</option>
                    {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Referencia / No. operación</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                    value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Folio, transferencia, etc."
                  />
                </div>
              </div>

              {/* Observaciones y facturable */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Observaciones</label>
                <textarea
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', height: 52, resize: 'vertical' }}
                  value={observaciones} onChange={e => setObservaciones(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: facturable ? '#eff6ff' : '#f8fafc', border: `1px solid ${facturable ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer' }}
                onClick={() => setFacturable(f => !f)}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${facturable ? '#2563eb' : '#cbd5e1'}`, background: facturable ? '#2563eb' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {facturable && <CheckCircle size={12} color="#fff" />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: facturable ? '#1d4ed8' : '#475569' }}>Solicita factura</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Marca este cobro como facturable para emisión posterior</div>
                </div>
              </div>

              {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
            </>
          )}
        </div>

        {/* Footer con total */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{cuotasSelec.length} cuota{cuotasSelec.length !== 1 ? 's' : ''} · subtotal {fmt$(subtotalBruto)}</div>
            {descExtra > 0 && <div style={{ fontSize: 11, color: '#dc2626' }}>– descuento {fmt$(descExtra)}</div>}
            <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{fmt$(totalCobro)}</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleSave} disabled={saving || cuotasSelec.length === 0 || !idFormaPago}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (saving || cuotasSelec.length === 0 || !idFormaPago) ? 0.6 : 1 }}>
              {saving ? <Loader size={14} className="animate-spin" /> : <Receipt size={14} />}
              Registrar cobro
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
