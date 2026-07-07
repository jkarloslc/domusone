'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, FileSpreadsheet, LayoutList, Grid3x3, PieChart } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtF = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}
const pct = (val: number, total: number) =>
  total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%'
const hoy = () => new Date().toISOString().slice(0, 10)

type Tab = 'resumen' | 'matriz' | 'detalle'
type EstadoCorte = '' | 'pendiente' | 'cortada'

export default function ReporteGolfCuadreFormasPago() {
  const [ventas,  setVentas]  = useState<any[]>([])
  const [pagos,   setPagos]   = useState<any[]>([])
  const [centros, setCentros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('matriz')

  // Filtros
  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<EstadoCorte>('')
  const [filtroDe,     setFiltroDe]     = useState(hoy())
  const [filtroA,      setFiltroA]      = useState(hoy())

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: centrosData } = await dbGolf
      .from('cat_centros_venta')
      .select('id, nombre')
      .order('orden')

    // Ventas PAGADA de todos los centros — SIN condición de corte
    // (el objetivo es cuadrar formas de pago contra TPV/caja antes de cortar)
    let q = dbGolf.from('ctrl_ventas')
      .select('id, folio_dia, fecha, nombre_cliente, total, id_centro_fk, id_corte_fk, usuario_crea')
      .eq('status', 'PAGADA')
      .order('fecha', { ascending: false })

    if (filtroCentro) q = (q as any).eq('id_centro_fk', Number(filtroCentro))
    if (filtroEstado === 'pendiente') q = (q as any).is('id_corte_fk', null)
    if (filtroEstado === 'cortada')   q = (q as any).not('id_corte_fk', 'is', null)
    if (filtroDe) q = (q as any).gte('fecha', filtroDe + 'T00:00:00')
    if (filtroA)  q = (q as any).lte('fecha', filtroA  + 'T23:59:59')

    const { data: ventasData } = await q
    const ids = (ventasData ?? []).map((v: any) => v.id)

    let pagosData: any[] = []
    if (ids.length > 0) {
      const { data: p } = await dbGolf.from('ctrl_ventas_pagos')
        .select('id, id_venta_fk, forma_nombre, monto')
        .in('id_venta_fk', ids)
      pagosData = p ?? []
    }

    setCentros(centrosData ?? [])
    setVentas(ventasData ?? [])
    setPagos(pagosData)
    setLoading(false)
  }, [filtroCentro, filtroEstado, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  // Maps
  const centroMap = useMemo(() =>
    Object.fromEntries(centros.map(c => [c.id, c.nombre])), [centros])

  const ventaMap = useMemo(() =>
    Object.fromEntries(ventas.map(v => [v.id, v])), [ventas])

  // Pagos enriquecidos con datos de la venta (centro, fecha, folio, estado de corte)
  const enrichedPagos = useMemo(() => pagos
    .filter(p => ventaMap[p.id_venta_fk]) // solo pagos de ventas dentro del filtro actual
    .map(p => {
      const v = ventaMap[p.id_venta_fk]
      return {
        ...p,
        fecha:          v?.fecha ?? null,
        nombre_cliente: v?.nombre_cliente ?? '—',
        folio:          v?.id ?? p.id_venta_fk,
        id_centro_fk:   v?.id_centro_fk ?? null,
        centro_nombre:  centroMap[v?.id_centro_fk] ?? 'Sin centro',
        cortada:        v?.id_corte_fk != null,
      }
    })
    .sort((a, b) => (a.folio ?? 0) - (b.folio ?? 0)),
  [pagos, ventaMap, centroMap])

  // ── Agrupado por forma de pago ───────────────────────────
  const porFormaPago = useMemo(() => {
    const map = new Map<string, { nombre: string; transacciones: number; monto: number }>()
    enrichedPagos.forEach(p => {
      const key = p.forma_nombre ?? 'Sin especificar'
      const cur = map.get(key) ?? { nombre: key, transacciones: 0, monto: 0 }
      map.set(key, { nombre: key, transacciones: cur.transacciones + 1, monto: cur.monto + (p.monto ?? 0) })
    })
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto)
  }, [enrichedPagos])

  // ── Agrupado por centro de venta ─────────────────────────
  const porCentro = useMemo(() => {
    const map = new Map<string, { nombre: string; transacciones: number; monto: number }>()
    enrichedPagos.forEach(p => {
      const key = p.centro_nombre
      const cur = map.get(key) ?? { nombre: key, transacciones: 0, monto: 0 }
      map.set(key, { nombre: key, transacciones: cur.transacciones + 1, monto: cur.monto + (p.monto ?? 0) })
    })
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto)
  }, [enrichedPagos])

  // ── Matriz Centro de Venta × Forma de Pago ───────────────
  const matriz = useMemo(() => {
    const colMap = new Map<string, string>()
    enrichedPagos.forEach(p => {
      const key = p.forma_nombre ?? 'Sin especificar'
      if (!colMap.has(key)) colMap.set(key, key)
    })
    const columnas = Array.from(colMap.keys()).sort((a, b) => a.localeCompare(b, 'es'))

    const filasMap = new Map<string, { nombre: string; celdas: Record<string, number>; total: number }>()
    enrichedPagos.forEach(p => {
      const key = p.centro_nombre
      const fila = filasMap.get(key) ?? { nombre: key, celdas: {} as Record<string, number>, total: 0 }
      const col = p.forma_nombre ?? 'Sin especificar'
      fila.celdas[col] = (fila.celdas[col] ?? 0) + (p.monto ?? 0)
      fila.total += (p.monto ?? 0)
      filasMap.set(key, fila)
    })
    const filas = Array.from(filasMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    const totalesCol: Record<string, number> = {}
    columnas.forEach(c => { totalesCol[c] = filas.reduce((s, f) => s + (f.celdas[c] ?? 0), 0) })
    const totalGeneral = filas.reduce((s, f) => s + f.total, 0)

    return { columnas, filas, totalesCol, totalGeneral }
  }, [enrichedPagos])

  // ── KPIs ─────────────────────────────────────────────────
  const numVentas      = ventas.length
  const totalPagado    = useMemo(() => enrichedPagos.reduce((s, p) => s + (p.monto ?? 0), 0), [enrichedPagos])
  const totalPendiente = useMemo(() => ventas.filter(v => v.id_corte_fk == null).reduce((s, v) => s + (v.total ?? 0), 0), [ventas])
  const totalCortado   = useMemo(() => ventas.filter(v => v.id_corte_fk != null).reduce((s, v) => s + (v.total ?? 0), 0), [ventas])
  const numPendientes  = useMemo(() => ventas.filter(v => v.id_corte_fk == null).length, [ventas])

  // ── Export Excel ─────────────────────────────────────────
  const exportXLSX = () => {
    const wsFP = XLSX.utils.json_to_sheet(porFormaPago.map(f => ({
      'Forma de Pago': f.nombre,
      'Transacciones': f.transacciones,
      'Monto':         f.monto,
      '% del Total':   pct(f.monto, totalPagado),
    })))
    wsFP['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 12 }]

    const wsCentro = XLSX.utils.json_to_sheet(porCentro.map(c => ({
      'Centro de Venta': c.nombre,
      'Transacciones':   c.transacciones,
      'Monto':           c.monto,
      '% del Total':     pct(c.monto, totalPagado),
    })))
    wsCentro['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 12 }]

    const header: any[] = ['Centro de Venta', ...matriz.columnas, 'TOTAL CENTRO']
    const matRows: any[][] = [header]
    matriz.filas.forEach(f => {
      const row: any[] = [f.nombre]
      matriz.columnas.forEach(c => row.push(f.celdas[c] ?? 0))
      row.push(f.total)
      matRows.push(row)
    })
    const totalRow: any[] = ['TOTAL FORMA']
    matriz.columnas.forEach(c => totalRow.push(matriz.totalesCol[c] ?? 0))
    totalRow.push(matriz.totalGeneral)
    matRows.push(totalRow)
    const wsMatriz = XLSX.utils.aoa_to_sheet(matRows)
    wsMatriz['!cols'] = [{ wch: 24 }, ...matriz.columnas.map(() => ({ wch: 14 })), { wch: 14 }]

    const wsDetalle = XLSX.utils.json_to_sheet(enrichedPagos.map(p => ({
      'Fecha':          p.fecha ? new Date(p.fecha).toLocaleDateString('es-MX') : '',
      'Centro':         p.centro_nombre,
      'Folio':          p.folio,
      'Cliente':        p.nombre_cliente,
      'Forma de Pago':  p.forma_nombre ?? 'Sin especificar',
      'Monto':          p.monto,
      'Estado':         p.cortada ? 'Cortada' : 'Pendiente',
    })))
    wsDetalle['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 28 },
      { wch: 20 }, { wch: 14 }, { wch: 12 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsFP,      'Formas de Pago')
    XLSX.utils.book_append_sheet(wb, wsCentro,  'Por Centro')
    XLSX.utils.book_append_sheet(wb, wsMatriz,  'Matriz Centro x Forma')
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle')
    XLSX.writeFile(wb, `Golf-Cuadre-Formas-Pago_${hoy()}.xlsx`)
  }

  const selStyle: React.CSSProperties = {
    height: 32, padding: '0 10px', border: '1px solid #e2e8f0',
    borderRadius: 6, fontSize: 13, background: '#fff',
    fontFamily: 'var(--font-body)', color: 'var(--text-primary)',
  }
  const inputStyle: React.CSSProperties = { ...selStyle, width: 130 }

  const GOLD = '#b8952a'
  const GOLD_PALE = '#fefce8'
  const GOLD_BORDER = '#fde68a'
  const GOLD_DARK = '#92400e'

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'resumen', label: 'Resumen',                     icon: <PieChart  size={13} /> },
    { key: 'matriz',  label: 'Matriz Centro × Forma de Pago', icon: <Grid3x3  size={13} /> },
    { key: 'detalle', label: 'Detalle',                      icon: <LayoutList size={13} /> },
  ]

  // ── Sub-tabla reutilizable para el resumen ───────────────
  const SummaryTable = ({
    title, headers, rows, footer, accentColor = GOLD,
  }: {
    title: string
    headers: string[]
    rows: React.ReactNode[][]
    footer: React.ReactNode[]
    accentColor?: string
  }) => (
    <div style={{ flex: '1 1 320px', minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accentColor,
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        {title}
      </div>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {headers.map((h, i) => (
                <th key={h} style={{ padding: '8px 12px',
                  textAlign: i === 0 ? 'left' : 'right',
                  fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9', background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '8px 12px', textAlign: ci === 0 ? 'left' : 'right',
                    fontVariantNumeric: 'tabular-nums' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: GOLD_PALE, borderTop: `2px solid ${GOLD_BORDER}` }}>
              {footer.map((cell, ci) => (
                <td key={ci} style={{ padding: '8px 12px', textAlign: ci === 0 ? 'left' : 'right',
                  fontWeight: 700, color: GOLD_DARK, fontVariantNumeric: 'tabular-nums' }}>
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Centro de Venta</div>
          <select style={{ ...selStyle, width: 200 }} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}>
            <option value="">Todos</option>
            {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Estado de Corte</div>
          <select style={{ ...selStyle, width: 160 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as EstadoCorte)}>
            <option value="">Todas</option>
            <option value="pendiente">Pendientes de cortar</option>
            <option value="cortada">Ya cortadas</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha de</div>
          <input type="date" style={inputStyle} value={filtroDe} onChange={e => setFiltroDe(e.target.value)} />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha a</div>
          <input type="date" style={inputStyle} value={filtroA} onChange={e => setFiltroA(e.target.value)} />
        </div>

        <button className="btn-ghost" onClick={fetchData} title="Refrescar"
          style={{ height: 32, alignSelf: 'flex-end' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Cobrado',        value: fmt(totalPagado),    color: GOLD,          bg: GOLD_PALE },
          { label: 'Ventas',               value: numVentas.toString(), color: '#7c3aed',    bg: '#f5f3ff' },
          { label: 'Pendiente de Corte',   value: fmt(totalPendiente), color: '#d97706',     bg: '#fffbeb' },
          { label: `Ya Cortado`,           value: fmt(totalCortado),   color: '#15803d',     bg: '#f0fdf4' },
          { label: '# Ventas Pendientes',  value: numPendientes.toString(), color: '#d97706', bg: '#fffbeb' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', background: k.bg, flex: '1 1 150px', maxWidth: 220 }}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
              color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 16, gap: 2 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-body)', fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? GOLD : 'var(--text-muted)',
              borderBottom: tab === t.key ? `2px solid ${GOLD}` : '2px solid transparent', marginBottom: -1 }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="card" style={{ overflow: 'hidden' }} id="reporte-print-area">
        <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <PrintBar
            title="Golf-Cuadre-Formas-Pago"
            count={tab === 'resumen' ? numVentas : tab === 'matriz' ? matriz.filas.length : enrichedPagos.length}
            reportTitle="Cuadre de Formas de Pago (Pre-Corte) — Golf POS"
          />
          <button className="btn-secondary" onClick={exportXLSX} style={{ fontSize: 12 }}>
            <FileSpreadsheet size={13} /> Exportar Excel
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
        ) : enrichedPagos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>Sin registros con los filtros seleccionados</div>
        ) : tab === 'resumen' ? (

          /* ── RESUMEN ──────────────────────────────────────── */
          <div style={{ padding: '4px 18px 20px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>

            <SummaryTable
              title="Formas de Pago"
              headers={['Forma de Pago', 'Transacciones', 'Monto', '%']}
              rows={porFormaPago.map(f => [
                <span key="n" style={{ fontWeight: 500 }}>{f.nombre}</span>,
                <span key="t" style={{ color: 'var(--text-secondary)' }}>{f.transacciones}</span>,
                <span key="m" style={{ fontWeight: 600, color: GOLD }}>{fmt(f.monto)}</span>,
                <span key="p" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pct(f.monto, totalPagado)}</span>,
              ])}
              footer={[
                `Total (${porFormaPago.length} formas)`,
                enrichedPagos.length,
                fmt(totalPagado),
                '100%',
              ]}
            />

            <SummaryTable
              title="Centros de Venta"
              headers={['Centro de Venta', 'Transacciones', 'Monto', '%']}
              rows={porCentro.map(c => [
                <span key="n" style={{ fontWeight: 500 }}>{c.nombre}</span>,
                <span key="t" style={{ color: 'var(--text-secondary)' }}>{c.transacciones}</span>,
                <span key="m" style={{ fontWeight: 600, color: GOLD }}>{fmt(c.monto)}</span>,
                <span key="p" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pct(c.monto, totalPagado)}</span>,
              ])}
              footer={[
                `Total (${porCentro.length} centros)`,
                enrichedPagos.length,
                fmt(totalPagado),
                '100%',
              ]}
            />
          </div>

        ) : tab === 'matriz' ? (

          /* ── MATRIZ CENTRO × FORMA DE PAGO ───────────────── */
          <div style={{ overflow: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left', position: 'sticky', left: 0,
                    background: '#f1f5f9', zIndex: 2, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>Centro de Venta</th>
                  {matriz.columnas.map(c => (
                    <th key={c} style={{ padding: '9px 14px', textAlign: 'right', minWidth: 130, color: '#7c3aed',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{c}</th>
                  ))}
                  <th style={{ padding: '9px 14px', textAlign: 'right', background: GOLD_PALE, color: GOLD_DARK,
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Total Centro</th>
                </tr>
              </thead>
              <tbody>
                {matriz.filas.map((f, i) => (
                  <tr key={f.nombre} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: GOLD, position: 'sticky', left: 0,
                      background: i % 2 === 0 ? '#fff' : '#fafafa', zIndex: 1 }}>{f.nombre}</td>
                    {matriz.columnas.map(c => {
                      const v = f.celdas[c] ?? 0
                      return (
                        <td key={c} style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: v > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {v > 0 ? fmt(v) : '—'}
                        </td>
                      )
                    })}
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: GOLD,
                      fontVariantNumeric: 'tabular-nums', background: GOLD_PALE }}>{fmt(f.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: GOLD_PALE, borderTop: `2px solid ${GOLD_BORDER}` }}>
                  <td style={{ padding: '9px 14px', fontWeight: 700, color: GOLD_DARK, position: 'sticky', left: 0,
                    background: GOLD_PALE, zIndex: 1 }}>Total Forma</td>
                  {matriz.columnas.map(c => (
                    <td key={c} style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#7c3aed',
                      fontVariantNumeric: 'tabular-nums' }}>{fmt(matriz.totalesCol[c] ?? 0)}</td>
                  ))}
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: GOLD,
                    fontVariantNumeric: 'tabular-nums' }}>{fmt(matriz.totalGeneral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

        ) : (

          /* ── DETALLE ──────────────────────────────────────── */
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Fecha', 'Centro', 'Folio', 'Cliente', 'Forma de Pago', 'Monto', 'Estado'].map(h => (
                    <th key={h} style={{ padding: '9px 12px',
                      textAlign: h === 'Monto' ? 'right' : h === 'Estado' ? 'center' : 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enrichedPagos.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtF(p.fecha)}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>{p.centro_nombre}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>#{String(p.folio).padStart(5, '0')}</td>
                    <td style={{ padding: '8px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.nombre_cliente}>{p.nombre_cliente}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{p.forma_nombre ?? 'Sin especificar'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(p.monto ?? 0)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: p.cortada ? '#f0fdf4' : '#fffbeb', color: p.cortada ? '#15803d' : '#d97706' }}>
                        {p.cortada ? 'Cortada' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: GOLD_PALE, borderTop: `2px solid ${GOLD_BORDER}` }}>
                  <td colSpan={5} style={{ padding: '9px 12px', fontWeight: 700, color: GOLD_DARK }}>
                    Total ({enrichedPagos.length} pagos · {numVentas} ventas)
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalPagado)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
