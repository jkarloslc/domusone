'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

const fmt  = (n: number | null) => n != null ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

type OC = {
  id: number; folio: string; fecha_oc: string | null; status: string
  total: number; id_proveedor_fk: number | null; id_centro_costo_fk: number | null
}

type ProvGroup = {
  provId: number; provNombre: string
  ocs: OC[]; total: number
}

const STATUS_COLOR: Record<string, string> = {
  Borrador:         '#d97706',
  'Pendiente Auth': '#7c3aed',
  Autorizada:       '#2563eb',
  'Enviada al Prov':'#0891b2',
  'Recibida Parcial':'#059669',
  Cerrada:          '#15803d',
  Cancelada:        '#dc2626',
}

export default function ReporteComprasPorProveedor() {
  const [ocs, setOcs]         = useState<OC[]>([])
  const [provMap, setProvMap] = useState<Record<number, string>>({})
  const [ccMap, setCcMap]     = useState<Record<number, string>>({})
  const [provs, setProvs]     = useState<any[]>([])
  const [ccs, setCcs]         = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Filtros
  const [filtroProv, setFiltroProv]   = useState('')
  const [filtroCC,   setFiltroCC]     = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroDe,   setFiltroDe]     = useState('')
  const [filtroA,    setFiltroA]      = useState('')

  const STATUS_LIST = ['Borrador','Pendiente Auth','Autorizada','Enviada al Prov','Recibida Parcial','Cerrada','Cancelada']

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ocsData }, { data: ps }, { data: ccData }] = await Promise.all([
      dbComp.from('ordenes_compra').select('id, folio, fecha_oc, status, total, id_proveedor_fk, id_centro_costo_fk')
        .order('fecha_oc', { ascending: false }),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').order('nombre'),
    ])
    const pm: Record<number, string> = {}
    ;(ps ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    const cm: Record<number, string> = {}
    ;(ccData ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
    setProvMap(pm); setCcMap(cm)
    setProvs(ps ?? []); setCcs(ccData ?? [])

    let result: OC[] = ocsData ?? []
    if (filtroProv)   result = result.filter(r => r.id_proveedor_fk === Number(filtroProv))
    if (filtroCC)     result = result.filter(r => r.id_centro_costo_fk === Number(filtroCC))
    if (filtroStatus) result = result.filter(r => r.status === filtroStatus)
    if (filtroDe)     result = result.filter(r => (r.fecha_oc ?? '') >= filtroDe)
    if (filtroA)      result = result.filter(r => (r.fecha_oc ?? '') <= filtroA)
    setOcs(result)
    setLoading(false)
  }, [filtroProv, filtroCC, filtroStatus, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  // Agrupar por proveedor
  const grupos: ProvGroup[] = Object.values(
    ocs.reduce((acc, oc) => {
      const pid = oc.id_proveedor_fk ?? 0
      if (!acc[pid]) acc[pid] = { provId: pid, provNombre: provMap[pid] ?? 'Sin proveedor', ocs: [], total: 0 }
      acc[pid].ocs.push(oc)
      acc[pid].total += Number(oc.total ?? 0)
      return acc
    }, {} as Record<number, ProvGroup>)
  ).sort((a, b) => b.total - a.total)

  const totalGeneral = grupos.reduce((s, g) => s + g.total, 0)

  const toggle = (pid: number) =>
    setExpanded(prev => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n })

  const expandAll   = () => setExpanded(new Set(grupos.map(g => g.provId)))
  const collapseAll = () => setExpanded(new Set())

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 200 }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 180 }} value={filtroCC} onChange={e => setFiltroCC(e.target.value)}>
          <option value="">Todos los CC</option>
          {ccs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={filtroA}  onChange={e => setFiltroA(e.target.value)}  style={{ width: 140 }} />
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Proveedores',    value: grupos.length,                               fmt: String },
          { label: 'Órdenes',        value: ocs.length,                                  fmt: String },
          { label: 'Total General',  value: totalGeneral,                                fmt: (v: number) => fmt(v) },
          { label: 'Cerradas',       value: ocs.filter(o => o.status === 'Cerrada').reduce((s, o) => s + Number(o.total ?? 0), 0), fmt: (v: number) => fmt(v) },
          { label: 'Pendientes',     value: ocs.filter(o => !['Cerrada','Cancelada'].includes(o.status)).reduce((s, o) => s + Number(o.total ?? 0), 0), fmt: (v: number) => fmt(v) },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', flex: '1 1 140px', minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{(k.fmt as any)(k.value)}</div>
          </div>
        ))}
      </div>

      <PrintBar title="Compras-por-Proveedor" count={ocs.length} reportTitle="Compras por Proveedor" />

      {/* Controles expansión */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={collapseAll}>Colapsar todo</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      ) : grupos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin órdenes con los filtros aplicados</div>
      ) : (
        <div id="reporte-print-area" className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Proveedor / Folio</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Centro de Costo</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fecha</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total OC</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <>
                  {/* Fila proveedor */}
                  <tr key={`prov-${g.provId}`}
                    onClick={() => toggle(g.provId)}
                    style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {expanded.has(g.provId)
                          ? <ChevronDown size={14} style={{ color: 'var(--blue)' }} />
                          : <ChevronRight size={14} style={{ color: 'var(--blue)' }} />}
                        {g.provNombre}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
                          ({g.ocs.length} OC{g.ocs.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </td>
                    <td colSpan={3} />
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {fmt(g.total)}
                    </td>
                  </tr>
                  {/* Detalle OCs */}
                  {expanded.has(g.provId) && g.ocs.map(oc => (
                    <tr key={`oc-${oc.id}`} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff' }}>
                      <td style={{ padding: '8px 14px 8px 38px', fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)' }}>
                        {oc.folio}
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {oc.id_centro_costo_fk ? (ccMap[oc.id_centro_costo_fk] ?? `#${oc.id_centro_costo_fk}`) : '—'}
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                        {fmtF(oc.fecha_oc)}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                          background: (STATUS_COLOR[oc.status] ?? '#64748b') + '18',
                          color: STATUS_COLOR[oc.status] ?? '#64748b',
                          border: `1px solid ${(STATUS_COLOR[oc.status] ?? '#64748b')}40`,
                        }}>{oc.status}</span>
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
                        {fmt(oc.total)}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
              {/* Total general */}
              <tr style={{ background: '#0f172a', borderTop: '2px solid #334155' }}>
                <td colSpan={4} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                  Total General ({grupos.length} proveedores · {ocs.length} OCs)
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#f8fafc' }}>
                  {fmt(totalGeneral)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
