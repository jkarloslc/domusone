'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCfg } from '@/lib/supabase'
import {
  BookOpen, Plus, Edit2, Trash2, X, Save,
  Loader, RefreshCw, ToggleLeft, ToggleRight,
  MapPin, Tag, Grid3x3, DollarSign, CreditCard,
  Car, CheckCircle
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

// ── Definición de catálogos disponibles ───────────────────────
type CatConfig = {
  key:       string
  tabla:     string
  label:     string
  icon:      any
  color:     string
  campos:    Campo[]
  desc:      string
}

type Campo = {
  key:       string
  label:     string
  type:      'text' | 'number' | 'textarea'
  required?: boolean
  width?:    number  // DXA grid cols (1-3)
}

const CATALOGOS: CatConfig[] = [
  {
    key:    'secciones',
    tabla:  'secciones',
    label:  'Secciones',
    icon:   MapPin,
    color:  '#2563eb',
    desc:   'Secciones o zonas del desarrollo residencial',
    campos: [
      { key: 'nombre',      label: 'Nombre *',      type: 'text',     required: true },
      { key: 'descripcion', label: 'Descripción',   type: 'textarea' },
    ],
  },
  {
    key:    'tipos_lote',
    tabla:  'tipos_lote',
    label:  'Tipos de Lote',
    icon:   Tag,
    color:  '#7c3aed',
    desc:   'Clasificación del tipo de lote (Fairway, Casa, Villa, etc.)',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:    'clasificacion',
    tabla:  'clasificacion',
    label:  'Clasificación',
    icon:   Grid3x3,
    color:  '#0891b2',
    desc:   'Clasificación del uso del lote (Baldío, Casa, Construcción, etc.)',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:    'cuotas_estandar',
    tabla:  'cuotas_estandar',
    label:  'Cuotas Estándar',
    icon:   DollarSign,
    color:  '#059669',
    desc:   'Plantillas de cuotas de mantenimiento aplicables a lotes',
    campos: [
      { key: 'nombre',       label: 'Nombre *',       type: 'text',   required: true },
      { key: 'monto',        label: 'Monto',          type: 'number' },
      { key: 'periodicidad', label: 'Periodicidad',   type: 'text'   },
      { key: 'descripcion',  label: 'Descripción',    type: 'textarea' },
    ],
  },
  {
    key:    'formas_pago',
    tabla:  'formas_pago',
    label:  'Formas de Pago',
    icon:   CreditCard,
    color:  '#d97706',
    desc:   'Métodos de pago disponibles en recibos y cobranza',
    campos: [
      { key: 'nombre',      label: 'Nombre *',    type: 'text',     required: true },
      { key: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
  },
  {
    key:    'marcas_vehiculos',
    tabla:  'marcas_vehiculos',
    label:  'Marcas de Vehículos',
    icon:   Car,
    color:  '#475569',
    desc:   'Marcas disponibles en el registro de vehículos',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
]

// ══════════════════════════════════════════════════════════════
export default function CatalogosPage() {
  const { authUser } = useAuth()
  const [activeKey, setActiveKey] = useState(CATALOGOS[0].key)
  const active = CATALOGOS.find(c => c.key === activeKey)!

  if (authUser?.rol !== 'admin') {
    return (
      <div style={{ padding: '32px 36px' }}>
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          🔒 Acceso solo para administradores
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <BookOpen size={16} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sistema</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Catálogos</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Administra los valores de los catálogos del sistema</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>

        {/* Menú lateral de catálogos */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {CATALOGOS.map(cat => {
            const Icon = cat.icon
            const isActive = cat.key === activeKey
            return (
              <button key={cat.key} onClick={() => setActiveKey(cat.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', background: isActive ? cat.color + '10' : 'none',
                  border: 'none', borderLeft: `3px solid ${isActive ? cat.color : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: cat.color + (isActive ? '20' : '12'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={13} style={{ color: cat.color }} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? cat.color : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cat.label}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Contenido del catálogo activo */}
        <CatalogoTable config={active} key={activeKey} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Tabla + CRUD genérico por catálogo
// ══════════════════════════════════════════════════════════════
function CatalogoTable({ config }: { config: CatConfig }) {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<any | null | 'new'>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCfg.from(config.tabla).select('*').order('nombre')
    setRows(data ?? [])
    setLoading(false)
  }, [config.tabla])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleActivo = async (row: any) => {
    await dbCfg.from(config.tabla).update({ activo: !row.activo }).eq('id', row.id)
    fetchData()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return
    await dbCfg.from(config.tabla).delete().eq('id', id)
    fetchData()
  }

  const activos   = rows.filter(r => r.activo).length
  const inactivos = rows.filter(r => !r.activo).length
  const Icon = config.icon

  return (
    <div>
      {/* Header de la tabla */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: config.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={15} style={{ color: config.color }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: '#1e293b' }}>{config.label}</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>{config.desc}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button className="btn-ghost" onClick={fetchData} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn-primary" onClick={() => setModal('new')}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}><strong style={{ color: '#15803d' }}>{activos}</strong> activos</span>
        </div>
        {inactivos > 0 && (
          <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>{inactivos}</strong> inactivos</span>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>ID</th>
              <th>Nombre</th>
              {config.campos.filter(c => !['nombre', 'descripcion'].includes(c.key)).map(c => (
                <th key={c.key}>{c.label.replace(' *', '')}</th>
              ))}
              {config.campos.find(c => c.key === 'descripcion') && <th>Descripción</th>}
              <th style={{ width: 80, textAlign: 'center' }}>Status</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Sin registros. Haz clic en "Nuevo" para agregar.
              </td></tr>
            ) : rows.map(row => (
              <tr key={row.id} style={{ opacity: row.activo ? 1 : 0.45 }}>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.id}</td>
                <td style={{ fontWeight: 500 }}>{row.nombre}</td>
                {config.campos.filter(c => !['nombre', 'descripcion'].includes(c.key)).map(c => (
                  <td key={c.key} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.type === 'number' && row[c.key] != null
                      ? '$' + Number(row[c.key]).toLocaleString('es-MX', { minimumFractionDigits: 2 })
                      : (row[c.key] ?? '—')}
                  </td>
                ))}
                {config.campos.find(c => c.key === 'descripcion') && (
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.descripcion ?? '—'}
                  </td>
                )}
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => toggleActivo(row)} title={row.activo ? 'Desactivar' : 'Activar'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', margin: '0 auto' }}>
                    {row.activo
                      ? <ToggleRight size={20} style={{ color: '#15803d' }} />
                      : <ToggleLeft size={20} style={{ color: '#cbd5e1' }} />
                    }
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(row)} title="Editar">
                      <Edit2 size={13} />
                    </button>
                    <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }} onClick={() => handleDelete(row.id)} title="Eliminar">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal CRUD */}
      {modal !== null && (
        <CatalogoModal
          config={config}
          row={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData() }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal genérico para cualquier catálogo
// ══════════════════════════════════════════════════════════════
function CatalogoModal({ config, row, onClose, onSaved }:
  { config: CatConfig; row: any | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Inicializar form con los campos del catálogo
  const initForm = () => {
    const f: Record<string, string> = { activo: row?.activo !== false ? 'true' : 'false' }
    config.campos.forEach(c => { f[c.key] = row?.[c.key]?.toString() ?? '' })
    return f
  }
  const [form, setForm] = useState<Record<string, string>>(initForm)

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    const requiredField = config.campos.find(c => c.required && !form[c.key]?.trim())
    if (requiredField) { setError(`El campo "${requiredField.label.replace(' *', '')}" es obligatorio`); return }
    setSaving(true); setError('')

    const payload: Record<string, any> = { activo: form.activo === 'true' }
    config.campos.forEach(c => {
      if (c.type === 'number') payload[c.key] = form[c.key] ? Number(form[c.key]) : null
      else payload[c.key] = form[c.key]?.trim() || null
    })

    const { error: err } = isNew
      ? await dbCfg.from(config.tabla).insert(payload)
      : await dbCfg.from(config.tabla).update(payload).eq('id', row.id)

    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const Icon = config.icon

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: config.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={14} style={{ color: config.color }} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
                {isNew ? `Nuevo — ${config.label}` : `Editar — ${row?.nombre}`}
              </h2>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {config.campos.map(c => (
            <div key={c.key}>
              <label className="label">{c.label}</label>
              {c.type === 'textarea' ? (
                <textarea className="input" rows={2} value={form[c.key] ?? ''} onChange={set(c.key)} style={{ resize: 'vertical' }} />
              ) : (
                <input
                  className="input"
                  type={c.type === 'number' ? 'number' : 'text'}
                  step={c.type === 'number' ? '0.01' : undefined}
                  value={form[c.key] ?? ''}
                  onChange={set(c.key)}
                />
              )}
            </div>
          ))}

          <div>
            <label className="label">Status</label>
            <select className="select" value={form.activo} onChange={set('activo')}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
