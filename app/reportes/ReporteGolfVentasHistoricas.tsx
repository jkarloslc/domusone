'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbGolf } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, FileSpreadsheet, LayoutList, BarChart2 } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const fmtF = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Tab = 'articulos' | 'detalle'

export default function ReporteGolfVentasHistoricas() {
  const [ventas,   setVentas]   = useState<any[]>([])
  const [dets,     setDets]     = useState<any[]>([])
  const [centros,  setCentros]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<Tab>('articulos')

  // Filtros
  const [filtroCentro,   setFiltroCentro]   = useState('')
  const [filtroArticulo, setFiltroArticulo] = useState('')
  const [filtroDe,       setFiltroDe]       = useState('')
  const [filtroA,        setFiltroA]        = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)

    // Centros de venta
    const { data: centrosData } = await dbGolf
      .from('cat_centros_venta')
      .select('id, nombre')
      .order('orden')

    // Ventas cortadas (id_corte_fk NOT NULL) y status PAGADA
    let q = dbGolf.from('ctrl_ventas')
      .select('id, folio_dia, fecha, nombre_cliente, es_socio, total, subtotal, iva, id_centro_fk, usuario_crea')
      .not('id_corte_fk', 'is', null)
      .eq('status', 'PAGADA')
      .order('fecha', { ascending: false })

    if (filtroCentro) q = (q as any).eq('id_centro_fk', Number(filtroCentro))
    if (filtroDe)     q = (q as any).gte('fecha', filtroDe + 'T00:00:00')
    if (filtroA)      q = (q as any).lte('fecha', filtroA  + 'T23:59:59')

    const { data: ventasData } = await q

    const ids = (ventasData ?? []).map((v: any) => v.id)

    // Detalles de esas ventas
    let detsData: any[] = []
    if (ids.length > 0) {
      const { data } = await dbGolf.from('ctrl_ventas_det')
        .select('id, id_venta_fk, id_producto_fk, concepto, cantidad, precio_unitario, iva, subtotal, total')
        .in('id_venta_fk', ids)
      detsData = data ?? []
    }

    setCentros(centrosData ?? [])
    setVentas(ventasData ?? [])
    setDets(detsData)
    setLoading(false)
  }, [filtroCentro, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  // Lookup map centros
  const centroMap = useMemo(() =>
    Object.fromEntries(centros.map(c => [c.id, c.nombre])), [centros])

  // Enriquecer dets con datos de venta
  const ventaMap = useMemo(() =>
    Object.fromEntries(ventas.map(v => [v.id, v])), [ventas])

  const enrichedDets = useMemo(() => dets.map(d => ({
    ...d,
    fecha:         ventaMap[d.id_venta_fk]?.fecha ?? null,
    nombre_cliente: ventaMap[d.id_venta_fk]?.nombre_cliente ?? '—',
    folio_dia:     ventaMap[d.id_venta_fk]?.folio_dia ?? '—',
    id_centro_fk:  ventaMap[d.id_venta_fk]?.id_centro_fk ?? null,
    centro_nombre: centroMap[ventaMap[d.id_venta_fk]?.id_centro_fk] ?? '—',
  })), [dets, ventaMap, centroMap])

  // Artículos únicos para el filtro (del histórico cargado — todos los centros)
  const articulosUnicos = useMemo(() => {
    const map = new Map<number, string>()
    dets.forEach(d => { if (d.id_producto_fk) map.set(d.id_producto_fk, d.concepto) })
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [dets])

  // Filtrado final (solo por artículo, el resto se aplica en el fetch)
  const filtered = useMemo(() => filtroArticulo
    ? enrichedDets.filter(d => String(d.id_producto_fk) === filtroArticulo)
    : enrichedDets,
  [enrichedDets, filtroArticulo])

  // ── Agrupado por artículo ───────────────────────────────────
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

  // ── KPIs ────────────────────────────────────────────────────
  const totalVentas    = useMemo(() => filtered.reduce((s, d) => s + (d.total ?? 0), 0), [filtered])
  const totalCantidad  = useMemo(() => filtered.reduce((s, d) => s + (d.cantidad ?? 0), 0), [filtered])
  const numTickets     = useMemo(() => new Set(filtered.map(d => d.id_venta_fk)).size, [filtered])
  const ticketPromedio = numTickets > 0
    ? ventas.filter(v => new Set(filtered.map(d => d.id_venta_fk)).has(v.id))
             .reduce((s, v) => s + (v.total ?? 0), 0) / numTickets
    : 0

  // ── Export Excel ────────────────────────────────────────────
  const exportXLSX = () => {
    // Hoja 1: Por artículo
    const wsArt = XLSX.utils.json_to_sheet(porArticulo.map(a => ({
      'Artículo / Servicio': a.nombre,
      Cantidad:              a.cantidad,
      Subtotal:              a.subtotal,
      IVA:                   a.iva,
      Total:                 a.total,
    })))
    wsArt['!cols'] = [{ wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]

    // Hoja 2: Detalle
    const wsDetalle = XLSX.utils.json_to_sheet(filtered.map(d => ({
      Fecha:       d.fecha ? new Date(d.fecha).toLocaleDateString('es-MX') : '',
      Centro:      d.centro_nombre,
      Folio:       d.folio_dia,
      Cliente:     d.nombre_cliente,
      Artículo:    d.concepto,
      Cantidad:    d.cantidad,
      'P. Unit.':  d.precio_unitario,
      IVA:         d.iva,
      Total:       d.total,
    })))
    wsDetalle['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 28 },
      { wch: 32 }, { wch: 9 }, { wch: 11 }, { wch: 11 }, { wch: 12 },
    ]

    const wb = XLSX.utils.book_new()
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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'articulos', label: 'Por Artículo',  icon: <BarChart2  size={13} /> },
    { key: 'detalle',   label: 'Detalle líneas', icon: <LayoutList size={13} /> },
  ]

  return (
    <div>
      {/* Filtros */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 18, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
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
          { label: 'Total Ventas',       value: fmt(totalVentas),              color: '#b8952a', bg: '#fefce8' },
          { label: 'Unidades Vendidas',  value: totalCantidad.toString(),       color: 'var(--blue)', bg: 'var(--blue-pale)' },
          { label: 'Tickets',            value: numTickets.toString(),          color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Ticket Promedio',    value: fmt(ticketPromedio),            color: '#0f766e', bg: '#f0fdfa' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', background: k.bg, flex: '1 1 150px', maxWidth: 220 }}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
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
              color: tab === t.key ? '#b8952a' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid #b8952a' : '2px solid transparent', marginBottom: -1 }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }} id="reporte-print-area">
        <div style={{ padding: '14px 18px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <PrintBar
            title="Golf-Ventas-Historicas"
            count={tab === 'articulos' ? porArticulo.length : filtered.length}
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
        ) : tab === 'articulos' ? (
          /* ── Vista por artículo ─────────────────────────────── */
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Artículo / Servicio', 'Cantidad', 'Subtotal', 'IVA', 'Total'].map((h, i) => (
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
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#b8952a', fontVariantNumeric: 'tabular-nums' }}>{fmt(a.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fefce8', borderTop: '2px solid #fde68a' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 700, color: '#92400e' }}>Total ({porArticulo.length} artículos)</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#92400e', fontVariantNumeric: 'tabular-nums' }}>{totalCantidad.toLocaleString('es-MX')}</td>
                  <td colSpan={2} />
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#b8952a', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalVentas)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* ── Vista detalle líneas ───────────────────────────── */
          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Fecha', 'Centro', 'Folio', 'Cliente', 'Artículo / Servicio', 'Cant.', 'P. Unit.', 'Total'].map((h, i) => (
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
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>{d.folio_dia}</td>
                    <td style={{ padding: '8px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.nombre_cliente}>{d.nombre_cliente}</td>
                    <td style={{ padding: '8px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={d.concepto}>{d.concepto}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.cantidad}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', fontSize: 12 }}>{fmt(d.precio_unitario ?? 0)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#b8952a', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.total ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fefce8', borderTop: '2px solid #fde68a' }}>
                  <td colSpan={7} style={{ padding: '9px 12px', fontWeight: 700, color: '#92400e' }}>Total ({filtered.length} líneas · {numTickets} tickets)</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#b8952a', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalVentas)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
