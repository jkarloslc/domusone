'use client'
import { useState, useEffect } from 'react'
import { dbCfg, dbCtrl, type Lote } from '@/lib/supabase'
import {
  X, Edit2, MapPin, DollarSign, FileText, User,
  Zap, Droplets, Plus, Trash2, Save, Loader, CheckCircle
} from 'lucide-react'

type Props = { lote: Lote; onClose: () => void; onEdit: () => void }

const TABS = [
  { key: 'datos',     label: 'Datos Generales' },
  { key: 'servicios', label: 'Servicios' },
]

// ── Tipos ─────────────────────────────────────────────────────
type ServicioCFE  = { id?: number; id_lote_fk: number; no_servicio: string | null; tarifa: string | null; medidor: string | null; status: string; notas: string | null }
type ServicioAgua = { id?: number; id_lote_fk: number; no_contrato: string | null; tipo_toma: string | null; medidor: string | null; status: string; notas: string | null }

const STATUS_SVC = ['Activo', 'Suspendido', 'Inactivo']
const TARIFAS_CFE = ['1', '1A', '1B', '1C', 'DAC', '2', 'TL', 'TE']
const TIPOS_TOMA  = ['Residencial', 'Comercial', 'Industrial']

export default function LoteDetail({ lote, onClose, onEdit }: Props) {
  const [tab, setTab]             = useState<'datos' | 'servicios'>('datos')
  const [tipoNombre, setTipoNombre] = useState<string | null>(null)

  useEffect(() => {
    const fk = (lote as any).id_tipo_lote_fk
    if (fk) {
      dbCfg.from('tipos_lote').select('nombre').eq('id', fk).single()
        .then(({ data }) => { if (data) setTipoNombre(data.nombre) })
    }
  }, [(lote as any).id_tipo_lote_fk])

  const tipoDisplay = tipoNombre ?? lote.tipo_lote ?? 'Sin tipo'
  const fmt = (v: number | null) =>
    v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)' }}>
              {lote.cve_lote ?? `Lote #${lote.lote}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {tipoDisplay} · {lote.superficie ? lote.superficie.toLocaleString('es-MX') + ' m²' : 'Sin superficie'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" onClick={onEdit}><Edit2 size={13} /> Editar</button>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? 'var(--blue)' : 'var(--text-muted)',
                borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
                marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Datos Generales ── */}
        {tab === 'datos' && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', maxHeight: 'calc(90vh - 150px)' }}>
            <Group icon={<MapPin size={14} />} label="Status y Clasificación">
              <Row2 label="Status Lote"       value={lote.status_lote} badge />
              <Row2 label="Status Jurídico"   value={lote.status_juridico} />
              <Row2 label="Cobranza"          value={lote.clasificacion_cobranza} />
              <Row2 label="Paga Cuotas"       value={lote.paga_cuotas} />
              <Row2 label="Urbanización"      value={lote.urbanizacion_disponible} />
            </Group>
            <Group icon={<DollarSign size={14} />} label="Información Comercial">
              <Row2 label="Valor Operación"   value={fmt(lote.valor_operacion)} />
              <Row2 label="Precio Lista"      value={fmt(lote.precio_de_lista)} />
              <Row2 label="Forma de Venta"    value={lote.forma_venta} />
              <Row2 label="Incluye Membresía" value={lote.incluye_membresia} />
              <Row2 label="Tipo Membresía"    value={lote.tipo_membresia} />
              <Row2 label="Vendedor"          value={lote.vendedor} />
              <Row2 label="Medio Captación"   value={lote.medio_captacion} />
            </Group>
            <Group icon={<FileText size={14} />} label="Datos Catastrales y Fiscales">
              <Row2 label="Clave Catastral"   value={lote.clave_catastral} />
              <Row2 label="Valor Catastral"   value={fmt(lote.valor_catastral)} />
              <Row2 label="RFC Factura"       value={lote.rfc_para_factura} />
              <Row2 label="Razón Social"      value={lote.razon_social_para_factura} />
            </Group>
            <Group icon={<User size={14} />} label="Contacto Rápido">
              <Row2 label="Persona"   value={lote.persona_contacto} />
              <Row2 label="Teléfono"  value={lote.telefono_persona_contacto} />
              <Row2 label="Correo"    value={lote.correo_persona_contacto} />
            </Group>
            {lote.observaciones && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Observaciones
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{lote.observaciones}</p>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Servicios ── */}
        {tab === 'servicios' && (
          <ServiciosTab loteId={lote.id} />
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Tab Servicios — CFE y Agua Potable
// ════════════════════════════════════════════════════════════
function ServiciosTab({ loteId }: { loteId: number }) {
  const [cfe,   setCfe]   = useState<ServicioCFE[]>([])
  const [agua,  setAgua]  = useState<ServicioAgua[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const fetchServicios = () => {
    setLoading(true)
    Promise.all([
      dbCtrl.from('servicios_cfe').select('*').eq('id_lote_fk', loteId).order('id'),
      dbCtrl.from('servicios_agua').select('*').eq('id_lote_fk', loteId).order('id'),
    ]).then(([{ data: c }, { data: a }]) => {
      setCfe(c ?? [])
      setAgua(a ?? [])
      setLoading(false)
    })
  }

  useEffect(() => { fetchServicios() }, [loteId])

  // ── CFE helpers ────────────────────────────────────────────
  const addCFE = () => setCfe(prev => [...prev, {
    id_lote_fk: loteId, no_servicio: '', tarifa: '', medidor: '', status: 'Activo', notas: ''
  }])

  const setCFEField = (i: number, k: keyof ServicioCFE, v: string) =>
    setCfe(prev => prev.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const deleteCFE = async (i: number) => {
    const s = cfe[i]
    if (s.id) {
      await dbCtrl.from('servicios_cfe').delete().eq('id', s.id)
    }
    setCfe(prev => prev.filter((_, j) => j !== i))
  }

  // ── Agua helpers ───────────────────────────────────────────
  const addAgua = () => setAgua(prev => [...prev, {
    id_lote_fk: loteId, no_contrato: '', tipo_toma: '', medidor: '', status: 'Activo', notas: ''
  }])

  const setAguaField = (i: number, k: keyof ServicioAgua, v: string) =>
    setAgua(prev => prev.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const deleteAgua = async (i: number) => {
    const s = agua[i]
    if (s.id) {
      await dbCtrl.from('servicios_agua').delete().eq('id', s.id)
    }
    setAgua(prev => prev.filter((_, j) => j !== i))
  }

  // ── Guardar todo ───────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)

    // CFE — upsert
    for (const s of cfe) {
      const payload = {
        id_lote_fk:  loteId,
        no_servicio: s.no_servicio?.trim() || null,
        tarifa:      s.tarifa || null,
        medidor:     s.medidor?.trim() || null,
        status:      s.status || 'Activo',
        notas:       s.notas?.trim() || null,
      }
      if (s.id) {
        await dbCtrl.from('servicios_cfe').update(payload).eq('id', s.id)
      } else {
        const { data } = await dbCtrl.from('servicios_cfe').insert(payload).select('id').single()
        if (data) s.id = data.id
      }
    }

    // Agua — upsert
    for (const s of agua) {
      const payload = {
        id_lote_fk:  loteId,
        no_contrato: s.no_contrato?.trim() || null,
        tipo_toma:   s.tipo_toma || null,
        medidor:     s.medidor?.trim() || null,
        status:      s.status || 'Activo',
        notas:       s.notas?.trim() || null,
      }
      if (s.id) {
        await dbCtrl.from('servicios_agua').update(payload).eq('id', s.id)
      } else {
        const { data } = await dbCtrl.from('servicios_agua').insert(payload).select('id').single()
        if (data) s.id = data.id
      }
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <Loader size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
    </div>
  )

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 150px)', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── CFE ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={13} style={{ color: '#d97706' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>
              CFE — Energía Eléctrica
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({cfe.length})</span>
          </div>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={addCFE}>
            <Plus size={12} /> Agregar
          </button>
        </div>

        {cfe.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0', fontStyle: 'italic' }}>
            Sin servicios CFE registrados
          </div>
        ) : cfe.map((s, i) => (
          <div key={i} style={{ padding: '12px', background: '#fffbeb', border: '1px solid #fde68a',
            borderRadius: 8, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label className="label">No. de Servicio</label>
                <input className="input" value={s.no_servicio ?? ''} style={{ fontFamily: 'monospace' }}
                  onChange={e => setCFEField(i, 'no_servicio', e.target.value)}
                  placeholder="ej. 12345678901" />
              </div>
              <div>
                <label className="label">No. de Medidor</label>
                <input className="input" value={s.medidor ?? ''} style={{ fontFamily: 'monospace' }}
                  onChange={e => setCFEField(i, 'medidor', e.target.value)} />
              </div>
              <div>
                <label className="label">Tarifa</label>
                <select className="select" value={s.tarifa ?? ''}
                  onChange={e => setCFEField(i, 'tarifa', e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {TARIFAS_CFE.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="select" value={s.status}
                  onChange={e => setCFEField(i, 'status', e.target.value)}>
                  {STATUS_SVC.map(st => <option key={st}>{st}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <label className="label">Notas</label>
                <input className="input" value={s.notas ?? ''}
                  onChange={e => setCFEField(i, 'notas', e.target.value)}
                  placeholder="Opcional" />
              </div>
              <button className="btn-ghost" style={{ padding: '6px', marginTop: 18, color: '#dc2626' }}
                onClick={() => deleteCFE(i)} title="Eliminar">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Agua Potable ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Droplets size={13} style={{ color: 'var(--blue)' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>
              Agua Potable
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({agua.length})</span>
          </div>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={addAgua}>
            <Plus size={12} /> Agregar
          </button>
        </div>

        {agua.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0', fontStyle: 'italic' }}>
            Sin servicios de agua registrados
          </div>
        ) : agua.map((s, i) => (
          <div key={i} style={{ padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: 8, marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label className="label">No. de Contrato</label>
                <input className="input" value={s.no_contrato ?? ''} style={{ fontFamily: 'monospace' }}
                  onChange={e => setAguaField(i, 'no_contrato', e.target.value)} />
              </div>
              <div>
                <label className="label">No. de Medidor</label>
                <input className="input" value={s.medidor ?? ''} style={{ fontFamily: 'monospace' }}
                  onChange={e => setAguaField(i, 'medidor', e.target.value)} />
              </div>
              <div>
                <label className="label">Tipo de Toma</label>
                <select className="select" value={s.tipo_toma ?? ''}
                  onChange={e => setAguaField(i, 'tipo_toma', e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {TIPOS_TOMA.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="select" value={s.status}
                  onChange={e => setAguaField(i, 'status', e.target.value)}>
                  {STATUS_SVC.map(st => <option key={st}>{st}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <label className="label">Notas</label>
                <input className="input" value={s.notas ?? ''}
                  onChange={e => setAguaField(i, 'notas', e.target.value)}
                  placeholder="Opcional" />
              </div>
              <button className="btn-ghost" style={{ padding: '6px', marginTop: 18, color: '#dc2626' }}
                onClick={() => deleteAgua(i)} title="Eliminar">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Botón guardar */}
      {(cfe.length > 0 || agua.length > 0) && (
        <button className="btn-primary" onClick={handleSave} disabled={saving}
          style={{ alignSelf: 'flex-end' }}>
          {saving  ? <><Loader size={13} className="animate-spin" /> Guardando…</> :
           saved   ? <><CheckCircle size={13} /> Guardado</> :
                     <><Save size={13} /> Guardar Servicios</>}
        </button>
      )}
    </div>
  )
}

// ── Helpers UI ─────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  'Vendido': 'badge-vendido', 'Libre': 'badge-libre', 'Bloqueado': 'badge-bloqueado',
}

function Group({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600,
        color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase',
        marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        {icon} {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>{children}</div>
    </div>
  )
}

function Row2({ label, value, badge }: { label: string; value?: string | null; badge?: boolean }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      {badge
        ? <span className={`badge ${STATUS_COLORS[value] ?? 'badge-default'}`}>{value}</span>
        : <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</div>}
    </div>
  )
}
