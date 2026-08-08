'use client'
import { useEffect, useState } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import ModalShell from '@/components/ui/ModalShell'
import FileUpload from '@/components/FileUpload'
import MultiImageUpload from '@/components/MultiImageUpload'
import {
  FileText, ClipboardCheck, TrendingUp, AlertTriangle, FolderOpen,
  Save, Loader, Plus, Trash2, CheckCircle2, Circle, Lock, Receipt,
} from 'lucide-react'
import {
  ETAPAS, MOTIVOS, STATUS_CONSTRUCCION, STATUS_COLOR,
  TIPOS_INCIDENCIA_OBRA, STATUS_INCIDENCIA_OBRA, STATUS_INCIDENCIA_COLOR,
  fmtFecha,
} from './constants'

type Construccion = {
  id: number
  id_lote_fk: number
  motivo: string | null
  descripcion: string | null
  status: string
  fecha_apertura: string
  fecha_cierre: string | null
  responsable_obra: string | null
  telefono_responsable: string | null
  notas: string | null
  created_at: string
  lotes?: { cve_lote: string | null; lote: number | null }
}

type ChecklistItem = {
  id: number; etapa: string; orden: number; completado: boolean
  fecha_completado: string | null; completado_por: string | null
  documento_url: string | null; notas: string | null
}

type Avance = {
  id: number; fecha: string; porcentaje_avance: number | null
  descripcion: string | null; imagenes: string[]; registrado_por: string | null
}

type IncidenciaObra = {
  id: number; fecha: string; tipo: string | null; descripcion: string
  status: string; tiene_multa: boolean; monto_multa: number | null
  id_cargo_fk: number | null; imagenes: string[]; registrado_por: string | null
}

type Doc = { id: number; etapa: string | null; nombre_archivo: string; url: string; subido_por: string | null; created_at: string }

type TabKey = 'expediente' | 'checklist' | 'avances' | 'incidencias' | 'documentos'

const fmtFechaHoy = () => new Date().toISOString().split('T')[0]

