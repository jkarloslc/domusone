'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCfg, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, X, Save, Loader, RefreshCw, Eye, Edit2, Trash2,
  Hammer, ClipboardList, Wrench, Filter, Search, Upload,
} from 'lucide-react'
import PrestamosTab from './PrestamosTab'
import MantenimientoTab from './MantenimientoTab'
import ModalShell from '@/components/ui/ModalShell'

const TIPOS_HERRAMIENTA = [
  'Desbrozadora', 'Podadora', 'Motosierra', 'Sopladora', 'Bomba de Agua',
  'Generador', 'Compresor', 'Taladro', 'Esmeril', 'Otro',
]
const STATUS_HERRAMIENTA = ['Disponible', 'Prestado', 'En Mantenimiento', 'Baja']

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Disponible':       { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'Prestado':         { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'En Mantenimiento': { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Baja':             { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}

const Badge = ({ text, map }: { text: string; map: Record<string, any> }) => {
  const s = map[text] ?? { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

const fmt$ = (n: number | null | undefined) =>
  n != null ? `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'

const fmtF = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// ══════════════════════════════════════════════════════════════
export default function HerramientasTab() {
  const { canWrite, canDelete } = useAuth()
  const [subTab, setSubTab] = useState<'catalogo' | 'prestamos' | 'mantenimiento'>('catalogo')

  const [herramientas, setHerramientas] = useState<any[]>([])
  const [areaMap,      setAreaMap]      = useState<Record<number, string>>({})
  const [areas,        setAreas]        = useState<any[]>([])
  const [herrMap,      setHerrMap]      = useState<Record<number, any>>({})
  const [loading,      setLoading]      = useState(true)
  const [filterTipo,   setFilterTipo]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search,       setSearch]       = useState('')
  const [modal,   setModal]   = useState<{ open: boolean; h?: any }>({ open: false })
  const [detail,  setDetail]  = useState<any | null>(null)

  const fetchHerramientas = useCallback(async () => {
    setLoading(true)
    const [{ data: hs }, { data: ar }] = await Promise.all([
      dbCfg.from('herramientas').select('*').eq('activo', true).order('descripcion'),
      dbCfg.from('areas').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setHerramientas(hs ?? [])
    setAreas(ar ?? [])
    const am: Record<number, string> = {}
    ;(ar ?? []).forEach((a: any) => { am[a.id] = a.nombre })
    setAreaMap(am)
    const hm: Record<number, any> = {}
    ;(hs ?? []).forEach((h: any) => { hm[h.id] = h })
    setHerrMap(hm)
    setLoading(false)
  }, [])

  useEffect(() => { fetchHerramientas() }, [fetchHerramientas])

  const filtered = herramientas.filter(h => {
    if (filterTipo   && h.tipo !== filterTipo)     return false
    if (filterStatus && h.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      return (h.descripcion ?? '').toLowerCase().includes(q)
        || (h.marca ?? '').toLowerCase().includes(q)
        || (h.modelo ?? '').toLowerCase().includes(q)
        || (h.no_serie ?? '').toLowerCase().includes(q)
    }
    return true
  })

  // KPIs
  const kpiDisponibles = herramientas.filter(h => h.status === 'Disponible').length
  const kpiPrestadas   = herramientas.filter(h => h.status === 'Prestado').length
  const kpiMantto      = herramientas.filter(h => h.status === 'En Mantenimiento').length
  const kpiBaja        = herramientas.filter(h => h.status === 'Baja').length

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta herramienta del catálogo?')) return
    await dbCfg.from('herramientas').update({ activo: false }).eq('id', id)
    fetchHerramientas()
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        {([
          ['catalogo',      'Catálogo de Herramienta', Hammer],
          ['prestamos',     'Bitácora de Préstamos',   ClipboardList],
          ['mantenimiento', 'Bitácora de Servicios',   Wrench],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setSubTab(key)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
              fontWeight: subTab === key ? 600 : 400,
              color: subTab === key ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: subTab === key ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -1 }}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* ══════════ TAB: CATÁLOGO ══════════ */}
      {subTab === 'catalogo' && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Disponibles',      value: kpiDisponibles, color: '#15803d', bg: '#f0fdf4' },
              { label: 'Prestadas',        value: kpiPrestadas,   color: '#2563eb', bg: '#eff6ff' },
              { label: 'En Mantenimiento', value: kpiMantto,      color: '#d97706', bg: '#fffbeb' },
              { label: 'Baja',             value: kpiBaja,        color: '#94a3b8', bg: '#f8fafc' },
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
            <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
              <Search size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input className="input" style={{ paddingLeft: 26, fontSize: 12, height: 28 }}
                placeholder="Descripción, marca, serie…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="select" style={{ flex: '1 1 130px', maxWidth: 170, fontSize: 12, padding: '3px 8px', height: 28 }}
              value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
              <option value="">Tipo</option>
              {TIPOS_HERRAMIENTA.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 130px', maxWidth: 170, fontSize: 12, padding: '3px 8px', height: 28 }}
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Status</option>
              {STATUS_HERRAMIENTA.map(s => <option key={s}>{s}</option>)}
            </select>
            {(search || filterTipo || filterStatus) && (
              <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
                onClick={() => { setSearch(''); setFilterTipo(''); setFilterStatus('') }}>
                <X size={11} /> Limpiar
              </button>
            )}
            <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }} onClick={fetchHerramientas}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
            {canWrite('mantenimiento') && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '3px 12px', height: 28 }}
                onClick={() => setModal({ open: true })}>
                <Plus size={12} /> Nueva Herramienta
              </button>
            )}
          </div>

          {/* Tabla */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  {['Herramienta', 'Tipo', 'Marca / Modelo', 'No. Serie', 'Área', 'Adquisición', 'Status', ''].map(h => (
                    <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}>
                    <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                    Sin herramientas registradas
                  </td></tr>
                ) : filtered.map(h => (
                  <tr key={h.id} style={{ opacity: h.status === 'Baja' ? 0.55 : 1 }}>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {h.foto_url
                          ? <img src={h.foto_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 }} />
                          : <div style={{ width: 32, height: 32, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Hammer size={14} style={{ color: 'var(--text-muted)' }} />
                            </div>
                        }
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{h.descripcion}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{h.tipo}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 12 }}>{h.marca || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h.modelo ?? ''}</div>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>{h.no_serie ?? '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px' }}>
                      {h.id_area_fk ? (areaMap[h.id_area_fk] ?? '—') : '—'}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontSize: 11 }}>{fmtF(h.fecha_adquisicion)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmt$(h.costo_adquisicion)}</div>
                    </td>
                    <td style={{ padding: '8px 10px' }}><Badge text={h.status} map={STATUS_STYLE} /></td>
                    <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                      <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setDetail(h)}>
                        <Eye size={12} />
                      </button>
                      {canWrite('mantenimiento') && (
                        <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setModal({ open: true, h })}>
                          <Edit2 size={12} />
                        </button>
                      )}
                      {canDelete() && (
                        <button className="btn-ghost" style={{ padding: '3px 5px', color: '#dc2626' }} onClick={() => handleDelete(h.id)}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════ TAB: PRÉSTAMOS ══════════ */}
      {subTab === 'prestamos' && (
        <PrestamosTab herramientas={herramientas} herrMap={herrMap} areaMap={areaMap} areas={areas}
          onChanged={fetchHerramientas} />
      )}

      {/* ══════════ TAB: MANTENIMIENTO ══════════ */}
      {subTab === 'mantenimiento' && (
        <MantenimientoTab herramientas={herramientas} herrMap={herrMap} onChanged={fetchHerramientas} />
      )}

      {/* Modales */}
      {modal.open && (
        <HerramientaModal h={modal.h} areas={areas}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); fetchHerramientas() }} />
      )}
      {detail && (
        <HerramientaDetail h={detail} areaMap={areaMap} onClose={() => setDetail(null)}
          onEdit={h => { setDetail(null); setModal({ open: true, h }) }} />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal: Crear / Editar Herramienta
// ══════════════════════════════════════════════════════════════
function HerramientaModal({ h, areas, onClose, onSaved }: {
  h?: any; areas: any[]; onClose: () => void; onSaved: () => void
}) {
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    descripcion:       h?.descripcion       ?? '',
    tipo:              h?.tipo              ?? TIPOS_HERRAMIENTA[0],
    marca:             h?.marca             ?? '',
    modelo:            h?.modelo            ?? '',
    no_serie:          h?.no_serie          ?? '',
    id_area_fk:        h?.id_area_fk?.toString() ?? '',
    fecha_adquisicion: h?.fecha_adquisicion ?? '',
    costo_adquisicion: h?.costo_adquisicion?.toString() ?? '',
    status:            h?.status            ?? 'Disponible',
    foto_url:          h?.foto_url          ?? '',
    notas:             h?.notas             ?? '',
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `herramientas/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('mantenimiento').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { alert('Error al subir: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('mantenimiento').getPublicUrl(path)
    setForm(f => ({ ...f, foto_url: publicUrl }))
    setUploading(false)
  }

  const handleSave = async () => {
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria'); return }
    setSaving(true); setError('')
    const payload = {
      descripcion:       form.descripcion.trim(),
      tipo:              form.tipo,
      marca:             form.marca.trim()  || null,
      modelo:            form.modelo.trim() || null,
      no_serie:          form.no_serie.trim() || null,
      id_area_fk:        form.id_area_fk ? Number(form.id_area_fk) : null,
      fecha_adquisicion: form.fecha_adquisicion || null,
      costo_adquisicion: form.costo_adquisicion ? Number(form.costo_adquisicion) : null,
      status:            form.status,
      foto_url:          form.foto_url || null,
      notas:             form.notas.trim() || null,
      updated_at:        new Date().toISOString(),
    }
    const { error: err } = h
      ? await dbCfg.from('herramientas').update(payload).eq('id', h.id)
      : await dbCfg.from('herramientas').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={h ? 'Editar Herramienta' : 'Nueva Herramienta'} onClose={onClose} maxWidth={560}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
        <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
        {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
        </button>
      </>}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

        {/* Foto */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 10, border: '2px dashed #e2e8f0', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
            {form.foto_url
              ? <img src={form.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Hammer size={24} style={{ color: 'var(--text-muted)' }} />
            }
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Foto de la herramienta</label>
            <button className="btn-secondary" style={{ fontSize: 11, marginTop: 4 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />} {uploading ? 'Subiendo…' : 'Subir foto'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="label" style={{ fontSize: 11 }}>Descripción *</label>
            <input className="input" style={{ fontSize: 13 }} value={form.descripcion} onChange={setF('descripcion')} placeholder="Ej. Desbrozadora Stihl FS 130" />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Tipo</label>
            <select className="select" style={{ fontSize: 12 }} value={form.tipo} onChange={setF('tipo')}>
              {TIPOS_HERRAMIENTA.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Status</label>
            <select className="select" style={{ fontSize: 12 }} value={form.status} onChange={setF('status')}>
              {STATUS_HERRAMIENTA.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Marca</label>
            <input className="input" style={{ fontSize: 13 }} value={form.marca} onChange={setF('marca')} placeholder="Ej. Stihl, Husqvarna…" />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Modelo</label>
            <input className="input" style={{ fontSize: 13 }} value={form.modelo} onChange={setF('modelo')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>No. Serie</label>
            <input className="input" style={{ fontSize: 13 }} value={form.no_serie} onChange={setF('no_serie')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Área</label>
            <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk} onChange={setF('id_area_fk')}>
              <option value="">—</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Fecha adquisición</label>
            <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_adquisicion} onChange={setF('fecha_adquisicion')} />
          </div>
          <div>
            <label className="label" style={{ fontSize: 11 }}>Costo adquisición</label>
            <input className="input" type="number" step="0.01" style={{ fontSize: 13 }} value={form.costo_adquisicion} onChange={setF('costo_adquisicion')} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label className="label" style={{ fontSize: 11 }}>Notas</label>
            <textarea className="input" rows={2} style={{ fontSize: 13, resize: 'vertical' }} value={form.notas} onChange={setF('notas')} />
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Detail: Herramienta
// ══════════════════════════════════════════════════════════════
function HerramientaDetail({ h, areaMap, onClose, onEdit }: {
  h: any; areaMap: Record<number, string>; onClose: () => void; onEdit: (h: any) => void
}) {
  const { canWrite } = useAuth()
  const DI = ({ label, value }: { label: string; value: any }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 13 }}>{value ?? '—'}</div>
    </div>
  )
  return (
    <ModalShell modulo="mantenimiento" titulo={h.descripcion} onClose={onClose} maxWidth={520}
      footer={<>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cerrar</button>
        {canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => onEdit(h)}>
          <Edit2 size={11} /> Editar
          </button>
        )}
      </>}
    >
      <div style={{ padding: '16px 20px', overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {h.foto_url && (
          <div style={{ borderRadius: 10, overflow: 'hidden', background: '#f1f5f9', display: 'flex', justifyContent: 'center', maxHeight: 280 }}>
            <img src={h.foto_url} alt="" style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', display: 'block' }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge text={h.status} map={STATUS_STYLE} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.tipo}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <DI label="Marca"   value={h.marca} />
          <DI label="Modelo"  value={h.modelo} />
          <DI label="No. Serie" value={h.no_serie} />
          <DI label="Área"    value={h.id_area_fk ? areaMap[h.id_area_fk] : null} />
          <DI label="Adquisición" value={fmtF(h.fecha_adquisicion)} />
          <DI label="Costo adquisición" value={fmt$(h.costo_adquisicion)} />
        </div>
        {h.notas && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>{h.notas}</div>}
      </div>
    </ModalShell>
  )
}
