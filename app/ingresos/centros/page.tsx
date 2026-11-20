'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCfg } from '@/lib/supabase'
import { Plus, Edit2, Tag, Layers, ChevronLeft, X, Save, Loader } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import ModalShell from '@/components/ui/ModalShell'
import { colorAgrupador } from '@/lib/centrosIngreso'

import PageHeader from '@/components/layout/PageHeader'
type Centro = {
  id: number
  nombre: string
  codigo: string | null
  tipo_desglose: string    // 'unico' | 'secciones' | 'frentes'
  activo: boolean
  notas: string | null
  id_agrupador_fk?: number | null
  id_centro_costo_fk?: number | null
  created_at: string
}

// ── Modal alta/edición ────────────────────────────────────────
function CentroModal({ centro, onClose, onSaved }: { centro: Centro | null; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const [form, setForm] = useState<Partial<Centro>>(centro ?? {
    nombre: '', codigo: '', tipo_desglose: 'unico', activo: true, notas: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [agrupadores, setAgrupadores] = useState<{ id: number; nombre: string }[]>([])
  const [ccs, setCcs] = useState<{ id: number; nombre: string }[]>([])
  useEffect(() => {
    dbCfg.from('agrupadores_ingreso').select('id, nombre').eq('activo', true).order('orden').order('nombre')
      .then(({ data }) => setAgrupadores(data ?? []))
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCcs(data ?? []))
  }, [])

  const set = (k: keyof Centro, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nombre?.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre:        form.nombre!.trim(),
      codigo:        form.codigo?.trim() || null,
      tipo_desglose: form.tipo_desglose || 'unico',
      activo:        form.activo ?? true,
      notas:         form.notas?.trim() || null,
      id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
      // Solo se envía si hay (o había) agrupador: tolera migración pendiente
      ...((form.id_agrupador_fk || centro?.id_agrupador_fk) ? { id_agrupador_fk: form.id_agrupador_fk ? Number(form.id_agrupador_fk) : null } : {}),
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
          {error && <div style={{ padding: '8px 12px', background: '#F4F5F7', borderRadius: 6, fontSize: 12, color: '#C23B3B' }}>{error}</div>}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#33363C', display: 'block', marginBottom: 4 }}>Nombre *</label>
            <input className="input" value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} placeholder="ej. Golf" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#33363C', display: 'block', marginBottom: 4 }}>Código</label>
              <input className="input" value={form.codigo ?? ''} onChange={e => set('codigo', e.target.value.toUpperCase())} placeholder="GOLF" maxLength={8} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#33363C', display: 'block', marginBottom: 4 }}>Agrupador</label>
            <select className="select" value={form.id_agrupador_fk ?? ''} onChange={e => set('id_agrupador_fk', e.target.value)}>
              <option value="">Sin agrupador</option>
              {agrupadores.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#33363C', display: 'block', marginBottom: 4 }}>Centro de costo</label>
            <select className="select" value={form.id_centro_costo_fk ?? ''} onChange={e => set('id_centro_costo_fk', e.target.value)}>
              <option value="">Sin centro de costo</option>
              {ccs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <div style={{ fontSize: 11, color: '#7A7E87', marginTop: 4 }}>En el Dashboard, al elegir este centro se muestran los egresos y CXP de este centro de costo.</div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#33363C', display: 'block', marginBottom: 6 }}>Tipo de captura</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { val: 'unico',     label: 'Monto único',           desc: 'Un solo total por recibo' },
                { val: 'secciones', label: 'Desglose por sección',  desc: 'Monto por cada sección del residencial' },
                { val: 'frentes',   label: 'Desglose por frente',   desc: 'Monto por cada frente de ingreso' },
                { val: 'conceptos', label: 'Desglose por concepto', desc: 'Monto por concepto de cobro (Golf, Hípico, etc.)' },
              ].map(opt => (
                <button key={opt.val} onClick={() => set('tipo_desglose', opt.val)}
                  style={{ flex: 1, minWidth: 130, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${form.tipo_desglose === opt.val ? '#1C1D21' : '#E6E8EB'}`,
                    background: form.tipo_desglose === opt.val ? '#F4F5F7' : '#fff' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: form.tipo_desglose === opt.val ? '#26282D' : '#33363C' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#7A7E87', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#33363C', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea className="input" rows={2} value={form.notas ?? ''} onChange={e => set('notas', e.target.value)}
              style={{ resize: 'vertical', minHeight: 56 }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="activo-chk" checked={form.activo ?? true} onChange={e => set('activo', e.target.checked)} />
            <label htmlFor="activo-chk" style={{ fontSize: 13, color: '#33363C' }}>Centro activo</label>
          </div>
        </div>
    </ModalShell>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function CentrosIngresoPage() {
  const router = useRouter()
  const { canWrite, authUser } = useAuth()
  const puedeEscribir = canWrite('ingresos') && authUser?.rol !== 'cobranza'
  const [centros, setCentros] = useState<Centro[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [editing, setEditing] = useState<Centro | null>(null)

  const [agrNombre, setAgrNombre] = useState<Record<number, string>>({})
  const [ccNombre, setCcNombre] = useState<Record<number, string>>({})
  useEffect(() => {
    dbCfg.from('agrupadores_ingreso').select('id, nombre')
      .then(({ data }) => setAgrNombre(Object.fromEntries((data ?? []).map((a: any) => [a.id, a.nombre]))))
    dbCfg.from('centros_costo').select('id, nombre')
      .then(({ data }) => setCcNombre(Object.fromEntries((data ?? []).map((a: any) => [a.id, a.nombre]))))
  }, [])

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
      <PageHeader backHref="/ingresos"
        icon={Tag}
        color="#6B4E79"
        eyebrowLabel="Catálogo"
        variant="xl"
        title="Centros de Ingreso"
        subtitle="Configura los centros y su tipo de captura"
        actions={puedeEscribir ? (
          <button className="btn-primary" onClick={() => { setEditing(null); setModal(true) }}>
            <Plus size={14} /> Nuevo Centro
          </button>
        ) : undefined}
      />

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
              const color = colorAgrupador(c.id_agrupador_fk)
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                  borderBottom: i < centros.length - 1 ? '1px solid #F4F5F7' : 'none',
                }}>
                  <div className="icon-chip" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Tag size={17} style={{ color: '#1C1D21' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#26282D' }}>{c.nombre}</span>
                      {c.codigo && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: color, color: '#fff' }}>
                          {c.codigo}
                        </span>
                      )}
                      {!c.activo && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, background: '#F4F5F7', color: '#7A7E87' }}>Inactivo</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      {c.id_agrupador_fk && agrNombre[c.id_agrupador_fk] && (
                        <><span style={{ fontSize: 11, fontWeight: 600, color: '#178A80' }}>{agrNombre[c.id_agrupador_fk]}</span>
                        <span style={{ fontSize: 10, color: '#7A7E87' }}>·</span></>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#62666E' }}>
                        {c.tipo_desglose === 'secciones'
                          ? <><Layers size={11} style={{ color: '#62666E' }} /> Desglose por sección</>
                          : c.tipo_desglose === 'frentes'
                          ? <><Layers size={11} style={{ color: '#62666E' }} /> Desglose por frente</>
                          : c.tipo_desglose === 'conceptos'
                          ? <><Layers size={11} style={{ color: '#62666E' }} /> Desglose por concepto</>
                          : 'Monto único'
                        }
                      </span>
                      {c.id_centro_costo_fk && ccNombre[c.id_centro_costo_fk] && (
                        <span style={{ fontSize: 11, color: '#62666E' }}>· CC {ccNombre[c.id_centro_costo_fk]}</span>
                      )}
                      {c.notas && <span style={{ fontSize: 11, color: '#7A7E87' }}>· {c.notas}</span>}
                    </div>
                  </div>
                  {puedeEscribir && (
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
