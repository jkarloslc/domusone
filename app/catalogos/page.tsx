'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCfg, dbComp, dbGolf, dbCat, supabase } from '@/lib/supabase'
import {
  BookOpen, Plus, Edit2, Trash2, X, Save,
  Loader, RefreshCw, ToggleLeft, ToggleRight,
  MapPin, Tag, Grid3x3, DollarSign, CreditCard,
  Car, CheckCircle, Upload, ExternalLink, Layers, AlertTriangle, Building2,
  Eye, ArrowUpCircle, ArrowDownCircle, TrendingUp, Store, Flag, HardHat, Search, Users, Ticket,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { antiguedad } from '@/lib/dateUtils'
import { Colaborador, nombreCompletoColaborador } from '@/lib/colaboradores'
import ModalShell from '@/components/ui/ModalShell'
import CuotasConfigPanel from '@/components/golf/CuotasConfigPanel'

// ── Tipos ─────────────────────────────────────────────────────
type CatConfig = {
  key:      string
  tabla:    string
  schema?:  'cfg' | 'comp' | 'golf'
  label:    string
  icon:     any
  color:    string
  campos:   Campo[]
  desc:     string
  sortBy?:       string
  clientSortBy?: string  // campo key de un select FK; ordena por su label resuelto en el cliente
  hasDetail?:    boolean
  sectionLabel?: string  // renders a group header above this item in the sidebar
}

type Campo = {
  key:       string
  label:     string
  type:      'text' | 'number' | 'textarea' | 'date' | 'select' | 'file'
  required?: boolean
  selectTabla?:   string
  selectSchema?:  'cfg' | 'comp' | 'golf'
  selectFilter?:  Record<string, string | number | boolean>
  hideInTable?:   boolean  // el campo solo aparece en el modal, no como columna del grid
  staticOptions?: string[]
  bucket?: string
}

const CATALOGOS: CatConfig[] = [
  {
    key:          'cuadrantes',
    tabla:        'cuadrantes',
    label:        'Cuadrantes',
    icon:         Grid3x3,
    color:        '#0891b2',
    sectionLabel: 'Mantenimiento',
    desc:         'Cuadrantes de mantenimiento — agrupan secciones para el Programa Anual',
    hasDetail:    true,
    sortBy:       'id',
    campos: [
      { key: 'nombre',      label: 'Nombre *',    type: 'text',    required: true },
      { key: 'color',       label: 'Color (hex)', type: 'text' },
      { key: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
  },
  {
    key:       'secciones',
    tabla:     'secciones',
    label:     'Secciones',
    icon:      MapPin,
    color:     '#2563eb',
    desc:      'Secciones residenciales — se relacionan con lotes, cobranza y mantenimiento',
    hasDetail: true,
    campos: [
      { key: 'id_empresa_fk',       label: 'Empresa',              type: 'select', selectTabla: 'proveedores', selectSchema: 'comp', selectFilter: { interno: true } },
      { key: 'nombre',              label: 'Nombre *',             type: 'text',   required: true },
      { key: 'clave_alfa',          label: 'Abreviatura',          type: 'text' },
      { key: 'descripcion',         label: 'Descripción',          type: 'textarea' },
      { key: 'id_tipo_seccion_fk',  label: 'Tipo de Sección',      type: 'select', selectTabla: 'tipo_secciones' },
      { key: 'id_cuadrante_fk',     label: 'Cuadrante',            type: 'select', selectTabla: 'cuadrantes' },
      { key: 'cantidad_lotes',      label: 'Cantidad de Lotes',    type: 'number' },
      { key: 'fecha_autorizacion',  label: 'Fecha de Autorización',type: 'date',   hideInTable: true },
      { key: 'expediente_url',      label: 'Expediente Digital',   type: 'file',   bucket: 'expedientes', hideInTable: true },
    ],
  },
  {
    key:   'tipo_secciones',
    tabla: 'tipo_secciones',
    label: 'Tipos de Sección',
    icon:  Layers,
    color: '#0891b2',
    desc:  'Tipos de sección: Condominio, Fraccionamiento, etc.',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:   'centros_costo',
    tabla: 'centros_costo',
    label: 'Centros de Costo',
    icon:  DollarSign,
    color: '#059669',
    desc:  'Centros de costo para clasificación de compras y mantenimiento',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:       'areas',
    tabla:     'areas',
    label:     'Áreas',
    icon:      Layers,
    color:     '#0891b2',
    desc:      'Áreas de obra o zona dentro de un Centro de Costo. Usa "Frentes" para gestionar los frentes permitidos en cada área.',
    hasDetail: true,
    campos: [
      { key: 'nombre',              label: 'Nombre *',         type: 'text',   required: true },
      { key: 'id_centro_costo_fk',  label: 'Centro de Costo *',type: 'select', selectTabla: 'centros_costo', required: true },
    ],
  },
  {
    key:       'frentes',
    tabla:     'frentes',
    label:     'Frentes',
    icon:      MapPin,
    color:     '#7c3aed',
    desc:      'Frentes transversales — cada frente puede pertenecer a varias áreas (relación N:M gobernada). Usa el botón "Áreas" para administrar las áreas del frente.',
    hasDetail: true,
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:   'areas_comunes',
    tabla: 'areas_comunes',
    label: 'Áreas Comunes',
    icon:  Flag,
    color: '#059669',
    desc:  'Áreas comunes de mantenimiento dentro de un Área — usadas en el Programa Anual',
    campos: [
      { key: 'nombre',      label: 'Nombre *',    type: 'text',    required: true },
      { key: 'descripcion', label: 'Descripción', type: 'textarea' },
      { key: 'id_area_fk',  label: 'Área',        type: 'select',  selectTabla: 'areas' },
    ],
  },
  {
    key:          'tipos_lote',
    tabla:        'tipos_lote',
    label:        'Tipos de Lote',
    icon:         Tag,
    color:        '#7c3aed',
    sectionLabel: 'Residencial',
    desc:         'Clasificación del tipo de lote (Fairway, Casa, Villa, etc.)',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:   'clasificacion',
    tabla: 'clasificacion',
    label: 'Clasificación',
    icon:  Grid3x3,
    color: '#0891b2',
    desc:  'Clasificación del uso del lote (Baldío, Casa, Construcción, etc.)',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:   'cuotas_estandar',
    tabla: '__custom__',
    label: 'Cuotas Estándar',
    icon:  DollarSign,
    color: '#059669',
    desc:  'Cuotas de mantenimiento con precios por sección y clasificación',
    campos: [],
  },
  {
    key:   'formas_pago',
    tabla: 'formas_pago',
    label: 'Formas de Pago',
    icon:  CreditCard,
    color: '#d97706',
    desc:  'Métodos de pago disponibles en recibos, cobranza y compras',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:   'marcas_vehiculos',
    tabla: 'marcas_vehiculos',
    label: 'Marcas de Vehículos',
    icon:  Car,
    color: '#475569',
    desc:  'Marcas disponibles en el registro de vehículos',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:   'tipos_incidencia',
    tabla: 'tipos_incidencia',
    label: 'Tipos de Incidencia',
    icon:  AlertTriangle,
    color: '#dc2626',
    desc:  'Clasificación de incidencias reportadas en el residencial',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:   'origenes_incidencia',
    tabla: 'origenes_incidencia',
    label: 'Orígenes de Incidencia',
    icon:  MapPin,
    color: '#ea580c',
    desc:  'Origen del reporte de incidencia (Residente, Guardia, etc.)',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:   'centros_ingreso',
    tabla: 'centros_ingreso',
    label: 'Centros de Ingreso',
    icon:  ArrowUpCircle,
    color: '#059669',
    desc:  'Centros de ingreso y tipo de captura — Golf, Cuotas, Espacios, Caballerizas',
    campos: [
      { key: 'nombre',        label: 'Nombre *',        type: 'text',   required: true },
      { key: 'codigo',        label: 'Código',          type: 'text' },
      { key: 'tipo',          label: 'Tipo',            type: 'select',
        staticOptions: ['golf', 'cuotas', 'rentas_espacios', 'caballerizas', 'otro'] },
      { key: 'tipo_desglose', label: 'Tipo de Captura', type: 'select',
        staticOptions: ['unico', 'secciones', 'frentes', 'conceptos'] },
      { key: 'notas',         label: 'Notas',           type: 'textarea' },
    ],
  },
  {
    key:    'conceptos_ingreso',
    tabla:  'conceptos_ingreso',
    label:  'Conceptos de Cobro',
    icon:   Tag,
    color:  '#7c3aed',
    desc:   'Conceptos adicionales de cobro en recibos de ingreso (No identificados, Deslindes, Tags, Intereses, etc.)',
    sortBy: 'orden',
    campos: [
      { key: 'nombre',               label: 'Nombre *',          type: 'text',    required: true },
      { key: 'clave',                label: 'Clave interna',     type: 'text' },
      { key: 'id_centro_ingreso_fk', label: 'Centro de Ingreso', type: 'select',  selectTabla: 'centros_ingreso' },
      { key: 'orden',                label: 'Orden de aparición',type: 'number' },
    ],
  },
  // ── Mantenimiento ────────────────────────────────────────────
  {
    key:          'cat_mano_obra',
    tabla:        'cat_categorias_mano_obra',
    label:        'Categorías Mano de Obra',
    icon:         HardHat,
    color:        '#b45309',
    sectionLabel: 'Mantenimiento',
    desc:         'Categorías de mano de obra con sueldo diario y costo por hora de referencia (sueldo/8)',
    sortBy:       'categoria',
    campos: [
      { key: 'categoria',     label: 'Categoría *',      type: 'text',   required: true },
      { key: 'sueldo_diario', label: 'Sueldo Diario *',  type: 'number', required: true },
    ],
  },
  {
    key:   'colaboradores',
    tabla: '__custom__',
    label: 'Colaboradores',
    icon:  Users,
    color: '#b45309',
    desc:  'Personal operativo — usado para asignar OT (Asignado a / Supervisor)',
    campos: [],
  },
  // ── Golf ─────────────────────────────────────────────────────
  {
    key:          'golf_categorias',
    tabla:        'cat_categorias_socios',
    schema:       'golf',
    label:        'Categorías de Socios',
    icon:         Tag,
    color:        '#059669',
    sectionLabel: 'Golf',
    desc:         'Categorías de membresía del Club de Golf (Platino, Oro, Familiar, etc.)',
    campos: [
      { key: 'nombre',      label: 'Nombre *',    type: 'text',     required: true },
      { key: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
  },
  {
    key:    'golf_espacios',
    tabla:  'cat_espacios_deportivos',
    schema: 'golf',
    label:  'Espacios Deportivos',
    icon:   MapPin,
    color:  '#0369a1',
    desc:   'Canchas y espacios disponibles para reservaciones',
    campos: [
      { key: 'nombre',      label: 'Nombre *',    type: 'text',     required: true },
      { key: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
  },
  {
    key:    'golf_formas',
    tabla:  'cat_formas_juego',
    schema: 'golf',
    label:  'Formas de Juego',
    icon:   Flag,
    color:  '#d97706',
    desc:   'Modalidades de juego (18 Hoyos, 9 Hoyos, Práctica, etc.)',
    campos: [
      { key: 'nombre', label: 'Nombre *', type: 'text', required: true },
    ],
  },
  {
    key:    'golf_tipos_pase',
    tabla:  'cat_pases_config',
    schema: 'golf',
    label:  'Tipos de Pase',
    icon:   Ticket,
    color:  '#d97706',
    desc:   'Tipos de pase de invitación disponibles al asignar pases a socios',
    campos: [
      { key: 'nombre',      label: 'Nombre *',    type: 'text',     required: true },
      { key: 'descripcion', label: 'Descripción', type: 'textarea' },
    ],
  },
  {
    key:    'golf_cuotas',
    tabla:  '__custom__',
    label:  'Cuotas de Membresía',
    icon:   DollarSign,
    color:  '#7c3aed',
    desc:   'Cuotas de inscripción, mensualidad y pensión de carrito por categoría',
    campos: [],
  },
  {
    key:   'centros_venta_pos',
    tabla: '__custom__',
    label: 'Centros de Venta POS',
    icon:  Store,
    color: '#059669',
    desc:  'Centros de venta del POS de Golf y su mapeo al Centro de Ingreso para cortes',
    campos: [],
  },
]

// ══════════════════════════════════════════════════════════════
// Cuotas Estándar — cabecera + detalle de precios
// ══════════════════════════════════════════════════════════════
const PERIODICIDADES_CEP = ['Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Única']

type CuotaHeader = {
  id: number
  nombre: string
  periodicidad: string | null
  descripcion: string | null
  activo: boolean
  _lineCount?: number
}

type CuotaDetLine = {
  id: number
  id_cuota_fk: number
  id_seccion_fk: number
  id_clasificacion_fk: number
  monto: number
  activo: boolean
  secciones?: { nombre: string }
  clasificacion?: { nombre: string }
}

function CuotasEstandarPanel() {
  const { authUser } = useAuth()
  const puedeEscribir = authUser?.rol === 'superadmin' || authUser?.rol === 'admin'
  const [cuotas, setCuotas]         = useState<CuotaHeader[]>([])
  const [loading, setLoading]       = useState(true)
  const [formOpen, setFormOpen]     = useState(false)
  const [editing, setEditing]       = useState<CuotaHeader | null>(null)
  const [saving, setSaving]         = useState(false)
  const [preciosFor, setPreciosFor] = useState<CuotaHeader | null>(null)
  const [form, setForm] = useState({ nombre: '', periodicidad: 'Mensual', descripcion: '' })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: rows }, { data: dets }] = await Promise.all([
      dbCfg.from('cuotas_estandar').select('id, nombre, periodicidad, descripcion, activo').order('nombre'),
      dbCfg.from('cuotas_estandar_det').select('id_cuota_fk').eq('activo', true),
    ])
    const countMap = new Map<number, number>()
    ;(dets ?? []).forEach((d: any) => countMap.set(d.id_cuota_fk, (countMap.get(d.id_cuota_fk) ?? 0) + 1))
    setCuotas((rows ?? []).map((c: any) => ({ ...c, _lineCount: countMap.get(c.id) ?? 0 })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openNew = () => {
    setEditing(null)
    setForm({ nombre: '', periodicidad: 'Mensual', descripcion: '' })
    setFormOpen(true)
  }

  const openEdit = (c: CuotaHeader) => {
    setEditing(c)
    setForm({ nombre: c.nombre, periodicidad: c.periodicidad ?? 'Mensual', descripcion: c.descripcion ?? '' })
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) return
    setSaving(true)
    const payload = {
      nombre:       form.nombre.trim(),
      periodicidad: form.periodicidad || null,
      descripcion:  form.descripcion.trim() || null,
    }
    if (editing) await dbCfg.from('cuotas_estandar').update(payload).eq('id', editing.id)
    else          await dbCfg.from('cuotas_estandar').insert({ ...payload, activo: true })
    setSaving(false)
    setFormOpen(false)
    fetchAll()
  }

  const toggleActivo = async (c: CuotaHeader) => {
    await dbCfg.from('cuotas_estandar').update({ activo: !c.activo }).eq('id', c.id)
    fetchAll()
  }

  const activas   = cuotas.filter(c => c.activo).length
  const inactivas = cuotas.filter(c => !c.activo).length
  const labelSt: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#05996920',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={15} style={{ color: '#059669' }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Cuotas Estándar</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>
            Cuotas de mantenimiento con precios por sección y clasificación
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchAll} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew}>
              <Plus size={14} /> Nueva Cuota
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 12 }}><strong style={{ color: '#15803d' }}>{activas}</strong> activas</span>
        </div>
        {inactivas > 0 && (
          <div className="card" style={{ padding: '8px 16px' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>{inactivas}</strong> inactivas</span>
          </div>
        )}
      </div>

      {/* Formulario inline */}
      {formOpen && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{editing ? 'Editar cuota' : 'Nueva cuota'}</span>
            <button onClick={() => setFormOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '10px 16px' }}>
            <div>
              <label style={labelSt}>Nombre *</label>
              <input className="input" value={form.nombre} autoFocus
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Cuota de Mantenimiento 2026" />
            </div>
            <div>
              <label style={labelSt}>Periodicidad</label>
              <select className="select" value={form.periodicidad}
                onChange={e => setForm(f => ({ ...f, periodicidad: e.target.value }))}>
                {PERIODICIDADES_CEP.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Descripción</label>
              <input className="input" value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Descripción opcional" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn-secondary" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving || !form.nombre.trim()} onClick={handleSave}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              {editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>ID</th>
              <th>Nombre</th>
              <th style={{ width: 130 }}>Periodicidad</th>
              <th>Descripción</th>
              <th style={{ width: 120, textAlign: 'center' }}>Precios</th>
              <th style={{ width: 80, textAlign: 'center' }}>Status</th>
              {puedeEscribir && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : cuotas.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Sin cuotas. Haz clic en "Nueva Cuota" para agregar.
              </td></tr>
            ) : cuotas.map(c => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.45 }}>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.id}</td>
                <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.periodicidad ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 180,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.descripcion ?? '—'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => setPreciosFor(c)}
                    title="Ver / editar precios por sección y clasificación"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                      padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600,
                      background: (c._lineCount ?? 0) > 0 ? '#dcfce7' : '#fef3c7',
                      color:      (c._lineCount ?? 0) > 0 ? '#15803d' : '#92400e' }}>
                    <Eye size={11} />
                    {c._lineCount ?? 0} línea{(c._lineCount ?? 0) !== 1 ? 's' : ''}
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => puedeEscribir && toggleActivo(c)}
                    style={{ background: 'none', border: 'none', cursor: puedeEscribir ? 'pointer' : 'default', display: 'flex', margin: '0 auto' }}>
                    {c.activo
                      ? <ToggleRight size={20} style={{ color: '#15803d' }} />
                      : <ToggleLeft  size={20} style={{ color: '#cbd5e1' }} />}
                  </button>
                </td>
                {puedeEscribir && (
                  <td>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => openEdit(c)}>
                      <Edit2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preciosFor && (
        <CuotaPreciosModal
          cuota={preciosFor}
          puedeEscribir={puedeEscribir}
          onClose={() => { setPreciosFor(null); fetchAll() }}
        />
      )}
    </div>
  )
}

