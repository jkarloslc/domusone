'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, FileSpreadsheet, LayoutList, Grid3x3, Package } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtF = (s: string | null) => s
  ? new Date(s).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'
const pct = (val: number, total: number) => total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%'
const hoy = () => new Date().toISOString().slice(0, 10)
const inicioMes = () => hoy().slice(0, 8) + '01'

type Tab = 'resumen' | 'operaciones' | 'productos'
type EstadoCorte = '' | 'pendiente' | 'cortada'

// PostgREST limita filas por request y la URL de .in() — se consulta por lotes y páginas
async function fetchPorVentas(tabla: string, cols: string, ids: number[]): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const lote = ids.slice(i, i + 150)
    const { data, error } = await dbGolf.from(tabla).select(cols).in('id_venta_fk', lote)
    if (error) console.error(`[ReporteVentasPOS] ${tabla}:`, error.message)
    out.push(...(data ?? []))
  }
  return out
}

export default function ReporteVentasPOS() {
  const [ventas,  setVentas]  = useState<any[]>([])
  const [dets,    setDets]    = useState<any[]>([])
  const [pagos,   setPagos]   = useState<any[]>([])
  const [centros, setCentros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [tab,     setTab]     = useState<Tab>('resumen')

  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<EstadoCorte>('')
  const [filtroDe,     setFiltroDe]     = useState(inicioMes())
  const [filtroA,      setFiltroA]      = useState(hoy())
  const [busqueda,     setBusqueda]     = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')

    const { data: centrosData } = await dbGolf.from('cat_centros_venta').select('id, nombre').order('orden')

    // Ventas PAGADA paginadas de 1000 en 1000
    const ventasAcc: any[] = []
    for (let from = 0; ; from += 1000) {
      let q = dbGolf.from('ctrl_ventas')
        .select('id, folio_dia, fecha, nombre_cliente, subtotal, iva, total, id_centro_fk, id_corte_fk, usuario_crea, facturada')
        .eq('status', 'PAGADA')
        .order('fecha', { ascending: false })
        .range(from, from + 999)
      if (filtroCentro) q = (q as any).eq('id_centro_fk', Number(filtroCentro))
      if (filtroEstado === 'pendiente') q = (q as any).is('id_corte_fk', null)
      if (filtroEstado === 'cortada')   q = (q as any).not('id_corte_fk', 'is', null)
      if (filtroDe) q = (q as any).gte('fecha', filtroDe + 'T00:00:00')
      if (filtroA)  q = (q as any).lte('fecha', filtroA  + 'T23:59:59')
      const { data, error: err } = await q
      if (err) { setError(err.message); break }
      ventasAcc.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }

    const ids = ventasAcc.map(v => v.id)
    const [detsData, pagosData] = ids.length
      ? await Promise.all([
          fetchPorVentas('ctrl_ventas_det', 'id, id_venta_fk, id_producto_fk, concepto, cantidad, precio_unitario, iva, subtotal, total', ids),
          fetchPorVentas('ctrl_ventas_pagos', 'id, id_venta_fk, forma_nombre, monto', ids),
        ])
      : [[], []]

    setCentros(centrosData ?? [])
    setVentas(ventasAcc)
    setDets(detsData)
    setPagos(pagosData)
    setLoading(false)
  }, [filtroCentro, filtroEstado, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const centroMap = useMemo(() => Object.fromEntries(centros.map(c => [c.id, c.nombre])), [centros])
  const nombreCentro = useCallback((id: number | null) => (id != null && centroMap[id]) || 'Sin centro', [centroMap])

  // Formas de pago por venta
  const pagosPorVenta = useMemo(() => {
    const m = new Map<number, { forma: string; monto: number }[]>()
    pagos.forEach(p => {
      const arr = m.get(p.id_venta_fk) ?? []
      arr.push({ forma: p.forma_nombre ?? 'Sin especificar', monto: p.monto ?? 0 })
      m.set(p.id_venta_fk, arr)
    })
    return m
  }, [pagos])

  const ventasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return ventas
    return ventas.filter(v =>
      String(v.id).includes(q) ||
      (v.nombre_cliente ?? '').toLowerCase().includes(q) ||
      (v.usuario_crea ?? '').toLowerCase().includes(q))
  }, [ventas, busqueda])

  const idsFiltrados = useMemo(() => new Set(ventasFiltradas.map(v => v.id)), [ventasFiltradas])
  const ventaMap = useMemo(() => Object.fromEntries(ventas.map(v => [v.id, v])), [ventas])

  const pagosF = useMemo(() => pagos.filter(p => idsFiltrados.has(p.id_venta_fk)), [pagos, idsFiltrados])
  const detsF  = useMemo(() => dets.filter(d => idsFiltrados.has(d.id_venta_fk)), [dets, idsFiltrados])

  // ── Matriz Centro × Forma de Pago (con # de operaciones y total vendido por centro) ──
  const matriz = useMemo(() => {
    const columnas = Array.from(new Set(pagosF.map(p => p.forma_nombre ?? 'Sin especificar')))
      .sort((a, b) => a.localeCompare(b, 'es'))
    const filasMap = new Map<string, { nombre: string; ops: number; vendido: number; celdas: Record<string, number>; cobrado: number }>()
    ventasFiltradas.forEach(v => {
      const k = nombreCentro(v.id_centro_fk)
      const f = filasMap.get(k) ?? { nombre: k, ops: 0, vendido: 0, celdas: {}, cobrado: 0 }
      f.ops += 1; f.vendido += v.total ?? 0
      filasMap.set(k, f)
    })
    pagosF.forEach(p => {
      const v = ventaMap[p.id_venta_fk]; if (!v) return
      const f = filasMap.get(nombreCentro(v.id_centro_fk))!
      const c = p.forma_nombre ?? 'Sin especificar'
      f.celdas[c] = (f.celdas[c] ?? 0) + (p.monto ?? 0)
      f.cobrado += p.monto ?? 0
    })
    const filas = Array.from(filasMap.values()).sort((a, b) => b.vendido - a.vendido)
    const totalesCol: Record<string, number> = {}
    columnas.forEach(c => { totalesCol[c] = filas.reduce((s, f) => s + (f.celdas[c] ?? 0), 0) })
    return {
      columnas, filas, totalesCol,
      totalOps: filas.reduce((s, f) => s + f.ops, 0),
      totalVendido: filas.reduce((s, f) => s + f.vendido, 0),
      totalCobrado: filas.reduce((s, f) => s + f.cobrado, 0),
    }
  }, [ventasFiltradas, pagosF, ventaMap, nombreCentro])

  // ── Productos: agrupado por concepto (y centro) ──
  const productos = useMemo(() => {
    const m = new Map<string, { centro: string; concepto: string; cantidad: number; ops: Set<number>; subtotal: number; iva: number; total: number }>()
    detsF.forEach(d => {
      const v = ventaMap[d.id_venta_fk]; if (!v) return
      const centro = nombreCentro(v.id_centro_fk)
      const concepto = d.concepto ?? 'Sin concepto'
      const key = `${centro}||${concepto}`
      const cur = m.get(key) ?? { centro, concepto, cantidad: 0, ops: new Set<number>(), subtotal: 0, iva: 0, total: 0 }
      cur.cantidad += d.cantidad ?? 0
      cur.ops.add(d.id_venta_fk)
      cur.subtotal += d.subtotal ?? 0
      cur.iva += d.iva ?? 0
      cur.total += d.total ?? 0
      m.set(key, cur)
    })
    return Array.from(m.values()).sort((a, b) => a.centro.localeCompare(b.centro, 'es') || b.total - a.total)
  }, [detsF, ventaMap, nombreCentro])

  const totalProductos = useMemo(() => ({
    cantidad: productos.reduce((s, p) => s + p.cantidad, 0),
    total: productos.reduce((s, p) => s + p.total, 0),
  }), [productos])

  const totalVendido = matriz.totalVendido
  const ticketProm = ventasFiltradas.length ? totalVendido / ventasFiltradas.length : 0
  const pendientes = ventasFiltradas.filter(v => v.id_corte_fk == null).length

  const exportXLSX = () => {
    const header = ['Centro de Venta', 'Operaciones', 'Vendido', ...matriz.columnas, 'Cobrado']
    const rows: any[][] = [header]
    matriz.filas.forEach(f => rows.push([f.nombre, f.ops, f.vendido, ...matriz.columnas.map(c => f.celdas[c] ?? 0), f.cobrado]))
    rows.push(['TOTAL', matriz.totalOps, matriz.totalVendido, ...matriz.columnas.map(c => matriz.totalesCol[c] ?? 0), matriz.totalCobrado])
    const wsRes = XLSX.utils.aoa_to_sheet(rows)
    wsRes['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 16 }, ...matriz.columnas.map(() => ({ wch: 16 })), { wch: 16 }]

    const wsOps = XLSX.utils.json_to_sheet(ventasFiltradas.map(v => ({
      'Folio': v.id,
      'Fecha': v.fecha ? new Date(v.fecha).toLocaleString('es-MX') : '',
      'Centro de Venta': nombreCentro(v.id_centro_fk),
      'Cliente': v.nombre_cliente ?? '',
      'Usuario': v.usuario_crea ?? '',
      'Subtotal': v.subtotal ?? 0,
      'IVA': v.iva ?? 0,
      'Total': v.total ?? 0,
      'Formas de Pago': (pagosPorVenta.get(v.id) ?? []).map(p => `${p.forma}: ${p.monto}`).join(' | '),
      'Corte': v.id_corte_fk ? 'Cortada' : 'Pendiente',
      'Facturada': v.facturada ? 'Sí' : 'No',
    })))
    wsOps['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 11 }, { wch: 10 }]

    const wsProd = XLSX.utils.json_to_sheet(productos.map(p => ({
      'Centro de Venta': p.centro, 'Producto / Concepto': p.concepto, 'Cantidad': p.cantidad,
      'Operaciones': p.ops.size, 'Subtotal': p.subtotal, 'IVA': p.iva, 'Total': p.total,
    })))
    wsProd['!cols'] = [{ wch: 22 }, { wch: 36 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }]

    const wsDet = XLSX.utils.json_to_sheet(detsF.map(d => {
      const v = ventaMap[d.id_venta_fk]
      return {
        'Folio': d.id_venta_fk,
        'Fecha': v?.fecha ? new Date(v.fecha).toLocaleString('es-MX') : '',
        'Centro de Venta': nombreCentro(v?.id_centro_fk ?? null),
        'Concepto': d.concepto ?? '', 'Cantidad': d.cantidad ?? 0,
        'Precio Unit.': d.precio_unitario ?? 0, 'Subtotal': d.subtotal ?? 0, 'IVA': d.iva ?? 0, 'Total': d.total ?? 0,
      }
    }))
    wsDet['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 36 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsRes,  'Resumen Centro x Forma')
    XLSX.utils.book_append_sheet(wb, wsOps,  'Operaciones')
    XLSX.utils.book_append_sheet(wb, wsProd, 'Productos')
    XLSX.utils.book_append_sheet(wb, wsDet,  'Detalle Productos')
    XLSX.writeFile(wb, `Ventas-POS_${filtroDe || 'ini'}_${filtroA || hoy()}.xlsx`)
  }

  const selStyle: React.CSSProperties = {
    height: 32, padding: '0 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13,
    background: '#fff', fontFamily: 'var(--font-body)', color: 'var(--text-primary)',
  }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }
  const th = (left = false): React.CSSProperties => ({
    padding: '8px 12px', textAlign: left ? 'left' : 'right', fontSize: 11, fontWeight: 700,
    color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
    background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
  })
  const td = (left = false, bold = false): React.CSSProperties => ({
    padding: '8px 12px', textAlign: left ? 'left' : 'right', fontVariantNumeric: 'tabular-nums',
    borderBottom: '1px solid #f1f5f9', fontWeight: bold ? 700 : 400, whiteSpace: left ? 'normal' : 'nowrap',
  })
  const tf: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', fontWeight: 700, background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'resumen',     label: 'Resumen por Centro y Forma de Pago', icon: <Grid3x3 size={13} /> },
    { key: 'operaciones', label: 'Detalle de Operaciones',             icon: <LayoutList size={13} /> },
    { key: 'productos',   label: 'Detalle de Productos',               icon: <Package size={13} /> },
  ]
  const ACC = '#2563eb'

  const count = tab === 'resumen' ? matriz.filas.length : tab === 'operaciones' ? ventasFiltradas.length : productos.length

  return (
    <div>
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <div style={lbl}>Centro de Venta</div>
          <select style={{ ...selStyle, width: 200 }} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}>
            <option value="">Todos los centros</option>
            {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <div style={lbl}>Estado de Corte</div>
          <select style={{ ...selStyle, width: 170 }} value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as EstadoCorte)}>
            <option value="">Todas</option>
            <option value="pendiente">Pendientes de cortar</option>
            <option value="cortada">Ya cortadas</option>
          </select>
        </div>
        <div>
          <div style={lbl}>Fecha de</div>
          <input type="date" style={{ ...selStyle, width: 140 }} value={filtroDe} onChange={e => setFiltroDe(e.target.value)} />
        </div>
        <div>
          <div style={lbl}>Fecha a</div>
          <input type="date" style={{ ...selStyle, width: 140 }} value={filtroA} onChange={e => setFiltroA(e.target.value)} />
        </div>
        <div>
          <div style={lbl}>Buscar (folio, cliente, usuario)</div>
          <input style={{ ...selStyle, width: 220 }} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar…" />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Refrescar" style={{ height: 32, alignSelf: 'flex-end' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="card" style={{ padding: 12, marginBottom: 16, color: '#dc2626', fontSize: 13 }}>Error al cargar: {error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Vendido',      value: fmt(totalVendido),               color: ACC,       bg: '#eff6ff' },
          { label: 'Operaciones',        value: ventasFiltradas.length.toString(), color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Ticket Promedio',    value: fmt(ticketProm),                 color: '#15803d', bg: '#f0fdf4' },
          { label: 'Pendientes de Corte', value: pendientes.toString(),          color: '#d97706', bg: '#fffbeb' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', background: k.bg, flex: '1 1 150px', maxWidth: 240 }}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 16, gap: 2, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? ACC : 'var(--text-muted)',
              borderBottom: tab === t.key ? `2px solid ${ACC}` : '2px solid transparent', marginBottom: -1 }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }} id="reporte-print-area">
        <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <PrintBar title="Ventas-POS" count={count}
            reportTitle={`Ventas por Centro de Venta — ${filtroCentro ? nombreCentro(Number(filtroCentro)) : 'Todos los centros'} (${filtroDe || '…'} a ${filtroA || '…'})`}
            hideCSV />
          <button className="btn-secondary" onClick={exportXLSX} style={{ fontSize: 12 }}>
            <FileSpreadsheet size={13} /> Exportar Excel
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
        ) : ventasFiltradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>Sin ventas con los filtros seleccionados</div>
        ) : tab === 'resumen' ? (
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th(true)}>Centro de Venta</th>
                  <th style={th()}>Ops.</th>
                  <th style={th()}>Vendido</th>
                  <th style={th()}>% </th>
                  {matriz.columnas.map(c => <th key={c} style={th()}>{c}</th>)}
                  <th style={th()}>Cobrado</th>
                </tr>
              </thead>
              <tbody>
                {matriz.filas.map(f => (
                  <tr key={f.nombre}>
                    <td style={td(true, true)}>{f.nombre}</td>
                    <td style={td()}>{f.ops}</td>
                    <td style={td(false, true)}>{fmt(f.vendido)}</td>
                    <td style={{ ...td(), color: 'var(--text-muted)' }}>{pct(f.vendido, matriz.totalVendido)}</td>
                    {matriz.columnas.map(c => <td key={c} style={td()}>{f.celdas[c] ? fmt(f.celdas[c]) : '—'}</td>)}
                    <td style={td(false, true)}>{fmt(f.cobrado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...tf, textAlign: 'left' }}>TOTAL</td>
                  <td style={tf}>{matriz.totalOps}</td>
                  <td style={tf}>{fmt(matriz.totalVendido)}</td>
                  <td style={tf}>100%</td>
                  {matriz.columnas.map(c => <td key={c} style={tf}>{fmt(matriz.totalesCol[c] ?? 0)}</td>)}
                  <td style={tf}>{fmt(matriz.totalCobrado)}</td>
                </tr>
                <tr>
                  <td style={{ ...tf, textAlign: 'left', background: '#fff', borderTop: 'none', fontWeight: 500, color: 'var(--text-muted)' }}>% por forma</td>
                  <td style={{ ...tf, background: '#fff', borderTop: 'none' }} colSpan={3} />
                  {matriz.columnas.map(c => (
                    <td key={c} style={{ ...tf, background: '#fff', borderTop: 'none', fontWeight: 500, color: 'var(--text-muted)' }}>
                      {pct(matriz.totalesCol[c] ?? 0, matriz.totalCobrado)}
                    </td>
                  ))}
                  <td style={{ ...tf, background: '#fff', borderTop: 'none' }} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : tab === 'operaciones' ? (
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th(true)}>Folio</th>
                  <th style={th(true)}>Fecha</th>
                  <th style={th(true)}>Centro</th>
                  <th style={th(true)}>Cliente</th>
                  <th style={th(true)}>Usuario</th>
                  <th style={th()}>Subtotal</th>
                  <th style={th()}>IVA</th>
                  <th style={th()}>Total</th>
                  <th style={th(true)}>Formas de Pago</th>
                  <th style={th(true)}>Corte</th>
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas.map(v => (
                  <tr key={v.id}>
                    <td style={td(true, true)}>{v.id}</td>
                    <td style={{ ...td(true), whiteSpace: 'nowrap' }}>{fmtF(v.fecha)}</td>
                    <td style={td(true)}>{nombreCentro(v.id_centro_fk)}</td>
                    <td style={td(true)}>{v.nombre_cliente || '—'}</td>
                    <td style={td(true)}>{v.usuario_crea || '—'}</td>
                    <td style={td()}>{fmt(v.subtotal ?? 0)}</td>
                    <td style={td()}>{fmt(v.iva ?? 0)}</td>
                    <td style={td(false, true)}>{fmt(v.total ?? 0)}</td>
                    <td style={td(true)}>
                      {(pagosPorVenta.get(v.id) ?? []).map((p, i) => (
                        <div key={i} style={{ fontSize: 12 }}>{p.forma}: <b>{fmt(p.monto)}</b></div>
                      ))}
                      {!pagosPorVenta.has(v.id) && '—'}
                    </td>
                    <td style={td(true)}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: v.id_corte_fk ? '#15803d' : '#d97706' }}>
                        {v.id_corte_fk ? 'Cortada' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...tf, textAlign: 'left' }} colSpan={5}>TOTAL ({ventasFiltradas.length} operaciones)</td>
                  <td style={tf}>{fmt(ventasFiltradas.reduce((s, v) => s + (v.subtotal ?? 0), 0))}</td>
                  <td style={tf}>{fmt(ventasFiltradas.reduce((s, v) => s + (v.iva ?? 0), 0))}</td>
                  <td style={tf}>{fmt(totalVendido)}</td>
                  <td style={tf} colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th(true)}>Centro de Venta</th>
                  <th style={th(true)}>Producto / Concepto</th>
                  <th style={th()}>Cantidad</th>
                  <th style={th()}>Ops.</th>
                  <th style={th()}>Subtotal</th>
                  <th style={th()}>IVA</th>
                  <th style={th()}>Total</th>
                  <th style={th()}>%</th>
                </tr>
              </thead>
              <tbody>
                {productos.map(p => (
                  <tr key={`${p.centro}||${p.concepto}`}>
                    <td style={td(true)}>{p.centro}</td>
                    <td style={td(true, true)}>{p.concepto}</td>
                    <td style={td()}>{p.cantidad.toLocaleString('es-MX')}</td>
                    <td style={td()}>{p.ops.size}</td>
                    <td style={td()}>{fmt(p.subtotal)}</td>
                    <td style={td()}>{fmt(p.iva)}</td>
                    <td style={td(false, true)}>{fmt(p.total)}</td>
                    <td style={{ ...td(), color: 'var(--text-muted)' }}>{pct(p.total, totalProductos.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...tf, textAlign: 'left' }} colSpan={2}>TOTAL ({productos.length} renglones)</td>
                  <td style={tf}>{totalProductos.cantidad.toLocaleString('es-MX')}</td>
                  <td style={tf} />
                  <td style={tf}>{fmt(productos.reduce((s, p) => s + p.subtotal, 0))}</td>
                  <td style={tf}>{fmt(productos.reduce((s, p) => s + p.iva, 0))}</td>
                  <td style={tf}>{fmt(totalProductos.total)}</td>
                  <td style={tf}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
