'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect, useRef } from 'react'
import { dbCtrl, dbCfg, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  Camera, Trash2, ExternalLink, CheckCircle, Wrench, ChevronDown, Printer, Filter
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

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

export default function OrdenesTrabajoTab({ empresa = 'Balvanera' }: { empresa?: 'Balvanera' | 'Oitydisa' }) {
  const { canWrite, canDelete } = useAuth()
  const [rows, setRows]           = useState<any[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [areas, setAreas] = useState<any[]>([])
  const [areaMap, setAreaMap]       = useState<Record<number, string>>({})
  const [centrosCosto, setCentros] = useState<any[]>([])
  const [ccMap,  setCcMap]        = useState<Record<number, string>>({})
  const [frMap,  setFrMap]        = useState<Record<number, string>>({})
  const [search, setSearch]       = useState('')
  const debouncedSearch           = useDebounce(search, 300)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterCC,     setFilterCC]     = useState('')
  const [filterArea,  setFilterArea]    = useState('')
  const [filterFr,     setFilterFr]     = useState('')
  const [frentes,      setFrentesOT]    = useState<any[]>([])
  const [relAF,        setRelAF]        = useState<{id_area: number; id_frente: number}[]>([])
  const [modal,    setModal]    = useState(false)
  const [editingOT, setEditingOT] = useState<any | null>(null)
  const [detail,   setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('ordenes_trabajo').select('*', { count: 'exact' })
      .eq('empresa', empresa)
      .order('created_at', { ascending: false })
    if (debouncedSearch)  q = q.or(`folio.ilike.%${debouncedSearch}%,titulo.ilike.%${debouncedSearch}%,asignado_a.ilike.%${debouncedSearch}%`)
    if (filterStatus)     q = q.eq('status', filterStatus)
    if (filterTipo)       q = q.eq('tipo_trabajo', filterTipo)
    if (filterCC)         q = q.eq('id_centro_costo_fk', Number(filterCC))
    if (filterArea)       q = q.eq('id_area_fk', Number(filterArea))
    if (filterFr)         q = q.eq('id_frente_fk', Number(filterFr))
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0)
    setLoading(false)
  }, [empresa, debouncedSearch, filterStatus, filterTipo, filterCC, filterArea, filterFr])

  useEffect(() => {
    Promise.all([
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre, id_area_fk').eq('activo', true).order('nombre'),
      dbCfg.from('rel_area_frente').select('id_area, id_frente'),
    ]).then(([{ data: secs }, { data: ccs }, { data: frs }, { data: relaf }]) => {
      setAreas(secs ?? [])
      setCentros(ccs ?? [])
      setFrentesOT(frs ?? [])
      setRelAF((relaf ?? []) as any)
      const sm: Record<number, string> = {}; (secs ?? []).forEach((s: any) => { sm[s.id] = s.nombre })
      const cm: Record<number, string> = {}; (ccs ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
      const fm: Record<number, string> = {}; (frs ?? []).forEach((f: any) => { fm[f.id] = f.nombre })
      setAreaMap(sm); setCcMap(cm); setFrMap(fm)
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Pendientes',  value: kpis.pendientes,  color: '#d97706', bg: '#fffbeb' },
          { label: 'En Proceso',  value: kpis.enProceso,   color: '#2563eb', bg: '#eff6ff' },
          { label: 'Completadas', value: kpis.completadas, color: '#15803d', bg: '#f0fdf4' },
          { label: 'Urgentes',    value: kpis.urgentes,    color: '#dc2626', bg: '#fef2f2' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 12px', background: k.bg }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros + Nueva OT */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
        {/* Búsqueda */}
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
          <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input className="input" style={{ paddingLeft: 24, fontSize: 12, height: 28 }}
            placeholder="Folio, título, asignado…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        {/* Filtros tipo / status */}
        <select className="select" style={{ flex: '1 1 90px', maxWidth: 130, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 90px', maxWidth: 130, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Tipo</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        {/* Filtros ubicación */}
        <select className="select" style={{ flex: '1 1 120px', maxWidth: 200, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterCC} onChange={e => { setFilterCC(e.target.value); setFilterArea(''); setFilterFr('') }}>
          <option value="">Centro de costo</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 100px', maxWidth: 170, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterArea} onChange={e => { setFilterArea(e.target.value); setFilterFr('') }}>
          <option value="">Área</option>
          {areas
            .filter((s: any) => !filterCC || s.id_centro_costo_fk === Number(filterCC))
            .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 90px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterFr} onChange={e => setFilterFr(e.target.value)}>
          <option value="">Frente</option>
          {(() => {
            const aId = Number(filterArea)
            const permitidos = filterArea
              ? new Set(relAF.filter(r => r.id_area === aId).map(r => r.id_frente))
              : null
            return frentes
              .filter(f => !permitidos || permitidos.has(f.id))
              .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)
          })()}
        </select>
        {(search || filterStatus || filterTipo || filterCC || filterArea || filterFr) && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
            onClick={() => { setSearch(''); setFilterStatus(''); setFilterTipo(''); setFilterCC(''); setFilterArea(''); setFilterFr('') }}>
            <X size={11} /> Limpiar
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 8px', height: 28 }} onClick={fetchData}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px', height: 28 }} onClick={() => { setEditingOT(null); setModal(true) }}>
            <Plus size={12} /> Nueva OT
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Folio</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Título</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Tipo</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Área</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Asignado</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>F. Límite</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Prioridad</th>
              <th style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>Status</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32 }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                Sin órdenes de trabajo registradas
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ opacity: r.status === 'Cancelada' ? 0.5 : 1 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600, padding: '8px 10px' }}>{r.folio}</td>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{r.titulo}</div>
                  {r.ubicacion_detalle && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.ubicacion_detalle}</div>}
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{r.tipo_trabajo ?? '—'}</td>
                <td style={{ fontSize: 11, padding: '8px 10px' }}>{r.id_area_fk ? (areaMap[r.id_area_fk] ?? '—') : '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{r.asignado_a ?? '—'}</td>
                <td style={{ fontSize: 11, padding: '8px 10px',
                  color: r.fecha_limite && new Date(r.fecha_limite) < new Date() && r.status !== 'Completada' ? '#dc2626' : 'var(--text-secondary)',
                  fontWeight: r.fecha_limite && new Date(r.fecha_limite) < new Date() && r.status !== 'Completada' ? 600 : 400 }}>
                  {fmtFecha(r.fecha_limite)}
                </td>
                <td style={{ padding: '8px 10px' }}><Badge text={r.prioridad ?? 'Media'} map={PRIORIDAD_STYLE} /></td>
                <td style={{ padding: '8px 10px' }}><Badge text={r.status} map={STATUS_STYLE} /></td>
                <td style={{ padding: '4px 6px' }}>
                  <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setDetail(r)}>
                    <Eye size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal  && <OTModal areas={areas} ot={editingOT} empresa={empresa}
        onClose={() => { setModal(false); setEditingOT(null) }}
        onSaved={() => { setModal(false); setEditingOT(null); fetchData() }} />}
      {detail && <OTDetail ot={detail} areaMap={areaMap} ccMap={ccMap} frMap={frMap}
        onClose={() => { setDetail(null); fetchData() }}
        onEdit={ot => { setDetail(null); setEditingOT(ot); setModal(true) }} />}
    </div>
  )
}