// ── Modal de líneas de precio ──────────────────────────────────────────────────
function CuotaPreciosModal({ cuota, puedeEscribir, onClose }: {
  cuota: CuotaHeader; puedeEscribir: boolean; onClose: () => void
}) {
  const [lines, setLines]         = useState<CuotaDetLine[]>([])
  const [loading, setLoading]     = useState(true)
  const [secciones, setSecciones] = useState<any[]>([])
  const [clasifs, setClasifs]     = useState<any[]>([])
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState<number | null>(null)
  const [editMonto, setEditMonto] = useState('')
  const [newLine, setNewLine]     = useState({ id_seccion_fk: '', id_clasificacion_fk: '', monto: '' })
  const [errorNew, setErrorNew]   = useState('')

  const fetchLines = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCfg.from('cuotas_estandar_det')
      .select('*, secciones(nombre), clasificacion(nombre)')
      .eq('id_cuota_fk', cuota.id)
      .order('id')
    setLines((data as CuotaDetLine[]) ?? [])
    setLoading(false)
  }, [cuota.id])

  useEffect(() => {
    Promise.all([
      dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('clasificacion').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([{ data: secs }, { data: cls }]) => {
      setSecciones(secs ?? [])
      setClasifs(cls ?? [])
    })
    fetchLines()
  }, [fetchLines])

  const handleAdd = async () => {
    setErrorNew('')
    if (!newLine.id_seccion_fk || !newLine.id_clasificacion_fk || !newLine.monto) {
      setErrorNew('Completa todos los campos'); return
    }
    setSaving(true)
    const { error } = await dbCfg.from('cuotas_estandar_det').insert({
      id_cuota_fk:         cuota.id,
      id_seccion_fk:       Number(newLine.id_seccion_fk),
      id_clasificacion_fk: Number(newLine.id_clasificacion_fk),
      monto:               Number(newLine.monto),
      activo:              true,
    })
    setSaving(false)
    if (error) {
      setErrorNew(error.code === '23505'
        ? 'Ya existe un precio para esa sección y clasificación'
        : error.message)
      return
    }
    setNewLine({ id_seccion_fk: '', id_clasificacion_fk: '', monto: '' })
    fetchLines()
  }

  const handleSaveEdit = async (id: number) => {
    if (!editMonto) return
    await dbCfg.from('cuotas_estandar_det').update({ monto: Number(editMonto) }).eq('id', id)
    setEditId(null)
    fetchLines()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta línea de precio?')) return
    await dbCfg.from('cuotas_estandar_det').delete().eq('id', id)
    fetchLines()
  }

  const toggleLine = async (l: CuotaDetLine) => {
    await dbCfg.from('cuotas_estandar_det').update({ activo: !l.activo }).eq('id', l.id)
    fetchLines()
  }

  const fmtM = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const labelSt: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }

  return (
    <ModalShell modulo="residencial" titulo={`Precios — ${cuota.nombre}`} onClose={onClose} maxWidth={660}
      footer={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}
    >
      <div style={{ padding: '0 24px 24px' }}>
        {/* Info cabecera */}
        <div style={{ display: 'flex', gap: 20, padding: '12px 0 16px', borderBottom: '1px solid #f1f5f9', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: '#059669', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>Periodicidad</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{cuota.periodicidad ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#059669', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>Líneas activas</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{lines.filter(l => l.activo).length}</div>
          </div>
        </div>

        {/* Tabla de líneas */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: puedeEscribir ? 16 : 0 }}>
          <table>
            <thead>
              <tr>
                <th>Sección</th>
                <th>Clasificación</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th style={{ width: 64, textAlign: 'center' }}>Activo</th>
                {puedeEscribir && <th style={{ width: 52 }}></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32 }}>
                  <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : lines.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                  Sin líneas de precio. Agrega secciones abajo.
                </td></tr>
              ) : lines.map(l => (
                <tr key={l.id} style={{ opacity: l.activo ? 1 : 0.45 }}>
                  <td style={{ fontWeight: 500 }}>{(l as any).secciones?.nombre ?? '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{(l as any).clasificacion?.nombre ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {editId === l.id ? (
                      <input className="input" type="number" step="0.01" value={editMonto} autoFocus
                        style={{ width: 110, textAlign: 'right', padding: '4px 8px' }}
                        onChange={e => setEditMonto(e.target.value)}
                        onBlur={() => handleSaveEdit(l.id)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(l.id); if (e.key === 'Escape') setEditId(null) }}
                      />
                    ) : (
                      <button onClick={() => { if (puedeEscribir) { setEditId(l.id); setEditMonto(l.monto.toString()) } }}
                        style={{ background: 'none', border: 'none', fontWeight: 600, fontSize: 13,
                          color: 'var(--blue)', fontVariantNumeric: 'tabular-nums',
                          cursor: puedeEscribir ? 'pointer' : 'default' }}
                        title={puedeEscribir ? 'Haz clic para editar el monto' : undefined}>
                        {fmtM(l.monto)}
                      </button>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => toggleLine(l)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', margin: '0 auto' }}>
                      {l.activo
                        ? <ToggleRight size={18} style={{ color: '#15803d' }} />
                        : <ToggleLeft  size={18} style={{ color: '#cbd5e1' }} />}
                    </button>
                  </td>
                  {puedeEscribir && (
                    <td>
                      <button className="btn-ghost" style={{ padding: '3px 6px', color: '#dc2626' }}
                        onClick={() => handleDelete(l.id)}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Agregar línea */}
        {puedeEscribir && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
              Agregar línea de precio
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px auto', gap: 8, alignItems: 'flex-end' }}>
              <div>
                <label style={labelSt}>Sección</label>
                <select className="select" value={newLine.id_seccion_fk}
                  onChange={e => setNewLine(n => ({ ...n, id_seccion_fk: e.target.value }))}>
                  <option value="">— Sección —</option>
                  {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Clasificación</label>
                <select className="select" value={newLine.id_clasificacion_fk}
                  onChange={e => setNewLine(n => ({ ...n, id_clasificacion_fk: e.target.value }))}>
                  <option value="">— Clasificación —</option>
                  {clasifs.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Monto *</label>
                <input className="input" type="number" step="0.01" placeholder="0.00"
                  value={newLine.monto}
                  onChange={e => setNewLine(n => ({ ...n, monto: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()} />
              </div>
              <button className="btn-primary" onClick={handleAdd} disabled={saving}
                style={{ padding: '8px 14px', alignSelf: 'flex-end' }}>
                {saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
              </button>
            </div>
            {errorNew && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}>
                <AlertTriangle size={12} /> {errorNew}
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Centros de Venta POS — panel custom con mapeo a Centro de Ingreso
// ══════════════════════════════════════════════════════════════
type CentroVentaPos = { id: number; nombre: string; descripcion: string | null; activo: boolean; orden: number; serie_factura: string | null }
type CentroIngresoOpt = { id: number; nombre: string; activo: boolean }
type IngresoMapRow   = { id: number; id_centro_venta_fk: number; id_centro_ingreso_fk: number; activo: boolean; genera_recibo_automatico: boolean }

// ══════════════════════════════════════════════════════════════
// Cuotas de Membresía Golf
// ══════════════════════════════════════════════════════════════
function CuotasGolfPanel() {
  const { authUser } = useAuth()
  const puedeEscribir = authUser?.rol === 'superadmin' || authUser?.rol === 'admin'
  return <CuotasConfigPanel puedeEscribir={puedeEscribir} />
}

// ══════════════════════════════════════════════════════════════
// Colaboradores — personal operativo (Asignado a / Supervisor de OT)
// ══════════════════════════════════════════════════════════════
const emptyColabForm = () => ({
  nombre: '', apellido_paterno: '', apellido_materno: '', fecha_ingreso: '', puesto: '',
  sueldo_bruto_mensual: '', sueldo_neto_mensual: '',
  es_asignado: false, es_supervisor: false,
})

function ColaboradoresPanel() {
  const { authUser } = useAuth()
  const puedeEscribir = authUser?.rol === 'superadmin' || authUser?.rol === 'admin'
  const [items, setItems]       = useState<Colaborador[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing]   = useState<Colaborador | null>(null)
  const [editing, setEditing]   = useState<Colaborador | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState(emptyColabForm())

  const [busqueda, setBusqueda]     = useState('')
  const [filtroAsignado, setFA]     = useState('all')
  const [filtroSupervisor, setFS]   = useState('all')
  const [filtroStatus, setFStatus]  = useState('activos')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const { data: colabs } = await dbCfg.from('colaboradores').select('*').order('nombre')
    setItems((colabs as Colaborador[]) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  const openNew = () => { setEditing(null); setForm(emptyColabForm()); setError(''); setShowForm(true) }
  const openEdit = (c: Colaborador) => {
    setEditing(c)
    setForm({
      nombre: c.nombre, apellido_paterno: c.apellido_paterno ?? '', apellido_materno: c.apellido_materno ?? '',
      fecha_ingreso: c.fecha_ingreso ?? '', puesto: c.puesto ?? '',
      sueldo_bruto_mensual: c.sueldo_bruto_mensual?.toString() ?? '', sueldo_neto_mensual: c.sueldo_neto_mensual?.toString() ?? '',
      es_asignado: c.es_asignado, es_supervisor: c.es_supervisor,
    })
    setError(''); setViewing(null); setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload: any = {
      nombre: form.nombre.trim(),
      apellido_paterno: form.apellido_paterno.trim() || null,
      apellido_materno: form.apellido_materno.trim() || null,
      fecha_ingreso: form.fecha_ingreso || null,
      puesto: form.puesto.trim() || null,
      sueldo_bruto_mensual: form.sueldo_bruto_mensual ? Number(form.sueldo_bruto_mensual) : null,
      sueldo_neto_mensual: form.sueldo_neto_mensual ? Number(form.sueldo_neto_mensual) : null,
      es_asignado: form.es_asignado,
      es_supervisor: form.es_supervisor,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      const { error: err } = await dbCfg.from('colaboradores').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      payload.activo = true
      const { error: err } = await dbCfg.from('colaboradores').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false); fetchAll()
  }

  const toggleActivo = async (c: Colaborador) => {
    await dbCfg.from('colaboradores').update({ activo: !c.activo, updated_at: new Date().toISOString() }).eq('id', c.id)
    setViewing(null)
    fetchAll()
  }

  const filtered = items.filter(c => {
    if (busqueda.trim() && !nombreCompletoColaborador(c).toLowerCase().includes(busqueda.trim().toLowerCase())) return false
    if (filtroAsignado   !== 'all' && c.es_asignado   !== (filtroAsignado === 'true'))   return false
    if (filtroSupervisor !== 'all' && c.es_supervisor !== (filtroSupervisor === 'true')) return false
    if (filtroStatus === 'activos'   && !c.activo) return false
    if (filtroStatus === 'inactivos' && c.activo)  return false
    return true
  })

  const fmt$ = (v: number | null) => v == null ? '—' : '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const activos      = items.filter(i => i.activo).length
  const asignados    = items.filter(i => i.activo && i.es_asignado).length
  const supervisores = items.filter(i => i.activo && i.es_supervisor).length

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  }
  const modalStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 560,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#b4530918', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={15} style={{ color: '#b45309' }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Colaboradores</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>
            Personal operativo — usado para asignar OT (Asignado a / Supervisor)
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchAll} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nuevo colaborador
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 12 }}><strong style={{ color: '#15803d' }}>{activos}</strong> activos</span>
        </div>
        <div className="card" style={{ padding: '8px 16px' }}>
          <span style={{ fontSize: 12 }}><strong style={{ color: '#0369a1' }}>{asignados}</strong> asignables</span>
        </div>
        <div className="card" style={{ padding: '8px 16px' }}>
          <span style={{ fontSize: 12 }}><strong style={{ color: '#7c3aed' }}>{supervisores}</strong> supervisores</span>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
          <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 28 }} placeholder="Buscar nombre…"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <select className="select" style={{ flex: '1 1 130px', maxWidth: 170 }} value={filtroAsignado} onChange={e => setFA(e.target.value)}>
          <option value="all">Asignado: todos</option>
          <option value="true">Solo asignables</option>
          <option value="false">No asignables</option>
        </select>
        <select className="select" style={{ flex: '1 1 130px', maxWidth: 170 }} value={filtroSupervisor} onChange={e => setFS(e.target.value)}>
          <option value="all">Supervisor: todos</option>
          <option value="true">Solo supervisores</option>
          <option value="false">No supervisores</option>
        </select>
        <select className="select" style={{ flex: '1 1 110px', maxWidth: 150 }} value={filtroStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
          <option value="all">Todos</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} registros</span>
      </div>

      {/* Modal de captura / edición */}
      {showForm && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                {editing ? 'Editar colaborador' : 'Nuevo colaborador'}
              </span>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Nombre(s) *</label>
                <input className="input" value={form.nombre} autoFocus onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre(s)" />
              </div>
              <div>
                <label className="label">Apellido Paterno</label>
                <input className="input" value={form.apellido_paterno} onChange={e => setForm(f => ({ ...f, apellido_paterno: e.target.value }))} />
              </div>
              <div>
                <label className="label">Apellido Materno</label>
                <input className="input" value={form.apellido_materno} onChange={e => setForm(f => ({ ...f, apellido_materno: e.target.value }))} />
              </div>
              <div>
                <label className="label">Fecha de Ingreso</label>
                <input className="input" type="date" value={form.fecha_ingreso} onChange={e => setForm(f => ({ ...f, fecha_ingreso: e.target.value }))} />
              </div>
              <div>
                <label className="label">Antigüedad</label>
                <input className="input" value={antiguedad(form.fecha_ingreso)} disabled style={{ color: 'var(--text-muted)' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="label">Puesto / Cargo</label>
                <input className="input" value={form.puesto} onChange={e => setForm(f => ({ ...f, puesto: e.target.value }))} />
              </div>
              <div>
                <label className="label">Sueldo Bruto Mensual</label>
                <input className="input" type="number" min="0" step="0.01" value={form.sueldo_bruto_mensual} onChange={e => setForm(f => ({ ...f, sueldo_bruto_mensual: e.target.value }))} placeholder="0.00" />
              </div>
              <div>
                <label className="label">Sueldo Neto Mensual</label>
                <input className="input" type="number" min="0" step="0.01" value={form.sueldo_neto_mensual} onChange={e => setForm(f => ({ ...f, sueldo_neto_mensual: e.target.value }))} placeholder="0.00" />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 24, paddingTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                  <input type="checkbox" checked={form.es_asignado} onChange={e => setForm(f => ({ ...f, es_asignado: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  Es Asignado <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(en "Asignado a" de OT)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                  <input type="checkbox" checked={form.es_supervisor} onChange={e => setForm(f => ({ ...f, es_supervisor: e.target.checked }))} style={{ width: 16, height: 16 }} />
                  Es Supervisor <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>(en "Supervisor" de OT)</span>
                </label>
              </div>
            </div>
            {error && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                {editing ? 'Guardar cambios' : 'Crear colaborador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de consulta */}
      {viewing && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setViewing(null) }}>
          <div style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{nombreCompletoColaborador(viewing)}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{viewing.puesto ?? 'Sin puesto asignado'}</div>
              </div>
              <button onClick={() => setViewing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {viewing.es_asignado && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#eff6ff', color: '#0369a1' }}>
                  <CheckCircle size={11} /> Asignado a OT
                </span>
              )}
              {viewing.es_supervisor && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed' }}>
                  <CheckCircle size={11} /> Supervisor OT
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: viewing.activo ? '#f0fdf4' : '#f8fafc', color: viewing.activo ? '#15803d' : '#94a3b8' }}>
                {viewing.activo ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 13 }}>
              {[
                { label: 'Fecha de Ingreso', value: viewing.fecha_ingreso ? new Date(viewing.fecha_ingreso + 'T00:00:00').toLocaleDateString('es-MX') : '—' },
                { label: 'Antigüedad', value: antiguedad(viewing.fecha_ingreso) || '—' },
                { label: 'Sueldo Bruto', value: fmt$(viewing.sueldo_bruto_mensual) },
                { label: 'Sueldo Neto', value: fmt$(viewing.sueldo_neto_mensual) },
              ].map(({ label, value }) => (
                <div key={label} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                  <div style={{ color: '#1e293b', fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
              {puedeEscribir ? (
                <button className="btn-ghost" style={{ fontSize: 12, color: viewing.activo ? '#dc2626' : '#15803d' }}
                  onClick={() => toggleActivo(viewing)}>
                  {viewing.activo ? 'Dar de baja' : 'Reactivar'}
                </button>
              ) : <div />}
              {puedeEscribir && (
                <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => openEdit(viewing)}>
                  <Edit2 size={13} /> Editar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Puesto</th>
              <th>Fecha Ingreso</th>
              <th>Antigüedad</th>
              <th style={{ textAlign: 'right' }}>Sueldo Bruto</th>
              <th style={{ textAlign: 'right' }}>Sueldo Neto</th>
              <th style={{ textAlign: 'center' }}>Asignado</th>
              <th style={{ textAlign: 'center' }}>Supervisor</th>
              <th style={{ textAlign: 'center', width: 80 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                {items.length === 0 ? 'Sin colaboradores. Crea el primero.' : 'Sin resultados con los filtros aplicados.'}
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.45, cursor: 'pointer' }} onClick={() => setViewing(c)}>
                <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{nombreCompletoColaborador(c)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.puesto ?? '—'}</td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{c.fecha_ingreso ? new Date(c.fecha_ingreso + 'T00:00:00').toLocaleDateString('es-MX') : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{antiguedad(c.fecha_ingreso)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt$(c.sueldo_bruto_mensual)}</td>
                <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt$(c.sueldo_neto_mensual)}</td>
                <td style={{ textAlign: 'center' }}>{c.es_asignado ? <CheckCircle size={15} style={{ color: '#0369a1' }} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={{ textAlign: 'center' }}>{c.es_supervisor ? <CheckCircle size={15} style={{ color: '#7c3aed' }} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                <td style={{ textAlign: 'center' }}>
                  {c.activo ? <ToggleRight size={20} style={{ color: '#15803d' }} /> : <ToggleLeft size={20} style={{ color: '#cbd5e1' }} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Centros de Venta POS ──────────────────────────────────────
const emptyCVForm = () => ({ nombre: '', descripcion: '', orden: 1, id_centro_ingreso_fk: '' as string | number, genera_recibo_automatico: false, serie_factura: '' })

const inputSt: React.CSSProperties = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }
const labelSt: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

function CentrosVentaPOSPanel() {
  const { authUser } = useAuth()
  const puedeEscribir = authUser?.rol === 'superadmin' || authUser?.rol === 'admin'
  const [items, setItems]           = useState<CentroVentaPos[]>([])
  const [centrosIng, setCentrosIng] = useState<CentroIngresoOpt[]>([])
  const [maps, setMaps]             = useState<IngresoMapRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<CentroVentaPos | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [form, setForm]             = useState(emptyCVForm())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: cvs }, { data: cis }, { data: ms }] = await Promise.all([
      dbGolf.from('cat_centros_venta').select('id, nombre, descripcion, activo, orden, serie_factura').order('orden'),
      dbCfg.from('centros_ingreso').select('id, nombre, activo').eq('activo', true).order('nombre'),
      dbGolf.from('pos_centros_ingreso_map').select('id, id_centro_venta_fk, id_centro_ingreso_fk, activo, genera_recibo_automatico'),
    ])
    setItems((cvs as CentroVentaPos[]) ?? [])
    setCentrosIng((cis as CentroIngresoOpt[]) ?? [])
    setMaps((ms as IngresoMapRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const getMap = (id: number) => maps.find(m => m.id_centro_venta_fk === id)

  const openNew = () => {
    setEditing(null); setForm({ ...emptyCVForm(), orden: items.length + 1 }); setError(''); setShowForm(true)
  }
  const openEdit = (item: CentroVentaPos) => {
    const m = getMap(item.id)
    setEditing(item)
    setForm({ nombre: item.nombre, descripcion: item.descripcion ?? '', orden: item.orden, id_centro_ingreso_fk: m?.id_centro_ingreso_fk ?? '', genera_recibo_automatico: m?.genera_recibo_automatico ?? false, serie_factura: item.serie_factura ?? '' })
    setError(''); setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload: any = { nombre: form.nombre.trim(), descripcion: form.descripcion || null, orden: Number(form.orden), serie_factura: form.serie_factura.trim().toUpperCase() || null }
    let centroId: number
    if (editing) {
      const { error: err } = await dbGolf.from('cat_centros_venta').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
      centroId = editing.id
    } else {
      payload.activo = true
      const { data, error: err } = await dbGolf.from('cat_centros_venta').insert(payload).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      centroId = (data as any).id
    }
    const idIngreso = form.id_centro_ingreso_fk ? Number(form.id_centro_ingreso_fk) : null
    const genera    = (form as any).genera_recibo_automatico ?? false
    const existente = getMap(centroId)
    if (idIngreso) {
      if (existente) {
        await dbGolf.from('pos_centros_ingreso_map').update({ id_centro_ingreso_fk: idIngreso, activo: true, genera_recibo_automatico: genera, updated_at: new Date().toISOString() }).eq('id', existente.id)
      } else {
        await dbGolf.from('pos_centros_ingreso_map').insert({ id_centro_venta_fk: centroId, id_centro_ingreso_fk: idIngreso, activo: true, genera_recibo_automatico: genera })
      }
    } else if (existente) {
      await dbGolf.from('pos_centros_ingreso_map').delete().eq('id', existente.id)
    }
    setSaving(false); setShowForm(false); fetchAll()
  }

  const toggleActivo = async (item: CentroVentaPos) => {
    await dbGolf.from('cat_centros_venta').update({ activo: !item.activo }).eq('id', item.id); fetchAll()
  }

  const activos   = items.filter(i => i.activo).length
  const inactivos = items.filter(i => !i.activo).length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#05966918', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Store size={15} style={{ color: '#059669' }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Centros de Venta POS</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>
            Centros de venta del POS de Golf — incluye mapeo al Centro de Ingreso para cortes de caja
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchAll} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nuevo
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 12 }}><strong style={{ color: '#15803d' }}>{activos}</strong> activos</span>
        </div>
        {inactivos > 0 && (
          <div className="card" style={{ padding: '8px 16px' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>{inactivos}</strong> inactivos</span>
          </div>
        )}
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{editing ? 'Editar centro' : 'Nuevo centro'}</span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Nombre *</label>
              <input style={inputSt} value={form.nombre} autoFocus onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Golf Principal" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelSt}>Descripción</label>
              <input style={inputSt} value={form.descripcion as string} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción opcional" />
            </div>
            <div>
              <label style={labelSt}>Orden</label>
              <input style={inputSt} type="number" min="1" value={form.orden} onChange={e => setForm(f => ({ ...f, orden: Number(e.target.value) }))} />
            </div>
            <div>
              <label style={labelSt}>Centro de Ingreso (cortes)</label>
              <select style={{ ...inputSt, cursor: 'pointer' }} value={String(form.id_centro_ingreso_fk)} onChange={e => setForm(f => ({ ...f, id_centro_ingreso_fk: e.target.value }))}>
                <option value="">Sin asignar</option>
                {centrosIng.map(ci => <option key={ci.id} value={String(ci.id)}>{ci.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Serie de Factura</label>
              <input style={{ ...inputSt, fontFamily: 'monospace', textTransform: 'uppercase' }}
                value={form.serie_factura} onChange={e => setForm(f => ({ ...f, serie_factura: e.target.value }))}
                placeholder="Ej. GOLF, HIPICO" />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                Prefijo del folio de factura para las ventas de este centro (ej. GOLF-0001). Si se deja vacío, se usa "FAC".
              </div>
            </div>
          </div>
          {form.id_centro_ingreso_fk && (
            <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8,
              background: (form as any).genera_recibo_automatico ? '#f0fdf4' : '#fef3c7',
              border: `1px solid ${(form as any).genera_recibo_automatico ? '#bbf7d0' : '#fde68a'}`,
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="chk-genera-recibo-cat"
                checked={(form as any).genera_recibo_automatico ?? false}
                onChange={e => setForm(f => ({ ...f, genera_recibo_automatico: e.target.checked } as any))} />
              <label htmlFor="chk-genera-recibo-cat" style={{ fontSize: 13, cursor: 'pointer',
                color: (form as any).genera_recibo_automatico ? '#15803d' : '#92400e', fontWeight: 500 }}>
                {(form as any).genera_recibo_automatico
                  ? '🟢 Genera recibo de ingreso automáticamente al hacer corte'
                  : '🟡 No genera recibo automático — captura manual requerida'}
              </label>
            </div>
          )}
          {error && <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              {editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>ID</th>
              <th>Nombre</th>
              <th>Descripción</th>
              <th style={{ width: 60, textAlign: 'center' }}>Orden</th>
              <th>Centro de Ingreso</th>
              <th style={{ width: 100, textAlign: 'center' }}>Serie Factura</th>
              <th style={{ width: 100, textAlign: 'center' }}>Recibo Auto</th>
              <th style={{ width: 80, textAlign: 'center' }}>Status</th>
              {puedeEscribir && <th style={{ width: 90 }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Sin centros. Haz clic en "Nuevo" para agregar.
              </td></tr>
            ) : items.map(item => {
              const m = getMap(item.id)
              const ciNombre = m ? (centrosIng.find(ci => ci.id === m.id_centro_ingreso_fk)?.nombre ?? '—') : null
              return (
                <tr key={item.id} style={{ opacity: item.activo ? 1 : 0.45 }}>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.id}</td>
                  <td style={{ fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Store size={12} color="#059669" />{item.nombre}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.descripcion ?? '—'}</td>
                  <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>{item.orden}</td>
                  <td>
                    {ciNombre
                      ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: '#dcfce7', color: '#15803d' }}>{ciNombre}</span>
                      : <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Sin asignar</span>}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: item.serie_factura ? '#7c3aed' : '#cbd5e1' }}>
                    {item.serie_factura || 'FAC'}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {m ? (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                        background: m.genera_recibo_automatico ? '#dcfce7' : '#fef3c7',
                        color: m.genera_recibo_automatico ? '#15803d' : '#92400e' }}>
                        {m.genera_recibo_automatico ? 'Activo' : 'Manual'}
                      </span>
                    ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => toggleActivo(item)} style={{ background: 'none', border: 'none', cursor: puedeEscribir ? 'pointer' : 'default', display: 'flex', margin: '0 auto' }}>
                      {item.activo
                        ? <ToggleRight size={20} style={{ color: '#15803d' }} />
                        : <ToggleLeft  size={20} style={{ color: '#cbd5e1' }} />}
                    </button>
                  </td>
                  {puedeEscribir && (
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => openEdit(item)}><Edit2 size={13} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
export default function CatalogosPage() {
  const { authUser } = useAuth()
  const [activeKey, setActiveKey] = useState(CATALOGOS[0].key)
  const active = CATALOGOS.find(c => c.key === activeKey)!

  if (authUser?.rol !== 'superadmin' && authUser?.rol !== 'admin') {
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
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <BookOpen size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Sistema</span>
          </div>
          <h1 className="page-title-xl">Catálogos</h1>
          <p className="page-subtitle">Administra los valores de los catálogos del sistema</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Menú lateral */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {CATALOGOS.map((cat, i) => {
            const Icon = cat.icon
            const isActive = cat.key === activeKey
            const showSection = cat.sectionLabel && (i === 0 || CATALOGOS[i - 1].sectionLabel !== cat.sectionLabel)
            return (
              <div key={cat.key}>
                {showSection && (
                  <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', marginTop: i > 0 ? 4 : 0 }}>
                    {cat.sectionLabel}
                  </div>
                )}
                <button onClick={() => setActiveKey(cat.key)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: isActive ? cat.color + '10' : 'none',
                    border: 'none', borderLeft: `3px solid ${isActive ? cat.color : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7,
                    background: cat.color + (isActive ? '20' : '12'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={13} style={{ color: cat.color }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? cat.color : 'var(--text-primary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cat.label}
                  </div>
                </button>
              </div>
            )
          })}
        </div>

        {activeKey === 'centros_venta_pos'
          ? <CentrosVentaPOSPanel key="centros_venta_pos" />
          : activeKey === 'golf_cuotas'
          ? <CuotasGolfPanel key="golf_cuotas" />
          : activeKey === 'cuotas_estandar'
          ? <CuotasEstandarPanel key="cuotas_estandar" />
          : activeKey === 'colaboradores'
          ? <ColaboradoresPanel key="colaboradores" />
          : <CatalogoTable config={active} key={activeKey} />
        }
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Tabla genérica
// ══════════════════════════════════════════════════════════════
const PAGE_SIZE = 25

function CatalogoTable({ config }: { config: CatConfig }) {
  const db = config.schema === 'comp' ? dbComp : config.schema === 'golf' ? dbGolf : dbCfg
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<any | null | 'new'>(null)
  const [detailRow, setDetailRow] = useState<any | null>(null)
  const [detailAreasRow, setDetailAreasRow] = useState<any | null>(null)
  const [detailAdminRow, setDetailAdminRow] = useState<any | null>(null)
  const [page, setPage]       = useState(1)
  // Mapa de selects: { campo_key: { id: nombre } }
  const [selectMaps, setSelectMaps] = useState<Record<string, Record<number, string>>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    setPage(1)
    const { data } = await db.from(config.tabla).select('*').order(config.sortBy ?? 'nombre')
    setRows(data ?? [])
    // Cargar opciones de campos select
    const maps: Record<string, Record<number, string>> = {}
    for (const c of config.campos.filter(f => f.type === 'select' && f.selectTabla)) {
      const sdb = c.selectSchema === 'comp' ? dbComp : c.selectSchema === 'golf' ? dbGolf : dbCfg
      let q = sdb.from(c.selectTabla!).select('id, nombre')
      if (c.selectFilter) q = q.match(c.selectFilter)
      const { data: opts } = await q.order('nombre')
      const m: Record<number, string> = {}
      ;(opts ?? []).forEach((o: any) => { m[o.id] = o.nombre })
      maps[c.key] = m
    }
    setSelectMaps(maps)
    if (config.clientSortBy && maps[config.clientSortBy]) {
      const m = maps[config.clientSortBy]
      setRows(r => [...r].sort((a, b) =>
        (m[a[config.clientSortBy!]] ?? '').localeCompare(m[b[config.clientSortBy!]] ?? '', 'es')
      ))
    }
    setLoading(false)
  }, [config.tabla, config.clientSortBy])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleActivo = async (row: any) => {
    await db.from(config.tabla).update({ activo: !row.activo }).eq('id', row.id)
    fetchData()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return
    await db.from(config.tabla).delete().eq('id', id)
    fetchData()
  }

  // Columnas visibles en tabla (excluye descripcion, file)
  const colsTabla = config.campos.filter(c =>
    !['descripcion', 'expediente_url'].includes(c.key) &&
    c.type !== 'file' && c.type !== 'textarea' && !c.hideInTable
  )
  const colFile = config.campos.find(c => c.type === 'file' && !c.hideInTable)

  const activos     = rows.filter(r => r.activo).length
  const inactivos   = rows.filter(r => !r.activo).length
  const totalPages  = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage    = Math.min(page, totalPages)
  const pagedRows   = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const Icon = config.icon

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: config.color + '18',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={15} style={{ color: config.color }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{config.label}</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>{config.desc}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn-primary" onClick={() => setModal('new')}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={13} style={{ color: '#15803d' }} />
          <span style={{ fontSize: 12 }}><strong style={{ color: '#15803d' }}>{activos}</strong> activos</span>
        </div>
        {inactivos > 0 && (
          <div className="card" style={{ padding: '8px 16px' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}><strong>{inactivos}</strong> inactivos</span>
          </div>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>ID</th>
              {colsTabla.map(c => <th key={c.key}>{c.label.replace(' *','')}</th>)}
              {colFile && <th style={{ width: 90 }}>Expediente</th>}
              <th style={{ width: 80, textAlign: 'center' }}>Status</th>
              <th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={20} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={20} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Sin registros. Haz clic en "Nuevo" para agregar.
              </td></tr>
            ) : pagedRows.map(row => (
              <tr key={row.id} style={{ opacity: row.activo ? 1 : 0.45 }}>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.id}</td>
                {colsTabla.map(c => (
                  <td key={c.key} style={{ fontSize: c.key === 'nombre' ? 14 : 12, fontWeight: c.key === 'nombre' ? 500 : 400, color: 'var(--text-secondary)' }}>
                    {c.type === 'select'
                      ? (c.staticOptions ? (row[c.key] ?? '—') : (selectMaps[c.key]?.[row[c.key]] ?? '—'))
                      : c.type === 'number' && row[c.key] != null
                        ? (['monto', 'saldo'].includes(c.key) ? '$' + Number(row[c.key]).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : row[c.key])
                        : (row[c.key] ?? '—')}
                  </td>
                ))}
                {colFile && (
                  <td style={{ textAlign: 'center' }}>
                    {row.expediente_url
                      ? <a href={row.expediente_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <ExternalLink size={11} /> Ver
                        </a>
                      : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                  </td>
                )}
                <td style={{ textAlign: 'center' }}>
                  <button onClick={() => toggleActivo(row)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', margin: '0 auto' }}>
                    {row.activo
                      ? <ToggleRight size={20} style={{ color: '#15803d' }} />
                      : <ToggleLeft  size={20} style={{ color: '#cbd5e1' }} />}
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {config.key === 'areas' && (
                      <button className="btn-ghost" style={{ padding: '4px 6px', color: '#059669' }}
                        title="Áreas Comunes" onClick={() => setDetailAreasRow(row)}>
                        <Flag size={13} />
                      </button>
                    )}
                    {config.key === 'secciones' &&
                      (selectMaps['id_tipo_seccion_fk']?.[row.id_tipo_seccion_fk] ?? '').toLowerCase() === 'condominio' && (
                      <button className="btn-ghost" style={{ padding: '4px 6px', color: '#7c3aed' }}
                        title="Administración Interna" onClick={() => setDetailAdminRow(row)}>
                        <Building2 size={13} />
                      </button>
                    )}
                    {config.hasDetail && (
                      <button className="btn-ghost" style={{ padding: '4px 6px', color: '#0f766e' }} onClick={() => setDetailRow(row)}>
                        <Eye size={13} />
                      </button>
                    )}
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(row)}>
                      <Edit2 size={13} />
                    </button>
                    <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }} onClick={() => handleDelete(row.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ── */}
      {rows.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 12, padding: '8px 12px', background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Mostrando {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)} de <strong>{rows.length}</strong> registros
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: '«', title: 'Primera página',   action: () => setPage(1),              disabled: safePage === 1 },
              { label: '‹', title: 'Página anterior',  action: () => setPage(p => p - 1),     disabled: safePage === 1 },
              { label: '›', title: 'Página siguiente', action: () => setPage(p => p + 1),     disabled: safePage === totalPages },
              { label: '»', title: 'Última página',    action: () => setPage(totalPages),     disabled: safePage === totalPages },
            ].map(btn => (
              <button key={btn.label} title={btn.title} onClick={btn.action} disabled={btn.disabled}
                style={{ width: 32, height: 32, borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg)', cursor: btn.disabled ? 'default' : 'pointer',
                  fontSize: 15, fontWeight: 600,
                  color: btn.disabled ? 'var(--text-muted)' : 'var(--text-primary)',
                  opacity: btn.disabled ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {btn.label}
              </button>
            ))}
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px',
              fontSize: 12, color: 'var(--text-secondary)', gap: 4 }}>
              Pág. <strong>{safePage}</strong> / {totalPages}
            </span>
          </div>
        </div>
      )}

      {modal !== null && (
        <CatalogoModal
          config={config}
          row={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData() }}
        />
      )}
      {detailAreasRow !== null && config.key === 'areas' && (
        <AreaAreasComunes
          area={detailAreasRow}
          onClose={() => { setDetailAreasRow(null); fetchData() }}
        />
      )}
      {detailAdminRow !== null && config.key === 'secciones' && (
        <SeccionAdministracion
          seccion={detailAdminRow}
          onClose={() => { setDetailAdminRow(null); fetchData() }}
        />
      )}
      {detailRow !== null && config.key === 'cuadrantes' && (
        <CuadranteSecciones
          cuadrante={detailRow}
          onClose={() => { setDetailRow(null); fetchData() }}
        />
      )}
      {detailRow !== null && config.key === 'secciones' && (
        <SeccionLotesDetail
          seccion={detailRow}
          onClose={() => { setDetailRow(null); fetchData() }}
        />
      )}
      {detailRow !== null && config.key === 'cuentas_bancarias' && (
        <CuentaBancariaDetail
          cuenta={detailRow}
          onClose={() => { setDetailRow(null); fetchData() }}
        />
      )}
      {detailRow !== null && config.key === 'frentes' && (
        <RelAreaFrenteDetail
          modo="frente"
          fila={detailRow}
          onClose={() => { setDetailRow(null); fetchData() }}
        />
      )}
      {detailRow !== null && config.key === 'areas' && (
        <RelAreaFrenteDetail
          modo="area"
          fila={detailRow}
          onClose={() => { setDetailRow(null); fetchData() }}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Detalle de Cuenta Bancaria — historial de movimientos
// ══════════════════════════════════════════════════════════════
const fmtMXN = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function CuentaBancariaDetail({ cuenta, onClose }: { cuenta: any; onClose: () => void }) {
  const { authUser } = useAuth()
  const [movs, setMovs]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtroDe, setFiltroDe]   = useState('')
  const [filtroA, setFiltroA]     = useState('')
  const [saldoActual, setSaldo]   = useState<number>(cuenta.saldo ?? 0)
  const [showAbono, setShowAbono] = useState(false)
  const [savingAbono, setSavingAbono] = useState(false)
  const [errorAbono, setErrorAbono]   = useState('')
  const [formAbono, setFormAbono] = useState({
    fecha:     new Date().toISOString().slice(0, 10),
    monto:     '',
    concepto:  '',
    referencia: '',
  })

  const setFA = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormAbono(f => ({ ...f, [k]: e.target.value }))

  const handleAbono = async () => {
    if (!formAbono.monto || Number(formAbono.monto) <= 0) {
      setErrorAbono('El monto debe ser mayor a cero'); return
    }
    if (!formAbono.concepto.trim()) {
      setErrorAbono('El concepto es obligatorio'); return
    }
    setSavingAbono(true); setErrorAbono('')

    const montoAbono = Number(formAbono.monto)

    // Obtener saldo actual desde DB para garantizar consistencia
    const { data: cuentaRow } = await dbCfg.from('cuentas_bancarias')
      .select('saldo').eq('id', cuenta.id).single()
    const saldoAntes   = (cuentaRow as any)?.saldo ?? 0
    const saldoDespues = saldoAntes + montoAbono

    const { error: err } = await dbComp.from('movimientos_bancarios').insert({
      id_cuenta_fk:     cuenta.id,
      tipo:             'Abono',
      monto:            montoAbono,
      saldo_antes:      saldoAntes,
      saldo_despues:    saldoDespues,
      concepto:         formAbono.concepto.trim(),
      referencia:       formAbono.referencia.trim() || null,
      fecha_movimiento: formAbono.fecha,
      created_by:       authUser?.nombre ?? null,
    })
    if (err) { setErrorAbono(err.message); setSavingAbono(false); return }

    await dbCfg.from('cuentas_bancarias').update({
      saldo:      saldoDespues,
      updated_at: new Date().toISOString(),
    }).eq('id', cuenta.id)

    setSavingAbono(false)
    setShowAbono(false)
    setFormAbono({ fecha: new Date().toISOString().slice(0, 10), monto: '', concepto: '', referencia: '' })
    fetchMovs()
  }

  const fetchMovs = useCallback(async () => {
    setLoading(true)
    // Refrescar saldo actual desde DB
    const { data: cb } = await dbCfg.from('cuentas_bancarias').select('saldo').eq('id', cuenta.id).single()
    if (cb) setSaldo((cb as any).saldo ?? 0)

    let q = dbComp.from('movimientos_bancarios')
      .select('*')
      .eq('id_cuenta_fk', cuenta.id)
      .order('fecha_movimiento', { ascending: false })
      .order('created_at', { ascending: false })
    if (filtroDe) q = q.gte('fecha_movimiento', filtroDe)
    if (filtroA)  q = q.lte('fecha_movimiento', filtroA)
    const { data } = await q
    setMovs(data ?? [])
    setLoading(false)
  }, [cuenta.id, filtroDe, filtroA])

  useEffect(() => { fetchMovs() }, [fetchMovs])

  const totalCargos = movs.filter(m => m.tipo === 'Cargo').reduce((a, m) => a + (m.monto ?? 0), 0)
  const totalAbonos = movs.filter(m => m.tipo === 'Abono').reduce((a, m) => a + (m.monto ?? 0), 0)

  return (
    <ModalShell modulo="residencial" titulo={cuenta.banco} onClose={onClose} maxWidth={780}
      footer={<>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{movs.length} movimiento{movs.length !== 1 ? 's' : ''}</span>
        <button className="btn-secondary" onClick={onClose}>Cerrar</button>
      </>}
    >

        {/* Saldo + stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #f1f5f9' }}>
          {[
            { label: 'Saldo Actual',   value: fmtMXN(saldoActual), color: '#0f766e', icon: TrendingUp },
            { label: 'Cargos período', value: fmtMXN(totalCargos), color: '#dc2626', icon: ArrowDownCircle },
            { label: 'Abonos período', value: fmtMXN(totalAbonos), color: '#15803d', icon: ArrowUpCircle },
          ].map((s, i) => {
            const SIcon = s.icon
            return (
              <div key={s.label} style={{ padding: '14px 20px', textAlign: 'center', borderRight: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2 }}>
                  <SIcon size={14} style={{ color: s.color }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              </div>
            )
          })}
        </div>

        {/* Filtros + botón Abono */}
        <div style={{ display: 'flex', gap: 10, padding: '12px 24px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Período:</span>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)}
            style={{ width: 140 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>a</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)}
            style={{ width: 140 }} />
          {(filtroDe || filtroA) && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setFiltroDe(''); setFiltroA('') }}>
              Limpiar
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ padding: '6px 10px' }} onClick={fetchMovs}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => { setShowAbono(s => !s); setErrorAbono('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: showAbono ? '#f0fdf4' : '#15803d', color: showAbono ? '#15803d' : '#fff',
                border: '1px solid #15803d', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
              <ArrowUpCircle size={13} />
              {showAbono ? 'Cancelar' : 'Registrar Abono'}
            </button>
          </div>
        </div>

        {/* Formulario de abono */}
        {showAbono && (
          <div style={{ padding: '16px 24px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowUpCircle size={13} /> Registrar Abono — Los cargos solo se generan desde una Orden de Pago
            </div>
            {errorAbono && (
              <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12, marginBottom: 10 }}>
                {errorAbono}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr 1fr', gap: 10, alignItems: 'end' }}>
              <div>
                <label className="label">Fecha *</label>
                <input className="input" type="date" value={formAbono.fecha} onChange={setFA('fecha')} />
              </div>
              <div>
                <label className="label">Monto *</label>
                <input className="input" type="number" step="0.01" min="0.01" placeholder="0.00"
                  value={formAbono.monto} onChange={setFA('monto')} style={{ textAlign: 'right' }} />
              </div>
              <div>
                <label className="label">Concepto *</label>
                <input className="input" placeholder="ej. Depósito inicial, Transferencia recibida…"
                  value={formAbono.concepto} onChange={setFA('concepto')} />
              </div>
              <div>
                <label className="label">Referencia</label>
                <input className="input" placeholder="No. de transferencia, cheque…" style={{ fontFamily: 'monospace' }}
                  value={formAbono.referencia} onChange={setFA('referencia')} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={handleAbono} disabled={savingAbono}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', fontSize: 13, fontWeight: 600,
                  background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, cursor: savingAbono ? 'not-allowed' : 'pointer', opacity: savingAbono ? 0.7 : 1 }}>
                {savingAbono ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                {savingAbono ? 'Guardando…' : 'Confirmar Abono'}
              </button>
            </div>
          </div>
        )}

        {/* Tabla de movimientos */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 320px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
            </div>
          ) : movs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
              Sin movimientos registrados{(filtroDe || filtroA) ? ' en el período seleccionado' : ''}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Referencia</th>
                  <th style={{ textAlign: 'center' }}>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th style={{ textAlign: 'right' }}>Saldo Anterior</th>
                  <th style={{ textAlign: 'right' }}>Saldo Posterior</th>
                  <th>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {movs.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(m.fecha_movimiento)}</td>
                    <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.concepto ?? '—'}</td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>{m.referencia ?? '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                        background: m.tipo === 'Cargo' ? '#fef2f2' : '#f0fdf4',
                        color:      m.tipo === 'Cargo' ? '#dc2626'  : '#15803d',
                        border:     `1px solid ${m.tipo === 'Cargo' ? '#fecaca' : '#bbf7d0'}`,
                      }}>{m.tipo}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: m.tipo === 'Cargo' ? '#dc2626' : '#15803d', fontSize: 13 }}>
                      {m.tipo === 'Cargo' ? '−' : '+'}{fmtMXN(m.monto ?? 0)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {m.saldo_antes != null ? fmtMXN(m.saldo_antes) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {m.saldo_despues != null ? fmtMXN(m.saldo_despues) : '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.created_by ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// CuadranteSecciones — asigna áreas y colaboradores a un cuadrante
// ══════════════════════════════════════════════════════════════
function CuadranteSecciones({ cuadrante, onClose }: { cuadrante: any; onClose: () => void }) {
  const [tab, setTab] = useState<'areas' | 'colaboradores'>('areas')

  // ── Áreas ──
  const [todasAreas,     setTodasAreas]     = useState<any[]>([])
  const [selAreas,       setSelAreas]       = useState<Set<number>>(new Set())
  const [inicialAreas,   setInicialAreas]   = useState<Set<number>>(new Set())
  const [busqAreas,      setBusqAreas]      = useState('')
  const [loadingAreas,   setLoadingAreas]   = useState(true)
  const [savingAreas,    setSavingAreas]    = useState(false)
  const [errorAreas,     setErrorAreas]     = useState('')

  // ── Colaboradores ──
  const [todasColabs,    setTodasColabs]    = useState<any[]>([])
  const [selColabs,      setSelColabs]      = useState<Set<number>>(new Set())
  const [inicialColabs,  setInicialColabs]  = useState<Set<number>>(new Set())
  const [busqColabs,     setBusqColabs]     = useState('')
  const [loadingColabs,  setLoadingColabs]  = useState(true)
  const [savingColabs,   setSavingColabs]   = useState(false)
  const [errorColabs,    setErrorColabs]    = useState('')

  useEffect(() => {
    setLoadingAreas(true)
    dbCfg.from('areas').select('id, nombre, id_cuadrante_fk').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setTodasAreas(data ?? [])
        const asignadas = new Set<number>(
          (data ?? []).filter((a: any) => a.id_cuadrante_fk === cuadrante.id).map((a: any) => Number(a.id))
        )
        setSelAreas(new Set(asignadas)); setInicialAreas(new Set(asignadas))
        setLoadingAreas(false)
      })
  }, [cuadrante.id])

  useEffect(() => {
    setLoadingColabs(true)
    dbCfg.from('colaboradores').select('id, nombre, apellido_paterno, apellido_materno, puesto, id_cuadrante_fk').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setTodasColabs(data ?? [])
        const asignados = new Set<number>(
          (data ?? []).filter((c: any) => c.id_cuadrante_fk === cuadrante.id).map((c: any) => Number(c.id))
        )
        setSelColabs(new Set(asignados)); setInicialColabs(new Set(asignados))
        setLoadingColabs(false)
      })
  }, [cuadrante.id])

  const toggleArea  = (id: number) => setSelAreas(prev  => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleColab = (id: number) => setSelColabs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const saveAreas = async () => {
    setSavingAreas(true); setErrorAreas('')
    const added   = Array.from(selAreas).filter(id => !inicialAreas.has(id))
    const removed = Array.from(inicialAreas).filter(id => !selAreas.has(id))
    if (added.length === 0 && removed.length === 0) { setSavingAreas(false); return }
    if (added.length > 0) {
      const { error: e } = await dbCfg.from('areas').update({ id_cuadrante_fk: cuadrante.id }).in('id', added)
      if (e) { setErrorAreas(e.message); setSavingAreas(false); return }
    }
    if (removed.length > 0) {
      const { error: e } = await dbCfg.from('areas').update({ id_cuadrante_fk: null }).in('id', removed)
      if (e) { setErrorAreas(e.message); setSavingAreas(false); return }
    }
    setInicialAreas(new Set(selAreas)); setSavingAreas(false)
  }

  const saveColabs = async () => {
    setSavingColabs(true); setErrorColabs('')
    const added   = Array.from(selColabs).filter(id => !inicialColabs.has(id))
    const removed = Array.from(inicialColabs).filter(id => !selColabs.has(id))
    if (added.length === 0 && removed.length === 0) { setSavingColabs(false); return }
    if (added.length > 0) {
      const { error: e } = await dbCfg.from('colaboradores').update({ id_cuadrante_fk: cuadrante.id, updated_at: new Date().toISOString() }).in('id', added)
      if (e) { setErrorColabs(e.message); setSavingColabs(false); return }
    }
    if (removed.length > 0) {
      const { error: e } = await dbCfg.from('colaboradores').update({ id_cuadrante_fk: null, updated_at: new Date().toISOString() }).in('id', removed)
      if (e) { setErrorColabs(e.message); setSavingColabs(false); return }
    }
    setInicialColabs(new Set(selColabs)); setSavingColabs(false)
  }

  const filtAreas  = todasAreas.filter(a => a.nombre.toLowerCase().includes(busqAreas.toLowerCase()))
  const filtColabs = todasColabs.filter(c =>
    nombreCompletoColaborador(c).toLowerCase().includes(busqColabs.toLowerCase())
  )

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? '#1d4ed8' : 'var(--text-muted)',
    borderBottom: `2px solid ${active ? '#2563eb' : 'transparent'}`,
    background: 'none', border: 'none', borderBottomWidth: 2,
    borderBottomStyle: 'solid', borderBottomColor: active ? '#2563eb' : 'transparent',
    cursor: 'pointer', transition: 'all 0.15s',
  })

  return (
    <ModalShell modulo="mantenimiento" titulo={cuadrante.nombre} onClose={onClose} maxWidth={520}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', paddingLeft: 8 }}>
        <button style={tabStyle(tab === 'areas')} onClick={() => setTab('areas')}>
          Áreas {selAreas.size > 0 && <span style={{ marginLeft: 4, fontSize: 11, background: '#dbeafe', color: '#1d4ed8', borderRadius: 10, padding: '1px 6px' }}>{selAreas.size}</span>}
        </button>
        <button style={tabStyle(tab === 'colaboradores')} onClick={() => setTab('colaboradores')}>
          Colaboradores {selColabs.size > 0 && <span style={{ marginLeft: 4, fontSize: 11, background: '#ede9fe', color: '#7c3aed', borderRadius: 10, padding: '1px 6px' }}>{selColabs.size}</span>}
        </button>
      </div>

      {/* Tab Áreas */}
      {tab === 'areas' && (
        <>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <input className="input" placeholder="Buscar área…" value={busqAreas}
              onChange={e => setBusqAreas(e.target.value)} style={{ fontSize: 13 }} />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 240px)', padding: '8px 0' }}>
            {loadingAreas ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </div>
            ) : filtAreas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Sin áreas</div>
            ) : filtAreas.map(a => {
              const checked = selAreas.has(a.id)
              return (
                <label key={a.id} onClick={() => toggleArea(a.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                    cursor: 'pointer', background: checked ? '#eff6ff' : 'transparent',
                    borderLeft: `3px solid ${checked ? '#2563eb' : 'transparent'}`, transition: 'background 0.15s' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleArea(a.id)}
                    style={{ accentColor: 'var(--blue)', width: 15, height: 15 }} />
                  <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: checked ? '#1d4ed8' : '#1e293b' }}>
                    {a.nombre}
                  </span>
                  {checked && <CheckCircle size={14} style={{ color: '#2563eb', marginLeft: 'auto', flexShrink: 0 }} />}
                </label>
              )
            })}
          </div>
          {errorAreas && (
            <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{errorAreas}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {selAreas.size} área{selAreas.size !== 1 ? 's' : ''} asignada{selAreas.size !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cerrar</button>
              <button className="btn-primary" style={{ fontSize: 12 }} onClick={saveAreas} disabled={savingAreas}>
                {savingAreas ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
              </button>
            </div>
          </div>
        </>
      )}

      {/* Tab Colaboradores */}
      {tab === 'colaboradores' && (
        <>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0' }}>
            <input className="input" placeholder="Buscar colaborador…" value={busqColabs}
              onChange={e => setBusqColabs(e.target.value)} style={{ fontSize: 13 }} />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 240px)', padding: '8px 0' }}>
            {loadingColabs ? (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </div>
            ) : filtColabs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Sin colaboradores</div>
            ) : filtColabs.map(c => {
              const checked = selColabs.has(c.id)
              return (
                <label key={c.id} onClick={() => toggleColab(c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                    cursor: 'pointer', background: checked ? '#f5f3ff' : 'transparent',
                    borderLeft: `3px solid ${checked ? '#7c3aed' : 'transparent'}`, transition: 'background 0.15s' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleColab(c.id)}
                    style={{ accentColor: '#7c3aed', width: 15, height: 15 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: checked ? '#6d28d9' : '#1e293b' }}>
                      {nombreCompletoColaborador(c)}
                    </div>
                    {c.puesto && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.puesto}</div>}
                  </div>
                  {checked && <CheckCircle size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />}
                </label>
              )
            })}
          </div>
          {errorColabs && (
            <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{errorColabs}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {selColabs.size} colaborador{selColabs.size !== 1 ? 'es' : ''} asignado{selColabs.size !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cerrar</button>
              <button className="btn-primary" style={{ fontSize: 12 }} onClick={saveColabs} disabled={savingColabs}>
                {savingColabs ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Guardar
              </button>
            </div>
          </div>
        </>
      )}
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// AreaAreasComunes — N:M vía cfg.rel_area_area_comun
// ══════════════════════════════════════════════════════════════
function AreaAreasComunes({ area, onClose }: { area: any; onClose: () => void }) {
  const [todas,     setTodas]     = useState<any[]>([])
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [inicial,   setInicial]   = useState<Set<number>>(new Set())
  const [busqueda,  setBusqueda]  = useState('')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')
  const [nueva,     setNueva]     = useState('')
  const [creando,   setCreando]   = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: acs }, { data: rels }] = await Promise.all([
      dbCfg.from('areas_comunes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('rel_area_area_comun').select('id_area_comun').eq('id_area', area.id),
    ])
    setTodas(acs ?? [])
    const asignadas = new Set<number>((rels ?? []).map((r: any) => Number(r.id_area_comun)))
    setSeleccion(new Set(asignadas))
    setInicial(new Set(asignadas))
    setLoading(false)
  }, [area.id])

  useEffect(() => { fetchData() }, [fetchData])

  const toggle = (id: number) =>
    setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const crearYAsignar = async () => {
    if (!nueva.trim()) return
    setCreando(true)
    const { data, error: e } = await dbCfg
      .from('areas_comunes')
      .insert({ nombre: nueva.trim(), activo: true })
      .select('id').single()
    if (e) { setError(e.message); setCreando(false); return }
    if (data) {
      await dbCfg.from('rel_area_area_comun')
        .insert({ id_area: area.id, id_area_comun: data.id })
    }
    setNueva(''); setCreando(false); fetchData()
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    const added   = Array.from(seleccion).filter(id => !inicial.has(id))
    const removed = Array.from(inicial).filter(id => !seleccion.has(id))
    if (added.length === 0 && removed.length === 0) { onClose(); return }
    if (added.length > 0) {
      const { error: e } = await dbCfg.from('rel_area_area_comun')
        .insert(added.map(id => ({ id_area: area.id, id_area_comun: id })))
      if (e) { setError(e.message); setSaving(false); return }
    }
    if (removed.length > 0) {
      const { error: e } = await dbCfg.from('rel_area_area_comun')
        .delete().eq('id_area', area.id).in('id_area_comun', removed)
      if (e) { setError(e.message); setSaving(false); return }
    }
    setSaving(false); onClose()
  }

  const filtradas = todas.filter(a => a.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <ModalShell modulo="mantenimiento" titulo={`Áreas Comunes — ${area.nombre}`} onClose={onClose} maxWidth={480}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8 }}>
        <input className="input" placeholder="Nueva área común…" value={nueva}
          onChange={e => setNueva(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && crearYAsignar()}
          style={{ fontSize: 13, flex: 1 }} />
        <button className="btn-primary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          onClick={crearYAsignar} disabled={creando || !nueva.trim()}>
          {creando ? <Loader size={11} className="animate-spin" /> : <Plus size={11} />}
          Crear
        </button>
      </div>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <input className="input" placeholder="Buscar área común existente…" value={busqueda}
          onChange={e => setBusqueda(e.target.value)} style={{ fontSize: 13 }} />
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 260px)', padding: '8px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
            Sin áreas comunes
          </div>
        ) : filtradas.map(a => {
          const checked = seleccion.has(a.id)
          return (
            <label key={a.id} onClick={() => toggle(a.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                cursor: 'pointer', background: checked ? '#f0fdf4' : 'transparent',
                borderLeft: `3px solid ${checked ? '#16a34a' : 'transparent'}`,
                transition: 'background 0.15s' }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(a.id)}
                style={{ accentColor: '#16a34a', width: 15, height: 15 }} />
              <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400,
                color: checked ? '#15803d' : '#1e293b', flex: 1 }}>
                {a.nombre}
              </span>
              {checked && <CheckCircle size={14} style={{ color: '#16a34a', flexShrink: 0 }} />}
            </label>
          )
        })}
      </div>
      {error && (
        <div style={{ margin: '0 16px 8px', padding: '8px 12px', background: '#fef2f2',
          border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {seleccion.size} área{seleccion.size !== 1 ? 's' : ''} asignada{seleccion.size !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
            Guardar
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Administración Interna del Condominio — por periodo, por sección
// ══════════════════════════════════════════════════════════════
const ADMIN_FORM_VACIO = {
  nombre_administrador: '',
  telefono:              '',
  correo:                '',
  periodo_inicio:        '',
  periodo_fin:           '',
  notas:                 '',
}

function SeccionAdministracion({ seccion, onClose }: { seccion: any; onClose: () => void }) {
  const [periodos, setPeriodos] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [editId,   setEditId]   = useState<number | null>(null)
  const [form,     setForm]     = useState(ADMIN_FORM_VACIO)

  const hoy = new Date().toISOString().slice(0, 10)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCfg.from('seccion_administracion')
      .select('*').eq('id_seccion_fk', seccion.id).order('periodo_inicio', { ascending: false })
    setPeriodos(data ?? [])
    setLoading(false)
  }, [seccion.id])

  useEffect(() => { fetchData() }, [fetchData])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const editar = (p: any) => {
    setEditId(p.id)
    setForm({
      nombre_administrador: p.nombre_administrador ?? '',
      telefono:              p.telefono ?? '',
      correo:                p.correo ?? '',
      periodo_inicio:        p.periodo_inicio ?? '',
      periodo_fin:           p.periodo_fin ?? '',
      notas:                 p.notas ?? '',
    })
    setError('')
  }

  const cancelarEdicion = () => { setEditId(null); setForm(ADMIN_FORM_VACIO); setError('') }

  const guardar = async () => {
    if (!form.nombre_administrador.trim() || !form.periodo_inicio) {
      setError('Nombre del Administrador y Fecha de Inicio son obligatorios.')
      return
    }
    if (form.periodo_fin && form.periodo_fin < form.periodo_inicio) {
      setError('La fecha de fin no puede ser anterior a la fecha de inicio.')
      return
    }
    setSaving(true); setError('')
    const payload = {
      id_seccion_fk:        seccion.id,
      nombre_administrador: form.nombre_administrador.trim(),
      telefono:              form.telefono.trim() || null,
      correo:                form.correo.trim() || null,
      periodo_inicio:        form.periodo_inicio,
      periodo_fin:           form.periodo_fin || null,
      notas:                 form.notas.trim() || null,
    }
    const { error: e } = editId
      ? await dbCfg.from('seccion_administracion').update(payload).eq('id', editId)
      : await dbCfg.from('seccion_administracion').insert(payload)
    setSaving(false)
    if (e) { setError(e.message); return }
    cancelarEdicion()
    fetchData()
  }

  const eliminar = async (id: number) => {
    if (!confirm('¿Eliminar este periodo de administración?')) return
    await dbCfg.from('seccion_administracion').delete().eq('id', id)
    fetchData()
  }

  const esVigente = (p: any) => p.periodo_inicio <= hoy && (!p.periodo_fin || p.periodo_fin >= hoy)

  return (
    <ModalShell modulo="residencial" titulo={`Administración Interna — ${seccion.nombre}`} onClose={onClose} maxWidth={620}
      footer={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}
    >
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', marginBottom: 10 }}>
          {editId ? 'Editar periodo' : 'Nuevo periodo de administración'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div><label className="label">Nombre del Administrador *</label>
            <input className="input" value={form.nombre_administrador} onChange={set('nombre_administrador')} placeholder="Nombre completo" />
          </div>
          <div><label className="label">Teléfono</label>
            <input className="input" value={form.telefono} onChange={set('telefono')} />
          </div>
          <div><label className="label">Correo</label>
            <input className="input" type="email" value={form.correo} onChange={set('correo')} />
          </div>
          <div />
          <div><label className="label">Periodo — Inicio *</label>
            <input className="input" type="date" value={form.periodo_inicio} onChange={set('periodo_inicio')} />
          </div>
          <div><label className="label">Periodo — Fin</label>
            <input className="input" type="date" value={form.periodo_fin} onChange={set('periodo_fin')} placeholder="Dejar vacío si sigue vigente" />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} />
        </div>
        {error && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, color: '#dc2626', fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {editId && <button className="btn-secondary" style={{ fontSize: 12 }} onClick={cancelarEdicion}>Cancelar</button>}
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={guardar} disabled={saving}>
            {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
            {editId ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Historial de administraciones</div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : periodos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
          Sin periodos registrados
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {periodos.map(p => {
            const vigente = esVigente(p)
            return (
              <div key={p.id} style={{
                padding: 12, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                background: vigente ? '#f0fdf4' : '#fff', border: `1px solid ${vigente ? '#bbf7d0' : '#e2e8f0'}`,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{p.nombre_administrador}</span>
                    {vigente && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#dcfce7', color: '#15803d' }}>
                        Vigente
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {p.periodo_inicio} → {p.periodo_fin ?? 'actual'}
                  </div>
                  {(p.telefono || p.correo) && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {[p.telefono, p.correo].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {p.notas && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{p.notas}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => editar(p)}>
                    <Edit2 size={13} />
                  </button>
                  <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }} onClick={() => eliminar(p.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Detalle de Sección — lotes asignados y asignación masiva
// ══════════════════════════════════════════════════════════════
function SeccionLotesDetail({ seccion, onClose }: { seccion: any; onClose: () => void }) {
  const [lotesAsignados, setLotesAsignados] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [showAsignar, setShowAsignar] = useState(false)
  const [lotesDisp, setLotesDisp]    = useState<any[]>([])
  const [loadingDisp, setLoadingDisp] = useState(false)
  const [search, setSearch]          = useState('')
  const [soloSinSeccion, setSoloSin] = useState(true)
  const [asignando, setAsignando]    = useState<number | null>(null)
  const [quitando,  setQuitando]     = useState<number | null>(null)
  const [clasifs,   setClasifs]      = useState<Record<number, string>>({})
  const [seccionesMap, setSeccionesMap] = useState<Record<number, string>>({})

  const limite = seccion.cantidad_lotes ?? null

  const fetchAsignados = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCat
      .from('lotes')
      .select('id, cve_lote, lote, id_clasificacion_fk, status_lote, calle, numero')
      .eq('id_seccion_fk', seccion.id)
      .order('lote')
    setLotesAsignados(data ?? [])
    setLoading(false)
  }, [seccion.id])

  const fetchDisponibles = useCallback(async () => {
    setLoadingDisp(true)
    let q = dbCat
      .from('lotes')
      .select('id, cve_lote, lote, id_clasificacion_fk, status_lote, id_seccion_fk')
      .neq('id_seccion_fk', seccion.id)
      .order('lote')
    if (soloSinSeccion) q = (q as any).is('id_seccion_fk', null)
    const { data } = await q
    setLotesDisp(data ?? [])
    setLoadingDisp(false)
  }, [seccion.id, soloSinSeccion])

  useEffect(() => {
    fetchAsignados()
    dbCfg.from('clasificacion').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}
      ;(data ?? []).forEach((c: any) => { m[c.id] = c.nombre })
      setClasifs(m)
    })
    dbCfg.from('secciones').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}
      ;(data ?? []).forEach((s: any) => { m[s.id] = s.nombre })
      setSeccionesMap(m)
    })
  }, [fetchAsignados])

  useEffect(() => {
    if (showAsignar) fetchDisponibles()
  }, [showAsignar, fetchDisponibles])

  const asignar = async (loteId: number) => {
    setAsignando(loteId)
    await dbCat.from('lotes').update({ id_seccion_fk: seccion.id }).eq('id', loteId)
    setAsignando(null)
    fetchAsignados()
    fetchDisponibles()
  }

  const quitar = async (loteId: number) => {
    if (!confirm('¿Quitar este lote de la sección? Quedará sin sección asignada.')) return
    setQuitando(loteId)
    await dbCat.from('lotes').update({ id_seccion_fk: null }).eq('id', loteId)
    setQuitando(null)
    fetchAsignados()
  }

  const actual      = lotesAsignados.length
  const disponibles = limite !== null ? limite - actual : null
  const pct         = limite ? Math.min(100, Math.round((actual / limite) * 100)) : 0
  const llena       = limite !== null && actual >= limite

  const filteredDisp = search
    ? lotesDisp.filter(l =>
        (l.cve_lote ?? '').toLowerCase().includes(search.toLowerCase()) ||
        String(l.lote ?? '').includes(search)
      )
    : lotesDisp

  const statusBadge = (s: string | null) => {
    const map: Record<string, { bg: string; color: string }> = {
      Libre:     { bg: '#dbeafe', color: '#1d4ed8' },
      Vendido:   { bg: '#dcfce7', color: '#15803d' },
      Bloqueado: { bg: '#fef3c7', color: '#b45309' },
    }
    const style = map[s ?? ''] ?? { bg: '#f1f5f9', color: '#64748b' }
    return (
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, ...style }}>
        {s ?? '—'}
      </span>
    )
  }

  return (
    <ModalShell
      modulo="residencial"
      titulo={`Sección: ${seccion.nombre}`}
      onClose={onClose}
      maxWidth={820}
      footer={
        <>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {actual} lote{actual !== 1 ? 's' : ''} asignado{actual !== 1 ? 's' : ''}
            {limite ? ` de ${limite}` : ''}
          </span>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </>
      }
    >
      {/* Barra de capacidad */}
      {limite !== null && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          background: llena ? '#fef2f2' : pct >= 80 ? '#fffbeb' : '#f0fdf4',
          border: `1px solid ${llena ? '#fecaca' : pct >= 80 ? '#fde68a' : '#bbf7d0'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: llena ? '#dc2626' : pct >= 80 ? '#b45309' : '#15803d' }}>
              {llena ? 'Sección llena' : pct >= 80 ? 'Capacidad casi agotada' : 'Capacidad'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: llena ? '#dc2626' : '#475569' }}>
              {actual} / {limite} lotes
              {disponibles !== null && disponibles > 0 && ` · ${disponibles} disponible${disponibles !== 1 ? 's' : ''}`}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 6, background: '#e2e8f0' }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 6, transition: 'width 0.3s',
              background: llena ? '#dc2626' : pct >= 80 ? '#f59e0b' : '#22c55e',
            }} />
          </div>
        </div>
      )}

      {/* Cabecera panel con botón asignar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Lotes asignados a esta sección
        </span>
        {!llena && (
          <button className={showAsignar ? 'btn-secondary' : 'btn-primary'} onClick={() => setShowAsignar(s => !s)}>
            {showAsignar ? <X size={13} /> : <Plus size={13} />}
            {showAsignar ? 'Cerrar búsqueda' : 'Asignar Lotes'}
          </button>
        )}
      </div>

      {/* Panel de búsqueda y asignación */}
      {showAsignar && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', marginBottom: 10 }}>
            Buscar lotes para asignar a «{seccion.nombre}»
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 200px' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input" style={{ paddingLeft: 28 }}
                placeholder="Buscar por clave o número…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={soloSinSeccion} onChange={e => setSoloSin(e.target.checked)} />
              Solo lotes sin sección
            </label>
            <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={fetchDisponibles} title="Actualizar">
              <RefreshCw size={12} className={loadingDisp ? 'animate-spin' : ''} />
            </button>
          </div>

          {loadingDisp ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <RefreshCw size={14} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
            </div>
          ) : filteredDisp.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
              {soloSinSeccion ? 'No hay lotes sin sección disponibles' : 'No se encontraron lotes'}
            </div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff' }}>
              <table>
                <thead>
                  <tr>
                    <th>Clave</th>
                    <th style={{ width: 70 }}>No.</th>
                    <th>Sección actual</th>
                    <th>Status</th>
                    <th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDisp.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold-light)' }}>
                        {l.cve_lote ?? `#${l.lote}`}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.lote ?? '—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: l.id_seccion_fk ? 'normal' : 'italic' }}>
                        {l.id_seccion_fk ? (seccionesMap[l.id_seccion_fk] ?? '—') : 'Sin sección'}
                      </td>
                      <td>{statusBadge(l.status_lote)}</td>
                      <td>
                        <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}
                          disabled={asignando === l.id}
                          onClick={() => asignar(l.id)}>
                          {asignando === l.id ? <Loader size={11} className="animate-spin" /> : 'Asignar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabla de lotes ya asignados */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : lotesAsignados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
          Esta sección no tiene lotes asignados aún
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Clave</th>
                <th style={{ width: 70 }}>No.</th>
                <th>Clasificación</th>
                <th>Dirección</th>
                <th>Status</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {lotesAsignados.map(l => {
                const dir = [l.calle, l.numero].filter(Boolean).join(' ') || '—'
                return (
                  <tr key={l.id}>
                    <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold-light)' }}>
                      {l.cve_lote ?? `#${l.lote}`}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.lote ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {l.id_clasificacion_fk ? (clasifs[l.id_clasificacion_fk] ?? '—') : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{dir}</td>
                    <td>{statusBadge(l.status_lote)}</td>
                    <td>
                      <button className="btn-ghost"
                        style={{ padding: '4px 6px', color: '#dc2626' }}
                        disabled={quitando === l.id}
                        onClick={() => quitar(l.id)}
                        title="Quitar de esta sección">
                        {quitando === l.id ? <Loader size={11} className="animate-spin" /> : <X size={13} />}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Modal genérico extendido
// ══════════════════════════════════════════════════════════════
function CatalogoModal({ config, row, onClose, onSaved }:
  { config: CatConfig; row: any | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !row
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [uploading, setUploading] = useState(false)
  // Opciones para selects
  const [selectOpts, setSelectOpts] = useState<Record<string, {id: number; nombre: string}[]>>({})

  const initForm = () => {
    const f: Record<string, string> = { activo: row?.activo !== false ? 'true' : 'false' }
    config.campos.forEach(c => { f[c.key] = row?.[c.key]?.toString() ?? '' })
    return f
  }
  const [form, setForm] = useState<Record<string, string>>(initForm)

  // Refs para inputs file
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    // Cargar opciones de todos los campos select
    config.campos.filter(c => c.type === 'select' && c.selectTabla).forEach(async c => {
      const sdb = c.selectSchema === 'comp' ? dbComp : c.selectSchema === 'golf' ? dbGolf : dbCfg
      let q = sdb.from(c.selectTabla!).select('id, nombre').eq('activo', true)
      if (c.selectFilter) q = q.match(c.selectFilter)
      const { data } = await q.order('nombre')
      setSelectOpts(prev => ({ ...prev, [c.key]: data ?? [] }))
    })
  }, [])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const uploadFile = async (file: File, campo: Campo) => {
    if (!campo.bucket) return
    setUploading(true)
    const ext  = file.name.split('.').pop()?.toLowerCase()
    const path = `${config.tabla}/${row?.id ?? 'new'}-${campo.key}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from(campo.bucket).upload(path, file, { upsert: true })
    if (upErr) { alert('Error al subir: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from(campo.bucket).getPublicUrl(path)
    setForm(f => ({ ...f, [campo.key]: publicUrl }))
    setUploading(false)
  }

  const handleSave = async () => {
    const req = config.campos.find(c => c.required && !form[c.key]?.trim())
    if (req) { setError(`El campo "${req.label.replace(' *','')}" es obligatorio`); return }
    setSaving(true); setError('')

    const payload: Record<string, any> = { activo: form.activo === 'true' }
    config.campos.forEach(c => {
      if (c.type === 'number')        payload[c.key] = form[c.key] ? Number(form[c.key]) : null
      else if (c.type === 'select' && c.staticOptions) payload[c.key] = form[c.key] || null
      else if (c.type === 'select')   payload[c.key] = form[c.key] ? Number(form[c.key]) : null
      else if (c.type === 'file')     payload[c.key] = form[c.key]?.trim() || null
      else payload[c.key] = form[c.key]?.trim() || null
    })

    const db = config.schema === 'comp' ? dbComp : config.schema === 'golf' ? dbGolf : dbCfg
    const { error: err } = isNew
      ? await db.from(config.tabla).insert(payload)
      : await db.from(config.tabla).update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const Icon = config.icon

  return (
    <ModalShell modulo="residencial" titulo={isNew ? `Nuevo — ${config.label}` : `Editar — ${row?.[config.sortBy ?? 'nombre'] ?? config.label}`} onClose={onClose} maxWidth={520}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || uploading}>
        {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
        {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </>}
    >

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: 'calc(88vh - 130px)' }}>
          {error && (
            <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>
              {error}
            </div>
          )}

          {config.campos.map(c => (
            <div key={c.key}>
              <label className="label">{c.label}</label>

              {c.type === 'textarea' && (
                <textarea className="input" rows={2} value={form[c.key] ?? ''} onChange={set(c.key)} style={{ resize: 'vertical' }} />
              )}

              {c.type === 'text' && (
                <input className="input" type="text" value={form[c.key] ?? ''} onChange={set(c.key)} />
              )}

              {c.type === 'number' && (
                <input className="input" type="number" step="1" value={form[c.key] ?? ''} onChange={set(c.key)} />
              )}

              {c.type === 'date' && (
                <input className="input" type="date" value={form[c.key] ?? ''} onChange={set(c.key)} />
              )}

              {c.type === 'select' && (
                <select className="select" value={form[c.key] ?? ''} onChange={set(c.key)}>
                  <option value="">— Seleccionar —</option>
                  {c.staticOptions
                    ? c.staticOptions.map(o => <option key={o} value={o}>{o}</option>)
                    : (selectOpts[c.key] ?? []).map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)
                  }
                </select>
              )}

              {c.type === 'file' && (
                <div>
                  <input
                    ref={el => { fileRefs.current[c.key] = el }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], c) }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {form[c.key] ? (
                      <>
                        <a href={form[c.key]} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, textDecoration: 'none' }}>
                          <ExternalLink size={12} /> Ver archivo
                        </a>
                        <button style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca',
                          borderRadius: 6, padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setForm(f => ({ ...f, [c.key]: '' }))}>
                          <Trash2 size={12} /> Quitar
                        </button>
                        <button className="btn-secondary" style={{ fontSize: 12 }}
                          onClick={() => fileRefs.current[c.key]?.click()}>
                          <Upload size={12} /> Reemplazar
                        </button>
                      </>
                    ) : (
                      <button className="btn-secondary" style={{ fontSize: 12 }}
                        onClick={() => fileRefs.current[c.key]?.click()}
                        disabled={uploading}>
                        {uploading ? <><Loader size={12} className="animate-spin" /> Subiendo…</> : <><Upload size={12} /> Adjuntar PDF / JPG</>}
                      </button>
                    )}
                  </div>
                  {form[c.key] && (
                    <div style={{ fontSize: 11, color: '#15803d', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={11} /> Archivo cargado
                    </div>
                  )}
                </div>
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

    </ModalShell>
  )
}

// ══════════════════════════════════════════════════════════════
// Editor de relación N:M Áreas ↔ Frentes
// ══════════════════════════════════════════════════════════════
// modo 'frente' → muestra una fila = un área, para el frente seleccionado
// modo 'area'   → muestra una fila = un frente, para el área seleccionada
// Guarda calculando delta (added / removed) contra cfg.rel_area_frente
// ══════════════════════════════════════════════════════════════
function RelAreaFrenteDetail({ modo, fila, onClose }:
  { modo: 'area' | 'frente'; fila: any; onClose: () => void }) {

  const [catalogo, setCatalogo] = useState<{ id: number; nombre: string; id_centro_costo_fk?: number }[]>([])
  const [centros, setCentros]   = useState<Record<number, string>>({})
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [inicial, setInicial]     = useState<Set<number>>(new Set())
  const [busqueda, setBusqueda]   = useState('')
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')

    if (modo === 'frente') {
      // Listado: todas las áreas activas (con su CC)
      const [{ data: areas }, { data: ccRows }, { data: rels }] = await Promise.all([
        dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
        dbCfg.from('centros_costo').select('id, nombre'),
        dbCfg.from('rel_area_frente').select('id_area').eq('id_frente', fila.id),
      ])
      const ccMap: Record<number, string> = {}
      ;(ccRows ?? []).forEach((c: any) => { ccMap[c.id] = c.nombre })
      setCentros(ccMap)
      setCatalogo(areas ?? [])
      const ids = new Set<number>((rels ?? []).map((r: any) => Number(r.id_area)))
      setSeleccion(new Set(ids))
      setInicial(new Set(ids))
    } else {
      // Listado: todos los frentes activos
      const [{ data: frentes }, { data: rels }] = await Promise.all([
        dbCfg.from('frentes').select('id, nombre').eq('activo', true).order('nombre'),
        dbCfg.from('rel_area_frente').select('id_frente').eq('id_area', fila.id),
      ])
      setCatalogo(frentes ?? [])
      const ids = new Set<number>((rels ?? []).map((r: any) => Number(r.id_frente)))
      setSeleccion(new Set(ids))
      setInicial(new Set(ids))
    }
    setLoading(false)
  }, [modo, fila.id])

  useEffect(() => { fetchData() }, [fetchData])

  const toggle = (id: number) => {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const seleccionarTodos = () => setSeleccion(new Set(catalogo.map(c => c.id)))
  const limpiarTodo      = () => setSeleccion(new Set())

  const handleSave = async () => {
    setSaving(true); setError('')

    const added   = Array.from(seleccion).filter(id => !inicial.has(id))
    const removed = Array.from(inicial).filter(id => !seleccion.has(id))

    if (added.length === 0 && removed.length === 0) {
      setSaving(false); onClose(); return
    }

    // Eliminar las quitadas (en batch)
    if (removed.length > 0) {
      const col = modo === 'frente' ? 'id_area' : 'id_frente'
      const fijo = modo === 'frente' ? 'id_frente' : 'id_area'
      const { error: errDel } = await dbCfg.from('rel_area_frente')
        .delete().eq(fijo, fila.id).in(col, removed)
      if (errDel) { setError('Error al eliminar: ' + errDel.message); setSaving(false); return }
    }

    // Insertar las nuevas (en batch)
    if (added.length > 0) {
      const payload = added.map(id => modo === 'frente'
        ? { id_area: id, id_frente: fila.id }
        : { id_area: fila.id, id_frente: id }
      )
      const { error: errIns } = await dbCfg.from('rel_area_frente').insert(payload)
      if (errIns) { setError('Error al insertar: ' + errIns.message); setSaving(false); return }
    }

    setSaving(false)
    onClose()
  }

  const dirty = Array.from(seleccion).some(id => !inicial.has(id)) || Array.from(inicial).some(id => !seleccion.has(id))

  const filtrados = catalogo.filter(c =>
    !busqueda.trim() || c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())
  )

  const titulo = modo === 'frente'
    ? `Áreas del frente · ${fila.nombre}`
    : `Frentes del área · ${fila.nombre}`

  const subtitulo = modo === 'frente'
    ? 'Selecciona las áreas en las que este frente estará disponible.'
    : 'Selecciona los frentes disponibles para esta área.'

  return (
    <ModalShell modulo="residencial" titulo={titulo} onClose={onClose} maxWidth={640}
      footer={<>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
          {seleccion.size} de {catalogo.length} seleccionad{modo === 'frente' ? 'as' : 'os'}
          {dirty && <span style={{ color: '#d97706', marginLeft: 8, fontWeight: 600 }}>· cambios sin guardar</span>}
        </span>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </>}
    >
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, marginBottom: 10 }}>{subtitulo}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input"
            placeholder={modo === 'frente' ? 'Buscar área…' : 'Buscar frente…'}
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={seleccionarTodos} disabled={saving}>
            Seleccionar todos
          </button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={limpiarTodo} disabled={saving}>
            Limpiar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 20px', background: '#fef2f2', color: '#dc2626', fontSize: 12, borderBottom: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      <div style={{ maxHeight: 'calc(82vh - 220px)', overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            {busqueda ? 'No hay coincidencias' : 'No hay registros en el catálogo'}
          </div>
        ) : (
          <div>
            {filtrados.map(item => {
              const checked = seleccion.has(item.id)
              const ccNombre = modo === 'frente' && item.id_centro_costo_fk
                ? centros[item.id_centro_costo_fk]
                : null
              return (
                <label key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px',
                    borderBottom: '1px solid #f8fafc', cursor: 'pointer',
                    background: checked ? '#eff6ff' : '#fff',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#f8fafc' }}
                  onMouseLeave={e => { if (!checked) e.currentTarget.style.background = '#fff' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item.id)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563eb' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: checked ? 600 : 500, color: checked ? '#1d4ed8' : '#1e293b' }}>
                      {item.nombre}
                    </div>
                    {ccNombre && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        CC: {ccNombre}
                      </div>
                    )}
                  </div>
                  {checked && <CheckCircle size={14} style={{ color: '#2563eb', flexShrink: 0 }} />}
                </label>
              )
            })}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
