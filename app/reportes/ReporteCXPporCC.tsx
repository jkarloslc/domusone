'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter, ChevronDown, ChevronRight } from 'lucide-react'

// Cuentas por pagar = OPs con saldo > 0 y status vivo. Se agrupan CC → Área → Frente.
type OP = {
  id: number
  folio: string
  concepto: string | null
  monto: number | null
  saldo: number | null
  fecha_op: string | null
  fecha_vencimiento: string | null
  status: string
  id_proveedor_fk: number | null
  id_centro_costo_fk: number | null
  id_area_fk: number | null
  id_frente_fk: number | null
  _detIdx?: number
}

type Linea = { id_area_fk: number | null; id_frente_fk: number | null; monto: number }

// OP distribuidas: el encabezado no trae área/frente, viven en ordenes_pago_det.
// Se explotan en una fila por línea prorrateando el saldo (el CC se deriva del Área).
function explotar(ops: OP[], detByOp: Record<number, Linea[]>, areaCCMap: Record<number, number>): OP[] {
  const res: OP[] = []
  for (const op of ops) {
    const lineas = detByOp[op.id]
    if (!lineas || lineas.length === 0) { res.push(op); continue }
    const totalLineas = lineas.reduce((a, l) => a + l.monto, 0) || Number(op.monto ?? 0) || 1
    const saldoOP = Number(op.saldo ?? op.monto ?? 0)
    lineas.forEach((l, idx) => {
      const share = l.monto / totalLineas
      const cc = l.id_area_fk != null ? (areaCCMap[l.id_area_fk] ?? op.id_centro_costo_fk) : op.id_centro_costo_fk
      res.push({ ...op, id_centro_costo_fk: cc, id_area_fk: l.id_area_fk, id_frente_fk: l.id_frente_fk, monto: l.monto, saldo: saldoOP * share, _detIdx: idx })
    })
  }
  return res
}

type FrenteBucket = { id: number | null; nombre: string; saldo: number; ops: OP[] }
type AreaBucket   = { id: number | null; nombre: string; saldo: number; docs: number; frentes: Record<string, FrenteBucket> }
type CCBucket     = { id: number | null; nombre: string; saldo: number; docs: number; areas: Record<string, AreaBucket> }

const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const saldoDe = (op: OP) => Number(op.saldo ?? op.monto ?? 0)

