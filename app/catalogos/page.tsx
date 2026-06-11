'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCfg, dbComp, dbGolf, dbCat, supabase } from '@/lib/supabase'
import {
  BookOpen, Plus, Edit2, Trash2, X, Save,
  Loader, RefreshCw, ToggleLeft, ToggleRight,
  MapPin, Tag, Grid3x3, DollarSign, CreditCard,
  Car, CheckCircle, Upload, ExternalLink, Layers, AlertTriangle, Building2,
  Eye, ArrowUpCircle, ArrowDownCircle, TrendingUp, Store, Flag, HardHat, Search,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import ModalShell from '@/components/ui/ModalShell'

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
  sortBy?:      string
  hasDetail?:   boolean
  sectionLabel?: string  // renders a group header above this item in the sidebar
}

type Campo = {
  key:       string
  label:     string
  type:      'text' | 'number' | 'textarea' | 'date' | 'select' | 'file'
  required?: boolean
  selectTabla?:   string
  selectSchema?:  'cfg' | 'comp' | 'golf'
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
      { key: 'empresa',             label: 'Empresa',              type: 'text' },
      { key: 'nombre',              label: 'Nombre *',             type: 'text',   required: true },
      { key: 'descripcion',         label: 'Descripción',          type: 'textarea' },
      { key: 'id_tipo_seccion_fk',  label: 'Tipo de Sección',      type: 'select', selectTabla: 'tipo_secciones' },
      { key: 'id_cuadrante_fk',     label: 'Cuadrante',            type: 'select', selectTabla: 'cuadrantes' },
      { key: 'fecha_autorizacion',  label: 'Fecha de Autorización',type: 'date' },
      { key: 'cantidad_lotes',      label: 'Cantidad de Lotes',    type: 'number' },
      { key: 'expediente_url',      label: 'Expediente Digital',   type: 'file',   bucket: 'expedientes' },
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
    desc:  'Áreas comunes o frentes de mantenimiento dentro de una Sección — usadas en el Programa Anual',
    campos: [
      { key: 'nombre',        label: 'Nombre *',  type: 'text',    required: true },
      { key: 'descripcion',   label: 'Descripción', type: 'textarea' },
      { key: 'id_seccion_fk', label: 'Sección',   type: 'select',  selectTabla: 'secciones' },
    ],
  },
  {
    key:   'tipos_lote',
    tabla: 'tipos_lote',
    label: 'Tipos de Lote',
    icon:  Tag,
    color: '#7c3aed',
    desc:  'Clasificación del tipo de lote (Fairway, Casa, Villa, etc.)',
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
    tabla: 'cuotas_estandar',
    label: 'Cuotas Estándar',
    icon:  DollarSign,
    color: '#059669',
    desc:  'Plantillas de cuotas de mantenimiento aplicables a lotes',
    campos: [
      { key: 'nombre',              label: 'Nombre *',        type: 'text',    required: true },
      { key: 'id_seccion_fk',       label: 'Sección *',       type: 'select',  selectTabla: 'secciones',      required: true },
      { key: 'id_clasificacion_fk', label: 'Clasificación *', type: 'select',  selectTabla: 'clasificacion',  required: true },
      { key: 'monto',               label: 'Monto',           type: 'number' },
      { key: 'periodicidad', label: 'Periodicidad', type: 'select', staticOptions: ['Mensual', 'Anual', 'Única'] },
      { key: 'descripcion',         label: 'Descripción',     type: 'textarea' },
    ],
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
// Centros de Venta POS — panel custom con mapeo a Centro de Ingreso
// ══════════════════════════════════════════════════════════════
type CentroVentaPos = { id: number; nombre: string; descripcion: string | null; activo: boolean; orden: number }
type CentroIngresoOpt = { id: number; nombre: string; activo: boolean }
type IngresoMapRow   = { id: number; id_centro_venta_fk: number; id_centro_ingreso_fk: number; activo: boolean; genera_recibo_automatico: boolean }

// ══════════════════════════════════════════════════════════════
// Cuotas de Membresía Golf
// ══════════════════════════════════════════════════════════════
type CuotaCategoria = { id: number; nombre: string }
type CuotaConfig = {
  id: number; id_categoria_fk: number | null; tipo: string; nombre: string
  monto: number; meses_aplicar: number; dia_vencimiento: number; activo: boolean; notas: string | null
  cat_categorias_socios?: { nombre: string } | null
}
const TIPO_CUOTA_OPTS = ['INSCRIPCION', 'MENSUALIDAD', 'PENSION_CARRITO']
const TIPO_CUOTA_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  INSCRIPCION:     { label: 'Inscripción',     color: '#7c3aed', bg: '#f5f3ff' },
  MENSUALIDAD:     { label: 'Mensualidad',     color: '#0369a1', bg: '#e0f2fe' },
  PENSION_CARRITO: { label: 'Pensión Carrito', color: '#b45309', bg: '#fef3c7' },
}
const emptyQForm = () => ({ id_categoria_fk: '' as string | number, tipo: 'MENSUALIDAD', nombre: '', monto: '', meses_aplicar: 12, dia_vencimiento: 10, notas: '' })

