'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, dbCtrl, dbComp, dbGolf, dbCfg } from '@/lib/supabase'
import ModalShell from '@/components/ui/ModalShell'
import {
  Plus, Flag, MapPin, Calendar, Users, DollarSign,
  FileText, Trash2, Edit2, ChevronLeft, Receipt, ShoppingBag,
  Printer, X, Check, Eye, TrendingUp, TrendingDown,
  Settings, ClipboardCheck, Upload, Loader, ExternalLink,
} from 'lucide-react'

const MODULE = 'golf' as const

// ── Types ────────────────────────────────────────────────────

type TipoEvento = { id: number; nombre: string; color: string }
type Lugar      = { id: number; nombre: string; capacidad: number | null }

type Evento = {
  id: number
  folio: string
  nombre: string
  id_tipo_evento_fk: number | null
  id_lugar_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  hora_inicio: string | null
  hora_fin: string | null
  num_asistentes: number | null
  precio_pactado: number | null
  responsable: string | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_email: string | null
  notas: string | null
  status: string
  cat_tipos_evento?: { nombre: string; color: string }
  cat_lugares?: { nombre: string }
  // Ficha Maestra
  objetivo?: string | null
  riesgos_operativos?: string | null
  montaje_carpas?: boolean; montaje_escenario?: boolean; montaje_pista_baile?: boolean
  montaje_mesas_sillas?: boolean; montaje_iluminacion?: boolean; montaje_audio?: boolean
  montaje_pantallas?: boolean; montaje_generador?: boolean; montaje_notas?: string | null
  seg_guardias?: string | null; seg_control_accesos?: string | null
  seg_paramedicos?: boolean; seg_ambulancia?: boolean; seg_valet_parking?: boolean
  ayb_banquetero?: string | null; ayb_tipo_servicio?: string | null
  ayb_num_comensales?: number | null; ayb_barra_libre?: boolean; ayb_permisos_sanitarios?: boolean
  golf_tipo_torneo?: string | null; golf_num_jugadores?: number | null
  golf_tee_times?: string | null; golf_caddies?: number | null; golf_carritos?: number | null
  hip_tipo_evento?: string | null; hip_num_caballos?: number | null
  hip_caballerizas?: string | null; hip_veterinario?: string | null; hip_trailers?: string | null
  chk_contrato_firmado?: boolean; chk_anticipo_pagado?: boolean
  chk_layout_autorizado?: boolean; chk_montaje_concluido?: boolean; chk_revision_final?: boolean
  post_incidencias?: string | null; post_danos?: string | null
  post_evaluacion?: string | null; post_conclusion?: string | null
  justificacion_gasto_personal?: string | null
  notas_personal?: string | null
}

type PersonalItem = {
  id: number
  nombre_empleado: string
  dia: string
  turno: string | null
  compensacion: number
}

type Ingreso = {
  id: number
  folio: string
  descripcion: string
  monto: number
  fecha_pago: string
  forma_pago: string
  referencia: string | null
  notas: string | null
  id_venta_pos_fk: number | null
}
type VentaPOS = {
  id: number
  folio_dia: number
  fecha: string
  nombre_cliente: string
  total: number
  status: string
}

type OP = {
  id: number
  folio: string
  concepto: string
  monto: number
  saldo: number
  status: string
  id_proveedor_fk: number | null
}

type EventoOP = { id: number; id_op_fk: number }

type EventoGasto = {
  id: number
  id_evento_fk: number
  concepto: string
  proveedor: string | null
  tipo_gasto: string | null
  monto: number
  fecha: string | null
  notas: string | null
  id_op_fk: number | null
}

const TIPOS_GASTO_EVT = [
  'Servicios Profesionales', 'Mantenimiento', 'Reparación',
  'Arrendamiento', 'Seguros', 'Publicidad', 'Combustible',
  'Electricidad', 'Agua', 'Telefonía / Internet',
  'Honorarios', 'Asesoría', 'Capacitación', 'Entretenimiento',
  'Alimentos y Bebidas', 'Decoración', 'Sonido / Iluminación',
  'Transporte', 'Seguridad', 'Otro',
]

// ── Constants ────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Cotización': { bg: '#f0fdf4', color: '#16a34a' },
  'Confirmado': { bg: '#eff6ff', color: '#2563eb' },
  'En curso':   { bg: '#fff7ed', color: '#ea580c' },
  'Realizado':  { bg: '#f0fdf4', color: '#15803d' },
  'Cancelado':  { bg: '#fef2f2', color: '#dc2626' },
}

const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro']
const STATUSES    = ['Cotización', 'Confirmado', 'En curso', 'Realizado', 'Cancelado']
const CHECKLIST_BUCKET = 'eventos-checklist-operativo'
const CHECKLIST_ITEMS = [
  ['chk_contrato_firmado', 'Contrato firmado'],
  ['chk_anticipo_pagado', 'Pago de anticipo recibido'],
  ['chk_layout_autorizado', 'Layout autorizado'],
  ['chk_montaje_concluido', 'Montaje concluido'],
  ['chk_revision_final', 'Revisión final operativa'],
] as const

type ChecklistKey = typeof CHECKLIST_ITEMS[number][0]

const emptyChecklistFiles = (): Record<ChecklistKey, string | null> => ({
  chk_contrato_firmado: null,
  chk_anticipo_pagado: null,
  chk_layout_autorizado: null,
  chk_montaje_concluido: null,
  chk_revision_final: null,
})
const emptyChecklistLoading = (): Record<ChecklistKey, boolean> => ({
  chk_contrato_firmado: false,
  chk_anticipo_pagado: false,
  chk_layout_autorizado: false,
  chk_montaje_concluido: false,
  chk_revision_final: false,
})

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFolioVentaPos = (v: Pick<VentaPOS, 'id' | 'folio_dia'>) => `#${String(v.id).padStart(6, '0')} · Día ${v.folio_dia}`
const checklistPath = (idEvento: number, key: ChecklistKey) => `${idEvento}/${key}`

function isChecklistFile(file: File) {
  const t = (file.type || '').toLowerCase()
  const n = file.name.toLowerCase()
  return t === 'application/pdf' || t === 'image/jpeg' || n.endsWith('.pdf') || n.endsWith('.jpg') || n.endsWith('.jpeg')
}

function sortEventosDesc(a: Evento, b: Evento) {
  const fecha = b.fecha_inicio.localeCompare(a.fecha_inicio)
  if (fecha !== 0) return fecha
  return (b.hora_inicio ?? '').localeCompare(a.hora_inicio ?? '')
}

// ── Helper UI components ─────────────────────────────────────

function FmSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${color}33` }}>{title}</div>
      {children}
    </div>
  )
}
function FmGrid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}
function FmFull({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────

export default function EventosPage() {
  // Catálogos
  const [tipos,   setTipos]   = useState<TipoEvento[]>([])
  const [lugares, setLugares] = useState<Lugar[]>([])

  // Lista
  const [eventos,  setEventos]  = useState<Evento[]>([])
  const [loading,  setLoading]  = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  // Modal
  const [modal,    setModal]    = useState(false)
  const [editEvt,  setEditEvt]  = useState<Evento | null>(null)
  const [activeTab, setActiveTab] = useState('info')
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  // Modal de consulta (read-only)
  const [viewEvt,  setViewEvt]  = useState<Evento | null>(null)
  const [viewIng,  setViewIng]  = useState<Ingreso[]>([])
  const [viewOps,  setViewOps]  = useState<OP[]>([])
  const [viewLoad, setViewLoad] = useState(false)
  const [viewChecklist, setViewChecklist] = useState<Record<ChecklistKey, boolean>>(emptyChecklistLoading())

  // Formulario
  const blankForm = () => ({
    nombre: '', id_tipo_evento_fk: '' as number | '',
    id_lugar_fk: '' as number | '',
    fecha_inicio: new Date().toLocaleDateString('en-CA'),
    fecha_fin: '', hora_inicio: '', hora_fin: '',
    num_asistentes: '' as number | '', responsable: '',
    precio_pactado: '' as number | '',
    cliente_nombre: '', cliente_telefono: '', cliente_email: '',
    notas: '', status: 'Cotización',
    // Ficha Maestra
    objetivo: '', riesgos_operativos: '',
    montaje_carpas: false, montaje_escenario: false, montaje_pista_baile: false,
    montaje_mesas_sillas: false, montaje_iluminacion: false, montaje_audio: false,
    montaje_pantallas: false, montaje_generador: false, montaje_notas: '',
    seg_guardias: '', seg_control_accesos: '',
    seg_paramedicos: false, seg_ambulancia: false, seg_valet_parking: false,
    ayb_banquetero: '', ayb_tipo_servicio: '',
    ayb_num_comensales: '' as number | '', ayb_barra_libre: false, ayb_permisos_sanitarios: false,
    golf_tipo_torneo: '', golf_num_jugadores: '' as number | '',
    golf_tee_times: '', golf_caddies: '' as number | '', golf_carritos: '' as number | '',
    hip_tipo_evento: '', hip_num_caballos: '' as number | '',
    hip_caballerizas: '', hip_veterinario: '', hip_trailers: '',
    chk_contrato_firmado: false, chk_anticipo_pagado: false,
    chk_layout_autorizado: false, chk_montaje_concluido: false, chk_revision_final: false,
    post_incidencias: '', post_danos: '', post_evaluacion: '', post_conclusion: '',
    justificacion_gasto_personal: '', notas_personal: '',
  })
  const [form, setForm] = useState(blankForm())
  const [checklistFiles, setChecklistFiles] = useState<Record<ChecklistKey, string | null>>(emptyChecklistFiles())
  const [checklistLoading, setChecklistLoading] = useState<Record<ChecklistKey, boolean>>(emptyChecklistLoading())
  const [loadingChecklistFiles, setLoadingChecklistFiles] = useState(false)
  const checklistInputRefs = useRef<Record<ChecklistKey, HTMLInputElement | null>>({
    chk_contrato_firmado: null,
    chk_anticipo_pagado: null,
    chk_layout_autorizado: null,
    chk_montaje_concluido: null,
    chk_revision_final: null,
  })

  // Ingresos
  const [ingresos, setIngresos] = useState<Ingreso[]>([])
  const [ingresoForm, setIngresoForm] = useState({ descripcion: '', monto: '', fecha_pago: new Date().toISOString().split('T')[0], forma_pago: 'Transferencia', referencia: '', notas: '', id_venta_pos_fk: null as number | null })
  const [savingIngreso, setSavingIngreso] = useState(false)
  const [busqVentaPOS, setBusqVentaPOS] = useState('')
  const [ventasPOS, setVentasPOS] = useState<VentaPOS[]>([])
  const [loadingVentasPOS, setLoadingVentasPOS] = useState(false)
  const [ventaPosMap, setVentaPosMap] = useState<Record<number, VentaPOS>>({})

  // OPs
  const [ops,      setOps]      = useState<OP[]>([])
  const [evtOps,   setEvtOps]   = useState<EventoOP[]>([])
  const [busqOP,   setBusqOP]   = useState('')
  const [opsComp,  setOpsComp]  = useState<OP[]>([])
  const [loadingOps, setLoadingOps] = useState(false)
  const [provMap,  setProvMap]  = useState<Record<number, string>>({})

  // Gastos manuales
  const [gastos,       setGastos]       = useState<EventoGasto[]>([])
  const [modalGasto,   setModalGasto]   = useState(false)
  const [gastoEdit,    setGastoEdit]    = useState<EventoGasto | null>(null)
  const [gastoForm,    setGastoForm]    = useState({ concepto:'', proveedor:'', tipo_gasto:'', monto:'', fecha:'', notas:'' })
  const [savingGasto,  setSavingGasto]  = useState(false)
  const [gastoErrMsg,  setGastoErrMsg]  = useState('')
  // Vincular gasto manual a OP
  const [vincGastoId,  setVincGastoId]  = useState<number | null>(null)
  const [busqOPGasto,  setBusqOPGasto]  = useState('')
  const [opsGasto,     setOpsGasto]     = useState<OP[]>([])
  const [loadingVinc,  setLoadingVinc]  = useState(false)
  const [gastoOpMap,   setGastoOpMap]   = useState<Record<number, { folio: string; concepto: string }>>({})

  // Personal Operativo
  const [personal, setPersonal] = useState<PersonalItem[]>([])
  const [personalForm, setPersonalForm] = useState({ nombre_empleado: '', dia: new Date().toLocaleDateString('en-CA'), turno: '', compensacion: '' })
  const [savingPersonal, setSavingPersonal] = useState(false)

  // ── Load catálogos ─────────────────────────────────────────
  useEffect(() => {
    dbCtrl.from('cat_tipos_evento').select('id, nombre, color').eq('activo', true).order('nombre')
      .then(({ data }: any) => setTipos(data ?? []))
    dbCtrl.from('cat_lugares').select('id, nombre, capacidad').eq('activo', true).order('nombre')
      .then(({ data }: any) => setLugares(data ?? []))
    dbComp.from('proveedores').select('id, nombre').eq('activo', true)
      .then(({ data }) => {
        const m: Record<number, string> = {}
        ;(data ?? []).forEach((p: any) => { m[p.id] = p.nombre })
        setProvMap(m)
      })
  }, [])

  // ── Load eventos ───────────────────────────────────────────
  const loadEventos = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('eventos')
      .select('id, folio, nombre, id_tipo_evento_fk, id_lugar_fk, fecha_inicio, fecha_fin, hora_inicio, hora_fin, num_asistentes, precio_pactado, responsable, cliente_nombre, cliente_telefono, cliente_email, notas, status, objetivo, riesgos_operativos, montaje_carpas, montaje_escenario, montaje_pista_baile, montaje_mesas_sillas, montaje_iluminacion, montaje_audio, montaje_pantallas, montaje_generador, montaje_notas, seg_guardias, seg_control_accesos, seg_paramedicos, seg_ambulancia, seg_valet_parking, ayb_banquetero, ayb_tipo_servicio, ayb_num_comensales, ayb_barra_libre, ayb_permisos_sanitarios, golf_tipo_torneo, golf_num_jugadores, golf_tee_times, golf_caddies, golf_carritos, hip_tipo_evento, hip_num_caballos, hip_caballerizas, hip_veterinario, hip_trailers, chk_contrato_firmado, chk_anticipo_pagado, chk_layout_autorizado, chk_montaje_concluido, chk_revision_final, post_incidencias, post_danos, post_evaluacion, post_conclusion, justificacion_gasto_personal, notas_personal, cat_tipos_evento(nombre, color), cat_lugares(nombre)')
      .eq('modulo', MODULE)
      .order('fecha_inicio', { ascending: false })
    if (filtroStatus) q = q.eq('status', filtroStatus)
    const { data } = await q
    setEventos((data as unknown as Evento[]) ?? [])
    setLoading(false)
  }, [filtroStatus])

  useEffect(() => { loadEventos() }, [loadEventos])

  // ── Load gastos manuales ───────────────────────────────────
  const loadGastos = useCallback(async (evtId: number) => {
    const { data } = await dbCtrl.from('eventos_gastos')
      .select('id, id_evento_fk, concepto, proveedor, tipo_gasto, monto, fecha, notas, id_op_fk')
      .eq('id_evento_fk', evtId)
      .order('fecha', { ascending: false })
    const rows = (data as unknown as EventoGasto[]) ?? []
    setGastos(rows)
    const opIds = Array.from(new Set(rows.map(g => g.id_op_fk).filter((v): v is number => !!v)))
    if (opIds.length > 0) {
      const { data: opData } = await dbComp.from('ordenes_pago')
        .select('id, folio, concepto')
        .in('id', opIds)
      const m: Record<number, { folio: string; concepto: string }> = {}
      ;((opData ?? []) as any[]).forEach((o: any) => { m[o.id] = { folio: o.folio, concepto: o.concepto } })
      setGastoOpMap(m)
    } else {
      setGastoOpMap({})
    }
  }, [])

  // ── Load ingresos y OPs del evento seleccionado ────────────
  const loadEventoDetalle = useCallback(async (evtId: number) => {
    const [{ data: ing }, { data: eops }, { data: pers }] = await Promise.all([
      dbCtrl.from('eventos_ingresos').select('id, folio, descripcion, monto, fecha_pago, forma_pago, referencia, notas, id_venta_pos_fk').eq('id_evento_fk', evtId).order('fecha_pago'),
      dbCtrl.from('eventos_ops').select('id, id_op_fk').eq('id_evento_fk', evtId),
      dbCtrl.from('eventos_personal').select('id, nombre_empleado, dia, turno, compensacion').eq('id_evento_fk', evtId).order('dia').order('created_at'),
    ])
    setPersonal((pers as unknown as PersonalItem[]) ?? [])
    const ingRows = (ing as unknown as Ingreso[]) ?? []
    setIngresos(ingRows)

    const ventaIds = Array.from(new Set(ingRows.map(i => i.id_venta_pos_fk).filter((v): v is number => !!v)))
    if (ventaIds.length > 0) {
      const { data: ventasData } = await dbGolf.from('ctrl_ventas')
        .select('id, folio_dia, fecha, nombre_cliente, total, status')
        .in('id', ventaIds)
      const m: Record<number, VentaPOS> = {}
      ;((ventasData as VentaPOS[]) ?? []).forEach(v => { m[v.id] = v })
      setVentaPosMap(m)
    } else {
      setVentaPosMap({})
    }

    const evOps = (eops as unknown as EventoOP[]) ?? []
    setEvtOps(evOps)
    if (evOps.length > 0) {
      const ids = evOps.map(e => e.id_op_fk)
      const { data: opData } = await dbComp.from('ordenes_pago')
        .select('id, folio, concepto, monto, saldo, status, id_proveedor_fk')
        .in('id', ids)
      setOps((opData as unknown as OP[]) ?? [])
    } else {
      setOps([])
    }
    loadGastos(evtId)
  }, [loadGastos])

  const loadChecklistFiles = useCallback(async (evtId: number) => {
    setLoadingChecklistFiles(true)
    const nextFiles = emptyChecklistFiles()
    const nextChecked: Partial<Record<ChecklistKey, boolean>> = {}

    await Promise.all(CHECKLIST_ITEMS.map(async ([k]) => {
      const { data, error } = await supabase.storage.from(CHECKLIST_BUCKET).createSignedUrl(checklistPath(evtId, k), 60 * 60 * 24 * 7)
      if (!error && data?.signedUrl) {
        nextFiles[k] = data.signedUrl
        nextChecked[k] = true
      } else {
        nextChecked[k] = false
      }
    }))

    setChecklistFiles(nextFiles)
    setForm(prev => ({ ...prev, ...nextChecked }))
    setLoadingChecklistFiles(false)
  }, [])

  const fetchChecklistStatus = useCallback(async (evtId: number) => {
    const status = emptyChecklistLoading()
    await Promise.all(CHECKLIST_ITEMS.map(async ([k]) => {
      const { data, error } = await supabase.storage.from(CHECKLIST_BUCKET).createSignedUrl(checklistPath(evtId, k), 60)
      status[k] = !error && !!data?.signedUrl
    }))
    return status
  }, [])

  const setChecklistBusy = (key: ChecklistKey, busy: boolean) => {
    setChecklistLoading(prev => ({ ...prev, [key]: busy }))
  }

  const subirChecklist = async (key: ChecklistKey, file: File) => {
    if (!editEvt) { setErr('Guarda el evento primero para habilitar adjuntos del checklist.'); return }
    if (!isChecklistFile(file)) { setErr('Solo se permiten archivos PDF o JPG/JPEG.'); return }

    setChecklistBusy(key, true)
    setErr('')
    const path = checklistPath(editEvt.id, key)

    const { error: upErr } = await supabase.storage.from(CHECKLIST_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    })
    if (upErr) {
      setErr(`No se pudo subir el archivo (${file.name}): ${upErr.message}`)
      setChecklistBusy(key, false)
      return
    }

    const { data: signed, error: signErr } = await supabase.storage.from(CHECKLIST_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7)
    if (signErr || !signed?.signedUrl) {
      setErr(`El archivo se subió, pero no se pudo generar enlace: ${signErr?.message ?? 'sin detalle'}`)
      setChecklistBusy(key, false)
      return
    }

    setChecklistFiles(prev => ({ ...prev, [key]: signed.signedUrl }))
    setForm(prev => ({ ...prev, [key]: true }))
    setChecklistBusy(key, false)
  }

  const borrarChecklist = async (key: ChecklistKey) => {
    if (!editEvt) return
    setChecklistBusy(key, true)
    setErr('')
    const path = checklistPath(editEvt.id, key)
    const { error } = await supabase.storage.from(CHECKLIST_BUCKET).remove([path])
    if (error) {
      setErr(`No se pudo eliminar el archivo: ${error.message}`)
      setChecklistBusy(key, false)
      return
    }
    setChecklistFiles(prev => ({ ...prev, [key]: null }))
    setForm(prev => ({ ...prev, [key]: false }))
    setChecklistBusy(key, false)
  }

  // ── Open modal ─────────────────────────────────────────────
  const openNew = () => {
    setEditEvt(null)
    setForm(blankForm())
    setIngresos([]); setOps([]); setEvtOps([])
    setPersonal([])
    setPersonalForm({ nombre_empleado: '', dia: new Date().toLocaleDateString('en-CA'), turno: '', compensacion: '' })
    setActiveTab('info')
    setErr('')
    setIngresoForm({ descripcion: '', monto: '', fecha_pago: new Date().toISOString().split('T')[0], forma_pago: 'Transferencia', referencia: '', notas: '', id_venta_pos_fk: null })
    setBusqVentaPOS('')
    setVentasPOS([])
    setVentaPosMap({})
    setChecklistFiles(emptyChecklistFiles())
    setChecklistLoading(emptyChecklistLoading())
    setLoadingChecklistFiles(false)
    setModal(true)
  }

  const openEdit = async (ev: Evento) => {
    setEditEvt(ev)
    setForm({
      nombre: ev.nombre,
      id_tipo_evento_fk: ev.id_tipo_evento_fk ?? '',
      id_lugar_fk: ev.id_lugar_fk ?? '',
      fecha_inicio: ev.fecha_inicio,
      fecha_fin: ev.fecha_fin ?? '',
      hora_inicio: ev.hora_inicio ?? '',
      hora_fin: ev.hora_fin ?? '',
      num_asistentes: ev.num_asistentes ?? '',
      precio_pactado: ev.precio_pactado ?? '',
      responsable: ev.responsable ?? '',
      cliente_nombre: ev.cliente_nombre ?? '',
      cliente_telefono: ev.cliente_telefono ?? '',
      cliente_email: ev.cliente_email ?? '',
      notas: ev.notas ?? '',
      status: ev.status,
      // Ficha Maestra
      objetivo: ev.objetivo ?? '', riesgos_operativos: ev.riesgos_operativos ?? '',
      montaje_carpas: ev.montaje_carpas ?? false, montaje_escenario: ev.montaje_escenario ?? false,
      montaje_pista_baile: ev.montaje_pista_baile ?? false, montaje_mesas_sillas: ev.montaje_mesas_sillas ?? false,
      montaje_iluminacion: ev.montaje_iluminacion ?? false, montaje_audio: ev.montaje_audio ?? false,
      montaje_pantallas: ev.montaje_pantallas ?? false, montaje_generador: ev.montaje_generador ?? false,
      montaje_notas: ev.montaje_notas ?? '',
      seg_guardias: ev.seg_guardias ?? '', seg_control_accesos: ev.seg_control_accesos ?? '',
      seg_paramedicos: ev.seg_paramedicos ?? false, seg_ambulancia: ev.seg_ambulancia ?? false,
      seg_valet_parking: ev.seg_valet_parking ?? false,
      ayb_banquetero: ev.ayb_banquetero ?? '', ayb_tipo_servicio: ev.ayb_tipo_servicio ?? '',
      ayb_num_comensales: ev.ayb_num_comensales ?? '', ayb_barra_libre: ev.ayb_barra_libre ?? false,
      ayb_permisos_sanitarios: ev.ayb_permisos_sanitarios ?? false,
      golf_tipo_torneo: ev.golf_tipo_torneo ?? '', golf_num_jugadores: ev.golf_num_jugadores ?? '',
      golf_tee_times: ev.golf_tee_times ?? '', golf_caddies: ev.golf_caddies ?? '',
      golf_carritos: ev.golf_carritos ?? '',
      hip_tipo_evento: ev.hip_tipo_evento ?? '', hip_num_caballos: ev.hip_num_caballos ?? '',
      hip_caballerizas: ev.hip_caballerizas ?? '', hip_veterinario: ev.hip_veterinario ?? '',
      hip_trailers: ev.hip_trailers ?? '',
      chk_contrato_firmado: ev.chk_contrato_firmado ?? false, chk_anticipo_pagado: ev.chk_anticipo_pagado ?? false,
      chk_layout_autorizado: ev.chk_layout_autorizado ?? false, chk_montaje_concluido: ev.chk_montaje_concluido ?? false,
      chk_revision_final: ev.chk_revision_final ?? false,
      post_incidencias: ev.post_incidencias ?? '', post_danos: ev.post_danos ?? '',
      post_evaluacion: ev.post_evaluacion ?? '', post_conclusion: ev.post_conclusion ?? '',
      justificacion_gasto_personal: ev.justificacion_gasto_personal ?? '',
      notas_personal: ev.notas_personal ?? '',
    })
    setPersonal([])
    setPersonalForm({ nombre_empleado: '', dia: new Date().toLocaleDateString('en-CA'), turno: '', compensacion: '' })
    setActiveTab('info')
    setErr('')
    setIngresoForm({ descripcion: '', monto: '', fecha_pago: new Date().toISOString().split('T')[0], forma_pago: 'Transferencia', referencia: '', notas: '', id_venta_pos_fk: null })
    setBusqVentaPOS('')
    setVentasPOS([])
    setChecklistFiles(emptyChecklistFiles())
    setChecklistLoading(emptyChecklistLoading())
    setLoadingChecklistFiles(false)
    setModal(true)
    await loadEventoDetalle(ev.id)
    await loadChecklistFiles(ev.id)
  }

  // ── Open consulta (read-only) ──────────────────────────────
  const openView = async (ev: Evento) => {
    setViewEvt(ev)
    setViewIng([])
    setViewOps([])
    setViewChecklist(emptyChecklistLoading())
    setViewLoad(true)
    const [{ data: ing }, { data: eops }, checklistStatus] = await Promise.all([
      dbCtrl.from('eventos_ingresos').select('id, folio, descripcion, monto, fecha_pago, forma_pago, referencia, notas, id_venta_pos_fk').eq('id_evento_fk', ev.id),
      dbCtrl.from('eventos_ops').select('id, id_op_fk').eq('id_evento_fk', ev.id),
      fetchChecklistStatus(ev.id),
    ])
    setViewChecklist(checklistStatus)
    setViewIng((ing as unknown as Ingreso[]) ?? [])
    const evOps = (eops as unknown as EventoOP[]) ?? []
    if (evOps.length > 0) {
      const ids = evOps.map(e => e.id_op_fk)
      const { data: opData } = await dbComp.from('ordenes_pago')
        .select('id, folio, concepto, monto, saldo, status, id_proveedor_fk')
        .in('id', ids)
      setViewOps((opData as unknown as OP[]) ?? [])
    }
    setViewLoad(false)
  }

  // ── Save evento ────────────────────────────────────────────
  const saveEvento = async () => {
    if (!form.nombre.trim()) { setErr('El nombre del evento es obligatorio'); return }
    if (!form.fecha_inicio)  { setErr('La fecha de inicio es obligatoria'); return }
    setSaving(true); setErr('')
    const payload = {
      nombre:              form.nombre.trim(),
      id_tipo_evento_fk:   form.id_tipo_evento_fk || null,
      id_lugar_fk:         form.id_lugar_fk || null,
      fecha_inicio:        form.fecha_inicio,
      fecha_fin:           form.fecha_fin || null,
      hora_inicio:         form.hora_inicio || null,
      hora_fin:            form.hora_fin || null,
      num_asistentes:      form.num_asistentes || null,
      precio_pactado:      form.precio_pactado === '' ? null : form.precio_pactado,
      responsable:         form.responsable || null,
      cliente_nombre:      form.cliente_nombre || null,
      cliente_telefono:    form.cliente_telefono || null,
      cliente_email:       form.cliente_email || null,
      notas:               form.notas || null,
      status:              form.status,
      // Ficha Maestra
      objetivo:            form.objetivo || null,
      riesgos_operativos:  form.riesgos_operativos || null,
      montaje_carpas: form.montaje_carpas, montaje_escenario: form.montaje_escenario,
      montaje_pista_baile: form.montaje_pista_baile, montaje_mesas_sillas: form.montaje_mesas_sillas,
      montaje_iluminacion: form.montaje_iluminacion, montaje_audio: form.montaje_audio,
      montaje_pantallas: form.montaje_pantallas, montaje_generador: form.montaje_generador,
      montaje_notas: form.montaje_notas || null,
      seg_guardias: form.seg_guardias || null, seg_control_accesos: form.seg_control_accesos || null,
      seg_paramedicos: form.seg_paramedicos, seg_ambulancia: form.seg_ambulancia,
      seg_valet_parking: form.seg_valet_parking,
      ayb_banquetero: form.ayb_banquetero || null, ayb_tipo_servicio: form.ayb_tipo_servicio || null,
      ayb_num_comensales: form.ayb_num_comensales || null,
      ayb_barra_libre: form.ayb_barra_libre, ayb_permisos_sanitarios: form.ayb_permisos_sanitarios,
      golf_tipo_torneo: form.golf_tipo_torneo || null,
      golf_num_jugadores: form.golf_num_jugadores || null,
      golf_tee_times: form.golf_tee_times || null,
      golf_caddies: form.golf_caddies || null, golf_carritos: form.golf_carritos || null,
      hip_tipo_evento: form.hip_tipo_evento || null,
      hip_num_caballos: form.hip_num_caballos || null,
      hip_caballerizas: form.hip_caballerizas || null,
      hip_veterinario: form.hip_veterinario || null, hip_trailers: form.hip_trailers || null,
      chk_contrato_firmado: form.chk_contrato_firmado, chk_anticipo_pagado: form.chk_anticipo_pagado,
      chk_layout_autorizado: form.chk_layout_autorizado, chk_montaje_concluido: form.chk_montaje_concluido,
      chk_revision_final: form.chk_revision_final,
      post_incidencias: form.post_incidencias || null, post_danos: form.post_danos || null,
      post_evaluacion: form.post_evaluacion || null, post_conclusion: form.post_conclusion || null,
      justificacion_gasto_personal: form.justificacion_gasto_personal || null,
      notas_personal: form.notas_personal || null,
      modulo: MODULE,
    }
    if (editEvt) {
      const { error } = await dbCtrl.from('eventos').update(payload).eq('id', editEvt.id)
      if (error) { setErr(error.message); setSaving(false); return }
    } else {
      const { error } = await dbCtrl.from('eventos').insert(payload)
      if (error) { setErr(error.message); setSaving(false); return }
    }
    setSaving(false)
    setModal(false)
    loadEventos()
  }

  // ── Eliminar evento ────────────────────────────────────────
  const deleteEvento = async (id: number) => {
    if (!confirm('¿Eliminar este evento? Se borrarán sus ingresos y relaciones con OPs.')) return
    await dbCtrl.from('eventos').delete().eq('id', id)
    loadEventos()
  }

  const mapFormaPagoPosToEvento = (n: string): string => {
    const x = n.toLowerCase()
    if (x.includes('efectivo')) return 'Efectivo'
    if (x.includes('transfer')) return 'Transferencia'
    if (x.includes('tarjeta')) return 'Tarjeta'
    if (x.includes('cheque')) return 'Cheque'
    return 'Otro'
  }

  const buscarVentasPOS = async () => {
    if (!busqVentaPOS.trim()) return
    setLoadingVentasPOS(true)
    const t = busqVentaPOS.trim().toLowerCase()
    const qNum = Number(t)

    let q = dbGolf.from('ctrl_ventas')
      .select('id, folio_dia, fecha, nombre_cliente, total, status')
      .eq('status', 'PAGADA')
      .order('fecha', { ascending: false })
      .limit(20)

    if (!Number.isNaN(qNum)) {
      q = q.or(`id.eq.${qNum},folio_dia.eq.${qNum}`)
    } else {
      q = q.ilike('nombre_cliente', `%${t}%`)
    }

    const { data, error } = await q
    if (error) console.error('Error buscando ventas POS:', error)
    setVentasPOS((data as unknown as VentaPOS[]) ?? [])
    setLoadingVentasPOS(false)
  }

  const seleccionarVentaPOS = async (venta: VentaPOS) => {
    let forma = 'Otro'
    const { data: pagos } = await dbGolf.from('ctrl_ventas_pagos')
      .select('forma_nombre, monto')
      .eq('id_venta_fk', venta.id)
      .order('monto', { ascending: false })
      .limit(1)
    if (pagos && pagos.length > 0) {
      forma = mapFormaPagoPosToEvento((pagos[0] as any).forma_nombre ?? '')
    }

    setIngresoForm(f => ({
      ...f,
      id_venta_pos_fk: venta.id,
      descripcion: f.descripcion.trim() || `Ingreso por venta POS ${fmtFolioVentaPos(venta)}`,
      monto: String(venta.total ?? 0),
      fecha_pago: (venta.fecha ?? '').split('T')[0] || f.fecha_pago,
      forma_pago: forma,
      referencia: f.referencia || `POS ${fmtFolioVentaPos(venta)}`,
    }))
  }

  // ── Save ingreso ───────────────────────────────────────────
  const saveIngreso = async () => {
    if (!editEvt) return
    if (!ingresoForm.descripcion.trim()) { setErr('Descripción requerida'); return }
    if (!ingresoForm.monto || Number(ingresoForm.monto) <= 0) { setErr('Monto debe ser mayor a 0'); return }
    setSavingIngreso(true); setErr('')
    const { error } = await dbCtrl.from('eventos_ingresos').insert({
      id_evento_fk: editEvt.id,
      descripcion:  ingresoForm.descripcion.trim(),
      monto:        Number(ingresoForm.monto),
      fecha_pago:   ingresoForm.fecha_pago,
      forma_pago:   ingresoForm.forma_pago,
      referencia:   ingresoForm.referencia || null,
      notas:        ingresoForm.notas || null,
      id_venta_pos_fk: ingresoForm.id_venta_pos_fk,
    })
    if (error) {
      if (error.message?.includes('idx_eventos_ingresos_venta_pos_uniq')) {
        setErr('Esta venta POS ya está asociada a otro ingreso.')
      } else {
        setErr(error.message)
      }
      setSavingIngreso(false)
      return
    }
    setSavingIngreso(false)
    setIngresoForm({ descripcion: '', monto: '', fecha_pago: new Date().toISOString().split('T')[0], forma_pago: 'Transferencia', referencia: '', notas: '', id_venta_pos_fk: null })
    setBusqVentaPOS('')
    setVentasPOS([])
    await loadEventoDetalle(editEvt.id)
  }

  const deleteIngreso = async (id: number) => {
    if (!editEvt) return
    await dbCtrl.from('eventos_ingresos').delete().eq('id', id)
    loadEventoDetalle(editEvt.id)
  }

  // ── Personal Operativo ─────────────────────────────────────
  const savePersonal = async () => {
    if (!editEvt) return
    if (!personalForm.nombre_empleado.trim()) { setErr('El nombre del empleado es obligatorio'); return }
    if (!personalForm.dia) { setErr('La fecha es obligatoria'); return }
    setSavingPersonal(true); setErr('')
    const { error } = await dbCtrl.from('eventos_personal').insert({
      id_evento_fk:    editEvt.id,
      nombre_empleado: personalForm.nombre_empleado.trim(),
      dia:             personalForm.dia,
      turno:           personalForm.turno || null,
      compensacion:    personalForm.compensacion ? Number(personalForm.compensacion) : 0,
    })
    if (error) { setErr(error.message); setSavingPersonal(false); return }
    setSavingPersonal(false)
    setPersonalForm({ nombre_empleado: '', dia: new Date().toLocaleDateString('en-CA'), turno: '', compensacion: '' })
    await loadEventoDetalle(editEvt.id)
  }

  const deletePersonal = async (id: number) => {
    if (!editEvt) return
    await dbCtrl.from('eventos_personal').delete().eq('id', id)
    loadEventoDetalle(editEvt.id)
  }

  const printPersonal = async () => {
    if (!editEvt) return
    const totalComp = personal.reduce((s, p) => s + (p.compensacion ?? 0), 0)
    const lugar     = editEvt.cat_lugares?.nombre ?? ''
    const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { data: cfgRows } = await dbCfg.from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}
    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`
    const win = window.open('', '_blank', 'width=800,height=1050')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Personal Operativo — ${editEvt.folio}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; padding: 36px; color: #1e1e1e; background: #fff; font-size: 13px; }
