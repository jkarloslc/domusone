'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, X, Save, Loader, RefreshCw, Edit2, Trash2,
  Filter, CheckCircle, Wrench,
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

const TIPOS_SERVICIO = ['Preventivo', 'Correctivo', 'Reparación']
const STATUS_SERVICIO = ['Abierto', 'En Proceso', 'Cerrado']

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Abierto':    { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'En Proceso': { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Cerrado':    { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
}

const TIPO_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Preventivo': { color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
  'Correctivo': { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  'Reparación': { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

const Badge = ({ text, map }: { text: string; map: Record<string, { color: string; bg: string; border: string }> }) => {
  const s = map[text] ?? map[Object.keys(map)[0]]
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

const fmt$ = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 })

const fmtF = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const todayISO = () => new Date().toISOString().slice(0, 10)

// ══════════════════════════════════════════════════════════════
export default function MantenimientoTab({ herramientas, herrMap, onChanged }: {
  herramientas: any[]
  herrMap: Record<number, any>
  onChanged: () => void
}) {
  const { canWrite, canDelete } = useAuth()
  const [registros, setRegistros] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filterHerr,   setFilterHerr]   = useState('')
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState<{ open: boolean; m?: any }>({ open: false })

  const fetchRegistros = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('mantenimiento_herramientas').select('*').eq('activo', true)
      .order('fecha_inicio', { ascending: false }).order('id', { ascending: false })
    if (filterHerr)   q = q.eq('id_herramienta_fk', Number(filterHerr))
    if (filterTipo)   q = q.eq('tipo', filterTipo)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data } = await q
    setRegistros(data ?? [])
    setLoading(false)
  }, [filterHerr, filterTipo, filterStatus])

  useEffect(() => { fetchRegistros() }, [fetchRegistros])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro de servicio?')) return
    await dbCtrl.from('mantenimiento_herramientas').update({ activo: false }).eq('id', id)
    fetchRegistros()
  }

  // KPIs
  const abiertos   = registros.filter(m => m.status !== 'Cerrado')
  const cerrados   = registros.filter(m => m.status === 'Cerrado')
  const costoTotal = registros.reduce((acc, m) => acc + Number(m.costo_total ?? 0), 0)

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Servicios abiertos', value: abiertos.length,        color: '#d97706', bg: '#fffbeb' },
          { label: 'Cerrados',           value: cerrados.length,        color: '#15803d', bg: '#f0fdf4' },
          { label: 'Costo total',        value: fmt$(costoTotal),       color: '#2563eb', bg: '#eff6ff' },
          { label: 'Total registros',    value: registros.length,       color: '#64748b', bg: '#f8fafc' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 12px', background: k.bg }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12,
        padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          <Filter size={11} /> Filtros
        </span>
        <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
        <select className="select" style={{ flex: '1 1 160px', maxWidth: 220, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterHerr} onChange={e => setFilterHerr(e.target.value)}>
          <option value="">Todas las herramientas</option>
          {herramientas.map(h => <option key={h.id} value={h.id}>{h.descripcion}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 110px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Tipo</option>
          {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="select" style={{ flex: '1 1 110px', maxWidth: 150, fontSize: 12, padding: '3px 8px', height: 28 }}
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Status</option>
          {STATUS_SERVICIO.map(s => <option key={s}>{s}</option>)}
        </select>
        {(filterHerr || filterTipo || filterStatus) && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
            onClick={() => { setFilterHerr(''); setFilterTipo(''); setFilterStatus('') }}>
            <X size={11} /> Limpiar
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }} onClick={fetchRegistros}>
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px', height: 28 }}
            onClick={() => setModal({ open: true })}>
            <Plus size={12} /> Nuevo Servicio
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              {['Folio', 'Herramienta', 'Tipo', 'Descripción', 'F. Inicio', 'F. Fin', 'Costo', 'Responsable', 'Status', ''].map(h => (
                <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32 }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                Sin servicios registrados. Usa <strong>Nuevo Servicio</strong> para comenzar.
              </td></tr>
            ) : registros.map(m => {
              const h = herrMap[m.id_herramienta_fk]
              return (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: '#7c3aed', fontWeight: 600, padding: '8px 10px' }}>{m.folio}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{h?.descripcion ?? `#${m.id_herramienta_fk}`}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h?.no_serie ?? ''}</div>
                  </td>
                  <td style={{ padding: '8px 10px' }}><Badge text={m.tipo} map={TIPO_STYLE} /></td>
                  <td style={{ fontSize: 12, padding: '8px 10px', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descripcion ?? ''}>
                    {m.descripcion ?? '—'}
                  </td>
                  <td style={{ fontSize: 11, padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtF(m.fecha_inicio)}</td>
                  <td style={{ fontSize: 11, padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtF(m.fecha_fin)}</td>
                  <td style={{ fontSize: 12, padding: '8px 10px', fontWeight: 600 }}>{fmt$(m.costo_total)}</td>
                  <td style={{ fontSize: 11, padding: '8px 10px', color: 'var(--text-secondary)' }}>{m.responsable ?? '—'}</td>
                  <td style={{ padding: '8px 10px' }}><Badge text={m.status} map={STATUS_STYLE} /></td>
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                    {canWrite('mantenimiento') && (
                      <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setModal({ open: true, m })}>
                        <Edit2 size={12} />
                      </button>
                    )}
                    {canDelete() && (
                      <button className="btn-ghost" style={{ padding: '3px 5px', color: '#dc2626' }} onClick={() => handleDelete(m.id)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal.open && (
        <ServicioModal m={modal.m} herramientas={herramientas}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); fetchRegistros(); onChanged() }} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Crear / Editar Servicio
// ══════════════════════════════════════════════════════════════
function ServicioModal({ m, herramientas, onClose, onSaved }: {
  m?: any; herramientas: any[]; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const isNew = !m?.id
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const [form, setForm] = useState({
    id_herramienta_fk: (m?.id_herramienta_fk ?? '').toString(),
    tipo:              m?.tipo              ?? 'Preventivo',
    descripcion:       m?.descripcion       ?? '',
    fecha_inicio:      m?.fecha_inicio      ?? todayISO(),
    fecha_fin:         m?.fecha_fin         ?? '',
    costo_total:       (m?.costo_total ?? '').toString(),
    responsable:       m?.responsable       ?? '',
    status:            m?.status            ?? 'Abierto',
    notas:             m?.notas             ?? '',
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_herramienta_fk)   { setError('Selecciona una herramienta'); return }
    if (!form.descripcion.trim())  { setError('La descripción es obligatoria'); return }
    if (!form.fecha_inicio)        { setError('La fecha de inicio es obligatoria'); return }
    setSaving(true); setError('')

    const idHerr = Number(form.id_herramienta_fk)
    const payloadBase = {
      id_herramienta_fk: idHerr,
      tipo:              form.tipo,
      descripcion:       form.descripcion.trim(),
      fecha_inicio:      form.fecha_inicio,
      fecha_fin:         form.status === 'Cerrado' ? (form.fecha_fin || todayISO()) : (form.fecha_fin || null),
      costo_total:       form.costo_total ? Number(form.costo_total) : 0,
      responsable:       form.responsable.trim() || null,
      status:            form.status,
      notas:             form.notas.trim() || null,
    }

    if (isNew) {
      const { count } = await dbCtrl.from('mantenimiento_herramientas').select('id', { count: 'exact', head: true })
      const folio = `SERV-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}`
      const { error: err } = await dbCtrl.from('mantenimiento_herramientas').insert({
        ...payloadBase, folio, created_by: authUser?.nombre ?? null,
      })
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await dbCtrl.from('mantenimiento_herramientas').update(payloadBase).eq('id', m.id)
      if (err) { setError(err.message); setSaving(false); return }
    }

    // Sincroniza el status de la herramienta según el status del servicio
    const nuevoStatusHerr = form.status === 'Cerrado' ? 'Disponible' : 'En Mantenimiento'
    await dbCfg.from('herramientas').update({ status: nuevoStatusHerr }).eq('id', idHerr)

    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={isNew ? 'Nuevo Servicio de Mantenimiento' : `Editar — ${m?.folio}`} onClose={onClose} maxWidth={580}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
        </button>
      </>}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

        <div>
          <label className="label" style={{ fontSize: 11 }}>Herramienta *</label>
          <select className="select" style={{ fontSize: 12 }} value={form.id_herramienta_fk} onChange={setF('id_herramienta_fk')}>
            <option value="">— Seleccionar —</option>
            {herramientas.filter(h => h.status !== 'Baja').map(h => {
              const serie = h.no_serie ? ` · SN: ${h.no_serie}` : ''
              return <option key={h.id} value={h.id}>{h.descripcion}{serie}</option>
            })}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Tipo de servicio</label>
            <select className="select" style={{ fontSize: 12 }} value={form.tipo} onChange={setF('tipo')}>
              {TIPOS_SERVICIO.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Status</label>
            <select className="select" style={{ fontSize: 12 }} value={form.status} onChange={setF('status')}>
              {STATUS_SERVICIO.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>Descripción del servicio *</label>
          <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={form.descripcion} onChange={setF('descripcion')}
            placeholder="Ej. Cambio de hilo y filtro de aire, afinación de motor..." />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Fecha inicio *</label>
            <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_inicio} onChange={setF('fecha_inicio')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Fecha fin</label>
            <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_fin} onChange={setF('fecha_fin')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Costo total</label>
            <input className="input" type="number" step="0.01" min="0" style={{ fontSize: 13 }} value={form.costo_total} onChange={setF('costo_total')} placeholder="0.00" />
          </div>
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>Responsable</label>
          <input className="input" style={{ fontSize: 13 }} value={form.responsable} onChange={setF('responsable')} placeholder="Quién realiza el servicio" />
        </div>

        <div>
          <label className="label" style={{ fontSize: 11 }}>Notas</label>
          <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
        </div>

        {form.status !== 'Cerrado' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
            <Wrench size={14} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11, color: '#92400e' }}>
              Mientras este servicio esté <strong>{form.status}</strong>, la herramienta se mostrará como <strong>En Mantenimiento</strong> en el catálogo.
            </span>
          </div>
        )}
        {form.status === 'Cerrado' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
            <CheckCircle size={14} style={{ color: '#15803d', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11, color: '#166534' }}>
              Al cerrar el servicio, la herramienta volverá a status <strong>Disponible</strong>.
            </span>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
