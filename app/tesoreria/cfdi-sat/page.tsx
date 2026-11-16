'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FileCode2, FileText, Download, RefreshCw, Plus, Loader, KeyRound, ShieldCheck,
  Search, FileSpreadsheet, AlertTriangle, CheckCircle, Clock, Receipt, Upload, Link2,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import ModalShell from '@/components/ui/ModalShell'
import Paginador from '@/components/ui/Paginador'
import { dbCtrl } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { fetchConAuth } from '@/lib/authFetch'
import { TIPO_COMPROBANTE } from '@/lib/cfdiXml'
import Conciliacion from './Conciliacion'

// Debe coincidir con ROLES_DESCARGA de lib/satServidor.ts (el servidor es quien valida)
const ROLES_DESCARGA = new Set([
  'superadmin', 'admin', 'admin_finanzas', 'admin_tesoreria', 'tesoreria',
  'admin_golf', 'admin_golf_finanzas', 'admin_golf_tesoreria',
  'admin_fracc', 'admin_fracc_finanzas', 'admin_fracc_tesoreria',
])

const STATUS_COLOR: Record<string, string> = {
  'Solicitada': '#32789A', 'En proceso': '#B5761A', 'Lista': '#126B63', 'Descargada': '#1F7A50',
  'Sin datos': '#62666E', 'Rechazada': '#C23B3B', 'Vencida': '#A8501F', 'Error': '#C23B3B',
}
const PENDIENTES = ['Solicitada', 'En proceso', 'Lista']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const fmt  = (n: number | null | undefined) => n == null ? '—' : '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (d: string | null) => d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtFH = (d: string | null) => d ? new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const num: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }

type Cfdi = {
  id: number; uuid: string; tipo_descarga: 'recibido' | 'emitido'; serie: string | null; folio: string | null
  fecha_emision: string | null; tipo_comprobante: string | null; rfc_emisor: string; nombre_emisor: string | null
  rfc_receptor: string; nombre_receptor: string | null; metodo_pago: string | null; forma_pago: string | null
  uso_cfdi: string | null; moneda: string | null; subtotal: number | null; descuento: number | null
  iva_trasladado: number | null; iva_retenido: number | null; isr_retenido: number | null; total: number | null
  estatus_sat: string; tiene_xml: boolean
}

function Aviso({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: `3px solid ${color}`, color,
      borderRadius: 8, padding: '10px 14px', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      {children}
    </div>
  )
}

const Badge = ({ s }: { s: string }) => (
  <span className="badge" style={{ background: STATUS_COLOR[s] ?? '#62666E', color: '#fff' }}>{s}</span>
)

