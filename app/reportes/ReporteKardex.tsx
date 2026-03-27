'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Search } from 'lucide-react'

export default function ReporteKardex() {
  const [rows, setRows]       = useState<any[]>([])
  const [articulos, setArts]  = useState<any[]>([])
  const [almacenes, setAlms]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroArt, setFiltroArt] = useState('')
  const [filtroAlm, setFiltroAlm] = useState('')
  const [filtroDe,  setFiltroDe]  = useState('')
  const [filtroA,   setFiltroA]   = useState('')
  const [artMap, setArtMap]   = useState<Record<number, any>>({})
  const [almMap, setAlmMap]   = useState<Record<number, string>>({})

  useEffect(() => {
    Promise.all([
      dbComp.from('almacenes').select('id, nombre').order('nombre'),
    ]).then(([{ data: alms }]) => {
      const lm: Record<number, string> = {}; (alms ?? []).forEach((a: any) => { lm[a.id] = a.nombre }); setAlmMap(lm)
      setAlms(alms ?? [])
    })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('movimientos_inv').select('*').order('created_at', { ascending: false }).limit(500)
    if (filtroArt) q = q.eq('id_articulo_fk', Number(filtroArt))
    if (filtroAlm) q = q.eq('id_almacen_fk', Number(filtroAlm))
    if (filtroDe)  q = q.gte('created_at', filtroDe + 'T00:00:00')
    if (filtroA)   q = q.lte('created_at', filtroA + 'T23:59:59')
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [filtroArt, filtroAlm, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const fmt  = (n: number | null) => n != null ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
  const fmtN = (n: number | null) => n != null ? n.toLocaleString('es-MX', { maximumFractionDigits: 3 }) : '—'
  const fmtDT = (s: string) => new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

  const tipoColor = (t: string) =>
    t === 'ENTRADA'          ? '#15803d' :
    t === 'TRANSFERENCIA_IN' ? '#2563eb' :
    t === 'TRANSFERENCIA_OUT'? '#d97706' : '#64748b'

  const tipoLabel = (t: string) =>
    t === 'ENTRADA'          ? 'Entrada' :
    t === 'TRANSFERENCIA_IN' ? 'Entrada xfer' :
    t === 'TRANSFERENCIA_OUT'? 'Salida xfer' : t

  const [artSearch,  setArtSearch]  = useState('')
  const [artOptions, setArtOptions] = useState<any[]>([])
  const [artNombre,  setArtNombre]  = useState('')

  const buscarArt = useCallback(async (q: string) => {
    setArtSearch(q)
    if (!q.trim()) { setArtOptions([]); setFiltroArt(''); setArtNombre(''); return }
    if (q.length < 2) { setArtOptions([]); return }
    const { data } = await dbComp.from('articulos')
      .select('id, clave, nombre, unidad').eq('activo', true)
      .or(`clave.ilike.%${q}%,nombre.ilike.%${q}%`)
      .order('nombre').limit(20)
    setArtOptions(data ?? [])
  }, [])

  const seleccionarArt = (art: any) => {
    setFiltroArt(String(art.id))
    setArtNombre(`${art.clave} — ${art.nombre}`)
    setArtSearch(`${art.clave} — ${art.nombre}`)
    setArtOptions([])
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Buscador artículo */}
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', zIndex: 1 }} />
          <input className="input" style={{ paddingLeft: 28 }}
            placeholder="Buscar artículo por clave o nombre…"
            value={artSearch}
            onChange={e => buscarArt(e.target.value)}
          />
          {artOptions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
              {artOptions.map(a => (
                <button key={a.id}
                  onMouseDown={e => { e.preventDefault(); seleccionarArt(a) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', background: 'none', border: 'none',
                    cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)' }}>{a.clave}</span>
                  <span style={{ fontSize: 13, marginLeft: 8 }}>{a.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <select className="select" style={{ minWidth: 180 }} value={filtroAlm} onChange={e => setFiltroAlm(e.target.value)}>
          <option value="">Todos los almacenes</option>
          {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>–</span>
        <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Kardex-Movimientos" count={rows.length} reportTitle="Kardex de Movimientos de Inventario" />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Artículo</th>
              <th>Almacén</th>
              <th>Tipo</th>
              <th>Referencia</th>
              <th style={{ textAlign: 'right' }}>Anterior</th>
              <th style={{ textAlign: 'right' }}>Movimiento</th>
              <th style={{ textAlign: 'right' }}>Saldo</th>
              <th style={{ textAlign: 'right' }}>Precio Unit.</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin movimientos para los filtros seleccionados</td></tr>
            ) : rows.map((r, i) => {
              const art = artMap[r.id_articulo_fk]
              const esEntrada = r.tipo_mov.includes('IN') || r.tipo_mov === 'ENTRADA'
              return (
                <tr key={i}>
                  <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtDT(r.created_at)}</td>
                  <td>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--blue)' }}>{art?.clave ?? '—'}</div>
                    <div style={{ fontSize: 12 }}>{art?.nombre ?? `#${r.id_articulo_fk}`}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{almMap[r.id_almacen_fk] ?? `#${r.id_almacen_fk}`}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      color: tipoColor(r.tipo_mov), background: tipoColor(r.tipo_mov) + '15',
                      border: `1px solid ${tipoColor(r.tipo_mov)}40` }}>
                      {tipoLabel(r.tipo_mov)}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.referencia_folio ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--text-muted)' }}>{fmtN(r.cantidad_antes)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                    color: esEntrada ? '#15803d' : '#d97706' }}>
                    {esEntrada ? '+' : '−'}{fmtN(Math.abs(r.cantidad))}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--blue)' }}>{fmtN(r.cantidad_despues)}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.precio_unitario)}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.usuario ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 500 && (
        <p style={{ fontSize: 12, color: '#d97706', marginTop: 8, textAlign: 'center' }}>
          ⚠ Mostrando los últimos 500 movimientos. Usa los filtros para acotar el resultado.
        </p>
      )}
    </div>
  )
}
