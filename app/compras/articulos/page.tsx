'use client'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, Edit2, X, Save, Loader,
  Package, ArrowLeft, AlertTriangle, Filter
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type Articulo, fmt, UNIDADES, CATEGORIAS_ART } from '../types'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 50

export default function ArticulosPage() {
  const { canWrite, canDelete } = useAuth()
  const router = useRouter()
  const [rows, setRows]         = useState<Articulo[]>([])
  const [inventario, setInv]    = useState<Record<number, number>>({})  // articuloId → saldo total
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterCat, setFilterCat] = useState('')
  const [filterAlerta, setFilterAlerta] = useState(false)
  const [modal, setModal]       = useState<Articulo | null | 'new'>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('articulos').select('*', { count: 'exact' }).order('nombre')
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (debouncedSearch) q = q.or(`clave.ilike.%${debouncedSearch}%,nombre.ilike.%${debouncedSearch}%,descripcion.ilike.%${debouncedSearch}%`)
    if (filterCat)       q = q.eq('categoria', filterCat)
    const { data, count } = await q
    const arts = (data as Articulo[] ?? [])
    setRows(arts); setTotal(count ?? 0)

    // Cargar saldos de inventario (suma por artículo, todos los almacenes)
    if (arts.length) {
      const ids = arts.map(a => a.id)
      const { data: inv } = await dbComp.from('inventario')
        .select('id_articulo_fk, cantidad').in('id_articulo_fk', ids)
      const saldos: Record<number, number> = {}
      ;(inv ?? []).forEach((i: any) => {
        saldos[i.id_articulo_fk] = (saldos[i.id_articulo_fk] ?? 0) + Number(i.cantidad)
      })
      setInv(saldos)
    }
    setLoading(false)
  }, [page, debouncedSearch, filterCat])

  useEffect(() => { fetchData() }, [fetchData])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [debouncedSearch, filterCat])

  const rowsFiltradas = filterAlerta
    ? rows.filter(r => (inventario[r.id] ?? 0) <= (r.stock_minimo ?? 0))
    : rows

  const alertas = rows.filter(r => (inventario[r.id] ?? 0) <= (r.stock_minimo ?? 0)).length

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Artículos</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Catálogo maestro · {total} registros</p>
          </div>
        </div>
        {canWrite('articulos') && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nuevo Artículo</button>}
      </div>

      {/* Stats rápidas */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div className="card" style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Package size={14} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 13 }}><strong style={{ color: 'var(--blue)' }}>{total}</strong> artículos</span>
        </div>
        {alertas > 0 && (
          <button
            className="card"
            onClick={() => setFilterAlerta(f => !f)}
            style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              background: filterAlerta ? '#fef2f2' : undefined,
              border: filterAlerta ? '1px solid #fecaca' : undefined }}>
            <AlertTriangle size={14} style={{ color: '#dc2626' }} />
            <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
              {alertas} bajo stock mínimo
            </span>
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar clave, nombre, descripción…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ position: 'relative' }}>
          <Filter size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <select className="select" style={{ paddingLeft: 28, minWidth: 170 }}
            value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS_ART.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Clave</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th style={{ textAlign: 'center' }}>Unidad</th>
              <th style={{ textAlign: 'right' }}>Stock Mín.</th>
              <th style={{ textAlign: 'right' }}>Existencia</th>
              <th style={{ textAlign: 'right' }}>Precio Ref.</th>
              <th>Status</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rowsFiltradas.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                {filterAlerta ? 'Sin artículos bajo stock mínimo' : 'Sin artículos registrados'}
              </td></tr>
            ) : rowsFiltradas.map(r => {
              const saldo     = inventario[r.id] ?? 0
              const bajoMin   = saldo <= (r.stock_minimo ?? 0)
              const sinStock  = saldo === 0
              return (
                <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.4 }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {r.clave}
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{r.nombre}</div>
                    {r.descripcion && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                        {r.descripcion}
                      </div>
                    )}
                  </td>
                  <td>
                    {r.categoria ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20,
                        background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                        {r.categoria}
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {r.unidad}
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.stock_minimo ?? 0}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      {bajoMin && r.activo && (
                        <AlertTriangle size={12} style={{ color: sinStock ? '#dc2626' : '#d97706', flexShrink: 0 }} />
                      )}
                      <span style={{
                        fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 14,
                        color: sinStock && r.activo ? '#dc2626' : bajoMin && r.activo ? '#d97706' : '#15803d'
                      }}>
                        {Number(saldo).toLocaleString('es-MX', { maximumFractionDigits: 3 })}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.precio_ref ? fmt(r.precio_ref) : '—'}
                  </td>
                  <td>
                    <span className={`badge ${r.activo ? 'badge-vendido' : 'badge-default'}`}>
                      {r.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(r)}>
                      <Edit2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* Paginación */}
        {total > PAGE_SIZE && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Pág. {page + 1} de {Math.ceil(total / PAGE_SIZE)} · {total} artículos
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                disabled={page === 0} onClick={() => setPage(0)}>«</button>
              <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Ant</button>
              <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                disabled={page >= Math.ceil(total / PAGE_SIZE) - 1} onClick={() => setPage(p => p + 1)}>Sig ›</button>
              <button className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                disabled={page >= Math.ceil(total / PAGE_SIZE) - 1} onClick={() => setPage(Math.ceil(total / PAGE_SIZE) - 1)}>»</button>
            </div>
          </div>
        )}
      </div>

      {modal !== null && (
        <ArticuloModal
          row={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Modal
// ════════════════════════════════════════════════════════════
function ArticuloModal({ row, onClose, onSaved }: { row: Articulo | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [tab, setTab]       = useState<'datos'|'inventario'>('datos')
  const [invPorAlmacen, setInvPorAlmacen] = useState<any[]>([])

  const [form, setForm] = useState({
    clave:        row?.clave        ?? '',
    nombre:       row?.nombre       ?? '',
    descripcion:  row?.descripcion  ?? '',
    unidad:       row?.unidad       ?? 'PZA',
    categoria:    row?.categoria    ?? '',
    stock_minimo: row?.stock_minimo?.toString() ?? '0',
    stock_maximo: row?.stock_maximo?.toString() ?? '',
    precio_ref:   row?.precio_ref?.toString()   ?? '',
    activo:       row?.activo       ?? true,
  })

  useEffect(() => {
    if (!isNew && row?.id) {
      // Cargar saldo por almacén
      dbComp.from('inventario').select('*, almacenes(nombre)')
        .eq('id_articulo_fk', row.id)
        .then(async ({ data }) => {
          const rows = data ?? []
          // Cargar nombres de almacenes por separado (cross-schema no aplica aquí, ambos en comp)
          setInvPorAlmacen(rows)
        })
    }
  }, [row?.id, isNew])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.clave.trim() || !form.nombre.trim()) { setError('Clave y Nombre son obligatorios'); return }
    setSaving(true); setError('')
    const payload = {
      clave:        form.clave.trim().toUpperCase(),
      nombre:       form.nombre.trim(),
      descripcion:  form.descripcion.trim() || null,
      unidad:       form.unidad,
      categoria:    form.categoria || null,
      stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : 0,
      stock_maximo: form.stock_maximo ? Number(form.stock_maximo) : null,
      precio_ref:   form.precio_ref   ? Number(form.precio_ref)   : null,
      activo:       form.activo,
    }
    const { error: err } = isNew
      ? await dbComp.from('articulos').insert(payload)
      : await dbComp.from('articulos').update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const saldoTotal = invPorAlmacen.reduce((a, i) => a + Number(i.cantidad ?? 0), 0)

  return (
    <ModalShell modulo="articulos" titulo={isNew ? 'Nuevo Artículo' : row.nombre} onClose={onClose} maxWidth={540}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        {(tab === 'datos' || isNew) && (
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
        )}
      </>}
    >

        {/* Tabs (solo en edición) */}
        {!isNew && (
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
            {[
              { key: 'datos',      label: 'Datos' },
              { key: 'inventario', label: `Inventario ${invPorAlmacen.length ? `(${saldoTotal.toLocaleString('es-MX', { maximumFractionDigits: 3 })})` : ''}` },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: tab === t.key ? 600 : 400,
                  color: tab === t.key ? 'var(--blue)' : 'var(--text-muted)',
                  borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* Tab Datos */}
          {(tab === 'datos' || isNew) && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10 }}>
                <div>
                  <label className="label">Clave *</label>
                  <input className="input" value={form.clave} onChange={set('clave')} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label className="label">Nombre *</label>
                  <input className="input" value={form.nombre} onChange={set('nombre')} />
                </div>
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input" rows={2} value={form.descripcion} onChange={set('descripcion')} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Unidad de Medida</label>
                  <select className="select" value={form.unidad} onChange={set('unidad')}>
                    {UNIDADES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Categoría</label>
                  <select className="select" value={form.categoria} onChange={set('categoria')}>
                    <option value="">— Sin categoría —</option>
                    {CATEGORIAS_ART.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Stock Mínimo</label>
                  <input className="input" type="number" step="0.001" min="0" value={form.stock_minimo} onChange={set('stock_minimo')} style={{ textAlign: 'right' }} />
                </div>
                <div>
                  <label className="label">Stock Máximo</label>
                  <input className="input" type="number" step="0.001" min="0" value={form.stock_maximo} onChange={set('stock_maximo')} style={{ textAlign: 'right' }} placeholder="—" />
                </div>
                <div>
                  <label className="label">Precio Referencia</label>
                  <input className="input" type="number" step="0.01" min="0" value={form.precio_ref} onChange={set('precio_ref')} style={{ textAlign: 'right' }} placeholder="$0.00" />
                </div>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="select" value={form.activo ? 'true' : 'false'}
                  onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            </>
          )}

          {/* Tab Inventario */}
          {tab === 'inventario' && !isNew && (
            <div>
              <div style={{ padding: '12px 16px', background: 'var(--blue-pale)', border: '1px solid #bfdbfe', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Existencia total</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>
                  {saldoTotal.toLocaleString('es-MX', { maximumFractionDigits: 3 })} {row.unidad}
                </span>
              </div>
              {invPorAlmacen.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  Sin existencia en ningún almacén
                </div>
              ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Almacén</th>
                        <th style={{ textAlign: 'right' }}>Existencia</th>
                        <th>Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invPorAlmacen.map((i, idx) => {
                        const bajoMin = Number(i.cantidad) <= (row.stock_minimo ?? 0)
                        return (
                          <tr key={idx}>
                            <td style={{ fontSize: 13 }}>
                              {(i.almacenes as any)?.nombre ?? `Almacén #${i.id_almacen_fk}`}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                              color: Number(i.cantidad) === 0 ? '#dc2626' : bajoMin ? '#d97706' : '#15803d', fontSize: 14 }}>
                              {Number(i.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 3 })}
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.unidad}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                Los movimientos de inventario se generan desde Recepciones y Transferencias.
              </div>
            </div>
          )}
        </div>

    </ModalShell>
  )
}