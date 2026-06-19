'use client'
import { useState, useEffect, useRef } from 'react'
import { dbCtrl, dbCfg, dbGolf } from '@/lib/supabase'
import { X, Save, Loader, Search, FileText, CheckCircle, UserSearch } from 'lucide-react'
import {
  timbrarCFDI, USOS_CFDI, FORMAS_PAGO_SAT, METODOS_PAGO,
  REGIMENES_FISCALES, RFC_PUBLICO_GENERAL, DATOS_PUBLICO_GENERAL,
  type DatosFactura, type ConceptoFactura
} from '@/lib/pacService'
import ModalShell from '@/components/ui/ModalShell'

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
  const [montoFacturar, setMontoFacturar] = useState<number>(reciboInicial?.monto_total ?? 0)
  const [parcial, setParcial]       = useState(false)

  // Datos receptor
  const [receptor, setReceptor] = useState({
    rfc:              '',
    razon_social:     '',
    uso_cfdi:         'G03',
    regimen_fiscal:   '626',
    cp:               '',
  })

  // Búsqueda de socio para prellenar datos fiscales
  const [socioSearch, setSocioSearch]       = useState('')
  const [socioResults, setSocioResults]     = useState<any[]>([])
  const [socioFiscalMsg, setSocioFiscalMsg] = useState('')   // confirmación al precargar
  const [fiscalOptionsSocio, setFiscalOptionsSocio] = useState<any[]>([])  // datos fiscales del socio elegido, si tiene 2+
  const socioSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Datos CFDI
  const [cfdi, setCfdi] = useState({
    serie:          '',   // Dejar vacío si no hay serie registrada en Facturama
    metodo_pago:    'PUE',
    forma_pago:     '03',
    descripcion:    'Cuota de mantenimiento y servicios residenciales',
    clave_prod_serv:'80101601',
    tasa_iva:       '0',   // '0' = Exento/No objeto | '0.16' = 16 %
  })

  // Config del emisor
  const [emisor, setEmisor] = useState({ rfc: '', razon_social: '', regimen_fiscal: '626', cp: '' })

  useEffect(() => {
    // Cargar datos del emisor desde cfg.configuracion
    dbCfg.from('configuracion').select('clave, valor')
      .in('clave', ['org_rfc', 'org_nombre', 'org_regimen_fiscal', 'org_cp_fiscal'])
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((r: any) => { map[r.clave] = r.valor ?? '' })
        setEmisor({
          rfc:             map['org_rfc'] ?? '',
          razon_social:    map['org_nombre'] ?? '',
          regimen_fiscal:  map['org_regimen_fiscal'] ?? '626',
          cp:              map['org_cp_fiscal'] ?? '',
        })
      })
  }, [])

  // Buscar recibo
  useEffect(() => {
    if (reciboInicial || reciboSearch.length < 2) { setReciboResults([]); return }
    const timer = setTimeout(() => {
      dbCtrl.from('recibos_ingreso')
        .select('id, folio, fecha, descripcion, monto_total, status, folio_fiscal')
        .ilike('folio', `%${reciboSearch}%`)
        .eq('status', 'Confirmado')
        .is('folio_fiscal', null)
        .limit(8)
        .then(({ data }) => setReciboResults(data ?? []))
    }, 300)
    return () => clearTimeout(timer)
  }, [reciboSearch, reciboInicial])

  const seleccionarRecibo = (r: any) => {
    setRecibo(r)
    setMontoFacturar(r.monto_total ?? 0)
    setReciboSearch(r.folio ?? `#${r.id}`)
    setReciboResults([])
  }

  // Búsqueda de socios para precargar datos fiscales (paso 2)
  useEffect(() => {
    if (socioSearch.length < 2) { setSocioResults([]); return }
    if (socioSearchTimer.current) clearTimeout(socioSearchTimer.current)
    socioSearchTimer.current = setTimeout(async () => {
      const words = socioSearch.trim().split(/\s+/).filter(Boolean)
      let qb: any = dbGolf.from('cat_socios')
        .select('id, nombre, apellido_paterno, apellido_materno, numero_socio, rfc, razon_social_fiscal, cp_fiscal, regimen_fiscal, uso_cfdi')
        .eq('activo', true)
      for (const w of words) {
        qb = qb.or(`nombre.ilike.%${w}%,apellido_paterno.ilike.%${w}%,apellido_materno.ilike.%${w}%,numero_socio.ilike.%${w}%`)
      }
      const { data } = await qb.order('apellido_paterno').limit(8)
      setSocioResults(data ?? [])
    }, 300)
  }, [socioSearch])

  const aplicarFiscalOpcion = (opt: any, nombreCompleto: string) => {
    setReceptor(r => ({
      ...r,
      rfc:            opt.rfc            || r.rfc,
      razon_social:   opt.razon_social_fiscal || nombreCompleto,
      regimen_fiscal: opt.regimen_fiscal || '626',
      uso_cfdi:       opt.uso_cfdi       || 'G03',
      cp:             opt.cp_fiscal      || r.cp,
    }))
    setSocioFiscalMsg(`✓ Datos fiscales de ${opt.alias || nombreCompleto} precargados`)
    setSocioSearch('')
    setSocioResults([])
    setFiscalOptionsSocio([])
  }

  const precargarFiscalSocio = async (s: any) => {
    const nombreCompleto = [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')
    const { data: fiscales } = await dbGolf.from('cat_socios_datos_fiscales')
      .select('id, alias, rfc, razon_social_fiscal, cp_fiscal, regimen_fiscal, uso_cfdi')
      .eq('id_socio_fk', s.id)
      .order('es_principal', { ascending: false })
      .order('created_at')

    if (fiscales && fiscales.length > 1) {
      // El socio tiene varios datos fiscales: dejar que el usuario elija
      setFiscalOptionsSocio(fiscales.map(f => ({ ...f, _nombreSocio: nombreCompleto })))
      setSocioResults([])
      return
    }

    const opt = fiscales && fiscales.length === 1 ? fiscales[0] : s
    aplicarFiscalOpcion(opt, nombreCompleto)
  }

  // Calcular IVA y totales (dinámico)
  const tasaIva  = Number(cfdi.tasa_iva)        // 0 ó 0.16
  const subtotal = montoFacturar
  const iva      = Math.round(subtotal * tasaIva * 100) / 100
  const total    = subtotal + iva

  const handleTimbrar = async () => {
    if (!recibo) { setError('Selecciona un recibo'); return }
    if (!receptor.rfc.trim()) { setError('RFC del receptor es obligatorio'); return }
    if (!receptor.razon_social.trim()) { setError('Razón Social del receptor es obligatoria'); return }
    if (!emisor.rfc) { setError('Configura el RFC del emisor en el módulo Configuración'); return }
    if (montoFacturar <= 0) { setError('El monto a facturar debe ser mayor a cero'); return }

    setSaving(true); setError('')

    try {
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
        objeto_imp:      tasaIva > 0 ? '02' : '01',
        tasa_iva:        tasaIva,
      }]

      const datosFactura: DatosFactura = {
        rfc_emisor:            emisor.rfc,
        razon_social_emisor:   emisor.razon_social,
        regimen_fiscal:        emisor.regimen_fiscal,
        cp_emisor:             emisor.cp || undefined,
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
      console.log('[FacturaModal] resultado PAC:', resultado)

      if (!resultado.ok) {
        const msg = resultado.error || 'Error desconocido del PAC. Revisa la consola del servidor.'
        setError('Error del PAC: ' + msg)
        setSaving(false)
        return
      }

      // Guardar en BD
      const { error: dbErr } = await dbCtrl.from('facturas').insert({
        id_recibo_fk:          recibo.id,
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

      if (dbErr) { setError('Error al guardar en BD: ' + dbErr.message); setSaving(false); return }

      // Actualizar folio_fiscal en el recibo de ingreso
      await dbCtrl.from('recibos_ingreso').update({ folio_fiscal: resultado.folio_fiscal }).eq('id', recibo.id)

      setSaving(false)
      onSaved()

    } catch (err: any) {
      console.error('[FacturaModal] excepción en handleTimbrar:', err)
      setError('Error inesperado: ' + (err?.message ?? String(err)))
      setSaving(false)
    }
  }

  const setR = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setReceptor(r => ({ ...r, [k]: e.target.value }))

  // Auto-rellena cuando se detecta el RFC de Público en General
  const handleRfcReceptor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rfc = e.target.value.toUpperCase()
    if (rfc === RFC_PUBLICO_GENERAL) {
      setReceptor(r => ({
        ...r,
        rfc,
        razon_social:   DATOS_PUBLICO_GENERAL.razon_social,
        regimen_fiscal: DATOS_PUBLICO_GENERAL.regimen_fiscal,
        uso_cfdi:       DATOS_PUBLICO_GENERAL.uso_cfdi,
        cp:             DATOS_PUBLICO_GENERAL.cp,
      }))
    } else {
      setReceptor(r => ({ ...r, rfc }))
    }
  }

  return (
    <ModalShell modulo="facturas" titulo="Modal" onClose={onClose} maxWidth={620}
      footer={<>
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
      </>}
    >
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
                            <span style={{ fontSize: 12, color: '#64748b' }}>{fmt(r.monto_total ?? 0)} · {new Date(r.fecha).toLocaleDateString('es-MX')}</span>
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
                        ['Fecha',       new Date(recibo.fecha).toLocaleDateString('es-MX')],
                        ['Descripción', recibo.descripcion ?? '—'],
                        ['Monto total', fmt(recibo.monto_total ?? 0)],
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
                      <button onClick={() => { setParcial(false); setMontoFacturar(recibo.monto_total ?? 0) }}
                        style={{ flex: 1, padding: '8px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, border: `1px solid ${!parcial ? 'var(--blue)' : '#e2e8f0'}`, background: !parcial ? 'var(--blue-pale)' : '#fff', color: !parcial ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: !parcial ? 600 : 400 }}>
                        Completo — {fmt(recibo.monto_total ?? 0)}
                      </button>
                      <button onClick={() => setParcial(true)}
                        style={{ flex: 1, padding: '8px', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, border: `1px solid ${parcial ? 'var(--blue)' : '#e2e8f0'}`, background: parcial ? 'var(--blue-pale)' : '#fff', color: parcial ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: parcial ? 600 : 400 }}>
                        Parcial
                      </button>
                    </div>
                    {parcial && (
                      <input className="input" type="number" step="0.01" min="0.01" max={recibo.monto_total}
                        value={montoFacturar} onChange={e => setMontoFacturar(Number(e.target.value))}
                        placeholder={`Máximo ${fmt(recibo.monto_total ?? 0)}`} />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* PASO 2 — Receptor */}
          {paso === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* ── Buscador de socio para precargar fiscal ── */}
              <div style={{ padding: '12px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8 }}>
                <label className="label" style={{ color: '#0369a1', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <UserSearch size={13} /> Precargar datos fiscales de un Socio (opcional)
                </label>
                <div style={{ position: 'relative' }}>
                  <input className="input" placeholder="Busca por nombre o número de socio…"
                    value={socioSearch}
                    onChange={e => { setSocioSearch(e.target.value); setSocioFiscalMsg('') }}
                    style={{ paddingLeft: 32 }} />
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                </div>
                {socioResults.length > 0 && (
                  <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                    {socioResults.map(s => {
                      const nombre = [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')
                      return (
                        <button key={s.id} onClick={() => precargarFiscalSocio(s)}
                          style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{nombre}</span>
                            {s.numero_socio && <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b' }}>#{s.numero_socio}</span>}
                          </div>
                          <span style={{ fontSize: 11, color: s.rfc ? '#15803d' : '#94a3b8', fontFamily: 'monospace' }}>
                            {s.rfc || 'Sin RFC'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {fiscalOptionsSocio.length > 0 && (
                  <div className="card" style={{ marginTop: 4, padding: '8px 0' }}>
                    <div style={{ padding: '0 14px 6px', fontSize: 11.5, fontWeight: 600, color: '#0369a1' }}>
                      Elige el dato fiscal a facturar
                    </div>
                    {fiscalOptionsSocio.map(opt => (
                      <button key={opt.id} onClick={() => aplicarFiscalOpcion(opt, opt._nombreSocio)}
                        style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{opt.alias || opt.razon_social_fiscal}</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#15803d', fontFamily: 'monospace' }}>{opt.rfc}</span>
                      </button>
                    ))}
                  </div>
                )}
                {socioFiscalMsg && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#15803d', fontWeight: 500 }}>{socioFiscalMsg}</div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <div>
                  <label className="label">RFC Receptor *</label>
                  <input className="input" value={receptor.rfc} onChange={handleRfcReceptor}
                    placeholder="XAXX010101000" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} />
                  {receptor.rfc.toUpperCase() === RFC_PUBLICO_GENERAL && (
                    <div style={{ marginTop: 4, fontSize: 11, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4 }}>
                      ⚡ Público en General — régimen, uso CFDI y razón social pre-llenados
                    </div>
                  )}
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
              <div>
                <label className="label">Tasa IVA</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { valor: '0',    label: '0 % — Exento / No objeto' },
                    { valor: '0.16', label: '16 % — Gravado'           },
                  ].map(op => (
                    <button key={op.valor} type="button"
                      onClick={() => setCfdi(c => ({ ...c, tasa_iva: op.valor }))}
                      style={{
                        flex: 1, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                        fontFamily: 'var(--font-body)', fontSize: 13,
                        border: `1px solid ${cfdi.tasa_iva === op.valor ? 'var(--blue)' : '#e2e8f0'}`,
                        background: cfdi.tasa_iva === op.valor ? 'var(--blue-pale)' : '#fff',
                        color: cfdi.tasa_iva === op.valor ? 'var(--blue)' : 'var(--text-secondary)',
                        fontWeight: cfdi.tasa_iva === op.valor ? 600 : 400,
                      }}>
                      {op.label}
                    </button>
                  ))}
                </div>
                {tasaIva > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                    IVA estimado: <strong>{fmt(iva)}</strong> · Total: <strong style={{ color: 'var(--blue)' }}>{fmt(total)}</strong>
                  </div>
                )}
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
                  ['Subtotal',                                fmt(subtotal)],
                  [`IVA (${tasaIva > 0 ? '16 %' : 'Exento'})`, fmt(iva)],
                  ['Total a Facturar',                         fmt(total)],
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
    </ModalShell>
  )
}