function CuotasGolfPanel() {
  const { authUser } = useAuth()
  const puedeEscribir = authUser?.rol === 'superadmin' || authUser?.rol === 'admin'
  const [items, setItems]           = useState<CuotaConfig[]>([])
  const [categorias, setCategorias] = useState<CuotaCategoria[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<CuotaConfig | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [form, setForm]             = useState(emptyQForm())
  const [filtroCat, setFiltroCat]   = useState('all')
  const [filtroTipo, setFiltroTipo] = useState('all')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: cuotas }, { data: cats }] = await Promise.all([
      dbGolf.from('cat_cuotas_config').select('*, cat_categorias_socios(nombre)').order('id_categoria_fk').order('tipo').order('nombre'),
      dbGolf.from('cat_categorias_socios').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setItems((cuotas as unknown as CuotaConfig[]) ?? [])
    setCategorias((cats as CuotaCategoria[]) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const openNew = () => { setEditing(null); setForm(emptyQForm()); setError(''); setShowForm(true) }
  const openEdit = (item: CuotaConfig) => {
    setEditing(item)
    setForm({ id_categoria_fk: item.id_categoria_fk ?? '', tipo: item.tipo, nombre: item.nombre, monto: String(item.monto), meses_aplicar: item.meses_aplicar, dia_vencimiento: item.dia_vencimiento, notas: item.notas ?? '' })
    setError(''); setShowForm(true)
  }
  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!form.monto || isNaN(Number(form.monto)) || Number(form.monto) < 0) { setError('Monto inválido'); return }
    setSaving(true); setError('')
    const payload: any = {
      id_categoria_fk: form.id_categoria_fk !== '' ? Number(form.id_categoria_fk) : null,
      tipo: form.tipo, nombre: form.nombre.trim(), monto: Number(form.monto),
      meses_aplicar: Number(form.meses_aplicar), dia_vencimiento: Number(form.dia_vencimiento),
      notas: (form.notas as string) || null,
    }
    if (editing) {
      const { error: err } = await dbGolf.from('cat_cuotas_config').update(payload).eq('id', editing.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      payload.activo = true
      const { error: err } = await dbGolf.from('cat_cuotas_config').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false); setShowForm(false); fetchAll()
  }
  const toggleActivo = async (item: CuotaConfig) => {
    await dbGolf.from('cat_cuotas_config').update({ activo: !item.activo }).eq('id', item.id); fetchAll()
  }

  const filtered = items.filter(i =>
    (filtroCat  === 'all' || String(i.id_categoria_fk) === filtroCat) &&
    (filtroTipo === 'all' || i.tipo === filtroTipo)
  )
  const inputC: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none', background: '#fff' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#7c3aed18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={15} style={{ color: '#7c3aed' }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Cuotas de Membresía</h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 40 }}>Cuotas de inscripción, mensualidad y pensión de carrito por categoría</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchAll} style={{ padding: '7px 10px' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nueva cuota
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ ...inputC, minWidth: 180 }}>
          <option value="all">Todas las categorías</option>
          {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inputC, minWidth: 160 }}>
          <option value="all">Todos los tipos</option>
          {TIPO_CUOTA_OPTS.map(t => <option key={t} value={t}>{TIPO_CUOTA_LABEL[t]?.label ?? t}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} registros</span>
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{editing ? 'Editar cuota' : 'Nueva cuota'}</span>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
            <div>
              <label className="label">Categoría de socio</label>
              <select className="select" value={String(form.id_categoria_fk)} onChange={e => setForm(f => ({ ...f, id_categoria_fk: e.target.value }))}>
                <option value="">— Aplica a todas —</option>
                {categorias.map(c => <option key={c.id} value={String(c.id)}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo *</label>
              <select className="select" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {TIPO_CUOTA_OPTS.map(t => <option key={t} value={t}>{TIPO_CUOTA_LABEL[t]?.label ?? t}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Nombre *</label>
              <input className="input" value={form.nombre as string} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Mensualidad Platino" autoFocus />
            </div>
            <div>
              <label className="label">Monto *</label>
              <input className="input" type="number" min="0" step="0.01" value={form.monto as string} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
            </div>
            {form.tipo === 'MENSUALIDAD' && (
              <div>
                <label className="label">Meses a generar</label>
                <input className="input" type="number" min="1" max="24" value={form.meses_aplicar} onChange={e => setForm(f => ({ ...f, meses_aplicar: Number(e.target.value) }))} />
              </div>
            )}
            {(form.tipo === 'MENSUALIDAD' || form.tipo === 'PENSION_CARRITO') && (
              <div>
                <label className="label">Día de vencimiento</label>
                <input className="input" type="number" min="1" max="31" value={form.dia_vencimiento} onChange={e => setForm(f => ({ ...f, dia_vencimiento: Number(e.target.value) }))} />
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="label">Notas</label>
              <input className="input" value={form.notas as string} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones opcionales" />
            </div>
          </div>
          {error && <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
              {editing ? 'Guardar cambios' : 'Crear cuota'}
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Tipo</th>
              <th style={{ textAlign: 'right' }}>Monto</th>
              <th style={{ textAlign: 'center' }}>Meses</th>
              <th style={{ textAlign: 'center' }}>Vence día</th>
              <th style={{ textAlign: 'center', width: 80 }}>Status</th>
              {puedeEscribir && <th style={{ width: 80 }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                {items.length === 0 ? 'Sin cuotas. Crea la primera.' : 'Sin resultados con los filtros aplicados.'}
              </td></tr>
            ) : filtered.map(item => {
              const tipoInfo = TIPO_CUOTA_LABEL[item.tipo]
              return (
                <tr key={item.id} style={{ opacity: item.activo ? 1 : 0.45 }}>
                  <td style={{ fontWeight: 500 }}>
                    {item.nombre}
                    {item.notas && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.notas}</div>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.cat_categorias_socios?.nombre ?? <span style={{ color: 'var(--text-muted)' }}>Todas</span>}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: tipoInfo?.bg ?? '#f1f5f9', color: tipoInfo?.color ?? '#64748b' }}>
                      {tipoInfo?.label ?? item.tipo}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'monospace' }}>{fmt$(item.monto)}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{item.tipo === 'MENSUALIDAD' ? item.meses_aplicar : '—'}</td>
                  <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{item.tipo !== 'INSCRIPCION' ? `día ${item.dia_vencimiento}` : '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => puedeEscribir && toggleActivo(item)} style={{ background: 'none', border: 'none', cursor: puedeEscribir ? 'pointer' : 'default', display: 'flex', margin: '0 auto' }}>
                      {item.activo ? <ToggleRight size={20} style={{ color: '#15803d' }} /> : <ToggleLeft size={20} style={{ color: '#cbd5e1' }} />}
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

// ── Centros de Venta POS ──────────────────────────────────────
const emptyCVForm = () => ({ nombre: '', descripcion: '', orden: 1, id_centro_ingreso_fk: '' as string | number, genera_recibo_automatico: false })

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
      dbGolf.from('cat_centros_venta').select('id, nombre, descripcion, activo, orden').order('orden'),
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
    setForm({ nombre: item.nombre, descripcion: item.descripcion ?? '', orden: item.orden, id_centro_ingreso_fk: m?.id_centro_ingreso_fk ?? '', genera_recibo_automatico: m?.genera_recibo_automatico ?? false })
    setError(''); setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload: any = { nombre: form.nombre.trim(), descripcion: form.descripcion || null, orden: Number(form.orden) }
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
              <th style={{ width: 100, textAlign: 'center' }}>Recibo Auto</th>
              <th style={{ width: 80, textAlign: 'center' }}>Status</th>
              {puedeEscribir && <th style={{ width: 90 }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
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
      const { data: opts } = await sdb.from(c.selectTabla!).select('id, nombre').order('nombre')
      const m: Record<number, string> = {}
      ;(opts ?? []).forEach((o: any) => { m[o.id] = o.nombre })
      maps[c.key] = m
    }
    setSelectMaps(maps)
    setLoading(false)
  }, [config.tabla])

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
    c.type !== 'file' && c.type !== 'textarea'
  )

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
              {config.campos.find(c => c.type === 'file') && <th style={{ width: 90 }}>Expediente</th>}
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
                {config.campos.find(c => c.type === 'file') && (
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
                    {config.key === 'secciones' && (
                      <button className="btn-ghost" style={{ padding: '4px 6px', color: '#059669' }}
                        title="Áreas Comunes" onClick={() => setDetailAreasRow(row)}>
                        <Flag size={13} />
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
      {detailAreasRow !== null && config.key === 'secciones' && (
        <SeccionAreasComunes
          seccion={detailAreasRow}
          onClose={() => { setDetailAreasRow(null); fetchData() }}
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
// CuadranteSecciones — asigna/quita secciones de un cuadrante
// ══════════════════════════════════════════════════════════════
function CuadranteSecciones({ cuadrante, onClose }: { cuadrante: any; onClose: () => void }) {
  const [todas,     setTodas]     = useState<any[]>([])
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set())
  const [inicial,   setInicial]   = useState<Set<number>>(new Set())
  const [busqueda,  setBusqueda]  = useState('')
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    setLoading(true)
    dbCfg.from('secciones').select('id, nombre, id_cuadrante_fk').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setTodas(data ?? [])
        const asignadas = new Set<number>(
          (data ?? []).filter((s: any) => s.id_cuadrante_fk === cuadrante.id).map((s: any) => Number(s.id))
        )
        setSeleccion(new Set(asignadas))
        setInicial(new Set(asignadas))
        setLoading(false)
      })
  }, [cuadrante.id])

  const toggle = (id: number) =>
    setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleSave = async () => {
    setSaving(true); setError('')
    const added   = Array.from(seleccion).filter(id => !inicial.has(id))
    const removed = Array.from(inicial).filter(id => !seleccion.has(id))
    if (added.length === 0 && removed.length === 0) { onClose(); return }
    if (added.length > 0) {
      const { error: e } = await dbCfg.from('secciones')
        .update({ id_cuadrante_fk: cuadrante.id }).in('id', added)
      if (e) { setError(e.message); setSaving(false); return }
    }
    if (removed.length > 0) {
      const { error: e } = await dbCfg.from('secciones')
        .update({ id_cuadrante_fk: null }).in('id', removed)
      if (e) { setError(e.message); setSaving(false); return }
    }
    setSaving(false); onClose()
  }

  const filtradas = todas.filter(s => s.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <ModalShell modulo="residencial" titulo={`Secciones — ${cuadrante.nombre}`} onClose={onClose} maxWidth={480}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <input className="input" placeholder="Buscar sección…" value={busqueda}
          onChange={e => setBusqueda(e.target.value)} style={{ fontSize: 13 }} />
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 200px)', padding: '8px 0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : filtradas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
            Sin secciones
          </div>
        ) : filtradas.map(s => {
          const checked = seleccion.has(s.id)
          return (
            <label key={s.id} onClick={() => toggle(s.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                cursor: 'pointer', background: checked ? '#eff6ff' : 'transparent',
                borderLeft: `3px solid ${checked ? 'var(--blue)' : 'transparent'}`,
                transition: 'background 0.15s' }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(s.id)}
                style={{ accentColor: 'var(--blue)', width: 15, height: 15 }} />
              <span style={{ fontSize: 13, fontWeight: checked ? 600 : 400,
                color: checked ? '#1d4ed8' : '#1e293b' }}>
                {s.nombre}
              </span>
              {checked && <CheckCircle size={14} style={{ color: '#2563eb', marginLeft: 'auto', flexShrink: 0 }} />}
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
          {seleccion.size} sección{seleccion.size !== 1 ? 'es' : ''} asignada{seleccion.size !== 1 ? 's' : ''}
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
// SeccionAreasComunes — N:M vía cfg.rel_seccion_area_comun
// ══════════════════════════════════════════════════════════════
function SeccionAreasComunes({ seccion, onClose }: { seccion: any; onClose: () => void }) {
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
      dbCfg.from('rel_seccion_area_comun').select('id_area_comun_fk').eq('id_seccion_fk', seccion.id),
    ])
    setTodas(acs ?? [])
    const asignadas = new Set<number>((rels ?? []).map((r: any) => Number(r.id_area_comun_fk)))
    setSeleccion(new Set(asignadas))
    setInicial(new Set(asignadas))
    setLoading(false)
  }, [seccion.id])

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
      await dbCfg.from('rel_seccion_area_comun')
        .insert({ id_seccion_fk: seccion.id, id_area_comun_fk: data.id })
    }
    setNueva(''); setCreando(false); fetchData()
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    const added   = Array.from(seleccion).filter(id => !inicial.has(id))
    const removed = Array.from(inicial).filter(id => !seleccion.has(id))
    if (added.length === 0 && removed.length === 0) { onClose(); return }
    if (added.length > 0) {
      const { error: e } = await dbCfg.from('rel_seccion_area_comun')
        .insert(added.map(id => ({ id_seccion_fk: seccion.id, id_area_comun_fk: id })))
      if (e) { setError(e.message); setSaving(false); return }
    }
    if (removed.length > 0) {
      const { error: e } = await dbCfg.from('rel_seccion_area_comun')
        .delete().eq('id_seccion_fk', seccion.id).in('id_area_comun_fk', removed)
      if (e) { setError(e.message); setSaving(false); return }
    }
    setSaving(false); onClose()
  }

  const filtradas = todas.filter(a => a.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <ModalShell modulo="residencial" titulo={`Áreas Comunes — ${seccion.nombre}`} onClose={onClose} maxWidth={480}>
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
      const { data } = await sdb.from(c.selectTabla!).select('id, nombre').eq('activo', true).order('nombre')
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
