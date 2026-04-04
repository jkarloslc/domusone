'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect, useRef } from 'react'
import { dbCtrl, dbCfg, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  Camera, Trash2, ExternalLink, CheckCircle, Wrench, ChevronDown
} from 'lucide-react'

const TIPOS      = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Otro']
const PRIORIDADES = ['Urgente','Alta','Media','Baja']
const STATUSES    = ['Pendiente','En Proceso','En Pausa','Completada','Cancelada']

const PRIORIDAD_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Urgente': { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  'Alta':    { color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
  'Media':   { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Baja':    { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
}
const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Pendiente':  { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'En Proceso': { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'En Pausa':   { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  'Completada': { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'Cancelada':  { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}

const Badge = ({ text, map }: { text: string; map: Record<string, any> }) => {
  const s = map[text] ?? { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {text}
    </span>
  )
}

const semanaActual = () => {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function OrdenesTrabajoTab() {
  const { canWrite, canDelete } = useAuth()
  const [rows, setRows]       = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [secciones, setSecciones] = useState<any[]>([])
  const [secMap, setSecMap]   = useState<Record<number, string>>({})
  const [search, setSearch]   = useState('')
  const debouncedSearch       = useDebounce(search, 300)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterSec,    setFilterSec]    = useState('')
  const [modal,  setModal]    = useState(false)
  const [editingOT, setEditingOT] = useState<any | null>(null)
  const [detail, setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('ordenes_trabajo').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (debouncedSearch)  q = q.or(`folio.ilike.%${debouncedSearch}%,titulo.ilike.%${debouncedSearch}%,asignado_a.ilike.%${debouncedSearch}%`)
    if (filterStatus)     q = q.eq('status', filterStatus)
    if (filterTipo)       q = q.eq('tipo_trabajo', filterTipo)
    if (filterSec)        q = q.eq('id_seccion_fk', Number(filterSec))
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0)
    setLoading(false)
  }, [debouncedSearch, filterStatus, filterTipo, filterSec])

  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setSecciones(data ?? [])
        const m: Record<number, string> = {}
        ;(data ?? []).forEach((s: any) => { m[s.id] = s.nombre })
        setSecMap(m)
      })
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const kpis = {
    pendientes:  rows.filter(r => r.status === 'Pendiente').length,
    enProceso:   rows.filter(r => r.status === 'En Proceso').length,
    completadas: rows.filter(r => r.status === 'Completada').length,
    urgentes:    rows.filter(r => r.prioridad === 'Urgente' && r.status !== 'Completada').length,
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Pendientes',  value: kpis.pendientes,  color: '#d97706', bg: '#fffbeb' },
          { label: 'En Proceso',  value: kpis.enProceso,   color: '#2563eb', bg: '#eff6ff' },
          { label: 'Completadas', value: kpis.completadas, color: '#15803d', bg: '#f0fdf4' },
          { label: 'Urgentes',    value: kpis.urgentes,    color: '#dc2626', bg: '#fef2f2' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px', background: k.bg }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros + Nueva OT */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, título, asignado…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ minWidth: 130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ minWidth: 130 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filterSec} onChange={e => setFilterSec(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" onClick={() => { setEditingOT(null); setModal(true) }}>
            <Plus size={14} /> Nueva OT
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Título</th>
              <th>Tipo</th>
              <th>Sección</th>
              <th>Asignado</th>
              <th>F. Límite</th>
              <th>Prioridad</th>
              <th>Status</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                Sin órdenes de trabajo registradas
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ opacity: r.status === 'Cancelada' ? 0.5 : 1 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.titulo}</div>
                  {r.ubicacion_detalle && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.ubicacion_detalle}</div>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.tipo_trabajo ?? '—'}</td>
                <td style={{ fontSize: 12 }}>{r.id_seccion_fk ? (secMap[r.id_seccion_fk] ?? '—') : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.asignado_a ?? '—'}</td>
                <td style={{ fontSize: 12,
                  color: r.fecha_limite && new Date(r.fecha_limite) < new Date() && r.status !== 'Completada' ? '#dc2626' : 'var(--text-secondary)',
                  fontWeight: r.fecha_limite && new Date(r.fecha_limite) < new Date() && r.status !== 'Completada' ? 600 : 400 }}>
                  {fmtFecha(r.fecha_limite)}
                </td>
                <td><Badge text={r.prioridad ?? 'Media'} map={PRIORIDAD_STYLE} /></td>
                <td><Badge text={r.status} map={STATUS_STYLE} /></td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(r)}>
                    <Eye size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal  && <OTModal secciones={secciones} ot={editingOT}
        onClose={() => { setModal(false); setEditingOT(null) }}
        onSaved={() => { setModal(false); setEditingOT(null); fetchData() }} />}
      {detail && <OTDetail ot={detail} secMap={secMap}
        onClose={() => { setDetail(null); fetchData() }}
        onEdit={ot => { setDetail(null); setEditingOT(ot); setModal(true) }} />}
    </div>
  )
}

