'use client'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { dbCtrl, dbComp } from '@/lib/supabase'
import { useDebounce } from '@/lib/useDebounce'
import ModalShell from '@/components/ui/ModalShell'
import {
  Plus, Search, RefreshCw, Edit2, Trash2, Loader, Save, X,
  ClipboardList, Boxes,
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Categoria = { id: number; codigo: string; nombre: string; orden: number; activo: boolean }

type ConceptoRow = {
  id: number; id_categoria_fk: number | null; codigo: string; descripcion: string; unidad: string
  factor_indirectos: number; costo_directo: number; pu_venta: number
  rango_min: number | null; rango_max: number | null
  fuente_referencia: string | null; observaciones: string | null
  activo: boolean; created_at: string
}

type TipoInsumoBase = 'mano_obra' | 'material' | 'equipo'
type TipoMatriz = TipoInsumoBase | 'herramienta_menor'

type InsumoBase = {
  id: number; codigo: string; descripcion: string; unidad: string
  costo: number; tipo: TipoInsumoBase; id_articulo_fk: number | null; activo: boolean
}

type ConceptoInsumoRow = {
  id: number; id_concepto_fk: number; tipo: TipoMatriz; id_insumo_fk: number | null
  descripcion: string; unidad: string | null; cantidad: number; costo_unitario: number
  importe: number; orden: number
}

// ── Constantes ────────────────────────────────────────────────────────────────
const UNIDADES = [
  'm²', 'm³', 'ml', 'km', 'm', 'cm', 'pza', 'kg', 'ton', 'jor', 'hr',
  'lt', 'L', 'día', 'gl', 'jgo', 'serv', 'trip', 'lote', 'viaje', 'cajón', '%', 'm²/mes',
]

const TIPO_COLOR: Record<TipoMatriz, { bg: string; color: string; label: string }> = {
  mano_obra:         { bg: '#ede9fe', color: '#7c3aed', label: 'Mano de Obra' },
  material:          { bg: '#dbeafe', color: '#1d4ed8', label: 'Material' },
  equipo:            { bg: '#dcfce7', color: '#15803d', label: 'Equipo' },
  herramienta_menor: { bg: '#fef3c7', color: '#d97706', label: 'Herramienta Menor' },
}

const fmt  = (v: number | null | undefined) => v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtC = (v: number | null | undefined) => v != null ? v.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—'
const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`

const PAGE_SIZE = 20

// ═════════════════════════════════════════════════════════════════════════════
// Página principal
// ═════════════════════════════════════════════════════════════════════════════
export default function ConceptosPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('mantenimiento')

  const [tab, setTab] = useState<'conceptos' | 'insumos'>('conceptos')

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [conceptos, setConceptos]   = useState<ConceptoRow[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [loading, setLoading]       = useState(true)

  const [search, setSearch]           = useState('')
  const dSearch                       = useDebounce(search, 300)
  const [filterCategoria, setFilterCategoria] = useState('')

  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState<ConceptoRow | null>(null)

  const fetchCategorias = useCallback(async () => {
    const { data } = await dbCtrl.from('mant_conceptos_categorias').select('*').eq('activo', true).order('orden')
    setCategorias((data ?? []) as Categoria[])
  }, [])

  const fetchConceptos = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('mant_conceptos').select('*', { count: 'exact' })
      .order('codigo')
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (dSearch) q = q.or(`codigo.ilike.%${dSearch}%,descripcion.ilike.%${dSearch}%`)
    if (filterCategoria) q = q.eq('id_categoria_fk', Number(filterCategoria))
    const { data, count, error } = await q
    if (!error) { setConceptos(data as ConceptoRow[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, dSearch, filterCategoria])

  useEffect(() => { fetchCategorias() }, [fetchCategorias])
  useEffect(() => { fetchConceptos() }, [fetchConceptos])
  useEffect(() => { setPage(0) }, [dSearch, filterCategoria])

  const handleDelete = async (c: ConceptoRow) => {
    if (!confirm(`¿Eliminar el concepto "${c.codigo}"? Se eliminará su matriz de precios unitarios.`)) return
    await dbCtrl.from('mant_conceptos').delete().eq('id', c.id)
    fetchConceptos()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const catMap = Object.fromEntries(categorias.map(c => [c.id, c]))
  const promedioVenta = conceptos.length ? conceptos.reduce((s, c) => s + (c.pu_venta ?? 0), 0) / conceptos.length : 0

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <ClipboardList size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Mantenimiento</span>
          </div>
          <h1 className="page-title-xl">Catálogo de Conceptos</h1>
          <p className="page-subtitle">Conceptos de obra/mantenimiento con su matriz de precios unitarios y explosión de insumos</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        {([
          { key: 'conceptos', label: 'Conceptos', icon: <ClipboardList size={13} /> },
          { key: 'insumos',   label: 'Insumos Base', icon: <Boxes size={13} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -1 }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'insumos' ? (
        <InsumosBaseTab puedeEscribir={puedeEscribir} puedeEliminar={canDelete()} />
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <div className="card" style={{ padding: '12px 18px', minWidth: 140 }}>
              <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontWeight: 700 }}>{total}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Total conceptos</div>
            </div>
            <div className="card" style={{ padding: '12px 18px', minWidth: 140 }}>
              <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontWeight: 700 }}>{categorias.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Categorías</div>
            </div>
            <div className="card" style={{ padding: '12px 18px', minWidth: 200 }}>
              <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: 'var(--blue)', fontWeight: 700 }}>{fmt(promedioVenta)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>PU venta promedio (página)</div>
            </div>
          </div>

          {/* Filtros + acciones */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="input" style={{ paddingLeft: 28, width: 240 }} placeholder="Buscar código, descripción…"
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="select" style={{ width: 220 }} value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo}. {c.nombre}</option>)}
              </select>
              <button className="btn-ghost" onClick={fetchConceptos} title="Actualizar">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            {puedeEscribir && (
              <button className="btn-primary" onClick={() => { setEditing(null); setModal(true) }}>
                <Plus size={14} /> Nuevo Concepto
              </button>
            )}
          </div>

          {/* Tabla */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'left', minWidth: 220 }}>Concepto</th>
                  <th>Unidad</th>
                  <th style={{ textAlign: 'right' }}>Costo Directo</th>
                  <th style={{ textAlign: 'right' }}>PU Venta</th>
                  <th style={{ width: 72 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
                  : conceptos.length === 0
                    ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 56, color: 'var(--text-muted)' }}>Sin conceptos registrados</td></tr>
                    : conceptos.map(c => (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => { setEditing(c); setModal(true) }}>
                        <td style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.codigo}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {c.id_categoria_fk ? catMap[c.id_categoria_fk]?.codigo ?? '—' : '—'}
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{c.descripcion.slice(0, 90)}{c.descripcion.length > 90 ? '…' : ''}</div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.unidad}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{fmt(c.costo_directo)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 13, color: '#0f766e' }}>{fmt(c.pu_venta)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                            {puedeEscribir && (
                              <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(c); setModal(true) }} title="Editar">
                                <Edit2 size={13} />
                              </button>
                            )}
                            {canDelete() && (
                              <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(c)} title="Eliminar">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page + 1} de {totalPages} · {total} registros</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
                  <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {modal && (
        <ConceptoModal
          concepto={editing}
          categorias={categorias}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchConceptos() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de Concepto (Generales + Matriz PU)
// ─────────────────────────────────────────────────────────────────────────────
function ConceptoModal({ concepto, categorias, onClose, onSaved }: {
  concepto: ConceptoRow | null; categorias: Categoria[]
  onClose: () => void; onSaved: () => void
}) {
  const isNew = !concepto
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('mantenimiento')

  const [tab, setTab] = useState<'generales' | 'matriz'>('generales')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [form, setForm] = useState({
    id_categoria_fk:   concepto?.id_categoria_fk?.toString() ?? '',
    codigo:            concepto?.codigo            ?? '',
    descripcion:       concepto?.descripcion       ?? '',
    unidad:            concepto?.unidad            ?? 'm²',
    factor_indirectos: concepto ? String(concepto.factor_indirectos) : '0.28',
    rango_min:         concepto?.rango_min?.toString() ?? '',
    rango_max:         concepto?.rango_max?.toString() ?? '',
    fuente_referencia: concepto?.fuente_referencia ?? '',
    observaciones:     concepto?.observaciones     ?? '',
  })

  const [conceptoId, setConceptoId] = useState<number | null>(concepto?.id ?? null)
  const [totales, setTotales] = useState({ costo_directo: concepto?.costo_directo ?? 0, pu_venta: concepto?.pu_venta ?? 0 })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSaveGenerales = async () => {
    if (!form.codigo.trim() || !form.descripcion.trim()) { setError('Código y descripción son obligatorios'); return }
    setSaving(true); setError('')

    const payload = {
      id_categoria_fk:   form.id_categoria_fk ? Number(form.id_categoria_fk) : null,
      codigo:            form.codigo.trim().toUpperCase(),
      descripcion:       form.descripcion.trim(),
      unidad:            form.unidad,
      factor_indirectos: Number(form.factor_indirectos) || 0,
      rango_min:         form.rango_min ? Number(form.rango_min) : null,
      rango_max:         form.rango_max ? Number(form.rango_max) : null,
      fuente_referencia: form.fuente_referencia.trim() || null,
      observaciones:     form.observaciones.trim() || null,
    }

    if (isNew) {
      const { data, error: err } = await dbCtrl.from('mant_conceptos').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setConceptoId((data as ConceptoRow).id)
      setTab('matriz')
    } else {
      const { error: err } = await dbCtrl.from('mant_conceptos').update(payload).eq('id', concepto!.id)
      if (err) { setError(err.message); setSaving(false); return }
      // El factor de indirectos pudo cambiar: recalcular PU venta con el costo directo actual
      const pu_venta = totales.costo_directo * (1 + (Number(form.factor_indirectos) || 0))
      await dbCtrl.from('mant_conceptos').update({ pu_venta }).eq('id', concepto!.id)
      setTotales(t => ({ ...t, pu_venta }))
    }
    setSaving(false)
  }

  const TABS = [
    { id: 'generales', label: 'Generales' },
    { id: 'matriz',    label: 'Matriz PU / Insumos' },
  ] as const

  return (
    <ModalShell
      modulo="mantenimiento"
      titulo={isNew ? 'Nuevo Concepto' : `${concepto!.codigo} — ${concepto!.descripcion.slice(0, 40)}`}
      onClose={onSaved}
      maxWidth={1000}
      footer={
        tab === 'generales' ? (
          <>
            <button className="btn-secondary" onClick={onSaved}>Cerrar</button>
            {puedeEscribir && (
              <button className="btn-primary" onClick={handleSaveGenerales} disabled={saving}>
                {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                {isNew ? 'Guardar y continuar' : 'Guardar'}
              </button>
            )}
          </>
        ) : (
          <button className="btn-secondary" onClick={onSaved}>Cerrar</button>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              disabled={t.id !== 'generales' && !conceptoId}
              style={{
                padding: '11px 16px', background: 'none', border: 'none', cursor: t.id !== 'generales' && !conceptoId ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? 'var(--blue)' : 'var(--text-muted)',
                borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
                marginBottom: -1, opacity: t.id !== 'generales' && !conceptoId ? 0.4 : 1,
              }}>
              {t.label}
            </button>
          ))}
          {conceptoId && (
            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              CD: <strong>{fmt(totales.costo_directo)}</strong> · PU Venta: <strong style={{ color: '#0f766e' }}>{fmt(totales.pu_venta)}</strong>
            </span>
          )}
        </div>

        {tab === 'generales' && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            {error && (
              <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
              <div><label className="label">Código *</label><input className="input" value={form.codigo} onChange={set('codigo')} placeholder="JAR-001" autoFocus /></div>
              <div><label className="label">Concepto *</label><input className="input" value={form.descripcion} onChange={set('descripcion')} placeholder="Descripción del concepto de obra/mantenimiento" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Categoría</label>
                <select className="select" value={form.id_categoria_fk} onChange={set('id_categoria_fk')}>
                  <option value="">— Sin categoría —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.codigo}. {c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Unidad</label>
                <select className="select" value={form.unidad} onChange={set('unidad')}>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Factor indirectos+utilidad</label>
                <input className="input" type="number" step="0.01" value={form.factor_indirectos} onChange={set('factor_indirectos')} placeholder="0.28" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label className="label">Rango de referencia — mínimo</label><input className="input" type="number" value={form.rango_min} onChange={set('rango_min')} /></div>
              <div><label className="label">Rango de referencia — máximo</label><input className="input" type="number" value={form.rango_max} onChange={set('rango_max')} /></div>
            </div>
            <div><label className="label">Fuente de referencia</label><input className="input" value={form.fuente_referencia} onChange={set('fuente_referencia')} placeholder="Ej. Tabulador SICT 2025, mercado Bajío…" /></div>
            <div>
              <label className="label">Observaciones</label>
              <textarea className="input" rows={3} value={form.observaciones} onChange={set('observaciones')} style={{ resize: 'vertical' }} />
            </div>
          </div>
        )}

        {tab === 'matriz' && conceptoId && (
          <MatrizPUPanel
            conceptoId={conceptoId}
            factorIndirectos={Number(form.factor_indirectos) || 0}
            puedeEscribir={puedeEscribir}
            onTotalesChange={setTotales}
          />
        )}
      </div>
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Matriz de Precios Unitarios (APU) de un concepto
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_ITEM = {
  tipo: 'mano_obra' as TipoMatriz, id_insumo_fk: null as number | null,
  descripcion: '', unidad: 'jor', cantidad: '', costo_unitario: '', search: '',
}

function MatrizPUPanel({ conceptoId, factorIndirectos, puedeEscribir, onTotalesChange }: {
  conceptoId: number; factorIndirectos: number; puedeEscribir: boolean
  onTotalesChange: (t: { costo_directo: number; pu_venta: number }) => void
}) {
  const [items, setItems]     = useState<ConceptoInsumoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(EMPTY_ITEM)
  const [saving, setSaving]   = useState(false)
  const [results, setResults] = useState<InsumoBase[]>([])
  const [searching, setSearching] = useState(false)
  const dSearch = useDebounce(form.search, 250)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCtrl.from('mant_conceptos_insumos').select('*').eq('id_concepto_fk', conceptoId).order('tipo').order('orden').order('id')
    setItems((data ?? []) as ConceptoInsumoRow[])
    setLoading(false)
  }, [conceptoId])

  useEffect(() => { load() }, [load])

  // Recalcula costo_directo/pu_venta del concepto a partir de los insumos actuales
  const recalcConcepto = useCallback(async (list: ConceptoInsumoRow[]) => {
    const costo_directo = list.reduce((s, i) => s + (i.importe ?? 0), 0)
    const pu_venta = costo_directo * (1 + factorIndirectos)
    await dbCtrl.from('mant_conceptos').update({ costo_directo, pu_venta }).eq('id', conceptoId)
    onTotalesChange({ costo_directo, pu_venta })
  }, [conceptoId, factorIndirectos, onTotalesChange])

  useEffect(() => { if (!loading) recalcConcepto(items) }, [items, loading, recalcConcepto])

  const manoObraSubtotal = items.filter(i => i.tipo === 'mano_obra').reduce((s, i) => s + (i.importe ?? 0), 0)

  // Recalcula en automático el costo unitario de las filas "herramienta menor"
  // en cuanto el subtotal de mano de obra vigente cambia (agregar/quitar M.O.)
  useEffect(() => {
    if (loading) return
    const desalineadas = items.filter(i => i.tipo === 'herramienta_menor' && Math.abs(i.costo_unitario - manoObraSubtotal) > 0.0001)
    if (desalineadas.length === 0) return
    let cancelled = false
    ;(async () => {
      await Promise.all(desalineadas.map(i => dbCtrl.from('mant_conceptos_insumos').update({ costo_unitario: manoObraSubtotal }).eq('id', i.id)))
      if (!cancelled) await load()
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, loading])

  // Búsqueda en catálogo de insumos base (según tipo, excepto herramienta_menor)
  useEffect(() => {
    if (form.tipo === 'herramienta_menor' || dSearch.length < 2) { setResults([]); return }
    setSearching(true)
    dbCtrl.from('mant_insumos').select('*').eq('activo', true).eq('tipo', form.tipo)
      .or(`descripcion.ilike.%${dSearch}%,codigo.ilike.%${dSearch}%`).limit(8)
      .then(({ data }) => { setResults((data ?? []) as InsumoBase[]); setSearching(false) })
  }, [dSearch, form.tipo])

  const selectResult = (r: InsumoBase) => {
    setForm(f => ({ ...f, id_insumo_fk: r.id, descripcion: `${r.codigo} · ${r.descripcion}`, unidad: r.unidad, costo_unitario: String(r.costo), search: `${r.codigo} · ${r.descripcion}` }))
    setResults([])
  }

  const usarSubtotalMO = () => setForm(f => ({ ...f, costo_unitario: String(manoObraSubtotal) }))

  const addItem = async () => {
    if (!form.descripcion.trim() || !form.cantidad || !form.costo_unitario) return
    setSaving(true)
    await dbCtrl.from('mant_conceptos_insumos').insert({
      id_concepto_fk: conceptoId,
      tipo:           form.tipo,
      id_insumo_fk:   form.tipo === 'herramienta_menor' ? null : form.id_insumo_fk,
      descripcion:    form.descripcion.trim(),
      unidad:         form.unidad || null,
      cantidad:       Number(form.cantidad),
      costo_unitario: Number(form.costo_unitario),
      orden:          items.length,
    })
    setForm({ ...EMPTY_ITEM, tipo: form.tipo })
    await load()
    setSaving(false)
  }

  const deleteItem = async (id: number) => {
    await dbCtrl.from('mant_conceptos_insumos').delete().eq('id', id)
    await load()
  }

  const byTipo = (t: TipoMatriz) => items.filter(i => i.tipo === t)
  const costoDirecto = items.reduce((s, i) => s + (i.importe ?? 0), 0)
  const indirectos = costoDirecto * factorIndirectos
  const puVenta = costoDirecto + indirectos

  const selectTipo = (t: TipoMatriz) => {
    if (t === 'herramienta_menor') {
      setForm({ ...EMPTY_ITEM, tipo: t, descripcion: 'Herramienta menor (% sobre mano de obra)', unidad: '%', cantidad: '0.03', costo_unitario: String(manoObraSubtotal), search: '' })
    } else {
      setForm({ ...EMPTY_ITEM, tipo: t, unidad: t === 'mano_obra' ? 'jor' : t === 'equipo' ? 'hr' : 'pza' })
    }
  }

  return (
    <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}><RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} /></div>
      ) : (
        <>
          {(['mano_obra', 'material', 'equipo', 'herramienta_menor'] as const).map(tipo => {
            const list = byTipo(tipo)
            const tc = TIPO_COLOR[tipo]
            const subtotal = list.reduce((s, i) => s + (i.importe ?? 0), 0)
            if (list.length === 0) return null
            return (
              <div key={tipo} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: tc.bg, color: tc.color }}>{tc.label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Subtotal: <strong>{fmtC(subtotal)}</strong></span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={thSt2Left}>Insumo</th>
                      <th style={thSt2}>Unidad</th>
                      <th style={{ ...thSt2, textAlign: 'right' }}>Cantidad</th>
                      <th style={{ ...thSt2, textAlign: 'right' }}>Costo Unit.</th>
                      <th style={{ ...thSt2, textAlign: 'right' }}>Importe</th>
                      {puedeEscribir && <th style={{ ...thSt2, width: 30 }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(i => (
                      <tr key={i.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={tdSt2}>{i.descripcion}</td>
                        <td style={{ ...tdSt2, textAlign: 'center', color: 'var(--text-muted)' }}>{i.unidad ?? '—'}</td>
                        <td style={{ ...tdSt2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtC(i.cantidad)}</td>
                        <td style={{ ...tdSt2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtC(i.costo_unitario)}</td>
                        <td style={{ ...tdSt2, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtC(i.importe)}</td>
                        {puedeEscribir && (
                          <td style={tdSt2}><button className="btn-ghost" style={{ padding: 2 }} onClick={() => deleteItem(i.id)}><X size={11} /></button></td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>Sin insumos capturados. Agrega el primero abajo.</div>
          )}

          {/* Totales */}
          <div style={{ display: 'flex', gap: 16, marginTop: 12, marginBottom: 12, padding: '10px 14px', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8, fontSize: 12 }}>
            <span>Costo Directo: <strong>{fmt(costoDirecto)}</strong></span>
            <span>Indirectos ({fmtPct(factorIndirectos)}): <strong>{fmt(indirectos)}</strong></span>
            <span style={{ color: '#0f766e' }}>PU Venta: <strong>{fmt(puVenta)}</strong></span>
          </div>

          {/* Formulario agregar insumo */}
          {puedeEscribir && (
            <div style={{ background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Agregar Insumo</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Tipo</div>
                  <select className="select" style={{ fontSize: 11, width: 150 }} value={form.tipo} onChange={e => selectTipo(e.target.value as TipoMatriz)}>
                    <option value="mano_obra">Mano de Obra</option>
                    <option value="material">Material</option>
                    <option value="equipo">Equipo</option>
                    <option value="herramienta_menor">Herramienta Menor (%)</option>
                  </select>
                </div>
                {form.tipo === 'herramienta_menor' ? (
                  <>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Descripción</div>
                      <input className="input" style={{ fontSize: 11 }} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>% sobre M.O.</div>
                      <input className="input" type="number" step="0.01" style={{ fontSize: 11, width: 80 }} value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Subtotal M.O.</div>
                      <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }} onClick={usarSubtotalMO}>
                        Usar {fmtC(manoObraSubtotal)}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Buscar en catálogo de insumos ({TIPO_COLOR[form.tipo].label.toLowerCase()})</div>
                    <input className="input" style={{ fontSize: 11 }} placeholder="Código o descripción… (o escribe libre)"
                      value={form.search}
                      onChange={e => setForm(f => ({ ...f, search: e.target.value, descripcion: e.target.value, id_insumo_fk: null }))} />
                    {results.length > 0 && (
                      <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
                        {results.map(r => (
                          <button key={r.id} onClick={() => selectResult(r)}
                            style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 8, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <span style={{ color: TIPO_COLOR[r.tipo].color, fontWeight: 600, minWidth: 50 }}>{r.codigo}</span>
                            <span style={{ flex: 1 }}>{r.descripcion}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtC(r.costo)}/{r.unidad}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searching && <Loader size={11} className="animate-spin" style={{ position: 'absolute', right: 8, top: 28 }} />}
                  </div>
                )}
                {form.tipo !== 'herramienta_menor' && (
                  <>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Unidad</div>
                      <input className="input" style={{ fontSize: 11, width: 60 }} value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Cantidad (rendimiento)</div>
                      <input className="input" type="number" step="0.0001" style={{ fontSize: 11, width: 90 }} placeholder="0" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Costo Unit.</div>
                      <input className="input" type="number" step="0.01" style={{ fontSize: 11, width: 90 }} placeholder="0.00" value={form.costo_unitario} onChange={e => setForm(f => ({ ...f, costo_unitario: e.target.value }))} />
                    </div>
                  </>
                )}
                <div style={{ padding: '4px 8px', background: '#f0fdf4', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#15803d', minWidth: 70, textAlign: 'right' }}>
                  {form.cantidad && form.costo_unitario ? fmtC(Number(form.cantidad) * Number(form.costo_unitario)) : '—'}
                </div>
                <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 11 }} onClick={addItem} disabled={saving || !form.descripcion.trim() || !form.cantidad || !form.costo_unitario}>
                  {saving ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />} Agregar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Insumos Base (catálogo de referencia — independiente de cfg.equipos/
// cfg.herramientas/cfg.colaboradores; solo materiales pueden vincularse a
// comp.articulos)
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_INS_BASE = { codigo: '', descripcion: '', unidad: 'pza', costo: '', tipo: 'material' as TipoInsumoBase, id_articulo_fk: null as number | null, search: '' }

function InsumosBaseTab({ puedeEscribir, puedeEliminar }: { puedeEscribir: boolean; puedeEliminar: boolean }) {
  const [insumos, setInsumos] = useState<InsumoBase[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const dSearch = useDebounce(search, 300)
  const [filterTipo, setFilterTipo] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<InsumoBase | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('mant_insumos').select('*').order('codigo')
    if (dSearch) q = q.or(`codigo.ilike.%${dSearch}%,descripcion.ilike.%${dSearch}%`)
    if (filterTipo) q = q.eq('tipo', filterTipo)
    const { data } = await q
    setInsumos((data ?? []) as InsumoBase[])
    setLoading(false)
  }, [dSearch, filterTipo])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (i: InsumoBase) => {
    if (!confirm(`¿Eliminar el insumo "${i.codigo}"? Las matrices que lo referencian conservarán su descripción/costo capturados.`)) return
    await dbCtrl.from('mant_insumos').delete().eq('id', i.id)
    fetchData()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 28, width: 240 }} placeholder="Buscar código, descripción…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select" style={{ width: 160 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="mano_obra">Mano de Obra</option>
            <option value="material">Material</option>
            <option value="equipo">Equipo</option>
          </select>
          <button className="btn-ghost" onClick={fetchData} title="Actualizar"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {puedeEscribir && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModal(true) }}><Plus size={14} /> Nuevo Insumo</button>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th style={{ textAlign: 'left', minWidth: 220 }}>Descripción</th>
              <th>Tipo</th>
              <th>Unidad</th>
              <th style={{ textAlign: 'right' }}>Costo</th>
              <th>Artículo vinculado</th>
              <th style={{ width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              : insumos.length === 0
                ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 56, color: 'var(--text-muted)' }}>Sin insumos registrados</td></tr>
                : insumos.map(i => {
                  const tc = TIPO_COLOR[i.tipo]
                  return (
                    <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => { setEditing(i); setModal(true) }}>
                      <td style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: tc.color, fontWeight: 600 }}>{i.codigo}</td>
                      <td style={{ fontSize: 13 }}>{i.descripcion}</td>
                      <td><span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: tc.bg, color: tc.color }}>{tc.label}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.unidad}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(i.costo)}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.id_articulo_fk ? 'Sí' : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                          {puedeEscribir && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(i); setModal(true) }}><Edit2 size={13} /></button>}
                          {puedeEliminar && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(i)}><Trash2 size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>

      {modal && (
        <InsumoBaseModal insumo={editing} onClose={() => setModal(false)} onSaved={() => { setModal(false); fetchData() }} />
      )}
    </div>
  )
}

function InsumoBaseModal({ insumo, onClose, onSaved }: { insumo: InsumoBase | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !insumo
  const [form, setForm] = useState({
    codigo:      insumo?.codigo      ?? '',
    descripcion: insumo?.descripcion ?? '',
    unidad:      insumo?.unidad      ?? 'pza',
    costo:       insumo ? String(insumo.costo) : '',
    tipo:        insumo?.tipo        ?? 'material' as TipoInsumoBase,
    id_articulo_fk: insumo?.id_articulo_fk ?? null as number | null,
    search: '',
  })
  const [results, setResults] = useState<any[]>([])
  const dSearch = useDebounce(form.search, 250)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (form.tipo !== 'material' || dSearch.length < 2) { setResults([]); return }
    dbComp.from('articulos').select('id, clave, nombre, unidad')
      .eq('activo', true).or(`nombre.ilike.%${dSearch}%,clave.ilike.%${dSearch}%`).limit(8)
      .then(({ data }) => setResults(data ?? []))
  }, [dSearch, form.tipo])

  const handleSave = async () => {
    if (!form.codigo.trim() || !form.descripcion.trim() || !form.costo) { setError('Código, descripción y costo son obligatorios'); return }
    setSaving(true); setError('')
    const payload = {
      codigo: form.codigo.trim().toUpperCase(), descripcion: form.descripcion.trim(),
      unidad: form.unidad, costo: Number(form.costo), tipo: form.tipo,
      id_articulo_fk: form.tipo === 'material' ? form.id_articulo_fk : null,
    }
    const q = isNew
      ? dbCtrl.from('mant_insumos').insert(payload)
      : dbCtrl.from('mant_insumos').update(payload).eq('id', insumo!.id)
    const { error: err } = await q
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={isNew ? 'Nuevo Insumo Base' : `Editar ${insumo!.codigo}`} onClose={onClose} maxWidth={480}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
      </>}>
      <div style={{ padding: '4px 4px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
          <div><label className="label">Código *</label><input className="input" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="MO-01" autoFocus /></div>
          <div>
            <label className="label">Tipo</label>
            <select className="select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoInsumoBase, id_articulo_fk: null }))}>
              <option value="mano_obra">Mano de Obra</option>
              <option value="material">Material</option>
              <option value="equipo">Equipo</option>
            </select>
          </div>
        </div>
        <div><label className="label">Descripción *</label><input className="input" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label className="label">Unidad</label><input className="input" value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} /></div>
          <div><label className="label">Costo *</label><input className="input" type="number" step="0.01" value={form.costo} onChange={e => setForm(f => ({ ...f, costo: e.target.value }))} /></div>
        </div>
        {form.tipo === 'material' && (
          <div style={{ position: 'relative' }}>
            <label className="label">Vincular a artículo del catálogo (opcional)</label>
            <input className="input" placeholder="Buscar artículo…" value={form.search} onChange={e => setForm(f => ({ ...f, search: e.target.value, id_articulo_fk: null }))} />
            {form.id_articulo_fk && <div style={{ fontSize: 11, color: '#15803d', marginTop: 3 }}>Vinculado ✓</div>}
            {results.length > 0 && (
              <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 160, overflowY: 'auto', padding: '4px 0' }}>
                {results.map(r => (
                  <button key={r.id} onClick={() => setForm(f => ({ ...f, id_articulo_fk: r.id, search: `${r.clave} — ${r.nombre}` }))}
                    style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 8, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>
                    <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{r.clave}</span><span style={{ flex: 1 }}>{r.nombre}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

// Estilos de tabla reutilizables
const thSt2: React.CSSProperties = { padding: '6px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#94a3b8', whiteSpace: 'nowrap', textAlign: 'center', background: '#f8fafc' }
const thSt2Left: React.CSSProperties = { ...thSt2, textAlign: 'left' }
const tdSt2: React.CSSProperties = { padding: '6px 8px', verticalAlign: 'middle' }
