'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, AlertTriangle } from 'lucide-react'

export default function ReporteInventario() {
  const [rows, setRows]       = useState<any[]>([])
  const [almacenes, setAlms]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroAlm, setFiltroAlm]   = useState('')
  const [filtroCat, setFiltroCat]   = useState('')
  const [soloAlertas, setSoloAlertas] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: alms }, { data: inv }] = await Promise.all([
      dbComp.from('almacenes').select('id, nombre, area').order('nombre'),
      dbComp.from('inventario')
        .select('id_articulo_fk, id_almacen_fk, cantidad, updated_at'),
    ])

    setAlms(alms ?? [])

    // Cargar artículos de los que hay inventario
    const artIds = Array.from(new Set((inv ?? []).map((i: any) => i.id_articulo_fk)))
    const { data: arts } = artIds.length
      ? await dbComp.from('articulos').select('id, clave, nombre, unidad, categoria, stock_minimo, precio_ref').in('id', artIds)
      : { data: [] }

    const artMap: Record<number, any> = {}
    ;(arts ?? []).forEach((a: any) => { artMap[a.id] = a })
    const almMap: Record<number, any> = {}
    ;(alms ?? []).forEach((a: any) => { almMap[a.id] = a })

    let result = (inv ?? []).map((i: any) => ({
      ...i,
      almacen: almMap[i.id_almacen_fk],
      articulo: artMap[i.id_articulo_fk],
      valor: Number(i.cantidad) * Number(artMap[i.id_articulo_fk]?.precio_ref || 0),
      bajoMin: Number(i.cantidad) <= Number(artMap[i.id_articulo_fk]?.stock_minimo || 0),
    }))

    if (filtroAlm) result = result.filter(r => r.id_almacen_fk === Number(filtroAlm))
    if (filtroCat) result = result.filter(r => r.articulo?.categoria === filtroCat)
    if (soloAlertas) result = result.filter(r => r.bajoMin)

    result.sort((a, b) => (a.almacen?.nombre ?? '').localeCompare(b.almacen?.nombre ?? ''))
    setRows(result)
    setLoading(false)
  }, [filtroAlm, filtroCat, soloAlertas])

  useEffect(() => { fetchData() }, [fetchData])

  const fmt = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const valorTotal  = rows.reduce((a, r) => a + r.valor, 0)
  const alertas     = rows.filter(r => r.bajoMin).length
  const CATS = ['Agroquimicos','Alimento para caballos','Construcción, Ferreteria y Pinturas','Jardineria','Limpieza y Suministros','Papeleria','Refacciones','Servicios']

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" style={{ minWidth: 200 }} value={filtroAlm} onChange={e => setFiltroAlm(e.target.value)}>
          <option value="">Todos los almacenes</option>
          {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 180 }} value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={soloAlertas} onChange={e => setSoloAlertas(e.target.checked)} />
          Solo bajo stock mínimo
        </label>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Inventario-Actual" count={rows.length} reportTitle="Inventario Actual por Almacén" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Valor Total Inventario', value: fmt(valorTotal), color: 'var(--blue)' },
          { label: 'Artículos con existencia', value: String(rows.filter(r => Number(r.cantidad) > 0).length), color: '#059669' },
          { label: 'Alertas stock mínimo', value: String(alertas), color: alertas > 0 ? '#dc2626' : '#94a3b8' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Almacén / C. Costo</th>
              <th>Clave</th>
              <th>Artículo</th>
              <th>Categoría</th>
              <th style={{ textAlign: 'right' }}>Stock Mín.</th>
              <th style={{ textAlign: 'right' }}>Existencia</th>
              <th>Unidad</th>
              <th style={{ textAlign: 'right' }}>Precio Ref.</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} style={{ background: r.bajoMin ? '#fef2f2' : 'transparent' }}>
                <td>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{r.almacen?.nombre ?? `#${r.id_almacen_fk}`}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.almacen?.area ?? ''}</div>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)' }}>{r.articulo?.clave ?? '—'}</td>
                <td style={{ fontSize: 13 }}>
                  {r.bajoMin && <AlertTriangle size={11} style={{ color: '#dc2626', marginRight: 4 }} />}
                  {r.articulo?.nombre ?? `#${r.id_articulo_fk}`}
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.articulo?.categoria ?? '—'}</td>
                <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{r.articulo?.stock_minimo ?? 0}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: Number(r.cantidad) === 0 ? '#dc2626' : r.bajoMin ? '#d97706' : '#15803d', fontSize: 14 }}>
                  {Number(r.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 3 })}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.articulo?.unidad ?? '—'}</td>
                <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {r.articulo?.precio_ref ? fmt(r.articulo.precio_ref) : '—'}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--blue)', fontWeight: 600 }}>
                  {r.valor > 0 ? fmt(r.valor) : '—'}
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={8} style={{ color: 'var(--blue)' }}>VALOR TOTAL INVENTARIO</td>
                <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', fontSize: 15 }}>{fmt(valorTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
