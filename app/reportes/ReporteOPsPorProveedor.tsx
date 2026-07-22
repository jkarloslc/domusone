'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n: number | null | undefined) =>
  n != null ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtF = (s: string | null | undefined) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_OP  = ['Pendiente Auth', 'Pendiente Auth Finanzas', 'Pendiente', 'Pagada', 'Rechazada', 'Cancelada'] as const
const STATUS_CLR: Record<string, string> = {
  'Pendiente Auth': '#7c3aed', 'Pendiente Auth Finanzas': '#6d28d9', Pendiente: '#d97706',
  Pagada: '#15803d', Rechazada: '#dc2626', Cancelada: '#64748b',
}

type OP = {
  id: number; folio: string; concepto: string | null; tipo_gasto: string | null
  monto: number; saldo: number | null; fecha_op: string | null
  fecha_vencimiento: string | null; status: string
  id_proveedor_fk: number | null; id_centro_costo_fk: number | null; id_area_fk: number | null
}
type Prov = { id: number; nombre: string; rfc: string | null; clave: string | null }

export default function ReporteOPsPorProveedor() {
  const [ops,     setOps]     = useState<OP[]>([])
  const [provs,   setProvs]   = useState<Prov[]>([])
  const [ccMap,   setCcMap]   = useState<Record<number, string>>({})
  const [areaMap, setAreaMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Filtros
  const [filtroProv,   setFiltroProv]   = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: psData }, { data: opsData }, { data: ccData }, { data: arData }] = await Promise.all([
      dbComp.from('proveedores').select('id, nombre, rfc, clave').order('nombre'),
      dbComp.from('ordenes_pago')
        .select('id, folio, concepto, tipo_gasto, monto, saldo, fecha_op, fecha_vencimiento, status, id_proveedor_fk, id_centro_costo_fk, id_area_fk')
        .order('fecha_op', { ascending: false }),
      dbCfg.from('centros_costo').select('id, nombre').order('nombre'),
      dbCfg.from('areas').select('id, nombre').order('nombre'),
    ])
    setProvs((psData ?? []) as Prov[])
    setOps((opsData ?? []) as OP[])
    const cm: Record<number, string> = {}
    ;(ccData ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
    setCcMap(cm)
    const am: Record<number, string> = {}
    ;(arData ?? []).forEach((a: any) => { am[a.id] = a.nombre })
    setAreaMap(am)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtrar
  const opsFiltradas = useMemo(() => ops.filter(op => {
    if (filtroProv   && op.id_proveedor_fk !== Number(filtroProv)) return false
    if (filtroStatus && op.status !== filtroStatus)                 return false
    if (filtroTipo   && op.tipo_gasto !== filtroTipo)               return false
    if (filtroDe     && (!op.fecha_op || op.fecha_op < filtroDe))  return false
    if (filtroA      && (!op.fecha_op || op.fecha_op > filtroA))   return false
    return true
  }), [ops, filtroProv, filtroStatus, filtroTipo, filtroDe, filtroA])

  // Agrupar por proveedor
  const grupos = useMemo(() => {
    const map = new Map<number | null, { prov: Prov | null; ops: OP[] }>()
    opsFiltradas.forEach(op => {
      const key = op.id_proveedor_fk
      if (!map.has(key)) {
        map.set(key, { prov: provs.find(p => p.id === key) ?? null, ops: [] })
      }
      map.get(key)!.ops.push(op)
    })
    return Array.from(map.values()).sort((a, b) =>
      (a.prov?.nombre ?? 'ZZZ').localeCompare(b.prov?.nombre ?? 'ZZZ')
    )
  }, [opsFiltradas, provs])

  // Totales globales
  const totalGlobal  = useMemo(() => opsFiltradas.reduce((s, o) => s + (o.monto ?? 0), 0), [opsFiltradas])
  const pagadoGlobal = useMemo(() => opsFiltradas.reduce((s, o) => s + Math.max(0, (o.monto ?? 0) - (o.saldo ?? o.monto ?? 0)), 0), [opsFiltradas])
  const saldoGlobal  = useMemo(() => opsFiltradas.reduce((s, o) => s + (o.saldo ?? o.monto ?? 0), 0), [opsFiltradas])

  const tiposGasto = useMemo(() => Array.from(new Set(ops.map(o => o.tipo_gasto).filter(Boolean))).sort(), [ops])

  const toggle = (id: number | null) =>
    setExpanded(prev => { const n = new Set(prev); n.has(id as number) ? n.delete(id as number) : n.add(id as number); return n })

  const expandAll   = () => setExpanded(new Set(grupos.map(g => g.prov?.id ?? -1)))
  const collapseAll = () => setExpanded(new Set())

  // Export Excel
  const exportExcel = () => {
    const resumen = grupos.map(g => {
      const total  = g.ops.reduce((s, o) => s + (o.monto ?? 0), 0)
      const pagado = g.ops.reduce((s, o) => s + Math.max(0, (o.monto ?? 0) - (o.saldo ?? o.monto ?? 0)), 0)
      return {
        Proveedor:  g.prov?.nombre ?? 'Sin proveedor',
        RFC:        g.prov?.rfc ?? '',
        'Nº OPs':   g.ops.length,
        'Total':    total,
        'Pagado':   pagado,
        'Saldo':    total - pagado,
      }
    })
    const detalle = opsFiltradas.map(o => ({
      Folio:       o.folio,
      Proveedor:   provs.find(p => p.id === o.id_proveedor_fk)?.nombre ?? '—',
      Concepto:    o.concepto ?? '',
      'Tipo Gasto':o.tipo_gasto ?? '',
      'Fecha OP':  o.fecha_op  ?? '',
      'Vencimiento':o.fecha_vencimiento ?? '',
      Monto:       o.monto ?? 0,
      Pagado:      Math.max(0, (o.monto ?? 0) - (o.saldo ?? o.monto ?? 0)),
      Saldo:       o.saldo ?? o.monto ?? 0,
      Status:      o.status,
      CC:          o.id_centro_costo_fk ? (ccMap[o.id_centro_costo_fk] ?? '') : '',
      Área:        o.id_area_fk ? (areaMap[o.id_area_fk] ?? '') : '',
    }))
    const wb  = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen),  'Resumen por Proveedor')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle),  'Detalle OPs')
    XLSX.writeFile(wb, `OPs-Por-Proveedor_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  return (
    <div>
      <PrintBar title="Órdenes de Pago por Proveedor" count={opsFiltradas.length} />

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <label className="label">Proveedor</label>
          <select className="select" style={{ minWidth: 180 }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
            <option value="">Todos</option>
            {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_OP.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tipo de Gasto</label>
          <select className="select" style={{ minWidth: 160 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos</option>
            {tiposGasto.map(t => <option key={t!} value={t!}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fecha OP Desde</label>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} />
        </div>
        <div>
          <label className="label">Hasta</label>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} />
        </div>
        <button className="btn-ghost" onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={13} /> Actualizar
        </button>
        <button onClick={exportExcel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#15803d', color: '#fff', cursor: 'pointer' }}>
          <FileSpreadsheet size={13} /> Excel
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Proveedores',     value: grupos.length,          color: '#2563eb', bg: '#eff6ff' },
          { label: 'Total OPs',       value: opsFiltradas.length,    color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Monto Total',     value: fmt(totalGlobal),       color: '#0f766e', bg: '#f0fdfa' },
          { label: 'Pagado',          value: fmt(pagadoGlobal),      color: '#15803d', bg: '#f0fdf4' },
          { label: 'Saldo Pendiente', value: fmt(saldoGlobal),       color: '#d97706', bg: '#fffbeb' },
        ].map(k => (
          <div key={k.label} className="card" style={{ flex: '1 1 140px', maxWidth: 220, padding: '12px 16px', background: k.bg, border: `1px solid ${k.color}22` }}>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
      ) : (
        <>
          {/* Controles expandir */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={expandAll}>Expandir todo</button>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={collapseAll}>Colapsar todo</button>
          </div>

          {/* Tabla */}
          <div id="reporte-print-area">
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left',  padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Proveedor</th>
                  <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>OPs</th>
                  <th style={{ textAlign: 'right',  padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Total</th>
                  <th style={{ textAlign: 'right',  padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Pagado</th>
                  <th style={{ textAlign: 'right',  padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(g => {
                  const provId   = g.prov?.id ?? -1
                  const isOpen   = expanded.has(provId)
                  const total    = g.ops.reduce((s, o) => s + (o.monto ?? 0), 0)
                  const pagado   = g.ops.reduce((s, o) => s + Math.max(0, (o.monto ?? 0) - (o.saldo ?? o.monto ?? 0)), 0)
                  const saldo    = g.ops.reduce((s, o) => s + (o.saldo ?? o.monto ?? 0), 0)
                  return (
                    <>
                      {/* Fila cabecera proveedor */}
                      <tr key={`prov-${provId}`}
                        onClick={() => toggle(provId)}
                        style={{ background: '#f8fafc', cursor: 'pointer', borderTop: '2px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: '#1e293b' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            {g.prov?.nombre ?? 'Sin proveedor'}
                            {g.prov?.rfc && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, fontFamily: 'monospace' }}>{g.prov.rfc}</span>}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>{g.ops.length}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: '#15803d', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(pagado)}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', color: saldo > 0 ? '#d97706' : '#15803d', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(saldo)}</td>
                      </tr>

                      {/* Detalle OPs */}
                      {isOpen && g.ops.map(op => {
                        const opPagado = Math.max(0, (op.monto ?? 0) - (op.saldo ?? op.monto ?? 0))
                        const hoy = new Date().toISOString().slice(0, 10)
                        const vencida = op.fecha_vencimiento && op.fecha_vencimiento < hoy && !['Pagada', 'Cancelada', 'Rechazada'].includes(op.status)
                        return (
                          <tr key={op.id} style={{ borderTop: '1px solid #f1f5f9', background: '#fff' }}>
                            <td style={{ padding: '7px 10px 7px 30px' }}>
                              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 12 }}>{op.folio}</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                {op.concepto ?? '—'}
                                {op.tipo_gasto && <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 8, background: '#f1f5f9', color: '#475569', fontSize: 10 }}>{op.tipo_gasto}</span>}
                              </div>
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                                {op.id_centro_costo_fk && ccMap[op.id_centro_costo_fk] ? ccMap[op.id_centro_costo_fk] : ''}
                                {op.id_area_fk && areaMap[op.id_area_fk] ? ` / ${areaMap[op.id_area_fk]}` : ''}
                              </div>
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'center', verticalAlign: 'top' }}>
                              <div style={{ fontSize: 11, color: '#64748b' }}>{fmtF(op.fecha_op)}</div>
                              {op.fecha_vencimiento && (
                                <div style={{ fontSize: 10, color: vencida ? '#dc2626' : '#94a3b8', fontWeight: vencida ? 700 : 400, marginTop: 1 }}>
                                  Vence: {fmtF(op.fecha_vencimiento)}{vencida ? ' ⚠' : ''}
                                </div>
                              )}
                              <div style={{ marginTop: 3 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: `${STATUS_CLR[op.status]}20`, color: STATUS_CLR[op.status] }}>
                                  {op.status}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>{fmt(op.monto)}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>{opPagado > 0 ? fmt(opPagado) : '—'}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', color: (op.saldo ?? 0) > 0 ? '#d97706' : '#15803d', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>{fmt(op.saldo ?? op.monto)}</td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}

                {/* Total general */}
                <tr style={{ background: '#1e293b', borderTop: '2px solid #1e293b' }}>
                  <td style={{ padding: '10px 10px', color: '#fff', fontWeight: 700 }}>Total General — {grupos.length} proveedores · {opsFiltradas.length} OPs</td>
                  <td />
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalGlobal)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#86efac', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(pagadoGlobal)}</td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: '#fde68a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(saldoGlobal)}</td>
                </tr>
              </tbody>
            </table>

            {grupos.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Sin datos para los filtros seleccionados.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
