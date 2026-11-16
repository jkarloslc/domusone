'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, Unlink, Check, X, Loader, RefreshCw, AlertTriangle, Search, FileSpreadsheet } from 'lucide-react'
import KpiCard from '@/components/ui/KpiCard'
import ModalShell from '@/components/ui/ModalShell'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import { fetchConAuth } from '@/lib/authFetch'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const OP_COLOR: Record<string, string> = {
  'Pagada': '#1F7A50', 'Pago Parcial': '#126B63', 'Pendiente': '#B5761A', 'Pendiente Auth': '#6B4E79',
  'Pendiente Auth Finanzas': '#5C4268', 'Rechazada': '#C23B3B', 'Cancelada': '#62666E',
}
const METODO: Record<string, string> = { uuid: 'UUID', folio: 'Folio', monto: 'Monto', manual: 'Manual' }
const EXCLUIDOS = new Set(['Cancelada', 'Rechazada'])

const fmt = (n: number | null | undefined) => n == null ? '—' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (d: string | null) => d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'
const num: React.CSSProperties = { fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }
const pad = (n: number) => String(n).padStart(2, '0')

function Aviso({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: `3px solid ${color}`, color,
      borderRadius: 8, padding: '10px 14px', fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>{children}</div>
  )
}
const Etiqueta = ({ txt, color }: { txt: string; color: string }) => (
  <span className="badge" style={{ background: color, color: '#fff' }}>{txt}</span>
)

async function porLotes<T>(ids: any[], q: (lote: any[]) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await q(ids.slice(i, i + 300))
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
  }
  return out
}

const OP_COLS = 'id, folio, monto, status, fecha_op, fecha_factura, folio_factura, uuid_factura, id_tipo_gasto_fk, tipo_gasto, proveedores:id_proveedor_fk(id, nombre, razon_social, rfc)'

type Seccion = 'sugerencias' | 'cfdi' | 'op' | 'ligados' | 'cancelados'