export default function ConstruccionModal({ construccion, onClose, onSaved }: {
  construccion: Construccion | null
  onClose: () => void
  onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [current, setCurrent] = useState<Construccion | null>(construccion)
  const isNew = !current
  const [tab, setTab] = useState<TabKey>('expediente')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [dirty, setDirty]   = useState(false) // hubo algún cambio persistido → refrescar lista al cerrar

  // Lote lookup (solo editable al crear)
  const [lotes, setLotes]           = useState<{ id: number; cve_lote: string | null; lote: number | null }[]>([])
  const [loteSearch, setLoteSearch] = useState(construccion?.lotes?.cve_lote ?? '')

  const [form, setForm] = useState({
    id_lote_fk:           construccion?.id_lote_fk?.toString() ?? '',
    motivo:               construccion?.motivo ?? 'Construcción Nueva',
    descripcion:          construccion?.descripcion ?? '',
    responsable_obra:     construccion?.responsable_obra ?? '',
    telefono_responsable: construccion?.telefono_responsable ?? '',
    fecha_apertura:       construccion?.fecha_apertura ?? fmtFechaHoy(),
    notas:                construccion?.notas ?? '',
    status:               construccion?.status ?? 'Abierto',
  })

  useEffect(() => {
    if (loteSearch.length < 2 || !isNew) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch, isNew])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleClose = () => { if (dirty) onSaved(); else onClose() }

  const handleSaveExpediente = async () => {
    if (!form.id_lote_fk) { setError('Selecciona un lote'); return }
    setSaving(true); setError('')

    if (isNew) {
      const { data: abiertos } = await dbCtrl.from('construcciones')
        .select('id').eq('id_lote_fk', Number(form.id_lote_fk)).eq('status', 'Abierto').limit(1)
      if (abiertos && abiertos.length > 0) {
        setSaving(false)
        setError('Ya existe un expediente de construcción Abierto para este lote. Ciérralo o cancélalo antes de abrir uno nuevo.')
        return
      }

      const payload = {
        id_lote_fk:           Number(form.id_lote_fk),
        motivo:               form.motivo || null,
        descripcion:          form.descripcion.trim() || null,
        status:               'Abierto',
        fecha_apertura:       form.fecha_apertura || fmtFechaHoy(),
        responsable_obra:     form.responsable_obra.trim() || null,
        telefono_responsable: form.telefono_responsable.trim() || null,
        notas:                form.notas.trim() || null,
        created_by:           authUser?.nombre ?? null,
        created_by_id:        authUser?.user.id ?? null,
      }
      const { data, error: err } = await dbCtrl.from('construcciones').insert(payload)
        .select('*, lotes(cve_lote, lote)').single()
      if (err || !data) { setSaving(false); setError(err?.message ?? 'Error al guardar'); return }

      const checklistRows = ETAPAS.map(e => ({ id_construccion_fk: data.id, etapa: e.key, orden: e.orden }))
      await dbCtrl.from('construcciones_checklist').insert(checklistRows)
      await dbCat.from('lotes').update({ status_lote_proyectos: 'Construcción' }).eq('id', Number(form.id_lote_fk))

      setSaving(false); setDirty(true)
      setCurrent(data as Construccion)
      setTab('checklist')
      return
    }

    // Edición de datos del expediente (no toca lote ni checklist)
    const payload = {
      motivo:               form.motivo || null,
      descripcion:          form.descripcion.trim() || null,
      responsable_obra:     form.responsable_obra.trim() || null,
      telefono_responsable: form.telefono_responsable.trim() || null,
      fecha_apertura:       form.fecha_apertura || fmtFechaHoy(),
      notas:                form.notas.trim() || null,
      status:               form.status,
      fecha_cierre:         form.status === 'Cancelado' ? fmtFechaHoy() : current!.fecha_cierre,
    }
    const { error: err } = await dbCtrl.from('construcciones').update(payload).eq('id', current!.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setDirty(true)
    setCurrent(c => c ? { ...c, ...payload } : c)
  }

  const tabs = [
    { key: 'expediente',  label: 'Expediente',  icon: FileText },
    { key: 'checklist',   label: 'Checklist',   icon: ClipboardCheck,  disabled: isNew, disabledHint: 'Guarda el expediente primero' },
    { key: 'avances',     label: 'Avances',     icon: TrendingUp,      disabled: isNew, disabledHint: 'Guarda el expediente primero' },
    { key: 'incidencias', label: 'Incidencias', icon: AlertTriangle,   disabled: isNew, disabledHint: 'Guarda el expediente primero' },
    { key: 'documentos',  label: 'Documentos',  icon: FolderOpen,      disabled: isNew, disabledHint: 'Guarda el expediente primero' },
  ]

  const loteLabel = current?.lotes?.cve_lote ?? (current ? `#${current.id_lote_fk}` : '')

  return (
    <ModalShell modulo="construcciones" maxWidth={760}
      titulo={isNew ? 'Nuevo Expediente de Construcción' : `Expediente: ${loteLabel}`}
      subtitulo={current ? `${current.motivo ?? ''} · ${current.status}` : undefined}
      onClose={handleClose}
      tabs={tabs} activeTab={tab} onTabChange={key => setTab(key as TabKey)}
      footer={tab === 'expediente' ? <>
        <button className="btn-secondary" onClick={handleClose}>{dirty ? 'Cerrar' : 'Cancelar'}</button>
        <button className="btn-primary" onClick={handleSaveExpediente} disabled={saving}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </> : <button className="btn-secondary" onClick={handleClose}>Cerrar</button>}
    >
      {error && <div style={{ padding: '10px', marginBottom: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

      {tab === 'expediente' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="label">Lote *</label>
            {isNew ? (
              <>
                <input className="input" placeholder="Busca clave de lote…" value={loteSearch}
                  onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
                {lotes.length > 0 && (
                  <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                    {lotes.map(l => (
                      <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }}
                        style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#d97706', fontWeight: 600, fontSize: 14 }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        {l.cve_lote ?? `#${l.lote}`}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="input" style={{ background: '#f8fafc', color: 'var(--text-secondary)' }}>{loteLabel}</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Motivo</label>
              <select className="select" value={form.motivo} onChange={set('motivo')}>{MOTIVOS.map(m => <option key={m}>{m}</option>)}</select>
            </div>
            <div><label className="label">Fecha de Apertura</label>
              <input className="input" type="date" value={form.fecha_apertura} onChange={set('fecha_apertura')} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Responsable de Obra</label><input className="input" value={form.responsable_obra} onChange={set('responsable_obra')} /></div>
            <div><label className="label">Teléfono</label><input className="input" value={form.telefono_responsable} onChange={set('telefono_responsable')} /></div>
          </div>

          {!isNew && (
            <div>
              <label className="label">Status</label>
              {current!.status === 'Abierto' ? (
                <select className="select" style={{ maxWidth: 220 }} value={form.status} onChange={set('status')}>
                  <option value="Abierto">Abierto</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              ) : (
                <div><span className={`badge ${STATUS_COLOR[current!.status] ?? 'badge-default'}`}>{current!.status}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                    {current!.status === 'Cerrado' ? 'Se cierra automáticamente al completar el checklist' : ''}
                  </span>
                </div>
              )}
            </div>
          )}

          <div><label className="label">Descripción</label><textarea className="input" rows={2} value={form.descripcion} onChange={set('descripcion')} style={{ resize: 'vertical' }} /></div>
          <div><label className="label">Notas</label><textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} /></div>
        </div>
      )}

      {tab === 'checklist' && current && <ChecklistTab construccionId={current.id} loteId={current.id_lote_fk}
        onConstruccionClosed={(status, fecha_cierre) => { setDirty(true); setCurrent(c => c ? { ...c, status, fecha_cierre } : c) }} />}

      {tab === 'avances' && current && <AvancesTab construccionId={current.id} />}

      {tab === 'incidencias' && current && <IncidenciasTab construccionId={current.id} loteId={current.id_lote_fk} loteCve={loteLabel} />}

      {tab === 'documentos' && current && <DocumentosTab construccionId={current.id} />}
    </ModalShell>
  )
}

// ── Checklist ────────────────────────────────────────────────────────────
function ChecklistTab({ construccionId, loteId, onConstruccionClosed }: {
  construccionId: number; loteId: number
  onConstruccionClosed: (status: string, fecha_cierre: string | null) => void
}) {
  const { authUser } = useAuth()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const fetchItems = () => {
    setLoading(true)
    dbCtrl.from('construcciones_checklist').select('*').eq('id_construccion_fk', construccionId).order('orden')
      .then(({ data }) => { setItems((data ?? []) as ChecklistItem[]); setLoading(false) })
  }
  useEffect(fetchItems, [construccionId])

  const toggle = async (item: ChecklistItem) => {
    const turningOn = !item.completado
    if (turningOn) {
      const bloqueante = items.find(i => i.orden < item.orden && !i.completado)
      if (bloqueante) { alert(`Primero completa la etapa anterior: "${ETAPAS.find(e => e.key === bloqueante.etapa)?.label}"`); return }
    } else {
      const posterior = items.find(i => i.orden > item.orden && i.completado)
      if (posterior) { alert(`Primero revierte la etapa posterior: "${ETAPAS.find(e => e.key === posterior.etapa)?.label}"`); return }
    }

    setBusy(item.id)
    const payload = {
      completado:       turningOn,
      fecha_completado: turningOn ? fmtFechaHoy() : null,
      completado_por:   turningOn ? (authUser?.nombre ?? null) : null,
    }
    await dbCtrl.from('construcciones_checklist').update(payload).eq('id', item.id)

    if (item.etapa === 'acta_terminacion') {
      await dbCat.from('lotes').update({ status_lote_proyectos: turningOn ? 'Casa' : 'Construcción' }).eq('id', loteId)
    }
    if (item.etapa === 'cierre_expediente') {
      const status = turningOn ? 'Cerrado' : 'Abierto'
      const fecha_cierre = turningOn ? fmtFechaHoy() : null
      await dbCtrl.from('construcciones').update({ status, fecha_cierre }).eq('id', construccionId)
      onConstruccionClosed(status, fecha_cierre)
    }

    setBusy(null)
    fetchItems()
  }

  const saveField = async (item: ChecklistItem, field: 'notas' | 'documento_url', value: string | null) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, [field]: value } : i))
    await dbCtrl.from('construcciones_checklist').update({ [field]: value }).eq('id', item.id)
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center' }}><Loader size={18} className="animate-spin" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(item => {
        const etapa = ETAPAS.find(e => e.key === item.etapa)
        const bloqueado = !item.completado && items.some(i => i.orden < item.orden && !i.completado)
        return (
          <div key={item.id} className="card" style={{ padding: '12px 16px', opacity: bloqueado ? 0.6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <button onClick={() => toggle(item)} disabled={busy === item.id}
                style={{ background: 'none', border: 'none', cursor: bloqueado && !item.completado ? 'not-allowed' : 'pointer', padding: 0, marginTop: 1 }}>
                {busy === item.id ? <Loader size={19} className="animate-spin" style={{ color: '#d97706' }} />
                  : item.completado ? <CheckCircle2 size={19} style={{ color: '#15803d' }} />
                  : bloqueado ? <Lock size={17} style={{ color: '#cbd5e1' }} />
                  : <Circle size={19} style={{ color: '#94a3b8' }} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{item.orden}.</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: item.completado ? '#15803d' : 'var(--text-primary)' }}>{etapa?.label}</span>
                  {item.completado && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {fmtFecha(item.fecha_completado)}{item.completado_por ? ` · ${item.completado_por}` : ''}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                  <FileUpload value={item.documento_url} onChange={url => saveField(item, 'documento_url', url)}
                    accept="any" folder={`construcciones/${construccionId}/${item.etapa}`} label="Documento" preview={false} />
                  <div>
                    <label className="label">Notas</label>
                    <textarea className="input" rows={1} defaultValue={item.notas ?? ''} style={{ resize: 'vertical' }}
                      onBlur={e => { if (e.target.value !== (item.notas ?? '')) saveField(item, 'notas', e.target.value.trim() || null) }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Avances de obra ─────────────────────────────────────────────────────
function AvancesTab({ construccionId }: { construccionId: number }) {
  const { authUser, canDelete } = useAuth()
  const [avances, setAvances] = useState<Avance[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ fecha: fmtFechaHoy(), porcentaje_avance: '', descripcion: '', imagenes: [] as string[] })

  const fetchAvances = () => {
    dbCtrl.from('construcciones_avances').select('*').eq('id_construccion_fk', construccionId).order('fecha', { ascending: false })
      .then(({ data }) => setAvances((data ?? []) as Avance[]))
  }
  useEffect(fetchAvances, [construccionId])

  const handleAdd = async () => {
    if (!form.descripcion.trim()) return
    setSaving(true)
    await dbCtrl.from('construcciones_avances').insert({
      id_construccion_fk: construccionId, fecha: form.fecha,
      porcentaje_avance: form.porcentaje_avance ? Number(form.porcentaje_avance) : null,
      descripcion: form.descripcion.trim(), imagenes: form.imagenes,
      registrado_por: authUser?.nombre ?? null,
    })
    setForm({ fecha: fmtFechaHoy(), porcentaje_avance: '', descripcion: '', imagenes: [] })
    setSaving(false); fetchAvances()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este avance?')) return
    await dbCtrl.from('construcciones_avances').delete().eq('id', id); fetchAvances()
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Registrar Avance</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label className="label">Fecha</label><input className="input" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
          <div><label className="label">% de Avance</label><input className="input" type="number" min={0} max={100} value={form.porcentaje_avance} onChange={e => setForm(f => ({ ...f, porcentaje_avance: e.target.value }))} /></div>
        </div>
        <div style={{ marginBottom: 10 }}><label className="label">Descripción</label><textarea className="input" rows={2} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} style={{ resize: 'vertical' }} /></div>
        <MultiImageUpload values={form.imagenes} onChange={urls => setForm(f => ({ ...f, imagenes: urls }))} folder={`construcciones/${construccionId}/avances`} label="Fotos del avance" max={6} />
        <button className="btn-primary" onClick={handleAdd} disabled={saving || !form.descripcion.trim()} style={{ marginTop: 10 }}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />} Registrar Avance
        </button>
      </div>

      {avances.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Sin avances registrados</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {avances.map(a => (
            <div key={a.id} className="card" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtFecha(a.fecha)} {a.porcentaje_avance != null && <span style={{ color: '#d97706' }}>· {a.porcentaje_avance}%</span>}</div>
                  {a.descripcion && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{a.descripcion}</div>}
                  {a.registrado_por && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{a.registrado_por}</div>}
                </div>
                {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(a.id)}><Trash2 size={13} /></button>}
              </div>
              {a.imagenes?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {a.imagenes.map((url, i) => <a key={i} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} /></a>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Incidencias de obra (con multa) ─────────────────────────────────────
function IncidenciasTab({ construccionId, loteId, loteCve }: { construccionId: number; loteId: number; loteCve: string }) {
  const { authUser, canDelete } = useAuth()
  const [incidencias, setIncidencias] = useState<IncidenciaObra[]>([])
  const [saving, setSaving] = useState(false)
  const [genCargo, setGenCargo] = useState<number | null>(null)
  const [form, setForm] = useState({ fecha: fmtFechaHoy(), tipo: '', descripcion: '', tiene_multa: false, monto_multa: '', imagenes: [] as string[] })

  const fetchIncidencias = () => {
    dbCtrl.from('construcciones_incidencias').select('*').eq('id_construccion_fk', construccionId).order('fecha', { ascending: false })
      .then(({ data }) => setIncidencias((data ?? []) as IncidenciaObra[]))
  }
  useEffect(fetchIncidencias, [construccionId])

  const handleAdd = async () => {
    if (!form.descripcion.trim()) return
    setSaving(true)
    await dbCtrl.from('construcciones_incidencias').insert({
      id_construccion_fk: construccionId, fecha: form.fecha, tipo: form.tipo || null,
      descripcion: form.descripcion.trim(), status: 'Abierta',
      tiene_multa: form.tiene_multa, monto_multa: form.tiene_multa && form.monto_multa ? Number(form.monto_multa) : null,
      imagenes: form.imagenes, registrado_por: authUser?.nombre ?? null,
    })
    setForm({ fecha: fmtFechaHoy(), tipo: '', descripcion: '', tiene_multa: false, monto_multa: '', imagenes: [] })
    setSaving(false); fetchIncidencias()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta incidencia?')) return
    await dbCtrl.from('construcciones_incidencias').delete().eq('id', id); fetchIncidencias()
  }

  const setStatus = async (inc: IncidenciaObra, status: string) => {
    await dbCtrl.from('construcciones_incidencias').update({ status }).eq('id', inc.id); fetchIncidencias()
  }

  const generarCargo = async (inc: IncidenciaObra) => {
    if (!inc.monto_multa) return
    if (!confirm(`¿Generar un cargo de $${inc.monto_multa.toLocaleString('es-MX')} en Cobranza (CxC) para el lote ${loteCve}?`)) return
    setGenCargo(inc.id)
    const { data, error } = await dbCtrl.from('cargos').insert({
      id_lote_fk: loteId,
      concepto: `Multa — Construcción (${inc.tipo || 'Incidencia de obra'}) — Lote ${loteCve}`,
      monto: inc.monto_multa, monto_pagado: 0,
      fecha_cargo: fmtFechaHoy(), notas: inc.descripcion, status: 'Pendiente',
      id_construccion_incidencia_fk: inc.id,
    }).select('id').single()
    if (!error && data) {
      await dbCtrl.from('construcciones_incidencias').update({ id_cargo_fk: data.id }).eq('id', inc.id)
    }
    setGenCargo(null); fetchIncidencias()
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Registrar Incidencia</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label className="label">Fecha</label><input className="input" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
          <div><label className="label">Tipo</label><select className="select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}><option value="">—</option>{TIPOS_INCIDENCIA_OBRA.map(t => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div style={{ marginBottom: 10 }}><label className="label">Descripción *</label><textarea className="input" rows={2} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} style={{ resize: 'vertical' }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <input type="checkbox" id="tiene_multa" checked={form.tiene_multa} onChange={e => setForm(f => ({ ...f, tiene_multa: e.target.checked }))} />
          <label htmlFor="tiene_multa" style={{ fontSize: 13, cursor: 'pointer' }}>Genera multa</label>
          {form.tiene_multa && <input className="input" type="number" step="0.01" placeholder="Monto de la multa" value={form.monto_multa} onChange={e => setForm(f => ({ ...f, monto_multa: e.target.value }))} style={{ maxWidth: 160 }} />}
        </div>
        <MultiImageUpload values={form.imagenes} onChange={urls => setForm(f => ({ ...f, imagenes: urls }))} folder={`construcciones/${construccionId}/incidencias`} label="Evidencia fotográfica" max={6} />
        <button className="btn-primary" onClick={handleAdd} disabled={saving || !form.descripcion.trim()} style={{ marginTop: 10 }}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />} Registrar Incidencia
        </button>
      </div>

      {incidencias.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Sin incidencias registradas</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {incidencias.map(inc => (
            <div key={inc.id} className="card" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtFecha(inc.fecha)}</span>
                    {inc.tipo && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {inc.tipo}</span>}
                    <span className={`badge ${STATUS_INCIDENCIA_COLOR[inc.status] ?? 'badge-default'}`}>{inc.status}</span>
                    {inc.tiene_multa && <span className="badge badge-bloqueado">Multa ${inc.monto_multa?.toLocaleString('es-MX')}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{inc.descripcion}</div>
                  {inc.registrado_por && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{inc.registrado_por}</div>}
                  {inc.imagenes?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {inc.imagenes.map((url, i) => <a key={i} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} /></a>)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                  <select className="select" style={{ fontSize: 11, padding: '4px 8px' }} value={inc.status} onChange={e => setStatus(inc, e.target.value)}>
                    {STATUS_INCIDENCIA_OBRA.map(s => <option key={s}>{s}</option>)}
                  </select>
                  {inc.tiene_multa && (
                    inc.id_cargo_fk
                      ? <span style={{ fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}><Receipt size={12} /> Cargo #{inc.id_cargo_fk} generado</span>
                      : <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} disabled={genCargo === inc.id} onClick={() => generarCargo(inc)}>
                          {genCargo === inc.id ? <Loader size={11} className="animate-spin" /> : <Receipt size={11} />} Generar Cargo (CxC)
                        </button>
                  )}
                  {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(inc.id)}><Trash2 size={13} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Documentos generales ─────────────────────────────────────────────────
function DocumentosTab({ construccionId }: { construccionId: number }) {
  const { authUser, canDelete } = useAuth()
  const [docs, setDocs] = useState<Doc[]>([])
  const [etiqueta, setEtiqueta] = useState('')
  const [pendingUrl, setPendingUrl] = useState<string | null>(null)

  const fetchDocs = () => {
    dbCtrl.from('construcciones_documentos').select('*').eq('id_construccion_fk', construccionId).order('created_at', { ascending: false })
      .then(({ data }) => setDocs((data ?? []) as Doc[]))
  }
  useEffect(fetchDocs, [construccionId])

  const handleUpload = async (url: string | null) => {
    setPendingUrl(url)
    if (!url) return
    await dbCtrl.from('construcciones_documentos').insert({
      id_construccion_fk: construccionId,
      nombre_archivo: etiqueta.trim() || url.split('/').pop(),
      url, subido_por: authUser?.nombre ?? null,
    })
    setEtiqueta(''); setPendingUrl(null); fetchDocs()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este documento?')) return
    await dbCtrl.from('construcciones_documentos').delete().eq('id', id); fetchDocs()
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Agregar Documento</div>
        <div style={{ marginBottom: 10 }}><label className="label">Descripción / Etiqueta</label><input className="input" placeholder="Ej. Plano arquitectónico, oficio de vecinos…" value={etiqueta} onChange={e => setEtiqueta(e.target.value)} /></div>
        <FileUpload value={pendingUrl} onChange={handleUpload} accept="any" folder={`construcciones/${construccionId}/documentos`} label="Archivo" preview={false} />
      </div>

      {docs.length === 0 ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Sin documentos adicionales</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 6 }}>
              <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#d97706', fontWeight: 500, textDecoration: 'none' }}>{d.nombre_archivo}</a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtFecha(d.created_at)}{d.subido_por ? ` · ${d.subido_por}` : ''}</span>
                {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(d.id)}><Trash2 size={13} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
