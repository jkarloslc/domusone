'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter, ChevronDown, ChevronRight } from 'lucide-react'

// Bandas de antigüedad sobre fecha_vencimiento. Se consideran OPs con saldo > 0
// y status distinto de 'Pagada' y 'Cancelada'.
const BANDAS = [
  { key: 'por-vencer', label: 'Por vencer', color: '#15803d', test: (d: number) => d <= 0 },
  { key: '0-30',       label: '0-30 días',  color: '#d97706', test: (d: number) => d >= 1  && d <= 30 },
  { key: '31-60',      label: '31-60 días', color: '#ea580c', test: (d: number) => d >= 31 && d <= 60 },
  { key: '61-90',      label: '61-90 días', color: '#dc2626', test: (d: number) => d >= 61 && d <= 90 },
  { key: '+90',        label: '+90 días',   color: '#7f1d1d', test: (d: number) => d >= 91 },
] as const

type BandaKey = typeof BANDAS[number]['key']

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
}

type OPConDias = OP & { _dias: number; _banda: BandaKey; _saldoReal: number }

type AreaBucket = {
  id: number | null
  nombre: string
  saldo: number
  docs: number
  porBanda: Record<BandaKey, number>
  ops: OPConDias[]
}

type CCBucket = {
  id: number | null
  nombre: string
  saldo: number
  docs: number
  porBanda: Record<BandaKey, number>
  areas: Record<string, AreaBucket>
}

const diasVencimiento = (fechaVenc: string | null): number => {
  if (!fechaVenc) return 0
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const v   = new Date(fechaVenc + 'T00:00:00')
  return Math.floor((hoy.getTime() - v.getTime()) / 86400000)
}

const bandaDe = (dias: number): BandaKey => {
  for (const b of BANDAS) if (b.test(dias)) return b.key as BandaKey
  return '+90'
}

const bandaColor = (k: BandaKey) => BANDAS.find(b => b.key === k)!.color

