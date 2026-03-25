'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { Search, RefreshCw, Eye, X, ArrowLeft, Warehouse } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha } from '../types'

const TIPO_MOV_COLOR: Record<string, string> = {
  'ENTRADA':          '#15803d',
  'TRANSFERENCIA_IN': '#0891b2',
  'TRANSFERENCIA_OUT':'#d97706',
  'SALIDA':           '#dc2626',
  'AJUSTE':           '#7c3aed',
}

export default function InventarioPage() {
  const router = useRouter()
  const [inventario, setInventario] = useState<any[]>([])
  const [almacenes, setAlmacenes]   = useState<any[]>([])
  const [articulos, setArticulos]   = useState<Record<number, any>>({})
  const [almMap, setAlmMap]         = useState<Record<number, string>>({})
  const [filterAlm, setFilterAlm]   = useState('')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [kardex, setKardex]         = useState<{ art: any; movs: any[] } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('inventario').select('*').order('id_almacen_fk').order('id_articulo_fk')
    if (filterAlm) q = q.eq('id_almacen_fk', Number(filterAlm))
    const { data: inv } = await q
    setInventario(inv ?? [])

    const { data: alms } = await dbComp.from('almacenes').select('*').eq('activo', true).order('clave')
    setAlmacenes(alms ?? [])
    const am: Record<number, string> = {}
    ;(alms ?? []).forEach((a: any) => { am[a.id] = a.nombre })
    setAlmMap(am)

    // Cargar artículos
    const artIds = [...new Set((inv ?? []).map((i: any) => i.id_articulo_fk))]
    if (artIds.length) {
      const { data: arts } = await dbComp.from('articulos').select('id, clave, nombre, unidad, stock_minimo').in('id', artIds)
      const am2: Record<number, any> = {}
      ;(arts ?? []).forEach((a: any) => { am2[a.id] = a })
      setArticulos(am2)
    }
    setLoading(false)
  }, [filterAlm])

  useEffect(() => { fetchData() }, [fetchData])

  const openKardex = async (articuloId: number) => {
    const art = articulos[articuloId]
    const { data: movs } = await dbComp.from('movimientos_inv').select('*')
      .eq('id_articulo_fk', articuloId)
      .order('created_at', { ascending: false }).limit(100)
    setKardex({ art, movs: movs ?? [] })
  }

  const rows = inventario.filter(i => {
    const art = articulos[i.id_articulo_fk]
    if (!art) return true
    return !search || art.nombre.toLowerCase().includes(search.toLowerCase()) || art.clave.toLowerCase().includes(search.toLowerCase())
  })

  // Agrupar por almacén
  const porAlmacen = almacenes.map(alm => ({
    almacen: alm,
    items: rows.filter(i => i.id_almacen_fk === alm.id),
  })).filter(g => g.items.length > 0 || filterAlm === alm.id.toString())

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Inventario</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Saldos por almacén y kardex de movimientos</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar artículo…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ width: 200 }} value={filterAlm}
          onChange={e => setFilterAlm(e.target.value)}>
          <option value="">Todos los almacenes</option>
          {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></div>
      ) : porAlmacen.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin movimientos de inventario registrados. Comienza recibiendo una OC.</div>
      ) : (
        porAlmacen.map(g => (
          <div key={g.almacen.id} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Warehouse size={14} style={{ color: 'var(--blue)' }} />
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>{g.almacen.nombre}</h3>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.almacen.tipo} · {g.almacen.area}</span>
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>Clave</th><th>Artículo</th><th>Unidad</th>
                    <th style={{ textAlign: 'right' }}>Stock Mín.</th>
                    <th style={{ textAlign: 'right' }}>Existencia</th>
                    <th>Alerta</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>Sin artículos</td></tr>
                  ) : g.items.map(item => {
                    const art = articulos[item.id_articulo_fk]
                    const bajominimo = art && item.cantidad <= (art.stock_minimo ?? 0)
                    return (
                      <tr key={item.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{art?.clave ?? '—'}</td>
                        <td style={{ fontWeight: 500 }}>{art?.nombre ?? `Art #${item.id_articulo_fk}`}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{art?.unidad ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{art?.stock_minimo ?? 0}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 14,
                          color: bajominimo ? '#dc2626' : item.cantidad > 0 ? '#15803d' : 'var(--text-muted)' }}>
                          {Number(item.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 3 })}
                        </td>
                        <td>
                          {bajominimo && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                              Bajo Mín.
                            </span>
                          )}
                        </td>
                        <td>
                          <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => openKardex(item.id_articulo_fk)} title="Ver Kardex">
                            <Eye size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Modal Kardex */}
      {kardex && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setKardex(null)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>
                  Kardex — {kardex.art?.clave} · {kardex.art?.nombre}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Últimos 100 movimientos · {kardex.art?.unidad}</div>
              </div>
              <button className="btn-ghost" onClick={() => setKardex(null)}><X size={16} /></button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 'calc(88vh - 80px)' }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Tipo</th><th>Almacén</th>
                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                    <th style={{ textAlign: 'right' }}>Antes</th>
                    <th style={{ textAlign: 'right' }}>Después</th>
                    <th>Referencia</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {kardex.movs.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Sin movimientos</td></tr>
                  ) : kardex.movs.map((m, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(m.created_at).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: (TIPO_MOV_COLOR[m.tipo_mov] ?? '#64748b') + '18', color: TIPO_MOV_COLOR[m.tipo_mov] ?? '#64748b', border: `1px solid ${(TIPO_MOV_COLOR[m.tipo_mov] ?? '#64748b')}30` }}>
                          {m.tipo_mov}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{almMap[m.id_almacen_fk] ?? `#${m.id_almacen_fk}`}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: TIPO_MOV_COLOR[m.tipo_mov] ?? 'inherit' }}>
                        {['TRANSFERENCIA_OUT','SALIDA'].includes(m.tipo_mov) ? '-' : '+'}{m.cantidad}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{m.cantidad_antes ?? 0}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{m.cantidad_despues ?? 0}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{m.referencia_tipo} {m.referencia_folio ? `· ${m.referencia_folio}` : ''}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.usuario ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
