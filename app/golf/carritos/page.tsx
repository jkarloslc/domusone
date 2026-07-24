'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, ChevronLeft, Car, Settings, Search, X, ChevronDown, ChevronRight, AlertCircle, CreditCard, Receipt, FileText, Printer, Loader, XCircle, MapPin, ArrowRightLeft } from 'lucide-react'
import Link from 'next/link'
import CarritoModal from './CarritoModal'
import PensionModal from './PensionModal'
import CambiarTitularModal from './CambiarTitularModal'
import CobrarCuotaModal from './CobrarCuotaModal'
import MesaControl from './MesaControl'
import { periodoCorte, cuotaExigible } from '../salidas-carritos/adeudos'

// ── Tipos ─────────────────────────────────────────────────────
type Pension = {
  id: number
  id_socio_fk: number
  id_carrito_fk: number
  id_slot_fk: number | null
  id_familiar_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  monto_mensual: number
  activo: boolean
  observaciones: string | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_familiares: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; parentesco: string | null } | null
  cat_carritos: { marca: string | null; modelo: string | null; tipo: string; color: string | null; placa: string | null; con_cargador: boolean } | null
  cat_slots: { numero: string } | null
  pendientes: number    // cuotas pendientes (calculado)
  monto_pendiente: number
  con_adeudo: boolean   // cuota sin pagar del mes en curso o anteriores (calculado)
}

type Cuota = {
  id: number
  id_socio_fk: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  saldo: number          // saldo restante a pagar
  status: string
  fecha_emision: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  forma_pago: string | null
  tipo: string
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null
}

type Slot = { id: number; numero: string }

// ── Cobranza (seguimiento mensual) ─────────────────────────
type CuotaCobranza = {
  id: number
  id_socio_fk: number
  id_pension_fk: number | null
  concepto: string
  periodo: string | null
  monto_final: number
  saldo: number | null
  status: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  ctrl_pensiones: {
    cat_slots: { numero: string } | null
    cat_carritos: { marca: string | null; modelo: string | null; placa: string | null } | null
    cat_familiares: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; parentesco: string | null } | null
  } | null
}

// Saldo efectivo de una cuota (PAGADO → 0; sin saldo registrado → monto completo)
const saldoCuota = (c: { saldo: number | null; monto_final: number; status: string }) =>
  c.saldo ?? (c.status === 'PAGADO' ? 0 : c.monto_final)

type CarritoFull = {
  id: number
  id_socio_fk: number
  id_familiar_fk: number | null
  marca: string | null
  modelo: string | null
  anio: number | null
  color: string | null
  numero_serie: string | null
  placa: string | null
  tipo: string
  con_cargador: boolean
  activo: boolean
  observaciones: string | null
}

const hoy = new Date().toISOString().split('T')[0]
const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const vencida = (f: string | null) => f ? f < hoy : false

// ── Tipo recibo pensión carrito ────────────────────────────
type DetRecibo = {
  id: number
  concepto: string
  tipo: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
}
type ReciboCarrito = {
  id: number
  folio: string
  fecha_recibo: string
  subtotal: number
  descuento: number
  total: number
  forma_pago_nombre: string | null
  referencia_pago: string | null
  observaciones: string | null
  usuario_cobra: string | null
  status: string
  id_venta_pos_fk: number | null
  id_forma_pago_fk: number | null
  id_socio_fk: number
  facturable: boolean
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  recibos_golf_det: DetRecibo[]
}
type PosCfg = { razon_social: string | null; rfc: string | null; direccion: string | null; telefono: string | null; municipio: string | null; leyenda_ticket: string | null }

const INSTITUCION = {
  nombre:    'Balvanera Golf, Polo & Country Club',
  rfc:       'CGB000101AAA',
  domicilio: 'Balvanera, Corregidora, Querétaro',
}
// Cuotas de pensión de carrito causan IVA — el monto capturado (monto_final) ya lo
// incluye, se desglosa hacia adentro para el CFDI.
const IVA_PCT_CUOTAS = 16
const desglosarIva = (montoConIva: number) => {
  const subtotal = Math.round((montoConIva / (1 + IVA_PCT_CUOTAS / 100)) * 100) / 100
  const iva      = Math.round((montoConIva - subtotal) * 100) / 100
  return { subtotal, iva }
}
const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  VIGENTE:   { bg: '#dcfce7', color: '#15803d', label: 'Vigente' },
  CANCELADO: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelado' },
}
const normR = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const ncR = (s: ReciboCarrito['cat_socios']) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const fechaFmtR = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

type Tab = 'pensiones' | 'cobranza' | 'recibos' | 'config' | 'mesa'

