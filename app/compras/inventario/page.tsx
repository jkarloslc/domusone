'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { Search, RefreshCw, Eye, X, ArrowLeft, Warehouse, Plus, Save, Loader } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { fmt, fmtFecha } from '../types'

const TIPO_MOV_COLOR: Record<string, string> = {
  'ENTRADA':          '#15803d',
  'TRANSFERENCIA_IN': '#0891b2',
  'TRANSFERENCIA_OUT':'#d97706',
  'SALIDA':           '#dc2626',
  'AJUSTE':           '#7c3aed',
}

const ROLES_ADMIN = ['superadmin', 'admin']

export default function InventarioPage() {
  const router = useRouter()
  const { authUser } = useAuth()
  const [inventario, setInventario] = useState<any[]>([])
  const [almacenes, setAlmacenes]   = useState<any[]>([])
  const [articulos, setArticulos]   = useState<Record<number, any>>({})
  const [almMap, setAlmMap]         = useState<Record<number, string>>({})
  const [filterAlm, setFilterAlm]   = useState('')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [kardex, setKardex]         = useState<{ art: any; movs: any[] } | null>(null)
  const [movModal, setMovModal]     = useState(false)

  const puedeAgregarMov = ROLES_ADMIN.includes(authUser?.rol ?? '')

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
    const artIds = Array.from(new Set((inv ?? []).map((i: any) => i.id_articulo_fk)))
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
  })).filter(g => g.items.length > 0 || filterAlm === g.almacen.id.toString())

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Inventario</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Saldos por almacén y kardex de movimientos</p>
          </div>
        </div>
        {puedeAgregarMov && (
          <button className="btn-primary" onClick={() => setMovModal(true)}>
            <Plus size={14} /> Agregar Movimiento
          </button>
        )}
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

      {/* Modal Agregar Movimiento */}
      {movModal && (
        <MovimientoModal
          almacenes={almacenes}
          usuario={authUser?.nombre ?? 'Admin'}
          onClose={() => setMovModal(false)}
          onSaved={() => { setMovModal(false); fetchData() }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Agregar Movimiento Manual
// ══════════════════════════════════════════════════════════════
type TipoMov = 'ENTRADA' | 'SALIDA' | 'AJUSTE'

function MovimientoModal({
  almacenes, usuario, onClose, onSaved,
}: {
  almacenes: any[]
  usuario: string
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [articulos, setArticulos]     = useState<any[]>([])
  const [stockActual, setStockActual] = useState<number | null>(null)
  const [loadingStock, setLoadingStock] = useState(false)
  const [artSearch, setArtSearch]     = useState('')
  const [artOpen, setArtOpen]         = useState(false)

  const [form, setForm] = useState({
    tipo_mov:        'AJUSTE' as TipoMov,
    id_almacen_fk:   '',
    id_articulo_fk:  '',
    cantidad:        '',
    costo_unitario:  '',
    referencia_folio:'',
    notas:           '',
  })

  // Cargar catálogo de artículos
  useEffect(() => {
    dbComp.from('articulos').select('id, clave, nombre, unidad').eq('activo', true).order('nombre')
      .then(({ data }) => setArticulos(data ?? []))
  }, [])

  // Leer stock cuando cambia artículo o almacén
  useEffect(() => {
    const artId = Number(form.id_articulo_fk)
    const almId = Number(form.id_almacen_fk)
    if (!artId || !almId) { setStockActual(null); return }
    setLoadingStock(true)
    dbComp.from('inventario').select('cantidad')
      .eq('id_articulo_fk', artId).eq('id_almacen_fk', almId).maybeSingle()
      .then(({ data }) => { setStockActual(data?.cantidad ?? 0); setLoadingStock(false) })
  }, [form.id_articulo_fk, form.id_almacen_fk])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const artSeleccionado = articulos.find(a => a.id === Number(form.id_articulo_fk))

  const handleSave = async () => {
    const artId = Number(form.id_articulo_fk)
    const almId = Number(form.id_almacen_fk)
    const cant  = Number(form.cantidad)

    if (!artId)     { setError('Selecciona un artículo'); return }
    if (!almId)     { setError('Selecciona un almacén'); return }
    if (!cant || cant <= 0) { setError('La cantidad debe ser mayor a cero'); return }

    const cantAntes = stockActual ?? 0

    // SALIDA: validar que haya stock suficiente
    if (form.tipo_mov === 'SALIDA' && cant > cantAntes) {
      setError(`Stock insuficiente. Existencia actual: ${cantAntes} ${artSeleccionado?.unidad ?? ''}`); return
    }

    setSaving(true); setError('')

    // Calcular nuevo stock según tipo
    let cantDespues: number
    if (form.tipo_mov === 'ENTRADA')     cantDespues = cantAntes + cant
    else if (form.tipo_mov === 'SALIDA') cantDespues = cantAntes - cant
    else                                  cantDespues = cant  // AJUSTE: valor absoluto

    const cantMovimiento = form.tipo_mov === 'AJUSTE'
      ? Math.abs(cantDespues - cantAntes)   // cantidad del ajuste = diferencia
      : cant

    // Upsert inventario
    const costoUnitario = Number(form.costo_unitario) || null
    const { data: stockRow } = await dbComp.from('inventario').select('id')
      .eq('id_articulo_fk', artId).eq('id_almacen_fk', almId).maybeSingle()

    // Payload de costo: solo se actualiza en ENTRADA (costo última compra)
    const costoPayload = form.tipo_mov === 'ENTRADA' && costoUnitario
      ? { costo_promedio: costoUnitario }
      : {}

    if (stockRow) {
      const { error: upErr } = await dbComp.from('inventario')
        .update({ cantidad: cantDespues, ...costoPayload }).eq('id', stockRow.id)
      if (upErr) { setError(upErr.message); setSaving(false); return }
    } else {
      const { error: insErr } = await dbComp.from('inventario').insert({
        id_articulo_fk:  artId,
        id_almacen_fk:   almId,
        cantidad:         cantDespues,
        costo_promedio:   costoUnitario ?? 0,
      })
      if (insErr) { setError(insErr.message); setSaving(false); return }
    }

    // Registrar movimiento
    const { error: movErr } = await dbComp.from('movimientos_inv').insert({
      id_articulo_fk:   artId,
      id_almacen_fk:    almId,
      tipo_mov:          form.tipo_mov,
      cantidad:          cantMovimiento,
      cantidad_antes:    cantAntes,
      cantidad_despues:  cantDespues,
      referencia_tipo:   'MANUAL',
      referencia_folio:  form.referencia_folio.trim() || null,
      usuario:           usuario,
    })
    if (movErr) { setError(movErr.message); setSaving(false); return }

    setSaving(false); onSaved()
  }

  const tipoConfig: Record<TipoMov, { label: string; color: string; bg: string; desc: string }> = {
    ENTRADA: { label: 'Entrada',  color: '#15803d', bg: '#f0fdf4', desc: 'Suma al stock existente' },
    SALIDA:  { label: 'Salida',   color: '#dc2626', bg: '#fef2f2', desc: 'Resta del stock existente (entrega, uso, merma)' },
    AJUSTE:  { label: 'Ajuste',   color: '#7c3aed', bg: '#faf5ff', desc: 'Corrige el stock a un valor específico (inventario físico)' },
  }
  const tc = tipoConfig[form.tipo_mov]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Agregar Movimiento de Inventario</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Tipo de movimiento */}
          <div>
            <label className="label">Tipo de movimiento *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 4 }}>
              {(Object.keys(tipoConfig) as TipoMov[]).map(tipo => {
                const cfg = tipoConfig[tipo]
                const active = form.tipo_mov === tipo
                return (
                  <button key={tipo} type="button"
                    onClick={() => setForm(f => ({ ...f, tipo_mov: tipo }))}
                    style={{ padding: '10px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                      border: `2px solid ${active ? cfg.color : '#e2e8f0'}`,
                      background: active ? cfg.bg : 'var(--bg)',
                      transition: 'all 0.15s' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: active ? cfg.color : 'var(--text-primary)', marginBottom: 2 }}>
                      {cfg.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>{cfg.desc}</div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Almacén y Artículo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Almacén *</label>
              <select className="select" value={form.id_almacen_fk} onChange={setF('id_almacen_fk')}>
                <option value="">— Seleccionar —</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <label className="label">Artículo *</label>
              <input
                className="input"
                placeholder="Buscar clave o nombre…"
                value={artSearch}
                autoComplete="off"
                onChange={e => {
                  setArtSearch(e.target.value)
                  setArtOpen(true)
                  // Si el usuario borra el texto, limpia la selección
                  if (!e.target.value) setForm(f => ({ ...f, id_articulo_fk: '' }))
                }}
                onFocus={() => setArtOpen(true)}
                onBlur={() => setTimeout(() => setArtOpen(false), 150)}
              />
              {artOpen && (() => {
                const q = artSearch.toLowerCase()
                const filtered = articulos.filter(a =>
                  a.clave?.toLowerCase().includes(q) || a.nombre?.toLowerCase().includes(q)
                ).slice(0, 40)
                return filtered.length > 0 ? (
                  <ul style={{
                    position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 8, maxHeight: 220, overflowY: 'auto',
                    margin: 0, padding: 0, listStyle: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.12)'
                  }}>
                    {filtered.map(a => (
                      <li key={a.id}
                        onMouseDown={() => {
                          setForm(f => ({ ...f, id_articulo_fk: String(a.id) }))
                          setArtSearch(`${a.clave} · ${a.nombre}`)
                          setArtOpen(false)
                        }}
                        style={{
                          padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                          borderBottom: '1px solid var(--border)',
                          background: form.id_articulo_fk === String(a.id) ? 'var(--bg-muted)' : undefined,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
                        onMouseLeave={e => (e.currentTarget.style.background = form.id_articulo_fk === String(a.id) ? 'var(--bg-muted)' : '')}
                      >
                        <span style={{ fontWeight: 600 }}>{a.clave}</span>
                        <span style={{ color: 'var(--text-secondary)' }}> · {a.nombre}</span>
                      </li>
                    ))}
                  </ul>
                ) : null
              })()}
            </div>
          </div>

          {/* Stock actual */}
          {form.id_articulo_fk && form.id_almacen_fk && (
            <div style={{ padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Stock actual — {artSeleccionado?.nombre}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                color: stockActual !== null && stockActual > 0 ? '#15803d' : 'var(--text-muted)' }}>
                {loadingStock ? '…' : `${stockActual ?? 0} ${artSeleccionado?.unidad ?? ''}`}
              </span>
            </div>
          )}

          {/* Cantidad */}
          <div>
            <label className="label">
              {form.tipo_mov === 'AJUSTE' ? 'Nueva existencia (valor absoluto) *' : 'Cantidad *'}
            </label>
            <input className="input" type="number" min="0" step="0.001"
              value={form.cantidad} onChange={setF('cantidad')}
              placeholder={form.tipo_mov === 'AJUSTE' ? 'ej. 50 (el stock quedará en este valor)' : 'ej. 10'}
            />
            {form.tipo_mov === 'AJUSTE' && form.cantidad && stockActual !== null && (
              <p style={{ fontSize: 11, color: '#7c3aed', marginTop: 4 }}>
                Ajuste: {stockActual} → {form.cantidad} {artSeleccionado?.unidad ?? ''}
                &nbsp;({Number(form.cantidad) >= stockActual ? '+' : ''}{(Number(form.cantidad) - stockActual).toFixed(3)})
              </p>
            )}
          </div>

          {/* Costo unitario — solo en ENTRADA */}
          {form.tipo_mov === 'ENTRADA' && (
            <div>
              <label className="label">Costo unitario (última compra)</label>
              <input className="input" type="number" min="0" step="0.01"
                value={form.costo_unitario} onChange={setF('costo_unitario')}
                placeholder="ej. 45.50" />
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                Se registra como costo de última compra del artículo en este almacén.
              </p>
            </div>
          )}

          {/* Referencia y notas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Folio / Referencia</label>
              <input className="input" value={form.referencia_folio} onChange={setF('referencia_folio')}
                placeholder="ej. INV-2026-04" />
            </div>
            <div>
              <label className="label">Notas</label>
              <input className="input" value={form.notas} onChange={setF('notas')}
                placeholder="ej. Inventario físico abril" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}
            style={{ background: tc.color, borderColor: tc.color }}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            Registrar {tc.label}
          </button>
        </div>
      </div>
    </div>
  )
}
