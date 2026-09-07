'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Edit2, Save, Loader, RefreshCw, ToggleLeft, ToggleRight,
  CheckCircle, HardHat, ArrowLeft,
} from 'lucide-react'
import { dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import ModalShell from '@/components/ui/ModalShell'

// ══════════════════════════════════════════════════════════════
// Categorías de Mano de Obra — cfg.cat_categorias_mano_obra
// Sueldo diario de referencia (usado en Rol de Pagos y costeo de OT)
// Compartido entre /catalogos y /hr/categorias-mano-obra
// ══════════════════════════════════════════════════════════════
type CategoriaManoObra = {
  id: number
  categoria: string
  sueldo_diario: number
  activo: boolean
}

const emptyForm = () => ({ categoria: '', sueldo_diario: '' })

export default function CategoriasManoObraPanel({ onBack }: { onBack?: () => void }) {
  const { authUser } = useAuth()
  const puedeEscribir = authUser?.rol === 'superadmin' || authUser?.rol === 'admin' || authUser?.rol === 'admin_organismo'
  const [items, setItems]       = useState<CategoriaManoObra[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<CategoriaManoObra | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState(emptyForm())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCfg.from('cat_categorias_mano_obra').select('*').order('categoria')
    setItems((data as CategoriaManoObra[]) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  const openNew = () => { setEditing(null); setForm(emptyForm()); setError(''); setShowForm(true) }
  const openEdit = (c: CategoriaManoObra) => {
    setEditing(c)
    setForm({ categoria: c.categoria, sueldo_diario: c.sueldo_diario?.toString() ?? '' })
    setError(''); setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.categoria.trim()) { setError('La categoría es obligatoria'); return }
    if (!form.sueldo_diario) { setError('El sueldo diario es obligatorio'); return }
    setSaving(true); setError('')
    const payload: any = {
      categoria: form.categoria.trim(),
      sueldo_diario: Number(form.sueldo_diario),
    }
    if (editing) {
      const { error: err } = await dbCfg.from('cat_categorias_mano_obra').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      payload.activo = true
      const { error: err } = await dbCfg.from('cat_categorias_mano_obra').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false); fetchAll()
  }

  const toggleActivo = async (c: CategoriaManoObra) => {
    await dbCfg.from('cat_categorias_mano_obra').update({ activo: !c.activo }).eq('id', c.id)
    fetchAll()
  }

  const fmt$ = (v: number | null) => v == null ? '—' : '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const activos = items.filter(i => i.activo).length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {onBack && (
            <button className="btn-back" onClick={onBack} title="Regresar" style={{ marginTop: 1 }}><ArrowLeft size={15} /></button>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#b4530918', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HardHat size={15} style={{ color: '#b45309' }} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Categorías Mano de Obra</h2>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>
              Sueldo diario y costo por hora de referencia (sueldo/8)
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchAll} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nueva categoría
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 12 }}><strong style={{ color: '#15803d' }}>{activos}</strong> activas</span>
        </div>
      </div>

      {/* Modal captura / edición */}
      {showForm && (
        <ModalShell
          modulo="hr"
          titulo={editing ? 'Editar categoría' : 'Nueva categoría'}
          subtitulo="HR · Categorías Mano de Obra"
          icono={HardHat}
          maxWidth={420}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                {editing ? 'Guardar cambios' : 'Crear categoría'}
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="label">Categoría *</label>
              <input className="input" value={form.categoria} autoFocus onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="ej. Albañil, Electricista, Jardinero" />
            </div>
            <div>
              <label className="label">Sueldo Diario *</label>
              <input className="input" type="number" min="0" step="0.01" value={form.sueldo_diario} onChange={e => setForm(f => ({ ...f, sueldo_diario: e.target.value }))} placeholder="0.00" />
              {form.sueldo_diario && (
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>
                  Costo por hora de referencia: {fmt$(Number(form.sueldo_diario) / 8)}
                </div>
              )}
            </div>
          </div>
          {error && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>{error}</div>}
        </ModalShell>
      )}

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>ID</th>
              <th>Categoría</th>
              <th style={{ textAlign: 'right' }}>Sueldo Diario</th>
              <th style={{ textAlign: 'right' }}>Costo / Hora</th>
              <th style={{ width: 80, textAlign: 'center' }}>Status</th>
              {puedeEscribir && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Sin categorías. Haz clic en "Nueva categoría" para agregar.
              </td></tr>
            ) : items.map(c => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.45 }}>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.id}</td>
                <td style={{ fontWeight: 500 }}>{c.categoria}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt$(c.sueldo_diario)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{fmt$(c.sueldo_diario / 8)}</td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => toggleActivo(c)} style={{ background: 'none', border: 'none', cursor: puedeEscribir ? 'pointer' : 'default', display: 'flex', margin: '0 auto' }}>
                    {c.activo
                      ? <ToggleRight size={20} style={{ color: '#15803d' }} />
                      : <ToggleLeft size={20} style={{ color: '#cbd5e1' }} />}
                  </button>
                </td>
                {puedeEscribir && (
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => openEdit(c)}><Edit2 size={13} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