export default function ReporteCXPporCC() {
  const [ops, setOps]              = useState<OP[]>([])
  const [centrosCosto, setCentros] = useState<{ id: number; nombre: string }[]>([])
  const [areas, setAreas]          = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [frentes, setFrentes]      = useState<{ id: number; nombre: string }[]>([])
  const [provMap, setProvMap]      = useState<Record<number, string>>({})
  const [loading, setLoading]      = useState(true)

  const [filtroCC, setFiltroCC]         = useState('')
  const [filtroArea, setFiltroArea]     = useState('')
  const [filtroFrente, setFiltroFrente] = useState('')
  const [campoFecha, setCampoFecha]     = useState<'fecha_vencimiento' | 'fecha_op'>('fecha_vencimiento')
  const [desde, setDesde]               = useState('')
  const [hasta, setHasta]               = useState('')

  const [expandedCC, setExpandedCC]       = useState<Set<string>>(new Set())
  const [expandedArea, setExpandedArea]   = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ccs }, { data: ars }, { data: frs }, { data: ps }, { data: opsData, error }, { data: detData }] = await Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre').order('nombre'),
      dbComp.from('proveedores').select('id, nombre'),
      dbComp.from('ordenes_pago')
        .select('id, folio, concepto, monto, saldo, fecha_op, fecha_vencimiento, status, id_proveedor_fk, id_centro_costo_fk, id_area_fk, id_frente_fk')
        .not('status', 'in', '("Pagada","Cancelada","Rechazada","Sustituida")'),
      dbComp.from('ordenes_pago_det').select('id_op_fk, id_area_fk, id_frente_fk, monto'),
    ])
    if (error) console.error('ReporteCXPporCC:', error.message)

    setCentros((ccs ?? []) as any)
    setAreas((ars ?? []) as any)
    setFrentes((frs ?? []) as any)
    const pm: Record<number, string> = {}
    ;(ps ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)

    const detByOp: Record<number, Linea[]> = {}
    ;(detData ?? []).forEach((d: any) => {
      (detByOp[d.id_op_fk] ??= []).push({ id_area_fk: d.id_area_fk, id_frente_fk: d.id_frente_fk, monto: Number(d.monto) || 0 })
    })
    const areaCCMap: Record<number, number> = {}
    ;(ars ?? []).forEach((a: any) => { areaCCMap[a.id] = a.id_centro_costo_fk })
    setOps(explotar((opsData ?? []) as OP[], detByOp, areaCCMap))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const ccMap     = useMemo(() => Object.fromEntries(centrosCosto.map(c => [c.id, c.nombre])), [centrosCosto])
  const areaMap   = useMemo(() => Object.fromEntries(areas.map(a => [a.id, a.nombre])), [areas])
  const frenteMap = useMemo(() => Object.fromEntries(frentes.map(f => [f.id, f.nombre])), [frentes])
  const areasDelCC = useMemo(() => filtroCC ? areas.filter(a => a.id_centro_costo_fk === Number(filtroCC)) : areas, [areas, filtroCC])

  const opsFiltradas = useMemo(() => ops.filter(op => {
    if (saldoDe(op) <= 0) return false
    if (filtroCC     && op.id_centro_costo_fk !== Number(filtroCC)) return false
    if (filtroArea   && op.id_area_fk !== Number(filtroArea)) return false
    if (filtroFrente && op.id_frente_fk !== Number(filtroFrente)) return false
    const f = op[campoFecha]
    if (desde && (!f || f < desde)) return false
    if (hasta && (!f || f > hasta)) return false
    return true
  }), [ops, filtroCC, filtroArea, filtroFrente, campoFecha, desde, hasta])

  const grupos = useMemo(() => {
    const res: Record<string, CCBucket> = {}
    for (const op of opsFiltradas) {
      const s = saldoDe(op)
      const ccKey = op.id_centro_costo_fk != null ? String(op.id_centro_costo_fk) : 'sin-cc'
      const arKey = op.id_area_fk != null ? String(op.id_area_fk) : 'sin-area'
      const frKey = op.id_frente_fk != null ? String(op.id_frente_fk) : 'sin-frente'
      const cc = (res[ccKey] ??= {
        id: op.id_centro_costo_fk,
        nombre: op.id_centro_costo_fk != null ? (ccMap[op.id_centro_costo_fk] ?? `Centro #${op.id_centro_costo_fk}`) : 'Sin centro de costo',
        saldo: 0, docs: 0, areas: {},
      })
      const ar = (cc.areas[arKey] ??= {
        id: op.id_area_fk,
        nombre: op.id_area_fk != null ? (areaMap[op.id_area_fk] ?? `Área #${op.id_area_fk}`) : 'Sin área',
        saldo: 0, docs: 0, frentes: {},
      })
      const fr = (ar.frentes[frKey] ??= {
        id: op.id_frente_fk,
        nombre: op.id_frente_fk != null ? (frenteMap[op.id_frente_fk] ?? `Frente #${op.id_frente_fk}`) : 'Sin frente',
        saldo: 0, ops: [],
      })
      cc.saldo += s; cc.docs += 1
      ar.saldo += s; ar.docs += 1
      fr.saldo += s; fr.ops.push(op)
    }
    return Object.values(res).sort((a, b) => b.saldo - a.saldo)
  }, [opsFiltradas, ccMap, areaMap, frenteMap])

  const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'
  const totalSaldo = grupos.reduce((a, g) => a + g.saldo, 0)
  const totalDocs  = grupos.reduce((a, g) => a + g.docs, 0)
  const hoy = hoy0()
  const vencido = (s: string | null) => !!s && new Date(s + 'T00:00:00') < hoy
  const totalVencido = opsFiltradas.reduce((a, op) => a + (vencido(op.fecha_vencimiento) ? saldoDe(op) : 0), 0)

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); setter(n)
  }
  const expandAll = () => {
    const c = new Set<string>(), a = new Set<string>()
    grupos.forEach(cc => {
      const ck = cc.id != null ? String(cc.id) : 'sin-cc'
      c.add(ck)
      Object.values(cc.areas).forEach(ar => a.add(`${ck}:${ar.id != null ? ar.id : 'sin-area'}`))
    })
    setExpandedCC(c); setExpandedArea(a)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ width: 210 }} value={filtroCC} onChange={e => { setFiltroCC(e.target.value); setFiltroArea('') }}>
          <option value="">Todos los centros de costo</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 190 }} value={filtroArea} onChange={e => setFiltroArea(e.target.value)} disabled={areasDelCC.length === 0}>
          <option value="">Todas las áreas{filtroCC ? ' del CC' : ''}</option>
          {areasDelCC.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 190 }} value={filtroFrente} onChange={e => setFiltroFrente(e.target.value)}>
          <option value="">Todos los frentes</option>
          {frentes.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
        <select className="select" style={{ width: 170 }} value={campoFecha} onChange={e => setCampoFecha(e.target.value as any)}>
          <option value="fecha_vencimiento">Fecha: Vencimiento</option>
          <option value="fecha_op">Fecha: Emisión</option>
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} title="Desde" style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} title="Hasta" style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Recargar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn-ghost" onClick={expandAll} style={{ fontSize: 12 }}>Expandir todo</button>
          <button className="btn-ghost" onClick={() => { setExpandedCC(new Set()); setExpandedArea(new Set()) }} style={{ fontSize: 12 }}>Colapsar</button>
        </div>
      </div>

      <PrintBar title="CXP-por-CC" count={totalDocs} reportTitle="Cuentas por Pagar por CC / Área / Frente" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSaldo)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saldo total por pagar</div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#7f1d1d', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalVencido)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>De ese saldo, vencido a hoy</div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>{totalDocs}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Partidas con saldo</div>
        </div>
      </div>

      <div id="reporte-print-area">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : grupos.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            Sin cuentas por pagar para los filtros seleccionados
          </div>
        ) : (
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Folio / Centro / Área / Frente</th>
                <th>Proveedor</th>
                <th>Concepto</th>
                <th>Emisión</th>
                <th>Vencim.</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(cc => {
                const ck = cc.id != null ? String(cc.id) : 'sin-cc'
                const ccOpen = expandedCC.has(ck)
                return (
                  <Fragment key={`cc-${ck}`}>
                    <tr style={{ background: '#eff6ff', cursor: 'pointer' }} onClick={() => toggle(expandedCC, setExpandedCC, ck)}>
                      <td colSpan={6} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {ccOpen ? <ChevronDown size={14} style={{ color: 'var(--blue)' }}/> : <ChevronRight size={14} style={{ color: 'var(--blue)' }}/>}
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{cc.nombre}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: '#dbeafe', padding: '1px 8px', borderRadius: 20 }}>{cc.docs}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(cc.saldo)}</td>
                    </tr>
                    {ccOpen && Object.values(cc.areas).sort((a, b) => b.saldo - a.saldo).map(ar => {
                      const ak = `${ck}:${ar.id != null ? ar.id : 'sin-area'}`
                      const arOpen = expandedArea.has(ak)
                      return (
                        <Fragment key={`ar-${ak}`}>
                          <tr style={{ background: '#f8fafc', cursor: 'pointer' }} onClick={() => toggle(expandedArea, setExpandedArea, ak)}>
                            <td colSpan={6} style={{ padding: '7px 12px 7px 32px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {arOpen ? <ChevronDown size={12} style={{ color: '#7c3aed' }}/> : <ChevronRight size={12} style={{ color: '#7c3aed' }}/>}
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>{ar.nombre}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: '#ede9fe', padding: '1px 7px', borderRadius: 20 }}>{ar.docs}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>{fmt(ar.saldo)}</td>
                          </tr>
                          {arOpen && Object.entries(ar.frentes).sort((a, b) => b[1].saldo - a[1].saldo).map(([fk, fr]) => (
                            <Fragment key={`fr-${ak}:${fk}`}>
                              <tr style={{ background: '#fffbeb' }}>
                                <td colSpan={6} style={{ padding: '5px 12px 5px 52px', fontSize: 12, fontWeight: 600, color: '#b45309' }}>
                                  {fr.nombre} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({fr.ops.length})</span>
                                </td>
                                <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>{fmt(fr.saldo)}</td>
                              </tr>
                              {fr.ops.map(op => (
                                <tr key={`op-${op.id}${op._detIdx != null ? `-${op._detIdx}` : ''}`}>
                                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, paddingLeft: 72 }}>{op.folio}</td>
                                  <td style={{ fontSize: 12 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? `#${op.id_proveedor_fk}`) : '—'}</td>
                                  <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(op.fecha_op)}</td>
                                  <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: vencido(op.fecha_vencimiento) ? '#dc2626' : 'var(--text-secondary)', fontWeight: vencido(op.fecha_vencimiento) ? 600 : 400 }}>{fmtF(op.fecha_vencimiento)}</td>
                                  <td style={{ fontSize: 12 }}>{op.status}</td>
                                  <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(saldoDe(op))}</td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={6} style={{ color: 'var(--blue)', padding: '10px 12px' }}>TOTAL GENERAL ({totalDocs})</td>
                <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(totalSaldo)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
