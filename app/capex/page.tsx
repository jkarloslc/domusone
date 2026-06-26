'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { dbCtrl, dbCfg, dbComp } from '@/lib/supabase'
import { useDebounce } from '@/lib/useDebounce'
import ModalShell from '@/components/ui/ModalShell'
import {
  Plus, Search, RefreshCw, Edit2, Trash2, Loader, Save, X,
  ChevronDown, ChevronRight, Building2,
} from 'lucide-react'
import { nombreCompletoColaborador } from '@/lib/colaboradores'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type CC   = { id: number; nombre: string }
type Area = { id: number; nombre: string; id_centro_costo_fk: number }

type CapexProyecto = {
  id: number; folio: string | null; nombre: string
  descripcion: string | null; id_centro_costo_fk: number | null
  id_area_fk: number | null; tipo: string | null; status: string
  fecha_inicio: string | null; fecha_fin_estimada: string | null
  fecha_fin_real: string | null; monto_presupuestado: number | null
  notas: string | null; created_at: string
}

type CapexFrente = {
  id: number; id_proyecto_fk: number; nombre: string
  descripcion: string | null; orden: number
}

type CapexPartida = {
  id: number; id_frente_fk: number; clave: string | null; descripcion: string
  unidad: string; cantidad: number
  pu_materiales: number; pu_mano_obra: number; pu_maquinaria: number; pu_equipo_menor: number
  pu_total: number; monto_materiales: number; monto_mano_obra: number
  monto_maquinaria: number; monto_equipo_menor: number; monto_total: number; orden: number
}

type TipoInsumo = 'material' | 'mano_obra' | 'maquinaria' | 'equipo_menor'

type CapexInsumo = {
  id: number; id_partida_fk: number; tipo: TipoInsumo
  id_articulo_fk: number | null; id_colaborador_fk: number | null
  id_equipo_fk: number | null; id_herramienta_fk: number | null
  descripcion: string; unidad: string | null
  cantidad: number; precio_unitario: number; monto: number; orden: number
}

// ── Constantes ────────────────────────────────────────────────────────────────
const TIPOS_PROYECTO = [
  'Construcción', 'Remodelación', 'Instalaciones', 'Equipamiento',
  'Infraestructura', 'Urbanización', 'Paisajismo', 'Otro',
]

const STATUS_LIST = [
  'Borrador', 'En Revisión', 'Aprobado', 'En Ejecución', 'Terminado', 'Cancelado',
]

const UNIDADES_OBRA = [
  'm²', 'm³', 'ml', 'km', 'm', 'cm', 'pza', 'kg', 'ton',
  'lt', 'hr', 'día', 'gl', 'jgo', 'serv', 'trip', 'lote',
]

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'Borrador':      { bg: '#f1f5f9', color: '#475569' },
  'En Revisión':   { bg: '#fef3c7', color: '#92400e' },
  'Aprobado':      { bg: '#dbeafe', color: '#1d4ed8' },
  'En Ejecución':  { bg: '#dcfce7', color: '#15803d' },
  'Terminado':     { bg: '#d1fae5', color: '#065f46' },
  'Cancelado':     { bg: '#fee2e2', color: '#991b1b' },
}

const PAGE_SIZE = 15

const fmt = (v: number | null | undefined) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'

const fmtC = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'

