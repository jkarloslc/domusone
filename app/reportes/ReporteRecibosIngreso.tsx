'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { PrintBar } from './utils'
import FiltroAgrupadorCentro from '@/components/ui/FiltroAgrupadorCentro'
import { cargarCentrosAgrupados, idsCentrosFiltro, CentroIngresoAgr, AgrupadorIngreso } from '@/lib/centrosIngreso'
import { RefreshCw, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtF = (s: string) =>
  new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

type Recibo = {
  id: number; folio: string | null; fecha: string; status: string
  id_centro_ingreso_fk: number | null; monto_total: number; descripcion: string | null
}
type LineaFiscal = { id_recibo_fk: number; monto: number; subtotal: number | null; iva: number | null }
type ReciboFiscal = Recibo & { subtotal: number; iva: number; total: number; sinDesglose: boolean }
type Totales = { subtotal: number; iva: number; total: number; n: number }
type CentroGrupo = { id: number; nombre: string; recibos: ReciboFiscal[] } & Totales
type AgrGrupo = { clave: string; nombre: string; centros: CentroGrupo[] } & Totales

const STATUS_COLOR: Record<string, string> = { Confirmado: '#15803d', Borrador: '#d97706', Cancelado: '#dc2626' }

const sumar = (rs: ReciboFiscal[]): Totales => ({
  subtotal: rs.reduce((s, r) => s + r.subtotal, 0),
  iva:      rs.reduce((s, r) => s + r.iva, 0),
  total:    rs.reduce((s, r) => s + r.total, 0),
  n:        rs.length,
})

export default function ReporteRecibosIngreso() {
  const [recibos,      setRecibos]      = useState<ReciboFiscal[]>([])
  const [centros,      setCentros]      = useState<CentroIngresoAgr[]>([])
  const [agrupadores,  setAgrupadores]  = useState<AgrupadorIngreso[]>([])
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())

  const [filtroAgr,    setFiltroAgr]    = useState('')
  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Confirmado')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { centros: cs, agrupadores: ags } = await cargarCentrosAgrupados()
    setCentros(cs); setAgrupadores(ags)
    const idsC = idsCentrosFiltro(cs, filtroAgr, filtroCentro)

    // Recibos (paginado: PostgREST limita a 1000 filas por consulta)
    const base: Recibo[] = []
    for (let from = 0; ; from += 1000) {
      let q = dbCtrl.from('recibos_ingreso')
        .select('id, folio, fecha, status, id_centro_ingreso_fk, monto_total, descripcion')
        .order('fecha', { ascending: false }).order('id', { ascending: false })
        .range(from, from + 999)
      if (filtroStatus) q = q.eq('status', filtroStatus)
      if (filtroDe)     q = q.gte('fecha', filtroDe)
      if (filtroA)      q = q.lte('fecha', filtroA)
      if (idsC)         q = q.in('id_centro_ingreso_fk', Array.from(idsC))
      const { data, error } = await q
      if (error) { console.error('recibos_ingreso:', error.message); break }
      base.push(...((data ?? []) as Recibo[]))
      if (!data || data.length < 1000) break
    }

    // Desglose fiscal: conceptos + secciones de cada recibo
    const lineas: Record<number, LineaFiscal[]> = {}
    const ids = base.map(r => r.id)
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      const [c, s] = await Promise.all([
        dbCtrl.from('recibos_ingreso_conceptos').select('id_recibo_fk, monto, subtotal, iva').in('id_recibo_fk', chunk),
        dbCtrl.from('recibos_ingreso_secciones').select('id_recibo_fk, monto, subtotal, iva').in('id_recibo_fk', chunk),
      ])
      if (c.error) console.error('recibos_ingreso_conceptos:', c.error.message)
      if (s.error) console.error('recibos_ingreso_secciones:', s.error.message)
      ;[...(c.data ?? []), ...(s.data ?? [])].forEach((l: any) => {
        ;(lineas[l.id_recibo_fk] ??= []).push(l)
      })
    }

    setRecibos(base.map(r => {
      const total = Number(r.monto_total ?? 0)
      const ls = lineas[r.id] ?? []
      // Si todas las líneas traen subtotal, el desglose es exacto; si no
      // (recibos previos a la migración) el monto se toma como subtotal sin IVA.
      const completo = ls.length > 0 && ls.every(l => l.subtotal != null)
      if (completo) {
        const subtotal = ls.reduce((a, l) => a + Number(l.subtotal), 0)
        const iva      = ls.reduce((a, l) => a + Number(l.iva ?? 0), 0)
        return { ...r, subtotal, iva, total: subtotal + iva, sinDesglose: false }
      }
      return { ...r, subtotal: total, iva: 0, total, sinDesglose: true }
    }))
    setLoading(false)
  }, [filtroAgr, filtroCentro, filtroStatus, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const centroMap = Object.fromEntries(centros.map(c => [c.id, c]))

  // Agrupador → Centro → Recibos
  const agrData: AgrGrupo[] = (() => {
    const porAgr = new Map<string, Map<number, ReciboFiscal[]>>()
    recibos.forEach(r => {
      const c = r.id_centro_ingreso_fk != null ? centroMap[r.id_centro_ingreso_fk] : undefined
      const agr = c?.agrupador || 'Sin agrupador'
      const cid = r.id_centro_ingreso_fk ?? 0
      if (!porAgr.has(agr)) porAgr.set(agr, new Map())
      const m = porAgr.get(agr)!
      if (!m.has(cid)) m.set(cid, [])
      m.get(cid)!.push(r)
    })
    return Array.from(porAgr.entries()).map(([nombre, m]) => {
      const centrosG: CentroGrupo[] = Array.from(m.entries()).map(([cid, rs]) => ({
        id: cid, nombre: centroMap[cid]?.nombre ?? 'Sin centro', recibos: rs, ...sumar(rs),
      })).sort((a, b) => b.total - a.total)
      const todos = centrosG.flatMap(c => c.recibos)
      return { clave: nombre, nombre, centros: centrosG, ...sumar(todos) }
    }).sort((a, b) => {
      if (a.nombre === 'Sin agrupador') return 1
      if (b.nombre === 'Sin agrupador') return -1
      return b.total - a.total
    })
  })()

  const general = sumar(recibos)
  const sinDesglose = recibos.filter(r => r.sinDesglose).length

  const toggle = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const expandAll = () =>
    setExpanded(new Set(agrData.flatMap(a => [`a-${a.clave}`, ...a.centros.map(c => `c-${a.clave}-${c.id}`)])))
  const collapseAll = () => setExpanded(new Set())

  const exportarExcel = () => {
    const today = new Date().toISOString().slice(0, 10)
    const filaT = (t: Totales) => ({ 'Recibos': t.n, 'Subtotal': t.subtotal, 'IVA': t.iva, 'Total': t.total })
    const resumen: any[] = []
    agrData.forEach(a => {
      a.centros.forEach(c => resumen.push({ Agrupador: a.nombre, 'Centro de Ingreso': c.nombre, ...filaT(c) }))
      resumen.push({ Agrupador: a.nombre, 'Centro de Ingreso': 'SUBTOTAL AGRUPADOR', ...filaT(a) })
    })
    resumen.push({ Agrupador: 'TOTAL GENERAL', 'Centro de Ingreso': '', ...filaT(general) })
    const detalle = agrData.flatMap(a => a.centros.flatMap(c => c.recibos.map(r => ({
      Agrupador: a.nombre, 'Centro de Ingreso': c.nombre, Folio: r.folio ?? `ING-${r.id}`,
      Fecha: r.fecha, Status: r.status, Descripción: r.descripcion ?? '',
      Subtotal: r.subtotal, IVA: r.iva, Total: r.total, 'Sin desglose IVA': r.sinDesglose ? 'Sí' : '',
    }))))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle')
    XLSX.writeFile(wb, `Recibos-de-Ingreso_${today}.xlsx`)
  }

  const th = (i: number): React.CSSProperties => ({
    padding: '10px 14px', textAlign: i >= 3 ? 'right' : 'left', fontSize: 11, color: 'var(--text-muted)',
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
  })
  const num = (v: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
    padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...extra,
  })

  const kpi = (label: string, valor: string, color?: string) => (
    <div className="card" style={{ padding: '14px 20px', flex: '1 1 160px', maxWidth: 260 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{valor}</div>
    </div>
  )

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 'auto', minWidth: 180 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <FiltroAgrupadorCentro centros={centros} agrupadores={agrupadores} filtroAgr={filtroAgr} setFiltroAgr={setFiltroAgr}
          filtroCentro={filtroCentro} setFiltroCentro={setFiltroCentro} minWidth={220} />
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={filtroA}  onChange={e => setFiltroA(e.target.value)}  style={{ width: 140 }} />
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {kpi('Subtotal', fmt(general.subtotal), '#2563eb')}
        {kpi('IVA', fmt(general.iva), '#d97706')}
        {kpi('Total', fmt(general.total), '#059669')}
        {kpi('Recibos', String(general.n))}
      </div>

      <PrintBar
        title="Recibos-de-Ingreso"
        count={recibos.length}
        reportTitle="Recibos de Ingreso por Agrupador y Centro"
        hideCSV
        extra={
          <button className="btn-ghost" onClick={exportarExcel} disabled={recibos.length === 0}>
            <FileSpreadsheet size={13} /> Exportar Excel
          </button>
        }
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : recibos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Sin recibos con los filtros aplicados
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={collapseAll}>Colapsar todo</button>
            {sinDesglose > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                * {sinDesglose} recibo{sinDesglose !== 1 ? 's' : ''} sin desglose de IVA registrado: su monto se toma como subtotal (IVA $0.00).
              </span>
            )}
          </div>
          <div id="reporte-print-area" className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} id="reporte-table">
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['Agrupador / Centro / Folio', 'Fecha', 'Descripción', 'Subtotal', 'IVA', 'Total'].map((h, i) => (
                    <th key={h} style={th(i)}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agrData.map(a => {
                  const keyA = `a-${a.clave}`
                  const openA = expanded.has(keyA)
                  return (
                    <Fragment key={keyA}>
                      <tr onClick={() => toggle(keyA)} style={{ background: '#f1f5f9', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {openA ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <span>{a.nombre}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                              ({a.n} recibo{a.n !== 1 ? 's' : ''})
                            </span>
                          </div>
                        </td>
                        <td colSpan={2} />
                        <td style={num(a.subtotal, { fontWeight: 700 })}>{fmt(a.subtotal)}</td>
                        <td style={num(a.iva, { fontWeight: 700 })}>{fmt(a.iva)}</td>
                        <td style={num(a.total, { fontWeight: 700, color: '#059669' })}>{fmt(a.total)}</td>
                      </tr>

                      {openA && a.centros.map(c => {
                        const keyC = `c-${a.clave}-${c.id}`
                        const openC = expanded.has(keyC)
                        return (
                          <Fragment key={keyC}>
                            <tr onClick={() => toggle(keyC)} style={{ background: '#fafbfc', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '9px 14px 9px 36px', fontWeight: 600 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  {openC ? <ChevronDown size={12} style={{ color: '#64748b' }} /> : <ChevronRight size={12} style={{ color: '#64748b' }} />}
                                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{c.nombre}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({c.n})</span>
                                </div>
                              </td>
                              <td colSpan={2} />
                              <td style={num(c.subtotal, { fontWeight: 600, fontSize: 12 })}>{fmt(c.subtotal)}</td>
                              <td style={num(c.iva, { fontWeight: 600, fontSize: 12 })}>{fmt(c.iva)}</td>
                              <td style={num(c.total, { fontWeight: 600, fontSize: 12, color: '#059669' })}>{fmt(c.total)}</td>
                            </tr>

                            {openC && c.recibos.map(r => (
                              <tr key={`r-${r.id}`} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '7px 14px 7px 62px', fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)' }}>
                                  {r.folio ?? `ING-${r.id}`}
                                  {r.status !== 'Confirmado' && (
                                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: STATUS_COLOR[r.status] ?? '#64748b' }}>{r.status}</span>
                                  )}
                                </td>
                                <td style={{ padding: '7px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtF(r.fecha)}</td>
                                <td style={{ padding: '7px 14px', fontSize: 12, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {r.descripcion ?? '—'}
                                </td>
                                <td style={num(r.subtotal, { fontSize: 12 })}>{fmt(r.subtotal)}{r.sinDesglose && ' *'}</td>
                                <td style={num(r.iva, { fontSize: 12 })}>{fmt(r.iva)}</td>
                                <td style={num(r.total, { fontSize: 12, fontWeight: 600 })}>{fmt(r.total)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  )
                })}

                <tr style={{ background: '#0f172a', borderTop: '2px solid #334155' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    Total General · {general.n} recibos
                  </td>
                  <td style={num(general.subtotal, { fontWeight: 700, color: '#f8fafc' })}>{fmt(general.subtotal)}</td>
                  <td style={num(general.iva, { fontWeight: 700, color: '#f8fafc' })}>{fmt(general.iva)}</td>
                  <td style={num(general.total, { fontWeight: 700, fontSize: 14, color: '#6ee7b7' })}>{fmt(general.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