.org-header { display:flex; align-items:center; gap:16px; padding-bottom:14px; border-bottom:2px solid #0D4F80; margin-bottom:22px; }
.org-nombre { font-size:18px; font-weight:700; color:#0D4F80; margin:0 0 2px; }
.org-sub { font-size:11px; color:#64748b; }
.doc-title { font-size:14px; font-weight:600; color:#0D4F80; margin-bottom:2px; }
.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; padding: 14px 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; }
.meta .f label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #16a34a; display: block; margin-bottom: 2px; }
.meta .f span { font-size: 12px; }
.notes-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px; }
.notes-box .lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #16a34a; margin-bottom: 6px; }
.notes-box p { font-size: 12px; color: #374151; white-space: pre-wrap; }
.sec-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #0D4F80; border-bottom: 2px solid #bfdbfe; padding-bottom: 4px; margin-bottom: 10px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { background: #eff6ff; padding: 7px 10px; text-align: left; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; color: #0D4F80; border-bottom: 2px solid #bfdbfe; }
td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
tr:last-child td { border-bottom: none; }
.tr-total { background: #eff6ff; font-weight: 700; }
.tr-total td { border-top: 2px solid #bfdbfe; font-weight: 700; }
.num { text-align: right; }
.firma { margin-top: 44px; display: flex; gap: 40px; }
.firma-line { flex: 1; border-top: 1px solid #ccc; padding-top: 8px; font-size: 10px; color: #888; text-align: center; }
@media print { body { padding: 20px; } }
</style></head><body>
<div class="org-header">
  ${logoHtml}
  <div>
    <div class="org-nombre">${orgNombre}</div>
    ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
  </div>
  <div style="margin-left:auto;text-align:right">
    <div class="doc-title">Personal Operativo</div>
    <div style="font-size:11px;color:#64748b">${editEvt.nombre} · ${editEvt.folio}</div>
  </div>
</div>
<div class="meta">
  <div class="f"><label>Evento</label><span>${editEvt.nombre}</span></div>
  <div class="f"><label>Folio</label><span>${editEvt.folio}</span></div>
  <div class="f"><label>Fecha de inicio</label><span>${fmtD(editEvt.fecha_inicio)}</span></div>
  ${lugar ? `<div class="f"><label>Lugar</label><span>${lugar}</span></div>` : ''}
  ${editEvt.responsable ? `<div class="f"><label>Responsable</label><span>${editEvt.responsable}</span></div>` : ''}
</div>
${form.justificacion_gasto_personal || form.notas_personal ? `
<div class="notes-box">
  ${form.justificacion_gasto_personal ? `<div class="lbl">Justificación de Gasto de Personal</div><p>${form.justificacion_gasto_personal}</p>` : ''}
  ${form.notas_personal ? `<div class="lbl" style="margin-top:${form.justificacion_gasto_personal ? '12px' : '0'}">Notas de Personal</div><p>${form.notas_personal}</p>` : ''}
</div>` : ''}
<div class="sec-title">Personal Asignado (${personal.length} empleado${personal.length !== 1 ? 's' : ''})</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Nombre del Empleado</th>
      <th>Día</th>
      <th>Turno</th>
      <th class="num">Compensación</th>
    </tr>
  </thead>
  <tbody>
    ${personal.map((p, i) => `
    <tr>
      <td style="color:#9ca3af;font-size:10px">${i + 1}</td>
      <td style="font-weight:600">${p.nombre_empleado}</td>
      <td>${fmtD(p.dia)}</td>
      <td>${p.turno ?? '—'}</td>
      <td class="num" style="font-weight:600;color:#16a34a">${'$' + (p.compensacion ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')}
    <tr class="tr-total">
      <td colspan="4" style="text-align:right;padding-right:10px;font-size:11px;color:#166534;letter-spacing:.05em">TOTAL COMPENSACIONES</td>
      <td class="num" style="color:#15803d;font-size:14px">${'$' + totalComp.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
    </tr>
  </tbody>
</table>
<div class="firma">
  <div class="firma-line">Elaboró</div>
  <div class="firma-line">Golf</div>
  <div class="firma-line">Vo. Bo. Dirección Operaciones</div>
</div>
</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  // ── Buscar OPs para vincular ───────────────────────────────
  const buscarOPs = async () => {
    if (!busqOP.trim()) return
    setLoadingOps(true)
    const term = busqOP.trim()
    // Busca por concepto OR por folio (ambos campos relevantes)
    const { data, error } = await dbComp.from('ordenes_pago')
      .select('id, folio, concepto, monto, saldo, status, id_proveedor_fk')
      .or(`concepto.ilike.%${term}%,folio.ilike.%${term}%`)
      .limit(20)
    if (error) console.error('Error buscando OPs:', error)
    setOpsComp((data as unknown as OP[]) ?? [])
    setLoadingOps(false)
  }

  const vincularOP = async (op: OP) => {
    if (!editEvt) return
    if (evtOps.find(e => e.id_op_fk === op.id)) return // ya vinculada
    await dbCtrl.from('eventos_ops').insert({ id_evento_fk: editEvt.id, id_op_fk: op.id })
    loadEventoDetalle(editEvt.id)
  }

  const desvincularOP = async (evtOpId: number) => {
    await dbCtrl.from('eventos_ops').delete().eq('id', evtOpId)
    if (editEvt) loadEventoDetalle(editEvt.id)
  }

  // ── Gastos manuales CRUD ───────────────────────────────────
  const saveGasto = async (isEdit: boolean) => {
    if (!editEvt) return
    if (!gastoForm.concepto.trim()) { setGastoErrMsg('Concepto requerido'); return }
    if (!gastoForm.monto || Number(gastoForm.monto) <= 0) { setGastoErrMsg('El monto debe ser mayor a 0'); return }
    setSavingGasto(true); setGastoErrMsg('')
    const payload = {
      id_evento_fk: editEvt.id,
      concepto:    gastoForm.concepto.trim(),
      proveedor:   gastoForm.proveedor || null,
      tipo_gasto:  gastoForm.tipo_gasto || null,
      monto:       Number(gastoForm.monto),
      fecha:       gastoForm.fecha || null,
      notas:       gastoForm.notas || null,
    }
    if (isEdit && gastoEdit) {
      const { error } = await dbCtrl.from('eventos_gastos').update(payload).eq('id', gastoEdit.id)
      if (error) { setGastoErrMsg(error.message); setSavingGasto(false); return }
    } else {
      const { error } = await dbCtrl.from('eventos_gastos').insert(payload)
      if (error) { setGastoErrMsg(error.message); setSavingGasto(false); return }
    }
    setSavingGasto(false)
    setModalGasto(false)
    setGastoEdit(null)
    setGastoForm({ concepto: '', proveedor: '', tipo_gasto: '', monto: '', fecha: '', notas: '' })
    loadGastos(editEvt.id)
  }

  const deleteGasto = async (id: number) => {
    if (!editEvt) return
    if (!confirm('¿Eliminar este gasto manual?')) return
    await dbCtrl.from('eventos_gastos').delete().eq('id', id)
    loadGastos(editEvt.id)
  }

  const buscarOPsParaGasto = async () => {
    if (!busqOPGasto.trim()) return
    setLoadingVinc(true)
    const term = busqOPGasto.trim()
    const { data, error } = await dbComp.from('ordenes_pago')
      .select('id, folio, concepto, monto, saldo, status, id_proveedor_fk')
      .or(`concepto.ilike.%${term}%,folio.ilike.%${term}%`)
      .limit(15)
    if (error) console.error('Error buscando OPs para gasto:', error)
    setOpsGasto((data as unknown as OP[]) ?? [])
    setLoadingVinc(false)
  }

  const vincularGastoAOP = async (gastoId: number, op: OP) => {
    if (!editEvt) return
    const { error } = await dbCtrl.from('eventos_gastos').update({ id_op_fk: op.id }).eq('id', gastoId)
    if (error) { console.error('Error vinculando gasto a OP:', error); return }
    setVincGastoId(null)
    setBusqOPGasto('')
    setOpsGasto([])
    loadGastos(editEvt.id)
  }

  const desvincularGastoDeOP = async (gastoId: number) => {
    if (!editEvt) return
    const { error } = await dbCtrl.from('eventos_gastos').update({ id_op_fk: null }).eq('id', gastoId)
    if (error) { console.error('Error desvinculando gasto de OP:', error); return }
    loadGastos(editEvt.id)
  }

  // ── Imprimir recibo de ingreso ─────────────────────────────
  const printRecibo = async (ing: Ingreso) => {
    const evtNombre = editEvt?.nombre ?? ''
    const lugar     = editEvt?.cat_lugares?.nombre ?? ''
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { data: cfgRows } = await dbCfg.from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}
    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`
    const win = window.open('', '_blank', 'width=700,height=900')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Recibo ${ing.folio}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e1e1e; background: #fff; }
  .org-header { display:flex; align-items:center; gap:16px; padding-bottom:14px; border-bottom:2px solid #0D4F80; margin-bottom:22px; }
  .org-nombre { font-size:18px; font-weight:700; color:#0D4F80; margin:0 0 2px; }
  .org-sub { font-size:11px; color:#64748b; }
  .doc-title { font-size:14px; font-weight:600; color:#0D4F80; margin-bottom:2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .field label { display: block; font-size: 10px; font-weight: 700; color: #16a34a; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 3px; }
  .field span { font-size: 14px; color: #1e1e1e; }
  .monto-box { background: #eff6ff; border: 2px solid #bfdbfe; border-radius: 10px; padding: 16px 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
  .monto-box .label { font-size: 12px; color: #0D4F80; font-weight: 600; }
  .monto-box .value { font-size: 28px; font-weight: 800; color: #0D4F80; }
  .firma { margin-top: 40px; display: flex; gap: 40px; }
  .firma-line { flex: 1; border-top: 1px solid #ccc; padding-top: 8px; font-size: 11px; color: #666; text-align: center; }
  @media print { body { padding: 20px; } }
</style></head><body>
<div class="org-header">
  ${logoHtml}
  <div>
    <div class="org-nombre">${orgNombre}</div>
    ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
  </div>
  <div style="margin-left:auto;text-align:right">
    <div class="doc-title">Recibo de Ingreso</div>
    <div style="font-size:11px;color:#64748b">${ing.folio}</div>
  </div>
</div>
<div class="grid">
  <div class="field"><label>Evento</label><span>${evtNombre}</span></div>
  <div class="field"><label>Lugar</label><span>${lugar || '—'}</span></div>
  <div class="field"><label>Descripción</label><span>${ing.descripcion}</span></div>
  <div class="field"><label>Fecha de pago</label><span>${fmtFecha(ing.fecha_pago)}</span></div>
  <div class="field"><label>Forma de pago</label><span>${ing.forma_pago}</span></div>
  <div class="field"><label>Referencia</label><span>${ing.referencia || '—'}</span></div>
</div>
<div class="monto-box">
  <div class="label">MONTO TOTAL</div>
  <div class="value">${fmt$(ing.monto)}</div>
</div>
${ing.notas ? `<p style="font-size:12px;color:#666;margin-bottom:20px;"><strong>Notas:</strong> ${ing.notas}</p>` : ''}
<div class="firma">
  <div class="firma-line">Recibió</div>
  <div class="firma-line">Responsable del Evento</div>
</div>
</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  // ── Filtrado local ─────────────────────────────────────────
  const eventosFiltrados = eventos.filter(e =>
    e.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    e.folio.toLowerCase().includes(busqueda.toLowerCase()) ||
    (e.cliente_nombre ?? '').toLowerCase().includes(busqueda.toLowerCase())
  ).sort(sortEventosDesc)

  // ── KPIs ───────────────────────────────────────────────────
  const totalEventos    = eventos.length
  const confirmados     = eventos.filter(e => e.status === 'Confirmado' || e.status === 'En curso').length
  const realizados      = eventos.filter(e => e.status === 'Realizado').length

  // ── Estilos helper para tabs Operación / Checklist ──────────
  const lblSt: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }
  const inpSt: React.CSSProperties = { fontSize: 13, width: '100%' }
  const taSt:  React.CSSProperties = { fontSize: 13, width: '100%', resize: 'vertical' as const }
  const chkBadge = (checked: boolean, color: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer',
    padding: '5px 12px', border: '1px solid', borderColor: checked ? color : '#e2e8f0',
    borderRadius: 8, background: checked ? color + '15' : '#fff',
    color: checked ? color : '#475569', fontWeight: checked ? 600 : 400, userSelect: 'none',
  })

  // ── Imprimir Ficha Maestra ─────────────────────────────────
  const printFichaMaestra = async () => {
    if (!viewEvt) return
    const totalIng    = viewIng.reduce((s, i) => s + (i.monto ?? 0), 0)
    const totalGastos = viewOps.reduce((s, o) => s + (o.monto ?? 0), 0)
    const utilidad    = totalIng - totalGastos
    const tipo        = viewEvt.cat_tipos_evento
    const fmtD = (s?: string | null) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '—'
    const v    = (x: string | number | null | undefined) => x ?? '—'
    const yn   = (x: boolean | null | undefined) => x ? '✓ Sí' : '✗ No'
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { data: cfgRows } = await dbCfg.from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}
    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`

    const montItems: [string, boolean | undefined][] = [
      ['Carpas', viewEvt.montaje_carpas], ['Escenario', viewEvt.montaje_escenario],
      ['Pista de baile', viewEvt.montaje_pista_baile], ['Mesas y sillas', viewEvt.montaje_mesas_sillas],
      ['Iluminación', viewEvt.montaje_iluminacion], ['Audio', viewEvt.montaje_audio],
      ['Pantallas', viewEvt.montaje_pantallas], ['Generador', viewEvt.montaje_generador],
    ]
    const chkItems: [string, boolean | undefined][] = [
      ['Contrato firmado', viewChecklist.chk_contrato_firmado],
      ['Pago de anticipo recibido', viewChecklist.chk_anticipo_pagado],
      ['Layout autorizado', viewChecklist.chk_layout_autorizado],
      ['Montaje concluido', viewChecklist.chk_montaje_concluido],
      ['Revisión final operativa', viewChecklist.chk_revision_final],
    ]
    const win = window.open('', '_blank', 'width=900,height=1150')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Ficha Maestra — ${viewEvt.folio}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e1e1e; background: #fff; padding: 32px; }
.org-header { display:flex; align-items:center; gap:16px; padding-bottom:14px; border-bottom:2px solid #0D4F80; margin-bottom:22px; }
.org-nombre { font-size:18px; font-weight:700; color:#0D4F80; margin:0 0 2px; }
.org-sub { font-size:11px; color:#64748b; }
.doc-title { font-size:14px; font-weight:600; color:#0D4F80; margin-bottom:2px; }
.sec { margin-bottom: 18px; page-break-inside: avoid; }
.sec-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #0D4F80; border-bottom: 2px solid #bfdbfe; padding-bottom: 4px; margin-bottom: 10px; }
.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.f label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #16a34a; display: block; margin-bottom: 2px; }
.f span { font-size: 12px; }
.full { grid-column: 1 / -1; }
.badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.badge { font-size: 10px; padding: 3px 10px; border-radius: 10px; font-weight: 600; }
.by { background:#ecfdf5; color:#15803d; border:1px solid #bbf7d0; }
.bn { background:#f9fafb; color:#94a3b8; border:1px solid #e2e8f0; }
.chk { display:flex; align-items:center; gap:8px; padding:7px 10px; border-radius:6px; margin-bottom:4px; font-size:12px; }
.chk.done { background:#f0fdf4; border:1px solid #bbf7d0; }
.chk.pend { background:#f9fafb; border:1px solid #e2e8f0; color:#94a3b8; }
.kpis { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:14px; }
.kpi { padding:11px 14px; border-radius:8px; }
.kpi .lbl { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:3px; }
.kpi .val { font-size:18px; font-weight:800; }
.tw { border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; margin-top:10px; }
table { width:100%; border-collapse:collapse; font-size:11px; }
th { background:#f8fafc; padding:6px 10px; text-align:left; font-weight:700; font-size:9px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; }
td { padding:5px 10px; border-top:1px solid #f1f5f9; }
.sig td { height:52px; vertical-align:top; padding:5px 10px; color:#bbb; font-size:10px; }
@media print { body { padding: 16px; } .sec { page-break-inside: avoid; } }
</style></head><body>
<div class="org-header">
  ${logoHtml}
  <div>
    <div class="org-nombre">${orgNombre}</div>
    ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
  </div>
  <div style="margin-left:auto;text-align:right">
    <div class="doc-title">Ficha Maestra de Evento</div>
    <div style="font-size:11px;color:#64748b">${viewEvt.folio} · ${viewEvt.status}${tipo ? ' · ' + tipo.nombre : ''}</div>
  </div>
</div>

<div class="sec">
  <div class="sec-title">Información General del Evento</div>
  <div class="g2">
    <div class="f full"><label>Nombre Oficial del Evento</label><span>${v(viewEvt.nombre)}</span></div>
    <div class="f"><label>Tipo de Evento</label><span>${tipo?.nombre ?? '—'}</span></div>
    <div class="f"><label>Lugar / Salón</label><span>${viewEvt.cat_lugares?.nombre ?? '—'}</span></div>
    <div class="f"><label>Fecha</label><span>${fmtD(viewEvt.fecha_inicio)}${viewEvt.fecha_fin && viewEvt.fecha_fin !== viewEvt.fecha_inicio ? ' → ' + fmtD(viewEvt.fecha_fin) : ''}</span></div>
    <div class="f"><label>Horario</label><span>${v(viewEvt.hora_inicio)}${viewEvt.hora_fin ? ' – ' + viewEvt.hora_fin : ''}</span></div>
    <div class="f"><label>N° Estimado de Asistentes</label><span>${v(viewEvt.num_asistentes)}</span></div>
    <div class="f"><label>Precio Pactado</label><span>${viewEvt.precio_pactado != null ? fmt$(viewEvt.precio_pactado) : '—'}</span></div>
    <div class="f"><label>Cliente / Contratante</label><span>${v(viewEvt.cliente_nombre)}</span></div>
    <div class="f"><label>Contacto</label><span>${[viewEvt.cliente_telefono, viewEvt.cliente_email].filter(Boolean).join(' · ') || '—'}</span></div>
    <div class="f"><label>Responsable Operativo</label><span>${v(viewEvt.responsable)}</span></div>
    <div class="f"><label>Folio / Status</label><span>${viewEvt.folio} — ${viewEvt.status}</span></div>
  </div>
</div>
${viewEvt.objetivo || viewEvt.riesgos_operativos ? `
<div class="sec">
  <div class="sec-title">Resumen Ejecutivo Operativo</div>
  <div class="g2">
    ${viewEvt.objetivo ? `<div class="f full"><label>Objetivo del Evento</label><span>${viewEvt.objetivo}</span></div>` : ''}
    ${viewEvt.riesgos_operativos ? `<div class="f full"><label>Riesgos Operativos</label><span>${viewEvt.riesgos_operativos}</span></div>` : ''}
  </div>
</div>` : ''}
<div class="sec">
  <div class="sec-title">Infraestructura y Montajes</div>
  <div class="badges">${montItems.map(([l, val]) => `<span class="badge ${val ? 'by' : 'bn'}">${val ? '✓' : '–'} ${l}</span>`).join('')}</div>
  ${viewEvt.montaje_notas ? `<div class="f" style="margin-top:8px"><label>Notas de montaje</label><span>${viewEvt.montaje_notas}</span></div>` : ''}
</div>
<div class="sec">
  <div class="sec-title">Seguridad y Control Operativo</div>
  <div class="g2">
    ${viewEvt.seg_guardias ? `<div class="f"><label>Guardias intramuros</label><span>${viewEvt.seg_guardias}</span></div>` : ''}
    ${viewEvt.seg_control_accesos ? `<div class="f"><label>Control de accesos</label><span>${viewEvt.seg_control_accesos}</span></div>` : ''}
  </div>
  <div class="badges">
    <span class="badge ${viewEvt.seg_paramedicos ? 'by' : 'bn'}">${yn(viewEvt.seg_paramedicos)} Paramédicos</span>
    <span class="badge ${viewEvt.seg_ambulancia ? 'by' : 'bn'}">${yn(viewEvt.seg_ambulancia)} Ambulancia</span>
    <span class="badge ${viewEvt.seg_valet_parking ? 'by' : 'bn'}">${yn(viewEvt.seg_valet_parking)} Valet Parking</span>
  </div>
</div>
${viewEvt.ayb_banquetero || viewEvt.ayb_tipo_servicio || viewEvt.ayb_num_comensales ? `
<div class="sec">
  <div class="sec-title">Alimentos y Bebidas</div>
  <div class="g2">
    ${viewEvt.ayb_banquetero ? `<div class="f"><label>Banquetero</label><span>${viewEvt.ayb_banquetero}</span></div>` : ''}
    ${viewEvt.ayb_tipo_servicio ? `<div class="f"><label>Tipo de servicio</label><span>${viewEvt.ayb_tipo_servicio}</span></div>` : ''}
    ${viewEvt.ayb_num_comensales ? `<div class="f"><label>N° de comensales</label><span>${viewEvt.ayb_num_comensales}</span></div>` : ''}
  </div>
  <div class="badges">
    <span class="badge ${viewEvt.ayb_barra_libre ? 'by' : 'bn'}">${yn(viewEvt.ayb_barra_libre)} Barra libre</span>
    <span class="badge ${viewEvt.ayb_permisos_sanitarios ? 'by' : 'bn'}">${yn(viewEvt.ayb_permisos_sanitarios)} Permisos sanitarios</span>
  </div>
</div>` : ''}
${viewEvt.golf_tipo_torneo || viewEvt.golf_num_jugadores ? `
<div class="sec">
  <div class="sec-title">Eventos de Golf</div>
  <div class="g2">
    ${viewEvt.golf_tipo_torneo ? `<div class="f"><label>Tipo de torneo</label><span>${viewEvt.golf_tipo_torneo}</span></div>` : ''}
    ${viewEvt.golf_num_jugadores ? `<div class="f"><label>N° de jugadores</label><span>${viewEvt.golf_num_jugadores}</span></div>` : ''}
    ${viewEvt.golf_tee_times ? `<div class="f"><label>Tee times</label><span>${viewEvt.golf_tee_times}</span></div>` : ''}
    ${viewEvt.golf_caddies ? `<div class="f"><label>Caddies requeridos</label><span>${viewEvt.golf_caddies}</span></div>` : ''}
    ${viewEvt.golf_carritos ? `<div class="f"><label>Carritos requeridos</label><span>${viewEvt.golf_carritos}</span></div>` : ''}
  </div>
</div>` : ''}
${viewEvt.hip_tipo_evento || viewEvt.hip_num_caballos ? `
<div class="sec">
  <div class="sec-title">Eventos Ecuestres</div>
  <div class="g2">
    ${viewEvt.hip_tipo_evento ? `<div class="f"><label>Tipo de evento ecuestre</label><span>${viewEvt.hip_tipo_evento}</span></div>` : ''}
    ${viewEvt.hip_num_caballos ? `<div class="f"><label>N° de caballos</label><span>${viewEvt.hip_num_caballos}</span></div>` : ''}
    ${viewEvt.hip_caballerizas ? `<div class="f"><label>Caballerizas</label><span>${viewEvt.hip_caballerizas}</span></div>` : ''}
    ${viewEvt.hip_veterinario ? `<div class="f"><label>Veterinario</label><span>${viewEvt.hip_veterinario}</span></div>` : ''}
    ${viewEvt.hip_trailers ? `<div class="f"><label>Área de trailers</label><span>${viewEvt.hip_trailers}</span></div>` : ''}
  </div>
</div>` : ''}
<div class="sec">
  <div class="sec-title">Checklist Operativo</div>
  ${chkItems.map(([l, val]) => `<div class="chk ${val ? 'done' : 'pend'}"><span style="font-size:14px">${val ? '☑' : '☐'}</span><span>${l}</span>${val ? '<span style="margin-left:auto;font-size:10px;color:#166534;font-weight:700">Completado</span>' : ''}</div>`).join('')}
</div>
<div class="sec">
  <div class="sec-title">Información Financiera</div>
  <div class="kpis">
    <div class="kpi" style="background:#f0fdf4"><div class="lbl" style="color:#166534">Total Ingresos</div><div class="val" style="color:#16a34a">$${totalIng.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div><div style="font-size:10px;color:#64748b">${viewIng.length} pago(s)</div></div>
    <div class="kpi" style="background:#fef2f2"><div class="lbl" style="color:#991b1b">Total Gastos</div><div class="val" style="color:#dc2626">$${totalGastos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div><div style="font-size:10px;color:#64748b">${viewOps.length} OP(s)</div></div>
    <div class="kpi" style="background:${utilidad >= 0 ? '#eff6ff' : '#fef2f2'}"><div class="lbl" style="color:${utilidad >= 0 ? '#1e40af' : '#991b1b'}">Utilidad</div><div class="val" style="color:${utilidad >= 0 ? '#2563eb' : '#dc2626'}">$${utilidad.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div></div>
  </div>
  ${viewIng.length > 0 ? `<div class="tw"><table><thead><tr><th>Folio</th><th>Descripción</th><th>Forma de pago</th><th>Fecha</th><th style="text-align:right">Monto</th></tr></thead><tbody>${viewIng.map(i => `<tr><td style="font-family:monospace;color:#166534">${i.folio}</td><td>${i.descripcion}</td><td>${i.forma_pago}</td><td>${new Date(i.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX')}</td><td style="text-align:right;font-weight:600">$${i.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td></tr>`).join('')}</tbody></table></div>` : ''}
  ${viewOps.length > 0 ? `<div class="tw" style="margin-top:8px"><table><thead><tr><th>Folio</th><th>Concepto</th><th>Proveedor</th><th>Status</th><th style="text-align:right">Monto</th><th style="text-align:right">Saldo</th></tr></thead><tbody>${viewOps.map(o => `<tr><td style="font-family:monospace;color:#16a34a">${o.folio}</td><td>${o.concepto}</td><td>${o.id_proveedor_fk ? (provMap[o.id_proveedor_fk] ?? '—') : '—'}</td><td>${o.status}</td><td style="text-align:right;font-weight:600">$${(o.monto ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td><td style="text-align:right;color:${(o.saldo ?? 0) > 0 ? '#dc2626' : '#16a34a'}">$${(o.saldo ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td></tr>`).join('')}</tbody></table></div>` : ''}
</div>
${viewEvt.post_incidencias || viewEvt.post_evaluacion || viewEvt.post_conclusion ? `
<div class="sec">
  <div class="sec-title">Reporte Posterior al Evento</div>
  <div class="g2">
    ${viewEvt.post_incidencias ? `<div class="f full"><label>Incidencias Operativas</label><span>${viewEvt.post_incidencias}</span></div>` : ''}
    ${viewEvt.post_danos ? `<div class="f full"><label>Daños o Afectaciones</label><span>${viewEvt.post_danos}</span></div>` : ''}
    ${viewEvt.post_evaluacion ? `<div class="f"><label>Evaluación Operativa</label><span>${viewEvt.post_evaluacion}</span></div>` : ''}
    ${viewEvt.post_conclusion ? `<div class="f full"><label>Conclusión Operativa</label><span>${viewEvt.post_conclusion}</span></div>` : ''}
  </div>
</div>` : ''}
${viewEvt.notas ? `<div class="sec"><div class="sec-title">Notas Generales</div><p style="font-size:12px;color:#475569">${viewEvt.notas}</p></div>` : ''}
<div class="sec">
  <div class="sec-title">Firmas de Responsabilidad</div>
  <div class="tw"><table class="sig"><thead><tr><th>Área</th><th style="width:200px">Nombre</th><th style="width:160px">Firma</th><th style="width:110px">Fecha</th></tr></thead><tbody>
    <tr><td>Cliente / Contratante</td><td></td><td></td><td></td></tr>
    <tr><td>Comercial</td><td></td><td></td><td></td></tr>
    <tr><td>Operaciones</td><td></td><td></td><td></td></tr>
    <tr><td>Dirección</td><td></td><td></td><td></td></tr>
  </tbody></table></div>
</div>
<div style="text-align:center;font-size:9px;color:#94a3b8;margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0">
  Generado: ${new Date().toLocaleString('es-MX')} · Club Balvanera · Sistema Domusone
</div>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 400)
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      {/* Back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <a href="/golf" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
          <ChevronLeft size={15} /> Golf
        </a>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Torneos</span>
      </div>

      {/* Título + botón nuevo */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>Torneos</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {eventosFiltrados.length} evento{eventosFiltrados.length !== 1 ? 's' : ''} en los filtros actuales
          </p>
        </div>
        <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flexShrink: 0 }}>
          <Plus size={14} /> Nuevo Evento
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total eventos', value: totalEventos, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Confirmados / En curso', value: confirmados, color: '#2563eb', bg: '#eff6ff' },
          { label: 'Realizados', value: realizados, color: '#16a34a', bg: '#f0fdf4' },
        ].map(k => (
          <div key={k.label} className="card" style={{ flex: '1 1 160px', padding: '12px 16px', minWidth: 140 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Barra de filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <input className="input" placeholder="Buscar por nombre, folio o cliente…"
          value={busqueda} onChange={e => setBusqueda(e.target.value)}
          style={{ flex: 1, fontSize: 13 }} />
        <select className="input" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ fontSize: 13, width: 180, flexShrink: 0 }}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</div>
      ) : eventosFiltrados.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Sin eventos registrados
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                {['Folio', 'Nombre', 'Tipo', 'Lugar', 'Fecha inicio', 'Cliente', 'Precio pactado', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventosFiltrados.map((ev, i) => {
                const sc = STATUS_COLORS[ev.status] ?? { bg: '#f8fafc', color: '#64748b' }
                const tipo = ev.cat_tipos_evento
                return (
                  <tr key={ev.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', fontSize: 11 }}>{ev.folio}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{ev.nombre}</td>
                    <td style={{ padding: '9px 12px' }}>
                      {tipo ? (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: tipo.color + '22', color: tipo.color }}>
                          {tipo.nombre}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={11} />{ev.cat_lugares?.nombre ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtFecha(ev.fecha_inicio)}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>{ev.cliente_nombre ?? '—'}</td>
                    <td style={{ padding: '9px 12px', color: ev.precio_pactado != null ? '#1d4ed8' : 'var(--text-muted)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
                      {ev.precio_pactado != null ? fmt$(ev.precio_pactado) : '—'}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{ev.status}</span>
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-ghost" onClick={() => openView(ev)} style={{ padding: '4px 8px', fontSize: 11, color: '#0f766e' }} title="Consultar">
                          <Eye size={12} />
                        </button>
                        <button className="btn-ghost" onClick={() => openEdit(ev)} style={{ padding: '4px 8px', fontSize: 11 }} title="Editar">
                          <Edit2 size={12} />
                        </button>
                        <button className="btn-ghost" onClick={() => deleteEvento(ev.id)} style={{ padding: '4px 8px', fontSize: 11, color: '#dc2626' }} title="Eliminar">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL ── */}
      {modal && (
        <ModalShell
          modulo="default"
          titulo={editEvt ? `${editEvt.folio} — ${editEvt.nombre}` : 'Nuevo Evento'}
          subtitulo={editEvt ? editEvt.status : 'Golf — Torneos'}
          icono={Flag}
          maxWidth={820}
          onClose={() => setModal(false)}
          tabs={[
            { key: 'info',      label: 'Información', icon: Flag },
            { key: 'operacion', label: 'Operación',   icon: Settings },
            { key: 'checklist', label: 'Checklist',   icon: ClipboardCheck },
            { key: 'ingresos',  label: 'Ingresos',    icon: DollarSign, badge: editEvt ? ingresos.length || undefined : undefined, disabled: !editEvt, disabledHint: 'Guarda el evento primero' },
            { key: 'gastos',    label: 'Gastos / OPs', icon: ShoppingBag, badge: editEvt ? ((gastos.length + ops.length) || undefined) : undefined,    disabled: !editEvt, disabledHint: 'Guarda el evento primero' },
            { key: 'personal',  label: 'Personal Op.', icon: Users, badge: editEvt ? personal.length || undefined : undefined,    disabled: !editEvt, disabledHint: 'Guarda el evento primero' },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          footer={(['info','operacion','checklist'] as string[]).includes(activeTab) ? (
            <>
              <button className="btn-ghost" onClick={() => setModal(false)} style={{ fontSize: 13 }}>Cancelar</button>
              <button className="btn-primary" onClick={saveEvento} disabled={saving} style={{ fontSize: 13 }}>
                {saving ? 'Guardando…' : editEvt ? 'Guardar cambios' : 'Crear evento'}
              </button>
            </>
          ) : activeTab === 'ingresos' ? (
            <>
              {editEvt && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Total ingresos: <strong style={{ color: '#16a34a' }}>{fmt$(ingresos.reduce((s, i) => s + i.monto, 0))}</strong>
                </div>
              )}
            </>
          ) : activeTab === 'gastos' ? (
            <>
              {editEvt && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16 }}>
                  <span>Gastos manuales: <strong style={{ color: '#d97706' }}>{fmt$(gastos.reduce((s, g) => s + g.monto, 0))}</strong></span>
                  <span>OPs vinculadas: <strong style={{ color: '#16a34a' }}>{fmt$(ops.reduce((s, o) => s + o.monto, 0))}</strong></span>
                  <span style={{ fontWeight: 700 }}>Total: <strong style={{ color: '#dc2626' }}>{fmt$(gastos.reduce((s, g) => s + g.monto, 0) + ops.reduce((s, o) => s + o.monto, 0))}</strong></span>
                </div>
              )}
            </>
          ) : activeTab === 'personal' ? (
            <>
              {editEvt && personal.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Total compensaciones: <strong style={{ color: '#16a34a' }}>{fmt$(personal.reduce((s, p) => s + (p.compensacion ?? 0), 0))}</strong>
                </div>
              )}
            </>
          ) : undefined}
        >
          {/* ── TAB INFO ── */}
          {activeTab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 12 }}>{err}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre del evento *</label>
                  <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo de evento</label>
                  <select className="input" value={form.id_tipo_evento_fk} onChange={e => setForm(f => ({ ...f, id_tipo_evento_fk: e.target.value ? Number(e.target.value) : '' }))} style={{ fontSize: 13, width: '100%' }}>
                    <option value="">— Seleccionar —</option>
                    {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Lugar / Salón</label>
                  <select className="input" value={form.id_lugar_fk} onChange={e => setForm(f => ({ ...f, id_lugar_fk: e.target.value ? Number(e.target.value) : '' }))} style={{ fontSize: 13, width: '100%' }}>
                    <option value="">— Seleccionar —</option>
                    {lugares.map(l => <option key={l.id} value={l.id}>{l.nombre}{l.capacidad ? ` (cap. ${l.capacidad})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha inicio *</label>
                  <input className="input" type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha fin</label>
                  <input className="input" type="date" value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hora inicio</label>
                  <input className="input" type="time" value={form.hora_inicio} onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Hora fin</label>
                  <input className="input" type="time" value={form.hora_fin} onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>N° de asistentes</label>
                  <input className="input" type="number" value={form.num_asistentes} onChange={e => setForm(f => ({ ...f, num_asistentes: e.target.value ? Number(e.target.value) : '' }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Precio pactado</label>
                  <input className="input" type="number" min="0" step="0.01" value={form.precio_pactado} onChange={e => setForm(f => ({ ...f, precio_pactado: e.target.value ? Number(e.target.value) : '' }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
                  <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ fontSize: 13, width: '100%' }}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Responsable interno</label>
                  <input className="input" value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                </div>
              </div>

              {/* Cliente */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Datos del cliente</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre</label>
                    <input className="input" value={form.cliente_nombre} onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Teléfono</label>
                    <input className="input" value={form.cliente_telefono} onChange={e => setForm(f => ({ ...f, cliente_telefono: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email</label>
                    <input className="input" type="email" value={form.cliente_email} onChange={e => setForm(f => ({ ...f, cliente_email: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                </div>
              </div>

              {/* Notas */}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
                <textarea className="input" value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={3} style={{ fontSize: 13, width: '100%', resize: 'vertical' }} />
              </div>
            </div>
          )}

          {/* ── TAB OPERACIÓN ── */}
          {activeTab === 'operacion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Golf — sección principal */}
              <FmSection title="Datos del Torneo de Golf" color="#16a34a">
                <FmGrid2>
                  <div>
                    <label style={lblSt}>Tipo de torneo</label>
                    <input className="input" value={form.golf_tipo_torneo} onChange={e => setForm(f => ({ ...f, golf_tipo_torneo: e.target.value }))} placeholder="Medal, Stableford, Texas, Scramble…" style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>N° de jugadores</label>
                    <input className="input" type="number" value={form.golf_num_jugadores} onChange={e => setForm(f => ({ ...f, golf_num_jugadores: e.target.value ? Number(e.target.value) : '' }))} style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Tee times</label>
                    <input className="input" value={form.golf_tee_times} onChange={e => setForm(f => ({ ...f, golf_tee_times: e.target.value }))} placeholder="Ej: 07:00 – 09:30" style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Caddies requeridos</label>
                    <input className="input" type="number" value={form.golf_caddies} onChange={e => setForm(f => ({ ...f, golf_caddies: e.target.value ? Number(e.target.value) : '' }))} style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Carritos requeridos</label>
                    <input className="input" type="number" value={form.golf_carritos} onChange={e => setForm(f => ({ ...f, golf_carritos: e.target.value ? Number(e.target.value) : '' }))} style={inpSt} />
                  </div>
                </FmGrid2>
              </FmSection>

              {/* Resumen Ejecutivo */}
              <FmSection title="Resumen Ejecutivo" color="#166534">
                <FmGrid2>
                  <FmFull label="Objetivo del evento">
                    <textarea className="input" value={form.objetivo} onChange={e => setForm(f => ({ ...f, objetivo: e.target.value }))} rows={2} style={taSt} placeholder="Describir el objetivo principal del evento…" />
                  </FmFull>
                  <FmFull label="Riesgos operativos">
                    <textarea className="input" value={form.riesgos_operativos} onChange={e => setForm(f => ({ ...f, riesgos_operativos: e.target.value }))} rows={2} style={taSt} placeholder="Posibles riesgos o contingencias…" />
                  </FmFull>
                </FmGrid2>
              </FmSection>

              {/* Infraestructura y Montajes */}
              <FmSection title="Infraestructura y Montajes" color="#0f766e">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {([
                    ['montaje_carpas','Carpas'], ['montaje_escenario','Escenario'],
                    ['montaje_pista_baile','Pista de baile'], ['montaje_mesas_sillas','Mesas y sillas'],
                    ['montaje_iluminacion','Iluminación'], ['montaje_audio','Audio'],
                    ['montaje_pantallas','Pantallas'], ['montaje_generador','Generador eléctrico'],
                  ] as [string, string][]).map(([k, label]) => (
                    <label key={k} style={chkBadge((form as any)[k], '#0f766e')}>
                      <input type="checkbox" checked={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} style={{ accentColor: '#0f766e' }} />
                      {label}
                    </label>
                  ))}
                </div>
                <div>
                  <label style={lblSt}>Notas de montaje</label>
                  <textarea className="input" value={form.montaje_notas} onChange={e => setForm(f => ({ ...f, montaje_notas: e.target.value }))} rows={2} style={taSt} />
                </div>
              </FmSection>

              {/* Seguridad */}
              <FmSection title="Seguridad y Control Operativo" color="#dc2626">
                <FmGrid2>
                  <div>
                    <label style={lblSt}>Guardias intramuros</label>
                    <input className="input" value={form.seg_guardias} onChange={e => setForm(f => ({ ...f, seg_guardias: e.target.value }))} placeholder="Ej: 4 guardias + supervisor" style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Control de accesos</label>
                    <input className="input" value={form.seg_control_accesos} onChange={e => setForm(f => ({ ...f, seg_control_accesos: e.target.value }))} placeholder="Ej: Lista + pulseras" style={inpSt} />
                  </div>
                </FmGrid2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {([['seg_paramedicos','Paramédicos'],['seg_ambulancia','Ambulancia'],['seg_valet_parking','Valet Parking']] as [string, string][]).map(([k, label]) => (
                    <label key={k} style={chkBadge((form as any)[k], '#dc2626')}>
                      <input type="checkbox" checked={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} style={{ accentColor: '#dc2626' }} />
                      {label}
                    </label>
                  ))}
                </div>
              </FmSection>

              {/* Alimentos y Bebidas */}
              <FmSection title="Alimentos y Bebidas" color="#d97706">
                <FmGrid2>
                  <div>
                    <label style={lblSt}>Banquetero / Proveedor</label>
                    <input className="input" value={form.ayb_banquetero} onChange={e => setForm(f => ({ ...f, ayb_banquetero: e.target.value }))} style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Tipo de servicio</label>
                    <select className="input" value={form.ayb_tipo_servicio} onChange={e => setForm(f => ({ ...f, ayb_tipo_servicio: e.target.value }))} style={inpSt}>
                      <option value="">— Seleccionar —</option>
                      {['Buffet','Servido','Cócktail','Estaciones','Desayuno','Brunch','Box lunch'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lblSt}>N° de comensales</label>
                    <input className="input" type="number" value={form.ayb_num_comensales} onChange={e => setForm(f => ({ ...f, ayb_num_comensales: e.target.value ? Number(e.target.value) : '' }))} style={inpSt} />
                  </div>
                </FmGrid2>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {([['ayb_barra_libre','Barra libre'],['ayb_permisos_sanitarios','Permisos sanitarios']] as [string, string][]).map(([k, label]) => (
                    <label key={k} style={chkBadge((form as any)[k], '#d97706')}>
                      <input type="checkbox" checked={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} style={{ accentColor: '#d97706' }} />
                      {label}
                    </label>
                  ))}
                </div>
              </FmSection>

              {/* Golf */}
              <FmSection title="Datos de Golf" color="#166534">
                <FmGrid2>
                  <div>
                    <label style={lblSt}>Tipo de torneo</label>
                    <input className="input" value={form.golf_tipo_torneo} onChange={e => setForm(f => ({ ...f, golf_tipo_torneo: e.target.value }))} placeholder="Medal, Stableford, Texas…" style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>N° de jugadores</label>
                    <input className="input" type="number" value={form.golf_num_jugadores} onChange={e => setForm(f => ({ ...f, golf_num_jugadores: e.target.value ? Number(e.target.value) : '' }))} style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Tee times</label>
                    <input className="input" value={form.golf_tee_times} onChange={e => setForm(f => ({ ...f, golf_tee_times: e.target.value }))} placeholder="Ej: 07:00 – 09:30" style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Caddies requeridos</label>
                    <input className="input" type="number" value={form.golf_caddies} onChange={e => setForm(f => ({ ...f, golf_caddies: e.target.value ? Number(e.target.value) : '' }))} style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Carritos requeridos</label>
                    <input className="input" type="number" value={form.golf_carritos} onChange={e => setForm(f => ({ ...f, golf_carritos: e.target.value ? Number(e.target.value) : '' }))} style={inpSt} />
                  </div>
                </FmGrid2>
              </FmSection>

              {/* Ecuestre */}
              <FmSection title="Datos Ecuestres" color="#92400e">
                <FmGrid2>
                  <div>
                    <label style={lblSt}>Tipo de evento ecuestre</label>
                    <input className="input" value={form.hip_tipo_evento} onChange={e => setForm(f => ({ ...f, hip_tipo_evento: e.target.value }))} placeholder="Concurso, Doma, Polo…" style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>N° de caballos</label>
                    <input className="input" type="number" value={form.hip_num_caballos} onChange={e => setForm(f => ({ ...f, hip_num_caballos: e.target.value ? Number(e.target.value) : '' }))} style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Caballerizas requeridas</label>
                    <input className="input" value={form.hip_caballerizas} onChange={e => setForm(f => ({ ...f, hip_caballerizas: e.target.value }))} style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Veterinario</label>
                    <input className="input" value={form.hip_veterinario} onChange={e => setForm(f => ({ ...f, hip_veterinario: e.target.value }))} style={inpSt} />
                  </div>
                  <div>
                    <label style={lblSt}>Área de trailers</label>
                    <input className="input" value={form.hip_trailers} onChange={e => setForm(f => ({ ...f, hip_trailers: e.target.value }))} style={inpSt} />
                  </div>
                </FmGrid2>
              </FmSection>

            </div>
          )}

          {/* ── TAB CHECKLIST ── */}
          {activeTab === 'checklist' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Checklist operativo */}
              <FmSection title="Checklist Operativo" color="#166534">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {CHECKLIST_ITEMS.map(([k, label]) => {
                    const hasFile = !!checklistFiles[k]
                    const busy = checklistLoading[k]
                    return (
                      <div key={k} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }}>
                        <label className="label">{label}</label>
                        <input
                          ref={el => { checklistInputRefs.current[k] = el }}
                          type="file"
                          accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
                          style={{ display: 'none' }}
                          disabled={!editEvt || busy || saving}
                          onChange={async e => {
                            const f = e.target.files?.[0]
                            if (f) await subirChecklist(k, f)
                            e.currentTarget.value = ''
                          }}
                        />
                        {hasFile ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <a
                              href={checklistFiles[k] ?? '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 12,
                                color: 'var(--blue)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '5px 10px',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: 6,
                                textDecoration: 'none',
                                flex: 1,
                                justifyContent: 'center',
                              }}
                            >
                              <ExternalLink size={11} /> Ver archivo
                            </a>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ padding: '5px 8px', color: '#dc2626' }}
                              onClick={() => borrarChecklist(k)}
                              disabled={busy || saving}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: 11, width: '100%' }}
                            onClick={() => checklistInputRefs.current[k]?.click()}
                            disabled={!editEvt || busy || saving}
                          >
                            {busy ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                            {busy ? 'Subiendo…' : 'Adjuntar PDF/JPG'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                  {!editEvt
                    ? 'Guarda primero el evento para habilitar la carga de PDF/JPG en el checklist.'
                    : `${CHECKLIST_ITEMS.filter(([k]) => !!checklistFiles[k]).length}/5 archivos cargados`}
                  {loadingChecklistFiles && editEvt && ' · Cargando adjuntos…'}
                </div>
              </FmSection>

              {/* Reporte Posterior */}
              <FmSection title="Reporte Posterior al Evento" color="#0f766e">
                <FmGrid2>
                  <FmFull label="Incidencias operativas">
                    <textarea className="input" value={form.post_incidencias} onChange={e => setForm(f => ({ ...f, post_incidencias: e.target.value }))} rows={3} style={taSt} placeholder="Describe incidencias ocurridas durante el evento…" />
                  </FmFull>
                  <FmFull label="Daños o afectaciones">
                    <textarea className="input" value={form.post_danos} onChange={e => setForm(f => ({ ...f, post_danos: e.target.value }))} rows={2} style={taSt} placeholder="Daños a instalaciones, equipos, etc.…" />
                  </FmFull>
                  <div>
                    <label style={lblSt}>Evaluación operativa</label>
                    <select className="input" value={form.post_evaluacion} onChange={e => setForm(f => ({ ...f, post_evaluacion: e.target.value }))} style={inpSt}>
                      <option value="">— Seleccionar —</option>
                      {['Excelente','Buena','Regular','Deficiente'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <FmFull label="Conclusión operativa">
                    <textarea className="input" value={form.post_conclusion} onChange={e => setForm(f => ({ ...f, post_conclusion: e.target.value }))} rows={3} style={taSt} placeholder="Resumen general y aprendizajes…" />
                  </FmFull>
                </FmGrid2>
              </FmSection>

            </div>
          )}

          {/* ── TAB INGRESOS ── */}
          {activeTab === 'ingresos' && editEvt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', color: '#dc2626', fontSize: 12 }}>{err}</div>}

              {/* Formulario nuevo ingreso */}
              <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Registrar ingreso</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 10 }}>
                  <input className="input" placeholder="Buscar venta POS por folio, día o cliente…"
                    value={busqVentaPOS} onChange={e => setBusqVentaPOS(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && buscarVentasPOS()} style={{ fontSize: 12, width: '100%' }} />
                  <button className="btn-primary" onClick={buscarVentasPOS} disabled={loadingVentasPOS} style={{ fontSize: 12, background: '#166534' }}>
                    {loadingVentasPOS ? '…' : 'Buscar POS'}
                  </button>
                </div>

                {ventasPOS.length > 0 && (
                  <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 10, background: '#fff' }}>
                    {ventasPOS.map(v => (
                      <button key={v.id}
                        onClick={() => seleccionarVentaPOS(v)}
                        style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', borderBottom: '1px solid #dcfce7', padding: '7px 10px', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#166534', fontFamily: 'monospace' }}>{fmtFolioVentaPos(v)}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>{fmt$(v.total)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {v.nombre_cliente} · {new Date(v.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {ingresoForm.id_venta_pos_fk && (
                  <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', border: '1px solid #ddd6fe', borderRadius: 8, background: '#f5f3ff' }}>
                    <div style={{ fontSize: 12, color: '#15803d' }}>
                      Venta POS asociada: <strong>#{String(ingresoForm.id_venta_pos_fk).padStart(6, '0')}</strong>
                    </div>
                    <button className="btn-ghost" onClick={() => setIngresoForm(f => ({ ...f, id_venta_pos_fk: null }))} style={{ fontSize: 11, color: '#15803d', padding: '2px 6px' }}>
                      Quitar
                    </button>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Descripción *</label>
                    <input className="input" value={ingresoForm.descripcion} onChange={e => setIngresoForm(f => ({ ...f, descripcion: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Monto *</label>
                    <input className="input" type="number" value={ingresoForm.monto} onChange={e => setIngresoForm(f => ({ ...f, monto: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Fecha de pago</label>
                    <input className="input" type="date" value={ingresoForm.fecha_pago} onChange={e => setIngresoForm(f => ({ ...f, fecha_pago: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Forma de pago</label>
                    <select className="input" value={ingresoForm.forma_pago} onChange={e => setIngresoForm(f => ({ ...f, forma_pago: e.target.value }))} style={{ fontSize: 13, width: '100%' }}>
                      {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Referencia</label>
                    <input className="input" value={ingresoForm.referencia} onChange={e => setIngresoForm(f => ({ ...f, referencia: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Notas</label>
                    <input className="input" value={ingresoForm.notas} onChange={e => setIngresoForm(f => ({ ...f, notas: e.target.value }))} style={{ fontSize: 13, width: '100%' }} />
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary" onClick={saveIngreso} disabled={savingIngreso} style={{ fontSize: 12, background: '#16a34a' }}>
                    {savingIngreso ? 'Guardando…' : '+ Registrar ingreso'}
                  </button>
                </div>
              </div>

              {/* Lista de ingresos */}
              {ingresos.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Sin ingresos registrados</div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                        {['Folio', 'Venta POS', 'Descripción', 'Fecha', 'Forma', 'Referencia', 'Monto', ''].map(h => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ingresos.map((ing, i) => (
                        <tr key={ing.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', fontSize: 10 }}>{ing.folio}</td>
                          <td style={{ padding: '8px 10px', color: '#15803d', fontSize: 11, fontFamily: ing.id_venta_pos_fk ? 'monospace' : 'inherit' }}>
                            {ing.id_venta_pos_fk
                              ? (ventaPosMap[ing.id_venta_pos_fk] ? fmtFolioVentaPos(ventaPosMap[ing.id_venta_pos_fk]) : `#${String(ing.id_venta_pos_fk).padStart(6, '0')}`)
                              : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>{ing.descripcion}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(ing.fecha_pago)}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{ing.forma_pago}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{ing.referencia ?? '—'}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a' }}>{fmt$(ing.monto)}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn-ghost" onClick={() => printRecibo(ing)} style={{ padding: '3px 6px', fontSize: 10 }} title="Imprimir recibo">
                                <Printer size={11} />
                              </button>
                              <button className="btn-ghost" onClick={() => deleteIngreso(ing.id)} style={{ padding: '3px 6px', fontSize: 10, color: '#dc2626' }}>
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                        <td colSpan={6} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a' }}>{fmt$(ingresos.reduce((s, i) => s + i.monto, 0))}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── TAB GASTOS / OPs ── */}
          {activeTab === 'gastos' && editEvt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* ══ Sección 1: Gastos Manuales ══ */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                    Gastos Manuales ({gastos.length})
                  </div>
                  {!modalGasto && (
                    <button className="btn-ghost" onClick={() => {
                      setGastoEdit(null)
                      setGastoForm({ concepto: '', proveedor: '', tipo_gasto: '', monto: '', fecha: editEvt.fecha_inicio, notas: '' })
                      setGastoErrMsg('')
                      setModalGasto(true)
                    }} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: '#d97706', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 10px' }}>
                      <Plus size={13} /> Agregar Gasto
                    </button>
                  )}
                </div>

                {/* Inline form */}
                {modalGasto && (
                  <div className="card" style={{ background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 10 }}>
                      {gastoEdit ? 'Editar Gasto Manual' : 'Nuevo Gasto Manual'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Concepto *</label>
                        <input className="input" style={{ fontSize: 13, width: '100%' }}
                          value={gastoForm.concepto}
                          onChange={e => setGastoForm(f => ({ ...f, concepto: e.target.value }))}
                          placeholder="Descripción del gasto…"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Proveedor / Empresa</label>
                        <input className="input" style={{ fontSize: 13, width: '100%' }}
                          value={gastoForm.proveedor}
                          onChange={e => setGastoForm(f => ({ ...f, proveedor: e.target.value }))}
                          placeholder="Nombre del proveedor…"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo de Gasto</label>
                        <select className="input" style={{ fontSize: 13, width: '100%' }}
                          value={gastoForm.tipo_gasto}
                          onChange={e => setGastoForm(f => ({ ...f, tipo_gasto: e.target.value }))}>
                          <option value="">— Seleccionar —</option>
                          {TIPOS_GASTO_EVT.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Monto ($) *</label>
                        <input className="input" type="number" min="0.01" step="0.01" style={{ fontSize: 13, width: '100%' }}
                          value={gastoForm.monto}
                          onChange={e => setGastoForm(f => ({ ...f, monto: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha</label>
                        <input className="input" type="date" style={{ fontSize: 13, width: '100%' }}
                          value={gastoForm.fecha}
                          onChange={e => setGastoForm(f => ({ ...f, fecha: e.target.value }))}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
                        <textarea className="input" rows={2} style={{ fontSize: 13, width: '100%', resize: 'vertical' as const }}
                          value={gastoForm.notas}
                          onChange={e => setGastoForm(f => ({ ...f, notas: e.target.value }))}
                          placeholder="Observaciones adicionales…"
                        />
                      </div>
                    </div>
                    {gastoErrMsg && (
                      <div style={{ marginBottom: 8, fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '6px 10px', borderRadius: 6 }}>{gastoErrMsg}</div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button className="btn-ghost" onClick={() => { setModalGasto(false); setGastoEdit(null); setGastoErrMsg('') }} style={{ fontSize: 12 }}>Cancelar</button>
                      <button className="btn-primary" onClick={() => saveGasto(!!gastoEdit)} disabled={savingGasto}
                        style={{ fontSize: 12, background: '#d97706' }}>
                        {savingGasto ? 'Guardando…' : gastoEdit ? 'Guardar cambios' : '+ Agregar gasto'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Lista de gastos manuales */}
                {gastos.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>Sin gastos manuales registrados</div>
                ) : (
                  <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                          {['Concepto', 'Proveedor', 'Tipo', 'Fecha', 'Monto', 'OP vinculada', ''].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gastos.map((g, i) => (
                          <>
                            <tr key={g.id} style={{ borderBottom: vincGastoId === g.id ? 'none' : '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {g.concepto}
                                {g.notas && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{g.notas}</div>}
                              </td>
                              <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{g.proveedor ?? '—'}</td>
                              <td style={{ padding: '8px 10px' }}>
                                {g.tipo_gasto
                                  ? <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#fffbeb', color: '#d97706', fontWeight: 600, border: '1px solid #fde68a' }}>{g.tipo_gasto}</span>
                                  : <span style={{ color: 'var(--text-muted)' }}>—</span>
                                }
                              </td>
                              <td style={{ padding: '8px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' as const }}>
                                {g.fecha ? fmtFecha(g.fecha) : '—'}
                              </td>
                              <td style={{ padding: '8px 10px', fontWeight: 700, color: '#d97706', whiteSpace: 'nowrap' as const }}>{fmt$(g.monto)}</td>
                              <td style={{ padding: '8px 10px' }}>
                                {g.id_op_fk ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: 6 }}>
                                      {gastoOpMap[g.id_op_fk]?.folio ?? `OP #${g.id_op_fk}`}
                                    </span>
                                    <button className="btn-ghost" onClick={() => desvincularGastoDeOP(g.id)}
                                      style={{ padding: '2px 4px', fontSize: 10, color: '#dc2626' }} title="Desvincular OP">
                                      <X size={10} />
                                    </button>
                                  </div>
                                ) : (
                                  <button className="btn-ghost" onClick={() => {
                                    setVincGastoId(vincGastoId === g.id ? null : g.id)
                                    setBusqOPGasto('')
                                    setOpsGasto([])
                                  }} style={{ fontSize: 10, color: '#2563eb', padding: '2px 6px', border: '1px solid #bfdbfe', borderRadius: 5 }}>
                                    + Vincular OP
                                  </button>
                                )}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ display: 'flex', gap: 3 }}>
                                  <button className="btn-ghost" onClick={() => {
                                    setGastoEdit(g)
                                    setGastoForm({ concepto: g.concepto, proveedor: g.proveedor ?? '', tipo_gasto: g.tipo_gasto ?? '', monto: String(g.monto), fecha: g.fecha ?? '', notas: g.notas ?? '' })
                                    setGastoErrMsg('')
                                    setModalGasto(true)
                                  }} style={{ padding: '3px 5px', fontSize: 10 }} title="Editar">
                                    <Edit2 size={11} />
                                  </button>
                                  <button className="btn-ghost" onClick={() => deleteGasto(g.id)} style={{ padding: '3px 5px', fontSize: 10, color: '#dc2626' }} title="Eliminar">
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {vincGastoId === g.id && (
                              <tr key={`vinc-${g.id}`} style={{ borderBottom: '1px solid var(--border)', background: '#eff6ff' }}>
                                <td colSpan={7} style={{ padding: '8px 12px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>Vincular OP a: {g.concepto}</div>
                                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                    <input className="input" placeholder="Buscar OP por concepto o folio…"
                                      value={busqOPGasto}
                                      onChange={e => setBusqOPGasto(e.target.value)}
                                      onKeyDown={e => e.key === 'Enter' && buscarOPsParaGasto()}
                                      style={{ flex: 1, fontSize: 12 }} />
                                    <button className="btn-primary" onClick={buscarOPsParaGasto} disabled={loadingVinc}
                                      style={{ fontSize: 12, background: '#2563eb', padding: '4px 12px' }}>
                                      {loadingVinc ? '…' : 'Buscar'}
                                    </button>
                                    <button className="btn-ghost" onClick={() => { setVincGastoId(null); setOpsGasto([]) }}
                                      style={{ fontSize: 12, padding: '4px 8px' }}>✕</button>
                                  </div>
                                  {opsGasto.length > 0 && (
                                    <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid #bfdbfe', borderRadius: 6, background: '#fff' }}>
                                      {opsGasto.map(op => (
                                        <div key={op.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderBottom: '1px solid #e0f2fe', fontSize: 12 }}>
                                          <div>
                                            <span style={{ fontWeight: 700, color: '#16a34a', marginRight: 6, fontFamily: 'monospace' }}>{op.folio}</span>
                                            <span style={{ color: 'var(--text-primary)' }}>{op.concepto}</span>
                                            {op.id_proveedor_fk && provMap[op.id_proveedor_fk] && (
                                              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{provMap[op.id_proveedor_fk]}</span>
                                            )}
                                          </div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontWeight: 700 }}>{fmt$(op.monto)}</span>
                                            <button className="btn-primary" onClick={() => vincularGastoAOP(g.id, op)}
                                              style={{ fontSize: 11, padding: '3px 8px', background: '#2563eb' }}>Vincular</button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                          <td colSpan={4} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL GASTOS MANUALES</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#d97706' }}>{fmt$(gastos.reduce((s, g) => s + g.monto, 0))}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ══ Separador ══ */}
              <div style={{ borderTop: '1px solid var(--border)' }} />

              {/* ══ Sección 2: OPs del sistema ══ */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 10 }}>
                  OPs del sistema
                </div>

                {/* Buscador de OPs */}
                <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', marginBottom: 8 }}>Vincular Orden de Pago existente</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input className="input" placeholder="Buscar por concepto o folio…" value={busqOP} onChange={e => setBusqOP(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && buscarOPs()} style={{ flex: 1, fontSize: 12 }} />
                    <button className="btn-primary" onClick={buscarOPs} disabled={loadingOps} style={{ fontSize: 12, background: '#16a34a' }}>
                      {loadingOps ? '…' : 'Buscar'}
                    </button>
                  </div>
                  {opsComp.length > 0 && (
                    <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                      {opsComp.map(op => {
                        const yaVinculada = evtOps.some(e => e.id_op_fk === op.id)
                        return (
                          <div key={op.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                            <div>
                              <span style={{ fontWeight: 700, color: '#16a34a', marginRight: 8, fontFamily: 'monospace' }}>{op.folio}</span>
                              <span style={{ color: 'var(--text-primary)' }}>{op.concepto}</span>
                              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? '') : ''}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 700 }}>{fmt$(op.monto)}</span>
                              {yaVinculada ? (
                                <span style={{ fontSize: 10, color: '#16a34a' }}>✓ Vinculada</span>
                              ) : (
                                <button className="btn-primary" onClick={() => vincularOP(op)} style={{ fontSize: 11, padding: '3px 8px', background: '#16a34a' }}>Vincular</button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* OPs vinculadas */}
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>OPs vinculadas ({ops.length})</div>
                {ops.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>Sin OPs vinculadas</div>
                ) : (
                  <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                          {['Folio', 'Concepto', 'Proveedor', 'Monto', 'Saldo', 'Status', ''].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ops.map((op, i) => {
                          const eop = evtOps.find(e => e.id_op_fk === op.id)
                          return (
                            <tr key={op.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', fontSize: 10 }}>{op.folio}</td>
                              <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>{op.concepto}</td>
                              <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? `#${op.id_proveedor_fk}`) : '—'}</td>
                              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt$(op.monto)}</td>
                              <td style={{ padding: '8px 10px', color: (op.saldo ?? 0) > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{fmt$(op.saldo ?? 0)}</td>
                              <td style={{ padding: '8px 10px' }}>
                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#f8fafc', color: '#64748b', fontWeight: 600 }}>{op.status}</span>
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {eop && (
                                  <button className="btn-ghost" onClick={() => desvincularOP(eop.id)} style={{ padding: '3px 6px', fontSize: 10, color: '#dc2626' }} title="Desvincular">
                                    <X size={11} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                          <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL OPs</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>{fmt$(ops.reduce((s, o) => s + o.monto, 0))}</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#dc2626' }}>{fmt$(ops.reduce((s, o) => s + (o.saldo ?? 0), 0))}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB PERSONAL OPERATIVO ── */}
          {activeTab === 'personal' && editEvt && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Justificación y notas */}
              <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Justificación y Notas de Personal</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Justificación de Gasto de Personal Operativo</label>
                    <textarea className="input" rows={3} style={{ fontSize: 13, width: '100%', resize: 'vertical' }}
                      value={form.justificacion_gasto_personal ?? ''}
                      onChange={e => setForm(f => ({ ...f, justificacion_gasto_personal: e.target.value }))}
                      placeholder="Describir la justificación del gasto de personal para este evento…"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas de Personal</label>
                    <textarea className="input" rows={2} style={{ fontSize: 13, width: '100%', resize: 'vertical' }}
                      value={form.notas_personal ?? ''}
                      onChange={e => setForm(f => ({ ...f, notas_personal: e.target.value }))}
                      placeholder="Notas adicionales sobre el personal asignado…"
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-primary" onClick={saveEvento} disabled={saving} style={{ fontSize: 12, background: '#16a34a' }}>
                      {saving ? 'Guardando…' : 'Guardar notas'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Formulario para agregar empleado */}
              <div className="card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Agregar Empleado</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre del Empleado *</label>
                    <input className="input" style={{ fontSize: 13, width: '100%' }}
                      value={personalForm.nombre_empleado}
                      onChange={e => setPersonalForm(f => ({ ...f, nombre_empleado: e.target.value }))}
                      placeholder="Nombre completo…"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Día *</label>
                    <input className="input" type="date" style={{ fontSize: 13, width: '100%' }}
                      value={personalForm.dia}
                      onChange={e => setPersonalForm(f => ({ ...f, dia: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Turno</label>
                    <input className="input" style={{ fontSize: 13, width: '100%' }}
                      value={personalForm.turno}
                      onChange={e => setPersonalForm(f => ({ ...f, turno: e.target.value }))}
                      placeholder="ej. 8:00 a 18:00"
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Compensación ($)</label>
                    <input className="input" type="number" min="0" step="0.01" style={{ fontSize: 13, width: '100%' }}
                      value={personalForm.compensacion}
                      onChange={e => setPersonalForm(f => ({ ...f, compensacion: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary" onClick={savePersonal} disabled={savingPersonal} style={{ fontSize: 12, background: '#16a34a' }}>
                    {savingPersonal ? 'Guardando…' : '+ Agregar'}
                  </button>
                </div>
                {err && <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '6px 10px', borderRadius: 6 }}>{err}</div>}
              </div>

              {/* Tabla de empleados */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Personal asignado ({personal.length})
                  </div>
                  {personal.length > 0 && (
                    <button className="btn-ghost" onClick={printPersonal} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6, padding: '4px 10px' }}>
                      <Printer size={12} /> Imprimir
                    </button>
                  )}
                </div>
                {personal.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>Sin personal registrado</div>
                ) : (
                  <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                          {['Nombre', 'Día', 'Turno', 'Compensación', ''].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {personal.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.nombre_empleado}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{fmtFecha(p.dia)}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{p.turno ?? '—'}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: '#16a34a' }}>{fmt$(p.compensacion ?? 0)}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <button className="btn-ghost" onClick={() => deletePersonal(p.id)} style={{ padding: '3px 6px', fontSize: 10, color: '#dc2626' }} title="Eliminar">
                                <Trash2 size={11} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                          <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                          <td style={{ padding: '8px 10px', fontWeight: 700, color: '#16a34a' }}>{fmt$(personal.reduce((s, p) => s + (p.compensacion ?? 0), 0))}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </ModalShell>
      )}

      {/* ── MODAL DE CONSULTA (read-only) ── */}
      {viewEvt && (() => {
        const totalIng    = viewIng.reduce((s, i) => s + (i.monto ?? 0), 0)
        const totalGastos = viewOps.reduce((s, o) => s + (o.monto ?? 0), 0)
        const saldoGastos = viewOps.reduce((s, o) => s + (o.saldo ?? 0), 0)
        const utilidad    = totalIng - totalGastos
        const sc          = STATUS_COLORS[viewEvt.status] ?? { bg: '#f8fafc', color: '#64748b' }
        const tipo        = viewEvt.cat_tipos_evento

        return (
          <ModalShell
            modulo="default"
            titulo={`${viewEvt.folio} — ${viewEvt.nombre}`}
            subtitulo="Resumen del evento"
            icono={Eye}
            onClose={() => setViewEvt(null)}
            maxWidth={760}
            footer={
              <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn-primary" onClick={printFichaMaestra} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#166534', fontSize: 13 }}>
                  <Printer size={13} /> Imprimir Ficha Maestra
                </button>
                <button className="btn-secondary" onClick={() => setViewEvt(null)}>Cerrar</button>
              </div>
            }
          >
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Cabecera del evento */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 14, background: 'var(--surface-700)', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Status</div>
                  <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{viewEvt.status}</span>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Tipo</div>
                  {tipo ? (
                    <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, fontWeight: 600, background: tipo.color + '22', color: tipo.color }}>{tipo.nombre}</span>
                  ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
                  <span>{fmtFecha(viewEvt.fecha_inicio)}{viewEvt.fecha_fin && viewEvt.fecha_fin !== viewEvt.fecha_inicio ? ` → ${fmtFecha(viewEvt.fecha_fin)}` : ''}</span>
                  {(viewEvt.hora_inicio || viewEvt.hora_fin) && (
                    <span style={{ color: 'var(--text-muted)' }}>· {viewEvt.hora_inicio ?? ''}{viewEvt.hora_fin ? ` – ${viewEvt.hora_fin}` : ''}</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <MapPin size={13} style={{ color: 'var(--text-muted)' }} />
                  <span>{viewEvt.cat_lugares?.nombre ?? '—'}</span>
                  {viewEvt.num_asistentes != null && (
                    <span style={{ color: 'var(--text-muted)' }}>· <Users size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {viewEvt.num_asistentes}</span>
                  )}
                </div>
                {viewEvt.precio_pactado != null && (
                  <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Precio pactado:</strong> {fmt$(viewEvt.precio_pactado)}
                  </div>
                )}
                {viewEvt.cliente_nombre && (
                  <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Cliente:</strong> {viewEvt.cliente_nombre}
                    {viewEvt.cliente_telefono && <> · {viewEvt.cliente_telefono}</>}
                    {viewEvt.cliente_email && <> · {viewEvt.cliente_email}</>}
                  </div>
                )}
                {viewEvt.responsable && (
                  <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Responsable:</strong> {viewEvt.responsable}
                  </div>
                )}
              </div>

              {/* KPIs financieros */}
              {viewLoad ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>Cargando totales…</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    <div className="card" style={{ padding: '12px 14px', background: '#f0fdf4' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <TrendingUp size={13} style={{ color: '#16a34a' }} />
                        <span style={{ fontSize: 10, color: '#166534', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Ingresos</span>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{fmt$(totalIng)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{viewIng.length} pago{viewIng.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="card" style={{ padding: '12px 14px', background: '#fef2f2' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <TrendingDown size={13} style={{ color: '#dc2626' }} />
                        <span style={{ fontSize: 10, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Gastos (OPs)</span>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#dc2626' }}>{fmt$(totalGastos)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {viewOps.length} OP{viewOps.length !== 1 ? 's' : ''}
                        {saldoGastos > 0 && <> · saldo {fmt$(saldoGastos)}</>}
                      </div>
                    </div>
                    <div className="card" style={{ padding: '12px 14px', background: utilidad >= 0 ? '#eff6ff' : '#fef2f2' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <DollarSign size={13} style={{ color: utilidad >= 0 ? '#2563eb' : '#dc2626' }} />
                        <span style={{ fontSize: 10, color: utilidad >= 0 ? '#1e40af' : '#991b1b', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Utilidad</span>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: utilidad >= 0 ? '#2563eb' : '#dc2626' }}>{fmt$(utilidad)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ingresos − Gastos</div>
                    </div>
                  </div>

                  {/* Detalle compacto de ingresos */}
                  {viewIng.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                        Detalle de Ingresos
                      </div>
                      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                              {['Folio', 'Descripción', 'Forma de pago', 'Fecha', 'Monto'].map(h => (
                                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {viewIng.map((ing, i) => (
                              <tr key={ing.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', fontSize: 10 }}>{ing.folio}</td>
                                <td style={{ padding: '6px 10px' }}>{ing.descripcion}</td>
                                <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{ing.forma_pago}</td>
                                <td style={{ padding: '6px 10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(ing.fecha_pago)}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right' }}>{fmt$(ing.monto)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Detalle compacto de OPs */}
                  {viewOps.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                        Detalle de Gastos / OPs
                      </div>
                      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                              {['Folio', 'Concepto', 'Proveedor', 'Status', 'Monto', 'Saldo'].map(h => (
                                <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {viewOps.map((op, i) => (
                              <tr key={op.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', fontSize: 10 }}>{op.folio}</td>
                                <td style={{ padding: '6px 10px' }}>{op.concepto}</td>
                                <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? '—') : '—'}</td>
                                <td style={{ padding: '6px 10px' }}>
                                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#f8fafc', color: '#64748b', fontWeight: 600 }}>{op.status}</span>
                                </td>
                                <td style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right' }}>{fmt$(op.monto)}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right', color: (op.saldo ?? 0) > 0 ? '#dc2626' : '#16a34a' }}>{fmt$(op.saldo ?? 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {viewIng.length === 0 && viewOps.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                      Sin movimientos financieros registrados
                    </div>
                  )}
                </>
              )}
            </div>
          </ModalShell>
        )
      })()}
    </div>
  )
}