// ══════════════════════════════════════════════════════════════
export default function CfdiSatPage() {
  const { authUser } = useAuth()
  const rol = authUser?.rolReal ?? ''
  const puede = ROLES_DESCARGA.has(rol)
  const esSuper = rol === 'superadmin'
  const [tab, setTab] = useState<'cfdi' | 'conciliacion' | 'solicitudes' | 'efirma'>('cfdi')
  const [modalNueva, setModalNueva] = useState(false)
  const [recarga, setRecarga] = useState(0)

  const tabs = [
    { key: 'cfdi', label: 'Comprobantes', icon: Receipt },
    { key: 'conciliacion', label: 'Conciliación con OP', icon: Link2 },
    { key: 'solicitudes', label: 'Solicitudes al SAT', icon: Clock },
    { key: 'efirma', label: 'e.firma', icon: KeyRound },
  ] as const

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        backHref="/tesoreria"
        icon={FileCode2}
        eyebrowLabel="Tesorería"
        title="CFDI del SAT"
        subtitle="Descarga masiva de facturas recibidas y emitidas con la e.firma"
        actions={puede ? (
          <button className="btn-primary" onClick={() => setModalNueva(true)}>
            <Plus size={14} /> Nueva solicitud
          </button>
        ) : undefined}
      />

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #E6E8EB', marginBottom: 20 }}>
        {tabs.map(t => {
          const active = tab === t.key, I = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13,
                fontWeight: active ? 700 : 500, color: active ? '#1C1D21' : '#62666E',
                borderBottom: active ? '2px solid #19D3C5' : '2px solid transparent', marginBottom: -2,
                display: 'flex', alignItems: 'center', gap: 6 }}>
              <I size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'cfdi' && <TabComprobantes />}
      {tab === 'conciliacion' && <Conciliacion puede={puede} />}
      {tab === 'solicitudes' && <TabSolicitudes puede={puede} recarga={recarga} />}
      {tab === 'efirma' && <TabEfirma esSuper={esSuper} />}

      {modalNueva && (
        <ModalNueva
          onClose={() => setModalNueva(false)}
          onCreada={() => { setModalNueva(false); setTab('solicitudes'); setRecarga(r => r + 1) }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Comprobantes descargados
// ══════════════════════════════════════════════════════════════
function TabComprobantes() {
  const hoy = new Date()
  const [tipo, setTipo]   = useState<'recibido' | 'emitido'>('recibido')
  // Por omisión, el mes anterior (1-12); 0 = todo el año
  const [anio, setAnio]   = useState(hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear())
  const [mes, setMes]     = useState<number>(hoy.getMonth() === 0 ? 12 : hoy.getMonth())
  const [tc, setTc]       = useState('')
  const [q, setQ]         = useState('')
  const [rows, setRows]   = useState<Cfdi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage]   = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [busy, setBusy]   = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true); setError('')
    const ini = mes ? `${anio}-${String(mes).padStart(2, '0')}-01` : `${anio}-01-01`
    const finD = mes ? new Date(anio, mes, 1) : new Date(anio + 1, 0, 1)
    const fin = `${finD.getFullYear()}-${String(finD.getMonth() + 1).padStart(2, '0')}-01`
    const todos: Cfdi[] = []
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await dbCtrl.from('cfdi_sat')
        .select('id, uuid, tipo_descarga, serie, folio, fecha_emision, tipo_comprobante, rfc_emisor, nombre_emisor, rfc_receptor, nombre_receptor, metodo_pago, forma_pago, uso_cfdi, moneda, subtotal, descuento, iva_trasladado, iva_retenido, isr_retenido, total, estatus_sat, tiene_xml')
        .eq('tipo_descarga', tipo).gte('fecha_emision', ini).lt('fecha_emision', fin)
        .order('fecha_emision', { ascending: false }).range(desde, desde + 999)
      if (error) { setError(error.message); break }
      todos.push(...((data ?? []) as Cfdi[]))
      if ((data ?? []).length < 1000) break
    }
    setRows(todos); setPage(1); setLoading(false)
  }, [tipo, anio, mes])
  useEffect(() => { cargar() }, [cargar])

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rows.filter(r => (!tc || r.tipo_comprobante === tc) && (!t ||
      [r.uuid, r.rfc_emisor, r.nombre_emisor, r.rfc_receptor, r.nombre_receptor, `${r.serie ?? ''}${r.folio ?? ''}`]
        .some(v => (v ?? '').toLowerCase().includes(t))))
  }, [rows, q, tc])

  const tot = useMemo(() => filtrados.reduce((a, r) => {
    const s = r.tipo_comprobante === 'E' ? -1 : 1   // notas de crédito restan
    const cuenta = (r.tipo_comprobante === 'I' || r.tipo_comprobante === 'E') && r.estatus_sat !== 'Cancelado'
    if (cuenta) { a.sub += s * (r.subtotal ?? 0) - s * (r.descuento ?? 0); a.iva += s * (r.iva_trasladado ?? 0); a.total += s * (r.total ?? 0) }
    return a
  }, { sub: 0, iva: 0, total: 0 }), [filtrados])

  const conXml = async (uuid: string, fn: (xml: string) => Promise<void> | void) => {
    setBusy(uuid)
    try {
      const { data, error } = await dbCtrl.from('cfdi_sat_xml').select('xml').eq('uuid', uuid).single()
      if (error || !data) throw new Error(error?.message ?? 'XML no encontrado')
      await fn((data as any).xml)
    } catch (e: any) { alert(e.message ?? String(e)) }
    finally { setBusy(null) }
  }
  const pdf = (uuid: string) => conXml(uuid, async xml => (await import('@/lib/cfdiPdf')).descargarPdfCfdi(xml))
  const xml = (uuid: string) => conXml(uuid, async x => (await import('@/lib/cfdiPdf')).descargarXml(x, uuid))

  const excel = async () => {
    const XLSX = await import('xlsx')
    const datos = filtrados.map(r => ({
      UUID: r.uuid, Fecha: r.fecha_emision?.slice(0, 10), Serie: r.serie, Folio: r.folio,
      Tipo: TIPO_COMPROBANTE[r.tipo_comprobante ?? ''] ?? r.tipo_comprobante,
      'RFC emisor': r.rfc_emisor, Emisor: r.nombre_emisor, 'RFC receptor': r.rfc_receptor, Receptor: r.nombre_receptor,
      'Uso CFDI': r.uso_cfdi, Método: r.metodo_pago, Forma: r.forma_pago, Moneda: r.moneda,
      Subtotal: r.subtotal, Descuento: r.descuento, IVA: r.iva_trasladado, 'IVA ret.': r.iva_retenido,
      'ISR ret.': r.isr_retenido, Total: r.total,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), tipo === 'recibido' ? 'Recibidos' : 'Emitidos')
    XLSX.writeFile(wb, `CFDI-SAT_${tipo === 'recibido' ? 'recibidos' : 'emitidos'}_${anio}${mes ? '-' + String(mes).padStart(2, '0') : ''}.xlsx`)
  }

  const visibles = filtrados.slice((page - 1) * pageSize, page * pageSize)
  const anios = Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - i)

  return (
    <>
      <div className="card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="label">Tipo</label>
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value as any)}>
            <option value="recibido">Recibidos (proveedores)</option>
            <option value="emitido">Emitidos (clientes)</option>
          </select>
        </div>
        <div>
          <label className="label">Año</label>
          <select className="select" value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Mes</label>
          <select className="select" value={mes} onChange={e => setMes(Number(e.target.value))}>
            <option value={0}>Todo el año</option>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Comprobante</label>
          <select className="select" value={tc} onChange={e => { setTc(e.target.value); setPage(1) }}>
            <option value="">Todos</option>
            {Object.entries(TIPO_COMPROBANTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <label className="label">Buscar</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9A9EA7' }} />
            <input className="input" style={{ paddingLeft: 30 }} value={q} placeholder="RFC, nombre, folio o UUID"
              onChange={e => { setQ(e.target.value); setPage(1) }} />
          </div>
        </div>
        <button className="btn-ghost" onClick={cargar} title="Actualizar" style={{ padding: '8px 10px' }}><RefreshCw size={14} /></button>
        <button className="btn-secondary" onClick={excel} disabled={!filtrados.length}><FileSpreadsheet size={14} /> Excel</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Comprobantes', value: filtrados.length.toLocaleString('es-MX'), icon: Receipt },
          { label: 'Subtotal (I − E)', value: fmt(tot.sub), icon: FileText },
          { label: 'IVA trasladado', value: fmt(tot.iva), icon: FileText },
          { label: 'Total (I − E)', value: fmt(tot.total), icon: FileText, tone: 'success' as const },
        ].map(k => <div key={k.label} style={{ flex: '1 1 180px', maxWidth: 260 }}><KpiCard {...k} /></div>)}
      </div>

      {error && <div style={{ marginBottom: 12 }}><Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso></div>}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Serie / Folio</th>
                <th>{tipo === 'recibido' ? 'Emisor' : 'Receptor'}</th>
                <th>Tipo</th>
                <th>Método</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
                <th style={{ textAlign: 'right' }}>IVA</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ width: 90, textAlign: 'center' }}>Archivos</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#62666E' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Cargando…</td></tr>
              ) : !visibles.length ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: '#62666E' }}>
                  Sin comprobantes en el periodo. Presenta una solicitud al SAT con “Nueva solicitud”.
                </td></tr>
              ) : visibles.map(r => {
                const nombre = tipo === 'recibido' ? r.nombre_emisor : r.nombre_receptor
                const rfc = tipo === 'recibido' ? r.rfc_emisor : r.rfc_receptor
                return (
                  <tr key={r.uuid}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtF(r.fecha_emision)}</td>
                    <td>
                      <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{[r.serie, r.folio].filter(Boolean).join('-') || '—'}</div>
                      <div style={{ fontSize: 10.5, color: '#9A9EA7' }} title={r.uuid}>{r.uuid.slice(0, 8)}…</div>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre || '—'}</div>
                      <div style={{ fontSize: 11, color: '#62666E' }}>{rfc}</div>
                    </td>
                    <td>
                      {TIPO_COMPROBANTE[r.tipo_comprobante ?? ''] ?? r.tipo_comprobante}
                      {r.estatus_sat === 'Cancelado' && <div><span className="badge" style={{ background: '#C23B3B', color: '#fff' }}>Cancelado</span></div>}
                    </td>
                    <td>{r.metodo_pago ?? '—'}</td>
                    <td style={num}>{fmt(r.subtotal)}</td>
                    <td style={num}>{fmt(r.iva_trasladado)}</td>
                    <td style={num}>{fmt(r.total)}</td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {!r.tiene_xml ? <span style={{ fontSize: 11, color: '#9A9EA7' }} title="Solo metadata: el SAT no entrega el XML">Sin XML</span> : busy === r.uuid ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : (
                        <>
                          <button className="btn-ghost" style={{ padding: '4px 6px' }} title="Descargar XML" onClick={() => xml(r.uuid)}><FileCode2 size={15} /></button>
                          <button className="btn-ghost" style={{ padding: '4px 6px' }} title="Descargar PDF" onClick={() => pdf(r.uuid)}><FileText size={15} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtrados.length > pageSize && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid #E6E8EB' }}>
            <Paginador page={page} pageSize={pageSize} totalItems={filtrados.length} onChange={setPage}
              onPageSizeChange={s => { setPageSize(s); setPage(1) }} />
          </div>
        )}
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// Solicitudes al SAT
// ══════════════════════════════════════════════════════════════
function TabSolicitudes({ puede, recarga }: { puede: boolean; recarga: number }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [verificando, setVerificando] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ color: string; text: string } | null>(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await dbCtrl.from('sat_solicitudes').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) setMsg({ color: '#C23B3B', text: error.message })
    setRows(data ?? []); setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar, recarga])

  const verificar = async (id: number) => {
    setVerificando(id); setMsg(null)
    try {
      const r = await fetchConAuth('/api/sat/verificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al verificar')
      const s = j.solicitud
      setRows(rs => rs.map(x => x.id === id ? s : x))
      if (j.aviso) setMsg({ color: '#B5761A', text: j.aviso })
      else if (s.status === 'Descargada') setMsg({ color: '#1F7A50', text: `Descarga completa: ${s.cfdis_guardados} CFDI guardados.` })
      else if (s.status === 'En proceso' || s.status === 'Solicitada') setMsg({ color: '#32789A', text: 'El SAT sigue preparando el paquete. Vuelve a verificar en unos minutos.' })
      if (j.errores?.length) setMsg({ color: '#B5761A', text: `${j.errores.length} archivo(s) no se pudieron leer: ${j.errores.slice(0, 3).join(' · ')}` })
      return s
    } catch (e: any) {
      setMsg({ color: '#C23B3B', text: e.message ?? String(e) })
    } finally { setVerificando(null) }
  }
  const verificarPendientes = async () => {
    for (const r of rows.filter(x => PENDIENTES.includes(x.status))) await verificar(r.id)
  }
  const hayPendientes = rows.some(x => PENDIENTES.includes(x.status))

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Aviso color="#32789A">
          <Clock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>El SAT no entrega al momento: arma un paquete que tarda de minutos a horas. Pulsa <strong>Verificar</strong> para
            consultar el avance; cuando esté listo, los XML se descargan y quedan en Comprobantes. El SAT limita repetir
            exactamente la misma solicitud, así que no la dupliques si ya está en proceso.</span>
        </Aviso>
      </div>
      {msg && <div style={{ marginBottom: 12 }}><Aviso color={msg.color}>{msg.text}</Aviso></div>}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 14px', borderBottom: '1px solid #E6E8EB' }}>
          <button className="btn-ghost" onClick={cargar} style={{ padding: '6px 10px' }}><RefreshCw size={14} /></button>
          {puede && hayPendientes && (
            <button className="btn-secondary" onClick={verificarPendientes} disabled={verificando != null}>
              <RefreshCw size={14} /> Verificar pendientes
            </button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Presentada</th><th>Tipo</th><th>Periodo</th><th style={{ textAlign: 'center' }}>Status</th>
                <th style={{ textAlign: 'right' }}>CFDI</th><th>Mensaje del SAT</th><th>Últ. verificación</th><th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#62666E' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Cargando…</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#62666E' }}>Aún no hay solicitudes.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtFH(r.created_at)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.tipo}<div style={{ fontSize: 11, color: '#62666E', textTransform: 'none' }}>{r.tipo_solicitud === 'metadata' ? 'Metadata (estatus)' : 'XML'}</div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtF(r.fecha_desde)} – {fmtF(r.fecha_hasta)}</td>
                  <td style={{ textAlign: 'center' }}><Badge s={r.status} /></td>
                  <td style={num}>{r.num_cfdis == null ? '—' : `${r.cfdis_guardados.toLocaleString('es-MX')} / ${r.num_cfdis.toLocaleString('es-MX')}`}</td>
                  <td style={{ fontSize: 11.5, color: '#62666E', maxWidth: 320 }}>{r.mensaje_sat ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtFH(r.ultima_verificacion)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {puede && PENDIENTES.includes(r.status) && (
                      <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => verificar(r.id)} disabled={verificando != null}>
                        {verificando === r.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />} Verificar
                      </button>
                    )}
                    {r.status === 'Descargada' && <CheckCircle size={16} style={{ color: '#1F7A50' }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════
// e.firma
// ══════════════════════════════════════════════════════════════
function TabEfirma({ esSuper }: { esSuper: boolean }) {
  const [ef, setEf] = useState<any>(undefined)
  const [error, setError] = useState('')
  const [cer, setCer] = useState<File | null>(null)
  const [key, setKey] = useState<File | null>(null)
  const [pass, setPass] = useState('')
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState('')

  const cargar = useCallback(async () => {
    setError('')
    const r = await fetchConAuth('/api/sat/efirma')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error ?? 'No se pudo consultar la e.firma'); setEf(null); return }
    setEf(j.efirma)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    if (!cer || !key || !pass) { setError('Adjunta el .cer, el .key y escribe la contraseña.'); return }
    setSaving(true); setError(''); setOk('')
    try {
      const fd = new FormData()
      fd.append('cer', cer); fd.append('key', key); fd.append('password', pass)
      const r = await fetchConAuth('/api/sat/efirma', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'No se pudo guardar')
      setOk(`e.firma de ${j.razon_social ?? j.rfc} guardada. Vence el ${fmtF(j.vigencia_fin)}.`)
      setPass(''); setCer(null); setKey(null)
      await cargar()
    } catch (e: any) { setError(e.message ?? String(e)) }
    finally { setSaving(false) }
  }

  const dias = ef?.vigencia_fin ? Math.floor((new Date(ef.vigencia_fin).getTime() - Date.now()) / 86400000) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="card" style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
          <ShieldCheck size={16} style={{ color: '#62666E' }} /> e.firma registrada
        </div>
        {ef === undefined ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : !ef ? (
          <div style={{ fontSize: 13, color: '#62666E' }}>No hay e.firma cargada. {esSuper ? 'Cárgala con el formulario.' : 'Pide al Super Administrador que la registre.'}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', rowGap: 8, fontSize: 13 }}>
            <span style={{ color: '#62666E' }}>RFC</span><strong>{ef.rfc}</strong>
            <span style={{ color: '#62666E' }}>Razón social</span><span>{ef.razon_social ?? '—'}</span>
            <span style={{ color: '#62666E' }}>No. certificado</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{ef.no_certificado}</span>
            <span style={{ color: '#62666E' }}>Vigencia</span><span>{fmtF(ef.vigencia_inicio)} – {fmtF(ef.vigencia_fin)}</span>
            <span style={{ color: '#62666E' }}>Cargada</span><span>{fmtFH(ef.created_at)}</span>
          </div>
        )}
        {dias != null && dias <= 45 && (
          <div style={{ marginTop: 14 }}>
            <Aviso color={dias < 0 ? '#C23B3B' : '#B5761A'}><AlertTriangle size={14} />
              {dias < 0 ? 'La e.firma ya venció: renuévala en el SAT y cárgala de nuevo.' : `La e.firma vence en ${dias} días.`}
            </Aviso>
          </div>
        )}
        <div style={{ marginTop: 14, fontSize: 11.5, color: '#7A7E87', lineHeight: 1.5 }}>
          La llave privada y la contraseña se guardan cifradas y solo el servidor las usa para firmar las solicitudes al SAT.
          Nunca se envían al navegador.
        </div>
      </div>

      {esSuper && (
        <div className="card" style={{ padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
            <Upload size={16} style={{ color: '#62666E' }} /> {ef ? 'Reemplazar e.firma' : 'Cargar e.firma'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="label">Certificado (.cer)</label>
              <input className="input" type="file" accept=".cer" onChange={e => setCer(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="label">Llave privada (.key)</label>
              <input className="input" type="file" accept=".key" onChange={e => setKey(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="label">Contraseña de la llave privada</label>
              <input className="input" type="password" autoComplete="new-password" value={pass} onChange={e => setPass(e.target.value)} />
            </div>
            {error && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso>}
            {ok && <Aviso color="#1F7A50"><CheckCircle size={14} /> {ok}</Aviso>}
            <div>
              <button className="btn-primary" onClick={guardar} disabled={saving}>
                {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <KeyRound size={14} />} Validar y guardar
              </button>
            </div>
          </div>
        </div>
      )}
      {!esSuper && error && <Aviso color="#C23B3B">{error}</Aviso>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Nueva solicitud
// ══════════════════════════════════════════════════════════════
function ModalNueva({ onClose, onCreada }: { onClose: () => void; onCreada: () => void }) {
  const h = new Date()
  const iniPrev = new Date(h.getFullYear(), h.getMonth() - 1, 1)
  const finPrev = new Date(h.getFullYear(), h.getMonth(), 0)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [tipo, setTipo] = useState<'recibidos' | 'emitidos' | 'ambos'>('recibidos')
  const [solicitud, setSolicitud] = useState<'xml' | 'metadata'>('xml')
  const [desde, setDesde] = useState(iso(iniPrev))
  const [hasta, setHasta] = useState(iso(finPrev))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const enviar = async () => {
    setSaving(true); setError('')
    const tipos = tipo === 'ambos' ? ['recibidos', 'emitidos'] : [tipo]
    const errores: string[] = []
    for (const t of tipos) {
      const r = await fetchConAuth('/api/sat/solicitar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: t, desde, hasta, solicitud }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) errores.push(`${t}: ${j.error ?? 'error'}`)
    }
    setSaving(false)
    if (errores.length) setError(errores.join(' · '))
    else onCreada()
  }

  return (
    <ModalShell modulo="tesoreria" titulo="Nueva solicitud al SAT" subtitulo="Descarga masiva de XML" icono={FileCode2} size="md" onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={enviar} disabled={saving}>
          {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />} Presentar solicitud
        </button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">Qué descargar</label>
          <select className="select" value={solicitud} onChange={e => setSolicitud(e.target.value as any)}>
            <option value="xml">XML de los comprobantes</option>
            <option value="metadata">Metadata: estatus vigente / cancelado</option>
          </select>
        </div>
        <div>
          <label className="label">Comprobantes</label>
          <select className="select" value={tipo} onChange={e => setTipo(e.target.value as any)}>
            <option value="recibidos">Recibidos (facturas de proveedores)</option>
            <option value="emitidos">Emitidos (facturas a clientes)</option>
            <option value="ambos">Ambos</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label className="label">Desde</label><input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div><label className="label">Hasta</label><input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
        </div>
        <Aviso color="#32789A">
          <span>De los recibidos el SAT solo entrega en XML los vigentes. Para saber cuáles se cancelaron, pide también la Metadata del mismo periodo. Se recomienda pedir un mes a la vez.</span>
        </Aviso>
        {error && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso>}
      </div>
    </ModalShell>
  )
}
