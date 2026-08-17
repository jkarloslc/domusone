'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, FileSpreadsheet, LayoutList, BarChart2, PieChart } from 'lucide-react'
import * as XLSX from 'xlsx'
import ModalShell from '@/components/ui/ModalShell'

const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtF = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}
const pct = (val: number, total: number) =>
  total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%'

type Tab = 'resumen' | 'articulos' | 'detalle'

export default function ReporteGolfVentasHistoricas() {
  const [ventas,  setVentas]  = useState<any[]>([])
  const [dets,    setDets]    = useState<any[]>([])
  const [pagos,   setPagos]   = useState<any[]>([])
  const [cfdis,   setCfdis]   = useState<any[]>([])
  const [centros, setCentros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('resumen')

  // Filtros
  const [filtroCentro,   setFiltroCentro]   = useState('')
  const [filtroArticulo, setFiltroArticulo] = useState('')
  const [filtroDe,       setFiltroDe]       = useState('')
  const [filtroA,        setFiltroA]        = useState('')

  // Drill-down: facturas de una forma de pago
  const [drillForma, setDrillForma] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: centrosData } = await dbGolf
      .from('cat_centros_venta')
      .select('id, nombre')
      .order('orden')

    // Ventas cortadas PAGADA
    let q = dbGolf.from('ctrl_ventas')
      .select('id, folio_dia, fecha, nombre_cliente, total, subtotal, iva, id_centro_fk, usuario_crea, folio_fiscal, facturada, pac_cfdi_id')
      .not('id_corte_fk', 'is', null)
      .eq('status', 'PAGADA')
      .order('fecha', { ascending: false })

    if (filtroCentro) q = (q as any).eq('id_centro_fk', Number(filtroCentro))
    if (filtroDe)     q = (q as any).gte('fecha', filtroDe + 'T00:00:00')
    if (filtroA)      q = (q as any).lte('fecha', filtroA  + 'T23:59:59')

    const { data: ventasData } = await q
    const ids = (ventasData ?? []).map((v: any) => v.id)

    let detsData: any[] = []
    let pagosData: any[] = []
    let cfdisData: any[] = []

    if (ids.length > 0) {
      const [{ data: d }, { data: p }, { data: c }] = await Promise.all([
        dbGolf.from('ctrl_ventas_det')
          .select('id, id_venta_fk, id_producto_fk, concepto, cantidad, precio_unitario, iva, subtotal, total')
          .in('id_venta_fk', ids),
        dbGolf.from('ctrl_ventas_pagos')
          .select('id, id_venta_fk, forma_nombre, monto')
          .in('id_venta_fk', ids),
        // ctrl_ventas_cfdi puede tener varias filas por venta (historial de cancelaciones/re-timbrados);
        // se ordena por fecha_timbrado asc para que la última asignación al map sea la más reciente.
        dbGolf.from('ctrl_ventas_cfdi')
          .select('id, id_venta_fk, folio_factura, receptor_rfc, receptor_email, status, fecha_timbrado')
          .in('id_venta_fk', ids)
          .order('fecha_timbrado', { ascending: true }),
      ])
      detsData  = d  ?? []
      pagosData = p  ?? []
      cfdisData = c  ?? []
    }

    setCentros(centrosData ?? [])
    setVentas(ventasData ?? [])
    setCfdis(cfdisData)
    setDets(detsData)
    setPagos(pagosData)
    setLoading(false)
  }, [filtroCentro, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  // Maps
  const centroMap = useMemo(() =>
    Object.fromEntries(centros.map(c => [c.id, c.nombre])), [centros])

  const ventaMap = useMemo(() =>
    Object.fromEntries(ventas.map(v => [v.id, v])), [ventas])

  // Última factura (CFDI) por venta — si hay historial de re-timbrados, se queda con la más reciente
  const cfdiMap = useMemo(() => {
    const map: Record<number, any> = {}
    for (const c of cfdis) map[c.id_venta_fk] = c
    return map
  }, [cfdis])

  // Dets enriquecidos
  const enrichedDets = useMemo(() => dets.map(d => ({
    ...d,
    fecha:          ventaMap[d.id_venta_fk]?.fecha          ?? null,
    nombre_cliente: ventaMap[d.id_venta_fk]?.nombre_cliente ?? '—',
    folio:          ventaMap[d.id_venta_fk]?.id             ?? d.id_venta_fk,
    id_centro_fk:   ventaMap[d.id_venta_fk]?.id_centro_fk   ?? null,
    centro_nombre:  centroMap[ventaMap[d.id_venta_fk]?.id_centro_fk] ?? '—',
  })), [dets, ventaMap, centroMap])

  // Artículos únicos para el filtro
  const articulosUnicos = useMemo(() => {
    const map = new Map<number, string>()
    dets.forEach(d => { if (d.id_producto_fk) map.set(d.id_producto_fk, d.concepto) })
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [dets])

  // Filtrado de líneas por artículo, ordenado por folio consecutivo
  const filtered = useMemo(() => {
    const base = filtroArticulo
      ? enrichedDets.filter(d => String(d.id_producto_fk) === filtroArticulo)
      : enrichedDets
    return [...base].sort((a, b) => (a.folio ?? 0) - (b.folio ?? 0))
  }, [enrichedDets, filtroArticulo])

  // IDs de ventas activas (según filtro artículo)
  const filteredVentaIds = useMemo(() =>
    new Set(filtered.map(d => d.id_venta_fk)), [filtered])

  // Pagos de las ventas activas
  const filteredPagos = useMemo(() =>
    pagos.filter(p => filteredVentaIds.has(p.id_venta_fk)),
  [pagos, filteredVentaIds])

  // ── Agrupado por artículo ────────────────────────────────
  const porArticulo = useMemo(() => {
    const map = new Map<string, { nombre: string; cantidad: number; subtotal: number; iva: number; total: number }>()
    filtered.forEach(d => {
      const key = d.concepto ?? '—'
      const cur = map.get(key) ?? { nombre: key, cantidad: 0, subtotal: 0, iva: 0, total: 0 }
      map.set(key, {
        nombre:   key,
        cantidad: cur.cantidad + (d.cantidad ?? 0),
        subtotal: cur.subtotal + (d.subtotal ?? 0),
        iva:      cur.iva      + (d.iva      ?? 0),
        total:    cur.total    + (d.total    ?? 0),
      })
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [filtered])

  // ── Agrupado por forma de pago ───────────────────────────
  const porFormaPago = useMemo(() => {
    const map = new Map<string, { nombre: string; transacciones: number; monto: number }>()
    filteredPagos.forEach(p => {
      const key = p.forma_nombre ?? 'Sin especificar'
      const cur = map.get(key) ?? { nombre: key, transacciones: 0, monto: 0 }
      map.set(key, { nombre: key, transacciones: cur.transacciones + 1, monto: cur.monto + (p.monto ?? 0) })
    })
    return Array.from(map.values()).sort((a, b) => b.monto - a.monto)
  }, [filteredPagos])

  // ── Drill-down: facturas que componen el monto de una forma de pago ──
  const drillRows = useMemo(() => {
    if (!drillForma) return []
    return filteredPagos
      .filter(p => (p.forma_nombre ?? 'Sin especificar') === drillForma)
      .map(p => {
        const v    = ventaMap[p.id_venta_fk]
        const cfdi = cfdiMap[p.id_venta_fk]
        return {
          idPago:         p.id,
          idVenta:        p.id_venta_fk,
          fecha:          v?.fecha ?? null,
          folioVenta:     v?.id ?? p.id_venta_fk,
          folioFactura:   cfdi?.folio_factura ?? null,
          uuidFiscal:     v?.folio_fiscal ?? null,
          receptorRfc:    cfdi?.receptor_rfc ?? null,
          receptorEmail:  cfdi?.receptor_email ?? null,
          cfdiStatus:     cfdi?.status ?? null,
          facturada:      !!v?.folio_fiscal,
          nombre_cliente: v?.nombre_cliente ?? '—',
          centro_nombre:  centroMap[v?.id_centro_fk] ?? '—',
          monto:          p.monto ?? 0,
          total_venta:    v?.total ?? null,
        }
      })
      .sort((a, b) => new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime())
  }, [drillForma, filteredPagos, ventaMap, cfdiMap, centroMap])

  const drillTotal = useMemo(() => drillRows.reduce((s, r) => s + (r.monto ?? 0), 0), [drillRows])

  // ── KPIs ─────────────────────────────────────────────────
  const totalVentas   = useMemo(() => filtered.reduce((s, d) => s + (d.total ?? 0), 0), [filtered])
  const totalCantidad = useMemo(() => filtered.reduce((s, d) => s + (d.cantidad ?? 0), 0), [filtered])
  const numTickets    = useMemo(() => filteredVentaIds.size, [filteredVentaIds])
  const totalPagado   = useMemo(() => filteredPagos.reduce((s, p) => s + (p.monto ?? 0), 0), [filteredPagos])
  const ticketPromedio = numTickets > 0 ? totalPagado / numTickets : 0

  // ── Export Excel ─────────────────────────────────────────
  const exportXLSX = () => {
    const wsFP = XLSX.utils.json_to_sheet(porFormaPago.map(f => ({
      'Forma de Pago':   f.nombre,
      'Transacciones':   f.transacciones,
      'Monto':           f.monto,
      '% del Total':     pct(f.monto, totalPagado),
    })))
    wsFP['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 12 }]

    const wsArt = XLSX.utils.json_to_sheet(porArticulo.map(a => ({
      'Artículo / Servicio': a.nombre,
      'Cantidad':            a.cantidad,
      'Subtotal':            a.subtotal,
      'IVA':                 a.iva,
      'Total':               a.total,
      '% del Total':         pct(a.total, totalVentas),
    })))
    wsArt['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }]

    const wsDetalle = XLSX.utils.json_to_sheet(filtered.map(d => ({
      'Fecha':      d.fecha ? new Date(d.fecha).toLocaleDateString('es-MX') : '',
      'Centro':     d.centro_nombre,
      'Folio':      d.folio,
      'Cliente':    d.nombre_cliente,
      'Artículo':   d.concepto,
      'Cantidad':   d.cantidad,
      'P. Unit.':   d.precio_unitario,
      'IVA':        d.iva,
      'Total':      d.total,
    })))
    wsDetalle['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 28 },
      { wch: 32 }, { wch: 9 }, { wch: 11 }, { wch: 11 }, { wch: 12 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsFP,      'Formas de Pago')
    XLSX.utils.book_append_sheet(wb, wsArt,     'Por Artículo')
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle')
    XLSX.writeFile(wb, `Golf-Ventas-Historicas_${new Date().toISOString().slice(0,10)}.xlsx`)
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
    { key: 'resumen',   label: 'Resumen',        icon: <PieChart   size={13} /> },
    { key: 'articulos', label: 'Por Artículo',   icon: <BarChart2  size={13} /> },
    { key: 'detalle',   label: 'Detalle líneas', icon: <LayoutList size={13} /> },
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
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Artículo / Servicio</div>
          <select style={{ ...selStyle, width: 240 }} value={filtroArticulo} onChange={e => setFiltroArticulo(e.target.value)}>
            <option value="">Todos</option>
            {articulosUnicos.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
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
          { label: 'Total Ventas',      value: fmt(totalVentas),   color: GOLD,         bg: GOLD_PALE },
          { label: 'Unidades Vendidas', value: totalCantidad.toLocaleString('es-MX'), color: 'var(--blue)', bg: 'var(--blue-pale)' },
          { label: 'Tickets',           value: numTickets.toString(), color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Ticket Promedio',   value: fmt(ticketPromedio), color: '#0f766e',   bg: '#f0fdfa' },
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
            title="Golf-Ventas-Historicas"
            count={tab === 'resumen' ? numTickets : tab === 'articulos' ? porArticulo.length : filtered.length}
            reportTitle="Ventas Históricas POS — Golf"
          />
          <button className="btn-secondary" onClick={exportXLSX} style={{ fontSize: 12 }}>
            <FileSpreadsheet size={13} /> Exportar Excel
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>Sin registros con los filtros seleccionados</div>
        ) : tab === 'resumen' ? (

          /* ── RESUMEN ──────────────────────────────────────── */
          <div style={{ padding: '4px 18px 20px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>

            {/* Formas de pago */}
            <SummaryTable
              title="Formas de Pago"
              headers={['Forma de Pago', 'Transacciones', 'Monto', '%']}
              rows={porFormaPago.map(f => [
                <span key="n" style={{ fontWeight: 500 }}>{f.nombre}</span>,
                <span key="t" style={{ color: 'var(--text-secondary)' }}>{f.transacciones}</span>,
                <button key="m" onClick={() => setDrillForma(f.nombre)}
                  title="Ver facturas que componen este monto"
                  style={{
                    fontWeight: 600, color: GOLD, background: 'none', border: 'none', padding: 0,
                    font: 'inherit', fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                    textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
                  }}>
                  {fmt(f.monto)}
                </button>,
                <span key="p" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pct(f.monto, totalPagado)}</span>,
              ])}
              footer={[
                `Total (${porFormaPago.length} formas)`,
                filteredPagos.length,
                fmt(totalPagado),
                '100%',
              ]}
            />

            {/* Productos / Servicios */}
            <SummaryTable
              title="Productos y Servicios"
              headers={['Artículo / Servicio', 'Cant.', 'Total', '%']}
              rows={porArticulo.map(a => [
                <span key="n" style={{ fontWeight: 500 }}>{a.nombre}</span>,
                <span key="c" style={{ color: 'var(--text-secondary)' }}>{a.cantidad.toLocaleString('es-MX')}</span>,
                <span key="t" style={{ fontWeight: 600, color: GOLD }}>{fmt(a.total)}</span>,
                <span key="p" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pct(a.total, totalVentas)}</span>,
              ])}
              footer={[
                `Total (${porArticulo.length} artículos)`,
                totalCantidad.toLocaleString('es-MX'),
                fmt(totalVentas),
                '100%',
              ]}
            />
          </div>

        ) : tab === 'articulos' ? (

          /* ── POR ARTÍCULO ─────────────────────────────────── */
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Artículo / Servicio', 'Cantidad', 'Subtotal', 'IVA', 'Total', '%'].map((h, i) => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: i === 0 ? 'left' : 'right',
                      fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porArticulo.map((a, i) => (
                  <tr key={a.nombre} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 500 }}>{a.nombre}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{a.cantidad.toLocaleString('es-MX')}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{fmt(a.subtotal)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontSize: 12 }}>{fmt(a.iva)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(a.total)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{pct(a.total, totalVentas)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: GOLD_PALE, borderTop: `2px solid ${GOLD_BORDER}` }}>
                  <td style={{ padding: '9px 14px', fontWeight: 700, color: GOLD_DARK }}>Total ({porArticulo.length} artículos)</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: GOLD_DARK, fontVariantNumeric: 'tabular-nums' }}>{totalCantidad.toLocaleString('es-MX')}</td>
                  <td colSpan={2} />
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalVentas)}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: GOLD_DARK }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>

        ) : (

          /* ── DETALLE LÍNEAS ───────────────────────────────── */
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Fecha', 'Centro', 'Folio', 'Cliente', 'Artículo / Servicio', 'Cant.', 'P. Unit.', 'Total'].map(h => (
                    <th key={h} style={{ padding: '9px 12px',
                      textAlign: ['Cant.', 'P. Unit.', 'Total'].includes(h) ? 'right' : 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtF(d.fecha)}</td>
                    <td style={{ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>{d.centro_nombre}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>#{String(d.folio).padStart(5, '0')}</td>
                    <td style={{ padding: '8px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.nombre_cliente}>{d.nombre_cliente}</td>
                    <td style={{ padding: '8px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={d.concepto}>{d.concepto}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.cantidad}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontSize: 12 }}>{fmt(d.precio_unitario ?? 0)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.total ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: GOLD_PALE, borderTop: `2px solid ${GOLD_BORDER}` }}>
                  <td colSpan={7} style={{ padding: '9px 12px', fontWeight: 700, color: GOLD_DARK }}>
                    Total ({filtered.length} líneas · {numTickets} tickets)
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalVentas)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal drill-down: facturas por forma de pago ── */}
      {drillForma && (
        <ModalShell modulo="golf-pos" titulo={`Facturas — ${drillForma}`}
          subtitulo={`${drillRows.length} factura${drillRows.length !== 1 ? 's' : ''} · ${fmt(drillTotal)}`}
          onClose={() => setDrillForma(null)} maxWidth={760}>
          {drillRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
              Sin facturas para esta forma de pago
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    {['Fecha', 'Folio Factura', 'UUID Fiscal', 'Cliente / Receptor', 'Centro', 'Monto'].map((h, i) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: i === 5 ? 'right' : 'left',
                        fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                        textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {drillRows.map((r, i) => (
                    <tr key={r.idPago} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 12 }}>{fmtF(r.fecha)}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {r.facturada ? (
                          <>
                            <div style={{ fontWeight: 700, fontFamily: 'monospace', color: '#2563eb' }}>{r.folioFactura ?? '—'}</div>
                            {r.cfdiStatus === 'Cancelada' && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: '#fef2f2', color: '#dc2626' }}>Cancelada</span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin facturar</span>
                        )}
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>Ticket #{String(r.folioVenta).padStart(6, '0')}</div>
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                        <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#7c3aed', wordBreak: 'break-all' }}>{r.uuidFiscal ?? '—'}</div>
                      </td>
                      <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombre_cliente}>{r.nombre_cliente}</div>
                        {r.receptorRfc && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.receptorRfc}</div>}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>{r.centro_nombre}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: GOLD_PALE, borderTop: `2px solid ${GOLD_BORDER}` }}>
                    <td colSpan={5} style={{ padding: '8px 12px', fontWeight: 700, color: GOLD_DARK }}>
                      Total ({drillRows.length} factura{drillRows.length !== 1 ? 's' : ''})
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{fmt(drillTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  )
}
