'use client'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/lib/useDebounce'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, AlertTriangle,
  Eye, Edit2, Trash2, X, Save, Loader,
  ChevronLeft, ChevronRight, CheckCircle, Clock,
  Wrench, ExternalLink
} from 'lucide-react'
import MultiImageUpload from '@/components/MultiImageUpload'
import ModalShell from '@/components/ui/ModalShell'

// ── Tipos ─────────────────────────────────────────────────────
type Incidencia = {
  id: number
  id_lote_fk: number | null
  tipo: string | null
  origen: string | null
  area_responsable: string | null
  descripcion: string | null
  status: string | null
  fecha: string
  fecha_cierre: string | null
  responsable: string | null
  notas: string | null
  id_ot_fk: number | null
  created_at: string
  updated_at: string
  lotes?: { cve_lote: string | null; lote: number | null }
}

// ── Catálogos ─────────────────────────────────────────────────
const AREAS    = ['Seguridad', 'Mantenimiento', 'Administración', 'Legal', 'Obras', 'Servicios']
const STATUS_INC = ['Abierta', 'En Proceso', 'En Espera', 'Cerrada', 'Cancelada']

const STATUS_COLOR: Record<string, string> = {
  'Abierta':    'badge-bloqueado',
  'En Proceso': 'badge-libre',
  'En Espera':  'badge-default',
  'Cerrada':    'badge-vendido',
  'Cancelada':  'badge-default',
}

const PAGE_SIZE = 25
const fmtFecha = (d: string | null) =>
  d ? new Date(d.includes('T') ? d : d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function IncidenciasPage() {
  const { canWrite, canDelete } = useAuth()
  const [incidencias, setIncidencias] = useState<Incidencia[]>([])
  const [total, setTotal]             = useState(0)
  const [tipos,    setTipos]    = useState<string[]>([])
  const [origenes, setOrigenes] = useState<string[]>([])
  const [page, setPage]               = useState(0)
  const [search, setSearch]           = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilter]     = useState('')
  const [filterTipo, setFilterTipo]   = useState('')
  const [loading, setLoading]         = useState(true)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editing, setEditing]         = useState<Incidencia | null>(null)
  const [detail, setDetail]           = useState<Incidencia | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl
      .from('incidencias')
      .select('*', { count: 'exact' })
      .order('fecha', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (debouncedSearch) q = q.or(`descripcion.ilike.%${debouncedSearch}%,responsable.ilike.%${debouncedSearch}%`)
    if (filterStatus)    q = q.eq('status', filterStatus)
    if (filterTipo)      q = q.eq('tipo', filterTipo)

    const { data, count, error } = await q
    if (error) { setLoading(false); return }

    // Cargar cve_lote por separado (cat schema)
    const loteIds = Array.from(new Set((data ?? []).filter(i => i.id_lote_fk).map(i => i.id_lote_fk)))
    const loteMap: Record<number, any> = {}
    if (loteIds.length) {
      const { data: lotes } = await dbCat.from('lotes').select('id, cve_lote, lote').in('id', loteIds)
      ;(lotes ?? []).forEach((l: any) => { loteMap[l.id] = l })
    }

    const enriched = (data ?? []).map(i => ({
      ...i,
      lotes: i.id_lote_fk ? loteMap[i.id_lote_fk] ?? null : null,
    }))

    setIncidencias(enriched as Incidencia[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, debouncedSearch, filterStatus, filterTipo])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    dbCfg.from('tipos_incidencia').select('nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setTipos((data ?? []).map((t: any) => t.nombre)))
    dbCfg.from('origenes_incidencia').select('nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setOrigenes((data ?? []).map((o: any) => o.nombre)))
  }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta incidencia?')) return
    await dbCtrl.from('incidencias').delete().eq('id', id)
    fetchData()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Stats
  const abiertas   = incidencias.filter(i => i.status === 'Abierta').length
  const enProceso  = incidencias.filter(i => i.status === 'En Proceso').length
  const enEspera   = incidencias.filter(i => i.status === 'En Espera').length
  const cerradas   = incidencias.filter(i => i.status === 'Cerrada').length

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <AlertTriangle size={16} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em' }}>
            Incidencias
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            {total} incidencias registradas
          </p>
        </div>
        {canWrite('incidencias') && <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={14} /> Nueva Incidencia
        </button>}
      </div>

      {/* Stats clickeables */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Abiertas',    value: abiertas,  color: '#f87171', status: 'Abierta' },
          { label: 'En Proceso',  value: enProceso, color: '#60a5fa', status: 'En Proceso' },
          { label: 'En Espera',   value: enEspera,  color: '#9ca3af', status: 'En Espera' },
          { label: 'Cerradas',    value: cerradas,  color: '#4ade80', status: 'Cerrada' },
        ].map(s => (
          <div key={s.label} className="card card-hover"
            style={{ padding: '12px 18px', minWidth: 100, cursor: 'pointer', borderColor: filterStatus === s.status ? 'var(--border-hover)' : undefined }}
            onClick={() => setFilter(filterStatus === s.status ? '' : s.status)}>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 400, color: filterStatus === s.status ? s.color : 'var(--text-primary)' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar descripción, responsable…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={13} /></button>}
        </div>
        <select className="select" style={{ width: 150 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
          <option value="">Todos los status</option>
          {STATUS_INC.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ width: 190 }} value={filterTipo} onChange={e => { setFilterTipo(e.target.value); setPage(0) }}>
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t}>{t}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Lote</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Área</th>
                <th>Responsable</th>
                <th>Fecha</th>
                <th>Cierre</th>
                <th>Status</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : incidencias.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  Sin incidencias registradas
                </td></tr>
              ) : incidencias.map(inc => (
                <tr key={inc.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>#{inc.id}</td>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold-light)' }}>
                    {(inc as any).lotes?.cve_lote ?? (inc.id_lote_fk ? `#${inc.id_lote_fk}` : '—')}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inc.tipo ?? '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {inc.descripcion ?? '—'}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {inc.area_responsable
                      ? <span className="badge badge-default">{inc.area_responsable}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>
                    }
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {inc.responsable ?? '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {fmtFecha(inc.fecha)}
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {inc.fecha_cierre
                      ? <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} />{fmtFecha(inc.fecha_cierre)}</span>
                      : <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} />Pendiente</span>
                    }
                  </td>
                  <td>
                    <span className={`badge ${STATUS_COLOR[inc.status ?? ''] ?? 'badge-default'}`}>
                      {inc.status ?? '—'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(inc)} title="Ver detalle"><Eye size={13} /></button>
                      {canWrite('incidencias') && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(inc); setModalOpen(true) }} title="Editar"><Edit2 size={13} /></button>}
                      {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(inc.id)} title="Eliminar"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page + 1} de {totalPages} · {total} registros</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <IncidenciaModal
          incidencia={editing}
          tipos={tipos}
          origenes={origenes}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchData() }}
        />
      )}
      {detail && (
        <IncidenciaDetail
          incidencia={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); setModalOpen(true) }}
          onRefresh={fetchData}
        />
      )}
    </div>
  )
}