// ── OTModal ────────────────────────────────────────────────────
function OTModal({ areas, ot, empresa = 'Balvanera', onClose, onSaved }: {
  areas: any[]; ot?: any; empresa?: 'Balvanera' | 'Oitydisa'; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [centrosCosto, setCentros] = useState<any[]>([])
  const [frentes, setFrentes]      = useState<any[]>([])
  const [relAF, setRelAFModal]     = useState<{id_area: number; id_frente: number}[]>([])
  const [form, setForm] = useState({
    titulo:             ot?.titulo            ?? '',
    tipo_trabajo:       ot?.tipo_trabajo      ?? '',
    prioridad:          ot?.prioridad         ?? 'Media',
    status:             ot?.status            ?? 'Pendiente',
    id_area_fk:         ot?.id_area_fk?.toString()      ?? '',
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
    dbCfg.from('frentes').select('id, nombre, id_area_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setFrentes(data ?? []))
    dbCfg.from('rel_area_frente').select('id_area, id_frente')
      .then(({ data }) => setRelAFModal((data ?? []) as any))
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
      const prefijo = empresa === 'Oitydisa' ? 'OTO' : 'OTB'
      const { count } = await dbCtrl.from('ordenes_trabajo')
        .select('id', { count: 'exact', head: true }).eq('empresa', empresa)
      const anio  = new Date().getFullYear()
      const folio = `${prefijo}-${anio}-${String((count ?? 0) + 1).padStart(4, '0')}`
      const { data: newOT, error: err } = await dbCtrl.from('ordenes_trabajo').insert({
        folio, empresa, titulo: form.titulo.trim(), tipo_trabajo: form.tipo_trabajo || null,
        prioridad: form.prioridad, status: form.status,
        id_area_fk:         form.id_area_fk      ? Number(form.id_area_fk)      : null,
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
        id_area_fk:         form.id_area_fk      ? Number(form.id_area_fk)      : null,
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
    <ModalShell modulo="mantenimiento" titulo={ot ? 'Editar OT' : 'Nueva Orden de Trabajo'} onClose={onClose} maxWidth={620}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
        </button>
      </>}
    >
        <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}
          <div><label className="label" style={{ fontSize: 11 }}>Título *</label>
            <input className="input" style={{ fontSize: 13 }} value={form.titulo} onChange={setF('titulo')} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Tipo</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo_trabajo} onChange={setF('tipo_trabajo')}>
                <option value="">—</option>{TIPOS.map(t => <option key={t}>{t}</option>)}
              </select></div>
            <div><label className="label" style={{ fontSize: 11 }}>Prioridad</label>
              <select className="select" style={{ fontSize: 12 }} value={form.prioridad} onChange={setF('prioridad')}>
                {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
              </select></div>
            <div><label className="label" style={{ fontSize: 11 }}>Status</label>
              <select className="select" style={{ fontSize: 12 }} value={form.status} onChange={setF('status')}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Centro de Costo</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_centro_costo_fk}
                onChange={e => setForm(f => ({ ...f, id_centro_costo_fk: e.target.value, id_area_fk: '', id_frente_fk: '' }))}>
                <option value="">—</option>
                {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select></div>
            <div><label className="label" style={{ fontSize: 11 }}>Área</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk}
                onChange={e => setForm(f => ({ ...f, id_area_fk: e.target.value, id_frente_fk: '' }))}>
                <option value="">—</option>
                {(areas as any[])
                  .filter(s => !form.id_centro_costo_fk || s.id_centro_costo_fk === Number(form.id_centro_costo_fk))
                  .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select></div>
            <div><label className="label" style={{ fontSize: 11 }}>Frente</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_frente_fk} onChange={setF('id_frente_fk')}>
                <option value="">—</option>
                {(() => {
                  const aId = Number(form.id_area_fk)
                  const permitidos = form.id_area_fk
                    ? new Set(relAF.filter(r => r.id_area === aId).map(r => r.id_frente))
                    : null
                  return frentes
                    .filter(f => !permitidos || permitidos.has(f.id))
                    .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)
                })()}
              </select></div>
          </div>
          <div><label className="label" style={{ fontSize: 11 }}>Ubicación detalle</label>
            <input className="input" style={{ fontSize: 13 }} value={form.ubicacion_detalle} onChange={setF('ubicacion_detalle')} /></div>
          <div><label className="label" style={{ fontSize: 11 }}>Descripción</label>
            <textarea className="input" rows={2} value={form.descripcion} onChange={setF('descripcion')} style={{ fontSize: 13, resize: 'vertical' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Asignado a</label><input className="input" style={{ fontSize: 13 }} value={form.asignado_a} onChange={setF('asignado_a')} /></div>
            <div><label className="label" style={{ fontSize: 11 }}>Supervisor</label><input className="input" style={{ fontSize: 13 }} value={form.supervisor} onChange={setF('supervisor')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>F. Inicio</label><input className="input" style={{ fontSize: 13 }} type="date" value={form.fecha_inicio} onChange={setF('fecha_inicio')} /></div>
            <div><label className="label" style={{ fontSize: 11 }}>F. Límite</label><input className="input" style={{ fontSize: 13 }} type="date" value={form.fecha_limite} onChange={setF('fecha_limite')} /></div>
            <div><label className="label" style={{ fontSize: 11 }}>Semana</label><input className="input" style={{ fontSize: 13 }} type="number" value={form.semana_no} onChange={setF('semana_no')} /></div>
          </div>
          <div><label className="label" style={{ fontSize: 11 }}>Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={setF('notas')} style={{ fontSize: 13, resize: 'vertical' }} /></div>
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Recursos</div>
            {recursos.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px 24px', gap: 6, marginBottom: 6 }}>
                <input className="input" style={{ fontSize: 11 }} value={r.cantidad} onChange={e => setR(i,'cantidad',e.target.value)} placeholder="Cant." />
                <input className="input" style={{ fontSize: 11 }} value={r.descripcion} onChange={e => setR(i,'descripcion',e.target.value)} placeholder="Descripción…" />
                <input className="input" type="number" step="0.01" value={r.costo} onChange={e => setR(i,'costo',e.target.value)} style={{ textAlign: 'right', fontSize: 11 }} />
                <button className="btn-ghost" style={{ padding: '3px' }} onClick={() => setRecursos(r => r.filter((_,j) => j !== i))}><X size={10} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn-ghost" style={{ fontSize: 11 }}
                onClick={() => setRecursos(r => [...r, { cantidad: '', descripcion: '', costo: '0' }])}>
                <Plus size={10} /> Agregar
              </button>
              {costoTotal > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>
                ${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </div>}
            </div>
          </div>
        </div>
    </ModalShell>
  )
}

// ── OTDetail ───────────────────────────────────────────────────
function OTDetail({ ot, areaMap, ccMap, frMap, onClose, onEdit }: {
  ot: any
  areaMap: Record<number, string>
  ccMap: Record<number, string>
  frMap: Record<number, string>
  onClose: () => void
  onEdit: (ot: any) => void
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

  const imprimirOT = async () => {
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}

    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;">🔧</div>`

    const seccion = ot.id_area_fk ? areaMap[ot.id_area_fk] ?? '—' : '—'

    const priCol: Record<string, string> = {
      'Urgente': '#dc2626', 'Alta': '#ea580c', 'Media': '#d97706', 'Baja': '#64748b'
    }
    const staCol: Record<string, string> = {
      'Pendiente': '#d97706', 'En Proceso': '#2563eb', 'En Pausa': '#7c3aed',
      'Completada': '#15803d', 'Cancelada': '#94a3b8'
    }

    const recursoRows = recursos.map(r =>
      `<tr>
        <td>${r.cantidad ?? '—'}</td>
        <td>${r.descripcion ?? ''}</td>
        <td style="text-align:right">${Number(r.costo) > 0 ? '$' + Number(r.costo).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'}</td>
      </tr>`
    ).join('')

    const costoHtml = costoTotal > 0
      ? `<tr style="background:#eff6ff;font-weight:700">
          <td colspan="2" style="color:#0D4F80">TOTAL</td>
          <td style="text-align:right;color:#0D4F80">$${costoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
        </tr>`
      : ''

    const html = `<!DOCTYPE html><html><head><title>OT ${ot.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 36px; font-size: 13px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 20px; }
        .org-nombre { font-size: 17px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 14px; font-weight: 700; color: #0D4F80; margin-bottom: 2px; }
        h2 { font-size: 15px; font-weight: 700; color: #0D4F80; margin: 20px 0 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 30px; margin-bottom: 14px; }
        .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin-bottom: 2px; }
        .val { font-size: 13px; color: #1e293b; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 7px 11px; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
        .desc { background: #f8fafc; border-left: 3px solid #0D4F80; padding: 10px 14px; border-radius: 4px; font-size: 13px; line-height: 1.6; margin-bottom: 10px; }
        .notas { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; font-size: 12px; margin-bottom: 10px; }
        .firmas { display: flex; gap: 50px; margin-top: 50px; }
        .firma { text-align: center; border-top: 1px solid #000; padding-top: 8px; width: 160px; font-size: 11px; color: #64748b; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
          <div style="font-size:12px;font-weight:600;color:#0D4F80;margin-top:3px;">Orden de Trabajo</div>
        </div>
        <div style="margin-left:auto;text-align:right;font-size:11px;color:#94a3b8;">
          Folio: <strong style="color:#0D4F80;font-size:16px;">${ot.folio}</strong><br/>
          ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <span style="font-size:18px;font-weight:700;">${ot.titulo}</span>
        <span class="badge" style="color:${priCol[ot.prioridad ?? 'Media'] ?? '#64748b'};background:${priCol[ot.prioridad ?? 'Media'] ? priCol[ot.prioridad ?? 'Media'] + '18' : '#f8fafc'};border:1px solid ${priCol[ot.prioridad ?? 'Media'] ?? '#e2e8f0'}44;">${ot.prioridad ?? 'Media'}</span>
        <span class="badge" style="color:${staCol[currentStatus] ?? '#64748b'};background:${staCol[currentStatus] ? staCol[currentStatus] + '18' : '#f8fafc'};border:1px solid ${staCol[currentStatus] ?? '#e2e8f0'}44;">${currentStatus}</span>
      </div>

      <div class="grid">
        <div><div class="lbl">Área</div><div class="val">${seccion}</div></div>
        ${ot.ubicacion_detalle ? `<div><div class="lbl">Ubicación Detalle</div><div class="val">${ot.ubicacion_detalle}</div></div>` : ''}
        ${ot.tipo_trabajo ? `<div><div class="lbl">Tipo de Trabajo</div><div class="val">${ot.tipo_trabajo}</div></div>` : ''}
        ${ot.id_centro_costo_fk ? `<div><div class="lbl">Centro de Costo</div><div class="val">${ccMap[ot.id_centro_costo_fk] ?? '—'}</div></div>` : ''}
        ${ot.id_frente_fk ? `<div><div class="lbl">Frente</div><div class="val">${frMap[ot.id_frente_fk] ?? '—'}</div></div>` : ''}
        ${ot.asignado_a ? `<div><div class="lbl">Asignado a</div><div class="val">${ot.asignado_a}</div></div>` : ''}
        ${ot.supervisor ? `<div><div class="lbl">Supervisor</div><div class="val">${ot.supervisor}</div></div>` : ''}
        ${ot.semana_no ? `<div><div class="lbl">Semana</div><div class="val">Semana ${ot.semana_no} — ${ot.anio}</div></div>` : ''}
        ${ot.fecha_inicio ? `<div><div class="lbl">Fecha Inicio</div><div class="val">${fmtFecha(ot.fecha_inicio)}</div></div>` : ''}
        ${ot.fecha_limite ? `<div><div class="lbl">Fecha Límite</div><div class="val">${fmtFecha(ot.fecha_limite)}</div></div>` : ''}
        ${ot.fecha_cierre ? `<div><div class="lbl">Fecha Cierre</div><div class="val">${fmtFecha(ot.fecha_cierre)}</div></div>` : ''}
      </div>

      ${ot.descripcion ? `<h2>Descripción</h2><div class="desc">${ot.descripcion}</div>` : ''}
      ${ot.notas ? `<h2>Notas</h2><div class="notas">${ot.notas}</div>` : ''}

      ${recursos.length > 0 ? `
      <h2>Recursos</h2>
      <table>
        <thead><tr><th>Cantidad</th><th>Descripción</th><th style="text-align:right">Costo</th></tr></thead>
        <tbody>
          ${recursoRows}
          ${costoHtml}
        </tbody>
      </table>` : ''}

      ${evidencias.length > 0 ? `<p style="font-size:12px;color:#64748b;">${evidencias.length} evidencia(s) fotográfica(s) adjuntas en el sistema.</p>` : ''}

      <div class="firmas">
        <div class="firma">Elaboró</div>
        <div class="firma">Supervisó</div>
        <div class="firma">Conforme</div>
      </div>
      </body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(html)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  return (
    <ModalShell modulo="mantenimiento" titulo="Modal" onClose={onClose} maxWidth={640}
    >

        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 200px)', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            {ot.tipo_trabajo && <DI label="Tipo" value={ot.tipo_trabajo} />}
            {ot.asignado_a   && <DI label="Asignado a" value={ot.asignado_a} />}
            {ot.supervisor   && <DI label="Supervisor" value={ot.supervisor} />}
            {ot.semana_no    && <DI label="Semana" value={`Semana ${ot.semana_no} — ${ot.anio}`} />}
            {ot.fecha_inicio && <DI label="Fecha Inicio" value={fmtFecha(ot.fecha_inicio)} />}
            {ot.fecha_limite && <DI label="Fecha Límite" value={fmtFecha(ot.fecha_limite)} />}
            {ot.fecha_cierre && <DI label="Fecha Cierre" value={fmtFecha(ot.fecha_cierre)} />}
            {ot.id_centro_costo_fk && <DI label="Centro de Costo" value={ccMap[ot.id_centro_costo_fk] ?? `#${ot.id_centro_costo_fk}`} />}
            {ot.id_area_fk      && <DI label="Área"          value={areaMap[ot.id_area_fk]      ?? `#${ot.id_area_fk}`} />}
            {ot.id_frente_fk       && <DI label="Frente"           value={frMap[ot.id_frente_fk]        ?? `#${ot.id_frente_fk}`} />}
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
    </ModalShell>
  )
}

const DI = ({ label, value }: { label: string; value?: string | null }) => value ? (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div>
  </div>
) : null
