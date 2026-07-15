'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbLoc, dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, RefreshCw, ChevronLeft, Search, X, ChevronDown, ChevronRight,
  CreditCard, Receipt, AlertCircle, Loader, Printer, DollarSign, Zap, FileText, Trash2, List,
} from 'lucide-react'
import Link from 'next/link'
import AsignacionModal, { type AsignacionData } from './AsignacionModal'
import CobrarModal, { type CuotaPendiente, printReciboLoc } from './CobrarModal'

// ── Tipos ──────────────────────────────────────────────────────
type Tab = 'asignaciones' | 'cobranza' | 'recibos' | 'cuotas'

type CuotaRow = {
  id: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  saldo: number | null
  status: string
  fecha_emision: string | null
  fecha_vencimiento: string | null
  fecha_pago: string | null
  tipo: string | null
  id_arrendatario_fk: number
  id_asignacion_fk: number | null
  cat_arrendatarios: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null
  ctrl_asignaciones: { cat_propiedades: { clave: string; nombre: string | null } | null } | null
}

type Asignacion = {
  id: number
  id_arrendatario_fk: number
  id_propiedad_fk: number
  fecha_inicio: string
  fecha_fin: string | null
  monto_mensual: number
  dia_pago: number
  activo: boolean
  observaciones: string | null
  cat_arrendatarios: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null
  cat_propiedades: { clave: string; nombre: string | null; status: string } | null
  pendientes: number
  monto_pendiente: number
  con_adeudo: boolean
}

type CuotaMes = {
  id: number
  id_arrendatario_fk: number
  id_asignacion_fk: number | null
  concepto: string
  periodo: string | null
  monto_final: number
  saldo: number | null
  status: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  cat_arrendatarios: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null
  ctrl_asignaciones: { cat_propiedades: { clave: string; nombre: string | null } | null } | null
}

type ReciboRow = {
  id: number
  folio: string
  fecha_recibo: string
  total: number
  forma_pago_nombre: string | null
  referencia_pago: string | null
  observaciones: string | null
  usuario_cobra: string | null
  status: string
  id_venta_pos_fk: number | null
  id_forma_pago_fk: number | null
  id_arrendatario_fk: number
  cat_arrendatarios: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null
  recibos_loc_det: { id: number; concepto: string; tipo: string; periodo: string | null; monto_final: number }[]
}

