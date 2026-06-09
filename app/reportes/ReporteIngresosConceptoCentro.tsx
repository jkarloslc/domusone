'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtF = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

type Recibo = {
  id: number; folio: string | null; fecha: string; status: string
  id_centro_ingreso_fk: number | null; monto_total: number; descripcion: string | null
}
type ConceptoRow  = { id_recibo_fk: number; nombre_concepto: string; monto: number }
type Centro       = { id: number; nombre: string; tipo: string | null }

type ConceptoAgregado = { nombre: string; total: number; recibos: Recibo[]; montoPorRecibo: Record<number, number> }
type CentroAgregado   = { id: number; nombre: string; total: number; conceptos: ConceptoAgregado[] }

const COLORS = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#0891b2', '#9333ea', '#92400e']

export default function ReporteIngresosConceptoCentro() {
  const [recibos,      setRecibos]      = useState<Recibo[]>([])
  const [centros,      setCentros]      = useState<Centro[]>([])
  const [conceptosMap, setConceptosMap] = useState<Record<number, ConceptoRow[]>>({})
  const [loading,      setLoading]      = useState(true)
  const [tab,          setTab]          = useState<'jerarquico' | 'pivot'>('jerarquico')
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())

  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Confirmado')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: rs }, { data: cs }] = await Promise.all([
      dbCtrl.from('recibos_ingreso')
        .select('id, folio, fecha, status, id_centro_ingreso_fk, monto_total, descripcion')
        .order('fecha', { ascending: false }),
      dbCfg.from('centros_ingreso').select('id, nombre, tipo').order('nombre'),
    ])
    setCentros(cs ?? [])

    let result: Recibo[] = rs ?? []
    if (filtroStatus) result = result.filter(r => r.status === filtroStatus)
    if (filtroCentro) result = result.filter(r => r.id_centro_ingreso_fk === Number(filtroCentro))
    if (filtroDe)     result = result.filter(r => r.fecha >= filtroDe)
    if (filtroA)      result = result.filter(r => r.fecha <= filtroA)
    setRecibos(result)

    if (result.length > 0) {
      const ids = result.map(r => r.id)
      const { data: cp } = await dbCtrl
        .from('recibos_ingreso_conceptos')
        .select('id_recibo_fk, nombre_concepto, monto')
        .in('id_recibo_fk', ids)
      const map: Record<number, ConceptoRow[]> = {}
      ;(cp ?? []).forEach((c: ConceptoRow) => {
        if (!map[c.id_recibo_fk]) map[c.id_recibo_fk] = []
        map[c.id_recibo_fk].push(c)
      })
      setConceptosMap(map)
    } else {
      setConceptosMap({})
    }
    setLoading(false)
  }, [filtroCentro, filtroStatus, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const centroMap    = Object.fromEntries(centros.map(c => [c.id, c]))
  const totalGeneral = recibos.reduce((s, r) => s + Number(r.monto_total ?? 0), 0)

  // Agrupar: Centro → Concepto → Recibos
  const centroIds  = Array.from(new Set(recibos.map(r => r.id_centro_ingreso_fk ?? 0)))
  const centroData: CentroAgregado[] = centroIds.map(cid => {
    const cRecibos = recibos.filter(r => (r.id_centro_ingreso_fk ?? 0) === cid)

    const cpAcum: Record<string, { total: number; recibos: Recibo[]; montoPorRecibo: Record<number, number> }> = {}

    cRecibos.forEach(r => {
      const conceptos = conceptosMap[r.id] ?? []
      if (conceptos.length > 0) {
        conceptos.forEach(c => {
          if (!cpAcum[c.nombre_concepto]) cpAcum[c.nombre_concepto] = { total: 0, recibos: [], montoPorRecibo: {} }
          cpAcum[c.nombre_concepto].total += c.monto
          cpAcum[c.nombre_concepto].montoPorRecibo[r.id] = (cpAcum[c.nombre_concepto].montoPorRecibo[r.id] ?? 0) + c.monto
          if (!cpAcum[c.nombre_concepto].recibos.find(x => x.id === r.id))
            cpAcum[c.nombre_concepto].recibos.push(r)
        })
      } else {
        const key = 'Sin concepto'
        if (!cpAcum[key]) cpAcum[key] = { total: 0, recibos: [], montoPorRecibo: {} }
        cpAcum[key].total += Number(r.monto_total ?? 0)
        cpAcum[key].montoPorRecibo[r.id] = Number(r.monto_total ?? 0)
        cpAcum[key].recibos.push(r)
      }
    })

    const conceptos = Object.entries(cpAcum)
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.total - a.total)

    return {
      id:       cid,
      nombre:   centroMap[cid]?.nombre ?? 'Sin centro',
      total:    cRecibos.reduce((s, r) => s + Number(r.monto_total ?? 0), 0),
      conceptos,
    }
  }).sort((a, b) => b.total - a.total)

  // Pivot: lista única de conceptos
  const allConceptos = Array.from(
    new Set(centroData.flatMap(c => c.conceptos.map(cp => cp.nombre)))
  ).sort((a, b) => {
    if (a === 'Sin concepto') return 1
    if (b === 'Sin concepto') return -1
    return a.localeCompare(b, 'es')
  })

  const toggle     = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const expandAll  = () =>
    setExpanded(new Set(centroData.flatMap(c => [`c-${c.id}`, ...c.conceptos.map(cp => `cp-${c.id}-${cp.nombre}`)])))
  const collapseAll = () => setExpanded(new Set())

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 180 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <select className="select" style={{ minWidth: 220 }} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}>
          <option value="">Todos los centros</option>
          {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={filtroA}  onChange={e => setFiltroA(e.target.value)}  style={{ width: 140 }} />
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 160px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Ingresos</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#059669' }}>{fmt(totalGeneral)}</div>
        </div>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 100px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recibos</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{recibos.length}</div>
        </div>
        {centroData.slice(0, 5).map((c, i) => (
          <div key={c.id} className="card" style={{ padding: '14px 20px', flex: '1 1 150px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS[i % COLORS.length] }}>{fmt(c.total)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {totalGeneral > 0 ? ((c.total / totalGeneral) * 100).toFixed(1) + '%' : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e2e8f0' }}>
        {([['jerarquico', 'Centro → Concepto'], ['pivot', 'Pivot Centro × Concepto']] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setExpanded(new Set()) }}
            style={{
              padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: 'transparent',
              borderBottom: tab === key ? '2px solid var(--blue)' : '2px solid transparent',
              color: tab === key ? 'var(--blue)' : 'var(--text-secondary)',
              marginBottom: -2,
            }}>{label}</button>
        ))}
      </div>

      <PrintBar
        title="Ingresos-Concepto-Centro"
        count={recibos.length}
        reportTitle="Ingresos por Concepto según Centro de Ingreso"
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : recibos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Sin ingresos con los filtros aplicados
        </div>
      ) : tab === 'jerarquico' ? (

        /* ── Vista jerárquica ─────────────────────────────────────── */
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={collapseAll}>Colapsar todo</button>
          </div>
          <div id="reporte-print-area" className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} id="reporte-table">
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Centro / Concepto / Folio', 'Fecha', 'Descripción', 'Total'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: i === 3 ? 'right' : 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {centroData.map((centro, ci) => {
                  const colorC = COLORS[ci % COLORS.length]
                  const keyC   = `c-${centro.id}`
                  const openC  = expanded.has(keyC)
                  return (
                    <>
                      {/* Fila Centro */}
                      <tr key={keyC} onClick={() => toggle(keyC)}
                        style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {openC
                              ? <ChevronDown  size={14} style={{ color: colorC }} />
                              : <ChevronRight size={14} style={{ color: colorC }} />}
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorC, display: 'inline-block' }} />
                            <span style={{ color: 'var(--text-primary)' }}>{centro.nombre}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                              ({centro.conceptos.length} concepto{centro.conceptos.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                        </td>
                        <td colSpan={2} />
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: colorC }}>
                          {fmt(centro.total)}
                        </td>
                      </tr>

                      {/* Conceptos del centro */}
                      {openC && centro.conceptos.map(cp => {
                        const keyCP = `cp-${centro.id}-${cp.nombre}`
                        const openCP = expanded.has(keyCP)
                        return (
                          <>
                            {/* Fila Concepto */}
                            <tr key={keyCP} onClick={() => toggle(keyCP)}
                              style={{ background: '#fafbfc', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '9px 14px 9px 36px', fontWeight: 600 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {openCP
                                    ? <ChevronDown  size={12} style={{ color: '#64748b' }} />
                                    : <ChevronRight size={12} style={{ color: '#64748b' }} />}
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: colorC + 'bb', display: 'inline-block' }} />
                                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{cp.nombre}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                                    ({cp.recibos.length} recibo{cp.recibos.length !== 1 ? 's' : ''})
                                  </span>
                                </div>
                              </td>
                              <td colSpan={2} />
                              <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: '#059669', fontSize: 12 }}>
                                {fmt(cp.total)}
                              </td>
                            </tr>

                            {/* Recibos del concepto */}
                            {openCP && cp.recibos.map(r => (
                              <tr key={`r-${r.id}-${cp.nombre}`} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '7px 14px 7px 62px', fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)' }}>
                                  {r.folio ?? `ING-${r.id}`}
                                </td>
                                <td style={{ padding: '7px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                                  {fmtF(r.fecha)}
                                </td>
                                <td style={{ padding: '7px 14px', fontSize: 12, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.descripcion ?? '—'}
                                </td>
                                <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                  {fmt(cp.montoPorRecibo[r.id] ?? 0)}
                                </td>
                              </tr>
                            ))}
                          </>
                        )
                      })}
                    </>
                  )
                })}

                {/* Total general */}
                <tr style={{ background: '#0f172a', borderTop: '2px solid #334155' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    Total General · {recibos.length} recibos
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#6ee7b7', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(totalGeneral)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>

      ) : (

        /* ── Vista Pivot ──────────────────────────────────────────── */
        <div id="reporte-print-area" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }} id="reporte-table">
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{
                  padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
                  position: 'sticky', left: 0, background: '#f8fafc', borderRight: '2px solid #e2e8f0', minWidth: 180,
                }}>
                  Centro de Ingreso
                </th>
                {allConceptos.map(cp => (
                  <th key={cp} style={{
                    padding: '10px 10px', textAlign: 'right', fontSize: 11, fontWeight: 700,
                    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    whiteSpace: 'nowrap', minWidth: 110,
                  }}>
                    {cp}
                  </th>
                ))}
                <th style={{
                  padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700,
                  color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderLeft: '2px solid #e2e8f0', minWidth: 120,
                }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {centroData.map((c, ci) => {
                const colorC = COLORS[ci % COLORS.length]
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: colorC, position: 'sticky', left: 0, background: '#fff', borderRight: '2px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: colorC, display: 'inline-block', flexShrink: 0 }} />
                        {c.nombre}
                      </div>
                    </td>
                    {allConceptos.map(cp => {
                      const cpData = c.conceptos.find(x => x.nombre === cp)
                      return (
                        <td key={cp} style={{
                          padding: '9px 10px', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums',
                          color: cpData ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}>
                          {cpData ? fmt(cpData.total) : '—'}
                        </td>
                      )
                    })}
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: colorC, borderLeft: '2px solid #e2e8f0', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(c.total)}
                    </td>
                  </tr>
                )
              })}

              {/* Fila totales */}
              <tr style={{ background: '#0f172a', borderTop: '2px solid #334155' }}>
                <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#f8fafc', position: 'sticky', left: 0, background: '#0f172a', borderRight: '2px solid #334155' }}>
                  Total General
                </td>
                {allConceptos.map(cp => {
                  const total = centroData.reduce((s, c) => s + (c.conceptos.find(x => x.nombre === cp)?.total ?? 0), 0)
                  return (
                    <td key={cp} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 12, color: total > 0 ? '#6ee7b7' : '#475569' }}>
                      {total > 0 ? fmt(total) : '—'}
                    </td>
                  )
                })}
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#6ee7b7', borderLeft: '2px solid #334155', fontVariantNumeric: 'tabular-nums' }}>
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
