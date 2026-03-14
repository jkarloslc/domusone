'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, Edit2, Trash2, X, Save,
  Loader, Eye, MessageSquare, Clock, CheckCircle, DollarSign
} from 'lucide-react'

type Afectacion = {
  id: number
  id_lote_fk: number
  tipo: string | null
  descripcion: string | null
  beneficiario: string | null
  con_cobro: boolean
  monto_cuota: number | null
  periodicidad: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  autorizado_por: string | null
  status: string | null
  notas: string | null
  created_at: string
  lotes?: { cve_lote: string | null; lote: number | null }
}

type Nota = {
  id: number
  id_afectacion_fk: number
  nota: string
  usuario: string | null
  created_at: string
}

const TIPOS_AFECTACION = [
  'Servidumbre de Paso', 'Servidumbre de Vista', 'Servidumbre de Agua',
  'Servidumbre de Luz', 'Paso de Tuberías', 'Paso de Cableado',
  'Acceso Vehicular', 'Acceso Peatonal', 'Área Común Compartida', 'Otra',
]
const STATUS_AFECT = ['Activa', 'Suspendida', 'Terminada', 'En Revisión']
const PERIODICIDADES = ['Mensual', 'Trimestral', 'Semestral', 'Anual', 'Única']

const STATUS_COLOR: Record<string, string> = {
  'Activa':      'badge-vendido',
  'Suspendida':  'badge-bloqueado',
  'Terminada':   'badge-default',
  'En Revisión': 'badge-libre',
}

const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmt = (v: number | null) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'

export default function AfectacionesTab() {
  const [afectaciones, setAfectaciones] = useState<Afectacion[]>([])
  const [total, setTotal]               = useState(0)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilter]       = useState('')
  const [loading, setLoading]           = useState(true)
  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Afectacion | null>(null)
  const [detailOpen, setDetailOpen]     = useState<Afectacion | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('afectaciones_proyectos')
      .select('*, lotes(cve_lote, lote)', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    if (search) q = q.or(`descripcion.ilike.%${search}%,beneficiario.ilike.%${search}%`)
    const { data, count, error } = await q
    if (!error) { setAfectaciones(data as Afectacion[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [search, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta afectación y todo su historial?')) return
    await dbCtrl.from('afectaciones_proyectos').delete().eq('id', id)
    fetchData()
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_AFECT.map(s => {
          const count = afectaciones.filter(a => a.status === s).length
          if (!count) return null
          return (
            <div key={s} className="card card-hover" style={{ padding: '10px 16px', cursor: 'pointer', minWidth: 100 }}
              onClick={() => setFilter(filterStatus === s ? '' : s)}>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: filterStatus === s ? 'var(--blue)' : 'var(--text-primary)' }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s}</div>
            </div>
          )
        })}
        {afectaciones.filter(a => a.con_cobro).length > 0 && (
          <div className="card" style={{ padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#15803d' }}>{afectaciones.filter(a => a.con_cobro).length}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Con cobro</div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar descripción, beneficiario…"
              value={search} onChange={e => { setSearch(e.target.value) }} />
          </div>
          <select className="select" style={{ width: 150 }} value={filterStatus} onChange={e => setFilter(e.target.value)}>
            <option value="">Todos los status</option>
            {STATUS_AFECT.map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={14} /> Nueva Afectación
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Tipo</th>
              <th>Beneficiario</th>
              <th>Cobro</th>
              <th>Fecha Inicio</th>
              <th>Fecha Fin</th>
              <th>Autorizado Por</th>
              <th>Status</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
            ) : afectaciones.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin afectaciones registradas</td></tr>
            ) : afectaciones.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{(a as any).lotes?.cve_lote ?? `#${a.id_lote_fk}`}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.tipo ?? '—'}</td>
                <td style={{ fontSize: 13 }}>{a.beneficiario ?? '—'}</td>
                <td>
                  {a.con_cobro ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                        <DollarSign size={11} /> {fmt(a.monto_cuota)}
                      </div>
                      {a.periodicidad && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.periodicidad}</div>}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin cobro</span>
                  )}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtFecha(a.fecha_inicio)}</td>
                <td style={{ fontSize: 12, color: a.fecha_fin ? 'var(--text-secondary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {a.fecha_fin ? fmtFecha(a.fecha_fin) : <span style={{ fontStyle: 'italic' }}>Indefinida</span>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.autorizado_por ?? '—'}</td>
                <td><span className={`badge ${STATUS_COLOR[a.status ?? ''] ?? 'badge-default'}`}>{a.status ?? '—'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetailOpen(a)} title="Ver detalle y notas">
                      <MessageSquare size={13} />
                    </button>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(a); setModalOpen(true) }} title="Editar">
                      <Edit2 size={13} />
                    </button>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(a.id)} title="Eliminar">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <AfectacionModal
          afectacion={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchData() }}
        />
      )}
      {detailOpen && (
        <AfectacionDetail
          afectacion={detailOpen}
          onClose={() => setDetailOpen(null)}
          onEdit={() => { setEditing(detailOpen); setDetailOpen(null); setModalOpen(true) }}
        />
      )}
    </div>
  )
}