export default function Conciliacion({ puede }: { puede: boolean }) {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() === 0 ? 12 : hoy.getMonth())
  const [cfdis, setCfdis] = useState<any[]>([])
  const [links, setLinks] = useState<any[]>([])
  const [opsMap, setOpsMap] = useState<Map<number, any>>(new Map())
  const [opsPeriodo, setOpsPeriodo] = useState<any[]>([])
  const [linksOps, setLinksOps] = useState<Set<number>>(new Set())
  const [tgSinCfdi, setTgSinCfdi] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [corriendo, setCorriendo] = useState(false)
  const [msg, setMsg] = useState<{ color: string; text: string } | null>(null)
  const [sec, setSec] = useState<Seccion>('sugerencias')
  const [q, setQ] = useState('')
  const [picker, setPicker] = useState<{ modo: 'op'; cfdi: any } | { modo: 'cfdi'; op: any } | null>(null)
  const [accion, setAccion] = useState<string | null>(null)

  const desde = `${anio}-${pad(mes)}-01`
  const hasta = `${anio}-${pad(mes)}-${pad(new Date(anio, mes, 0).getDate())}`
  const finExcl = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${pad(mes + 1)}-01`

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const { data: tg } = await dbCfg.from('tipos_gasto').select('id, requiere_cfdi')
      setTgSinCfdi(new Set((tg ?? []).filter((t: any) => t.requiere_cfdi === false).map((t: any) => t.id)))

      const cs: any[] = []
      for (let d = 0; ; d += 1000) {
        const { data, error } = await dbCtrl.from('cfdi_sat')
          .select('uuid, serie, folio, fecha_emision, rfc_emisor, nombre_emisor, subtotal, total, estatus_sat, fecha_cancelacion, tiene_xml')
          .eq('tipo_descarga', 'recibido').eq('tipo_comprobante', 'I')
          .gte('fecha_emision', desde).lt('fecha_emision', finExcl).order('fecha_emision').range(d, d + 999)
        if (error) throw new Error(error.message)
        cs.push(...(data ?? []))
        if ((data ?? []).length < 1000) break
      }
      const ls = await porLotes<any>(cs.map(c => c.uuid), lote => dbCtrl.from('cfdi_sat_op')
        .select('uuid, id_op_fk, metodo, estado').in('uuid', lote).in('estado', ['confirmado', 'sugerido']))

      const { data: opsP, error: eOp } = await dbComp.from('ordenes_pago').select(OP_COLS)
        .gte('fecha_op', desde).lte('fecha_op', hasta).order('fecha_op')
      if (eOp) throw new Error(eOp.message)
      const periodo = (opsP ?? []).filter((o: any) => !EXCLUIDOS.has(o.status ?? ''))
      const lOps = await porLotes<any>(periodo.map((o: any) => o.id), lote => dbCtrl.from('cfdi_sat_op')
        .select('id_op_fk').in('id_op_fk', lote).eq('estado', 'confirmado'))

      const faltan = Array.from(new Set(ls.map(l => l.id_op_fk))).filter(id => !periodo.some((o: any) => o.id === id))
      const extra = await porLotes<any>(faltan, lote => dbComp.from('ordenes_pago').select(OP_COLS).in('id', lote))
      const m = new Map<number, any>();
      [...periodo, ...extra].forEach((o: any) => m.set(o.id, o))

      setCfdis(cs); setLinks(ls); setOpsPeriodo(periodo); setOpsMap(m); setLinksOps(new Set(lOps.map(l => l.id_op_fk)))
    } catch (e: any) {
      setMsg({ color: '#C23B3B', text: e.message ?? String(e) })
    } finally { setLoading(false) }
  }, [desde, hasta, finExcl])
  useEffect(() => { cargar() }, [cargar])

  const conciliarAhora = async () => {
    setCorriendo(true); setMsg(null)
    try {
      const r = await fetchConAuth('/api/sat/conciliar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde, hasta }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error al conciliar')
      const extra = j.uuidOps?.pendientes ? ` Faltan ${j.uuidOps.pendientes} XML de OP por leer: vuelve a conciliar.` : ''
      setMsg({ color: '#1F7A50', text: `${j.cfdis} CFDI revisados: ${j.nuevos} ligados automáticamente y ${j.sugeridos} sugerencias por revisar.${extra}` })
      await cargar()
    } catch (e: any) { setMsg({ color: '#C23B3B', text: e.message ?? String(e) }) }
    finally { setCorriendo(false) }
  }

  const vinculo = async (uuid: string, id_op: number, acc: 'vincular' | 'confirmar' | 'descartar' | 'desvincular') => {
    setAccion(`${uuid}|${id_op}`)
    try {
      const r = await fetchConAuth('/api/sat/vinculo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid, id_op, accion: acc }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Error')
      await cargar()
    } catch (e: any) { setMsg({ color: '#C23B3B', text: e.message ?? String(e) }) }
    finally { setAccion(null) }
  }

  // ── Derivados ─────────────────────────────────────────────
  const d = useMemo(() => {
    const conf = links.filter(l => l.estado === 'confirmado')
    const sug = links.filter(l => l.estado === 'sugerido')
    const ligados = new Set(conf.map(l => l.uuid))
    const cfdiByUuid = new Map(cfdis.map(c => [c.uuid, c]))
    const vig = cfdis.filter(c => c.estatus_sat !== 'Cancelado')
    const sinOp = vig.filter(c => !ligados.has(c.uuid))
    const opSin = opsPeriodo.filter(o => !linksOps.has(o.id) && !tgSinCfdi.has(o.id_tipo_gasto_fk))
    const cancelados = conf.filter(l => cfdiByUuid.get(l.uuid)?.estatus_sat === 'Cancelado')
    return { conf, sug, sinOp, opSin, cancelados, cfdiByUuid, vig, ligados }
  }, [links, cfdis, opsPeriodo, linksOps, tgSinCfdi])

  const filtro = (txt: string) => !q.trim() || txt.toLowerCase().includes(q.trim().toLowerCase())
  const nomProv = (o: any) => o?.proveedores?.razon_social || o?.proveedores?.nombre || '—'
  const totalSinOp = d.sinOp.reduce((a, c) => a + Number(c.total ?? 0), 0)
  const totalOpSin = d.opSin.reduce((a, o) => a + Number(o.monto ?? 0), 0)

  const excel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const cfdiRow = (c: any) => ({ UUID: c.uuid, Fecha: c.fecha_emision?.slice(0, 10), Folio: [c.serie, c.folio].filter(Boolean).join('-'), RFC: c.rfc_emisor, Emisor: c.nombre_emisor, Total: Number(c.total ?? 0), Estatus: c.estatus_sat })
    const opRow = (o: any) => ({ OP: o.folio, Fecha: o.fecha_op, Proveedor: nomProv(o), RFC: o.proveedores?.rfc ?? '', 'Folio factura': o.folio_factura, 'Tipo gasto': o.tipo_gasto, Monto: Number(o.monto ?? 0), Status: o.status })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.sinOp.map(cfdiRow)), 'CFDI sin OP')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.opSin.map(opRow)), 'OP sin CFDI')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.conf.map(l => ({ ...cfdiRow(d.cfdiByUuid.get(l.uuid) ?? {}), ...Object.fromEntries(Object.entries(opRow(opsMap.get(l.id_op_fk) ?? {})).map(([k, v]) => [`OP · ${k}`, v])), Método: METODO[l.metodo] }))), 'Ligados')
    XLSX.writeFile(wb, `Conciliacion-CFDI-OP_${anio}-${pad(mes)}.xlsx`)
  }

  const secciones: { key: Seccion; label: string; n: number; color?: string }[] = [
    { key: 'sugerencias', label: 'Sugerencias', n: d.sug.length },
    { key: 'cfdi', label: 'CFDI sin OP', n: d.sinOp.length },
    { key: 'op', label: 'OP sin CFDI', n: d.opSin.length },
    { key: 'ligados', label: 'Ligados', n: d.conf.length },
    { key: 'cancelados', label: 'Cancelados con OP', n: d.cancelados.length, color: d.cancelados.length ? '#C23B3B' : undefined },
  ]
  const anios = Array.from({ length: 4 }, (_, i) => hoy.getFullYear() - i)
  const ocupado = (uuid: string, id: number) => accion === `${uuid}|${id}`

  const CeldaCfdi = ({ c }: { c: any }) => c ? (
    <>
      <div style={{ fontWeight: 500 }}>{c.nombre_emisor ?? c.rfc_emisor}</div>
      <div style={{ fontSize: 11, color: '#62666E' }}>{c.rfc_emisor} · {[c.serie, c.folio].filter(Boolean).join('-') || c.uuid.slice(0, 8)} · {fmtF(c.fecha_emision)}</div>
    </>
  ) : <span style={{ color: '#9A9EA7' }}>—</span>
  const CeldaOp = ({ o }: { o: any }) => o ? (
    <>
      <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{o.folio ?? `OP ${o.id}`} <span style={{ marginLeft: 6 }}><Etiqueta txt={o.status} color={OP_COLOR[o.status] ?? '#62666E'} /></span></div>
      <div style={{ fontSize: 11, color: '#62666E' }}>{nomProv(o)} · {fmtF(o.fecha_op)}{o.folio_factura ? ` · Fact. ${o.folio_factura}` : ''}</div>
    </>
  ) : <span style={{ color: '#9A9EA7' }}>—</span>

  return (
    <>
      <div className="card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label className="label">Año</label>
          <select className="select" value={anio} onChange={e => setAnio(Number(e.target.value))}>{anios.map(a => <option key={a}>{a}</option>)}</select>
        </div>
        <div>
          <label className="label">Mes</label>
          <select className="select" value={mes} onChange={e => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        </div>
        <div style={{ flex: '1 1 220px' }}>
          <label className="label">Buscar</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9A9EA7' }} />
            <input className="input" style={{ paddingLeft: 30 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Proveedor, RFC, folio u OP" />
          </div>
        </div>
        <button className="btn-ghost" onClick={cargar} style={{ padding: '8px 10px' }} title="Actualizar"><RefreshCw size={14} /></button>
        <button className="btn-secondary" onClick={excel} disabled={loading}><FileSpreadsheet size={14} /> Excel</button>
        {puede && (
          <button className="btn-primary" onClick={conciliarAhora} disabled={corriendo}>
            {corriendo ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={14} />} Conciliar periodo
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'CFDI de ingreso ligados', value: `${d.ligados.size.toLocaleString('es-MX')} / ${d.vig.length.toLocaleString('es-MX')}`, icon: Link2, tone: 'success' as const },
          { label: 'CFDI sin OP', value: fmt(totalSinOp), icon: AlertTriangle, tone: 'warning' as const },
          { label: 'OP sin CFDI', value: fmt(totalOpSin), icon: AlertTriangle, tone: 'warning' as const },
          { label: 'Cancelados con OP', value: d.cancelados.length.toLocaleString('es-MX'), icon: AlertTriangle, tone: (d.cancelados.length ? 'danger' : 'neutral') as any },
        ].map(k => <div key={k.label} style={{ flex: '1 1 180px', maxWidth: 260 }}><KpiCard {...k} /></div>)}
      </div>

      {msg && <div style={{ marginBottom: 12 }}><Aviso color={msg.color}>{msg.text}</Aviso></div>}

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #E6E8EB', marginBottom: 12, flexWrap: 'wrap' }}>
        {secciones.map(s => {
          const active = sec === s.key
          return (
            <button key={s.key} onClick={() => setSec(s.key)}
              style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5,
                fontWeight: active ? 700 : 500, color: active ? '#1C1D21' : '#62666E',
                borderBottom: active ? '2px solid #19D3C5' : '2px solid transparent', marginBottom: -2, display: 'flex', gap: 6, alignItems: 'center' }}>
              {s.label}
              <span className="badge" style={{ background: s.color ?? (active ? '#1C1D21' : '#E6E8EB'), color: s.color || active ? '#fff' : '#1C1D21', padding: '1px 7px' }}>{s.n}</span>
            </button>
          )
        })}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#62666E' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Cargando…</div>
          ) : sec === 'sugerencias' || sec === 'ligados' || sec === 'cancelados' ? (
            <table>
              <thead><tr>
                <th>CFDI</th><th style={{ textAlign: 'right' }}>Total CFDI</th><th>Orden de pago</th><th style={{ textAlign: 'right' }}>Monto OP</th>
                <th>Método</th><th style={{ width: 150 }}></th>
              </tr></thead>
              <tbody>
                {(sec === 'sugerencias' ? d.sug : sec === 'ligados' ? d.conf : d.cancelados)
                  .filter(l => { const c = d.cfdiByUuid.get(l.uuid), o = opsMap.get(l.id_op_fk); return filtro(`${c?.nombre_emisor} ${c?.rfc_emisor} ${c?.folio} ${o?.folio} ${nomProv(o)}`) })
                  .map(l => {
                    const c = d.cfdiByUuid.get(l.uuid), o = opsMap.get(l.id_op_fk)
                    const dif = c && o ? Number(o.monto ?? 0) - Number(c.total ?? 0) : 0
                    return (
                      <tr key={`${l.uuid}|${l.id_op_fk}`}>
                        <td><CeldaCfdi c={c} />{c?.estatus_sat === 'Cancelado' && <div style={{ marginTop: 3 }}><Etiqueta txt={`Cancelado ${fmtF(c.fecha_cancelacion)}`} color="#C23B3B" /></div>}</td>
                        <td style={num}>{fmt(c?.total)}</td>
                        <td><CeldaOp o={o} /></td>
                        <td style={num}>{fmt(o?.monto)}{Math.abs(dif) > 1 && <div style={{ fontSize: 10.5, color: '#B5761A', fontWeight: 500 }}>dif. {fmt(dif)}</div>}</td>
                        <td>{METODO[l.metodo] ?? l.metodo}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {puede && (ocupado(l.uuid, l.id_op_fk) ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : l.estado === 'sugerido' ? (
                            <>
                              <button className="btn-secondary" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => vinculo(l.uuid, l.id_op_fk, 'confirmar')}><Check size={13} /> Confirmar</button>
                              <button className="btn-ghost" style={{ padding: '4px 6px', color: '#C23B3B' }} title="Descartar" onClick={() => vinculo(l.uuid, l.id_op_fk, 'descartar')}><X size={15} /></button>
                            </>
                          ) : (
                            <button className="btn-ghost" style={{ padding: '4px 6px' }} title="Desvincular" onClick={() => vinculo(l.uuid, l.id_op_fk, 'desvincular')}><Unlink size={15} /></button>
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                {!(sec === 'sugerencias' ? d.sug : sec === 'ligados' ? d.conf : d.cancelados).length && (
                  <tr><td colSpan={6} style={{ padding: 36, textAlign: 'center', color: '#62666E' }}>
                    {sec === 'cancelados' ? 'Ningún CFDI ligado a una OP aparece cancelado. Para revisarlo, presenta una solicitud de Metadata del periodo.' : 'Sin registros. Pulsa “Conciliar periodo”.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          ) : sec === 'cfdi' ? (
            <table>
              <thead><tr><th>CFDI</th><th style={{ textAlign: 'right' }}>Subtotal</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ width: 110 }}></th></tr></thead>
              <tbody>
                {d.sinOp.filter(c => filtro(`${c.nombre_emisor} ${c.rfc_emisor} ${c.serie ?? ''}${c.folio ?? ''} ${c.uuid}`)).map(c => (
                  <tr key={c.uuid}>
                    <td><CeldaCfdi c={c} /></td>
                    <td style={num}>{fmt(c.subtotal)}</td>
                    <td style={num}>{fmt(c.total)}</td>
                    <td style={{ textAlign: 'right' }}>{puede && <button className="btn-secondary" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => setPicker({ modo: 'op', cfdi: c })}><Link2 size={13} /> Ligar</button>}</td>
                  </tr>
                ))}
                {!d.sinOp.length && <tr><td colSpan={4} style={{ padding: 36, textAlign: 'center', color: '#62666E' }}>Todos los CFDI de ingreso del periodo están ligados a una OP.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>Orden de pago</th><th>RFC proveedor</th><th>Tipo de gasto</th><th style={{ textAlign: 'right' }}>Monto</th><th style={{ width: 110 }}></th></tr></thead>
              <tbody>
                {d.opSin.filter(o => filtro(`${o.folio} ${nomProv(o)} ${o.proveedores?.rfc ?? ''} ${o.folio_factura ?? ''}`)).map(o => (
                  <tr key={o.id}>
                    <td><CeldaOp o={o} /></td>
                    <td>{o.proveedores?.rfc ? o.proveedores.rfc : <span style={{ color: '#B5761A', fontSize: 12 }}>Proveedor sin RFC</span>}</td>
                    <td style={{ fontSize: 12 }}>{o.tipo_gasto ?? '—'}</td>
                    <td style={num}>{fmt(o.monto)}</td>
                    <td style={{ textAlign: 'right' }}>{puede && <button className="btn-secondary" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => setPicker({ modo: 'cfdi', op: o })}><Link2 size={13} /> Ligar</button>}</td>
                  </tr>
                ))}
                {!d.opSin.length && <tr><td colSpan={5} style={{ padding: 36, textAlign: 'center', color: '#62666E' }}>Todas las OP del periodo que requieren factura tienen CFDI.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: '#7A7E87', lineHeight: 1.5 }}>
        Se concilian los CFDI de ingreso recibidos del mes (por fecha de emisión) contra cualquier OP no cancelada ni rechazada.
        “OP sin CFDI” toma las OP del mes por fecha de la OP y omite los tipos de gasto que no llevan factura (nómina, impuestos, IMSS, comisiones bancarias, etc.).
      </div>

      {picker && (
        <Picker picker={picker} onClose={() => setPicker(null)}
          onElegir={async (uuid, idOp) => { setPicker(null); await vinculo(uuid, idOp, 'vincular') }} />
      )}
    </>
  )
}

// ── Selector para ligar a mano ────────────────────────────────
function Picker({ picker, onClose, onElegir }: {
  picker: { modo: 'op'; cfdi: any } | { modo: 'cfdi'; op: any }
  onClose: () => void
  onElegir: (uuid: string, idOp: number) => void
}) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      try {
        if (picker.modo === 'op') {
          const c = picker.cfdi
          const { data: provs, error: e1 } = await dbComp.from('proveedores').select('id').ilike('rfc', c.rfc_emisor)
          if (e1) throw new Error(e1.message)
          const ids = (provs ?? []).map((p: any) => p.id)
          if (!ids.length) { setError(`Ningún proveedor tiene el RFC ${c.rfc_emisor}. Captúralo en el catálogo de proveedores para poder ligarlo.`); setItems([]); return }
          const { data, error } = await dbComp.from('ordenes_pago').select(OP_COLS).in('id_proveedor_fk', ids).order('fecha_op', { ascending: false }).limit(300)
          if (error) throw new Error(error.message)
          const t = Number(c.total ?? 0)
          setItems((data ?? []).filter((o: any) => !EXCLUIDOS.has(o.status ?? '')).sort((a: any, b: any) => Math.abs(a.monto - t) - Math.abs(b.monto - t)))
        } else {
          const o = picker.op
          const rfc = String(o.proveedores?.rfc ?? '').trim().toUpperCase()
          if (!rfc) { setError('El proveedor de esta OP no tiene RFC. Captúralo en el catálogo de proveedores.'); return }
          const { data, error } = await dbCtrl.from('cfdi_sat').select('uuid, serie, folio, fecha_emision, rfc_emisor, nombre_emisor, total, estatus_sat')
            .eq('tipo_descarga', 'recibido').eq('rfc_emisor', rfc).order('fecha_emision', { ascending: false }).limit(300)
          if (error) throw new Error(error.message)
          const m = Number(o.monto ?? 0)
          setItems((data ?? []).sort((a: any, b: any) => Math.abs(a.total - m) - Math.abs(b.total - m)))
        }
      } catch (e: any) { setError(e.message ?? String(e)) }
      finally { setLoading(false) }
    })()
  }, [picker])

  const ref = picker.modo === 'op' ? picker.cfdi : picker.op
  const lista = items.filter(x => !q.trim() || JSON.stringify([x.folio, x.folio_factura, x.serie, x.uuid]).toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <ModalShell modulo="tesoreria" size="xl" onClose={onClose} icono={Link2}
      titulo={picker.modo === 'op' ? 'Ligar CFDI a una orden de pago' : 'Ligar OP a un CFDI'}
      subtitulo={picker.modo === 'op'
        ? `${ref.nombre_emisor ?? ref.rfc_emisor} · ${[ref.serie, ref.folio].filter(Boolean).join('-')} · ${fmt(ref.total)}`
        : `${ref.folio ?? 'OP'} · ${ref.proveedores?.razon_social || ref.proveedores?.nombre || ''} · ${fmt(ref.monto)}`}
      footer={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input className="input" placeholder="Filtrar por folio o UUID" value={q} onChange={e => setQ(e.target.value)} />
        {error && <Aviso color="#B5761A"><AlertTriangle size={14} /> {error}</Aviso>}
        {loading ? <div style={{ padding: 24, textAlign: 'center' }}><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /></div> : (
          <div style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid #E6E8EB', borderRadius: 10 }}>
            <table>
              <thead><tr>{picker.modo === 'op'
                ? <><th>OP</th><th>Fecha</th><th>Folio factura</th><th style={{ textAlign: 'right' }}>Monto</th><th></th></>
                : <><th>Folio</th><th>Fecha</th><th>Estatus</th><th style={{ textAlign: 'right' }}>Total</th><th></th></>}</tr></thead>
              <tbody>
                {lista.map(x => picker.modo === 'op' ? (
                  <tr key={x.id}>
                    <td><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{x.folio}</span> <Etiqueta txt={x.status} color={OP_COLOR[x.status] ?? '#62666E'} /></td>
                    <td>{fmtF(x.fecha_op)}</td><td>{x.folio_factura ?? '—'}</td><td style={num}>{fmt(x.monto)}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn-secondary" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => onElegir(ref.uuid, x.id)}>Ligar</button></td>
                  </tr>
                ) : (
                  <tr key={x.uuid}>
                    <td><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{[x.serie, x.folio].filter(Boolean).join('-') || x.uuid.slice(0, 8)}</span></td>
                    <td>{fmtF(x.fecha_emision)}</td>
                    <td>{x.estatus_sat === 'Cancelado' ? <Etiqueta txt="Cancelado" color="#C23B3B" /> : 'Vigente'}</td>
                    <td style={num}>{fmt(x.total)}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn-secondary" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => onElegir(x.uuid, ref.id)}>Ligar</button></td>
                  </tr>
                ))}
                {!lista.length && !error && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#62666E' }}>Sin candidatos.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