// ── Helpers ────────────────────────────────────────────────────
const hoy = new Date().toISOString().split('T')[0]
const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const saldoCuota = (c: { saldo: number | null; monto_final: number; status: string }) =>
  c.saldo ?? (c.status === 'PAGADO' ? 0 : c.monto_final)
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// Rentas de locales/propiedades causan IVA — el monto capturado (monto_final)
// ya lo incluye, se desglosa hacia adentro para el CFDI.
const IVA_PCT_CUOTAS = 16
const desglosarIva = (montoConIva: number) => {
  const subtotal = Math.round((montoConIva / (1 + IVA_PCT_CUOTAS / 100)) * 100) / 100
  const iva      = Math.round((montoConIva - subtotal) * 100) / 100
  return { subtotal, iva }
}
const fmtNombre = (a: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null) => {
  if (!a) return '—'
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMes = (d: string | null) =>
  d ? new Date(d + '-01T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'

const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  VIGENTE:   { bg: '#dcfce7', color: '#15803d', label: 'Vigente' },
  CANCELADO: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelado' },
}

// ── Componente ─────────────────────────────────────────────────
export default function CobranzaLocalesPage() {
  const { canWrite, authUser } = useAuth()
  const puedeEscribir = canWrite('locales')

  const [tab, setTab] = useState<Tab>('asignaciones')

  // ── Asignaciones ──────────────────────────────────────────
  const [asignaciones, setAsignaciones]       = useState<Asignacion[]>([])
  const [loadingA, setLoadingA]               = useState(true)
  const [expandidoA, setExpandidoA]           = useState<number | null>(null)
  const [soloActivas, setSoloActivas]         = useState(true)
  const [busquedaA, setBusquedaA]             = useState('')
  const [filtroSituacion, setFiltroSituacion] = useState<'todas' | 'adeudo' | 'corriente'>('todas')

  const [showAsig, setShowAsig]             = useState(false)
  const [editAsig, setEditAsig]             = useState<AsignacionData | undefined>()
  const [modoCuotas, setModoCuotas]         = useState<{ idAsig: number; monto: number } | null>(null)
  const [showCobrar, setShowCobrar]         = useState<{ cuotas: CuotaPendiente[]; nombreArr: string; idArr: number; nombrePropiedad: string; periodoDefault?: string } | null>(null)
  const [generandoCargo, setGenerandoCargo] = useState<number | null>(null)

  const [mesGenerar, setMesGenerar] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // ── Stats ─────────────────────────────────────────────────
  const [stats, setStats] = useState({ activas: 0, pendientes: 0, montoPendiente: 0, vencidas: 0 })

  // ── Cobranza ──────────────────────────────────────────────
  const [mesCobranza, setMesCobranza]       = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [cuotasMes, setCuotasMes]           = useState<CuotaMes[]>([])
  const [carteraVencida, setCarteraVencida] = useState({ count: 0, monto: 0 })
  const [loadingC, setLoadingC]             = useState(false)
  const [expandidoC, setExpandidoC]         = useState<number | null>(null)
  const [busquedaC, setBusquedaC]           = useState('')
  const [filtroStatusC, setFiltroStatusC]   = useState<'todas' | 'por_cobrar' | 'pagadas'>('todas')
  const [showGenerar, setShowGenerar]       = useState(false)
  const [mesGenerarAll, setMesGenerarAll]   = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [generando, setGenerando]           = useState(false)
  const [generadosMsg, setGeneradosMsg]     = useState('')

  // ── Recibos ───────────────────────────────────────────────
  const [recibos, setRecibos]               = useState<ReciboRow[]>([])
  const [loadingR, setLoadingR]             = useState(false)
  const [busquedaR, setBusquedaR]           = useState('')
  const [detalleRecibo, setDetalleRecibo]   = useState<ReciboRow | null>(null)
  const [imprimiendo, setImprimiendo]       = useState(false)
  const [genTicketR, setGenTicketR]         = useState(false)
  const [ticketErrR, setTicketErrR]         = useState('')

  // ── Cuotas (listado completo) ─────────────────────────────
  const [cuotasAll, setCuotasAll]           = useState<CuotaRow[]>([])
  const [loadingQ, setLoadingQ]             = useState(false)
  const [busquedaQ, setBusquedaQ]           = useState('')
  const [filtroStatusQ, setFiltroStatusQ]   = useState<'todas' | 'PENDIENTE' | 'PAGADO' | 'PAGO_PARCIAL' | 'CANCELADO'>('todas')
  const [eliminandoQ, setEliminandoQ]       = useState<number | null>(null)
  const [paginaQ, setPaginaQ]               = useState(1)
  const PAGE_SIZE_Q = 50
  const esSuperadmin = authUser?.rol === 'superadmin'

  // ── Fetch Asignaciones ────────────────────────────────────
  const fetchAsignaciones = useCallback(async () => {
    setLoadingA(true)
    let q = dbLoc.from('ctrl_asignaciones')
      .select(`id, id_arrendatario_fk, id_propiedad_fk, fecha_inicio, fecha_fin,
        monto_mensual, dia_pago, activo, observaciones,
        cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona),
        cat_propiedades(clave, nombre, status)`)
      .order('created_at', { ascending: false })
    if (soloActivas) q = q.eq('activo', true)
    const { data } = await q

    const { data: cxcData } = await dbLoc.from('cxc_loc')
      .select('id_asignacion_fk, saldo, monto_final, status, fecha_vencimiento')
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])

    const pendPorAsig: Record<number, { count: number; monto: number }> = {}
    const adeudoPorAsig: Record<number, boolean> = {}
    for (const c of (cxcData ?? []) as { id_asignacion_fk: number | null; saldo: number | null; monto_final: number; status: string; fecha_vencimiento: string | null }[]) {
      const asig = c.id_asignacion_fk
      if (!asig) continue
      if (!pendPorAsig[asig]) pendPorAsig[asig] = { count: 0, monto: 0 }
      pendPorAsig[asig].count++
      pendPorAsig[asig].monto += c.saldo ?? c.monto_final
      if (c.fecha_vencimiento && c.fecha_vencimiento < hoy) adeudoPorAsig[asig] = true
    }

    const result: Asignacion[] = ((data ?? []) as any[]).map(a => ({
      ...a,
      pendientes:      pendPorAsig[a.id]?.count ?? 0,
      monto_pendiente: pendPorAsig[a.id]?.monto ?? 0,
      con_adeudo:      adeudoPorAsig[a.id] ?? false,
    }))
    setAsignaciones(result)
    const activas = result.filter(a => a.activo)
    setStats({
      activas:         activas.length,
      pendientes:      activas.reduce((s, a) => s + a.pendientes, 0),
      montoPendiente:  activas.reduce((s, a) => s + a.monto_pendiente, 0),
      vencidas:        activas.filter(a => a.con_adeudo).length,
    })
    setLoadingA(false)
  }, [soloActivas])

  // ── Cobrar desde asignación ───────────────────────────────
  const abrirCobroAsig = async (a: Asignacion) => {
    const { data } = await dbLoc.from('cxc_loc')
      .select('id, concepto, periodo, monto_final, saldo, status, fecha_vencimiento')
      .eq('id_asignacion_fk', a.id)
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .order('fecha_vencimiento', { ascending: true })
    const prop = a.cat_propiedades
      ? `${a.cat_propiedades.clave}${a.cat_propiedades.nombre ? ` — ${a.cat_propiedades.nombre}` : ''}`
      : ''
    setShowCobrar({
      cuotas: ((data ?? []) as any[]).map(c => ({ ...c, saldo: c.saldo ?? c.monto_final })) as CuotaPendiente[],
      nombreArr: fmtNombre(a.cat_arrendatarios),
      idArr: a.id_arrendatario_fk,
      nombrePropiedad: prop,
      periodoDefault: hoy.slice(0, 7),
    })
  }

  // ── Generar cargo individual ──────────────────────────────
  const handleGenerarCargoAsig = async (a: Asignacion, mes: string) => {
    setGenerandoCargo(a.id)
    const { data: existing } = await dbLoc.from('cxc_loc')
      .select('id').eq('id_arrendatario_fk', a.id_arrendatario_fk)
      .eq('periodo', mes).limit(1)
    if (existing && existing.length > 0) {
      setGenerandoCargo(null)
      alert('Ya existe una cuota para ese mes en este arrendatario.')
      return
    }
    const [anio, numMes] = mes.split('-').map(Number)
    const diasEnMes = new Date(anio, numMes, 0).getDate()
    const diaVenc   = Math.min(a.dia_pago, diasEnMes)
    const fechaVenc = `${anio}-${String(numMes).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`
    const prop = a.cat_propiedades ? ` — ${a.cat_propiedades.clave}${a.cat_propiedades.nombre ? ` ${a.cat_propiedades.nombre}` : ''}` : ''
    const mesLabel = new Date(`${mes}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    await dbLoc.from('cxc_loc').insert({
      id_arrendatario_fk: a.id_arrendatario_fk,
      id_asignacion_fk:   a.id,
      concepto:           `Renta de Local${prop} — ${mesLabel}`,
      periodo:            mes,
      monto_original:     a.monto_mensual,
      descuento:          0,
      monto_final:        a.monto_mensual,
      saldo:              a.monto_mensual,
      status:             'PENDIENTE',
      fecha_emision:      hoy,
      fecha_vencimiento:  fechaVenc,
      tipo:               'RENTA_LOCAL',
    })
    setGenerandoCargo(null)
    fetchAsignaciones()
  }

  // ── Fetch Cobranza ────────────────────────────────────────
  const fetchCobranza = useCallback(async () => {
    setLoadingC(true)
    const [{ data: mesData }, { data: vData }] = await Promise.all([
      dbLoc.from('cxc_loc')
        .select(`id, id_arrendatario_fk, id_asignacion_fk, concepto, periodo, monto_final, saldo, status, fecha_vencimiento, fecha_pago,
          cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona),
          ctrl_asignaciones(cat_propiedades(clave, nombre))`)
        .eq('periodo', mesCobranza)
        .neq('status', 'CANCELADO')
        .order('fecha_vencimiento', { ascending: true }),
      dbLoc.from('cxc_loc')
        .select('saldo, monto_final, status, fecha_vencimiento')
        .in('status', ['PENDIENTE', 'PAGO_PARCIAL']),
    ])
    setCuotasMes(((mesData ?? []) as any[]) as CuotaMes[])
    const vencidas = ((vData ?? []) as { saldo: number | null; monto_final: number; fecha_vencimiento: string | null }[])
      .filter(c => c.fecha_vencimiento && c.fecha_vencimiento < hoy)
    setCarteraVencida({ count: vencidas.length, monto: vencidas.reduce((s, c) => s + (c.saldo ?? c.monto_final), 0) })
    setLoadingC(false)
  }, [mesCobranza])

  // Cobrar desde cobranza
  const abrirCobroMes = async (c: CuotaMes) => {
    const base = dbLoc.from('cxc_loc')
      .select('id, concepto, periodo, monto_final, saldo, status, fecha_vencimiento')
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .order('fecha_vencimiento', { ascending: true })
    const { data } = c.id_asignacion_fk
      ? await base.eq('id_asignacion_fk', c.id_asignacion_fk)
      : await base.eq('id_arrendatario_fk', c.id_arrendatario_fk)
    const prop = c.ctrl_asignaciones?.cat_propiedades
      ? `${c.ctrl_asignaciones.cat_propiedades.clave}${c.ctrl_asignaciones.cat_propiedades.nombre ? ` — ${c.ctrl_asignaciones.cat_propiedades.nombre}` : ''}`
      : ''
    setShowCobrar({
      cuotas: ((data ?? []) as any[]).map(x => ({ ...x, saldo: x.saldo ?? x.monto_final })) as CuotaPendiente[],
      nombreArr: fmtNombre(c.cat_arrendatarios),
      idArr: c.id_arrendatario_fk,
      nombrePropiedad: prop,
      periodoDefault: mesCobranza,
    })
  }

  // Cobrar todas las cuotas pendientes de un arrendatario (todas sus propiedades) en un solo recibo
  const abrirCobroArrendatarioMes = async (idArr: number, nombreArr: string) => {
    const { data } = await dbLoc.from('cxc_loc')
      .select('id, concepto, periodo, monto_final, saldo, status, fecha_vencimiento')
      .eq('id_arrendatario_fk', idArr)
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .order('fecha_vencimiento', { ascending: true })
    setShowCobrar({
      cuotas: ((data ?? []) as any[]).map(x => ({ ...x, saldo: x.saldo ?? x.monto_final })) as CuotaPendiente[],
      nombreArr,
      idArr,
      nombrePropiedad: '',
      periodoDefault: mesCobranza,
    })
  }

  // ── Generar cargos masivos ────────────────────────────────
  const handleGenerarMasivo = async () => {
    setGenerando(true); setGeneradosMsg('')
    const { data: vigentes } = await dbLoc.from('ctrl_asignaciones')
      .select('id, id_arrendatario_fk, id_propiedad_fk, monto_mensual, dia_pago, cat_propiedades(clave, nombre)')
      .eq('activo', true)
    const { data: yaGenerados } = await dbLoc.from('cxc_loc')
      .select('id_arrendatario_fk').eq('periodo', mesGenerarAll)
    const yaIds = new Set(((yaGenerados ?? []) as { id_arrendatario_fk: number }[]).map(c => c.id_arrendatario_fk))

    const [anio, numMes] = mesGenerarAll.split('-').map(Number)
    const mesLabel  = new Date(`${mesGenerarAll}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    const diasEnMes = new Date(anio, numMes, 0).getDate()

    const inserts: object[] = []
    for (const a of ((vigentes ?? []) as any[])) {
      if (yaIds.has(a.id_arrendatario_fk)) continue
      const diaVenc   = Math.min(a.dia_pago ?? 1, diasEnMes)
      const fechaVenc = `${anio}-${String(numMes).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`
      const prop = a.cat_propiedades ? ` — ${a.cat_propiedades.clave}${a.cat_propiedades.nombre ? ` ${a.cat_propiedades.nombre}` : ''}` : ''
      inserts.push({
        id_arrendatario_fk: a.id_arrendatario_fk,
        id_asignacion_fk:   a.id,
        concepto:           `Renta de Local${prop} — ${mesLabel}`,
        periodo:            mesGenerarAll,
        monto_original:     a.monto_mensual,
        descuento:          0,
        monto_final:        a.monto_mensual,
        saldo:              a.monto_mensual,
        status:             'PENDIENTE',
        fecha_emision:      hoy,
        fecha_vencimiento:  fechaVenc,
        tipo:               'RENTA_LOCAL',
      })
    }

    if (inserts.length === 0) {
      setGeneradosMsg(`Todas las asignaciones vigentes ya tienen cuota para ${mesLabel}.`)
    } else {
      await dbLoc.from('cxc_loc').insert(inserts)
      setGeneradosMsg(`✓ ${inserts.length} cuotas generadas para ${mesLabel}.`)
    }
    setGenerando(false)
    fetchCobranza(); fetchAsignaciones()
  }

  // ── Fetch Recibos ─────────────────────────────────────────
  const fetchRecibos = useCallback(async () => {
    setLoadingR(true)
    const { data } = await dbLoc.from('recibos_loc')
      .select(`id, folio, fecha_recibo, total, forma_pago_nombre, referencia_pago,
        observaciones, usuario_cobra, status, id_venta_pos_fk, id_forma_pago_fk, id_arrendatario_fk,
        cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona),
        recibos_loc_det(id, concepto, tipo, periodo, monto_final)`)
      .order('created_at', { ascending: false }).limit(300)
    setRecibos(((data ?? []) as any[]) as ReciboRow[])
    setLoadingR(false)
  }, [])

  // ── Imprimir recibo desde lista ───────────────────────────
  const handleImprimirRecibo = async (r: ReciboRow) => {
    setImprimiendo(true)
    await printReciboLoc(r.id, r.folio, fmtNombre(r.cat_arrendatarios))
    setImprimiendo(false)
  }

  // ── Ticket POS desde recibo ───────────────────────────────
  const handleTicketPOS = async (r: ReciboRow) => {
    setGenTicketR(true); setTicketErrR('')
    try {
      const [{ data: centros }, { data: cfg }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, rfc, direccion, telefono, municipio, leyenda_ticket').single(),
      ])
      const centrosPos = (centros as { id: number; nombre: string }[]) ?? []
      if (!centrosPos.length) throw new Error('No hay centros POS activos.')
      const centroLoc = centrosPos.find(c => { const n = norm(c.nombre); return n.includes('local') || n.includes('propiedad') }) ?? centrosPos[0]

      let ventaId = r.id_venta_pos_fk
      let folioDia = 0
      const fechaIso = `${r.fecha_recibo}T12:00:00`

      const detDesglosado = r.recibos_loc_det.map(d => ({ ...d, ...desglosarIva(d.monto_final) }))
      const totalIvaCuotas = detDesglosado.reduce((a, d) => a + d.iva, 0)

      if (!ventaId) {
        const { data: maxF } = await dbGolf.from('ctrl_ventas').select('folio_dia')
          .eq('id_centro_fk', centroLoc.id)
          .gte('fecha', `${r.fecha_recibo}T00:00:00`).lte('fecha', `${r.fecha_recibo}T23:59:59`)
          .order('folio_dia', { ascending: false }).limit(1)
        folioDia = maxF && maxF.length > 0 ? ((maxF[0] as any).folio_dia + 1) : 1
        const { data: venta, error: ev } = await dbGolf.from('ctrl_ventas').insert({
          folio_dia: folioDia, id_centro_fk: centroLoc.id, fecha: fechaIso,
          nombre_cliente: fmtNombre(r.cat_arrendatarios), es_socio: false,
          subtotal: r.total, descuento: 0, iva: totalIvaCuotas, total: r.total,
          status: 'PAGADA', usuario_crea: authUser?.user?.email ?? 'locales',
          notas: `Ticket POS desde recibo de locales ${r.folio}`,
        }).select('id, folio_dia').single()
        if (ev || !venta) throw new Error(ev?.message ?? 'Error al crear venta POS')
        ventaId = (venta as any).id; folioDia = (venta as any).folio_dia

        if (detDesglosado.length > 0) {
          await dbGolf.from('ctrl_ventas_det').insert(detDesglosado.map(d => ({
            id_venta_fk: ventaId!, id_producto_fk: null, concepto: d.concepto,
            cantidad: 1, precio_unitario: d.monto_final, descuento: 0, iva_pct: IVA_PCT_CUOTAS, iva: d.iva, subtotal: d.subtotal, total: d.monto_final, notas: null,
          })))
        }
        const { data: pagosR } = await dbLoc.from('recibos_loc_pagos').select('id_forma_pago_fk, forma_nombre, monto').eq('id_recibo_fk', r.id)
        if (pagosR && pagosR.length > 0) {
          await dbGolf.from('ctrl_ventas_pagos').insert((pagosR as any[]).map((p: any) => ({ id_venta_fk: ventaId!, id_forma_fk: p.id_forma_pago_fk ?? null, forma_nombre: p.forma_nombre, monto: p.monto })))
        }
        await dbLoc.from('recibos_loc').update({ id_venta_pos_fk: ventaId }).eq('id', r.id)
        setRecibos(prev => prev.map(x => x.id === r.id ? { ...x, id_venta_pos_fk: ventaId } : x))
        if (detalleRecibo?.id === r.id) setDetalleRecibo(prev => prev ? { ...prev, id_venta_pos_fk: ventaId } : prev)
      } else {
        const { data: ventaEx } = await dbGolf.from('ctrl_ventas').select('folio_dia').eq('id', ventaId).single()
        folioDia = (ventaEx as any)?.folio_dia ?? 0
      }

      const { data: pagosF } = await dbLoc.from('recibos_loc_pagos').select('forma_nombre, monto').eq('id_recibo_fk', r.id)
      const cfgP = cfg as { razon_social: string | null; municipio: string | null; direccion: string | null; rfc: string | null; telefono: string | null; leyenda_ticket: string | null } | null
      const ticketData = {
        id: ventaId, folio_dia: folioDia || '—', fecha: fechaIso,
        cliente: fmtNombre(r.cat_arrendatarios), cajero: r.usuario_cobra ?? '—', centro: centroLoc.nombre,
        razon_social: cfgP?.razon_social ?? 'DomusOne',
        municipio: cfgP?.municipio ?? '', direccion: cfgP?.direccion ?? '',
        rfc: cfgP?.rfc ?? '', telefono: cfgP?.telefono ?? '',
        leyenda: cfgP?.leyenda_ticket ?? '¡Gracias por su pago!',
        subtotal: parseFloat((r.total - totalIvaCuotas).toFixed(2)), iva: totalIvaCuotas, total: r.total,
        pagos: ((pagosF ?? []) as { forma_nombre: string; monto: number }[]).map(p => ({ forma: p.forma_nombre, monto: p.monto })),
        items: detDesglosado.map(d => ({ concepto: d.concepto, cantidad: 1, precio_unitario: d.monto_final, iva: d.iva, total: d.monto_final })),
      }
      window.open(`/ticket-golf.html?data=${encodeURIComponent(JSON.stringify(ticketData))}&print=1`, '_blank', 'width=400,height=700')
    } catch (e: any) {
      setTicketErrR(e?.message ?? 'Error al generar ticket')
    } finally {
      setGenTicketR(false)
    }
  }

  const fetchCuotasAll = useCallback(async () => {
    setLoadingQ(true)
    const { data } = await dbLoc.from('cxc_loc')
      .select(`id, concepto, periodo, monto_original, descuento, monto_final, saldo, status,
        fecha_emision, fecha_vencimiento, fecha_pago, tipo, id_arrendatario_fk, id_asignacion_fk,
        cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona),
        ctrl_asignaciones(cat_propiedades(clave, nombre))`)
      .order('fecha_emision', { ascending: false })
      .limit(500)
    setCuotasAll(((data ?? []) as any[]) as CuotaRow[])
    setLoadingQ(false)
  }, [])

  const handleEliminarCuota = async (id: number) => {
    if (!confirm('¿Eliminar esta cuota? Esta acción no se puede deshacer.')) return
    setEliminandoQ(id)
    const { error } = await dbLoc.from('cxc_loc').delete().eq('id', id)
    if (error) {
      alert(`Error al eliminar: ${error.message}`)
      setEliminandoQ(null)
      return
    }
    setCuotasAll(prev => prev.filter(c => c.id !== id))
    setEliminandoQ(null)
    fetchAsignaciones()
  }

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => { fetchAsignaciones() }, [fetchAsignaciones])
  useEffect(() => { if (tab === 'cobranza') fetchCobranza() }, [tab, fetchCobranza])
  useEffect(() => { if (tab === 'recibos') fetchRecibos() }, [tab, fetchRecibos])
  useEffect(() => { if (tab === 'cuotas') fetchCuotasAll() }, [tab, fetchCuotasAll])

  // ── Filtros Asignaciones ──────────────────────────────────
  const asigFiltradas = asignaciones.filter(a => {
    if (filtroSituacion === 'adeudo'    && !a.con_adeudo) return false
    if (filtroSituacion === 'corriente' &&  a.con_adeudo) return false
    if (!busquedaA.trim()) return true
    const q = norm(busquedaA)
    return norm(fmtNombre(a.cat_arrendatarios)).includes(q) ||
           norm(a.cat_propiedades?.clave ?? '').includes(q)
  })

  // ── Filtros Cobranza ──────────────────────────────────────
  const cuotasFiltradas = cuotasMes.filter(c => {
    if (filtroStatusC === 'por_cobrar' && saldoCuota(c) === 0)  return false
    if (filtroStatusC === 'pagadas'    && saldoCuota(c) > 0)    return false
    if (!busquedaC.trim()) return true
    const q = norm(busquedaC)
    return norm(fmtNombre(c.cat_arrendatarios)).includes(q) || norm(c.concepto).includes(q)
  })

  // ── Agrupación por arrendatario (para cobrar todas sus propiedades de una vez) ──
  const gruposArrendatario = (() => {
    const map = new Map<number, { idArr: number; nombreArr: string; cuotas: CuotaMes[] }>()
    for (const c of cuotasFiltradas) {
      let g = map.get(c.id_arrendatario_fk)
      if (!g) { g = { idArr: c.id_arrendatario_fk, nombreArr: fmtNombre(c.cat_arrendatarios), cuotas: [] }; map.set(c.id_arrendatario_fk, g) }
      g.cuotas.push(c)
    }
    return Array.from(map.values())
      .map(g => {
        const totalMonto = g.cuotas.reduce((s, c) => s + c.monto_final, 0)
        const totalSaldo = g.cuotas.reduce((s, c) => s + saldoCuota(c), 0)
        const propiedades = Array.from(new Set(g.cuotas.map(c => c.ctrl_asignaciones?.cat_propiedades?.clave).filter(Boolean))) as string[]
        return { ...g, totalMonto, totalSaldo, propiedades }
      })
      .sort((a, b) => b.totalSaldo - a.totalSaldo || a.nombreArr.localeCompare(b.nombreArr))
  })()

  const SEVERIDAD: Record<string, number> = { 'Vencida': 3, 'Parcial': 2, 'Por vencer': 1, 'Pagada': 0 }
  const situacionGrupo = (cuotas: CuotaMes[]) => {
    let peor = { label: 'Pagada', bg: '#dcfce7', color: '#15803d' }
    let peorSev = -1
    for (const c of cuotas) {
      const s = situacionCuota(c)
      const sev = SEVERIDAD[s.label] ?? 0
      if (sev > peorSev) { peorSev = sev; peor = s }
    }
    return peor
  }

  // ── KPIs Cobranza ─────────────────────────────────────────
  const emitido   = cuotasMes.reduce((s, c) => s + c.monto_final, 0)
  const cobrado   = cuotasMes.filter(c => c.status === 'PAGADO').reduce((s, c) => s + c.monto_final, 0)
  const porCobrar = cuotasMes.filter(c => c.status !== 'PAGADO').reduce((s, c) => s + saldoCuota(c), 0)
  const avance    = emitido > 0 ? Math.round((cobrado / emitido) * 100) : 0
  const pagadas   = cuotasMes.filter(c => saldoCuota(c) === 0).length
  const mesLabel  = new Date(`${mesCobranza}-01T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  // ── Filtros Recibos ───────────────────────────────────────
  const recibosFiltrados = recibos.filter(r =>
    !busquedaR.trim() ||
    norm(fmtNombre(r.cat_arrendatarios)).includes(norm(busquedaR)) ||
    norm(r.folio).includes(norm(busquedaR))
  )

  // ── Filtros Cuotas ────────────────────────────────────────
  const cuotasAllFiltradas = cuotasAll.filter(c => {
    if (filtroStatusQ !== 'todas' && c.status !== filtroStatusQ) return false
    if (!busquedaQ.trim()) return true
    const q = norm(busquedaQ)
    return norm(fmtNombre(c.cat_arrendatarios)).includes(q) || norm(c.concepto).includes(q) || norm(c.periodo ?? '').includes(q)
  })
  const totalPaginasQ  = Math.max(1, Math.ceil(cuotasAllFiltradas.length / PAGE_SIZE_Q))
  const paginaQSafe    = Math.min(paginaQ, totalPaginasQ)
  const cuotasPagina   = cuotasAllFiltradas.slice((paginaQSafe - 1) * PAGE_SIZE_Q, paginaQSafe * PAGE_SIZE_Q)

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'asignaciones', label: 'Asignaciones', icon: AlertCircle },
    { key: 'cobranza',     label: 'Cobranza',     icon: CreditCard  },
    { key: 'recibos',      label: 'Recibos',      icon: Receipt     },
    { key: 'cuotas',       label: 'Cuotas',       icon: List        },
  ]

  const situacionCuota = (c: CuotaMes) => {
    const s = saldoCuota(c)
    if (s === 0)                         return { label: 'Pagada',     bg: '#dcfce7', color: '#15803d' }
    if (c.status === 'PAGO_PARCIAL')     return { label: 'Parcial',    bg: '#fffbeb', color: '#d97706' }
    if (c.fecha_vencimiento && c.fecha_vencimiento < hoy)
                                         return { label: 'Vencida',    bg: '#fef2f2', color: '#dc2626' }
    return                                      { label: 'Por vencer', bg: '#eff6ff', color: '#2563eb' }
  }

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
            <Link href="/locales" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={13} /> Locales
            </Link>
            <span>/</span>
            <span style={{ color: '#475569', fontWeight: 500 }}>Cobranza</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: '#0f766e', letterSpacing: '-0.01em' }}>
            Locales & Rentas
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => fetchAsignaciones()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && tab === 'asignaciones' && (
            <button className="btn-primary" onClick={() => { setEditAsig(undefined); setShowAsig(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0f766e' }}>
              <Plus size={14} /> Nueva Asignación
            </button>
          )}
          {puedeEscribir && tab === 'cobranza' && (
            <button className="btn-primary" onClick={() => { setShowGenerar(true); setGeneradosMsg('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0f766e' }}>
              <Zap size={14} /> Generar Cuotas del Mes
            </button>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Asignaciones Activas', value: stats.activas,        color: '#16a34a', bg: '#ecfdf5' },
          { label: 'Cuotas Pendientes',    value: stats.pendientes,     color: '#d97706', bg: '#fffbeb' },
          { label: 'Monto por Cobrar',     value: fmt$(stats.montoPendiente), color: '#dc2626', bg: '#fef2f2' },
          { label: 'Con Adeudo Vencido',   value: stats.vencidas,       color: '#7c3aed', bg: '#f5f3ff' },
        ].map(c => (
          <div key={c.label} className="card" style={{ flex: '1 1 140px', maxWidth: 220, padding: '12px 16px', background: c.bg }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: tab === t.key ? 600 : 400,
              color:      tab === t.key ? '#0f766e' : '#94a3b8',
              borderBottom: tab === t.key ? '2px solid #0f766e' : '2px solid transparent',
              marginBottom: -1,
            }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB: ASIGNACIONES
      ══════════════════════════════════════════════════════ */}
      {tab === 'asignaciones' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar arrendatario o propiedad…" value={busquedaA} onChange={e => setBusquedaA(e.target.value)} />
              {busquedaA && <button onClick={() => setBusquedaA('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {([
                { key: 'todas',     label: 'Todas',        color: '#0f766e' },
                { key: 'adeudo',    label: 'Con Adeudo',   color: '#dc2626' },
                { key: 'corriente', label: 'Al corriente', color: '#2563eb' },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setFiltroSituacion(f.key)} style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: filtroSituacion === f.key ? 600 : 400,
                  background: filtroSituacion === f.key ? f.color : '#fff',
                  color: filtroSituacion === f.key ? '#fff' : '#94a3b8',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={soloActivas} onChange={e => setSoloActivas(e.target.checked)} />
              Solo activas
            </label>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                    {['', 'Arrendatario', 'Propiedad', 'Renta/mes', 'Pendientes', 'Situación', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingA ? (
                    <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                  ) : asigFiltradas.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin asignaciones registradas</div>
                      <div style={{ fontSize: 12 }}>Registra una nueva asignación para comenzar</div>
                    </td></tr>
                  ) : asigFiltradas.map(a => {
                    const abierto = expandidoA === a.id
                    const propDesc = a.cat_propiedades ? `${a.cat_propiedades.clave}${a.cat_propiedades.nombre ? ` — ${a.cat_propiedades.nombre}` : ''}` : '—'
                    return (
                      <>
                        <tr key={a.id}
                          onClick={() => setExpandidoA(abierto ? null : a.id)}
                          style={{ borderBottom: abierto ? 'none' : '1px solid var(--border)', cursor: 'pointer', opacity: a.activo ? 1 : 0.55, background: abierto ? '#f0fdfa' : '' }}
                          onMouseEnter={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                          onMouseLeave={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = '' }}>
                          <td style={{ padding: '10px 10px 10px 14px', width: 28, color: '#94a3b8' }}>
                            {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{fmtNombre(a.cat_arrendatarios)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.cat_arrendatarios?.tipo_persona}</div>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                            <div>{propDesc}</div>
                            {a.cat_propiedades?.status && a.cat_propiedades.status !== 'Libre' && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: a.cat_propiedades.status === 'Rentada' ? '#dbeafe' : '#f3e8ff', color: a.cat_propiedades.status === 'Rentada' ? '#1d4ed8' : '#7c3aed', fontWeight: 600 }}>
                                {a.cat_propiedades.status}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f766e', whiteSpace: 'nowrap' }}>{fmt$(a.monto_mensual)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {a.pendientes > 0
                              ? <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{a.pendientes} · {fmt$(a.monto_pendiente)}</span>
                              : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: a.con_adeudo ? '#fef2f2' : '#eff6ff', color: a.con_adeudo ? '#dc2626' : '#2563eb' }}>
                              {a.con_adeudo ? 'Con Adeudo' : 'Al corriente'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: a.activo ? '#dcfce7' : '#f1f5f9', color: a.activo ? '#15803d' : '#64748b' }}>
                              {a.activo ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {puedeEscribir && (
                              <button onClick={e => { e.stopPropagation(); setEditAsig({ id: a.id, id_arrendatario_fk: a.id_arrendatario_fk, id_propiedad_fk: a.id_propiedad_fk, fecha_inicio: a.fecha_inicio, fecha_fin: a.fecha_fin, monto_mensual: a.monto_mensual, dia_pago: a.dia_pago, activo: a.activo, observaciones: a.observaciones }); setShowAsig(true) }}
                                style={{ fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                Editar
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Fila expandida */}
                        {abierto && (
                          <tr key={`${a.id}-det`}>
                            <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                              <div style={{ background: '#f0fdfa', padding: '16px 20px 20px 48px' }}>
                                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                                  <span><strong>Inicio:</strong> {fmtFecha(a.fecha_inicio)}</span>
                                  {a.fecha_fin && <span><strong>Fin:</strong> {fmtFecha(a.fecha_fin)}</span>}
                                  <span><strong>Día venc.:</strong> {a.dia_pago}</span>
                                  {a.observaciones && <span><strong>Notas:</strong> {a.observaciones}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  {puedeEscribir && a.activo && (
                                    <>
                                      {/* Selector de mes + botón agregar cuota */}
                                      <select value={mesGenerar} onChange={e => setMesGenerar(e.target.value)}
                                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b' }}>
                                        {Array.from({ length: 12 }, (_, i) => {
                                          const d = new Date(); d.setMonth(d.getMonth() - 2 + i)
                                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                                        }).map(m => <option key={m} value={m}>{fmtMes(m)}</option>)}
                                      </select>
                                      <button onClick={e => { e.stopPropagation(); handleGenerarCargoAsig(a, mesGenerar) }}
                                        disabled={generandoCargo === a.id}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid #0f766e', background: '#f0fdfa', color: '#0f766e', cursor: 'pointer', opacity: generandoCargo === a.id ? 0.6 : 1 }}>
                                        {generandoCargo === a.id ? <Loader size={12} /> : <Plus size={12} />} Agregar Cuota
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); setModoCuotas({ idAsig: a.id, monto: a.monto_mensual }); setShowAsig(true) }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer' }}>
                                        <Plus size={12} /> Generar cuotas (rango)
                                      </button>
                                    </>
                                  )}
                                  {a.pendientes > 0 && puedeEscribir && (
                                    <button onClick={e => { e.stopPropagation(); abrirCobroAsig(a) }}
                                      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', cursor: 'pointer' }}>
                                      <DollarSign size={12} /> Cobrar ({fmt$(a.monto_pendiente)})
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: COBRANZA
      ══════════════════════════════════════════════════════ */}
      {tab === 'cobranza' && (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: `Emitido — ${mesLabel}`, value: fmt$(emitido), sub: `${cuotasMes.length} cuota${cuotasMes.length !== 1 ? 's' : ''}`, color: '#2563eb', bg: '#eff6ff' },
              { label: 'Cobrado del mes', value: fmt$(cobrado), sub: `${pagadas} pagadas · ${avance}%`, color: '#16a34a', bg: '#ecfdf5' },
              { label: 'Por cobrar del mes', value: fmt$(porCobrar), sub: 'Saldo pendiente', color: porCobrar > 0 ? '#dc2626' : '#64748b', bg: porCobrar > 0 ? '#fef2f2' : '#f8fafc' },
              { label: 'Cartera vencida total', value: fmt$(carteraVencida.monto), sub: `${carteraVencida.count} cuotas`, color: carteraVencida.monto > 0 ? '#dc2626' : '#64748b', bg: carteraVencida.monto > 0 ? '#fef2f2' : '#f8fafc' },
            ].map(c => (
              <div key={c.label} className="card" style={{ flex: '1 1 200px', maxWidth: 280, padding: '14px 18px', background: c.bg }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{loadingC ? '—' : c.value}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{loadingC ? '' : c.sub}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar arrendatario…" value={busquedaC} onChange={e => setBusquedaC(e.target.value)} />
              {busquedaC && <button onClick={() => setBusquedaC('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            {(() => {
              const [anioSel, mesSel] = mesCobranza.split('-')
              const anioActual = new Date().getFullYear()
              const anios = Array.from({ length: anioActual - 2024 + 2 }, (_, i) => 2024 + i)
              const MESES_L = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
              const sel: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }
              return (
                <>
                  <select value={anioSel} onChange={e => setMesCobranza(`${e.target.value}-${mesSel}`)} style={sel}>
                    {anios.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select value={mesSel} onChange={e => setMesCobranza(`${anioSel}-${e.target.value}`)} style={sel}>
                    {MESES_L.map((m, i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
                  </select>
                </>
              )
            })()}
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {([
                { key: 'todas',      label: 'Todas',      color: '#0f766e' },
                { key: 'por_cobrar', label: 'Por cobrar', color: '#dc2626' },
                { key: 'pagadas',    label: 'Pagadas',    color: '#2563eb' },
              ] as const).map(f => (
                <button key={f.key} onClick={() => setFiltroStatusC(f.key)} style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: filtroStatusC === f.key ? 600 : 400,
                  background: filtroStatusC === f.key ? f.color : '#fff',
                  color: filtroStatusC === f.key ? '#fff' : '#94a3b8',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                    {['', 'Arrendatario', 'Propiedades', 'Cuotas', 'Monto', 'Saldo', 'Situación', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingC ? (
                    <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={16} /></td></tr>
                  ) : gruposArrendatario.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Sin cuotas para {mesLabel}
                    </td></tr>
                  ) : gruposArrendatario.map(g => {
                    const abierto = expandidoC === g.idArr
                    const sit = situacionGrupo(g.cuotas)
                    return (
                      <>
                        <tr key={g.idArr}
                          onClick={() => setExpandidoC(abierto ? null : g.idArr)}
                          style={{ borderBottom: abierto ? 'none' : '1px solid var(--border)', cursor: 'pointer', background: abierto ? '#f0fdfa' : '' }}
                          onMouseEnter={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                          onMouseLeave={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = '' }}>
                          <td style={{ padding: '10px 10px 10px 14px', width: 28, color: '#94a3b8' }}>
                            {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 500 }}>{g.nombreArr}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {g.propiedades.length > 0 ? g.propiedades.join(', ') : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{g.cuotas.length}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f766e', whiteSpace: 'nowrap' }}>{fmt$(g.totalMonto)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap', color: g.totalSaldo > 0 ? '#dc2626' : '#15803d' }}>{fmt$(g.totalSaldo)}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: sit.bg, color: sit.color }}>{sit.label}</span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {puedeEscribir && g.totalSaldo > 0 && (
                              <button onClick={e => { e.stopPropagation(); abrirCobroArrendatarioMes(g.idArr, g.nombreArr) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#0f766e', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <DollarSign size={12} /> Cobrar todo
                              </button>
                            )}
                          </td>
                        </tr>

                        {abierto && (
                          <tr key={`${g.idArr}-det`}>
                            <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                              <div style={{ background: '#f0fdfa', padding: '4px 20px 14px 48px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                  <thead>
                                    <tr>
                                      {['Propiedad', 'Concepto', 'Monto', 'Saldo', 'Situación', 'Fecha pago', ''].map(h => (
                                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.cuotas.map(c => {
                                      const sitC   = situacionCuota(c)
                                      const saldo  = saldoCuota(c)
                                      const vencida = c.fecha_vencimiento && c.fecha_vencimiento < hoy && saldo > 0
                                      return (
                                        <tr key={c.id} style={{ borderTop: '1px solid #99f6e4' }}>
                                          <td style={{ padding: '7px 10px', color: '#64748b' }}>{c.ctrl_asignaciones?.cat_propiedades?.clave ?? '—'}</td>
                                          <td style={{ padding: '7px 10px', color: '#475569', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.concepto}</td>
                                          <td style={{ padding: '7px 10px', fontWeight: 600, color: '#0f766e', whiteSpace: 'nowrap' }}>{fmt$(c.monto_final)}</td>
                                          <td style={{ padding: '7px 10px', fontWeight: 700, whiteSpace: 'nowrap', color: saldo > 0 ? '#dc2626' : '#15803d' }}>{fmt$(saldo)}</td>
                                          <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 600, background: sitC.bg, color: sitC.color }}>{sitC.label}</span>
                                          </td>
                                          <td style={{ padding: '7px 10px', color: vencida ? '#dc2626' : '#94a3b8', whiteSpace: 'nowrap' }}>
                                            {c.fecha_pago ? fmtFecha(c.fecha_pago) : '—'}
                                          </td>
                                          <td style={{ padding: '7px 10px' }}>
                                            {puedeEscribir && saldo > 0 && (
                                              <button onClick={e => { e.stopPropagation(); abrirCobroMes(c) }}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 9px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                <DollarSign size={11} /> Cobrar
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: RECIBOS
      ══════════════════════════════════════════════════════ */}
      {tab === 'recibos' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar arrendatario o folio…" value={busquedaR} onChange={e => setBusquedaR(e.target.value)} />
              {busquedaR && <button onClick={() => setBusquedaR('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <button className="btn-ghost" onClick={fetchRecibos} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} />
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                    {['Folio', 'Arrendatario', 'Fecha', 'Total', 'Forma de pago', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingR ? (
                    <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={16} /></td></tr>
                  ) : recibosFiltrados.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin recibos registrados</td></tr>
                  ) : recibosFiltrados.map(r => {
                    const sc = STATUS_COLOR[r.status] ?? { bg: '#f1f5f9', color: '#64748b', label: r.status }
                    return (
                      <tr key={r.id}
                        onClick={() => { setDetalleRecibo(r); setTicketErrR('') }}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#0f766e' }}>{r.folio}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>{fmtNombre(r.cat_arrendatarios)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{fmtFecha(r.fecha_recibo)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f766e' }}>{fmt$(r.total)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{r.forma_pago_nombre ?? '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: sc.bg, color: sc.color }}>{sc.label}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB: CUOTAS
      ══════════════════════════════════════════════════════ */}
      {tab === 'cuotas' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar arrendatario, concepto o periodo…" value={busquedaQ} onChange={e => { setBusquedaQ(e.target.value); setPaginaQ(1) }} />
              {busquedaQ && <button onClick={() => setBusquedaQ('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {([
                { key: 'todas',        label: 'Todas',        color: '#0f766e' },
                { key: 'PENDIENTE',    label: 'Pendiente',    color: '#dc2626' },
                { key: 'PAGO_PARCIAL', label: 'Parcial',      color: '#d97706' },
                { key: 'PAGADO',       label: 'Pagado',       color: '#16a34a' },
                { key: 'CANCELADO',    label: 'Cancelado',    color: '#64748b' },
              ] as const).map(f => (
                <button key={f.key} onClick={() => { setFiltroStatusQ(f.key); setPaginaQ(1) }} style={{
                  padding: '7px 12px', fontSize: 12, fontWeight: filtroStatusQ === f.key ? 600 : 400,
                  background: filtroStatusQ === f.key ? f.color : '#fff',
                  color: filtroStatusQ === f.key ? '#fff' : '#94a3b8',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}>
                  {f.label}
                </button>
              ))}
            </div>
            <button className="btn-ghost" onClick={fetchCuotasAll} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={13} />
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                    {['Arrendatario', 'Propiedad', 'Concepto', 'Periodo', 'Monto', 'Saldo', 'Status', 'Vencimiento', ...(esSuperadmin ? [''] : [])].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingQ ? (
                    <tr><td colSpan={esSuperadmin ? 9 : 8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={16} /></td></tr>
                  ) : cuotasAllFiltradas.length === 0 ? (
                    <tr><td colSpan={esSuperadmin ? 9 : 8} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>Sin cuotas registradas</td></tr>
                  ) : cuotasPagina.map(c => {
                    const saldo = c.saldo ?? (c.status === 'PAGADO' ? 0 : c.monto_final)
                    const vencida = c.fecha_vencimiento && c.fecha_vencimiento < hoy && saldo > 0
                    const statusCfg: Record<string, { bg: string; color: string }> = {
                      PENDIENTE:    { bg: '#fef2f2', color: '#dc2626' },
                      PAGO_PARCIAL: { bg: '#fffbeb', color: '#d97706' },
                      PAGADO:       { bg: '#dcfce7', color: '#15803d' },
                      CANCELADO:    { bg: '#f1f5f9', color: '#64748b' },
                    }
                    const sc = statusCfg[c.status] ?? { bg: '#f1f5f9', color: '#64748b' }
                    const prop = c.ctrl_asignaciones?.cat_propiedades
                      ? `${c.ctrl_asignaciones.cat_propiedades.clave}${c.ctrl_asignaciones.cat_propiedades.nombre ? ` — ${c.ctrl_asignaciones.cat_propiedades.nombre}` : ''}`
                      : '—'
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>{fmtNombre(c.cat_arrendatarios)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{prop}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.concepto}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{c.periodo ? fmtMes(c.periodo) : '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f766e', whiteSpace: 'nowrap' }}>{fmt$(c.monto_final)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap', color: saldo > 0 ? '#dc2626' : '#15803d' }}>{fmt$(saldo)}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: sc.bg, color: sc.color }}>{c.status.replace('_', ' ')}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, whiteSpace: 'nowrap', color: vencida ? '#dc2626' : 'var(--text-muted)' }}>
                          {fmtFecha(c.fecha_vencimiento)}
                        </td>
                        {esSuperadmin && (
                          <td style={{ padding: '10px 14px' }}>
                            <button
                              onClick={() => handleEliminarCuota(c.id)}
                              disabled={eliminandoQ === c.id}
                              title="Eliminar cuota"
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', opacity: eliminandoQ === c.id ? 0.5 : 1 }}>
                              {eliminandoQ === c.id ? <Loader size={12} /> : <Trash2 size={12} />}
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {cuotasAllFiltradas.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {((paginaQSafe - 1) * PAGE_SIZE_Q) + 1}–{Math.min(paginaQSafe * PAGE_SIZE_Q, cuotasAllFiltradas.length)} de {cuotasAllFiltradas.length} cuota{cuotasAllFiltradas.length !== 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([
                    { label: '«', title: 'Primera', onClick: () => setPaginaQ(1),               disabled: paginaQSafe === 1 },
                    { label: '‹', title: 'Anterior', onClick: () => setPaginaQ(p => p - 1),    disabled: paginaQSafe === 1 },
                    { label: '›', title: 'Siguiente', onClick: () => setPaginaQ(p => p + 1),   disabled: paginaQSafe === totalPaginasQ },
                    { label: '»', title: 'Última',   onClick: () => setPaginaQ(totalPaginasQ),  disabled: paginaQSafe === totalPaginasQ },
                  ]).map(btn => (
                    <button key={btn.title} title={btn.title} onClick={btn.onClick} disabled={btn.disabled} style={{
                      width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: 6,
                      background: btn.disabled ? '#f8fafc' : '#fff', color: btn.disabled ? '#cbd5e1' : '#475569',
                      cursor: btn.disabled ? 'default' : 'pointer', transition: 'all 0.1s',
                    }}>
                      {btn.label}
                    </button>
                  ))}
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>
                    Pág. {paginaQSafe} / {totalPaginasQ}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          MODALES
      ══════════════════════════════════════════════════════ */}

      {/* Modal Asignación (nueva / editar / agregar cuotas) */}
      {showAsig && (
        <AsignacionModal
          asignacion={editAsig}
          idAsignacionFk={modoCuotas?.idAsig}
          modoAgregarCuotas={!!modoCuotas}
          montoExistente={modoCuotas?.monto}
          onClose={() => { setShowAsig(false); setEditAsig(undefined); setModoCuotas(null) }}
          onSaved={() => { setShowAsig(false); setEditAsig(undefined); setModoCuotas(null); fetchAsignaciones(); if (tab === 'cobranza') fetchCobranza() }}
        />
      )}

      {/* Modal Cobrar */}
      {showCobrar && (
        <CobrarModal
          cuotas={showCobrar.cuotas}
          nombreArrendatario={showCobrar.nombreArr}
          idArrendatario={showCobrar.idArr}
          nombrePropiedad={showCobrar.nombrePropiedad}
          periodoDefault={showCobrar.periodoDefault}
          onClose={() => setShowCobrar(null)}
          onSaved={() => { fetchAsignaciones(); if (tab === 'cobranza') fetchCobranza(); fetchRecibos() }}
        />
      )}

      {/* Modal Generar Cuotas Masivas */}
      {showGenerar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { if (!generando) setShowGenerar(false) }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Generar Cuotas del Mes</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
              Crea una cuota de renta para cada asignación activa que aún no tenga cuota en el periodo seleccionado.
            </div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Periodo</label>
            {(() => {
              const [anioSel, mesSel] = mesGenerarAll.split('-')
              const anioActual = new Date().getFullYear()
              const anios = Array.from({ length: anioActual - 2024 + 2 }, (_, i) => 2024 + i)
              const MESES_L = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
              const sel: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', flex: 1 }
              return (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <select value={anioSel} onChange={e => setMesGenerarAll(`${e.target.value}-${mesSel}`)} style={sel}>
                    {anios.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <select value={mesSel} onChange={e => setMesGenerarAll(`${anioSel}-${e.target.value}`)} style={sel}>
                    {MESES_L.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                  </select>
                </div>
              )
            })()}
            {generadosMsg && (
              <div style={{ fontSize: 13, padding: '10px 14px', background: generadosMsg.startsWith('✓') ? '#f0fdf4' : '#fef9c3', border: '1px solid', borderColor: generadosMsg.startsWith('✓') ? '#bbf7d0' : '#fde047', borderRadius: 8, marginBottom: 16, color: generadosMsg.startsWith('✓') ? '#15803d' : '#92400e' }}>
                {generadosMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowGenerar(false)} disabled={generando}>Cerrar</button>
              <button className="btn-primary" onClick={handleGenerarMasivo} disabled={generando}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0f766e' }}>
                {generando ? <Loader size={13} /> : <Zap size={13} />}
                {generando ? 'Generando…' : 'Generar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle Recibo */}
      {detalleRecibo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setDetalleRecibo(null); setTicketErrR('') }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 560, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#0f766e' }}>{detalleRecibo.folio}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtFecha(detalleRecibo.fecha_recibo)} · {fmtNombre(detalleRecibo.cat_arrendatarios)}</div>
              </div>
              <button onClick={() => { setDetalleRecibo(null); setTicketErrR('') }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
            </div>

            {/* Detalle líneas */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ padding: '7px 12px', background: 'var(--surface-800)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cuotas cubiertas</div>
              {detalleRecibo.recibos_loc_det.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                  <div>
                    <div>{d.concepto ?? '—'}</div>
                    {d.periodo && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtMes(d.periodo)}</div>}
                  </div>
                  <div style={{ fontWeight: 700 }}>{fmt$(d.monto_final)}</div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderTop: '1px solid var(--border)', background: '#f0fdfa', fontWeight: 700, color: '#0f766e' }}>
                <span>TOTAL</span><span>{fmt$(detalleRecibo.total)}</span>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              {detalleRecibo.forma_pago_nombre && <span>Forma de pago: <strong>{detalleRecibo.forma_pago_nombre}</strong></span>}
              {detalleRecibo.referencia_pago   && <span style={{ marginLeft: 12 }}>Ref: {detalleRecibo.referencia_pago}</span>}
            </div>
            {detalleRecibo.observaciones && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--surface-800)', borderRadius: 8, marginBottom: 14 }}>{detalleRecibo.observaciones}</div>
            )}

            {ticketErrR && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>{ticketErrR}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => handleImprimirRecibo(detalleRecibo)} disabled={imprimiendo}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: '1px solid #99f6e4', borderRadius: 10, background: '#f0fdfa', color: '#0f766e', cursor: 'pointer', opacity: imprimiendo ? 0.6 : 1 }}>
                <Printer size={14} /> {imprimiendo ? 'Imprimiendo…' : 'Imprimir'}
              </button>
              <button onClick={() => handleTicketPOS(detalleRecibo)} disabled={genTicketR}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 10, background: '#0f766e', color: '#fff', cursor: 'pointer', opacity: genTicketR ? 0.6 : 1 }}>
                <Receipt size={14} /> {genTicketR ? 'Generando…' : 'Ticket POS'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