// ── Modal CRUD Afectación ─────────────────────────────────────
function AfectacionModal({ afectacion, onClose, onSaved }: { afectacion: Afectacion | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !afectacion
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [lotes, setLotes]           = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState(afectacion ? ((afectacion as any).lotes?.cve_lote ?? '') : '')

  const [form, setForm] = useState({
    id_lote_fk:    afectacion?.id_lote_fk?.toString() ?? '',
    tipo:          afectacion?.tipo ?? '',
    descripcion:   afectacion?.descripcion ?? '',
    beneficiario:  afectacion?.beneficiario ?? '',
    con_cobro:     afectacion?.con_cobro ?? false,
    monto_cuota:   afectacion?.monto_cuota?.toString() ?? '',
    periodicidad:  afectacion?.periodicidad ?? '',
    fecha_inicio:  afectacion?.fecha_inicio ?? '',
    fecha_fin:     afectacion?.fecha_fin ?? '',
    autorizado_por: afectacion?.autorizado_por ?? '',
    status:        afectacion?.status ?? 'Activa',
    notas:         afectacion?.notas ?? '',
  })

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_lote_fk) { setError('Selecciona un lote'); return }
    if (!form.tipo) { setError('El tipo es obligatorio'); return }
    setSaving(true); setError('')

    const payload = {
      id_lote_fk:    Number(form.id_lote_fk),
      tipo:          form.tipo,
      descripcion:   form.descripcion.trim() || null,
      beneficiario:  form.beneficiario.trim() || null,
      con_cobro:     form.con_cobro,
      monto_cuota:   form.con_cobro && form.monto_cuota ? Number(form.monto_cuota) : null,
      periodicidad:  form.con_cobro && form.periodicidad ? form.periodicidad : null,
      fecha_inicio:  form.fecha_inicio || null,
      fecha_fin:     form.fecha_fin || null,
      autorizado_por: form.autorizado_por.trim() || null,
      status:        form.status || 'Activa',
      notas:         form.notas.trim() || null,
    }

    const { error: err } = isNew
      ? await dbCtrl.from('afectaciones_proyectos').insert(payload)
      : await dbCtrl.from('afectaciones_proyectos').update(payload).eq('id', afectacion.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>
            {isNew ? 'Nueva Afectación / Servidumbre' : 'Editar Afectación'}
          </h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 'calc(90vh - 130px)' }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* Lote */}
          <div>
            <label className="label">Lote Afectado *</label>
            <input className="input" placeholder="Busca clave de lote…" value={loteSearch}
              onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
            {lotes.length > 0 && (
              <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                {lotes.map((l: any) => (
                  <button key={l.id}
                    onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }}
                    style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 14 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    {l.cve_lote ?? `#${l.lote}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tipo y status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Tipo de Afectación *</label>
              <select className="select" value={form.tipo} onChange={set('tipo')}>
                <option value="">— Seleccionar —</option>
                {TIPOS_AFECTACION.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={form.status} onChange={set('status')}>
                {STATUS_AFECT.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="label">Descripción</label>
            <textarea className="input" rows={3} value={form.descripcion} onChange={set('descripcion')}
              placeholder="Describe el área, condiciones y alcances de la afectación…" style={{ resize: 'vertical' }} />
          </div>

          {/* Beneficiario y autorizado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Beneficiario</label>
              <input className="input" value={form.beneficiario} onChange={set('beneficiario')} placeholder="Propietario, empresa, persona…" />
            </div>
            <div>
              <label className="label">Autorizado Por</label>
              <input className="input" value={form.autorizado_por} onChange={set('autorizado_por')} placeholder="Nombre o cargo" />
            </div>
          </div>

          {/* Fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Fecha de Inicio</label>
              <input className="input" type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} />
            </div>
            <div>
              <label className="label">Fecha de Fin <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>(vacío = indefinida)</span></label>
              <input className="input" type="date" value={form.fecha_fin} onChange={set('fecha_fin')} />
            </div>
          </div>

          {/* Cobro */}
          <div style={{ padding: '14px 16px', background: form.con_cobro ? '#f0fdf4' : '#f8fafc', border: `1px solid ${form.con_cobro ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.con_cobro ? 12 : 0 }}>
              <input type="checkbox" id="con_cobro" checked={form.con_cobro}
                onChange={e => setForm(f => ({ ...f, con_cobro: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="con_cobro" style={{ fontSize: 13, fontWeight: 500, cursor: 'pointer', color: form.con_cobro ? '#15803d' : 'var(--text-primary)' }}>
                {form.con_cobro ? '✓ Con cobro de cuota adicional' : 'Sin cobro adicional de cuotas'}
              </label>
            </div>
            {form.con_cobro && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Monto de Cuota</label>
                  <input className="input" type="number" step="0.01" value={form.monto_cuota} onChange={set('monto_cuota')} />
                </div>
                <div>
                  <label className="label">Periodicidad</label>
                  <select className="select" value={form.periodicidad} onChange={set('periodicidad')}>
                    <option value="">—</option>
                    {PERIODICIDADES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="label">Notas Generales</label>
            <textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Panel de detalle + historial de notas ────────────────────
function AfectacionDetail({ afectacion: a, onClose, onEdit }: { afectacion: Afectacion; onClose: () => void; onEdit: () => void }) {
  const [notas, setNotas]         = useState<Nota[]>([])
  const [nuevaNota, setNuevaNota] = useState('')
  const [usuario, setUsuario]     = useState('')
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    dbCtrl.from('afectaciones_notas').select('*')
      .eq('id_afectacion_fk', a.id).order('created_at', { ascending: false })
      .then(({ data }) => setNotas(data as Nota[] ?? []))
  }, [a.id])

  const handleAgregarNota = async () => {
    if (!nuevaNota.trim()) return
    setSaving(true)
    await dbCtrl.from('afectaciones_notas').insert({
      id_afectacion_fk: a.id,
      nota:             nuevaNota.trim(),
      usuario:          usuario.trim() || null,
    })
    const { data } = await dbCtrl.from('afectaciones_notas').select('*')
      .eq('id_afectacion_fk', a.id).order('created_at', { ascending: false })
    setNotas(data as Nota[] ?? [])
    setNuevaNota('')
    setSaving(false)
  }

  const handleEliminarNota = async (id: number) => {
    if (!confirm('¿Eliminar esta nota del historial?')) return
    await dbCtrl.from('afectaciones_notas').delete().eq('id', id)
    setNotas(ns => ns.filter(n => n.id !== id))
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--blue)' }}>
                {(a as any).lotes?.cve_lote ?? `#${a.id_lote_fk}`}
              </span>
              <span className={`badge ${STATUS_COLOR[a.status ?? ''] ?? 'badge-default'}`}>{a.status}</span>
              {a.con_cobro && <span className="badge badge-vendido" style={{ fontSize: 10 }}>Con cobro</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{a.tipo}</div>
            {a.beneficiario && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Beneficiario: {a.beneficiario}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" onClick={onEdit} style={{ fontSize: 12 }}><Edit2 size={13} /> Editar</button>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', maxHeight: 'calc(90vh - 100px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Datos generales */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
            {a.descripcion && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Descripción</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '10px 12px', background: '#f8fafc', borderRadius: 7, lineHeight: 1.6 }}>{a.descripcion}</div>
              </div>
            )}
            <InfoRow label="Fecha Inicio"    value={fmtFecha(a.fecha_inicio)} />
            <InfoRow label="Fecha Fin"       value={a.fecha_fin ? fmtFecha(a.fecha_fin) : 'Indefinida'} />
            <InfoRow label="Autorizado Por"  value={a.autorizado_por} />
            {a.con_cobro && <InfoRow label="Cuota" value={`${fmt(a.monto_cuota)} / ${a.periodicidad ?? '—'}`} />}
          </div>

          {/* Historial de notas */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={12} /> Historial de Observaciones ({notas.length})
            </div>

            {/* Nueva nota */}
            <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Agregar Observación</div>
              <textarea
                className="input"
                rows={3}
                value={nuevaNota}
                onChange={e => setNuevaNota(e.target.value)}
                placeholder="Escribe la observación, seguimiento o nota relevante…"
                style={{ resize: 'vertical', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="input" style={{ flex: 1 }} value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="Usuario / responsable (opcional)" />
                <button className="btn-primary" onClick={handleAgregarNota} disabled={saving || !nuevaNota.trim()} style={{ whiteSpace: 'nowrap' }}>
                  {saving ? <Loader size={13} className="animate-spin" /> : <MessageSquare size={13} />}
                  Agregar
                </button>
              </div>
            </div>

            {/* Lista de notas */}
            {notas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                Sin observaciones registradas
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notas.map(n => (
                  <div key={n.id} style={{ padding: '12px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, flex: 1 }}>{n.nota}</p>
                      <button className="btn-ghost" style={{ padding: '2px 6px', flexShrink: 0, color: '#dc2626' }} onClick={() => handleEliminarNota(n.id)}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      {n.usuario && <span style={{ fontWeight: 500 }}>{n.usuario}</span>}
                      <span>{new Date(n.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>{value ?? '—'}</div>
    </div>
  )
}
