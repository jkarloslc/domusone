'use client'
import { useState, useEffect } from 'react'
import { dbCtrl, dbCat, dbCfg, supabase } from '@/lib/supabase'
import { X, Save, Loader, Search, FileText, CheckCircle } from 'lucide-react'
import {
  timbrarCFDI, USOS_CFDI, FORMAS_PAGO_SAT, METODOS_PAGO,
  REGIMENES_FISCALES, type DatosFactura, type ConceptoFactura
} from '@/lib/pacService'

const fmt = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

type Props = {
  reciboInicial?: any   // si viene desde un recibo específico
  onClose: () => void
  onSaved: () => void
}

export default function FacturaModal({ reciboInicial, onClose, onSaved }: Props) {
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [paso, setPaso]             = useState(1)    // 1=Recibo, 2=Receptor, 3=CFDI, 4=Confirmar

  // Búsqueda de recibo
  const [reciboSearch, setReciboSearch] = useState(reciboInicial?.folio ?? '')
  const [reciboResults, setReciboResults] = useState<any[]>([])
  const [recibo, setRecibo]         = useState<any>(reciboInicial ?? null)

  // Montos
  const [montoFacturar, setMontoFacturar] = useState<number>(reciboInicial?.monto ?? 0)
  const [parcial, setParcial]       = useState(false)

  // Datos receptor
  const [receptor, setReceptor] = useState({
    rfc:              '',
    razon_social:     '',
    uso_cfdi:         'G03',
    regimen_fiscal:   '626',
    cp:               '',
  })

  // Datos CFDI
  const [cfdi, setCfdi] = useState({
    serie:          'A',
    metodo_pago:    'PUE',
    forma_pago:     '03',
    descripcion:    'Cuota de mantenimiento y servicios residenciales',
    clave_prod_serv:'80101601',
  })

  // Config del emisor
  const [emisor, setEmisor] = useState({ rfc: '', razon_social: '', regimen_fiscal: '626' })

  useEffect(() => {
    // Cargar datos del emisor desde cfg.configuracion
    dbCfg.from('configuracion').select('clave, valor')
      .in('clave', ['org_rfc', 'org_nombre', 'org_regimen_fiscal'])
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((r: any) => { map[r.clave] = r.valor ?? '' })
        setEmisor({
          rfc:             map['org_rfc'] ?? '',
          razon_social:    map['org_nombre'] ?? '',
          regimen_fiscal:  map['org_regimen_fiscal'] ?? '626',
        })
      })
  }, [])

  // Buscar recibo
  useEffect(() => {
    if (reciboInicial || reciboSearch.length < 2) { setReciboResults([]); return }
    const timer = setTimeout(() => {
      dbCtrl.from('recibos').select('*')
        .ilike('folio', `%${reciboSearch}%`)
        .eq('activo', true).limit(8)
        .then(({ data }) => setReciboResults(data ?? []))
    }, 300)
    return () => clearTimeout(timer)
  }, [reciboSearch, reciboInicial])

  const seleccionarRecibo = async (r: any) => {
    setRecibo(r)
    setMontoFacturar(r.monto)
    setReciboSearch(r.folio ?? `#${r.id}`)
    setReciboResults([])

    // Pre-llenar datos del receptor si el recibo tiene RFC
    if (r.rfc_factura) {
      setReceptor(prev => ({
        ...prev,
        rfc:          r.rfc_factura,
        razon_social: r.razon_social_factura ?? '',
      }))
    } else if (r.id_lote_fk) {
      // Buscar lote y propietario principal
      const { data: lote } = await dbCat.from('lotes').select('rfc_para_factura, razon_social_para_factura').eq('id', r.id_lote_fk).single()
      if (lote?.rfc_para_factura) {
        setReceptor(prev => ({
          ...prev,
          rfc:          lote.rfc_para_factura,
          razon_social: lote.razon_social_para_factura ?? '',
        }))
      }
    }
  }

  // Calcular IVA y totales
  const subtotal = montoFacturar
  const iva      = 0  // Cuotas de mantenimiento generalmente exentas
  const total    = subtotal + iva

  const handleTimbrar = async () => {
    if (!recibo) { setError('Selecciona un recibo'); return }
    if (!receptor.rfc.trim()) { setError('RFC del receptor es obligatorio'); return }
    if (!receptor.razon_social.trim()) { setError('Razón Social del receptor es obligatoria'); return }
    if (!emisor.rfc) { setError('Configura el RFC del emisor en el módulo Configuración'); return }
    if (montoFacturar <= 0) { setError('El monto a facturar debe ser mayor a cero'); return }

    setSaving(true); setError('')

    // Construir folio interno
    const { count } = await dbCtrl.from('facturas').select('id', { count: 'exact', head: true })
    const folioNum = (count ?? 0) + 1
    const folioInterno = String(folioNum).padStart(5, '0')

    const conceptos: ConceptoFactura[] = [{
      cantidad:        1,
      unidad:          'E48',
      clave_prod_serv: cfdi.clave_prod_serv,
      descripcion:     cfdi.descripcion,
      precio_unitario: subtotal,
      importe:         subtotal,
      objeto_imp:      '01',  // No objeto de impuesto para cuotas de mantenimiento
      tasa_iva:        0,
    }]

    const datosFactura: DatosFactura = {
      rfc_emisor:            emisor.rfc,
      razon_social_emisor:   emisor.razon_social,
      regimen_fiscal:        emisor.regimen_fiscal,
      rfc_receptor:          receptor.rfc.toUpperCase().trim(),
      razon_social_receptor: receptor.razon_social.trim(),
      uso_cfdi:              receptor.uso_cfdi,
      regimen_fiscal_receptor: receptor.regimen_fiscal,
      cp_receptor:           receptor.cp || undefined,
      serie:                 cfdi.serie,
      folio_interno:         folioInterno,
      metodo_pago:           cfdi.metodo_pago,
      forma_pago:            cfdi.forma_pago,
      moneda:                'MXN',
      tipo_cambio:           1,
      conceptos,
    }

    const resultado = await timbrarCFDI(datosFactura)

    if (!resultado.ok) {
      setError('Error del PAC: ' + resultado.error)
      setSaving(false)
      return
    }

    // Guardar en BD
    const { error: dbErr } = await dbCtrl.from('facturas').insert({
      id_recibo_fk:          recibo.id,
      id_lote_fk:            recibo.id_lote_fk,
      folio_fiscal:          resultado.folio_fiscal,
      folio_interno:         folioInterno,
      serie:                 cfdi.serie,
      numero:                folioNum,
      rfc_emisor:            emisor.rfc,
      razon_social_emisor:   emisor.razon_social,
      regimen_fiscal:        emisor.regimen_fiscal,
      rfc_receptor:          receptor.rfc.toUpperCase().trim(),
      razon_social_receptor: receptor.razon_social.trim(),
      uso_cfdi:              receptor.uso_cfdi,
      metodo_pago:           cfdi.metodo_pago,
      forma_pago:            cfdi.forma_pago,
      subtotal,
      iva,
      total,
      moneda:                'MXN',
      tipo_cambio:           1,
      status:                resultado.folio_fiscal?.startsWith('SIMULADO') ? 'Simulada' : 'Vigente',
      xml_cfdi:              resultado.xml_cfdi,
      pdf_url:               resultado.pdf_url,
      pac_respuesta:         resultado.pac_respuesta,
    })

    if (dbErr) { setError(dbErr.message); setSaving(false); return }

    // Actualizar folio_fiscal en el recibo
    await dbCtrl.from('recibos').update({ folio_fiscal: resultado.folio_fiscal }).eq('id', recibo.id)

    setSaving(false)
    onSaved()
  }

  const setR = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setReceptor(r => ({ ...r, [k]: e.target.value }))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600 }}>Nueva Factura</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Comprobante Fiscal Digital (CFDI 4.0)</p>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', padding: '12px 24px', gap: 4, borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {['Recibo', 'Receptor', 'CFDI', 'Confirmar'].map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                background: paso > i+1 ? '#15803d' : paso === i+1 ? 'var(--blue)' : '#e2e8f0',
                color: paso >= i+1 ? '#fff' : '#94a3b8',
              }}>
                {paso > i+1 ? <CheckCircle size={12} /> : i+1}
              </div>
              <span style={{ fontSize: 11, color: paso === i+1 ? 'var(--blue)' : '#94a3b8', fontWeight: paso === i+1 ? 600 : 400 }}>{label}</span>
              {i < 3 && <div style={{ flex: 1, height: 1, background: paso > i+1 ? '#15803d' : '#e2e8f0', margin: '0 4px' }} />}
            </div>
          ))}
        </div>

        <div style={{ padding: '20px 24px', minHeight: 300, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* PASO 1 — Recibo */}
          {paso === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Recibo a Facturar *</label>
                {reciboInicial ? (
                  <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, color: 'var(--blue)' }}>{recibo?.folio ?? `#${recibo?.id}`}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Monto: {fmt(recibo?.monto ?? 0)}</div>
                  </div>
                ) : (
                  <>
                    <input className="input" placeholder="Busca por folio…" value={reciboSearch}
                      onChange={e => { setReciboSearch(e.target.value); setRecibo(null) }} />
                    {reciboResults.length > 0 && (
                      <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                        {reciboResults.map(r => (
                          <button key={r.id} onClick={() => seleccionarRecibo(r)}
                            style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{r.folio ?? `#${r.id}`}</span>
                            <span style={{ fontSize: 12, color: '#64748b' }}>{fmt(r.monto)} · {new Date(r.fecha_recibo).toLocaleDateString('es-MX')}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {recibo && (
                <>
                  <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Resumen del Recibo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[
                        ['Folio',       recibo.folio ?? `#${recibo.id}`],
                        ['Fecha',       new Date(recibo.fecha_recibo).toLocaleDateString('es-MX')],
                        ['Propietario', recibo.propietario ?? '—'],
                        ['Monto total', fmt(recibo.monto)],
                      ].map(([l, v]) => (
                        <div key={l}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</span>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Facturación parcial */}
                  <div>
                    <label className="label">Monto a Facturar</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                      <button onClick={() => { setParcial(false); setMontoFacturar(recibo.monto) }}
                        style={{ flex: 1, padding: '8px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, border: `1px solid ${!parcial ? 'var(--blue)' : '#e2e8f0'}`, background: !parcial ? 'var(--blue-pale)' : '#fff', color: !parcial ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: !parcial ? 600 : 400 }}>
                        Completo — {fmt(recibo.monto)}
                      </button>
                      <button onClick={() => setParcial(true)}
                        style={{ flex: 1, padding: '8px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, border: `1px solid ${parcial ? 'var(--blue)' : '#e2e8f0'}`, background: parcial ? 'var(--blue-pale)' : '#fff', color: parcial ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: parcial ? 600 : 400 }}>
                        Parcial
                      </button>
                    </div>
                    {parcial && (
                      <input className="input" type="number" step="0.01" min="0.01" max={recibo.monto}
                        value={montoFacturar} onChange={e => setMontoFacturar(Number(e.target.value))}
                        placeholder={`Máximo ${fmt(recibo.monto)}`} />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* PASO 2 — Receptor */}
          {paso === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <div>
                  <label className="label">RFC Receptor *</label>
                  <input className="input" value={receptor.rfc} onChange={setR('rfc')}
                    placeholder="XAXX010101000" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} />
                </div>
                <div>
                  <label className="label">Razón Social *</label>
                  <input className="input" value={receptor.razon_social} onChange={setR('razon_social')} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Uso CFDI</label>
                  <select className="select" value={receptor.uso_cfdi} onChange={setR('uso_cfdi')}>
                    {USOS_CFDI.map(u => <option key={u.clave} value={u.clave}>{u.clave} — {u.desc}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Régimen Fiscal Receptor</label>
                  <select className="select" value={receptor.regimen_fiscal} onChange={setR('regimen_fiscal')}>
                    {REGIMENES_FISCALES.map(r => <option key={r.clave} value={r.clave}>{r.clave} — {r.desc}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">C.P. del Receptor</label>
                <input className="input" style={{ maxWidth: 120 }} value={receptor.cp} onChange={setR('cp')} placeholder="76000" />
              </div>
            </div>
          )}

          {/* PASO 3 — CFDI */}
          {paso === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10 }}>
                <div>
                  <label className="label">Serie</label>
                  <input className="input" value={cfdi.serie} onChange={e => setCfdi(c => ({ ...c, serie: e.target.value }))} maxLength={5} />
                </div>
                <div>
                  <label className="label">Clave Prod/Serv SAT</label>
                  <input className="input" value={cfdi.clave_prod_serv} onChange={e => setCfdi(c => ({ ...c, clave_prod_serv: e.target.value }))}
                    placeholder="80101601" style={{ fontFamily: 'monospace' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Método de Pago</label>
                  <select className="select" value={cfdi.metodo_pago} onChange={e => setCfdi(c => ({ ...c, metodo_pago: e.target.value }))}>
                    {METODOS_PAGO.map(m => <option key={m.clave} value={m.clave}>{m.clave} — {m.desc}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Forma de Pago</label>
                  <select className="select" value={cfdi.forma_pago} onChange={e => setCfdi(c => ({ ...c, forma_pago: e.target.value }))}>
                    {FORMAS_PAGO_SAT.map(f => <option key={f.clave} value={f.clave}>{f.clave} — {f.desc}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Descripción del Concepto</label>
                <input className="input" value={cfdi.descripcion} onChange={e => setCfdi(c => ({ ...c, descripcion: e.target.value }))} />
              </div>
            </div>
          )}

          {/* PASO 4 — Confirmar */}
          {paso === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Resumen de la Factura</div>
                {[
                  ['Recibo',             recibo?.folio ?? `#${recibo?.id}`],
                  ['Emisor',             `${emisor.rfc} — ${emisor.razon_social}`],
                  ['Receptor',           `${receptor.rfc} — ${receptor.razon_social}`],
                  ['Uso CFDI',           receptor.uso_cfdi],
                  ['Método de Pago',     cfdi.metodo_pago],
                  ['Forma de Pago',      cfdi.forma_pago],
                  ['Serie',              cfdi.serie],
                  ['Subtotal',           fmt(subtotal)],
                  ['IVA',                fmt(iva)],
                  ['Total a Facturar',   fmt(total)],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: l === 'Total a Facturar' ? 'var(--blue)' : 'var(--text-primary)' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12, color: '#92400e' }}>
                ⚠ Una vez timbrado el CFDI no puede modificarse, solo cancelarse. Verifica los datos antes de continuar.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <div>
            {paso > 1 && <button className="btn-secondary" onClick={() => setPaso(p => p - 1)}>← Anterior</button>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            {paso < 4 ? (
              <button className="btn-primary"
                onClick={() => {
                  if (paso === 1 && !recibo) { setError('Selecciona un recibo'); return }
                  setError(''); setPaso(p => p + 1)
                }}>
                Siguiente →
              </button>
            ) : (
              <button className="btn-primary" onClick={handleTimbrar} disabled={saving}>
                {saving ? <><Loader size={13} className="animate-spin" /> Timbrando…</> : <><FileText size={13} /> Timbrar CFDI</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