// ── OTModal ────────────────────────────────────────────────────
function OTModal({ secciones, ot, onClose, onSaved }: {
  secciones: any[]; ot?: any; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [centrosCosto, setCentros] = useState<any[]>([])
  const [frentes, setFrentes]      = useState<any[]>([])
  const [form, setForm] = useState({
    titulo:             ot?.titulo            ?? '',
    tipo_trabajo:       ot?.tipo_trabajo      ?? '',
    prioridad:          ot?.prioridad         ?? 'Media',
    status:             ot?.status            ?? 'Pendiente',
    id_seccion_fk:      ot?.id_seccion_fk?.toString()      ?? '',
    id_centro_costo_fk: ot?.id_centro_costo_fk?.toString() ?? '',
    id_frente_fk:       ot?.id_frente_fk?.toString()       ?? '',
    ubicacion_detalle:  ot?.ubicacion_detalle ?? '',
    descripcion:        ot?.descripcion       ?? '',
    notas:              ot?.notas             ?? '',
    asignado_a:         ot?.asignado_a        ?? '',
    supervisor:         ot?.supervisor        ?? '',
    fecha_inicio:       ot?.fecha_inicio      ?? '',
    fecha_limite:       ot?.fecha_limite      ?? '',
    semana_no:          ot?.semana_no?.toString() ?? semanaActual().toString(),
  })
  const [recursos, setRecursos] = useState<any[]>(
    ot ? [] : [{ cantidad: '', descripcion: '', costo: '0' }]
  )
  useEffect(() => {
    if (ot?.id) {
      dbCtrl.from('ot_recursos').select('*').eq('id_ot_fk', ot.id).order('id')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setRecursos(data.map((r: any) => ({
              id: r.id, cantidad: r.cantidad ?? '', descripcion: r.descripcion ?? '', costo: r.costo?.toString() ?? '0',
            })))
          }
        })
    }
  }, [ot?.id])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCentros(data ?? []))
    dbCfg.from('frentes').select('id, nombre, id_seccion_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setFrentes(data ?? []))
  }, [])
  const setR = (i: number, k: string, v: string) =>
    setRecursos(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const costoTotal = recursos.reduce((a, r) => a + Number(r.costo || 0), 0)

  const handleSave = async () => {
    if (!form.titulo.trim()) { setError('El título es obligatorio'); return }
    setSaving(true); setError('')
    const isNew = !ot
    let otId = ot?.id
    if (isNew) {
      const { count } = await dbCtrl.from('ordenes_trabajo').select('id', { count: 'exact', head: true })
      const anio  = new Date().getFullYear()
      const folio = `OT-${anio}-${String((count ?? 0) + 1).padStart(4, '0')}`
      const { data: newOT, error: err } = await dbCtrl.from('ordenes_trabajo').insert({
        folio, titulo: form.titulo.trim(), tipo_trabajo: form.tipo_trabajo || null,
        prioridad: form.prioridad, status: form.status,
        id_seccion_fk:      form.id_seccion_fk      ? Number(form.id_seccion_fk)      : null,
        id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
        id_frente_fk:       form.id_frente_fk        ? Number(form.id_frente_fk)       : null,
        ubicacion_detalle: form.ubicacion_detalle.trim() || null,
        descripcion: form.descripcion.trim() || null, notas: form.notas.trim() || null,
        asignado_a: form.asignado_a.trim() || null, supervisor: form.supervisor.trim() || null,
        fecha_inicio: form.fecha_inicio || null, fecha_limite: form.fecha_limite || null,
        semana_no: form.semana_no ? Number(form.semana_no) : semanaActual(),
        anio: new Date().getFullYear(), created_by: authUser?.nombre ?? null,
      }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      otId = newOT.id
    } else {
      const { error: err } = await dbCtrl.from('ordenes_trabajo').update({
        titulo: form.titulo.trim(), tipo_trabajo: form.tipo_trabajo || null,
        prioridad: form.prioridad, status: form.status,
        id_seccion_fk:      form.id_seccion_fk      ? Number(form.id_seccion_fk)      : null,
        id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
        id_frente_fk:       form.id_frente_fk        ? Number(form.id_frente_fk)       : null,
        ubicacion_detalle: form.ubicacion_detalle.trim() || null,
        descripcion: form.descripcion.trim() || null, notas: form.notas.trim() || null,
        asignado_a: form.asignado_a.trim() || null, supervisor: form.supervisor.trim() || null,
        fecha_inicio: form.fecha_inicio || null, fecha_limite: form.fecha_limite || null,
        semana_no: form.semana_no ? Number(form.semana_no) : null,
        fecha_cierre: form.status === 'Completada' ? new Date().toISOString().slice(0,10) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', ot.id)
      if (err) { setError(err.message); setSaving(false); return }
    }
    const recursosValidos = recursos.filter(r => r.descripcion.trim())
    if (otId) {
      if (!isNew) {
        const idsExistentes = recursosValidos.filter(r => r.id).map(r => r.id)
        const { data: recActuales } = await dbCtrl.from('ot_recursos').select('id').eq('id_ot_fk', otId)
        const idsAEliminar = (recActuales ?? []).filter((r: any) => !idsExistentes.includes(r.id)).map((r: any) => r.id)
        if (idsAEliminar.length) await dbCtrl.from('ot_recursos').delete().in('id', idsAEliminar)
        for (const r of recursosValidos.filter(r => r.id)) {
          await dbCtrl.from('ot_recursos').update({ cantidad: r.cantidad || null, descripcion: r.descripcion, costo: Number(r.costo || 0) }).eq('id', r.id)
        }
      }
      const nuevos = recursosValidos.filter(r => !r.id)
      if (nuevos.length) {
        await dbCtrl.from('ot_recursos').insert(
          nuevos.map(r => ({ id_ot_fk: otId, cantidad: r.cantidad || null, descripcion: r.descripcion, costo: Number(r.costo || 0) }))
        )
      }
    }
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 660 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>
            {ot ? 'Editar OT' : 'Nueva Orden de Trabajo'}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div><label className="label">Título *</label>
            <input className="input" value={form.titulo} onChange={setF('titulo')} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label className="label">Tipo</label>
              <select className="select" value={form.tipo_trabajo} onChange={setF('tipo_trabajo')}>
                <option value="">—</option>{TIPOS.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><label className="label">Prioridad</label>
              <select className="select" value={form.prioridad} onChange={setF('prioridad')}>
                {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
              </select></div>
            <div><label className="label">Status</label>
              <select className="select" value={form.status} onChange={setF('status')}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label className="label">Centro de Costo</label>
              <select className="select" value={form.id_centro_costo_fk} onChange={setF('id_centro_costo_fk')}>
                <option value="">— Sin asignar —</option>
                {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select></div>
            <div><label className="label">Sección</label>
              <select className="select" value={form.id_seccion_fk} onChange={setF('id_seccion_fk')}>
                <option value="">—</option>{secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select></div>
            <div><label className="label">Frente</label>
              <select className="select" value={form.id_frente_fk} onChange={setF('id_frente_fk')}>
                <option value="">— Sin asignar —</option>
                {frentes
                  .filter(f => !form.id_seccion_fk || f.id_seccion_fk === Number(form.id_seccion_fk))
                  .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select></div>
          </div>
          <div><label className="label">Ubicación detalle</label>
            <input className="input" value={form.ubicacion_detalle} onChange={setF('ubicacion_detalle')} /></div>
          <div><label className="label">Descripción</label>
            <textarea className="input" rows={2} value={form.descripcion} onChange={setF('descripcion')} style={{ resize: 'vertical' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Asignado a</label><input className="input" value={form.asignado_a} onChange={setF('asignado_a')} /></div>
            <div><label className="label">Supervisor</label><input className="input" value={form.supervisor} onChange={setF('supervisor')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
            <div><label className="label">Fecha Inicio</label><input className="input" type="date" value={form.fecha_inicio} onChange={setF('fecha_inicio')} /></div>
            <div><label className="label">Fecha Límite</label><input className="input" type="date" value={form.fecha_limite} onChange={setF('fecha_limite')} /></div>
            <div><label className="label">Semana</label><input className="input" type="number" value={form.semana_no} onChange={setF('semana_no')} /></div>
          </div>
          <div><label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={setF('notas')} style={{ resize: 'vertical' }} /></div>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Recursos</div>
            {recursos.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 28px', gap: 8, marginBottom: 8 }}>
                <input className="input" value={r.cantidad} onChange={e => setR(i,'cantidad',e.target.value)} placeholder="Cantidad" style={{ fontSize: 12 }} />
                <input className="input" value={r.descripcion} onChange={e => setR(i,'descripcion',e.target.value)} placeholder="Descripción…" style={{ fontSize: 12 }} />
                <input className="input" type="number" step="0.01" value={r.costo} onChange={e => setR(i,'costo',e.target.value)} style={{ textAlign: 'right', fontSize: 12 }} />
                <button className="btn-ghost" style={{ padding: '4px' }} onClick={() => setRecursos(r => r.filter((_,j) => j !== i))}><X size={12} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn-ghost" style={{ fontSize: 12 }}
                onClick={() => setRecursos(r => [...r, { cantidad: '', descripcion: '', costo: '0' }])}>
                <Plus size={12} /> Agregar
              </button>
              {costoTotal > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>
                ${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── OTDetail ───────────────────────────────────────────────────
function OTDetail({ ot, secMap, onClose, onEdit }: {
  ot: any; secMap: Record<number, string>; onClose: () => void; onEdit: (ot: any) => void
}) {
  const { authUser } = useAuth()
  const [recursos,   setRecursos]   = useState<any[]>([])
  const [evidencias, setEvidencias] = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [currentStatus,  setCurrentStatus]  = useState(ot.status)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchDetalle = useCallback(async () => {
    setLoading(true)
    const [{ data: rec }, { data: ev }] = await Promise.all([
      dbCtrl.from('ot_recursos').select('*').eq('id_ot_fk', ot.id).order('id'),
      dbCtrl.from('ot_evidencias').select('*').eq('id_ot_fk', ot.id).order('created_at'),
    ])
    setRecursos(rec ?? [])
    setEvidencias(ev ?? [])
    setLoading(false)
  }, [ot.id])

  useEffect(() => { fetchDetalle() }, [fetchDetalle])

  const costoTotal = recursos.reduce((a, r) => a + Number(r.costo || 0), 0)

  const cambiarStatus = async (nuevoStatus: string) => {
    setUpdatingStatus(true)
    const extra: any = { updated_at: new Date().toISOString() }
    if (nuevoStatus === 'Completada') extra.fecha_cierre = new Date().toISOString().slice(0,10)
    const { error: err } = await dbCtrl.from('ordenes_trabajo').update({ status: nuevoStatus, ...extra }).eq('id', ot.id)
    if (err) { alert(`Error: ${err.message}`); setUpdatingStatus(false); return }
    setCurrentStatus(nuevoStatus)
    setUpdatingStatus(false)
  }

  const subirFoto = async (file: File) => {
    setUploading(true)
    const ext  = file.name.split('.').pop()
    const path = `ot-${ot.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('ot-evidencias').upload(path, file, { upsert: true })
    if (upErr) {
      alert(`Error: ${upErr.message}\nVerifica bucket "ot-evidencias" en Supabase Storage.`)
      setUploading(false); return
    }
    const { data: { publicUrl } } = supabase.storage.from('ot-evidencias').getPublicUrl(path)
    await dbCtrl.from('ot_evidencias').insert({ id_ot_fk: ot.id, url: publicUrl, nombre: file.name, created_by: authUser?.nombre ?? null })
    setUploading(false); fetchDetalle()
  }

  const eliminarEvidencia = async (id: number, url: string) => {
    if (!confirm('¿Eliminar esta evidencia?')) return
    await dbCtrl.from('ot_evidencias').delete().eq('id', id)
    const path = url.split('/ot-evidencias/')[1]
    if (path) await supabase.storage.from('ot-evidencias').remove([path])
    fetchDetalle()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{ot.folio}</span>
                <Badge text={ot.prioridad ?? 'Media'} map={PRIORIDAD_STYLE} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{ot.titulo}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {ot.id_seccion_fk ? secMap[ot.id_seccion_fk] : '—'}
                {ot.ubicacion_detalle && ` · ${ot.ubicacion_detalle}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => onEdit(ot)}>Editar</button>
              <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {STATUSES.map(s => (
              <button key={s} onClick={() => cambiarStatus(s)} disabled={updatingStatus}
                style={{ fontSize: 11, fontWeight: s === currentStatus ? 700 : 400,
                  padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${s === currentStatus ? (STATUS_STYLE[s]?.border ?? '#e2e8f0') : '#e2e8f0'}`,
                  background: s === currentStatus ? (STATUS_STYLE[s]?.bg ?? '#f8fafc') : '#fff',
                  color: s === currentStatus ? (STATUS_STYLE[s]?.color ?? '#64748b') : 'var(--text-muted)' }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 200px)', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            {ot.tipo_trabajo && <DI label="Tipo" value={ot.tipo_trabajo} />}
            {ot.asignado_a   && <DI label="Asignado a" value={ot.asignado_a} />}
            {ot.supervisor   && <DI label="Supervisor" value={ot.supervisor} />}
            {ot.semana_no    && <DI label="Semana" value={`Semana ${ot.semana_no} — ${ot.anio}`} />}
            {ot.fecha_inicio && <DI label="Fecha Inicio" value={fmtFecha(ot.fecha_inicio)} />}
            {ot.fecha_limite && <DI label="Fecha Límite" value={fmtFecha(ot.fecha_limite)} />}
          </div>

          {ot.descripcion && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Descripción</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ot.descripcion}</p>
            </div>
          )}

          {ot.notas && (
            <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>Notas</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{ot.notas}</p>
            </div>
          )}

          {!loading && recursos.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Recursos</div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Cantidad</th><th>Descripción</th><th style={{ textAlign: 'right' }}>Costo</th></tr></thead>
                  <tbody>
                    {recursos.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12 }}>{r.cantidad ?? '—'}</td>
                        <td style={{ fontSize: 13 }}>{r.descripcion}</td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>
                          {Number(r.costo) > 0 ? `$${Number(r.costo).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                      </tr>
                    ))}
                    {costoTotal > 0 && (
                      <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                        <td colSpan={2} style={{ color: 'var(--blue)' }}>TOTAL</td>
                        <td style={{ textAlign: 'right', color: 'var(--blue)' }}>${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Evidencias */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Evidencias ({evidencias.length})
              </div>
              <div>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={async e => {
                    for (const file of Array.from(e.target.files ?? [])) await subirFoto(file)
                    if (fileRef.current) fileRef.current.value = ''
                  }} />
                <button className="btn-secondary" style={{ fontSize: 12 }}
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader size={12} className="animate-spin" /> : <Camera size={12} />}
                  {uploading ? 'Subiendo…' : 'Agregar fotos'}
                </button>
              </div>
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <RefreshCw size={14} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </div>
            ) : evidencias.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13,
                border: '2px dashed #e2e8f0', borderRadius: 10, cursor: 'pointer' }}
                onClick={() => fileRef.current?.click()}>
                <Camera size={20} style={{ margin: '0 auto 6px', display: 'block', opacity: 0.4 }} />
                Sin evidencias
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {evidencias.map(e => (
                  <div key={e.id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 8,
                    overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <img src={e.url} alt={e.nombre ?? 'Evidencia'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 4 }}>
                      <a href={e.url} target="_blank" rel="noopener noreferrer"
                        style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(0,0,0,0.5)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ExternalLink size={12} style={{ color: '#fff' }} />
                      </a>
                      <button onClick={() => eliminarEvidencia(e.id, e.url)}
                        style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(220,38,38,0.8)',
                          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Trash2 size={12} style={{ color: '#fff' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const DI = ({ label, value }: { label: string; value?: string | null }) => value ? (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
) : null
