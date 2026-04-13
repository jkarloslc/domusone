'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbCfg, dbComp, supabase } from '@/lib/supabase'
import {
  BookOpen, Plus, Edit2, Trash2, X, Save,
  Loader, RefreshCw, ToggleLeft, ToggleRight,
  MapPin, Tag, Grid3x3, DollarSign, CreditCard,
  Car, CheckCircle, Upload, ExternalLink, Layers, AlertTriangle, Building2,
  Eye, ArrowUpCircle, ArrowDownCircle, TrendingUp
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

// ── Tipos ─────────────────────────────────────────────────────
type CatConfig = {
  key:      string
  tabla:    string
  schema?:  'cfg' | 'comp'
  label:    string
  icon:     any
  color:    string
  campos:   Campo[]
  desc:     string
  sortBy?:    string   // columna de ordenamiento; default 'nombre'
  hasDetail?: boolean  // muestra botón "Ver detalle" en la fila
}

type Campo = {
  key:       string
  label:     string
  type:      'text' | 'number' | 'textarea' | 'date' | 'select' | 'file'
  required?: boolean
  // Para type='select': tabla cfg de donde cargar las opciones
  selectTabla?:   string
  selectSchema?:  'cfg' | 'comp'
  // Para type='select': opciones estáticas (alternativa a selectTabla)
  staticOptions?: string[]
  // Para type='file': bucket de storage
  bucket?: string
}

const CATALOGOS: CatConfig[] = [
  {
    key:   'secciones',
    tabla: 'secciones',
    label: 'Secciones',
    icon:  MapPin,
    color: '#2563eb',
    desc:  'Secciones residenciales — se relacionan con lotes y cobranza',
    campos: [
      { key: 'nombre',              label: 'Nombre *',             type: 'text',   required: true },
      { key: 'descripcion',         label: 'Descripción',          type: 'textarea' },
      { key: 'id_tipo_seccion_fk',  label: 'Tipo de Sección',      type: 'select', selectTabla: 'tipo_secciones' },
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
    key:   'areas',
    tabla: 'areas',
    label: 'Áreas',
    icon:  Layers,
    color: '#0891b2',
    desc:  'Áreas de obra o zona dentro de un Centro de Costo (compras / mantenimiento)',
    campos: [
      { key: 'nombre',              label: 'Nombre *',         type: 'text',   required: true },
      { key: 'id_centro_costo_fk',  label: 'Centro de Costo *',type: 'select', selectTabla: 'centros_costo', required: true },
    ],
  },
  {
    key:   'frentes',
    tabla: 'frentes',
    label: 'Frentes',
    icon:  MapPin,
    color: '#7c3aed',
    desc:  'Frentes de obra dentro de un Área, para clasificación detallada en compras y mantenimiento',
    campos: [
      { key: 'nombre',      label: 'Nombre *', type: 'text',   required: true },
      { key: 'id_area_fk',  label: 'Área *',   type: 'select', selectTabla: 'areas', required: true },
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
]

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
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <BookOpen size={16} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sistema</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Catálogos</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Administra los valores de los catálogos del sistema</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Menú lateral */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {CATALOGOS.map(cat => {
            const Icon = cat.icon
            const isActive = cat.key === activeKey
            return (
              <button key={cat.key} onClick={() => setActiveKey(cat.key)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', background: isActive ? cat.color + '10' : 'none',
                  border: 'none', borderLeft: `3px solid ${isActive ? cat.color : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'none' }}>
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
            )
          })}
        </div>

        <CatalogoTable config={active} key={activeKey} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// Tabla genérica
// ══════════════════════════════════════════════════════════════
function CatalogoTable({ config }: { config: CatConfig }) {
  const db = config.schema === 'comp' ? dbComp : dbCfg
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<any | null | 'new'>(null)
  const [detailRow, setDetailRow] = useState<any | null>(null)
  // Mapa de selects: { campo_key: { id: nombre } }
  const [selectMaps, setSelectMaps] = useState<Record<string, Record<number, string>>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await db.from(config.tabla).select('*').order(config.sortBy ?? 'nombre')
    setRows(data ?? [])
    // Cargar opciones de campos select
    const maps: Record<string, Record<number, string>> = {}
    for (const c of config.campos.filter(f => f.type === 'select' && f.selectTabla)) {
      const sdb = c.selectSchema === 'comp' ? dbComp : dbCfg
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

  const activos   = rows.filter(r => r.activo).length
  const inactivos = rows.filter(r => !r.activo).length
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
            ) : rows.map(row => (
              <tr key={row.id} style={{ opacity: row.activo ? 1 : 0.45 }}>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.id}</td>
                {colsTabla.map(c => (
                  <td key={c.key} style={{ fontSize: c.key === 'nombre' ? 14 : 12, fontWeight: c.key === 'nombre' ? 500 : 400, color: 'var(--text-secondary)' }}>
                    {c.type === 'select'
                      ? (selectMaps[c.key]?.[row[c.key]] ?? '—')
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

      {modal !== null && (
        <CatalogoModal
          config={config}
          row={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchData() }}
        />
      )}
      {detailRow !== null && config.key === 'cuentas_bancarias' && (
        <CuentaBancariaDetail
          cuenta={detailRow}
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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 780 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0f766e18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={15} style={{ color: '#0f766e' }} />
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{cuenta.banco}</h2>
            </div>
            <div style={{ display: 'flex', gap: 16, marginLeft: 42, flexWrap: 'wrap' }}>
              {cuenta.numero_cuenta && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>No. {cuenta.numero_cuenta}</span>
              )}
              {cuenta.clabe && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>CLABE: {cuenta.clabe}</span>
              )}
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', borderTop: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{movs.length} movimiento{movs.length !== 1 ? 's' : ''}</span>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
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
      const sdb = c.selectSchema === 'comp' ? dbComp : dbCfg
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
      if (c.type === 'number')   payload[c.key] = form[c.key] ? Number(form[c.key]) : null
      else if (c.type === 'select') payload[c.key] = form[c.key] ? Number(form[c.key]) : null
      else if (c.type === 'file')   payload[c.key] = form[c.key]?.trim() || null
      else payload[c.key] = form[c.key]?.trim() || null
    })

    const db = config.schema === 'comp' ? dbComp : dbCfg
    const { error: err } = isNew
      ? await db.from(config.tabla).insert(payload)
      : await db.from(config.tabla).update(payload).eq('id', row.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  const Icon = config.icon

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: config.color + '18',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={14} style={{ color: config.color }} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600 }}>
              {isNew ? `Nuevo — ${config.label}` : `Editar — ${row?.[config.sortBy ?? 'nombre'] ?? config.label}`}
            </h2>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

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

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || uploading}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
