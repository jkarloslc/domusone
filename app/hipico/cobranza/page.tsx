'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { dbHip, dbCfg, dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, RefreshCw, ChevronLeft, Search, ChevronDown, ChevronRight,
  AlertCircle, DollarSign, Receipt, Printer, Loader, Zap, FileText,
} from 'lucide-react'
import Link from 'next/link'
import AsignacionModal, { type AsignacionData } from './AsignacionModal'
import CobrarHipicoModal, { type CargoPendiente, printReciboHipico } from './CobrarHipicoModal'

// ── Tipos ─────────────────────────────────────────────────────
type Tab = 'asignaciones' | 'cobranza' | 'recibos'

type Asignacion = {
  id: number
  folio: string
  id_arrendatario_fk: number
  id_caballeriza_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  renta_mensual: number
  moneda: string
  dia_pago: number | null
  status: string
  notas: string | null
  cat_arrendatarios: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null
  cat_caballerizas: { clave: string; nombre: string | null } | null
  // calculados
  pendientes:     number
  monto_pendiente: number
  con_adeudo:     boolean
}

type CargoCob = {
  id: number
  id_arrendatario_fk: number
  descripcion: string
  mes_aplicacion: string | null
  monto: number
  saldo: number
  status: string
  fecha_vencimiento: string | null
  cat_arrendatarios: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null
}

type PagoRow = {
  id: number
  folio: string
  id_arrendatario_fk: number
  fecha_pago: string
  monto_total: number
  forma_pago: string
  notas: string | null
  id_venta_pos_fk: number | null
  cat_arrendatarios: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null
}

type DetPago = { monto: number; ctrl_cargos: { descripcion: string; mes_aplicacion: string | null } | null }
type FormaPagoRow = { forma_nombre: string; monto: number; referencia: string | null }

// ── Helpers ──────────────────────────────────────────────────
const hoy = new Date().toLocaleDateString('en-CA')
const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMes = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const fmtNombre = (a: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string } | null) => {
  if (!a) return '—'
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}

const STATUS_ASIG_COLOR: Record<string, { bg: string; color: string }> = {
  'Vigente':         { bg: '#dcfce7', color: '#16a34a' },
  'Vencido':         { bg: '#fee2e2', color: '#dc2626' },
  'Cancelado':       { bg: '#f8fafc', color: '#64748b' },
  'En negociación':  { bg: '#fffbeb', color: '#d97706' },
}
const STATUS_CARGO_COLOR: Record<string, { bg: string; color: string }> = {
  'Pendiente':    { bg: '#fef9c3', color: '#ca8a04' },
  'Vencido':      { bg: '#fee2e2', color: '#dc2626' },
  'Pago Parcial': { bg: '#fffbeb', color: '#d97706' },
  'Pagado':       { bg: '#dcfce7', color: '#16a34a' },
}

