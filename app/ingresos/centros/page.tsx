'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCfg } from '@/lib/supabase'
import { Plus, Edit2, Tag, Layers, ChevronLeft, X, Save, Loader } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import ModalShell from '@/components/ui/ModalShell'

type Centro = {
  id: number
  nombre: string
  codigo: string | null
  tipo: string | null
  tipo_desglose: string    // 'unico' | 'secciones' | 'frentes'
  activo: boolean
  notas: string | null
  created_at: string
}

const TIPOS = ['golf', 'cuotas', 'rentas_espacios', 'caballerizas', 'otro']
const TIPO_LABEL: Record<string, string> = {
  golf: 'Golf', cuotas: 'Cuotas Residencial',
  rentas_espacios: 'Renta de Espacios', caballerizas: 'Caballerizas', otro: 'Otro',
}
const TIPO_COLOR: Record<string, string> = {
  golf: '#059669', cuotas: '#2563eb', rentas_espacios: '#7c3aed', caballerizas: '#d97706', otro: '#64748b',
}

// ── Modal alta/edición ────────────────────────────────────────
function CentroModal({ centro, onClose, onSaved }: { centro: Centro | null; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const [form, setForm] = useState<Partial<Centro>>(centro ?? {
    nombre: '', codigo: '', tipo: 'otro', tipo_desglose: 'unico', activo: true, notas: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k: keyof Centro, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nombre?.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre:        form.nombre!.trim(),
      codigo:        form.codigo?.trim() || null,
      tipo:          form.tipo || 'otro',
      tipo_desglose: form.tipo_desglose || 'unico',
      activo:        form.activo ?? true,
      notas:         form.notas?.trim() || null,
    }
    const { error: err } = centro?.id
      ? await dbCfg.from('centros_ingreso').update(payload).eq('id', centro.id)
      : await dbCfg.from('centros_ingreso').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <ModalShell modulo="ingresos" titulo={centro ? 'Editar Centro' : 'Nuevo Centro de Ingreso'} onClose={onClose} maxWidth={500}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
        {centro ? 'Guardar cambios' : 'Crear Centro'}
        </button>
      </>}
    >
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>{error}</div>}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Nombre *</label>
            <input className="input" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} placeholder="ej. Golf" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Código</label>
              <input className="input" value={form.codigo ?? ''} onChange={e => set('codigo', e.target.value.toUpperCase())} placeholder="GOLF" maxLength={8} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select className="select" value={form.tipo ?? 'otro'} onChange={e => set('tipo', e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Tipo de captura</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { val: 'unico',     label: 'Monto único',           desc: 'Un solo total por recibo' },
                { val: 'secciones', label: 'Desglose por sección',  desc: 'Monto por cada sección del residencial' },
                { val: 'frentes',   label: 'Desglose por frente',   desc: 'Monto por cada frente de ingreso' },
              ].map(opt => (
                <button key={opt.val} onClick={() => set('tipo_desglose', opt.val)}
                  style={{ flex: 1, minWidth: 130, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${form.tipo_desglose === opt.val ? '#2563eb' : '#e2e8f0'}`,
                    background: form.tipo_desglose === opt.val ? '#eff6ff' : '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: form.tipo_desglose === opt.val ? '#1d4ed8' : '#374151' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea className="input" rows={2} value={form.notas ?? ''} onChange={e => set('notas', e.target.value)}
              style={{ resize: 'vertical', minHeight: 56 }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="activo-chk" checked={form.activo ?? true} onChange={e => set('activo', e.target.checked)} />
            <label htmlFor="activo-chk" style={{ fontSize: 13, color: '#374151' }}>Centro activo</label>
          </div>
        </div>
    </ModalShell>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function CentrosIngresoPage() {
  const router = useRouter()
  const { canWrite } = useAuth()
  const [centros, setCentros] = useState<Centro[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState<Centro | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCfg.from('centros_ingreso').select('*').order('nombre')
    setCentros(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <button onClick={() => router.push('/ingresos')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, marginBottom: 6 }}>
            <ChevronLeft size={14} /> Ingresos
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Tag size={16} style={{ color: '#7c3aed' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Catálogo</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Centros de Ingreso</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            Configura los centros y su tipo de captura
          </p>
        </div>
        {canWrite('ingresos') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModal(true) }}>
            <Plus size={14} /> Nuevo Centro
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            <Loader size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
          </div>
        ) : centros.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
            <Tag size={36} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <div style={{ fontSize: 14 }}>Sin centros de ingreso</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Ejecuta primero el SQL de ingresos.sql</div>
          </div>
        ) : (
          <div>
            {centros.map((c, i) => {
              const color = TIPO_COLOR[c.tipo ?? 'otro'] ?? '#64748b'
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                  borderBottom: i < centros.length - 1 ? '1px solid #f1f5f9' : 'none',
                }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Tag size={17} style={{ color }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{c.nombre}</span>
                      {c.codigo && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: color + '15', color }}>
                          {c.codigo}
                        </span>
                      )}
                      {!c.activo && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: '#f1f5f9', color: '#94a3b8' }}>Inactivo</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{TIPO_LABEL[c.tipo ?? ''] ?? '—'}</span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>·</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#64748b' }}>
                        {c.tipo_desglose === 'secciones'
                          ? <><Layers size={11} style={{ color: '#7c3aed' }} /> Desglose por sección</>
                          : c.tipo_desglose === 'frentes'
                          ? <><Layers size={11} style={{ color: '#0d9488' }} /> Desglose por frente</>
                          : 'Monto único'
                        }
                      </span>
                      {c.notas && <span style={{ fontSize: 11, color: '#94a3b8' }}>· {c.notas}</span>}
                    </div>
                  </div>
                  {canWrite('ingresos') && (
                    <button className="btn-ghost" style={{ padding: '5px 8px' }} onClick={() => { setEditing(c); setModal(true) }}>
                      <Edit2 size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <CentroModal
          centro={editing}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetch() }}
        />
      )}
    </div>
  )
}