// ── Modal CRUD ────────────────────────────────────────────────
function IncidenciaModal({ incidencia, tipos, origenes, onClose, onSaved }: { incidencia: Incidencia | null; tipos: string[]; origenes: string[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !incidencia
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [lotes, setLotes]           = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState(incidencia ? ((incidencia as any).lotes?.cve_lote ?? '') : '')
  const [secciones, setSecciones]   = useState<any[]>([])
  const [filterSeccion, setFilterSeccion] = useState('')

  const [form, setForm] = useState({
    id_lote_fk:       incidencia?.id_lote_fk?.toString() ?? '',
    tipo:             incidencia?.tipo ?? '',
    origen:           incidencia?.origen ?? '',
    area_responsable: incidencia?.area_responsable ?? '',
    descripcion:      incidencia?.descripcion ?? '',
    status:           incidencia?.status ?? 'Abierta',
    responsable:      incidencia?.responsable ?? '',
    fecha:            incidencia?.fecha
                        ? incidencia.fecha.split('T')[0]
                        : new Date().toISOString().split('T')[0],
    fecha_cierre:     incidencia?.fecha_cierre
                        ? incidencia.fecha_cierre.split('T')[0]
                        : '',
    notas:            incidencia?.notas ?? '',
    imagenes_antes:   (incidencia as any)?.imagenes_antes ?? [],
    imagenes_despues: (incidencia as any)?.imagenes_despues ?? [],
  })

  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
  }, [])

  useEffect(() => {
    if (loteSearch.length < 2 && !filterSeccion) { setLotes([]); return }
    let q = dbCat.from('lotes').select('id, cve_lote, lote, calle, numero, id_seccion_fk')
    if (loteSearch.length >= 2) q = q.or(`cve_lote.ilike.%${loteSearch}%,calle.ilike.%${loteSearch}%,numero.ilike.%${loteSearch}%`)
    if (filterSeccion) q = q.eq('id_seccion_fk', Number(filterSeccion))
    q.order('cve_lote').limit(10).then(({ data }) => setLotes(data ?? []))
  }, [loteSearch, filterSeccion])

  // Auto-poner fecha de cierre al marcar Cerrada
  useEffect(() => {
    if (form.status === 'Cerrada' && !form.fecha_cierre) {
      setForm(f => ({ ...f, fecha_cierre: new Date().toISOString().split('T')[0] }))
    }
  }, [form.status])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return }
    setSaving(true); setError('')

    const payload = {
      id_lote_fk:       form.id_lote_fk ? Number(form.id_lote_fk) : null,
      tipo:             form.tipo || null,
      origen:           form.origen || null,
      area_responsable: form.area_responsable || null,
      descripcion:      form.descripcion.trim(),
      status:           form.status || 'Abierta',
      responsable:      form.responsable.trim() || null,
      fecha:            form.fecha || new Date().toISOString(),
      fecha_cierre:     form.fecha_cierre || null,
      notas:            form.notas.trim() || null,
      imagenes_antes:   (form as any).imagenes_antes ?? [],
      imagenes_despues: (form as any).imagenes_despues ?? [],
    }

    const { error: err } = isNew
      ? await dbCtrl.from('incidencias').insert(payload)
      : await dbCtrl.from('incidencias').update(payload).eq('id', incidencia.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <ModalShell modulo="incidencias" titulo={isNew ? 'Nueva Incidencia' : `Editar Incidencia #${incidencia.id}`} onClose={onClose} maxWidth={620}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
        {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </>}
    >

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>
          {error && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', fontSize: 13 }}>{error}</div>}

          {/* Lote */}
          <div>
            <label className="label">Lote</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <select className="select" style={{ width: 155, fontSize: 12 }} value={filterSeccion}
                onChange={e => { setFilterSeccion(e.target.value); setLoteSearch(''); setForm(f => ({ ...f, id_lote_fk: '' })) }}>
                <option value="">Todas las secciones</option>
                {secciones.map((s: any) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input className="input" style={{ paddingLeft: 28 }} placeholder="Clave, calle o número… (opcional)" value={loteSearch}
                  onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
              </div>
            </div>
            {lotes.length > 0 && (
              <div className="card" style={{ marginTop: 2, padding: '4px 0', maxHeight: 220, overflowY: 'auto' }}>
                {lotes.map((l: any) => (
                  <button key={l.id}
                    onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-700)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 14 }}>{l.cve_lote ?? `#${l.lote}`}</span>
                    {(l.calle || l.numero) && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{[l.calle, l.numero].filter(Boolean).join(' ')}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tipo y origen */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Tipo *</label>
              <select className="select" value={form.tipo} onChange={set('tipo')}>
                <option value="">— Seleccionar —</option>
                {tipos.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Origen</label>
              <select className="select" value={form.origen} onChange={set('origen')}>
                <option value="">—</option>
                {origenes.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="label">Descripción *</label>
            <textarea className="input" rows={3} value={form.descripcion} onChange={set('descripcion')}
              placeholder="Describe el incidente con detalle…" style={{ resize: 'vertical' }} />
          </div>

          {/* Área y responsable */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Área Responsable</label>
              <select className="select" value={form.area_responsable} onChange={set('area_responsable')}>
                <option value="">—</option>
                {AREAS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Asignado a</label>
              <input className="input" value={form.responsable} onChange={set('responsable')} placeholder="Nombre del responsable" />
            </div>
          </div>

          {/* Status y fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={set('status')}>
                {STATUS_INC.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={set('fecha')} />
            </div>
            <div>
              <label className="label">Fecha de Cierre</label>
              <input className="input" type="date" value={form.fecha_cierre} onChange={set('fecha_cierre')}
                style={{ color: form.fecha_cierre ? '#4ade80' : undefined }} />
            </div>
          </div>

          {/* Imágenes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <MultiImageUpload
              values={(form as any).imagenes_antes ?? []}
              onChange={urls => setForm((f: any) => ({ ...f, imagenes_antes: urls }))}
              folder="incidencias/antes"
              label="Imágenes Antes"
              max={5}
            />
            <MultiImageUpload
              values={(form as any).imagenes_despues ?? []}
              onChange={urls => setForm((f: any) => ({ ...f, imagenes_despues: urls }))}
              folder="incidencias/despues"
              label="Imágenes Después"
              max={5}
            />
          </div>

          {/* Notas */}
          <div>
            <label className="label">Notas de Seguimiento</label>
            <textarea className="input" rows={2} value={form.notas} onChange={set('notas')}
              placeholder="Acciones tomadas, observaciones, seguimiento…" style={{ resize: 'vertical' }} />
          </div>
        </div>

    </ModalShell>
  )
}

// ── Panel de detalle ──────────────────────────────────────────
function IncidenciaDetail({ incidencia: inc, onClose, onEdit, onRefresh }: {
  incidencia: Incidencia; onClose: () => void; onEdit: () => void; onRefresh: () => void
}) {
  const { authUser } = useAuth()
  const [generandoOT, setGenerandoOT] = useState(false)
  const [otFolio,     setOtFolio]     = useState<string | null>(null)
  const [localOtFk,   setLocalOtFk]   = useState<number | null>(inc.id_ot_fk)

  // Cargar folio de la OT si existe
  useEffect(() => {
    if (!localOtFk) return
    dbCtrl.from('ordenes_trabajo').select('folio').eq('id', localOtFk).single()
      .then(({ data }) => { if (data) setOtFolio(data.folio) })
  }, [localOtFk])

  const generarOT = async () => {
    setGenerandoOT(true)
    // Contar OTs para folio
    const { count } = await dbCtrl.from('ordenes_trabajo').select('id', { count: 'exact', head: true })
    const anio  = new Date().getFullYear()
    const folio = `OT-${anio}-${String((count ?? 0) + 1).padStart(4, '0')}`

    const { data: ot, error } = await dbCtrl.from('ordenes_trabajo').insert({
      folio,
      titulo:      `Atención: ${inc.tipo ?? 'Incidencia'} — ${(inc as any).lotes?.cve_lote ?? 'Lote sin clave'}`,
      tipo_trabajo: inc.area_responsable ?? null,
      prioridad:   'Media',
      status:      'Pendiente',
      descripcion: inc.descripcion ?? null,
      asignado_a:  inc.responsable ?? null,
      anio,
      semana_no:   Math.ceil(((Date.now() - new Date(anio + '-01-01').getTime()) / 86400000 + new Date(anio + '-01-01').getDay() + 1) / 7),
      created_by:  authUser?.nombre ?? null,
    }).select('id, folio').single()

    if (!error && ot) {
      // Vincular OT con la incidencia
      await dbCtrl.from('incidencias').update({ id_ot_fk: ot.id }).eq('id', inc.id)
      setLocalOtFk(ot.id)
      setOtFolio(ot.folio)
      onRefresh()
    }
    setGenerandoOT(false)
  }

  const desvincularOT = async () => {
    if (!confirm('¿Desvincular la OT de esta incidencia?')) return
    await dbCtrl.from('incidencias').update({ id_ot_fk: null }).eq('id', inc.id)
    setLocalOtFk(null)
    setOtFolio(null)
    onRefresh()
  }

  return (
    <ModalShell modulo="incidencias" titulo="Modal" onClose={onClose} maxWidth={520}
    >

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', maxHeight: 'calc(90vh - 140px)' }}>

          {/* Descripción */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Descripción</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, padding: '10px 14px', background: 'var(--surface-700)', borderRadius: 6 }}>
              {inc.descripcion ?? '—'}
            </p>
          </div>

          {/* Detalles */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>Detalles</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
              <InfoRow label="Origen"           value={inc.origen} />
              <InfoRow label="Área Responsable" value={inc.area_responsable} />
              <InfoRow label="Asignado a"       value={inc.responsable} />
              <InfoRow label="Fecha"            value={fmtFecha(inc.fecha)} />
              <InfoRow label="Fecha de Cierre"  value={inc.fecha_cierre ? fmtFecha(inc.fecha_cierre) : 'Pendiente'} />
            </div>
          </div>

          {/* Notas */}
          {inc.notas && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Notas de Seguimiento</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, padding: '10px 14px', background: 'var(--surface-700)', borderRadius: 6 }}>
                {inc.notas}
              </p>
            </div>
          )}

          {/* Cierre */}
          {inc.status === 'Cerrada' && inc.fecha_cierre && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6 }}>
              <CheckCircle size={14} style={{ color: '#4ade80' }} />
              <span style={{ fontSize: 12, color: '#4ade80' }}>Cerrada el {fmtFecha(inc.fecha_cierre)}</span>
            </div>
          )}

          {/* ── Orden de Trabajo ── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Orden de Trabajo
            </div>

            {localOtFk && otFolio ? (
              /* Ya tiene OT vinculada */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Wrench size={15} style={{ color: 'var(--blue)' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)', fontFamily: 'monospace' }}>{otFolio}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Orden de trabajo vinculada</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <a href="/servicios" target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', background: 'var(--blue)', color: '#fff',
                      borderRadius: 6, textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                    <ExternalLink size={11} /> Ver OT
                  </a>
                  <button onClick={desvincularOT}
                    style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, background: 'none',
                      border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer',
                      fontFamily: 'var(--font-body)' }}>
                    Desvincular
                  </button>
                </div>
              </div>
            ) : (
              /* Sin OT — ofrecer generar */
              <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                  Esta incidencia no tiene una Orden de Trabajo asociada. Si requiere intervención operativa, genera una OT pre-llenada con los datos de esta incidencia.
                </p>
                <button className="btn-primary" style={{ fontSize: 12 }}
                  onClick={generarOT} disabled={generandoOT}>
                  {generandoOT
                    ? <><Loader size={13} className="animate-spin" /> Generando…</>
                    : <><Wrench size={13} /> Generar Orden de Trabajo</>}
                </button>
              </div>
            )}
          </div>

        </div>
    </ModalShell>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>{value ?? '—'}</div>
    </div>
  )
}