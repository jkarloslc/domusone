'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { Plus, Search, RefreshCw, Edit2, Trash2, X, Save, Loader, Package, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type Articulo, fmt, UNIDADES, CATEGORIAS_ART } from '../types'

export default function ArticulosPage() {
  const router = useRouter()
  const [rows, setRows]       = useState<Articulo[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState<Articulo | null | 'new'>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('articulos').select('*', { count: 'exact' }).order('clave')
    if (search) q = q.or(`clave.ilike.%${search}%,nombre.ilike.%${search}%`)
    const { data, count } = await q
    setRows(data as Articulo[] ?? []); setTotal(count ?? 0); setLoading(false)
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este artículo?')) return
    await dbComp.from('articulos').update({ activo: false }).eq('id', id); fetchData()
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Artículos</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Catálogo maestro de productos e insumos · {total} registros</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar clave o nombre…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} /></button>
          <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nuevo Artículo</button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Clave</th><th>Nombre</th><th>Unidad</th><th>Categoría</th>
              <th style={{ textAlign: 'right' }}>Stock Mín.</th>
              <th style={{ textAlign: 'right' }}>Precio Ref.</th>
              <th style={{ width: 80 }}>Status</th>
              <th style={{ width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin artículos registrados</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.45 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.clave}</td>
                <td style={{ fontWeight: 500 }}>{r.nombre}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.unidad}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.categoria ?? '—'}</td>
                <td style={{ textAlign: 'right', fontSize: 12 }}>{r.stock_minimo}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.precio_ref)}</td>
                <td><span className={`badge ${r.activo ? 'badge-vendido' : 'badge-default'}`}>{r.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(r)}><Edit2 size={13} /></button>
                    <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }} onClick={() => handleDelete(r.id)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== null && <ArticuloModal row={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />}
    </div>
  )
}

function ArticuloModal({ row, onClose, onSaved }: { row: Articulo | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    clave:        row?.clave ?? '',
    nombre:       row?.nombre ?? '',
    descripcion:  row?.descripcion ?? '',
    unidad:       row?.unidad ?? 'PZA',
    categoria:    row?.categoria ?? '',
    stock_minimo: row?.stock_minimo?.toString() ?? '0',
    stock_maximo: row?.stock_maximo?.toString() ?? '',
    precio_ref:   row?.precio_ref?.toString() ?? '',
    activo:       row?.activo ?? true,
  })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.clave.trim() || !form.nombre.trim()) { setError('Clave y Nombre son obligatorios'); return }
    setSaving(true); setError('')
    const payload = {
      clave: form.clave.trim().toUpperCase(), nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null, unidad: form.unidad,
      categoria: form.categoria || null,
      stock_minimo: form.stock_minimo ? Number(form.stock_minimo) : 0,
      stock_maximo: form.stock_maximo ? Number(form.stock_maximo) : null,
      precio_ref:   form.precio_ref   ? Number(form.precio_ref)   : null,
      activo: form.activo,
    }
    const { error: err } = isNew
      ? await dbComp.from('articulos').insert(payload)
      : await dbComp.from('articulos').update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{isNew ? 'Nuevo Artículo' : `Editar: ${row.nombre}`}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div><label className="label">Clave *</label><input className="input" value={form.clave} onChange={set('clave')} style={{ textTransform: 'uppercase' }} /></div>
            <div><label className="label">Nombre *</label><input className="input" value={form.nombre} onChange={set('nombre')} /></div>
          </div>
          <div><label className="label">Descripción</label><textarea className="input" rows={2} value={form.descripcion} onChange={set('descripcion')} style={{ resize: 'vertical' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Unidad</label>
              <select className="select" value={form.unidad} onChange={set('unidad')}>
                {UNIDADES.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div><label className="label">Categoría</label>
              <select className="select" value={form.categoria} onChange={set('categoria')}>
                <option value="">— Seleccionar —</option>
                {CATEGORIAS_ART.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label className="label">Stock Mínimo</label><input className="input" type="number" step="0.001" value={form.stock_minimo} onChange={set('stock_minimo')} /></div>
            <div><label className="label">Stock Máximo</label><input className="input" type="number" step="0.001" value={form.stock_maximo} onChange={set('stock_maximo')} /></div>
            <div><label className="label">Precio Referencia</label><input className="input" type="number" step="0.01" value={form.precio_ref} onChange={set('precio_ref')} /></div>
          </div>
          <div><label className="label">Status</label>
            <select className="select" value={form.activo ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
              <option value="true">Activo</option><option value="false">Inactivo</option>
            </select>
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
