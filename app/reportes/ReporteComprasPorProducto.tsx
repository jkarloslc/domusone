'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, ChevronDown, ChevronRight, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

const fmt  = (n: number | null) => n != null ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtQ = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 })
const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

// OP que ya pasó la doble autorización (mismo criterio que el precio de última compra del artículo)
const OP_AUTORIZADAS = ['Pendiente', 'Pago Parcial', 'Pagada']

type Linea = {
  key: string; producto: string; clave: string | null; unidad: string | null
  provId: number; oc: string; fecha: string | null; ocStatus: string
  cantidad: number; precio: number; importe: number
}
type ProvRow = { provId: number; nombre: string; lineas: Linea[]; cantidad: number; importe: number; ocs: number; min: number; max: number; ultimo: number; ultimaFecha: string | null }
type ProdGroup = { key: string; producto: string; clave: string | null; unidad: string | null; provs: ProvRow[]; cantidad: number; importe: number }

// PostgREST corta en 1000 filas: se pagina para no perder renglones.
async function fetchAll(build: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

export default function ReporteComprasPorProducto() {
  const [lineas, setLineas]   = useState<Linea[]>([])
  const [provMap, setProvMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [openProd, setOpenProd] = useState<Set<string>>(new Set())
  const [openProv, setOpenProv] = useState<Set<string>>(new Set())

  const [busca, setBusca]       = useState('')
  const [filtroProv, setFiltroProv] = useState('')
  const [filtroDe, setFiltroDe] = useState('')
  const [filtroA, setFiltroA]   = useState('')
  const [soloOP, setSoloOP]     = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [det, ocs, arts, provs, links, opsLegacy] = await Promise.all([
        fetchAll((a, b) => dbComp.from('ordenes_compra_det')
          .select('id, id_oc_fk, id_articulo_fk, descripcion, cantidad, unidad, precio_unitario, subtotal').order('id').range(a, b)),
        fetchAll((a, b) => dbComp.from('ordenes_compra')
          .select('id, folio, fecha_oc, status, id_proveedor_fk').order('id').range(a, b)),
        fetchAll((a, b) => dbComp.from('articulos').select('id, clave, nombre, unidad').order('id').range(a, b)),
        fetchAll((a, b) => dbComp.from('proveedores').select('id, nombre').order('id').range(a, b)),
        fetchAll((a, b) => dbComp.from('ordenes_pago_oc').select('id, id_oc_fk, ordenes_pago(status)').order('id').range(a, b)),
        fetchAll((a, b) => dbComp.from('ordenes_pago').select('id, id_oc_fk, status').not('id_oc_fk', 'is', null).order('id').range(a, b)),
      ])
      const pm: Record<number, string> = {}
      provs.forEach((p: any) => { pm[p.id] = p.nombre })
      setProvMap(pm)

      const artMap: Record<number, any> = {}
      arts.forEach((a: any) => { artMap[a.id] = a })
      const ocMap: Record<number, any> = {}
      ocs.forEach((o: any) => { ocMap[o.id] = o })

      const ocConOP = new Set<number>()
      links.forEach((l: any) => { if (OP_AUTORIZADAS.includes(l.ordenes_pago?.status)) ocConOP.add(l.id_oc_fk) })
      opsLegacy.forEach((o: any) => { if (OP_AUTORIZADAS.includes(o.status)) ocConOP.add(o.id_oc_fk) })

      const res: Linea[] = []
      det.forEach((d: any) => {
        const oc = ocMap[d.id_oc_fk]
        if (!oc || ['Borrador', 'Cancelada'].includes(oc.status)) return
        if (soloOP && !ocConOP.has(oc.id)) return
        const art = d.id_articulo_fk != null ? artMap[d.id_articulo_fk] : null
        const cantidad = Number(d.cantidad ?? 0)
        const importe  = Number(d.subtotal) > 0 ? Number(d.subtotal) : cantidad * Number(d.precio_unitario ?? 0)
        res.push({
          key: art ? `a${art.id}` : `t${(d.descripcion ?? '').trim().toLowerCase()}`,
          producto: art?.nombre ?? (d.descripcion?.trim() || 'Sin descripción'),
          clave: art?.clave ?? null, unidad: art?.unidad ?? d.unidad ?? null,
          provId: oc.id_proveedor_fk ?? 0, oc: oc.folio, fecha: oc.fecha_oc, ocStatus: oc.status,
          cantidad, precio: cantidad > 0 ? importe / cantidad : Number(d.precio_unitario ?? 0), importe,
        })
      })
      setLineas(res)
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar el reporte')
    }
    setLoading(false)
  }, [soloOP])

  useEffect(() => { fetchData() }, [fetchData])

  const proveedoresEnDatos = useMemo(
    () => Array.from(new Set(lineas.map(l => l.provId))).map(id => ({ id, nombre: provMap[id] ?? 'Sin proveedor' }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [lineas, provMap])

  const grupos: ProdGroup[] = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const porProd: Record<string, ProdGroup> = {}
    lineas.forEach(l => {
      if (filtroProv && l.provId !== Number(filtroProv)) return
      if (filtroDe && (l.fecha ?? '') < filtroDe) return
      if (filtroA && (l.fecha ?? '') > filtroA) return
      if (q && !l.producto.toLowerCase().includes(q) && !(l.clave ?? '').toLowerCase().includes(q)) return
      const g = (porProd[l.key] ??= { key: l.key, producto: l.producto, clave: l.clave, unidad: l.unidad, provs: [], cantidad: 0, importe: 0 })
      g.cantidad += l.cantidad; g.importe += l.importe
      let p = g.provs.find(x => x.provId === l.provId)
      if (!p) {
        p = { provId: l.provId, nombre: provMap[l.provId] ?? 'Sin proveedor', lineas: [], cantidad: 0, importe: 0, ocs: 0, min: Infinity, max: 0, ultimo: 0, ultimaFecha: null }
        g.provs.push(p)
      }
      p.lineas.push(l); p.cantidad += l.cantidad; p.importe += l.importe
    })
    return Object.values(porProd).map(g => {
      g.provs.forEach(p => {
        p.lineas.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '') || b.oc.localeCompare(a.oc))
        p.ocs = new Set(p.lineas.map(l => l.oc)).size
        p.min = Math.min(...p.lineas.map(l => l.precio)); p.max = Math.max(...p.lineas.map(l => l.precio))
        p.ultimo = p.lineas[0].precio; p.ultimaFecha = p.lineas[0].fecha
      })
      g.provs.sort((a, b) => b.importe - a.importe)
      return g
    }).sort((a, b) => b.importe - a.importe)
  }, [lineas, provMap, busca, filtroProv, filtroDe, filtroA])

  const totalGeneral = grupos.reduce((s, g) => s + g.importe, 0)
  const nLineas = grupos.reduce((s, g) => s + g.provs.reduce((a, p) => a + p.lineas.length, 0), 0)

  const toggle = (set: Set<string>, k: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); fn(n)
  }
  const expandAll = () => {
    setOpenProd(new Set(grupos.map(g => g.key)))
    setOpenProv(new Set(grupos.flatMap(g => g.provs.map(p => `${g.key}|${p.provId}`))))
  }

  const exportarExcel = () => {
    const resumen: any[] = []
    const detalle: any[] = []
    grupos.forEach(g => g.provs.forEach(p => {
      resumen.push({
        Clave: g.clave ?? '', Producto: g.producto, Unidad: g.unidad ?? '', Proveedor: p.nombre, '# OC': p.ocs,
        Cantidad: p.cantidad, 'Precio promedio': p.cantidad > 0 ? p.importe / p.cantidad : 0,
        'Precio mín.': p.min, 'Precio máx.': p.max, 'Último precio': p.ultimo, 'Última compra': p.ultimaFecha ?? '', Importe: p.importe,
      })
      p.lineas.forEach(l => detalle.push({
        Clave: g.clave ?? '', Producto: g.producto, Proveedor: p.nombre, OC: l.oc, Fecha: l.fecha ?? '', 'Status OC': l.ocStatus,
        Cantidad: l.cantidad, 'Precio unit.': l.precio, Importe: l.importe,
      }))
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Producto x Proveedor')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle')
    XLSX.writeFile(wb, `Compras-por-Producto_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }
  const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '8px 14px' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" style={{ width: 220 }} placeholder="Buscar producto o clave…" value={busca} onChange={e => setBusca(e.target.value)} />
        <select className="select" style={{ width: 'auto', minWidth: 200 }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {proveedoresEnDatos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 140 }} />
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={soloOP} onChange={e => setSoloOP(e.target.checked)} />
          Solo OC con OP autorizada
        </label>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Productos', value: String(grupos.length) },
          { label: 'Proveedores', value: String(new Set(grupos.flatMap(g => g.provs.map(p => p.provId))).size) },
          { label: 'Líneas de compra', value: String(nLineas) },
          { label: 'Importe (sin IVA)', value: fmt(totalGeneral) },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 20px', flex: '1 1 140px', minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <PrintBar title="Compras-por-Producto" count={nLineas} reportTitle="Compras por Producto con desglose de Proveedor" hideCSV
        extra={<button className="btn-ghost" onClick={exportarExcel} disabled={!grupos.length}><Download size={13} /> Exportar Excel</button>} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setOpenProd(new Set()); setOpenProv(new Set()) }}>Colapsar todo</button>
      </div>

      {error ? (
        <div style={{ padding: 24, color: '#dc2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></div>
      ) : grupos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin compras con los filtros aplicados</div>
      ) : (
        <div id="reporte-print-area" className="card" style={{ overflow: 'auto' }}>
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ ...th, textAlign: 'left' }}>Producto / Proveedor / OC</th>
                <th style={{ ...th, textAlign: 'right' }}># OC</th>
                <th style={{ ...th, textAlign: 'right' }}>Cantidad</th>
                <th style={{ ...th, textAlign: 'right' }}>Precio prom.</th>
                <th style={{ ...th, textAlign: 'right' }}>Mín.</th>
                <th style={{ ...th, textAlign: 'right' }}>Máx.</th>
                <th style={{ ...th, textAlign: 'right' }}>Último</th>
                <th style={{ ...th, textAlign: 'right' }}>Importe</th>
                <th style={{ ...th, textAlign: 'right' }}>% prod.</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => {
                const abierto = openProd.has(g.key)
                return (
                  <Fragment key={g.key}>
                    <tr onClick={() => toggle(openProd, g.key, setOpenProd)} style={{ background: '#f1f5f9', cursor: 'pointer', fontWeight: 700, borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '9px 14px' }}>
                        {abierto ? <ChevronDown size={13} style={{ verticalAlign: -2 }} /> : <ChevronRight size={13} style={{ verticalAlign: -2 }} />}{' '}
                        {g.clave && <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', marginRight: 6 }}>{g.clave}</span>}
                        {g.producto} <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)' }}>{g.unidad}</span>
                        {!g.clave && <span style={{ fontWeight: 400, fontSize: 10, color: '#d97706', marginLeft: 6 }}>(texto libre)</span>}
                      </td>
                      <td style={num}>{g.provs.reduce((a, p) => a + p.ocs, 0)}</td>
                      <td style={num}>{fmtQ(g.cantidad)}</td>
                      <td style={num}>{g.cantidad > 0 ? fmt(g.importe / g.cantidad) : '—'}</td>
                      <td style={num}>{fmt(Math.min(...g.provs.map(p => p.min)))}</td>
                      <td style={num}>{fmt(Math.max(...g.provs.map(p => p.max)))}</td>
                      <td style={num}></td>
                      <td style={num}>{fmt(g.importe)}</td>
                      <td style={num}>100%</td>
                    </tr>
                    {abierto && g.provs.map(p => {
                      const pk = `${g.key}|${p.provId}`
                      const pAbierto = openProv.has(pk)
                      return (
                        <Fragment key={pk}>
                          <tr onClick={() => toggle(openProv, pk, setOpenProv)} style={{ cursor: 'pointer', borderTop: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 14px 8px 36px', fontWeight: 600 }}>
                              {pAbierto ? <ChevronDown size={12} style={{ verticalAlign: -2 }} /> : <ChevronRight size={12} style={{ verticalAlign: -2 }} />} {p.nombre}
                            </td>
                            <td style={num}>{p.ocs}</td>
                            <td style={num}>{fmtQ(p.cantidad)}</td>
                            <td style={num}>{p.cantidad > 0 ? fmt(p.importe / p.cantidad) : '—'}</td>
                            <td style={num}>{fmt(p.min)}</td>
                            <td style={num}>{fmt(p.max)}</td>
                            <td style={num} title={fmtF(p.ultimaFecha)}>{fmt(p.ultimo)}</td>
                            <td style={num}>{fmt(p.importe)}</td>
                            <td style={num}>{g.importe > 0 ? (p.importe / g.importe * 100).toFixed(1) + '%' : '—'}</td>
                          </tr>
                          {pAbierto && p.lineas.map((l, i) => (
                            <tr key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              <td style={{ padding: '6px 14px 6px 60px' }}>
                                <span style={{ fontFamily: 'monospace', color: 'var(--blue)' }}>{l.oc}</span> · {fmtF(l.fecha)} · {l.ocStatus}
                              </td>
                              <td style={num}></td>
                              <td style={num}>{fmtQ(l.cantidad)}</td>
                              <td style={num}>{fmt(l.precio)}</td>
                              <td style={num}></td><td style={num}></td><td style={num}></td>
                              <td style={num}>{fmt(l.importe)}</td>
                              <td style={num}></td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
              <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 700, background: '#f8fafc' }}>
                <td style={{ padding: '10px 14px' }}>Total general</td>
                <td colSpan={6}></td>
                <td style={num}>{fmt(totalGeneral)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