// ── Componente ───────────────────────────────────────────────
export default function CobranzaHipicoPage() {
  const { canWrite, authUser } = useAuth()
  const puedeEscribir = canWrite('hipico-cobranza')
  const esAdmin = authUser?.rol === 'superadmin' || authUser?.rol === 'admin'

  const [tab, setTab] = useState<Tab>('asignaciones')

  // ── Asignaciones ──────────────────────────────────────────
  const [asignaciones, setAsignaciones]       = useState<Asignacion[]>([])
  const [loadingA, setLoadingA]               = useState(true)
  const [expandedA, setExpandedA]             = useState<number | null>(null)
  const [soloVigentes, setSoloVigentes]       = useState(true)
  const [busquedaA, setBusquedaA]             = useState('')
  const [filtroSituacion, setFiltroSituacion] = useState<'todas' | 'adeudo' | 'corriente'>('todas')

  // modales
  const [showAsignacion, setShowAsignacion]   = useState(false)
  const [editAsig, setEditAsig]               = useState<AsignacionData | undefined>(undefined)
  const [showCobrar, setShowCobrar]           = useState<{ cargos: CargoPendiente[]; nombreSocio: string; idArrendatario: number; idContrato: number } | null>(null)

  // generar cargo individual desde asignación
  const [generandoCargo, setGenerandoCargo]   = useState<number | null>(null)
  const [mesGenerar, setMesGenerar]           = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // ── Cobranza ──────────────────────────────────────────────
  const [mesCobranza, setMesCobranza]         = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [cargosCobranza, setCargosCobranza]   = useState<CargoCob[]>([])
  const [carteraVencida, setCarteraVencida]   = useState({ count: 0, monto: 0 })
  const [loadingC, setLoadingC]               = useState(false)
  const [busquedaC, setBusquedaC]             = useState('')
  const [filtroStatusC, setFiltroStatusC]     = useState<'todas' | 'por_cobrar' | 'pagadas'>('todas')

  // generar cargos del mes
  const [showGenerar, setShowGenerar]         = useState(false)
  const [mesGenerarAll, setMesGenerarAll]     = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [generando, setGenerando]             = useState(false)
  const [generadosMsg, setGeneradosMsg]       = useState('')

  // ── Recibos ───────────────────────────────────────────────
  const [pagos, setPagos]                     = useState<PagoRow[]>([])
  const [loadingR, setLoadingR]               = useState(false)
  const [busquedaR, setBusquedaR]             = useState('')
  const [detalleR, setDetalleR]               = useState<{ pago: PagoRow; det: DetPago[]; formas: FormaPagoRow[] } | null>(null)
  const [loadingDet, setLoadingDet]           = useState(false)
  const [imprimiendo, setImprimiendo]         = useState(false)
  const [genTicketRec, setGenTicketRec]       = useState(false)
  const [ticketErrRec, setTicketErrRec]       = useState('')

  // ── Stats ─────────────────────────────────────────────────
  const [stats, setStats] = useState({ activas: 0, pendientes: 0, montoPendiente: 0, vencidas: 0 })

  // ── Fetch Asignaciones ─────────────────────────────────────
  const fetchAsignaciones = useCallback(async () => {
    setLoadingA(true)
    let q = dbHip.from('ctrl_contratos')
      .select(`id, folio, id_arrendatario_fk, id_caballeriza_fk, fecha_inicio, fecha_fin,
        renta_mensual, moneda, dia_pago, status, notas,
        cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona),
        cat_caballerizas(clave, nombre)`)
      .order('created_at', { ascending: false })
    if (soloVigentes) q = q.eq('status', 'Vigente')
    const { data } = await q

    // Cargos pendientes por arrendatario
    const { data: cargosData } = await dbHip.from('ctrl_cargos')
      .select('id_arrendatario_fk, saldo, status, fecha_vencimiento')
      .in('status', ['Pendiente', 'Vencido', 'Pago Parcial'])

    const pendPorArr: Record<number, { count: number; monto: number }> = {}
    const adeudoPorArr: Record<number, boolean> = {}
    for (const c of (cargosData ?? []) as { id_arrendatario_fk: number; saldo: number; fecha_vencimiento: string | null }[]) {
      if (!pendPorArr[c.id_arrendatario_fk]) pendPorArr[c.id_arrendatario_fk] = { count: 0, monto: 0 }
      pendPorArr[c.id_arrendatario_fk].count++
      pendPorArr[c.id_arrendatario_fk].monto += c.saldo ?? 0
      if (c.fecha_vencimiento && c.fecha_vencimiento < hoy) adeudoPorArr[c.id_arrendatario_fk] = true
    }

    const result: Asignacion[] = ((data ?? []) as any[]).map(a => ({
      ...a,
      pendientes:     pendPorArr[a.id_arrendatario_fk]?.count ?? 0,
      monto_pendiente: pendPorArr[a.id_arrendatario_fk]?.monto ?? 0,
      con_adeudo:     adeudoPorArr[a.id_arrendatario_fk] ?? false,
    }))

    setAsignaciones(result)
    const vigentes = result.filter(a => a.status === 'Vigente')
    setStats({
      activas:       vigentes.length,
      pendientes:    vigentes.reduce((s, a) => s + a.pendientes, 0),
      montoPendiente: vigentes.reduce((s, a) => s + a.monto_pendiente, 0),
      vencidas:      vigentes.filter(a => a.con_adeudo).length,
    })
    setLoadingA(false)
  }, [soloVigentes])

  // ── Fetch Cobranza ────────────────────────────────────────
  const fetchCobranza = useCallback(async () => {
    setLoadingC(true)
    const mesIso = `${mesCobranza}-01`
    const [{ data: mesData }, { data: vData }] = await Promise.all([
      dbHip.from('ctrl_cargos')
        .select(`id, id_arrendatario_fk, descripcion, mes_aplicacion, monto, saldo, status, fecha_vencimiento,
          cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona)`)
        .eq('mes_aplicacion', mesIso)
        .neq('status', 'Cancelado')
        .order('fecha_vencimiento', { ascending: true }),
      dbHip.from('ctrl_cargos')
        .select('saldo, status, fecha_vencimiento')
        .in('status', ['Pendiente', 'Vencido', 'Pago Parcial']),
    ])

    setCargosCobranza(((mesData ?? []) as any[]).map(c => ({ ...c })) as CargoCob[])

    const vencidas = ((vData ?? []) as { saldo: number; fecha_vencimiento: string | null }[])
      .filter(c => c.fecha_vencimiento && c.fecha_vencimiento < hoy)
    setCarteraVencida({ count: vencidas.length, monto: vencidas.reduce((s, c) => s + (c.saldo ?? 0), 0) })
    setLoadingC(false)
  }, [mesCobranza])

  // ── Abrir cobro (carga todos los pendientes del arrendatario) ─
  const abrirCobro = async (c: CargoCob) => {
    const { data } = await dbHip.from('ctrl_cargos')
      .select('id, descripcion, mes_aplicacion, monto, saldo, status, fecha_vencimiento')
      .eq('id_arrendatario_fk', c.id_arrendatario_fk)
      .in('status', ['Pendiente', 'Vencido', 'Pago Parcial'])
      .order('fecha_vencimiento', { ascending: true })
    setShowCobrar({
      cargos: (data ?? []) as CargoPendiente[],
      nombreSocio: fmtNombre(c.cat_arrendatarios),
      idArrendatario: c.id_arrendatario_fk,
      idContrato: 0,
    })
  }

  // ── Abrir cobro desde asignación ──────────────────────────
  const abrirCobroDesdeAsig = async (a: Asignacion) => {
    const { data } = await dbHip.from('ctrl_cargos')
      .select('id, descripcion, mes_aplicacion, monto, saldo, status, fecha_vencimiento')
      .eq('id_arrendatario_fk', a.id_arrendatario_fk)
      .in('status', ['Pendiente', 'Vencido', 'Pago Parcial'])
      .order('fecha_vencimiento', { ascending: true })
    setShowCobrar({
      cargos: (data ?? []) as CargoPendiente[],
      nombreSocio: fmtNombre(a.cat_arrendatarios),
      idArrendatario: a.id_arrendatario_fk,
      idContrato: a.id,
    })
  }

  // ── Generar cargo individual desde asignación ─────────────
  const handleGenerarCargoAsig = async (a: Asignacion, mes: string) => {
    setGenerandoCargo(a.id)
    const mesIso = `${mes}-01`
    // Verificar si ya existe cargo para ese mes
    const { data: existing } = await dbHip.from('ctrl_cargos')
      .select('id').eq('id_arrendatario_fk', a.id_arrendatario_fk)
      .eq('mes_aplicacion', mesIso).limit(1)
    if (existing && existing.length > 0) {
      setGenerandoCargo(null)
      alert('Ya existe un cargo para ese mes en este socio.')
      return
    }
    const [anio, numMes] = mes.split('-')
    const dia = a.dia_pago ?? 1
    const diasEnMes = new Date(Number(anio), Number(numMes), 0).getDate()
    const diaVenc = Math.min(dia, diasEnMes)
    const fechaVenc = `${anio}-${numMes}-${String(diaVenc).padStart(2, '0')}`
    const cab = a.cat_caballerizas ? ` — ${a.cat_caballerizas.clave}${a.cat_caballerizas.nombre ? ` ${a.cat_caballerizas.nombre}` : ''}` : ''
    const mesLabel = new Date(mesIso + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    await dbHip.from('ctrl_cargos').insert({
      id_arrendatario_fk: a.id_arrendatario_fk,
      descripcion: `Renta de Caballeriza${cab} — ${mesLabel}`,
      mes_aplicacion: mesIso,
      monto: a.renta_mensual,
      saldo: a.renta_mensual,
      fecha_vencimiento: fechaVenc,
      status: 'Pendiente',
    })
    setGenerandoCargo(null)
    fetchAsignaciones()
  }

  // ── Generar cargos masivos del mes ─────────────────────────
  const handleGenerarMasivo = async () => {
    setGenerando(true); setGeneradosMsg('')
    const mesIso = `${mesGenerarAll}-01`
    // Traer contratos vigentes
    const { data: vigentes } = await dbHip.from('ctrl_contratos')
      .select(`id, id_arrendatario_fk, id_caballeriza_fk, renta_mensual, dia_pago,
        cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona),
        cat_caballerizas(clave, nombre)`)
      .eq('status', 'Vigente')
    // Cargos ya generados ese mes
    const { data: yaGenerados } = await dbHip.from('ctrl_cargos')
      .select('id_arrendatario_fk').eq('mes_aplicacion', mesIso)
    const yaIds = new Set(((yaGenerados ?? []) as { id_arrendatario_fk: number }[]).map(c => c.id_arrendatario_fk))

    const [anio, numMes] = mesGenerarAll.split('-')
    const mesLabel = new Date(mesIso + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
    const diasEnMes = new Date(Number(anio), Number(numMes), 0).getDate()

    const inserts: object[] = []
    for (const a of ((vigentes ?? []) as any[])) {
      if (yaIds.has(a.id_arrendatario_fk)) continue
      const dia = a.dia_pago ?? 1
      const diaVenc = Math.min(dia, diasEnMes)
      const fechaVenc = `${anio}-${numMes}-${String(diaVenc).padStart(2, '0')}`
      const cab = a.cat_caballerizas ? ` — ${a.cat_caballerizas.clave}${a.cat_caballerizas.nombre ? ` ${a.cat_caballerizas.nombre}` : ''}` : ''
      inserts.push({
        id_arrendatario_fk: a.id_arrendatario_fk,
        descripcion: `Renta de Caballeriza${cab} — ${mesLabel}`,
        mes_aplicacion: mesIso,
        monto: a.renta_mensual,
        saldo: a.renta_mensual,
        fecha_vencimiento: fechaVenc,
        status: 'Pendiente',
      })
    }

    if (inserts.length === 0) {
      setGeneradosMsg(`Todos los contratos vigentes ya tienen cargo generado para ${mesLabel}.`)
    } else {
      await dbHip.from('ctrl_cargos').insert(inserts)
      setGeneradosMsg(`✓ ${inserts.length} cargos generados para ${mesLabel}.`)
    }
    setGenerando(false)
    fetchCobranza()
    fetchAsignaciones()
  }

  // ── Fetch Recibos ─────────────────────────────────────────
  const fetchRecibos = useCallback(async () => {
    setLoadingR(true)
    const { data } = await dbHip.from('ctrl_pagos')
      .select(`id, folio, id_arrendatario_fk, fecha_pago, monto_total, forma_pago, notas, id_venta_pos_fk,
        cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona)`)
      .order('created_at', { ascending: false }).limit(300)
    setPagos(((data ?? []) as any[]) as PagoRow[])
    setLoadingR(false)
  }, [])

  const abrirDetalleRecibo = async (p: PagoRow) => {
    setLoadingDet(true); setDetalleR(null); setTicketErrRec('')
    const [{ data: det }, { data: formas }] = await Promise.all([
      dbHip.from('ctrl_pagos_det')
        .select('monto, ctrl_cargos(descripcion, mes_aplicacion)')
        .eq('id_pago_fk', p.id),
      dbHip.from('ctrl_pagos_formas')
        .select('forma_nombre, monto, referencia')
        .eq('id_pago_fk', p.id),
    ])
    setDetalleR({ pago: p, det: (det ?? []) as unknown as DetPago[], formas: (formas ?? []) as FormaPagoRow[] })
    setLoadingDet(false)
  }

  const handleImprimirDetalle = async () => {
    if (!detalleR) return
    setImprimiendo(true)
    await printReciboHipico(detalleR.pago.id, detalleR.pago.folio, fmtNombre(detalleR.pago.cat_arrendatarios))
    setImprimiendo(false)
  }

  const handleTicketDesdeDetalle = async () => {
    if (!detalleR) return
    setGenTicketRec(true); setTicketErrRec('')
    try {
      const p = detalleR.pago
      const [{ data: centros }, { data: cfg }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, rfc, direccion, telefono, municipio, leyenda_ticket').single(),
      ])
      const centrosPos = (centros as { id: number; nombre: string }[]) ?? []
      if (!centrosPos.length) throw new Error('No hay centros POS activos.')
      const centroHip = centrosPos.find(c => { const n = norm(c.nombre); return n.includes('hipico') || n.includes('caballeriza') }) ?? centrosPos[0]

      let ventaId = p.id_venta_pos_fk
      let folioDia = 0
      const fechaIso = `${p.fecha_pago}T12:00:00`

      if (!ventaId) {
        const { data: maxF } = await dbGolf.from('ctrl_ventas').select('folio_dia')
          .eq('id_centro_fk', centroHip.id)
          .gte('fecha', `${p.fecha_pago}T00:00:00`).lte('fecha', `${p.fecha_pago}T23:59:59`)
          .order('folio_dia', { ascending: false }).limit(1)
        folioDia = maxF && maxF.length > 0 ? ((maxF[0] as any).folio_dia + 1) : 1
        const { data: venta, error: ev } = await dbGolf.from('ctrl_ventas').insert({
          folio_dia: folioDia, id_centro_fk: centroHip.id, fecha: fechaIso,
          nombre_cliente: fmtNombre(p.cat_arrendatarios), es_socio: false,
          subtotal: p.monto_total, descuento: 0, iva: 0, total: p.monto_total,
          status: 'PAGADA', usuario_crea: authUser?.user?.email ?? 'hipico',
          notas: `Ticket POS desde recibo hípico ${p.folio}`,
        }).select('id, folio_dia').single()
        if (ev || !venta) throw new Error(ev?.message ?? 'Error al crear venta POS')
        ventaId = (venta as any).id; folioDia = (venta as any).folio_dia
        const rows = detalleR.det.map(d => ({
          id_venta_fk: ventaId!, id_producto_fk: null,
          concepto: d.ctrl_cargos?.descripcion ?? '—', cantidad: 1,
          precio_unitario: d.monto, descuento: 0, iva_pct: 0, iva: 0, subtotal: d.monto, total: d.monto, notas: null,
        }))
        await dbGolf.from('ctrl_ventas_det').insert(rows.length ? rows : [{
          id_venta_fk: ventaId!, id_producto_fk: null, concepto: `Cobro Hípico ${p.folio}`,
          cantidad: 1, precio_unitario: p.monto_total, descuento: 0, iva_pct: 0, iva: 0, subtotal: p.monto_total, total: p.monto_total, notas: null,
        }])
        const pagRows = detalleR.formas.map(f => ({ id_venta_fk: ventaId!, id_forma_fk: null, forma_nombre: f.forma_nombre, monto: f.monto }))
        if (pagRows.length) await dbGolf.from('ctrl_ventas_pagos').insert(pagRows)
        await dbHip.from('ctrl_pagos').update({ id_venta_pos_fk: ventaId }).eq('id', p.id)
        setPagos(prev => prev.map(x => x.id === p.id ? { ...x, id_venta_pos_fk: ventaId } : x))
        setDetalleR(prev => prev ? { ...prev, pago: { ...prev.pago, id_venta_pos_fk: ventaId } } : prev)
      }

      const cfgP = cfg as { razon_social: string | null; municipio: string | null; direccion: string | null; rfc: string | null; telefono: string | null; leyenda_ticket: string | null } | null
      const ticketData = {
        id: ventaId, folio_dia: folioDia || '—', fecha: fechaIso,
        cliente: fmtNombre(p.cat_arrendatarios), cajero: authUser?.user?.email ?? '—', centro: centroHip.nombre,
        razon_social: cfgP?.razon_social ?? 'Club Hípico Balvanera',
        municipio: cfgP?.municipio ?? '', direccion: cfgP?.direccion ?? '', rfc: cfgP?.rfc ?? '', telefono: cfgP?.telefono ?? '',
        leyenda: cfgP?.leyenda_ticket ?? '¡Gracias por su visita!',
        subtotal: p.monto_total, iva: 0, total: p.monto_total,
        pagos: detalleR.formas.map(f => ({ forma: f.forma_nombre, monto: f.monto })),
        items: detalleR.det.map(d => ({ concepto: d.ctrl_cargos?.descripcion ?? '—', cantidad: 1, precio_unitario: d.monto, iva: 0, total: d.monto })),
      }
      window.open(`/ticket-golf.html?data=${encodeURIComponent(JSON.stringify(ticketData))}&print=1`, '_blank', 'width=400,height=700')
    } catch (e: any) {
      setTicketErrRec(e?.message ?? 'Error al generar ticket')
    } finally {
      setGenTicketRec(false)
    }
  }

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => { fetchAsignaciones() }, [fetchAsignaciones])
  useEffect(() => { if (tab === 'cobranza') fetchCobranza() }, [tab, fetchCobranza])
  useEffect(() => { if (tab === 'recibos') fetchRecibos() }, [tab, fetchRecibos])

  // ── Filtros ───────────────────────────────────────────────
  const asigFiltradas = asignaciones.filter(a => {
    if (filtroSituacion === 'adeudo' && !a.con_adeudo) return false
    if (filtroSituacion === 'corriente' && a.con_adeudo) return false
    if (busquedaA) {
      const q = norm(busquedaA)
      const nombre = norm(fmtNombre(a.cat_arrendatarios))
      const cab = norm(a.cat_caballerizas?.clave ?? '')
      if (!nombre.includes(q) && !cab.includes(q) && !norm(a.folio).includes(q)) return false
    }
    return true
  })

  const cobFiltradas = cargosCobranza.filter(c => {
    if (filtroStatusC === 'por_cobrar' && !['Pendiente', 'Vencido', 'Pago Parcial'].includes(c.status)) return false
    if (filtroStatusC === 'pagadas' && c.status !== 'Pagado') return false
    if (busquedaC) {
      const q = norm(busquedaC)
      if (!norm(fmtNombre(c.cat_arrendatarios)).includes(q) && !norm(c.descripcion).includes(q)) return false
    }
    return true
  })

  const pagosFiltrados = pagos.filter(p =>
    !busquedaR || norm(fmtNombre(p.cat_arrendatarios)).includes(norm(busquedaR)) || norm(p.folio).includes(norm(busquedaR))
  )

  // ── KPIs cobranza ─────────────────────────────────────────
  const cobKpis = {
    totalMes:   cargosCobranza.reduce((s, c) => s + c.monto, 0),
    cobradoMes: cargosCobranza.filter(c => c.status === 'Pagado').reduce((s, c) => s + c.monto, 0),
    pendienteMes: cargosCobranza.filter(c => ['Pendiente', 'Vencido', 'Pago Parcial'].includes(c.status)).reduce((s, c) => s + c.saldo, 0),
    countMes:   cargosCobranza.length,
  }

  // ── Render ────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: 'asignaciones', label: 'Asignaciones' },
    { id: 'cobranza',     label: 'Cobranza' },
    { id: 'recibos',      label: 'Recibos' },
  ]

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Link href="/hipico" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>
              <ChevronLeft size={14} /> Hípico
            </Link>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Cobranza Hípico</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Asignaciones de caballerizas, cargos y recibos</p>
        </div>
        {puedeEscribir && tab === 'asignaciones' && (
          <button className="btn-primary" onClick={() => { setEditAsig(undefined); setShowAsignacion(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Nueva Asignación
          </button>
        )}
        {puedeEscribir && tab === 'cobranza' && (
          <button className="btn-primary" onClick={() => { setShowGenerar(true); setGeneradosMsg('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} /> Generar Cargos del Mes
          </button>
        )}
      </div>

      {/* Stats cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Asignaciones activas', value: stats.activas, color: '#16a34a' },
          { label: 'Cargos pendientes', value: stats.pendientes, color: '#d97706' },
          { label: 'Monto pendiente', value: fmt$(stats.montoPendiente), color: '#dc2626' },
          { label: 'Con adeudo vencido', value: stats.vencidas, color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} className="card" style={{ flex: '1 1 160px', maxWidth: 220, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? '#b45309' : 'var(--text-muted)', background: 'none', border: 'none',
              borderBottom: tab === t.id ? '2px solid #b45309' : '2px solid transparent',
              marginBottom: -2, cursor: 'pointer', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Asignaciones ──────────────────────────────── */}
      {tab === 'asignaciones' && (
        <div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input" placeholder="Buscar socio, caballeriza, folio…" value={busquedaA}
                onChange={e => setBusquedaA(e.target.value)}
                style={{ paddingLeft: 30, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['todas', 'adeudo', 'corriente'] as const).map(s => (
                <button key={s} onClick={() => setFiltroSituacion(s)}
                  style={{ padding: '5px 12px', fontSize: 12, borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: filtroSituacion === s ? '#b45309' : 'var(--surface-800)', color: filtroSituacion === s ? '#fff' : 'var(--text-secondary)' }}>
                  {s === 'todas' ? 'Todos' : s === 'adeudo' ? 'Con adeudo' : 'Al corriente'}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={soloVigentes} onChange={e => setSoloVigentes(e.target.checked)} style={{ accentColor: '#b45309' }} />
              Solo vigentes
            </label>
            <button onClick={fetchAsignaciones} style={{ padding: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)' }}>
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Tabla */}
          {loadingA ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><Loader size={20} /></div>
          ) : asigFiltradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin asignaciones</div>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-800)' }}>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }} />
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Socio</th>
                    <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Caballeriza</th>
                    <th style={{ padding: '8px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Renta/mes</th>
                    <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Pendientes</th>
                    <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Situación</th>
                    <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }} />
                  </tr>
                </thead>
                <tbody>
                  {asigFiltradas.map((a, i) => (
                    <Fragment key={a.id}>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)', cursor: 'pointer' }}
                        onClick={() => setExpandedA(expandedA === a.id ? null : a.id)}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                          {expandedA === a.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{fmtNombre(a.cat_arrendatarios)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.folio}</div>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                          {a.cat_caballerizas ? `${a.cat_caballerizas.clave}${a.cat_caballerizas.nombre ? ` — ${a.cat_caballerizas.nombre}` : ''}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt$(a.renta_mensual)} {a.moneda !== 'MXN' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.moneda}</span>}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {a.pendientes > 0 ? (
                            <span style={{ fontWeight: 700, color: '#dc2626' }}>{a.pendientes} ({fmt$(a.monto_pendiente)})</span>
                          ) : <span style={{ color: '#16a34a' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {a.con_adeudo
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#dc2626' }}><AlertCircle size={12} /> Adeudo</span>
                            : <span style={{ fontSize: 11, color: '#16a34a' }}>Al corriente</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                            background: STATUS_ASIG_COLOR[a.status]?.bg ?? '#f8fafc',
                            color:      STATUS_ASIG_COLOR[a.status]?.color ?? '#64748b' }}>
                            {a.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                          {puedeEscribir && (
                            <button onClick={() => { setEditAsig({ id: a.id, folio: a.folio, id_arrendatario_fk: a.id_arrendatario_fk, id_caballeriza_fk: a.id_caballeriza_fk, fecha_inicio: a.fecha_inicio, fecha_fin: a.fecha_fin, renta_mensual: a.renta_mensual, dia_pago: a.dia_pago ?? 1, moneda: a.moneda, status: a.status, notas: a.notas }); setShowAsignacion(true) }}
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedA === a.id && (
                        <tr>
                          <td colSpan={8} style={{ background: '#fafaf8', padding: '14px 28px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                              <span><strong>Inicio:</strong> {fmtFecha(a.fecha_inicio)}</span>
                              {a.fecha_fin && <span><strong>Fin:</strong> {fmtFecha(a.fecha_fin)}</span>}
                              {a.dia_pago && <span><strong>Día de venc.:</strong> {a.dia_pago}</span>}
                              {a.notas && <span><strong>Notas:</strong> {a.notas}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {puedeEscribir && (
                                <>
                                  <select value={mesGenerar} onChange={e => setMesGenerar(e.target.value)}
                                    style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}>
                                    {Array.from({ length: 12 }, (_, i) => {
                                      const d = new Date(); d.setMonth(d.getMonth() - 2 + i)
                                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                                    }).map(m => <option key={m} value={m}>{fmtMes(m + '-01')}</option>)}
                                  </select>
                                  <button onClick={() => handleGenerarCargoAsig(a, mesGenerar)} disabled={generandoCargo === a.id}
                                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px', borderRadius: 8, border: '1px solid #b45309', background: '#fff7ed', color: '#b45309', cursor: 'pointer', opacity: generandoCargo === a.id ? 0.6 : 1 }}>
                                    {generandoCargo === a.id ? <Loader size={12} /> : <Plus size={12} />} Agregar Cargo
                                  </button>
                                </>
                              )}
                              {a.pendientes > 0 && puedeEscribir && (
                                <button onClick={() => abrirCobroDesdeAsig(a)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 12px', borderRadius: 8, border: 'none', background: '#b45309', color: '#fff', cursor: 'pointer' }}>
                                  <DollarSign size={12} /> Cobrar ({fmt$(a.monto_pendiente)})
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Cobranza ────────────────────────────────── */}
      {tab === 'cobranza' && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Total del mes', value: fmt$(cobKpis.totalMes), color: '#0D4F80' },
              { label: 'Cobrado del mes', value: fmt$(cobKpis.cobradoMes), color: '#16a34a' },
              { label: 'Por cobrar', value: fmt$(cobKpis.pendienteMes), color: '#d97706' },
              { label: 'Cartera vencida', value: `${carteraVencida.count} · ${fmt$(carteraVencida.monto)}`, color: '#dc2626' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 140px', maxWidth: 200, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <input type="month" value={mesCobranza} onChange={e => setMesCobranza(e.target.value)}
              className="input" style={{ maxWidth: 160 }} />
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input" placeholder="Buscar socio…" value={busquedaC}
                onChange={e => setBusquedaC(e.target.value)} style={{ paddingLeft: 30, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {([['todas', 'Todos'], ['por_cobrar', 'Por cobrar'], ['pagadas', 'Pagadas']] as [string, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setFiltroStatusC(k as typeof filtroStatusC)}
                  style={{ padding: '5px 12px', fontSize: 12, borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: filtroStatusC === k ? '#b45309' : 'var(--surface-800)', color: filtroStatusC === k ? '#fff' : 'var(--text-secondary)' }}>
                  {l}
                </button>
              ))}
            </div>
            <button onClick={fetchCobranza} style={{ padding: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)' }}>
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Tabla cargos */}
          {loadingC ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader size={20} style={{ color: 'var(--text-muted)' }} /></div>
          ) : cobFiltradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              Sin cargos para {fmtMes(`${mesCobranza}-01`)}
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-800)' }}>
                    {['Socio', 'Descripción', 'Mes', 'Monto', 'Saldo', 'Vencimiento', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Monto' || h === 'Saldo' ? 'right' : 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cobFiltradas.map((c, i) => {
                    const vencida = c.fecha_vencimiento && c.fecha_vencimiento < hoy && c.status !== 'Pagado'
                    const col = STATUS_CARGO_COLOR[c.status] ?? { bg: '#f8fafc', color: '#64748b' }
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmtNombre(c.cat_arrendatarios)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descripcion}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{fmtMes(c.mes_aplicacion)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmt$(c.monto)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt$(c.saldo)}</td>
                        <td style={{ padding: '10px 14px', color: vencida ? '#dc2626' : 'var(--text-secondary)', fontWeight: vencida ? 700 : 400 }}>{fmtFecha(c.fecha_vencimiento)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: col.bg, color: col.color }}>{c.status}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {puedeEscribir && ['Pendiente', 'Vencido', 'Pago Parcial'].includes(c.status) && (
                            <button onClick={() => abrirCobro(c)}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#b45309', color: '#fff', cursor: 'pointer' }}>
                              <DollarSign size={12} /> Cobrar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Recibos ──────────────────────────────────── */}
      {tab === 'recibos' && (
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="input" placeholder="Buscar socio, folio…" value={busquedaR}
                onChange={e => setBusquedaR(e.target.value)} style={{ paddingLeft: 30, width: '100%' }} />
            </div>
            <button onClick={fetchRecibos} style={{ padding: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)' }}>
              <RefreshCw size={13} />
            </button>
          </div>

          {loadingR ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader size={20} style={{ color: 'var(--text-muted)' }} /></div>
          ) : pagosFiltrados.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin recibos</div>
          ) : (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-800)' }}>
                    {['Folio', 'Socio', 'Fecha', 'Total', 'Forma de pago', ''].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Total' ? 'right' : 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagosFiltrados.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)', cursor: 'pointer' }}
                      onClick={() => abrirDetalleRecibo(p)}>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#b45309' }}>{p.folio}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmtNombre(p.cat_arrendatarios)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{fmtFecha(p.fecha_pago)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt$(p.monto_total)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{p.forma_pago || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Nueva / Editar Asignación ─────────────── */}
      {showAsignacion && (
        <AsignacionModal
          asignacion={editAsig}
          onClose={() => setShowAsignacion(false)}
          onSaved={() => { setShowAsignacion(false); fetchAsignaciones() }}
        />
      )}

      {/* ── Modal: Cobrar ──────────────────────────────────── */}
      {showCobrar && (
        <CobrarHipicoModal
          cargos={showCobrar.cargos}
          nombreSocio={showCobrar.nombreSocio}
          idArrendatario={showCobrar.idArrendatario}
          idContrato={showCobrar.idContrato}
          onClose={() => setShowCobrar(null)}
          onSaved={() => { fetchAsignaciones(); fetchCobranza(); fetchRecibos() }}
        />
      )}

      {/* ── Modal: Generar cargos masivos ─────────────────── */}
      {showGenerar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { if (!generando) setShowGenerar(false) }}>
          <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Generar Cargos del Mes</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
              Crea un cargo de renta para cada contrato vigente que aún no tenga cargo en el periodo seleccionado.
            </div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Periodo</label>
            <input type="month" value={mesGenerarAll} onChange={e => setMesGenerarAll(e.target.value)}
              className="input" style={{ width: '100%', marginBottom: 16 }} />
            {generadosMsg && (
              <div style={{ fontSize: 13, padding: '10px 14px', background: generadosMsg.startsWith('✓') ? '#f0fdf4' : '#fef9c3', border: '1px solid', borderColor: generadosMsg.startsWith('✓') ? '#bbf7d0' : '#fde047', borderRadius: 8, marginBottom: 16, color: generadosMsg.startsWith('✓') ? '#15803d' : '#92400e' }}>
                {generadosMsg}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowGenerar(false)} disabled={generando}>Cerrar</button>
              <button className="btn-primary" onClick={handleGenerarMasivo} disabled={generando}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {generando ? <Loader size={13} /> : <Zap size={13} />}
                {generando ? 'Generando…' : 'Generar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalle de Recibo ───────────────────────── */}
      {(detalleR || loadingDet) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setDetalleR(null); setTicketErrRec('') }}>
          <div style={{ background: 'var(--bg)', borderRadius: 16, padding: 24, maxWidth: 560, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            {loadingDet ? (
              <div style={{ textAlign: 'center', padding: 32 }}><Loader size={20} style={{ color: 'var(--text-muted)' }} /></div>
            ) : detalleR && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#b45309' }}>{detalleR.pago.folio}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{fmtFecha(detalleR.pago.fecha_pago)} · {fmtNombre(detalleR.pago.cat_arrendatarios)}</div>
                  </div>
                  <button onClick={() => { setDetalleR(null); setTicketErrRec('') }}
                    style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
                </div>

                {/* Detalle de cargos */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ padding: '7px 12px', background: 'var(--surface-800)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cargos cubiertos</div>
                  {detalleR.det.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                      <div>
                        <div>{d.ctrl_cargos?.descripcion ?? '—'}</div>
                        {d.ctrl_cargos?.mes_aplicacion && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtMes(d.ctrl_cargos.mes_aplicacion)}</div>}
                      </div>
                      <div style={{ fontWeight: 700 }}>{fmt$(d.monto)}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderTop: '1px solid var(--border)', background: '#fff7ed', fontWeight: 700, color: '#b45309' }}>
                    <span>TOTAL</span>
                    <span>{fmt$(detalleR.pago.monto_total)}</span>
                  </div>
                </div>

                {/* Formas de pago */}
                {detalleR.formas.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{ padding: '7px 12px', background: 'var(--surface-800)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Formas de pago</div>
                    {detalleR.formas.map((f, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                        <span>{f.forma_nombre}{f.referencia ? ` · ${f.referencia}` : ''}</span>
                        <span style={{ fontWeight: 600 }}>{fmt$(f.monto)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {detalleR.pago.notas && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--surface-800)', borderRadius: 8, marginBottom: 14 }}>{detalleR.pago.notas}</div>
                )}

                {ticketErrRec && (
                  <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>{ticketErrRec}</div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={handleImprimirDetalle} disabled={imprimiendo}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: '1px solid #fed7aa', borderRadius: 10, background: '#fff7ed', color: '#b45309', cursor: 'pointer', opacity: imprimiendo ? 0.6 : 1 }}>
                    <Printer size={14} /> {imprimiendo ? 'Imprimiendo…' : 'Imprimir'}
                  </button>
                  <button onClick={handleTicketDesdeDetalle} disabled={genTicketRec}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 10, background: '#b45309', color: '#fff', cursor: 'pointer', opacity: genTicketRec ? 0.6 : 1 }}>
                    <Receipt size={14} /> {genTicketRec ? 'Generando…' : 'Ticket POS'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
