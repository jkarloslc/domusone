'use client'
import { useAuth } from '@/lib/AuthContext'
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { dbGolf } from '@/lib/supabase'
import {
  Plus, RefreshCw, Edit2, Trash2, Save, Loader, ArrowLeft,
  CloudRain, CheckCircle2, XCircle, AlertCircle, Route,
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Status = 'abierto' | 'cerrado' | 'parcial'

type Estatus = {
  id: number
  fecha: string
  status_campo: Status
  status_caminos: Status
  franja: string | null
  motivo: string | null
  observaciones: string | null
}

const STATUS_CAMPO_CFG: Record<Status, { label: string; color: string; bg: string; icon: React.ComponentType<any> }> = {
  abierto:  { label: 'Abierto',              color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
  cerrado:  { label: 'Cerrado',              color: '#dc2626', bg: '#fee2e2', icon: XCircle },
  parcial:  { label: 'Abierto Parcialmente', color: '#d97706', bg: '#fef3c7', icon: AlertCircle },
}

const STATUS_CAMINOS_CFG: Record<Status, { label: string; color: string; bg: string }> = {
  abierto: { label: 'Caminos Abiertos',  color: '#0891b2', bg: '#e0f7fa' },
  cerrado: { label: 'Caminos Cerrados',  color: '#7c3aed', bg: '#f5f3ff' },
  parcial: { label: 'Caminos Parcial',   color: '#b45309', bg: '#fef3c7' },
}

function getIniMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function StatusBadge({ status, cfg }: { status: Status; cfg: Record<Status, { label: string; color: string; bg: string; icon?: React.ComponentType<any> }> }) {
  const c = cfg[status]
  const Icon = c.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 11.5, fontWeight: 700,
      color: c.color, background: c.bg,
    }}>
      {Icon && <Icon size={12} />}
      {c.label}
    </span>
  )
}

export default function EstatusCampoPage() {
  const { canWrite, canDelete } = useAuth()
  const writer = canWrite('golf-estatus-campo')
  const router = useRouter()

  const [fechaDesde, setFechaDesde] = useState(getIniMes())
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows]       = useState<Estatus[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<Estatus | null | 'new'>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbGolf.from('estatus_campo')
      .select('*')
      .gte('fecha', fechaDesde)
      .lte('fecha', fechaHasta)
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
    setRows((data as Estatus[]) ?? [])
    setLoading(false)
  }, [fechaDesde, fechaHasta])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro de estatus?')) return
    await dbGolf.from('estatus_campo').delete().eq('id', id)
    fetchData()
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => router.push('/golf/mantto-campo')} title="Regresar"><ArrowLeft size={15} /></button>
          <div>
            <h1 className="page-title">Estatus del Campo</h1>
            <p className="page-subtitle">Bitácora de apertura / cierre del campo y de los caminos · {rows.length} registros</p>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          {writer && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nuevo Registro</button>}
        </div>
      </div>

      {/* Filtros de periodo */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18, alignItems: 'flex-end' }}>
        <div>
          <label className="label">Fecha desde</label>
          <input type="date" className="input" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
        </div>
        <div>
          <label className="label">Fecha hasta</label>
          <input type="date" className="input" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Franja</th>
              <th>Status Campo</th>
              <th>Status Caminos</th>
              <th>Motivo / Observaciones</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                <CloudRain size={28} style={{ opacity: 0.3, marginBottom: 8 }} /><br />
                Sin registros en el período seleccionado
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600, color: '#1e293b' }}>{r.fecha}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.franja ?? '—'}</td>
                <td><StatusBadge status={r.status_campo} cfg={STATUS_CAMPO_CFG} /></td>
                <td><StatusBadge status={r.status_caminos} cfg={STATUS_CAMINOS_CFG} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {[r.motivo, r.observaciones].filter(Boolean).join(' — ') || '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {writer && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(r)}><Edit2 size={13} /></button>}
                    {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }} onClick={() => handleDelete(r.id)}><Trash2 size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <EstatusModal row={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />
      )}
    </div>
  )
}

function EstatusModal({ row, onClose, onSaved }: { row: Estatus | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    fecha:          row?.fecha ?? new Date().toISOString().slice(0, 10),
    status_campo:   row?.status_campo ?? 'abierto' as Status,
    status_caminos: row?.status_caminos ?? 'abierto' as Status,
    franja:         row?.franja ?? '',
    motivo:         row?.motivo ?? '',
    observaciones:  row?.observaciones ?? '',
  })

  const handleSave = async () => {
    if (!form.fecha) { setError('La fecha es obligatoria'); return }
    setSaving(true); setError('')
    const payload = {
      fecha:          form.fecha,
      status_campo:   form.status_campo,
      status_caminos: form.status_caminos,
      franja:         form.franja.trim() || null,
      motivo:         form.motivo.trim() || null,
      observaciones:  form.observaciones.trim() || null,
    }
    const { error: err } = isNew
      ? await dbGolf.from('estatus_campo').insert(payload)
      : await dbGolf.from('estatus_campo').update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="golf" icono={CloudRain}
      titulo={isNew ? 'Nuevo Registro de Estatus' : 'Editar Registro de Estatus'}
      subtitulo="Un mismo día puede tener varios registros (ej. cerrado en la mañana, abierto por la tarde)"
      onClose={onClose} maxWidth={520}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

        <div><label className="label">Fecha *</label>
          <input type="date" className="input" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label className="label">Status Campo *</label>
            <select className="select" value={form.status_campo}
              onChange={e => setForm(f => ({ ...f, status_campo: e.target.value as Status }))}>
              <option value="abierto">Abierto</option>
              <option value="cerrado">Cerrado</option>
              <option value="parcial">Abierto Parcialmente</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label className="label"><Route size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} />Status Caminos *</label>
            <select className="select" value={form.status_caminos}
              onChange={e => setForm(f => ({ ...f, status_caminos: e.target.value as Status }))}>
              <option value="abierto">Abiertos</option>
              <option value="cerrado">Cerrados</option>
              <option value="parcial">Parcial</option>
            </select>
          </div>
        </div>

        <div><label className="label">Franja horaria</label>
          <input className="input" value={form.franja} onChange={e => setForm(f => ({ ...f, franja: e.target.value }))}
            placeholder="ej. Todo el día / Mañana / A partir de las 14:00" />
        </div>

        <div><label className="label">Motivo</label>
          <input className="input" value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
            placeholder="ej. Lluvia / anegación, Torneo, Mantenimiento" />
        </div>

        <div><label className="label">Observaciones</label>
          <textarea className="input" rows={3} value={form.observaciones}
            onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} />
        </div>
      </div>
    </ModalShell>
  )
}
