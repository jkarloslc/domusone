'use client'
import { useAuth } from '@/lib/AuthContext'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import {
  Plus, RefreshCw, Edit2, Trash2, X, Save, Loader,
  ArrowLeft, Warehouse, ToggleLeft, ToggleRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import ModalShell from '@/components/ui/ModalShell'

type Almacen = {
  id: number; clave: string; nombre: string
  tipo: string; area: string | null; responsable: string | null; activo: boolean
}

const TIPOS = ['General', 'Particular']

export default function AlmacenesPage() {
  const { canWrite, canDelete } = useAuth()
  const router = useRouter()
  const [rows, setRows]       = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<Almacen | null | 'new'>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbComp.from('almacenes').select('*').order('clave')
    setRows(data as Almacen[] ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleActivo = async (row: Almacen) => {
    await dbComp.from('almacenes').update({ activo: !row.activo }).eq('id', row.id)
    fetchData()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este almacén?')) return
    await dbComp.from('almacenes').delete().eq('id', id)
    fetchData()
  }

  const generales  = rows.filter(r => r.tipo === 'General')
  const particular = rows.filter(r => r.tipo !== 'General')

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Almacenes</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {generales.length} general · {particular.length} particulares
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          {canWrite('almacenes') && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nuevo Almacén</button>}
        </div>
      </div>

      {/* General */}
      {generales.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Almacén General</span>
          </div>
          <AlmacenTable rows={generales} onEdit={setModal} onToggle={toggleActivo} onDelete={handleDelete} />
        </div>
      )}

      {/* Particulares */}
      {particular.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#059669' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Almacenes Particulares / Centros de Costo</span>
          </div>
          <AlmacenTable rows={particular} onEdit={setModal} onToggle={toggleActivo} onDelete={handleDelete} />
        </div>
      )}

      {loading && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      )}

      {modal !== null && (
        <AlmacenModal
          row={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData() }}
        />
      )}
    </div>
  )
}

function AlmacenTable({ rows, onEdit, onToggle, onDelete }: {
  rows: Almacen[]; onEdit: (r: Almacen) => void
  onToggle: (r: Almacen) => void; onDelete: (id: number) => void
}) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 100 }}>Clave</th>
            <th>Nombre</th>
            <th>Área</th>
            <th>Responsable</th>
            <th style={{ width: 80, textAlign: 'center' }}>Status</th>
            <th style={{ width: 80 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.45 }}>
              <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.clave}</td>
              <td style={{ fontWeight: 500 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Warehouse size={13} style={{ color: 'var(--blue)' }} />
                  </div>
                  {r.nombre}
                </div>
              </td>
              <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.area ?? '—'}</td>
              <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.responsable ?? '—'}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => onToggle(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', margin: '0 auto' }}>
                  {r.activo
                    ? <ToggleRight size={20} style={{ color: '#15803d' }} />
                    : <ToggleLeft  size={20} style={{ color: '#cbd5e1' }} />}
                </button>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => onEdit(r)}><Edit2 size={13} /></button>
                  <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }} onClick={() => onDelete(r.id)}><Trash2 size={13} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AlmacenModal({ row, onClose, onSaved }: { row: Almacen | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    clave:       row?.clave       ?? '',
    nombre:      row?.nombre      ?? '',
    tipo:        row?.tipo        ?? 'Particular',
    area:        row?.area        ?? '',
    responsable: row?.responsable ?? '',
    activo:      row?.activo      ?? true,
  })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.clave.trim() || !form.nombre.trim()) { setError('Clave y Nombre son obligatorios'); return }
    setSaving(true); setError('')
    const payload = {
      clave:       form.clave.trim().toUpperCase(),
      nombre:      form.nombre.trim(),
      tipo:        form.tipo,
      area:        form.area.trim() || null,
      responsable: form.responsable.trim() || null,
      activo:      form.activo,
    }
    const { error: err } = isNew
      ? await dbComp.from('almacenes').insert(payload)
      : await dbComp.from('almacenes').update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="almacenes" titulo={isNew ? 'Nuevo Almacén' : row.nombre} onClose={onClose} maxWidth={460}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </>}
    >
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <div><label className="label">Clave *</label>
              <input className="input" value={form.clave} onChange={set('clave')} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
            </div>
            <div><label className="label">Nombre *</label>
              <input className="input" value={form.nombre} onChange={set('nombre')} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Tipo</label>
              <select className="select" value={form.tipo} onChange={set('tipo')}>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="label">Área</label>
              <input className="input" value={form.area} onChange={set('area')} placeholder="ej. Mantenimiento" />
            </div>
          </div>
          <div><label className="label">Responsable</label>
            <input className="input" value={form.responsable} onChange={set('responsable')} />
          </div>
          <div><label className="label">Status</label>
            <select className="select" value={form.activo ? 'true' : 'false'}
              onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
        </div>
    </ModalShell>
  )
}
