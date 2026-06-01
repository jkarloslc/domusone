'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCfg } from '@/lib/supabase'
import { RefreshCw, Filter } from 'lucide-react'
import { PrintBar } from './utils'

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 0 })
const fmtPeso = (n: number) =>
  n > 0 ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

export default function ReporteLotesResumenClasif() {
  const [lotes,           setLotes]           = useState<any[]>([])
  const [secciones,       setSecciones]       = useState<any[]>([])
  const [clasificaciones, setClasificaciones] = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)
  const [queryError,      setQueryError]      = useState<string | null>(null)

  const [filterSec,    setFilterSec]    = useState('')
  const [filterClasif, setFilterClasif] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
    dbCfg.from('clasificacion').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setClasificaciones(data ?? []))
  }, [])

  const fetchLotes = useCallback(async () => {
    setLoading(true)
    setQueryError(null)
    let q = dbCat.from('lotes').select('*')
    if (filterSec)    q = q.eq('id_seccion_fk', Number(filterSec))
    if (filterClasif) q = q.eq('id_clasificacion_fk', Number(filterClasif))
    if (filterStatus) q = q.eq('status_lote', filterStatus)
    const { data, error } = await q
    if (error) setQueryError(error.message)
    setLotes(data ?? [])
    setLoading(false)
  }, [filterSec, filterClasif, filterStatus])

  useEffect(() => { fetchLotes() }, [fetchLotes])

  // Build lookup maps
  const secMap: Record<number, string> = {}
  secciones.forEach(s => { secMap[s.id] = s.nombre })
  const clasifMap: Record<number, string> = {}
  clasificaciones.forEach(c => { clasifMap[c.id] = c.nombre })

  // Build summary rows: seccion → clasificacion → totals
  type RowTotals = { total: number; vendidos: number; libres: number; bloqueados: number; superficie: number; valor: number }
  const summary: Record<string, Record<string, RowTotals>> = {}

  lotes.forEach(l => {
    const sec  = l.id_seccion_fk       ? (secMap[l.id_seccion_fk]           ?? 'Sin sección')         : 'Sin sección'
    const clas = l.id_clasificacion_fk ? (clasifMap[l.id_clasificacion_fk]  ?? 'Sin clasificación')   : 'Sin clasificación'
    if (!summary[sec])       summary[sec] = {}
    if (!summary[sec][clas]) summary[sec][clas] = { total: 0, vendidos: 0, libres: 0, bloqueados: 0, superficie: 0, valor: 0 }
    const r = summary[sec][clas]
    r.total++
    if (l.status_lote === 'Vendido')   r.vendidos++
    if (l.status_lote === 'Libre')     r.libres++
    if (l.status_lote === 'Bloqueado') r.bloqueados++
    r.superficie += l.superficie ?? 0
    r.valor      += l.valor_operacion ? Number(l.valor_operacion) : 0
  })

  const seccionesOrdenadas = Object.keys(summary).sort()

  // Grand total
  const gt: RowTotals = { total: 0, vendidos: 0, libres: 0, bloqueados: 0, superficie: 0, valor: 0 }
  lotes.forEach(l => {
    gt.total++
    if (l.status_lote === 'Vendido')   gt.vendidos++
    if (l.status_lote === 'Libre')     gt.libres++
    if (l.status_lote === 'Bloqueado') gt.bloqueados++
    gt.superficie += l.superficie ?? 0
    gt.valor      += l.valor_operacion ? Number(l.valor_operacion) : 0
  })

  // Build flat rows for the table (section header row + classification rows)
  type TableRow =
    | { kind: 'sec-header'; sec: string; st: RowTotals }
    | { kind: 'clasif'; sec: string; clasif: string; r: RowTotals }

  const tableRows: TableRow[] = []
  seccionesOrdenadas.forEach(sec => {
    const clasifsOrden = Object.keys(summary[sec]).sort()
    const st = clasifsOrden.reduce<RowTotals>(
      (a, cl) => {
        const r = summary[sec][cl]
        return { total: a.total + r.total, vendidos: a.vendidos + r.vendidos,
          libres: a.libres + r.libres, bloqueados: a.bloqueados + r.bloqueados,
          superficie: a.superficie + r.superficie, valor: a.valor + r.valor }
      },
      { total: 0, vendidos: 0, libres: 0, bloqueados: 0, superficie: 0, valor: 0 }
    )
    tableRows.push({ kind: 'sec-header', sec, st })
    clasifsOrden.forEach(clasif => {
      tableRows.push({ kind: 'clasif', sec, clasif, r: summary[sec][clasif] })
    })
  })

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 180 }} value={filterSec} onChange={e => setFilterSec(e.target.value)}>
            <option value="">Todas las secciones</option>
            {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <select className="select" style={{ minWidth: 180 }} value={filterClasif} onChange={e => setFilterClasif(e.target.value)}>
          <option value="">Todas las clasificaciones</option>
          {clasificaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {['Vendido', 'Libre', 'Bloqueado'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchLotes}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <PrintBar title="Lotes_Resumen_Seccion_Clasificacion" count={gt.total} reportTitle="Resumen Lotes por Sección y Clasificación" />

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total Lotes',     value: fmt(gt.total),      color: 'var(--blue)' },
          { label: 'Vendidos',        value: fmt(gt.vendidos),   color: '#15803d' },
          { label: 'Libres',          value: fmt(gt.libres),     color: '#1d4ed8' },
          { label: 'Bloqueados',      value: fmt(gt.bloqueados), color: '#dc2626' },
          { label: 'Superficie m²',   value: fmt(gt.superficie), color: 'var(--text-primary)' },
          { label: 'Valor Operación', value: fmtPeso(gt.valor),  color: '#0f766e' },
        ].map(k => (
          <div key={k.label} className="card"
            style={{ padding: '10px 16px', flex: '1 1 130px', maxWidth: 190, borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {queryError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px',
          marginBottom: 12, fontSize: 12, color: '#dc2626' }}>
          Error al cargar datos: {queryError}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : lotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Sin registros para los filtros seleccionados
        </div>
      ) : (
        <div id="reporte-print-area">
          <div className="card" style={{ overflow: 'hidden' }}>
            <table id="reporte-table">
              <thead>
                <tr>
                  <th>Sección / Clasificación</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Vendidos</th>
                  <th style={{ textAlign: 'right' }}>Libres</th>
                  <th style={{ textAlign: 'right' }}>Bloqueados</th>
                  <th style={{ textAlign: 'right' }}>Superficie m²</th>
                  <th style={{ textAlign: 'right' }}>Valor Operación</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, i) => {
                  if (row.kind === 'sec-header') {
                    const { sec, st } = row
                    return (
                      <tr key={`h-${sec}`} style={{ background: '#eff6ff' }}>
                        <td style={{ fontWeight: 700, color: 'var(--blue)', paddingLeft: 12 }}>
                          {sec}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{st.total}</td>
                        <td style={{ textAlign: 'right', color: '#15803d', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{st.vendidos > 0 ? st.vendidos : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#1d4ed8', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{st.libres > 0 ? st.libres : '—'}</td>
                        <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{st.bloqueados > 0 ? st.bloqueados : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(st.superficie)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#0f766e' }}>{fmtPeso(st.valor)}</td>
                      </tr>
                    )
                  }
                  // kind === 'clasif'
                  const { sec, clasif, r } = row
                  return (
                    <tr key={`c-${sec}-${clasif}`}>
                      <td style={{ paddingLeft: 28, color: 'var(--text-secondary)', fontSize: 13 }}>
                        {clasif}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.total}</td>
                      <td style={{ textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{r.vendidos > 0 ? r.vendidos : '—'}</td>
                      <td style={{ textAlign: 'right', color: '#1d4ed8', fontVariantNumeric: 'tabular-nums' }}>{r.libres > 0 ? r.libres : '—'}</td>
                      <td style={{ textAlign: 'right', color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{r.bloqueados > 0 ? r.bloqueados : '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{fmt(r.superficie)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#0f766e' }}>{fmtPeso(r.valor)}</td>
                    </tr>
                  )
                })}
                {/* Total general */}
                <tr style={{ background: '#1e3a5f', fontWeight: 700 }}>
                  <td style={{ color: '#fff', paddingLeft: 12 }}>Total general</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{gt.total}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#86efac' }}>{gt.vendidos > 0 ? gt.vendidos : '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#93c5fd' }}>{gt.libres > 0 ? gt.libres : '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#fca5a5' }}>{gt.bloqueados > 0 ? gt.bloqueados : '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{fmt(gt.superficie)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#6ee7b7' }}>{fmtPeso(gt.valor)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