const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ── Página principal ──────────────────────────────────────────────────────────
export default function CapexPage() {
  const { canWrite, canDelete } = useAuth()

  const [proyectos, setProyectos] = useState<CapexProyecto[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [loading, setLoading]     = useState(true)

  const [search, setSearch]       = useState('')
  const dSearch                   = useDebounce(search, 300)
  const [filterCC, setFilterCC]   = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [ccs, setCcs]   = useState<CC[]>([])
  const [areas, setAreas] = useState<Area[]>([])

  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState<CapexProyecto | null>(null)

  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCcs((data ?? []) as CC[]))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setAreas((data ?? []) as Area[]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('capex_proyectos')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (dSearch)      q = q.or(`nombre.ilike.%${dSearch}%,folio.ilike.%${dSearch}%`)
    if (filterCC)     q = q.eq('id_centro_costo_fk', Number(filterCC))
    if (filterArea)   q = q.eq('id_area_fk', Number(filterArea))
    if (filterTipo)   q = q.eq('tipo', filterTipo)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data, count, error } = await q
    if (!error) { setProyectos(data as CapexProyecto[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, dSearch, filterCC, filterArea, filterTipo, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPage(0) }, [dSearch, filterCC, filterArea, filterTipo, filterStatus])

  const handleDelete = async (p: CapexProyecto) => {
    if (!confirm(`¿Eliminar el proyecto "${p.nombre}"? Se eliminarán todos sus frentes, partidas e insumos.`)) return
    await dbCtrl.from('capex_proyectos').delete().eq('id', p.id)
    fetchData()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const montoTotal = proyectos.reduce((s, p) => s + (p.monto_presupuestado ?? 0), 0)
  const areasFiltradas = filterCC
    ? areas.filter(a => a.id_centro_costo_fk === Number(filterCC))
    : areas

  // Lookup maps para nombres
  const ccMap   = Object.fromEntries(ccs.map(c => [c.id, c.nombre]))
  const areaMap = Object.fromEntries(areas.map(a => [a.id, a.nombre]))

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Building2 size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Operaciones</span>
          </div>
          <h1 className="page-title-xl">Proyectos CAPEX</h1>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '12px 18px', minWidth: 140 }}>
          <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontWeight: 700 }}>{total}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Total proyectos</div>
        </div>
        <div className="card" style={{ padding: '12px 18px', minWidth: 200 }}>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', color: 'var(--blue)', fontWeight: 700 }}>{fmt(montoTotal)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Monto presupuestado (página)</div>
        </div>
        {STATUS_LIST.map(s => {
          const cnt = proyectos.filter(p => p.status === s).length
          if (!cnt) return null
          const c = STATUS_COLOR[s] ?? { bg: '#f1f5f9', color: '#475569' }
          return (
            <div key={s} className="card card-hover" style={{ padding: '12px 18px', minWidth: 100, cursor: 'pointer', borderBottom: filterStatus === s ? '2px solid var(--blue)' : undefined }}
              onClick={() => setFilterStatus(prev => prev === s ? '' : s)}>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: c.color, fontWeight: 700 }}>{cnt}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{s}</div>
            </div>
          )
        })}
      </div>

      {/* Filtros + acciones */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 28, width: 220 }} placeholder="Buscar nombre, folio…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select" style={{ width: 170 }} value={filterCC} onChange={e => { setFilterCC(e.target.value); setFilterArea('') }}>
            <option value="">Todos los CC</option>
            {ccs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} value={filterArea} onChange={e => setFilterArea(e.target.value)} disabled={!filterCC}>
            <option value="">Todas las Áreas</option>
            {areasFiltradas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            {TIPOS_PROYECTO.map(t => <option key={t}>{t}</option>)}
          </select>
          <button className="btn-ghost" onClick={fetchData} title="Actualizar">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        {canWrite('capex') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModal(true) }}>
            <Plus size={14} /> Nuevo Proyecto
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Proyecto</th>
              <th>Centro de Costo</th>
              <th>Área</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Inicio</th>
              <th>Fin Est.</th>
              <th style={{ textAlign: 'right' }}>Monto Ppto.</th>
              <th style={{ width: 72 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={10} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              : proyectos.length === 0
                ? <tr><td colSpan={10} style={{ textAlign: 'center', padding: 56, color: 'var(--text-muted)' }}>Sin proyectos registrados</td></tr>
                : proyectos.map(p => {
                  const sc = STATUS_COLOR[p.status] ?? { bg: '#f1f5f9', color: '#475569' }
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {p.folio ?? `#${p.id}`}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{p.nombre}</div>
                        {p.descripcion && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.descripcion.slice(0, 60)}{p.descripcion.length > 60 ? '…' : ''}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.id_centro_costo_fk ? ccMap[p.id_centro_costo_fk] ?? '—' : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.id_area_fk ? areaMap[p.id_area_fk] ?? '—' : '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.tipo ?? '—'}</td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_inicio)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_fin_estimada)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 13 }}>
                        {fmt(p.monto_presupuestado)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          {canWrite('capex') && (
                            <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(p); setModal(true) }} title="Editar">
                              <Edit2 size={13} />
                            </button>
                          )}
                          {canDelete() && (
                            <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(p)} title="Eliminar">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
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

      {modal && (
        <ProyectoModal
          proyecto={editing}
          ccs={ccs}
          areas={areas}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchData() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de Proyecto (Generales + Frentes & Partidas + Explosión)
// ─────────────────────────────────────────────────────────────────────────────
type ProyectoModalProps = {
  proyecto: CapexProyecto | null
  ccs: CC[]; areas: Area[]
  onClose: () => void; onSaved: () => void
}

function ProyectoModal({ proyecto, ccs, areas, onClose, onSaved }: ProyectoModalProps) {
  const isNew = !proyecto
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('capex')

  const [tab, setTab] = useState<'generales' | 'partidas' | 'explosion'>('generales')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [form, setForm] = useState({
    nombre:             proyecto?.nombre            ?? '',
    descripcion:        proyecto?.descripcion       ?? '',
    id_centro_costo_fk: proyecto?.id_centro_costo_fk?.toString() ?? '',
    id_area_fk:         proyecto?.id_area_fk?.toString()         ?? '',
    tipo:               proyecto?.tipo              ?? '',
    status:             proyecto?.status            ?? 'Borrador',
    fecha_inicio:       proyecto?.fecha_inicio      ?? '',
    fecha_fin_estimada: proyecto?.fecha_fin_estimada ?? '',
    fecha_fin_real:     proyecto?.fecha_fin_real    ?? '',
    notas:              proyecto?.notas             ?? '',
  })

  // Frentes, partidas e insumos cargados después de guardar / al abrir modal de edición
  const [proyectoId, setProyectoId] = useState<number | null>(proyecto?.id ?? null)
  const [frentes, setFrente]        = useState<CapexFrente[]>([])
  const [selectedFrente, setSelectedFrente] = useState<number | null>(null)
  const [partidas, setPartidas]     = useState<CapexPartida[]>([])
  const [insumos, setInsumos]       = useState<Record<number, CapexInsumo[]>>({})
  const [expanded, setExpanded]     = useState<Set<number>>(new Set())
  const [montoCache, setMontoCache] = useState<number>(proyecto?.monto_presupuestado ?? 0)

  const areasFiltradas = form.id_centro_costo_fk
    ? areas.filter(a => a.id_centro_costo_fk === Number(form.id_centro_costo_fk))
    : areas

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // ── Cargar frentes del proyecto ──────────────────────────────────────────
  const loadFrente = useCallback(async (pid: number) => {
    const { data } = await dbCtrl.from('capex_frentes').select('*').eq('id_proyecto_fk', pid).order('orden').order('id')
    const list = (data ?? []) as CapexFrente[]
    setFrente(list)
    if (list.length > 0 && selectedFrente === null) setSelectedFrente(list[0].id)
  }, [selectedFrente])

  useEffect(() => {
    if (proyectoId) loadFrente(proyectoId)
  }, [proyectoId, loadFrente])

  // ── Cargar partidas del frente seleccionado ──────────────────────────────
  const loadPartidas = useCallback(async (frenteId: number) => {
    const { data } = await dbCtrl.from('capex_partidas').select('*').eq('id_frente_fk', frenteId).order('orden').order('id')
    setPartidas((data ?? []) as CapexPartida[])
    setExpanded(new Set())
    setInsumos({})
  }, [])

  useEffect(() => {
    if (selectedFrente !== null) loadPartidas(selectedFrente)
  }, [selectedFrente, loadPartidas])

  // ── Guardar generales ────────────────────────────────────────────────────
  const handleSaveGenerales = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')

    let folio = proyecto?.folio
    if (isNew) {
      const { count } = await dbCtrl.from('capex_proyectos').select('*', { count: 'exact', head: true })
      folio = `CAPEX-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`
    }

    const payload = {
      folio,
      nombre:             form.nombre.trim(),
      descripcion:        form.descripcion.trim() || null,
      id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
      id_area_fk:         form.id_area_fk ? Number(form.id_area_fk) : null,
      tipo:               form.tipo || null,
      status:             form.status,
      fecha_inicio:       form.fecha_inicio || null,
      fecha_fin_estimada: form.fecha_fin_estimada || null,
      fecha_fin_real:     form.fecha_fin_real || null,
      notas:              form.notas.trim() || null,
    }

    if (isNew) {
      const { data, error: err } = await dbCtrl.from('capex_proyectos').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setProyectoId((data as CapexProyecto).id)
      setTab('partidas')
    } else {
      const { error: err } = await dbCtrl.from('capex_proyectos').update(payload).eq('id', proyecto!.id)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
  }

  // ── Actualizar monto presupuestado del proyecto ──────────────────────────
  const recalcMonto = useCallback(async (pid: number) => {
    const { data: frs } = await dbCtrl.from('capex_frentes').select('id').eq('id_proyecto_fk', pid)
    if (!frs || frs.length === 0) { setMontoCache(0); return }
    const fIds = frs.map((f: any) => f.id)
    const { data: parts } = await dbCtrl.from('capex_partidas').select('monto_total').in('id_frente_fk', fIds)
    const total = (parts ?? []).reduce((s: number, p: any) => s + (p.monto_total ?? 0), 0)
    setMontoCache(total)
    await dbCtrl.from('capex_proyectos').update({ monto_presupuestado: total }).eq('id', pid)
  }, [])

  const TABS = [
    { id: 'generales', label: 'Generales' },
    { id: 'partidas',  label: 'Frentes & Partidas' },
    { id: 'explosion', label: 'Explosión de Insumos' },
  ] as const

  return (
    <ModalShell
      modulo="capex"
      titulo={isNew ? 'Nuevo Proyecto CAPEX' : proyecto!.nombre}
      onClose={onSaved}
      maxWidth={1080}
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
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              disabled={t.id !== 'generales' && !proyectoId}
              style={{
                padding: '11px 16px', background: 'none', border: 'none', cursor: t.id !== 'generales' && !proyectoId ? 'not-allowed' : 'pointer',
                fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? 'var(--blue)' : 'var(--text-muted)',
                borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
                marginBottom: -1, opacity: t.id !== 'generales' && !proyectoId ? 0.4 : 1,
              }}>
              {t.label}
            </button>
          ))}
          {proyectoId && (
            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              Total: <strong style={{ color: 'var(--blue)' }}>{fmt(montoCache)}</strong>
            </span>
          )}
        </div>

        {/* Tab: Generales */}
        {tab === 'generales' && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            {error && (
              <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div><label className="label">Nombre del Proyecto *</label><input className="input" value={form.nombre} onChange={set('nombre')} placeholder="Ej. Construcción Alberca Norte" autoFocus /></div>
              <div>
                <label className="label">Tipo</label>
                <select className="select" value={form.tipo} onChange={set('tipo')}>
                  <option value="">— Selecciona —</option>
                  {TIPOS_PROYECTO.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label">Descripción</label><input className="input" value={form.descripcion} onChange={set('descripcion')} placeholder="Breve descripción del proyecto" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Centro de Costo</label>
                <select className="select" value={form.id_centro_costo_fk} onChange={e => { set('id_centro_costo_fk')(e); setForm(f => ({ ...f, id_area_fk: '' })) }}>
                  <option value="">— Sin CC —</option>
                  {ccs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Área</label>
                <select className="select" value={form.id_area_fk} onChange={set('id_area_fk')} disabled={!form.id_centro_costo_fk}>
                  <option value="">— Sin Área —</option>
                  {areasFiltradas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Fecha de Inicio</label>
                <input className="input" type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} />
              </div>
              <div>
                <label className="label">Fin Estimado</label>
                <input className="input" type="date" value={form.fecha_fin_estimada} onChange={set('fecha_fin_estimada')} />
              </div>
              <div>
                <label className="label">Fin Real</label>
                <input className="input" type="date" value={form.fecha_fin_real} onChange={set('fecha_fin_real')} />
              </div>
            </div>
            <div>
              <label className="label">Status</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STATUS_LIST.map(s => {
                  const c = STATUS_COLOR[s] ?? { bg: '#f1f5f9', color: '#475569' }
                  return (
                    <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                      style={{ padding: '5px 14px', borderRadius: 99, border: form.status === s ? `2px solid ${c.color}` : '2px solid #e2e8f0', background: form.status === s ? c.bg : '#fff', color: form.status === s ? c.color : '#94a3b8', fontSize: 12, fontWeight: form.status === s ? 700 : 400, cursor: 'pointer' }}>
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea className="input" rows={3} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} placeholder="Observaciones, alcances, restricciones…" />
            </div>
          </div>
        )}

        {/* Tab: Frentes & Partidas */}
        {tab === 'partidas' && proyectoId && (
          <FrentesPartidasTab
            proyectoId={proyectoId}
            puedeEscribir={puedeEscribir}
            frentes={frentes}
            setFrente={setFrente}
            selectedFrente={selectedFrente}
            setSelectedFrente={setSelectedFrente}
            partidas={partidas}
            setPartidas={setPartidas}
            insumos={insumos}
            setInsumos={setInsumos}
            expanded={expanded}
            setExpanded={setExpanded}
            onMontoChange={() => recalcMonto(proyectoId)}
          />
        )}

        {/* Tab: Explosión */}
        {tab === 'explosion' && proyectoId && (
          <ExplosionTab proyectoId={proyectoId} />
        )}
      </div>
    </ModalShell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Frentes & Partidas
// ─────────────────────────────────────────────────────────────────────────────
type FPTabProps = {
  proyectoId: number; puedeEscribir: boolean
  frentes: CapexFrente[]; setFrente: (f: CapexFrente[]) => void
  selectedFrente: number | null; setSelectedFrente: (id: number | null) => void
  partidas: CapexPartida[]; setPartidas: (p: CapexPartida[]) => void
  insumos: Record<number, CapexInsumo[]>; setInsumos: (i: Record<number, CapexInsumo[]>) => void
  expanded: Set<number>; setExpanded: (s: Set<number>) => void
  onMontoChange: () => void
}

function FrentesPartidasTab({ proyectoId, puedeEscribir, frentes, setFrente, selectedFrente, setSelectedFrente, partidas, setPartidas, insumos, setInsumos, expanded, setExpanded, onMontoChange }: FPTabProps) {
  const [nuevoFrente, setNuevoFrente] = useState('')
  const [savingFrente, setSavingFrente] = useState(false)

  const reloadFrente = async () => {
    const { data } = await dbCtrl.from('capex_frentes').select('*').eq('id_proyecto_fk', proyectoId).order('orden').order('id')
    setFrente((data ?? []) as CapexFrente[])
  }

  const addFrente = async () => {
    if (!nuevoFrente.trim()) return
    setSavingFrente(true)
    const { data } = await dbCtrl.from('capex_frentes')
      .insert({ id_proyecto_fk: proyectoId, nombre: nuevoFrente.trim(), orden: frentes.length })
      .select().single()
    await reloadFrente()
    if (data) setSelectedFrente((data as CapexFrente).id)
    setNuevoFrente('')
    setSavingFrente(false)
  }

  const deleteFrente = async (fid: number) => {
    if (!confirm('¿Eliminar este frente y todas sus partidas?')) return
    await dbCtrl.from('capex_frentes').delete().eq('id', fid)
    await reloadFrente()
    if (selectedFrente === fid) setSelectedFrente(null)
    onMontoChange()
  }

  const reloadPartidas = async (fid: number) => {
    const { data } = await dbCtrl.from('capex_partidas').select('*').eq('id_frente_fk', fid).order('orden').order('id')
    setPartidas((data ?? []) as CapexPartida[])
    onMontoChange()
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Panel izquierdo: frentes */}
      <div style={{ width: 200, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '12px 12px 8px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Frentes de Obra
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {frentes.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', cursor: 'pointer', background: selectedFrente === f.id ? '#eff6ff' : 'transparent', borderLeft: selectedFrente === f.id ? '3px solid var(--blue)' : '3px solid transparent' }}
              onClick={() => setSelectedFrente(f.id)}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: selectedFrente === f.id ? 600 : 400, color: selectedFrente === f.id ? 'var(--blue)' : 'var(--text-primary)', lineHeight: 1.3 }}>{f.nombre}</span>
              {puedeEscribir && (
                <button className="btn-ghost" style={{ padding: 2, opacity: 0.5 }} onClick={e => { e.stopPropagation(); deleteFrente(f.id) }}>
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
        {puedeEscribir && (
          <div style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 5 }}>
            <input className="input" style={{ fontSize: 11, padding: '5px 8px', flex: 1 }}
              placeholder="Nuevo frente…" value={nuevoFrente}
              onChange={e => setNuevoFrente(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addFrente() }} />
            <button className="btn-primary" style={{ padding: '4px 8px' }} onClick={addFrente} disabled={savingFrente || !nuevoFrente.trim()}>
              {savingFrente ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />}
            </button>
          </div>
        )}
      </div>

      {/* Panel derecho: partidas */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {selectedFrente === null
          ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Selecciona o crea un frente de obra
            </div>
          : <PartidasPanel
              frenteId={selectedFrente}
              puedeEscribir={puedeEscribir}
              partidas={partidas}
              insumos={insumos}
              setInsumos={setInsumos}
              expanded={expanded}
              setExpanded={setExpanded}
              onChanged={() => reloadPartidas(selectedFrente)}
            />
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de Partidas (dentro de un frente)
// ─────────────────────────────────────────────────────────────────────────────
type PartidasPanelProps = {
  frenteId: number; puedeEscribir: boolean
  partidas: CapexPartida[]
  insumos: Record<number, CapexInsumo[]>; setInsumos: (i: Record<number, CapexInsumo[]>) => void
  expanded: Set<number>; setExpanded: (s: Set<number>) => void
  onChanged: () => void
}

const EMPTY_PARTIDA = { clave: '', descripcion: '', unidad: 'm²', cantidad: '' }

function PartidasPanel({ frenteId, puedeEscribir, partidas, insumos, setInsumos, expanded, setExpanded, onChanged }: PartidasPanelProps) {
  const [formP, setFormP] = useState(EMPTY_PARTIDA)
  const [saving, setSaving] = useState(false)
  const [editingP, setEditingP] = useState<CapexPartida | null>(null)

  const addPartida = async () => {
    if (!formP.descripcion.trim()) return
    setSaving(true)
    await dbCtrl.from('capex_partidas').insert({
      id_frente_fk: frenteId,
      clave:        formP.clave.trim() || null,
      descripcion:  formP.descripcion.trim(),
      unidad:       formP.unidad,
      cantidad:     Number(formP.cantidad) || 0,
      orden:        partidas.length,
    })
    setFormP(EMPTY_PARTIDA)
    onChanged()
    setSaving(false)
  }

  const saveEditPartida = async (p: CapexPartida, field: string, value: string | number) => {
    await dbCtrl.from('capex_partidas').update({ [field]: value }).eq('id', p.id)
    onChanged()
  }

  const deletePartida = async (pid: number) => {
    if (!confirm('¿Eliminar esta partida y sus insumos?')) return
    await dbCtrl.from('capex_partidas').delete().eq('id', pid)
    onChanged()
  }

  const toggleExpand = async (pid: number) => {
    const next = new Set(expanded)
    if (next.has(pid)) { next.delete(pid) }
    else {
      next.add(pid)
      if (!insumos[pid]) {
        const { data } = await dbCtrl.from('capex_insumos').select('*').eq('id_partida_fk', pid).order('tipo').order('orden').order('id')
        setInsumos({ ...insumos, [pid]: (data ?? []) as CapexInsumo[] })
      }
    }
    setExpanded(next)
  }

  const refreshInsumos = async (pid: number) => {
    const { data } = await dbCtrl.from('capex_insumos').select('*').eq('id_partida_fk', pid).order('tipo').order('orden').order('id')
    setInsumos({ ...insumos, [pid]: (data ?? []) as CapexInsumo[] })
    onChanged()
  }

  const totalFrente = partidas.reduce((s, p) => s + (p.monto_total ?? 0), 0)

  return (
    <div>
      {/* Tabla de partidas */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={thSt}>Clave</th>
            <th style={{ ...thSt, textAlign: 'left', minWidth: 180 }}>Descripción</th>
            <th style={thSt}>Und</th>
            <th style={{ ...thSt, textAlign: 'right' }}>Cant.</th>
            <th style={{ ...thSt, textAlign: 'right', color: '#1d4ed8' }}>PU Mat.</th>
            <th style={{ ...thSt, textAlign: 'right', color: '#7c3aed' }}>PU M.O.</th>
            <th style={{ ...thSt, textAlign: 'right', color: '#15803d' }}>PU Maq.</th>
            <th style={{ ...thSt, textAlign: 'right', color: '#d97706' }}>PU Eq.M</th>
            <th style={{ ...thSt, textAlign: 'right', color: '#0f766e' }}>PU Total</th>
            <th style={{ ...thSt, textAlign: 'right', color: '#15803d' }}>Monto</th>
            <th style={{ ...thSt, width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {partidas.length === 0 && (
            <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>Sin partidas. Agrega la primera abajo.</td></tr>
          )}
          {partidas.map(p => (
            <>
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: expanded.has(p.id) ? '#f0f9ff' : 'white' }}>
                <td style={{ ...tdSt, width: 70 }}>
                  {editingP?.id === p.id
                    ? <input className="input" style={{ fontSize: 11, padding: '2px 5px', width: 60 }} defaultValue={p.clave ?? ''} onBlur={e => { saveEditPartida(p, 'clave', e.target.value || null as any); setEditingP(null) }} autoFocus />
                    : <span style={{ fontFamily: 'var(--font-display)', color: 'var(--blue)', cursor: 'pointer' }} onClick={() => puedeEscribir && setEditingP(p)}>{p.clave ?? '—'}</span>
                  }
                </td>
                <td style={{ ...tdSt, fontWeight: 500 }}>
                  {editingP?.id === p.id && editingP.descripcion !== p.descripcion
                    ? <input className="input" style={{ fontSize: 12, padding: '2px 5px', width: '100%' }} defaultValue={p.descripcion} onBlur={e => { saveEditPartida(p, 'descripcion', e.target.value); setEditingP(null) }} />
                    : <span style={{ cursor: puedeEscribir ? 'pointer' : 'default' }} onClick={() => puedeEscribir && setEditingP(p)}>{p.descripcion}</span>
                  }
                </td>
                <td style={{ ...tdSt, textAlign: 'center' }}>
                  <InlineSelect value={p.unidad} options={UNIDADES_OBRA} disabled={!puedeEscribir}
                    onChange={v => saveEditPartida(p, 'unidad', v)} />
                </td>
                <td style={{ ...tdSt, textAlign: 'right' }}>
                  <InlineNum value={p.cantidad} disabled={!puedeEscribir} onChange={v => saveEditPartida(p, 'cantidad', v)} />
                </td>
                <td style={{ ...tdSt, textAlign: 'right', color: '#1d4ed8' }}>{fmtC(p.pu_materiales)}</td>
                <td style={{ ...tdSt, textAlign: 'right', color: '#7c3aed' }}>{fmtC(p.pu_mano_obra)}</td>
                <td style={{ ...tdSt, textAlign: 'right', color: '#15803d' }}>{fmtC(p.pu_maquinaria)}</td>
                <td style={{ ...tdSt, textAlign: 'right', color: '#d97706' }}>{fmtC(p.pu_equipo_menor)}</td>
                <td style={{ ...tdSt, textAlign: 'right', fontWeight: 600, color: '#0f766e' }}>{fmtC(p.pu_total)}</td>
                <td style={{ ...tdSt, textAlign: 'right', fontWeight: 600, color: '#15803d' }}>{fmt(p.monto_total)}</td>
                <td style={tdSt}>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <button className="btn-ghost" style={{ padding: '3px 5px', color: expanded.has(p.id) ? 'var(--blue)' : undefined }}
                      onClick={() => toggleExpand(p.id)} title="APU / Insumos">
                      {expanded.has(p.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    {puedeEscribir && (
                      <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => deletePartida(p.id)}>
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {expanded.has(p.id) && (
                <tr key={`ins-${p.id}`}>
                  <td colSpan={10} style={{ padding: 0, background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <InsumosPanel
                      partida={p}
                      insumos={insumos[p.id] ?? []}
                      puedeEscribir={puedeEscribir}
                      onChanged={() => refreshInsumos(p.id)}
                    />
                  </td>
                </tr>
              )}
            </>
          ))}
          {/* Total frente */}
          {partidas.length > 0 && (
            <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
              <td colSpan={9} style={{ ...tdSt, textAlign: 'right', fontWeight: 700, color: '#0f766e', fontSize: 12 }}>Total frente</td>
              <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700, color: '#15803d', fontSize: 13 }}>{fmt(totalFrente)}</td>
              <td style={tdSt}></td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Formulario nueva partida */}
      {puedeEscribir && (
        <div style={{ padding: '10px 14px', background: '#fafafa', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Clave</div>
            <input className="input" style={{ width: 70, fontSize: 12 }} placeholder="A.1" value={formP.clave} onChange={e => setFormP(f => ({ ...f, clave: e.target.value }))} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Descripción *</div>
            <input className="input" style={{ fontSize: 12 }} placeholder="Concepto de obra…" value={formP.descripcion} onChange={e => setFormP(f => ({ ...f, descripcion: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') addPartida() }} />
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Unidad</div>
            <select className="select" style={{ fontSize: 12, width: 80 }} value={formP.unidad} onChange={e => setFormP(f => ({ ...f, unidad: e.target.value }))}>
              {UNIDADES_OBRA.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Cantidad</div>
            <input className="input" type="number" style={{ width: 80, fontSize: 12 }} placeholder="0" value={formP.cantidad} onChange={e => setFormP(f => ({ ...f, cantidad: e.target.value }))} />
          </div>
          <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12 }} onClick={addPartida} disabled={saving || !formP.descripcion.trim()}>
            {saving ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />} Agregar
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de Insumos APU (expandido dentro de una partida)
// ─────────────────────────────────────────────────────────────────────────────
type InsumosPanelProps = {
  partida: CapexPartida
  insumos: CapexInsumo[]
  puedeEscribir: boolean
  onChanged: () => void
}

const TIPO_COLOR: Record<TipoInsumo, { bg: string; color: string; label: string }> = {
  material:      { bg: '#dbeafe', color: '#1d4ed8', label: 'Material' },
  mano_obra:     { bg: '#ede9fe', color: '#7c3aed', label: 'Mano de Obra' },
  maquinaria:    { bg: '#dcfce7', color: '#15803d', label: 'Maquinaria' },
  equipo_menor:  { bg: '#fef3c7', color: '#d97706', label: 'Equipo Menor' },
}

const EMPTY_INS = {
  tipo: 'material' as TipoInsumo, descripcion: '', unidad: 'pza',
  cantidad: '', precio_unitario: '', search: '',
  id_articulo_fk:    null as number | null,
  id_colaborador_fk: null as number | null,
  id_equipo_fk:      null as number | null,
  id_herramienta_fk: null as number | null,
}

function InsumosPanel({ partida, insumos, puedeEscribir, onChanged }: InsumosPanelProps) {
  const [form, setForm] = useState(EMPTY_INS)
  const [saving, setSaving]  = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const dSearch = useDebounce(form.search, 250)

  // Buscar en catálogo según tipo
  useEffect(() => {
    if (dSearch.length < 2) { setResults([]); return }
    setSearching(true)
    if (form.tipo === 'mano_obra') {
      dbCfg.from('colaboradores').select('id, nombre, apellido_paterno, apellido_materno, puesto')
        .eq('activo', true).ilike('nombre', `%${dSearch}%`).limit(8)
        .then(({ data }) => { setResults(data ?? []); setSearching(false) })
    } else if (form.tipo === 'maquinaria') {
      dbCfg.from('equipos').select('id, nombre, unidad_odometro')
        .eq('activo', true).ilike('nombre', `%${dSearch}%`).limit(8)
        .then(({ data }) => { setResults(data ?? []); setSearching(false) })
    } else if (form.tipo === 'equipo_menor') {
      dbCfg.from('herramientas').select('id, descripcion, tipo')
        .eq('activo', true).ilike('descripcion', `%${dSearch}%`).limit(8)
        .then(({ data }) => { setResults(data ?? []); setSearching(false) })
    } else {
      dbComp.from('articulos').select('id, clave, nombre, unidad, precio_ref')
        .eq('activo', true)
        .or(`nombre.ilike.%${dSearch}%,clave.ilike.%${dSearch}%`)
        .limit(8)
        .then(({ data }) => { setResults(data ?? []); setSearching(false) })
    }
  }, [dSearch, form.tipo])

  const selectResult = (r: any) => {
    if (form.tipo === 'mano_obra') {
      setForm(f => ({
        ...f, id_colaborador_fk: r.id, id_articulo_fk: null, id_equipo_fk: null, id_herramienta_fk: null,
        descripcion: nombreCompletoColaborador(r), unidad: 'hr', search: nombreCompletoColaborador(r),
      }))
    } else if (form.tipo === 'maquinaria') {
      setForm(f => ({
        ...f, id_equipo_fk: r.id, id_articulo_fk: null, id_colaborador_fk: null, id_herramienta_fk: null,
        descripcion: r.nombre, unidad: r.unidad_odometro ?? 'hr', search: r.nombre,
      }))
    } else if (form.tipo === 'equipo_menor') {
      setForm(f => ({
        ...f, id_herramienta_fk: r.id, id_articulo_fk: null, id_colaborador_fk: null, id_equipo_fk: null,
        descripcion: r.descripcion, unidad: 'hr', search: r.descripcion,
      }))
    } else {
      setForm(f => ({
        ...f, id_articulo_fk: r.id, id_colaborador_fk: null, id_equipo_fk: null, id_herramienta_fk: null,
        descripcion: r.nombre, unidad: r.unidad ?? 'pza',
        precio_unitario: r.precio_ref ? String(r.precio_ref) : f.precio_unitario,
        search: `${r.clave} — ${r.nombre}`,
      }))
    }
    setResults([])
  }

  const recalcPU = async () => {
    const { data } = await dbCtrl.from('capex_insumos').select('tipo, monto').eq('id_partida_fk', partida.id)
    const insList = (data ?? []) as { tipo: string; monto: number }[]
    const sum = (t: string) => insList.filter(i => i.tipo === t).reduce((s, i) => s + (i.monto ?? 0), 0)
    await dbCtrl.from('capex_partidas').update({
      pu_materiales:  sum('material'),
      pu_mano_obra:   sum('mano_obra'),
      pu_maquinaria:  sum('maquinaria'),
      pu_equipo_menor: sum('equipo_menor'),
    }).eq('id', partida.id)
  }

  const addInsumo = async () => {
    if (!form.descripcion.trim() || !form.cantidad || !form.precio_unitario) return
    setSaving(true)
    await dbCtrl.from('capex_insumos').insert({
      id_partida_fk:     partida.id,
      tipo:              form.tipo,
      id_articulo_fk:    form.tipo === 'material'     ? form.id_articulo_fk    : null,
      id_colaborador_fk: form.tipo === 'mano_obra'    ? form.id_colaborador_fk : null,
      id_equipo_fk:      form.tipo === 'maquinaria'   ? form.id_equipo_fk      : null,
      id_herramienta_fk: form.tipo === 'equipo_menor' ? form.id_herramienta_fk : null,
      descripcion:       form.descripcion.trim(),
      unidad:            form.unidad || null,
      cantidad:          Number(form.cantidad),
      precio_unitario:   Number(form.precio_unitario),
      orden:             insumos.length,
    })
    await recalcPU()
    setForm(f => ({ ...EMPTY_INS, tipo: f.tipo }))
    setResults([])
    onChanged()
    setSaving(false)
  }

  const deleteInsumo = async (id: number) => {
    await dbCtrl.from('capex_insumos').delete().eq('id', id)
    await recalcPU()
    onChanged()
  }

  const byTipo = (t: string) => insumos.filter(i => i.tipo === t)

  return (
    <div style={{ padding: '10px 16px 12px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        APU — {partida.clave ? `${partida.clave} · ` : ''}{partida.descripcion}
      </div>

      {/* Grupos por tipo */}
      {(['material', 'mano_obra', 'maquinaria', 'equipo_menor'] as const).map(tipo => {
        const list = byTipo(tipo)
        const tc = TIPO_COLOR[tipo]
        const subtotal = list.reduce((s, i) => s + (i.monto ?? 0), 0)
        if (list.length === 0 && !puedeEscribir) return null
        return (
          <div key={tipo} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: tc.bg, color: tc.color }}>{tc.label}</span>
              {list.length > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>PU: <strong>{fmtC(subtotal)}</strong></span>}
            </div>
            {list.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ ...thSt, textAlign: 'left' }}>Descripción</th>
                    <th style={thSt}>Unidad</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Cant.</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>P.U.</th>
                    <th style={{ ...thSt, textAlign: 'right' }}>Monto</th>
                    {puedeEscribir && <th style={{ ...thSt, width: 30 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {list.map(i => (
                    <tr key={i.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...tdSt, color: 'var(--text-secondary)' }}>{i.descripcion}</td>
                      <td style={{ ...tdSt, textAlign: 'center', color: 'var(--text-muted)' }}>{i.unidad ?? '—'}</td>
                      <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtC(i.cantidad)}</td>
                      <td style={{ ...tdSt, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtC(i.precio_unitario)}</td>
                      <td style={{ ...tdSt, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtC(i.monto)}</td>
                      {puedeEscribir && (
                        <td style={tdSt}>
                          <button className="btn-ghost" style={{ padding: 2 }} onClick={() => deleteInsumo(i.id)}><X size={11} /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {/* Formulario agregar insumo */}
      {puedeEscribir && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginTop: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Agregar Insumo</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Tipo */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Tipo</div>
              <select className="select" style={{ fontSize: 11, width: 120 }} value={form.tipo}
                onChange={e => setForm({ ...EMPTY_INS, tipo: e.target.value as any })}>
                <option value="material">Material</option>
                <option value="mano_obra">Mano de Obra</option>
                <option value="maquinaria">Maquinaria</option>
                <option value="equipo_menor">Equipo Menor</option>
              </select>
            </div>
            {/* Búsqueda de catálogo */}
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                {form.tipo === 'mano_obra' ? 'Colaborador'
                  : form.tipo === 'maquinaria' ? 'Equipo (catálogo)'
                  : form.tipo === 'equipo_menor' ? 'Herramienta (catálogo)'
                  : 'Artículo del catálogo'}
              </div>
              <input className="input" style={{ fontSize: 11 }}
                placeholder={form.tipo === 'mano_obra' ? 'Buscar colaborador…'
                  : form.tipo === 'maquinaria' ? 'Buscar equipo/maquinaria…'
                  : form.tipo === 'equipo_menor' ? 'Buscar herramienta…'
                  : 'Buscar artículo…'}
                value={form.search}
                onChange={e => setForm(f => ({
                  ...f, search: e.target.value, descripcion: e.target.value,
                  id_articulo_fk: null, id_colaborador_fk: null, id_equipo_fk: null, id_herramienta_fk: null,
                }))}
              />
              {results.length > 0 && (
                <div className="card" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
                  {results.map(r => (
                    <button key={r.id} onClick={() => selectResult(r)}
                      style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 8, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      {form.tipo === 'mano_obra'
                        ? <><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{nombreCompletoColaborador(r)}</span><span style={{ color: 'var(--text-muted)' }}>{r.puesto ?? ''}</span></>
                        : form.tipo === 'maquinaria'
                          ? <><span style={{ color: '#15803d', fontWeight: 600 }}>{r.nombre}</span><span style={{ color: 'var(--text-muted)' }}>{r.unidad_odometro ?? 'hr'}</span></>
                          : form.tipo === 'equipo_menor'
                            ? <><span style={{ color: '#d97706', fontWeight: 600 }}>{r.descripcion}</span><span style={{ color: 'var(--text-muted)' }}>{r.tipo ?? ''}</span></>
                            : <><span style={{ color: 'var(--blue)', fontWeight: 600, minWidth: 60 }}>{r.clave}</span><span style={{ flex: 1 }}>{r.nombre}</span><span style={{ color: 'var(--text-muted)' }}>{r.unidad}</span></>
                      }
                    </button>
                  ))}
                </div>
              )}
              {searching && <Loader size={11} className="animate-spin" style={{ position: 'absolute', right: 8, top: 28 }} />}
            </div>
            {/* Unidad */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Unidad</div>
              <input className="input" style={{ fontSize: 11, width: 60 }} value={form.unidad}
                onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} />
            </div>
            {/* Cantidad */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Cant./unidad</div>
              <input className="input" type="number" style={{ fontSize: 11, width: 80 }} placeholder="0"
                value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} />
            </div>
            {/* Precio unitario */}
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>P.U.</div>
              <input className="input" type="number" style={{ fontSize: 11, width: 90 }} placeholder="0.00"
                value={form.precio_unitario} onChange={e => setForm(f => ({ ...f, precio_unitario: e.target.value }))} />
            </div>
            {/* Monto preview */}
            <div style={{ padding: '4px 8px', background: '#f0fdf4', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#15803d', minWidth: 70, textAlign: 'right' }}>
              {form.cantidad && form.precio_unitario ? fmt(Number(form.cantidad) * Number(form.precio_unitario)) : '—'}
            </div>
            <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 11 }} onClick={addInsumo}
              disabled={saving || !form.descripcion.trim() || !form.cantidad || !form.precio_unitario}>
              {saving ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />} Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Explosión de Insumos
// ─────────────────────────────────────────────────────────────────────────────
function ExplosionTab({ proyectoId }: { proyectoId: number }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ tipo: string; descripcion: string; unidad: string | null; cantTotal: number; pu: number; monto: number; clave: string }[]>([])
  const [tabTipo, setTabTipo] = useState<TipoInsumo>('material')

  useEffect(() => {
    (async () => {
      setLoading(true)
      // 1. Frentes del proyecto
      const { data: frs } = await dbCtrl.from('capex_frentes').select('id').eq('id_proyecto_fk', proyectoId)
      if (!frs || frs.length === 0) { setData([]); setLoading(false); return }

      // 2. Partidas de todos los frentes
      const fIds = frs.map((f: any) => f.id)
      const { data: parts } = await dbCtrl.from('capex_partidas').select('id, cantidad').in('id_frente_fk', fIds)
      if (!parts || parts.length === 0) { setData([]); setLoading(false); return }

      const cantMap: Record<number, number> = {}
      for (const p of parts as any[]) cantMap[p.id] = p.cantidad

      // 3. Insumos de todas las partidas
      const pIds = (parts as any[]).map(p => p.id)
      const { data: ins } = await dbCtrl.from('capex_insumos').select('*').in('id_partida_fk', pIds)
      const insList = (ins ?? []) as CapexInsumo[]

      // 4. Agrupar por descripción + tipo
      const map: Record<string, { tipo: string; descripcion: string; unidad: string | null; cantTotal: number; monto: number; pu: number; clave: string }> = {}
      for (const i of insList) {
        const cantPartida = cantMap[i.id_partida_fk] ?? 0
        const key = `${i.tipo}|${i.descripcion}|${i.unidad}`
        if (!map[key]) {
          map[key] = { tipo: i.tipo, descripcion: i.descripcion, unidad: i.unidad, cantTotal: 0, monto: 0, pu: i.precio_unitario, clave: String(i.id_articulo_fk ?? i.id_colaborador_fk ?? i.id_equipo_fk ?? i.id_herramienta_fk ?? '') }
        }
        map[key].cantTotal += i.cantidad * cantPartida
        map[key].monto     += i.monto * cantPartida
      }
      setData(Object.values(map))
      setLoading(false)
    })()
  }, [proyectoId])

  const filtered = data.filter(d => d.tipo === tabTipo)
  const subtotal  = filtered.reduce((s, d) => s + d.monto, 0)

  const TIPO_TABS: { id: TipoInsumo; label: string }[] = [
    { id: 'material',     label: 'Materiales' },
    { id: 'mano_obra',    label: 'Mano de Obra' },
    { id: 'maquinaria',   label: 'Maquinaria' },
    { id: 'equipo_menor', label: 'Equipo Menor' },
  ]

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
      {loading
        ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></div>
        : (
          <>
            {/* Totales por tipo */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {TIPO_TABS.map(t => {
                const tc = TIPO_COLOR[t.id]
                const tot = data.filter(d => d.tipo === t.id).reduce((s, d) => s + d.monto, 0)
                return (
                  <div key={t.id} className="card card-hover" style={{ padding: '10px 16px', minWidth: 160, cursor: 'pointer', borderBottom: tabTipo === t.id ? `2px solid ${tc.color}` : undefined }}
                    onClick={() => setTabTipo(t.id)}>
                    <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-display)', color: tc.color }}>{fmt(tot)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{t.label}</div>
                  </div>
                )
              })}
              <div className="card" style={{ padding: '10px 16px', minWidth: 160 }}>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--blue)' }}>{fmt(data.reduce((s, d) => s + d.monto, 0))}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Total proyecto</div>
              </div>
            </div>

            {/* Tabla filtrada */}
            <div className="card" style={{ overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'center' }}>Unidad</th>
                    <th style={{ textAlign: 'right' }}>Cantidad Total</th>
                    <th style={{ textAlign: 'right' }}>P.U. Ref.</th>
                    <th style={{ textAlign: 'right' }}>Monto Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0
                    ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Sin insumos de este tipo</td></tr>
                    : filtered.sort((a, b) => b.monto - a.monto).map((d, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{d.descripcion}</td>
                        <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>{d.unidad ?? '—'}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtC(d.cantTotal)}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{fmtC(d.pu)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.monto)}</td>
                      </tr>
                    ))
                  }
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                      <td colSpan={4} style={{ ...tdSt, fontWeight: 700, textAlign: 'right', color: TIPO_COLOR[tabTipo].color }}>Subtotal {TIPO_TABS.find(t => t.id === tabTipo)?.label}</td>
                      <td style={{ ...tdSt, textAlign: 'right', fontWeight: 700, color: TIPO_COLOR[tabTipo].color }}>{fmt(subtotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )
      }
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de UI inline
// ─────────────────────────────────────────────────────────────────────────────
function InlineSelect({ value, options, onChange, disabled }: { value: string; options: string[]; onChange: (v: string) => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false)
  if (!editing || disabled) return (
    <span style={{ cursor: disabled ? 'default' : 'pointer', fontSize: 11, color: 'var(--text-secondary)' }} onClick={() => !disabled && setEditing(true)}>{value}</span>
  )
  return (
    <select className="select" style={{ fontSize: 11, padding: '2px 4px' }} value={value} autoFocus
      onChange={e => { onChange(e.target.value); setEditing(false) }}
      onBlur={() => setEditing(false)}>
      {options.map(o => <option key={o}>{o}</option>)}
    </select>
  )
}

function InlineNum({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(String(value))
  if (!editing || disabled) return (
    <span style={{ cursor: disabled ? 'default' : 'pointer', fontSize: 11, fontVariantNumeric: 'tabular-nums' }} onClick={() => { !disabled && setEditing(true); setLocal(String(value)) }}>{fmtC(value)}</span>
  )
  return (
    <input className="input" type="number" style={{ fontSize: 11, padding: '2px 4px', width: 70, textAlign: 'right' }}
      value={local} autoFocus
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { onChange(Number(local) || 0); setEditing(false) }}
      onKeyDown={e => { if (e.key === 'Enter') { onChange(Number(local) || 0); setEditing(false) } }} />
  )
}

// Estilos de tabla reutilizables
const thSt: React.CSSProperties = {
  padding: '7px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '.05em', color: '#94a3b8', whiteSpace: 'nowrap', textAlign: 'center',
  background: '#f8fafc',
}
const tdSt: React.CSSProperties = {
  padding: '7px 10px', verticalAlign: 'middle',
}
