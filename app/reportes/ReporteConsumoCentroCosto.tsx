'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter } from 'lucide-react'

export default function ReporteConsumoCentroCosto() {
  const [rows, setRows]       = useState<any[]>([])
  const [almacenes, setAlms]  = useState<any[]>([])
  const [articulos, setArts]  = useState<Record<number, any>>({})
  const [loading, setLoading] = useState(true)
  const [filtroAlm, setFiltroAlm] = useState('')
  const [filtroPer, setFiltroPer] = useState('') // YYYY-MM

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: alms }, { data: arts }, { data: movs }] = await Promise.all([
      dbComp.from('almacenes').select('id, nombre, area').order('nombre'),
      dbComp.from('articulos').select('id, clave, nombre, unidad, categoria, precio_ref'),
      dbComp.from('movimientos_inv')
        .select('id_articulo_fk, id_almacen_fk, tipo_mov, cantidad, precio_unitario, created_at')
        .eq('tipo_mov', 'TRANSFERENCIA_IN')
        .order('created_at', { ascending: false }),
    ])

    setAlms(alms ?? [])
    const am: Record<number, any> = {}
    ;(arts ?? []).forEach((a: any) => { am[a.id] = a })
    setArts(am)

    // Agrupar movimientos por almacén + artículo
    const grouped: Record<string, any> = {}
    for (const m of movs ?? []) {
      if (filtroAlm && m.id_almacen_fk !== Number(filtroAlm)) continue
      if (filtroPer) {
        const mes = m.created_at?.slice(0, 7)
        if (mes !== filtroPer) continue
      }
      const key = `${m.id_almacen_fk}_${m.id_articulo_fk}`
      if (!grouped[key]) grouped[key] = { id_almacen_fk: m.id_almacen_fk, id_articulo_fk: m.id_articulo_fk, cantidad: 0, valor: 0, movs: 0 }
      grouped[key].cantidad += Number(m.cantidad)
      grouped[key].movs     += 1
      // Usar precio_unitario si existe, si no usar precio_ref del artículo
      const precio = Number(m.precio_unitario) > 0
        ? Number(m.precio_unitario)
        : Number(am[m.id_articulo_fk]?.precio_ref || 0)
      grouped[key].valor += Number(m.cantidad) * precio
    }

    const result = Object.values(grouped).map((r: any) => ({
      ...r,
      almacen:  (alms ?? []).find((a: any) => a.id === r.id_almacen_fk),
      articulo: am[r.id_articulo_fk],
    })).sort((a, b) => b.valor - a.valor)

    setRows(result)
    setLoading(false)
  }, [filtroAlm, filtroPer])

  useEffect(() => { fetchData() }, [fetchData])

  const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const total = rows.reduce((a, r) => a + r.valor, 0)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 200 }} value={filtroAlm} onChange={e => setFiltroAlm(e.target.value)}>
            <option value="">Todos los centros de costo</option>
            {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <input className="input" type="month" value={filtroPer} onChange={e => setFiltroPer(e.target.value)}
          style={{ width: 160 }} />
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Consumo-por-Centro-de-Costo" count={rows.length} reportTitle="Consumo por Centro de Costo" />

      {/* Resumen KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Consumo', value: fmt(total), color: 'var(--blue)' },
          { label: 'Artículos distintos', value: String(new Set(rows.map(r => r.id_articulo_fk)).size), color: '#7c3aed' },
          { label: 'Centros de Costo', value: String(new Set(rows.map(r => r.id_almacen_fk)).size), color: '#059669' },
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
              <th>Centro de Costo</th>
              <th>Área</th>
              <th>Artículo</th>
              <th>Categoría</th>
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              <th>Unidad</th>
              <th style={{ textAlign: 'right' }}>Valor Estimado</th>
              <th style={{ textAlign: 'right' }}>Movimientos</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin datos para los filtros seleccionados</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{r.almacen?.nombre ?? `#${r.id_almacen_fk}`}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.almacen?.area ?? '—'}</td>
                <td>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--blue)' }}>{r.articulo?.clave}</div>
                  <div style={{ fontSize: 13 }}>{r.articulo?.nombre ?? `#${r.id_articulo_fk}`}</div>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.articulo?.categoria ?? '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {r.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 3 })}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.articulo?.unidad ?? '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--blue)' }}>{fmt(r.valor)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{r.movs}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={6} style={{ color: 'var(--blue)' }}>TOTAL</td>
                <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', fontSize: 15 }}>{fmt(total)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