export default function CarritosPage() {
  const { canWrite, authUser } = useAuth()
  const puedeEscribir = canWrite('golf-carritos')
  // Administración: cambio/liberación de cajón y tab Mesa de Control
  const esAdmin = authUser?.rol === 'superadmin' || authUser?.rol === 'admin'

  const [tab, setTab] = useState<Tab>('pensiones')

  // ── Pensiones ─────────────────────────────────────────────
  const [pensiones, setPensiones]       = useState<Pension[]>([])
  const [loadingP, setLoadingP]         = useState(true)
  const [expandido, setExpandido]       = useState<number | null>(null)
  const [soloActivas, setSoloActivas]   = useState(true)
  const [busquedaP, setBusquedaP]       = useState('')
  const [filtroSituacion, setFiltroSituacion] = useState<'todas' | 'adeudo' | 'corriente'>('todas')

  // modales
  const [showCarrito, setShowCarrito]   = useState(false)
  const [editCarrito, setEditCarrito]   = useState<CarritoFull | null>(null)
  const [loadingEdit, setLoadingEdit]   = useState(false)
  const [showPension, setShowPension]   = useState<{
    idSocio: number; idCarrito: number; nombreSocio: string; descCarrito: string
    idFamiliar?: number | null; nombreFamiliar?: string | null
    idPension?: number; idSlotExistente?: number | null; montoMensualExistente?: number
  } | null>(null)
  const [carritoNuevo, setCarritoNuevo] = useState<{ id: number; id_socio_fk: number; id_familiar_fk?: number | null } | null>(null)

  const [showCobrar, setShowCobrar]     = useState<{ cuotas: Cuota[]; nombreSocio: string; idSocio: number } | null>(null)

  // ── Cambio / liberación de cajón ──────────────────────────
  const [showSlot, setShowSlot]         = useState<{ idPension: number; idSlotActual: number | null; nombreSocio: string; descCarrito: string } | null>(null)
  const [slotsDisp, setSlotsDisp]       = useState<Slot[]>([])
  const [slotSel, setSlotSel]           = useState<number | ''>('')
  const [savingSlotSel, setSavingSlotSel] = useState(false)
  const [errorSlot, setErrorSlot]       = useState('')

  // ── Cambio de titular (venta de carrito entre socios) ─────
  const [showTitular, setShowTitular]   = useState<{
    idPension: number; idCarrito: number; idSocioActual: number; nombreSocioActual: string
    idFamiliarActual: number | null; descCarrito: string
  } | null>(null)

  // ── Cobranza ──────────────────────────────────────────────
  const [mesCobranza, setMesCobranza]   = useState(new Date().toISOString().slice(0, 7))
  const [cuotasMes, setCuotasMes]       = useState<CuotaCobranza[]>([])
  const [carteraVencida, setCarteraVencida] = useState({ count: 0, monto: 0 })
  const [loadingC, setLoadingC]         = useState(false)
  const [busquedaC, setBusquedaC]       = useState('')
  const [filtroStatusC, setFiltroStatusC] = useState<'todas' | 'por_cobrar' | 'pagadas'>('todas')

  // ── Recibos ───────────────────────────────────────────────
  const [recibos, setRecibos]           = useState<ReciboCarrito[]>([])
  const [loadingR, setLoadingR]         = useState(false)
  const [busquedaR, setBusquedaR]       = useState('')
  const [filtroStatusR, setFiltroStatusR] = useState('VIGENTE')
  const [detalleRecibo, setDetalleRecibo] = useState<ReciboCarrito | null>(null)
  const [generandoTicketR, setGenerandoTicketR] = useState(false)
  const [ticketErrR, setTicketErrR]     = useState('')
  const printReciboRef = useRef<HTMLDivElement>(null)

  // ── Config ────────────────────────────────────────────────
  const [tarifa, setTarifa]             = useState<number>(0)
  const [tarifaEdit, setTarifaEdit]     = useState<number>(0)
  const [savingConfig, setSavingConfig] = useState(false)
  const [slots, setSlots]               = useState<Slot[]>([])
  const [slotsOcupados, setSlotsOcupados] = useState<Set<number>>(new Set())
  const [nuevoSlot, setNuevoSlot]       = useState('')
  const [savingSlot, setSavingSlot]     = useState(false)
  const [centrosVenta, setCentrosVenta] = useState<{ id: number; nombre: string }[]>([])
  const [idCentroMembresias, setIdCentroMembresias] = useState<number | null>(null)
  const [idCentroPension, setIdCentroPension]       = useState<number | null>(null)
  const [savingCentros, setSavingCentros] = useState(false)
  const [conceptosIngreso, setConceptosIngreso] = useState<{ id: number; nombre: string }[]>([])
  const [idConceptoPension, setIdConceptoPension] = useState<number | null>(null)

  // ── Stats ─────────────────────────────────────────────────
  const [stats, setStats] = useState({ pensionesActivas: 0, cuotasPendientes: 0, montoPendiente: 0, vencidas: 0 })

  // ── Fetch pensiones ───────────────────────────────────────
  const fetchPensiones = useCallback(async () => {
    setLoadingP(true)
    let q = dbGolf.from('ctrl_pensiones')
      .select(`id, id_socio_fk, id_carrito_fk, id_slot_fk, id_familiar_fk, fecha_inicio, fecha_fin, monto_mensual, activo, observaciones,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
        cat_familiares(nombre, apellido_paterno, apellido_materno, parentesco),
        cat_carritos(marca, modelo, tipo, color, placa, con_cargador),
        cat_slots(numero)`)
      .order('created_at', { ascending: false })
    if (soloActivas) q = q.eq('activo', true)
    const { data: pData } = await q

    // Cuotas pendientes por pensión (incluye PAGO_PARCIAL)
    const { data: cxcData } = await dbGolf.from('cxc_golf')
      .select('id_pension_fk, saldo, status, periodo, fecha_vencimiento')
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .eq('tipo', 'PENSION_CARRITO')

    // Adeudo con regla del día 10 (misma que salidas y salida definitiva):
    // hasta el día 10 la cuota del mes en curso aún no cuenta como adeudo
    const corte = periodoCorte()
    const pendPorPension: Record<number, { count: number; monto: number }> = {}
    const adeudoPorPension: Record<number, boolean> = {}
    for (const c of (cxcData ?? []) as { id_pension_fk: number | null; saldo: number; periodo: string | null; fecha_vencimiento: string | null }[]) {
      if (!c.id_pension_fk) continue
      if (!pendPorPension[c.id_pension_fk]) pendPorPension[c.id_pension_fk] = { count: 0, monto: 0 }
      pendPorPension[c.id_pension_fk].count++
      pendPorPension[c.id_pension_fk].monto += c.saldo
      if (cuotaExigible(c, corte)) adeudoPorPension[c.id_pension_fk] = true
    }

    const result: Pension[] = (pData ?? []).map((p: any) => ({
      ...p,
      pendientes: pendPorPension[p.id]?.count ?? 0,
      monto_pendiente: pendPorPension[p.id]?.monto ?? 0,
      con_adeudo: adeudoPorPension[p.id] ?? false,
    }))

    setPensiones(result)
    const activas = result.filter(p => p.activo)
    setStats({
      pensionesActivas: activas.length,
      cuotasPendientes: activas.reduce((a, p) => a + p.pendientes, 0),
      montoPendiente:   activas.reduce((a, p) => a + p.monto_pendiente, 0),
      vencidas:         0, // se calcula en CXC
    })
    setLoadingP(false)
  }, [soloActivas])

  // ── Fetch Config ──────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    const [{ data: cfg }, { data: sl }, { data: occ }, { data: cv }, { data: cons }] = await Promise.all([
      dbGolf.from('cfg_carritos').select('tarifa_mensual, id_centro_membresias_fk, id_centro_pension_fk, id_concepto_ingreso_fk').single(),
      dbGolf.from('cat_slots').select('id, numero').eq('activo', true).order('numero'),
      // Cajones ocupados por pensiones activas (solo informativo en la UI)
      dbGolf.from('ctrl_pensiones').select('id_slot_fk').eq('activo', true).not('id_slot_fk', 'is', null),
      dbGolf.from('cat_centros_venta').select('id, nombre').eq('activo', true).order('orden'),
      dbCfg.from('conceptos_ingreso').select('id, nombre').eq('activo', true).order('orden'),
    ])
    const t = cfg?.tarifa_mensual ?? 0
    setTarifa(t); setTarifaEdit(t)
    setSlots(sl ?? [])
    setSlotsOcupados(new Set(((occ ?? []) as { id_slot_fk: number }[]).map(o => o.id_slot_fk)))
    setCentrosVenta(cv ?? [])
    setIdCentroMembresias((cfg as any)?.id_centro_membresias_fk ?? null)
    setIdCentroPension((cfg as any)?.id_centro_pension_fk ?? null)
    setConceptosIngreso((cons as { id: number; nombre: string }[]) ?? [])
    setIdConceptoPension((cfg as any)?.id_concepto_ingreso_fk ?? null)
  }, [])

  // ── Fetch Cobranza del mes ────────────────────────────────
  const fetchCobranza = useCallback(async () => {
    setLoadingC(true)
    const [{ data: mesData }, { data: pendData }] = await Promise.all([
      // Cuotas emitidas del periodo seleccionado (canceladas fuera)
      dbGolf.from('cxc_golf')
        .select(`id, id_socio_fk, id_pension_fk, concepto, periodo, monto_final, saldo, status, fecha_vencimiento, fecha_pago,
          cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
          ctrl_pensiones(cat_slots(numero), cat_carritos(marca, modelo, placa), cat_familiares(nombre, apellido_paterno, apellido_materno, parentesco))`)
        .eq('tipo', 'PENSION_CARRITO')
        .eq('periodo', mesCobranza)
        .neq('status', 'CANCELADO'),
      // Cartera vencida global: pendientes exigibles de cualquier mes (regla del día 10)
      dbGolf.from('cxc_golf')
        .select('saldo, monto_final, status, periodo, fecha_vencimiento')
        .eq('tipo', 'PENSION_CARRITO')
        .in('status', ['PENDIENTE', 'PAGO_PARCIAL']),
    ])

    const cuotas = ((mesData as unknown as CuotaCobranza[]) ?? [])
      .sort((a, b) => nc(a.cat_socios).localeCompare(nc(b.cat_socios)))
    setCuotasMes(cuotas)

    const corte = periodoCorte()
    const vencidas = (((pendData ?? []) as { saldo: number | null; monto_final: number; status: string; periodo: string | null; fecha_vencimiento: string | null }[]))
      .filter(c => cuotaExigible(c, corte))
    setCarteraVencida({
      count: vencidas.length,
      monto: vencidas.reduce((a, c) => a + saldoCuota(c), 0),
    })
    setLoadingC(false)
  }, [mesCobranza])

  // Cuotas pendientes de UNA pensión (cobro por carrito, no agrupado por socio —
  // un socio con dos carritos cobra cada pensión por separado)
  const abrirCobroPension = async (c: CuotaCobranza) => {
    let q = dbGolf.from('cxc_golf')
      .select('id, concepto, periodo, monto_original, descuento, monto_final, saldo, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, tipo, id_socio_fk, cat_socios(nombre, apellido_paterno, apellido_materno)')
      .eq('tipo', 'PENSION_CARRITO')
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .order('fecha_vencimiento', { ascending: true })
    // Cuotas antiguas sin pensión ligada: caen al criterio por socio
    q = c.id_pension_fk ? q.eq('id_pension_fk', c.id_pension_fk) : q.eq('id_socio_fk', c.id_socio_fk).is('id_pension_fk', null)
    const { data } = await q
    setShowCobrar({ cuotas: (data as unknown as Cuota[]) ?? [], nombreSocio: nc(c.cat_socios), idSocio: c.id_socio_fk })
  }

  // ── Fetch Recibos Pensiones ───────────────────────────────
  const fetchRecibosCarritos = useCallback(async () => {
    setLoadingR(true)
    const q = dbGolf.from('recibos_golf')
      .select(`id, folio, fecha_recibo, subtotal, descuento, total,
        forma_pago_nombre, referencia_pago, observaciones, usuario_cobra,
        status, id_socio_fk, id_venta_pos_fk, id_forma_pago_fk, facturable,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
        recibos_golf_det(id, concepto, tipo, periodo, monto_original, descuento, monto_final)`)
      .order('created_at', { ascending: false })
      .limit(500)
    if (filtroStatusR !== 'todos') q.eq('status', filtroStatusR)
    const { data } = await q
    // Filtrar solo los que tienen al menos 1 detalle PENSION_CARRITO
    const todos = ((data as unknown as ReciboCarrito[]) ?? [])
    setRecibos(todos.filter(r => r.recibos_golf_det.some(d => d.tipo === 'PENSION_CARRITO')))
    setLoadingR(false)
  }, [filtroStatusR])

  // ── Generar Ticket POS desde recibo carrito ───────────────
  const generarTicketCarritoDesdeRecibo = async (r: ReciboCarrito) => {
    setGenerandoTicketR(true)
    setTicketErrR('')
    try {
      const [{ data: centros }, { data: cfg }, { data: cfgCarritos }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, rfc, direccion, telefono, municipio, leyenda_ticket').single(),
        dbGolf.from('cfg_carritos').select('id_centro_membresias_fk, id_centro_pension_fk').single(),
      ])
      const centrosPos = (centros as { id: number; nombre: string; activo: boolean }[]) ?? []
      if (centrosPos.length === 0) throw new Error('No hay centros de venta POS activos.')
      // Estos recibos siempre son de pensión carrito (filtrados arriba) → centro configurado para pensión.
      // Mapeo explícito por ID (Configuración → Centros de venta); si no está configurado, fallback por nombre.
      const cfgC = cfgCarritos as { id_centro_membresias_fk: number | null; id_centro_pension_fk: number | null } | null
      const centroSel = (cfgC?.id_centro_pension_fk ? centrosPos.find(c => c.id === cfgC.id_centro_pension_fk) : null) ?? centrosPos.find(c => {
        const n = normR(c.nombre)
        return n.includes('carrito') || n.includes('pension') || n.includes('pensiones')
      }) ?? centrosPos.find(c => {
        const n = normR(c.nombre)
        return n.includes('membresia') || n.includes('club')
      }) ?? centrosPos[0]

      let ventaId = r.id_venta_pos_fk ?? null
      let folioDia = 0
      const fechaVentaIso = `${r.fecha_recibo}T12:00:00`

      // Cuotas de pensión de carrito causan IVA (16%, ya incluido en el monto).
      const detDesglosado = r.recibos_golf_det.map(d => ({ ...d, ...desglosarIva(d.monto_final) }))
      const descDesglosado = r.descuento > 0 ? desglosarIva(r.descuento) : null
      const totalIvaCuotas = detDesglosado.reduce((a, d) => a + d.iva, 0) - (descDesglosado?.iva ?? 0)

      if (!ventaId) {
        const { data: maxFolio } = await dbGolf.from('ctrl_ventas')
          .select('folio_dia').eq('id_centro_fk', centroSel.id)
          .gte('fecha', `${r.fecha_recibo}T00:00:00`)
          .lte('fecha', `${r.fecha_recibo}T23:59:59`)
          .order('folio_dia', { ascending: false }).limit(1)
        folioDia = maxFolio && maxFolio.length > 0 ? ((maxFolio[0] as any).folio_dia + 1) : 1

        const { data: ventaData, error: errVenta } = await dbGolf.from('ctrl_ventas').insert({
          folio_dia: folioDia, id_centro_fk: centroSel.id, fecha: fechaVentaIso,
          id_socio_fk: r.id_socio_fk, nombre_cliente: ncR(r.cat_socios), es_socio: true,
          subtotal: r.subtotal, descuento: r.descuento, iva: totalIvaCuotas, total: r.total,
          status: 'PAGADA', facturable: r.facturable ?? false, usuario_crea: 'sistema',
          notas: `Ticket POS regenerado desde recibo pensión ${r.folio} (#${r.id})`,
        }).select('id, folio_dia').single()
        if (errVenta || !ventaData) throw new Error(errVenta?.message ?? 'No se pudo crear la venta POS')

        ventaId = (ventaData as any).id
        folioDia = (ventaData as any).folio_dia

        const detInsert = detDesglosado.map(d => ({
          id_venta_fk: ventaId!, id_producto_fk: null,
          concepto: d.concepto, cantidad: 1,
          precio_unitario: d.monto_final, descuento: 0, iva_pct: IVA_PCT_CUOTAS, iva: d.iva,
          subtotal: d.subtotal, total: d.monto_final, notas: d.periodo ?? null,
        }))
        if (descDesglosado) {
          detInsert.push({
            id_venta_fk: ventaId!, id_producto_fk: null,
            concepto: `Descuento adicional (${r.folio})`, cantidad: 1,
            precio_unitario: -r.descuento, descuento: 0, iva_pct: IVA_PCT_CUOTAS, iva: -descDesglosado.iva,
            subtotal: -descDesglosado.subtotal, total: -r.descuento, notas: null,
          })
        }
        const { error: errDet } = await dbGolf.from('ctrl_ventas_det').insert(detInsert)
        if (errDet) throw new Error(errDet.message)

        const { error: errPag } = await dbGolf.from('ctrl_ventas_pagos').insert({
          id_venta_fk: ventaId,
          id_forma_fk: r.id_forma_pago_fk || null,
          forma_nombre: r.forma_pago_nombre ?? '',
          monto: r.total,
        })
        if (errPag) throw new Error(errPag.message)

        await dbGolf.from('recibos_golf').update({ id_venta_pos_fk: ventaId }).eq('id', r.id)
        setDetalleRecibo(prev => prev ? { ...prev, id_venta_pos_fk: ventaId } : prev)
        setRecibos(prev => prev.map(x => x.id === r.id ? { ...x, id_venta_pos_fk: ventaId } : x))
      } else {
        const { data: ventaExist } = await dbGolf.from('ctrl_ventas').select('folio_dia').eq('id', ventaId).single()
        folioDia = (ventaExist as any)?.folio_dia ?? 0
      }

      const itemsTicket = detDesglosado.map(d => ({
        concepto: d.concepto, cantidad: 1, precio_unitario: d.monto_final, iva: d.iva, total: d.monto_final,
      }))
      if (descDesglosado) {
        itemsTicket.push({ concepto: `Descuento adicional`, cantidad: 1, precio_unitario: -r.descuento, iva: -descDesglosado.iva, total: -r.descuento })
      }

      const ticketData = {
        id: ventaId, folio_dia: folioDia || '—', fecha: fechaVentaIso,
        cliente: ncR(r.cat_socios), cajero: r.usuario_cobra ?? '—',
        centro: centroSel.nombre,
        razon_social: (cfg as PosCfg | null)?.razon_social ?? INSTITUCION.nombre,
        municipio: (cfg as PosCfg | null)?.municipio ?? '',
        direccion: (cfg as PosCfg | null)?.direccion ?? INSTITUCION.domicilio,
        rfc: (cfg as PosCfg | null)?.rfc ?? INSTITUCION.rfc,
        telefono: (cfg as PosCfg | null)?.telefono ?? '',
        leyenda: (cfg as PosCfg | null)?.leyenda_ticket ?? `Cobro pensión carrito — recibo ${r.folio}.`,
        subtotal: parseFloat((r.total - totalIvaCuotas).toFixed(2)), iva: totalIvaCuotas, total: r.total,
        pagos: [{ forma: r.forma_pago_nombre ?? '—', monto: r.total }],
        items: itemsTicket,
      }
      const encoded = encodeURIComponent(JSON.stringify(ticketData))
      window.open(`/ticket-golf.html?data=${encoded}&print=1`, '_blank', 'width=400,height=700')
    } catch (e: any) {
      setTicketErrR(e?.message ?? 'No se pudo generar el ticket POS')
    } finally {
      setGenerandoTicketR(false)
    }
  }

  // ── Imprimir recibo pensión ───────────────────────────────
  const handlePrintRecibo = async (r: ReciboCarrito) => {
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { data: cfgRows } = await dbCfg.from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((row: any) => {
        if (row.clave === 'org_nombre')    orgNombre    = row.valor ?? orgNombre
        if (row.clave === 'org_subtitulo') orgSubtitulo = row.valor ?? ''
        if (row.clave === 'org_logo_url')  orgLogo      = row.valor ?? ''
      })
    } catch {}
    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`
    const win = window.open('', '_blank', 'width=750,height=900')
    if (!win) return
    const rows = r.recibos_golf_det.map(d => `
      <tr>
        <td>${d.concepto}</td>
        <td>${d.periodo ?? '—'}</td>
        <td class="right">${fmt$(d.monto_original)}</td>
        <td class="right">${d.descuento > 0 ? fmt$(d.descuento) : '—'}</td>
        <td class="right" style="font-weight:600">${fmt$(d.monto_final)}</td>
      </tr>`).join('')
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/><title>Recibo ${r.folio}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:32px}
        .org-header{display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #0D4F80;margin-bottom:18px}
        .org-nombre{font-size:18px;font-weight:700;color:#0D4F80;margin:0 0 2px}
        .org-sub{font-size:11px;color:#64748b}
        .doc-title{font-size:14px;font-weight:600;color:#0D4F80;margin-bottom:2px}
        .section{margin-bottom:18px}
        .section-title{font-size:10px;font-weight:700;color:#0D4F80;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid #bfdbfe;padding-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{padding:7px 10px;background:#f1f5f9;color:#0D4F80;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em;border:1px solid #e2e8f0}
        td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}
        tr:last-child td{border-bottom:none}
        .right{text-align:right}
        .totales{margin-left:auto;width:260px}
        .totales-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
        .totales-row.total{font-weight:700;font-size:15px;border-top:2px solid #0D4F80;padding-top:8px;margin-top:4px;color:#0D4F80}
        .pago-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px}
        .pago-label{font-size:10px;color:#0D4F80;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
        .pago-val{font-size:14px;font-weight:700;color:#0D4F80}
        .firma-area{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}
        .firma-line{border-top:1px solid #1e293b;padding-top:4px;font-size:10px;color:#64748b;text-align:center}
        .footer{margin-top:32px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px}
        @page{margin:1.2cm}
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="doc-title">Recibo Pensión Carrito</div>
          <div style="font-size:11px;color:#64748b">Folio: <strong>${r.folio}</strong></div>
          <div style="font-size:11px;color:#64748b">${fechaFmtR(r.fecha_recibo)}</div>
          ${r.status === 'CANCELADO' ? '<span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#fee2e2;color:#dc2626;margin-top:4px">CANCELADO</span>' : ''}
        </div>
      </div>
      <div class="section">
        <div class="section-title">Datos del Socio</div>
        <table style="margin-bottom:8px">
          <tr><td style="border:none;padding:2px 0;font-size:12px"><strong>Nombre:</strong> ${ncR(r.cat_socios)}</td>
          ${r.cat_socios?.numero_socio ? `<td style="border:none;padding:2px 0;font-size:12px"><strong>No. Socio:</strong> ${r.cat_socios.numero_socio}</td>` : '<td style="border:none"></td>'}</tr>
        </table>
      </div>
      <div class="section">
        <div class="section-title">Pensiones cobradas</div>
        <table>
          <thead><tr><th>Concepto</th><th>Período</th><th class="right">Monto</th><th class="right">Desc.</th><th class="right">Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totales">
          <div class="totales-row"><span>Subtotal</span><span>${fmt$(r.subtotal)}</span></div>
          ${r.descuento > 0 ? `<div class="totales-row"><span>Descuento</span><span style="color:#dc2626">– ${fmt$(r.descuento)}</span></div>` : ''}
          <div class="totales-row total"><span>TOTAL</span><span>${fmt$(r.total)}</span></div>
        </div>
      </div>
      <div class="pago-box">
        <div><div class="pago-label">Forma de pago</div><div class="pago-val">${r.forma_pago_nombre ?? '—'}</div></div>
        ${r.referencia_pago ? `<div style="margin-left:32px"><div class="pago-label">Referencia</div><div class="pago-val" style="font-size:12px">${r.referencia_pago}</div></div>` : ''}
        <div style="margin-left:auto;text-align:right"><div class="pago-label">Emitido por</div><div style="font-size:12px;font-weight:600;color:#15803d">${r.usuario_cobra ?? '—'}</div></div>
      </div>
      ${r.observaciones ? `<div style="font-size:11px;color:#64748b;padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:16px"><strong>Observaciones:</strong> ${r.observaciones}</div>` : ''}
      <div class="firma-area">
        <div class="firma-line">Firma del Socio</div>
        <div class="firma-line">Cajero / Recibí</div>
      </div>
      <div class="footer">
        Recibo de pago de pensión de carrito de golf.<br/>
        ${orgNombre} · ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  useEffect(() => { fetchPensiones() }, [fetchPensiones])
  useEffect(() => { if (tab === 'config') fetchConfig() }, [tab, fetchConfig])
  useEffect(() => { if (tab === 'recibos') fetchRecibosCarritos() }, [tab, fetchRecibosCarritos])
  useEffect(() => { if (tab === 'cobranza') fetchCobranza() }, [tab, fetchCobranza])

  const guardarTarifa = async () => {
    setSavingConfig(true)
    await dbGolf.from('cfg_carritos').update({ tarifa_mensual: tarifaEdit, updated_at: new Date().toISOString() }).eq('id', 1)
    setTarifa(tarifaEdit)
    setSavingConfig(false)
  }

  const guardarCentros = async () => {
    setSavingCentros(true)
    await dbGolf.from('cfg_carritos').update({
      id_centro_membresias_fk: idCentroMembresias,
      id_centro_pension_fk:    idCentroPension,
      id_concepto_ingreso_fk:  idConceptoPension,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    setSavingCentros(false)
  }

  const agregarSlot = async () => {
    if (!nuevoSlot.trim()) return
    setSavingSlot(true)
    await dbGolf.from('cat_slots').insert({ numero: nuevoSlot.trim() })
    setNuevoSlot('')
    setSavingSlot(false)
    fetchConfig()
  }

  const desactivarSlot = async (id: number) => {
    if (!confirm('¿Desactivar este slot?')) return
    await dbGolf.from('cat_slots').update({ activo: false }).eq('id', id)
    fetchConfig()
  }

  // Abrir modal de edición de carrito
  const abrirEditCarrito = async (idCarrito: number) => {
    setLoadingEdit(true)
    const { data } = await dbGolf.from('cat_carritos')
      .select('id, id_socio_fk, id_familiar_fk, marca, modelo, anio, color, numero_serie, placa, tipo, con_cargador, activo, observaciones')
      .eq('id', idCarrito)
      .single()
    setLoadingEdit(false)
    if (data) setEditCarrito(data as CarritoFull)
  }

  // Tras crear carrito, abrir modal de pensión
  const handleCarritoSaved = (c: { id: number; id_socio_fk: number; id_familiar_fk?: number | null }) => {
    setShowCarrito(false)
    setCarritoNuevo(c)
    fetchPensiones()
  }

  const handlePensionSaved = () => {
    setShowPension(null)
    setCarritoNuevo(null)
    fetchPensiones()
  }

  // Abrir modal de cambio/liberación de cajón (solo slots libres + el actual)
  const abrirCambioSlot = async (p: Pension) => {
    const [{ data: sl }, { data: ocupados }] = await Promise.all([
      dbGolf.from('cat_slots').select('id, numero').eq('activo', true).order('numero'),
      dbGolf.from('ctrl_pensiones').select('id_slot_fk').eq('activo', true),
    ])
    const ocupadosIds = new Set(((ocupados ?? []) as { id_slot_fk: number | null }[]).map(x => x.id_slot_fk).filter(Boolean))
    if (p.id_slot_fk) ocupadosIds.delete(p.id_slot_fk)  // el cajón actual sigue siendo opción
    setSlotsDisp(((sl as Slot[]) ?? []).filter(s => !ocupadosIds.has(s.id)))
    setSlotSel(p.id_slot_fk ?? '')
    setErrorSlot('')
    setShowSlot({
      idPension: p.id,
      idSlotActual: p.id_slot_fk,
      nombreSocio: nc(p.cat_socios),
      descCarrito: [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito',
    })
  }

  const guardarCambioSlot = async () => {
    if (!showSlot) return
    setSavingSlotSel(true)
    const { error } = await dbGolf.from('ctrl_pensiones')
      .update({ id_slot_fk: slotSel === '' ? null : slotSel })
      .eq('id', showSlot.idPension)
    setSavingSlotSel(false)
    if (error) { setErrorSlot(error.message); return }
    setShowSlot(null)
    fetchPensiones()
  }

  const pensionesF = pensiones.filter(p => {
    if (filtroSituacion === 'adeudo'    && !p.con_adeudo) return false
    if (filtroSituacion === 'corriente' &&  p.con_adeudo) return false
    if (!busquedaP.trim()) return true
    const q = busquedaP.toLowerCase()
    const nombre = nc(p.cat_socios).toLowerCase()
    const placa = (p.cat_carritos?.placa ?? '').toLowerCase()
    return nombre.includes(q) || placa.includes(q)
  })

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'pensiones', label: 'Pensiones',     icon: Car        },
    { key: 'cobranza',  label: 'Cobranza',      icon: CreditCard },
    { key: 'recibos',   label: 'Recibos',       icon: Receipt    },
    // Solo administración
    ...(esAdmin ? [
      { key: 'config' as Tab, label: 'Configuración',   icon: Settings    },
      { key: 'mesa' as Tab,   label: 'Mesa de Control', icon: AlertCircle },
    ] : []),
  ]

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
            <Link href="/golf/administracion" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span>/</span>
            <span style={{ color: '#475569', fontWeight: 500 }}>Carritos</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Carritos & Pensiones
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => { fetchPensiones() }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && tab === 'pensiones' && (
            <button className="btn-primary" onClick={() => setShowCarrito(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669' }}>
              <Plus size={14} /> Nuevo Carrito
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Pensiones Activas',  value: stats.pensionesActivas,  color: '#059669', bg: '#ecfdf5' },
          { label: 'Cuotas Pendientes',  value: stats.cuotasPendientes,  color: '#d97706', bg: '#fffbeb' },
          { label: 'Monto por Cobrar',   value: fmt$(stats.montoPendiente), color: '#dc2626', bg: '#fef2f2' },
        ].map(c => (
          <div key={c.label} className="card" style={{ flex: '1 1 140px', maxWidth: 220, padding: '12px 16px', background: c.bg, border: `1px solid ${c.color}22` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', fontSize: 13, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#059669' : '#94a3b8',
              borderBottom: tab === t.key ? '2px solid #059669' : '2px solid transparent',
              marginBottom: -1,
            }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB: PENSIONES ───────────────────────────────── */}
      {tab === 'pensiones' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar socio o placa…" value={busquedaP} onChange={e => setBusquedaP(e.target.value)} />
              {busquedaP && <button onClick={() => setBusquedaP('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {([
                { key: 'todas',     label: 'Todas',        color: '#059669' },
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
                    {['', 'Socio', 'Carrito', 'Cajón', 'Tarifa/mes', 'Pendientes', 'Situación', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingP ? (
                    <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                  ) : pensionesF.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin pensiones registradas</div>
                      <div style={{ fontSize: 12 }}>Registra un nuevo carrito para comenzar</div>
                    </td></tr>
                  ) : pensionesF.map(p => {
                    const abierto = expandido === p.id
                    const carDesc = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
                    return (
                      <>
                        <tr key={p.id}
                          onClick={() => {
                            setExpandido(abierto ? null : p.id)
                          }}
                          style={{ borderBottom: abierto ? 'none' : '1px solid var(--border)', cursor: 'pointer', opacity: p.activo ? 1 : 0.55, transition: 'background 0.1s', background: abierto ? '#f0fdf4' : '' }}
                          onMouseEnter={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                          onMouseLeave={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = '' }}>
                          <td style={{ padding: '10px 10px 10px 14px', width: 28, color: '#94a3b8' }}>
                            {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{nc(p.cat_socios)}</div>
                            {p.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{p.cat_socios.numero_socio}</div>}
                            {p.cat_familiares && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px', borderRadius: 20, background: '#f3e8ff', color: '#7c3aed', fontWeight: 600, marginTop: 2 }}>
                                👤 {nc(p.cat_familiares)}{p.cat_familiares.parentesco ? ` · ${p.cat_familiares.parentesco}` : ''}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>{carDesc}</div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                              {p.cat_carritos?.tipo && (
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: p.cat_carritos.tipo === 'ELECTRICO' ? '#eff6ff' : '#fffbeb', color: p.cat_carritos.tipo === 'ELECTRICO' ? '#1d4ed8' : '#92400e', fontWeight: 600 }}>
                                  {p.cat_carritos.tipo === 'ELECTRICO' ? '⚡ Eléctrico' : '⛽ Combustión'}
                                </span>
                              )}
                              {p.cat_carritos?.con_cargador && (
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>
                                  🔌 Cargador
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                            {p.cat_slots ? `Cajón ${p.cat_slots.numero}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>
                            {fmt$(p.monto_mensual)}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {p.pendientes > 0
                              ? <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{p.pendientes} · {fmt$(p.monto_pendiente)}</span>
                              : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: p.con_adeudo ? '#fef2f2' : '#eff6ff', color: p.con_adeudo ? '#dc2626' : '#2563eb' }}>
                              {p.con_adeudo ? 'Con Adeudo' : 'Al corriente'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: p.activo ? '#dcfce7' : '#f1f5f9', color: p.activo ? '#15803d' : '#64748b' }}>
                              {p.activo ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                              {puedeEscribir && (
                                <button onClick={e => { e.stopPropagation(); abrirEditCarrito(p.id_carrito_fk) }}
                                  disabled={loadingEdit}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  {loadingEdit ? <Loader size={12} /> : <Settings size={12} />} Editar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Fila expandida */}
                        {abierto && (() => {
                          const idCar = p.id_carrito_fk
                          const carDesc2 = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
                          return (
                            <tr key={`${p.id}-det`}>
                              <td colSpan={9} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                                <div style={{ background: '#f8fafc', padding: '16px 20px 20px 48px' }}>

                                  {/* Info de pensión + acciones */}
                                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>
                                      <span style={{ fontWeight: 600, color: '#475569' }}>Inicio de pensión: </span>
                                      {new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                                      {p.observaciones && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>{p.observaciones}</span>}
                                    </div>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                      {esAdmin && p.activo && (
                                        <button onClick={e => { e.stopPropagation(); abrirCambioSlot(p) }}
                                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                                          <MapPin size={12} /> {p.id_slot_fk ? 'Cambiar / liberar cajón' : 'Asignar cajón'}
                                        </button>
                                      )}
                                      {esAdmin && p.activo && (
                                        <button onClick={e => {
                                          e.stopPropagation()
                                          setShowTitular({
                                            idPension: p.id,
                                            idCarrito: idCar,
                                            idSocioActual: p.id_socio_fk,
                                            nombreSocioActual: nc(p.cat_socios),
                                            idFamiliarActual: p.id_familiar_fk ?? null,
                                            descCarrito: carDesc2,
                                          })
                                        }}
                                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                                          <ArrowRightLeft size={12} /> Cambiar titular
                                        </button>
                                      )}
                                      {puedeEscribir && p.activo && (
                                        <button onClick={e => {
                                          e.stopPropagation()
                                          setShowPension({
                                            idSocio: p.id_socio_fk,
                                            idCarrito: idCar,
                                            nombreSocio: nc(p.cat_socios),
                                            descCarrito: carDesc2,
                                            idFamiliar: p.id_familiar_fk ?? null,
                                            nombreFamiliar: p.cat_familiares ? nc(p.cat_familiares) : null,
                                            idPension: p.id,
                                            idSlotExistente: p.id_slot_fk,
                                            montoMensualExistente: p.monto_mensual,
                                          })
                                        }}
                                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                                          <Plus size={12} /> Agregar cuotas
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                </div>
                              </td>
                            </tr>
                          )
                        })()}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── TAB: COBRANZA ────────────────────────────────── */}
      {tab === 'cobranza' && (() => {
        const mesExigible = mesCobranza <= periodoCorte()
        const emitido   = cuotasMes.reduce((a, c) => a + c.monto_final, 0)
        const porCobrar = cuotasMes.reduce((a, c) => a + saldoCuota(c), 0)
        const cobrado   = emitido - porCobrar
        const pagadas   = cuotasMes.filter(c => saldoCuota(c) === 0).length
        const avance    = emitido > 0 ? Math.round((cobrado / emitido) * 100) : 0
        const mesLabel  = new Date(`${mesCobranza}-15T12:00:00`).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

        const cuotasF = cuotasMes.filter(c => {
          if (filtroStatusC === 'por_cobrar' && saldoCuota(c) === 0) return false
          if (filtroStatusC === 'pagadas'    && saldoCuota(c) > 0)  return false
          if (!busquedaC.trim()) return true
          const q = busquedaC.toLowerCase()
          const placa = (c.ctrl_pensiones?.cat_carritos?.placa ?? '').toLowerCase()
          return nc(c.cat_socios).toLowerCase().includes(q) || placa.includes(q)
        })
        const fMonto   = cuotasF.reduce((a, c) => a + c.monto_final, 0)
        const fSaldo   = cuotasF.reduce((a, c) => a + saldoCuota(c), 0)

        const situacion = (c: CuotaCobranza) => {
          if (saldoCuota(c) === 0)        return { label: 'Pagada',     bg: '#dcfce7', color: '#15803d' }
          if (c.status === 'PAGO_PARCIAL') return { label: 'Parcial',    bg: '#fffbeb', color: '#d97706' }
          if (mesExigible)                 return { label: 'Vencida',    bg: '#fef2f2', color: '#dc2626' }
          return                                  { label: 'Por vencer', bg: '#eff6ff', color: '#2563eb' }
        }

        return (
          <>
            {/* KPIs del mes */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {[
                { label: `Emitido — ${mesLabel}`, value: fmt$(emitido), sub: `${cuotasMes.length} cuota${cuotasMes.length !== 1 ? 's' : ''}`, color: '#2563eb', bg: '#eff6ff' },
                { label: 'Cobrado del mes', value: fmt$(cobrado), sub: `${pagadas} pagada${pagadas !== 1 ? 's' : ''} · ${avance}% de avance`, color: '#059669', bg: '#ecfdf5' },
                {
                  label: mesExigible ? 'Cartera vencida del mes' : 'Por cobrar del mes',
                  value: fmt$(porCobrar),
                  sub: mesExigible ? 'Exigible — regla del día 10' : 'Por vencer — exigible a partir del día 11',
                  color: porCobrar > 0 ? (mesExigible ? '#dc2626' : '#d97706') : '#64748b',
                  bg:    porCobrar > 0 ? (mesExigible ? '#fef2f2' : '#fffbeb') : '#f8fafc',
                },
                { label: 'Cartera vencida total', value: fmt$(carteraVencida.monto), sub: `${carteraVencida.count} cuota${carteraVencida.count !== 1 ? 's' : ''} de todos los meses`, color: carteraVencida.monto > 0 ? '#dc2626' : '#64748b', bg: carteraVencida.monto > 0 ? '#fef2f2' : '#f8fafc' },
              ].map(c => (
                <div key={c.label} className="card" style={{ flex: '1 1 200px', maxWidth: 280, padding: '14px 18px', background: c.bg, border: `1px solid ${c.color}22` }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4, textTransform: 'capitalize' }}>{c.label}</div>
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
                  placeholder="Buscar socio o placa…" value={busquedaC} onChange={e => setBusquedaC(e.target.value)} />
                {busquedaC && <button onClick={() => setBusquedaC('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
              </div>
              {(() => {
                const [anioSel, mesSel] = mesCobranza.split('-')
                const anioActual = new Date().getFullYear()
                const anios = Array.from({ length: anioActual + 1 - 2024 + 1 }, (_, i) => 2024 + i)
                const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
                const selStyle: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }
                return (
                  <>
                    <select value={anioSel} onChange={e => setMesCobranza(`${e.target.value}-${mesSel}`)} style={selStyle}>
                      {anios.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select value={mesSel} onChange={e => setMesCobranza(`${anioSel}-${e.target.value}`)} style={selStyle}>
                      {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
                    </select>
                  </>
                )
              })()}
              <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {([
                  { key: 'todas',      label: 'Todas',      color: '#059669' },
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

            {/* Tabla de cuotas del mes */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                      {['Socio', 'Cajón', 'Concepto', 'Monto', 'Cobrado', 'Saldo', 'Situación', 'Fecha de pago', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingC ? (
                      <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                    ) : cuotasF.length === 0 ? (
                      <tr><td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin cuotas para {mesLabel}</div>
                        <div style={{ fontSize: 12 }}>Genera las cuotas del periodo desde la pensión o ajusta los filtros</div>
                      </td></tr>
                    ) : cuotasF.map(c => {
                      const sit = situacion(c)
                      const saldo = saldoCuota(c)
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{nc(c.cat_socios)}</div>
                            {c.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{c.cat_socios.numero_socio}</div>}
                            {c.ctrl_pensiones?.cat_familiares && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, padding: '1px 6px', borderRadius: 20, background: '#f3e8ff', color: '#7c3aed', fontWeight: 600, marginTop: 2 }}>
                                👤 {nc(c.ctrl_pensiones.cat_familiares)}{c.ctrl_pensiones.cat_familiares.parentesco ? ` · ${c.ctrl_pensiones.cat_familiares.parentesco}` : ''}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {c.ctrl_pensiones?.cat_slots ? `Cajón ${c.ctrl_pensiones.cat_slots.numero}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>{c.concepto}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fmt$(c.monto_final)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>
                            {c.monto_final - saldo > 0 ? fmt$(c.monto_final - saldo) : <span style={{ color: '#cbd5e1', fontWeight: 400 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: saldo > 0 ? '#dc2626' : '#cbd5e1', whiteSpace: 'nowrap' }}>
                            {saldo > 0 ? fmt$(saldo) : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: sit.bg, color: sit.color }}>{sit.label}</span>
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {c.fecha_pago ? fechaFmtR(c.fecha_pago) : '—'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {puedeEscribir && saldo > 0 && (
                              <button onClick={() => abrirCobroPension(c)}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <CreditCard size={12} /> Cobrar
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {!loadingC && cuotasF.length > 0 && (
                    <tfoot>
                      <tr style={{ background: 'var(--surface-alt)', borderTop: '2px solid var(--border)' }}>
                        <td colSpan={3} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Total ({cuotasF.length} cuota{cuotasF.length !== 1 ? 's' : ''})
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt$(fMonto)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>{fmt$(fMonto - fSaldo)}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: fSaldo > 0 ? '#dc2626' : '#cbd5e1', whiteSpace: 'nowrap' }}>{fSaldo > 0 ? fmt$(fSaldo) : '—'}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── TAB: MESA DE CONTROL (solo admin) ────────────── */}
      {tab === 'mesa' && esAdmin && <MesaControl />}

      {/* ── TAB: RECIBOS ─────────────────────────────────── */}
      {tab === 'recibos' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar por socio o folio…" value={busquedaR} onChange={e => setBusquedaR(e.target.value)} />
              {busquedaR && <button onClick={() => setBusquedaR('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <select
              style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', outline: 'none', fontFamily: 'inherit' }}
              value={filtroStatusR} onChange={e => setFiltroStatusR(e.target.value)}>
              <option value="VIGENTE">Vigentes</option>
              <option value="CANCELADO">Cancelados</option>
              <option value="todos">Todos</option>
            </select>
            <button onClick={fetchRecibosCarritos} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }}>
              <RefreshCw size={12} /> Actualizar
            </button>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)' }}>
                    {['Folio', 'Socio', 'Fecha', 'Cuotas', 'Total', 'Forma Pago', 'Status', 'Ticket POS', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingR ? (
                    <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                      <Loader size={20} className="animate-spin" style={{ margin: '0 auto' }} />
                    </td></tr>
                  ) : (() => {
                    const recibosF = recibos.filter(r => {
                      if (!busquedaR.trim()) return true
                      const q = busquedaR.toLowerCase()
                      return ncR(r.cat_socios).toLowerCase().includes(q) || r.folio.toLowerCase().includes(q)
                    })
                    return recibosF.length === 0 ? (
                      <tr><td colSpan={9} style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                        Sin recibos de pensión con los filtros actuales
                      </td></tr>
                    ) : recibosF.map((r, i) => {
                      const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR['VIGENTE']
                      return (
                        <tr key={r.id} style={{ borderBottom: i < recibosF.length - 1 ? '1px solid var(--border)' : 'none', opacity: r.status === 'CANCELADO' ? 0.65 : 1 }}>
                          <td style={{ padding: '11px 14px' }}>
                            <button onClick={() => { setDetalleRecibo(r); setTicketErrR('') }}
                              style={{ fontSize: 13, fontWeight: 700, color: '#0891b2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                              {r.folio}
                            </button>
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ fontWeight: 500 }}>{ncR(r.cat_socios)}</div>
                            {r.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: '#94a3b8' }}>#{r.cat_socios.numero_socio}</div>}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                            {fechaFmtR(r.fecha_recibo)}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: 13, color: '#475569', textAlign: 'center' }}>
                            {r.recibos_golf_det.length}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: 14, fontWeight: 700, color: r.status === 'CANCELADO' ? '#94a3b8' : '#059669', whiteSpace: 'nowrap' }}>
                            {fmt$(r.total)}
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: 12, color: '#64748b' }}>
                            {r.forma_pago_nombre ?? '—'}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.label}</span>
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            {r.id_venta_pos_fk
                              ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#ecfdf5', color: '#15803d', fontWeight: 600 }}>#{String(r.id_venta_pos_fk).padStart(6, '0')}</span>
                              : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => handlePrintRecibo(r)} title="Imprimir recibo"
                                style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }}>
                                <Printer size={13} />
                              </button>
                              {r.status === 'VIGENTE' && (
                                <button onClick={() => { setDetalleRecibo(r); setTicketErrR('') }} title="Generar/Reimprimir Ticket POS"
                                  style={{ padding: '5px 8px', border: '1px solid #a7f3d0', borderRadius: 6, background: '#ecfdf5', cursor: 'pointer', color: '#047857', display: 'flex', alignItems: 'center' }}>
                                  <Receipt size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal detalle recibo pensión */}
          {detalleRecibo && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
              <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
                {/* Header */}
                <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={16} color="#059669" />
                      <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{detalleRecibo.folio}</span>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: STATUS_COLOR[detalleRecibo.status]?.bg, color: STATUS_COLOR[detalleRecibo.status]?.color }}>
                        {STATUS_COLOR[detalleRecibo.status]?.label}
                      </span>
                      {detalleRecibo.id_venta_pos_fk && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#ecfdf5', color: '#15803d', fontWeight: 600 }}>
                          Ticket #{String(detalleRecibo.id_venta_pos_fk).padStart(6, '0')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {fechaFmtR(detalleRecibo.fecha_recibo)} · {ncR(detalleRecibo.cat_socios)}
                    </div>
                  </div>
                  <button onClick={() => { setDetalleRecibo(null); setTicketErrR('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                    <XCircle size={18} />
                  </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                  {/* Socio */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', marginBottom: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10 }}>
                    <div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Socio</div><div style={{ fontSize: 13, fontWeight: 600 }}>{ncR(detalleRecibo.cat_socios)}</div></div>
                    {detalleRecibo.cat_socios?.numero_socio && <div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>No. Socio</div><div style={{ fontSize: 13, fontWeight: 600 }}>#{detalleRecibo.cat_socios.numero_socio}</div></div>}
                    <div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Cajero</div><div style={{ fontSize: 13, fontWeight: 600 }}>{detalleRecibo.usuario_cobra ?? '—'}</div></div>
                    <div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Forma de pago</div><div style={{ fontSize: 13, fontWeight: 600 }}>{detalleRecibo.forma_pago_nombre ?? '—'}</div></div>
                  </div>

                  {/* Cuotas */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Pensiones cobradas</div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                      {detalleRecibo.recibos_golf_det.map((d, i) => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < detalleRecibo.recibos_golf_det.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{d.concepto}</div>
                            {d.periodo && <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.periodo}</div>}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {d.descuento > 0 && <div style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(d.monto_original)}</div>}
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{fmt$(d.monto_final)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totales */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <div style={{ width: 220 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', padding: '3px 0' }}><span>Subtotal</span><span>{fmt$(detalleRecibo.subtotal)}</span></div>
                      {detalleRecibo.descuento > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#dc2626', padding: '3px 0' }}><span>Descuento</span><span>– {fmt$(detalleRecibo.descuento)}</span></div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#059669', borderTop: '2px solid #e2e8f0', paddingTop: 6, marginTop: 4 }}><span>Total</span><span>{fmt$(detalleRecibo.total)}</span></div>
                    </div>
                  </div>

                  {detalleRecibo.referencia_pago && (
                    <div style={{ padding: '8px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#15803d', marginBottom: 12 }}>
                      <strong>Referencia:</strong> {detalleRecibo.referencia_pago}
                    </div>
                  )}
                  {detalleRecibo.observaciones && (
                    <div style={{ padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                      <strong>Observaciones:</strong> {detalleRecibo.observaciones}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
                  {ticketErrR && (
                    <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                      {ticketErrR}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={() => { setDetalleRecibo(null); setTicketErrR('') }}
                      style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                      Cerrar
                    </button>
                    {detalleRecibo.status === 'VIGENTE' && (
                      <button onClick={() => generarTicketCarritoDesdeRecibo(detalleRecibo)} disabled={generandoTicketR}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: '1px solid #a7f3d0', borderRadius: 8, background: '#ecfdf5', color: '#047857', cursor: 'pointer', opacity: generandoTicketR ? 0.6 : 1 }}>
                        {generandoTicketR ? <Loader size={14} className="animate-spin" /> : <Receipt size={14} />}
                        {detalleRecibo.id_venta_pos_fk ? 'Reimprimir Ticket POS' : 'Generar Ticket POS'}
                      </button>
                    )}
                    <button onClick={() => handlePrintRecibo(detalleRecibo)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#065f46', color: '#fff', cursor: 'pointer' }}>
                      <Printer size={14} /> Imprimir Recibo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB: CONFIGURACIÓN (solo admin) ──────────────── */}
      {tab === 'config' && esAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 860 }}>

          {/* Tarifa mensual */}
          <div className="card" style={{ padding: 20, maxWidth: 560 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Tarifa de Pensión Mensual</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Monto mensual ($)</label>
                <input style={{ width: '100%', padding: '8px 12px', fontSize: 16, fontWeight: 700, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  type="number" min={0} step={0.01} value={tarifaEdit} onChange={e => setTarifaEdit(parseFloat(e.target.value) || 0)} />
              </div>
              <button onClick={guardarTarifa} disabled={savingConfig || tarifaEdit === tarifa}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (savingConfig || tarifaEdit === tarifa) ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {savingConfig ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Esta tarifa se usa como valor predeterminado al crear nuevas pensiones. Las pensiones existentes mantienen su tarifa original.
            </div>
          </div>

          {/* Centros de venta POS */}
          <div className="card" style={{ padding: 20, maxWidth: 560 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Centros de venta POS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Cuotas de membresía / inscripción</label>
                <select
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                  value={idCentroMembresias ?? ''}
                  onChange={e => setIdCentroMembresias(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Sin configurar (usa heurística por nombre) —</option>
                  {centrosVenta.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Pensión de carrito</label>
                <select
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                  value={idCentroPension ?? ''}
                  onChange={e => setIdCentroPension(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Sin configurar (usa heurística por nombre) —</option>
                  {centrosVenta.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Concepto de ingreso (Pensión de carrito)</label>
                <select
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                  value={idConceptoPension ?? ''}
                  onChange={e => setIdConceptoPension(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Sin asignar (cae en &quot;Otros&quot; al distribuir el corte) —</option>
                  {conceptosIngreso.map(co => <option key={co.id} value={co.id}>{co.nombre}</option>)}
                </select>
              </div>
              <button onClick={guardarCentros} disabled={savingCentros}
                style={{ alignSelf: 'flex-start', padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: savingCentros ? 0.6 : 1 }}>
                {savingCentros ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
              Define a qué centro de venta se postean los tickets POS generados al cobrar cuotas. Si no se configura, se intenta adivinar por nombre del centro (menos confiable).
            </div>
          </div>

          {/* Slots */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Slots / Cajones ({slots.length})</div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: '#fef2f2', color: '#dc2626' }}>
                {slots.filter(s => slotsOcupados.has(s.id)).length} ocupados
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: '#f0fdf4', color: '#15803d' }}>
                {slots.filter(s => !slotsOcupados.has(s.id)).length} disponibles
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 520 }}>
              <input style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
                placeholder="Número de cajón (ej. 42, A-12)…" value={nuevoSlot} onChange={e => setNuevoSlot(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarSlot()} />
              <button onClick={agregarSlot} disabled={savingSlot || !nuevoSlot.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (!nuevoSlot.trim() || savingSlot) ? 0.6 : 1 }}>
                <Plus size={13} /> Agregar
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 8 }}>
              {slots.map(s => {
                const ocupado = slotsOcupados.has(s.id)
                return (
                  <div key={s.id} style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: ocupado ? '#fef2f2' : '#f0fdf4',
                    border: `1px solid ${ocupado ? '#fecaca' : '#a7f3d0'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: ocupado ? '#991b1b' : '#065f46' }}>Cajón {s.numero}</span>
                      <button onClick={() => desactivarSlot(s.id)} disabled={ocupado}
                        title={ocupado ? 'No se puede desactivar un cajón ocupado' : 'Desactivar cajón'}
                        style={{ background: 'none', border: 'none', cursor: ocupado ? 'default' : 'pointer', color: ocupado ? '#e2e8f0' : '#94a3b8', padding: 1, lineHeight: 1 }}>
                        <X size={12} />
                      </button>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.04em', background: ocupado ? '#fee2e2' : '#dcfce7', color: ocupado ? '#dc2626' : '#15803d' }}>
                      {ocupado ? 'Ocupado' : 'Disponible'}
                    </span>
                  </div>
                )
              })}
              {slots.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No hay slots configurados</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      {showCarrito && (
        <CarritoModal onClose={() => setShowCarrito(false)} onSaved={handleCarritoSaved} />
      )}

      {editCarrito && (
        <CarritoModal
          carrito={editCarrito}
          onClose={() => setEditCarrito(null)}
          onSaved={() => { setEditCarrito(null); fetchPensiones() }}
        />
      )}

      {carritoNuevo && !showPension && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Carrito registrado</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>¿Deseas asignar un slot y generar cuotas de pensión ahora?</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setCarritoNuevo(null)}
                style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Después
              </button>
              <button onClick={async () => {
                const [{ data: s }, { data: c }] = await Promise.all([
                  dbGolf.from('cat_socios').select('nombre, apellido_paterno, apellido_materno').eq('id', carritoNuevo.id_socio_fk).single(),
                  dbGolf.from('cat_carritos').select('marca, modelo').eq('id', carritoNuevo.id).single(),
                ])
                const nombreS = s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : ''
                const descC = c ? [c.marca, c.modelo].filter(Boolean).join(' ') || 'Carrito' : 'Carrito'
                let nombreF: string | null = null
                if (carritoNuevo.id_familiar_fk) {
                  const { data: f } = await dbGolf.from('cat_familiares').select('nombre, apellido_paterno, apellido_materno').eq('id', carritoNuevo.id_familiar_fk).single()
                  if (f) nombreF = [f.nombre, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')
                }
                setShowPension({
                  idSocio: carritoNuevo.id_socio_fk,
                  idCarrito: carritoNuevo.id,
                  nombreSocio: nombreS,
                  descCarrito: descC,
                  idFamiliar: carritoNuevo.id_familiar_fk ?? null,
                  nombreFamiliar: nombreF,
                })
              }}
                style={{ padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer' }}>
                Asignar Pensión
              </button>
            </div>
          </div>
        </div>
      )}

      {showPension && (
        <PensionModal
          idSocio={showPension.idSocio}
          idCarrito={showPension.idCarrito}
          nombreSocio={showPension.nombreSocio}
          descripcionCarrito={showPension.descCarrito}
          idFamiliar={showPension.idFamiliar}
          nombreFamiliar={showPension.nombreFamiliar}
          idPension={showPension.idPension}
          idSlotExistente={showPension.idSlotExistente}
          montoMensualExistente={showPension.montoMensualExistente}
          onClose={() => { setShowPension(null); setCarritoNuevo(null) }}
          onSaved={handlePensionSaved}
        />
      )}

      {/* Modal cambio / liberación de cajón */}
      {showSlot && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: '#eff6ff', borderRadius: 8, padding: 8 }}><MapPin size={18} color="#2563eb" /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{showSlot.idSlotActual ? 'Cambiar / liberar cajón' : 'Asignar cajón'}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{showSlot.descCarrito} · {showSlot.nombreSocio}</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#64748b', margin: '12px 0 14px', lineHeight: 1.5 }}>
              La pensión y sus cuotas no se modifican — solo la asignación del cajón.
              {showSlot.idSlotActual ? ' Si lo liberas, el cajón queda disponible para otro carrito.' : ''}
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Cajón</label>
            <select
              value={slotSel}
              onChange={e => setSlotSel(e.target.value ? Number(e.target.value) : '')}
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}>
              <option value="">— Sin cajón (liberar) —</option>
              {slotsDisp.map(s => (
                <option key={s.id} value={s.id}>
                  Cajón {s.numero}{s.id === showSlot.idSlotActual ? ' (actual)' : ''}
                </option>
              ))}
            </select>
            {errorSlot && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                {errorSlot}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowSlot(null)}
                style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={guardarCambioSlot} disabled={savingSlotSel || slotSel === (showSlot.idSlotActual ?? '')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#2563eb', color: '#fff', cursor: 'pointer', opacity: (savingSlotSel || slotSel === (showSlot.idSlotActual ?? '')) ? 0.6 : 1 }}>
                {savingSlotSel ? <Loader size={14} className="animate-spin" /> : <MapPin size={14} />}
                {slotSel === '' ? 'Liberar cajón' : 'Guardar cambio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTitular && (
        <CambiarTitularModal
          idPension={showTitular.idPension}
          idCarrito={showTitular.idCarrito}
          idSocioActual={showTitular.idSocioActual}
          nombreSocioActual={showTitular.nombreSocioActual}
          idFamiliarActual={showTitular.idFamiliarActual}
          descCarrito={showTitular.descCarrito}
          onClose={() => setShowTitular(null)}
          onSaved={() => { setShowTitular(null); fetchPensiones() }}
        />
      )}

      {showCobrar && (
        <CobrarCuotaModal
          cuotas={showCobrar.cuotas}
          nombreSocio={showCobrar.nombreSocio}
          idSocio={showCobrar.idSocio}
          onClose={() => setShowCobrar(null)}
          onSaved={() => { setShowCobrar(null); fetchPensiones(); if (tab === 'cobranza') fetchCobranza() }}
        />
      )}

    </div>
  )
}
