'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { Plus, Search, RefreshCw, Edit2, Trash2, X, Save, Loader, Users, ArrowLeft, Phone, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type Proveedor, FORMAS_PAGO_COMP } from '../types'

export default function ProveedoresPage() {
  const router = useRouter()
  const [rows, setRows]       = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState<Proveedor | null | 'new'>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('proveedores').select('*').order('nombre')
    if (search) q = q.or(`nombre.ilike.%${search}%,rfc.ilike.%${search}%,clave.ilike.%${search}%`)
    const { data } = await q
    setRows(data as Proveedor[] ?? []); setLoading(false)
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Proveedores</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Catálogo de proveedores y condiciones comerciales</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar nombre, RFC, clave…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} /></button>
          <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nuevo Proveedor</button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Clave</th><th>Nombre / Razón Social</th><th>RFC</th>
              <th>Contacto</th><th>Condiciones Pago</th><th>Status</th><th style={{ width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin proveedores registrados</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.45 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.clave}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{r.nombre}</div>
                  {r.razon_social && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.razon_social}</div>}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.rfc ?? '—'}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{r.contacto ?? '—'}</div>
                  {r.telefono && <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} />{r.telefono}</div>}
                  {r.correo   && <div style={{ fontSize: 11, color: 'var(--blue)',         display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={10} />{r.correo}</div>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.condiciones_pago ?? '—'}</td>
                <td><span className={`badge ${r.activo ? 'badge-vendido' : 'badge-default'}`}>{r.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(r)}><Edit2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== null && <ProveedorModal row={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />}
    </div>
  )
}

function ProveedorModal({ row, onClose, onSaved }: { row: Proveedor | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [form, setForm] = useState({
    clave: row?.clave ?? '', nombre: row?.nombre ?? '', razon_social: row?.razon_social ?? '',
    rfc: row?.rfc ?? '', contacto: row?.contacto ?? '', telefono: row?.telefono ?? '',
    correo: row?.correo ?? '', calle: row?.calle ?? '', colonia: row?.colonia ?? '',
    ciudad: row?.ciudad ?? '', estado: row?.estado ?? '', cp: row?.cp ?? '',
    banco: row?.banco ?? '', cuenta_clabe: row?.cuenta_clabe ?? '',
    condiciones_pago: row?.condiciones_pago ?? '', activo: row?.activo ?? true,
  })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.clave.trim() || !form.nombre.trim()) { setError('Clave y Nombre son obligatorios'); return }
    setSaving(true); setError('')
    const payload = { ...form, clave: form.clave.trim().toUpperCase(), nombre: form.nombre.trim(), rfc: form.rfc.trim().toUpperCase() || null }
    const { error: err } = isNew
      ? await dbComp.from('proveedores').insert(payload)
      : await dbComp.from('proveedores').update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const G = ({ children }: { children: React.ReactNode }) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
  const F = ({ label, k, mono }: { label: string; k: string; mono?: boolean }) => (
    <div><label className="label">{label}</label>
      <input className="input" value={(form as any)[k]} onChange={set(k)} style={{ fontFamily: mono ? 'monospace' : undefined, textTransform: mono ? 'uppercase' : undefined }} />
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{isNew ? 'Nuevo Proveedor' : row.nombre}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 'calc(88vh - 120px)' }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <Sec label="Datos Generales">
            <G><F label="Clave *" k="clave" mono /><F label="Nombre *" k="nombre" /></G>
            <G><F label="Razón Social" k="razon_social" /><F label="RFC" k="rfc" mono /></G>
          </Sec>
          <Sec label="Contacto">
            <G><F label="Contacto" k="contacto" /><F label="Teléfono" k="telefono" /></G>
            <F label="Correo" k="correo" />
          </Sec>
          <Sec label="Domicilio">
            <F label="Calle y Número" k="calle" />
            <G><F label="Colonia" k="colonia" /><F label="C.P." k="cp" /></G>
            <G><F label="Ciudad" k="ciudad" /><F label="Estado" k="estado" /></G>
          </Sec>
          <Sec label="Datos Bancarios">
            <G><F label="Banco" k="banco" /><F label="CLABE" k="cuenta_clabe" mono /></G>
            <div><label className="label">Condiciones de Pago</label>
              <select className="select" value={form.condiciones_pago} onChange={set('condiciones_pago')}>
                <option value="">—</option>
                {FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </Sec>
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

const Sec = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  </div>
)
