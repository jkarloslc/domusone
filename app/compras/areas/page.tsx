'use client'
import { useAuth } from '@/lib/AuthContext'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import {
  Plus, RefreshCw, Edit2, Trash2, X, Save, Loader,
  ArrowLeft, ToggleLeft, ToggleRight, Layers
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import ModalShell from '@/components/ui/ModalShell'

type Area = { id: number; nombre: string; responsable: string | null; activo: boolean }

export default function AreasPage() {
  const { canWrite, canDelete } = useAuth()
  const router = useRouter()
  const [rows, setRows]       = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<Area | null | 'new'>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbComp.from('areas_solicitantes').select('*').order('nombre')
    setRows(data as Area[] ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleActivo = async (row: Area) => {
    await dbComp.from('areas_solicitantes').update({ activo: !row.activo }).eq('id', row.id)
    fetchData()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta área?')) return
    await dbComp.from('areas_solicitantes').delete().eq('id', id)
    fetchData()
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => router.push('/compras')} title="Regresar"><ArrowLeft size={15} /></button>
          <div>
            <h1 className="page-title">Áreas Solicitantes</h1>
            <p className="page-subtitle">Áreas disponibles en requisiciones · {rows.length} registros</p>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          {canWrite('areas') && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nueva Área</button>}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Área</th>
              <th>Responsable</th>
              <th style={{ width: 80, textAlign: 'center' }}>Status</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin áreas registradas</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.45 }}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Layers size={13} style={{ color: '#7c3aed' }} />
                    </div>
                    <span style={{ fontWeight: 500 }}>{r.nombre}</span>
                  </div>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.responsable ?? '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => toggleActivo(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', margin: '0 auto' }}>
                    {r.activo ? <ToggleRight size={20} style={{ color: '#15803d' }} /> : <ToggleLeft size={20} style={{ color: '#cbd5e1' }} />}
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(r)}><Edit2 size={13} /></button>
                    {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }} onClick={() => handleDelete(r.id)}><Trash2 size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== null && (
        <AreaModal row={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />
      )}
    </div>
  )
}

function AreaModal({ row, onClose, onSaved }: { row: Area | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({ nombre: row?.nombre ?? '', responsable: row?.responsable ?? '', activo: row?.activo ?? true })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = { nombre: form.nombre.trim(), responsable: form.responsable.trim() || null, activo: form.activo }
    const { error: err } = isNew
      ? await dbComp.from('areas_solicitantes').insert(payload)
      : await dbComp.from('areas_solicitantes').update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="compras" titulo={isNew ? 'Nueva Área' : `Editar: ${row.nombre}`} onClose={onClose} maxWidth={400}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </>}
    >
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div><label className="label">Nombre del Área *</label>
            <input className="input" value={form.nombre} onChange={set('nombre')} placeholder="ej. Mantenimiento" />
          </div>
          <div><label className="label">Responsable</label>
            <input className="input" value={form.responsable} onChange={set('responsable')} />
          </div>
          <div><label className="label">Status</label>
            <select className="select" value={form.activo ? 'true' : 'false'}
              onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
          </div>
        </div>
    </ModalShell>
  )
}