export default function ReporteAntiguedadOPporCC() {
  const [ops, setOps]               = useState<OP[]>([])
  const [centrosCosto, setCentros]  = useState<{ id: number; nombre: string }[]>([])
  const [areas, setAreas]           = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [provs, setProvs]           = useState<{ id: number; nombre: string }[]>([])
  const [provMap, setProvMap]       = useState<Record<number, string>>({})
  const [loading, setLoading]       = useState(true)

  const [filtroCC, setFiltroCC]     = useState<string>('')
  const [filtroArea, setFiltroArea] = useState<string>('')
  const [filtroProv, setFiltroProv] = useState<string>('')
  const [filtroBanda, setFiltroBanda] = useState<BandaKey | ''>('')

  const [expandedCC,   setExpandedCC]   = useState<Set<string>>(new Set())
  const [expandedArea, setExpandedArea] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ccs }, { data: ars }, { data: ps }, { data: opsData }] = await Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
      dbComp.from('ordenes_pago')
        .select('id, folio, concepto, monto, saldo, fecha_op, fecha_vencimiento, status, id_proveedor_fk, id_centro_costo_fk, id_area_fk')
        .not('status', 'in', '("Pagada","Cancelada")')
        .order('fecha_vencimiento', { ascending: true, nullsFirst: false }),
    ])

    setCentros((ccs ?? []) as any)
    setAreas((ars ?? []) as any)
    setProvs((ps ?? []) as any)
    const pm: Record<number, string> = {}
    ;(ps ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)
    setOps((opsData ?? []) as OP[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const ccMap = useMemo(() => {
    const m: Record<number, string> = {}
    centrosCosto.forEach(c => { m[c.id] = c.nombre })
    return m
  }, [centrosCosto])

  const areaMap = useMemo(() => {
    const m: Record<number, { nombre: string; id_centro_costo_fk: number }> = {}
    areas.forEach(a => { m[a.id] = { nombre: a.nombre, id_centro_costo_fk: a.id_centro_costo_fk } })
    return m
  }, [areas])

  const areasDelCC = useMemo(
    () => filtroCC ? areas.filter(a => a.id_centro_costo_fk === Number(filtroCC)) : areas,
    [areas, filtroCC]
  )

  // Preprocesar: agregar días, banda, saldo real; excluir saldo <= 0
  const opsPreproc = useMemo<OPConDias[]>(() => {
    return ops
      .map(op => {
        const saldoReal = Number(op.saldo ?? op.monto ?? 0)
        const dias = diasVencimiento(op.fecha_vencimiento)
        return { ...op, _saldoReal: saldoReal, _dias: dias, _banda: bandaDe(dias) }
      })
      .filter(op => op._saldoReal > 0)
  }, [ops])

  const opsFiltradas = useMemo<OPConDias[]>(() => {
    return opsPreproc.filter(op => {
      if (filtroCC    && op.id_centro_costo_fk !== Number(filtroCC)) return false
      if (filtroArea  && op.id_area_fk !== Number(filtroArea)) return false
      if (filtroProv  && op.id_proveedor_fk !== Number(filtroProv)) return false
      if (filtroBanda && op._banda !== filtroBanda) return false
      return true
    })
  }, [opsPreproc, filtroCC, filtroArea, filtroProv, filtroBanda])

  // Agrupar CC → Área
  const grupos = useMemo(() => {
    const res: Record<string, CCBucket> = {}
    const empty = (): Record<BandaKey, number> => ({ 'por-vencer': 0, '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 })

    for (const op of opsFiltradas) {
      const ccId    = op.id_centro_costo_fk
      const ccKey   = ccId != null ? String(ccId) : 'sin-cc'
      const ccName  = ccId != null ? (ccMap[ccId] ?? `Centro #${ccId}`) : 'Sin centro de costo'

      const areaId   = op.id_area_fk
      const areaKey  = areaId != null ? String(areaId) : 'sin-area'
      const areaName = areaId != null ? (areaMap[areaId]?.nombre ?? `Área #${areaId}`) : 'Sin área'

      if (!res[ccKey]) res[ccKey] = {
        id: ccId, nombre: ccName, saldo: 0, docs: 0, porBanda: empty(), areas: {},
      }
      const cc = res[ccKey]
      if (!cc.areas[areaKey]) cc.areas[areaKey] = {
        id: areaId, nombre: areaName, saldo: 0, docs: 0, porBanda: empty(), ops: [],
      }

      cc.saldo += op._saldoReal
      cc.docs  += 1
      cc.porBanda[op._banda] += op._saldoReal

      const ar = cc.areas[areaKey]
      ar.saldo += op._saldoReal
      ar.docs  += 1
      ar.porBanda[op._banda] += op._saldoReal
      ar.ops.push(op)
    }
    return Object.values(res).sort((a, b) => b.saldo - a.saldo)
  }, [opsFiltradas, ccMap, areaMap])

  const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

  const totalSaldo  = grupos.reduce((a, g) => a + g.saldo, 0)
  const totalDocs   = grupos.reduce((a, g) => a + g.docs, 0)
  const totalBandas = useMemo(() => {
    const t: Record<BandaKey, number> = { 'por-vencer': 0, '0-30': 0, '31-60': 0, '61-90': 0, '+90': 0 }
    grupos.forEach(g => (Object.keys(t) as BandaKey[]).forEach(k => { t[k] += g.porBanda[k] }))
    return t
  }, [grupos])

  const toggleCC = (key: string) => setExpandedCC(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })
  const toggleArea = (key: string) => setExpandedArea(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  const expandAll = () => {
    const ccKeys   = new Set<string>()
    const areaKeys = new Set<string>()
    grupos.forEach(cc => {
      const ccKey = cc.id != null ? String(cc.id) : 'sin-cc'
      ccKeys.add(ccKey)
      Object.values(cc.areas).forEach(ar => {
        const areaKey = ar.id != null ? String(ar.id) : 'sin-area'
        areaKeys.add(`${ccKey}:${areaKey}`)
      })
    })
    setExpandedCC(ccKeys); setExpandedArea(areaKeys)
  }
  const collapseAll = () => { setExpandedCC(new Set()); setExpandedArea(new Set()) }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ minWidth: 200 }} value={filtroCC} onChange={e => { setFiltroCC(e.target.value); setFiltroArea('') }}>
          <option value="">Todos los centros de costo</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 180 }} value={filtroArea} onChange={e => setFiltroArea(e.target.value)} disabled={areasDelCC.length === 0}>
          <option value="">Todas las áreas{filtroCC ? ' del CC' : ''}</option>
          {areasDelCC.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 220 }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroBanda} onChange={e => setFiltroBanda(e.target.value as BandaKey | '')}>
          <option value="">Todas las bandas</option>
          {BANDAS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchData} title="Recargar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn-ghost" onClick={expandAll} style={{ fontSize: 12 }}>Expandir todo</button>
          <button className="btn-ghost" onClick={collapseAll} style={{ fontSize: 12 }}>Colapsar</button>
        </div>
      </div>

      <PrintBar title="Antiguedad-OP-CC-Area" count={totalDocs} reportTitle="Antigüedad de Órdenes de Pago por CC / Área" />

      {/* KPIs por banda */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {BANDAS.map(b => (
          <div key={b.key} className="card" style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{b.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: b.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalBandas[b.key])}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {totalSaldo > 0 ? `${((totalBandas[b.key] / totalSaldo) * 100).toFixed(1)}%` : '0%'} del saldo
            </div>
          </div>
        ))}
      </div>

      {/* Totales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalSaldo)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Saldo total por pagar</div>
        </div>
        <div className="card" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>{totalDocs}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Órdenes de Pago con saldo</div>
        </div>
      </div>

      {/* Tabla jerárquica */}
      <div id="reporte-print-area">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : grupos.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            Sin saldos pendientes para los filtros seleccionados
          </div>
        ) : (
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Folio / Centro / Área</th>
                <th>Proveedor</th>
                <th>Concepto</th>
                <th>Vencim.</th>
                <th style={{ textAlign: 'right' }}>Días</th>
                <th style={{ textAlign: 'right' }}>Por vencer</th>
                <th style={{ textAlign: 'right' }}>0-30</th>
                <th style={{ textAlign: 'right' }}>31-60</th>
                <th style={{ textAlign: 'right' }}>61-90</th>
                <th style={{ textAlign: 'right' }}>+90</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(cc => {
                const ccKey = cc.id != null ? String(cc.id) : 'sin-cc'
                const ccOpen = expandedCC.has(ccKey)
                const ccAreasOrd = Object.values(cc.areas).sort((a, b) => b.saldo - a.saldo)
                return (
                  <Fragment key={`cc-frag-${ccKey}`}>
                    <tr style={{ background: '#eff6ff', cursor: 'pointer' }} onClick={() => toggleCC(ccKey)}>
                      <td colSpan={5} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {ccOpen ? <ChevronDown size={14} style={{ color: 'var(--blue)' }}/> : <ChevronRight size={14} style={{ color: 'var(--blue)' }}/>}
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{cc.nombre}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: '#dbeafe', padding: '1px 8px', borderRadius: 20 }}>
                            {cc.docs} OP{cc.docs !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      {BANDAS.map(b => (
                        <td key={b.key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 13, color: cc.porBanda[b.key] > 0 ? b.color : 'var(--text-muted)' }}>
                          {cc.porBanda[b.key] > 0 ? fmt(cc.porBanda[b.key]) : '—'}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--blue)' }}>{fmt(cc.saldo)}</td>
                    </tr>

                    {ccOpen && ccAreasOrd.map(ar => {
                      const areaKeyBase = ar.id != null ? String(ar.id) : 'sin-area'
                      const areaFullKey = `${ccKey}:${areaKeyBase}`
                      const arOpen = expandedArea.has(areaFullKey)
                      return (
                        <Fragment key={`ar-frag-${areaFullKey}`}>
                          <tr style={{ background: '#f8fafc', cursor: 'pointer' }} onClick={() => toggleArea(areaFullKey)}>
                            <td colSpan={5} style={{ padding: '7px 12px 7px 32px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {arOpen ? <ChevronDown size={12} style={{ color: '#7c3aed' }}/> : <ChevronRight size={12} style={{ color: '#7c3aed' }}/>}
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>{ar.nombre}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: '#ede9fe', padding: '1px 7px', borderRadius: 20 }}>
                                  {ar.docs} OP{ar.docs !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </td>
                            {BANDAS.map(b => (
                              <td key={b.key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: ar.porBanda[b.key] > 0 ? b.color : 'var(--text-muted)' }}>
                                {ar.porBanda[b.key] > 0 ? fmt(ar.porBanda[b.key]) : '—'}
                              </td>
                            ))}
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#7c3aed' }}>{fmt(ar.saldo)}</td>
                          </tr>

                          {arOpen && ar.ops.map(op => {
                            const c = bandaColor(op._banda)
                            return (
                              <tr key={`op-${op.id}`}>
                                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, paddingLeft: 48 }}>{op.folio}</td>
                                <td style={{ fontSize: 12 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? `#${op.id_proveedor_fk}`) : '—'}</td>
                                <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                                <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: op._dias > 0 ? '#dc2626' : 'var(--text-secondary)', fontWeight: op._dias > 0 ? 600 : 400 }}>{fmtF(op.fecha_vencimiento)}</td>
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: c, fontWeight: 600 }}>
                                  {op._dias <= 0 ? `${Math.abs(op._dias)} p/v` : `+${op._dias}`}
                                </td>
                                {BANDAS.map(b => (
                                  <td key={b.key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: op._banda === b.key ? b.color : 'var(--text-muted)', fontWeight: op._banda === b.key ? 600 : 400 }}>
                                    {op._banda === b.key ? fmt(op._saldoReal) : '—'}
                                  </td>
                                ))}
                                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--blue)' }}>{fmt(op._saldoReal)}</td>
                              </tr>
                            )
                          })}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}

              {/* Total general */}
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={5} style={{ color: 'var(--blue)', padding: '10px 12px' }}>TOTAL GENERAL ({totalDocs} OP{totalDocs !== 1 ? 's' : ''})</td>
                {BANDAS.map(b => (
                  <td key={b.key} style={{ textAlign: 'right', color: b.color, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(totalBandas[b.key])}
                  </td>
                ))}
                <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(totalSaldo)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
