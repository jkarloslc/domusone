'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, ChevronLeft, Car, Settings, Search, X, ChevronDown, ChevronRight, AlertCircle, CreditCard, BookOpen, Receipt, FileText, Printer, Loader, XCircle } from 'lucide-react'
import Link from 'next/link'
import CarritoModal from './CarritoModal'
import PensionModal from './PensionModal'
import CobrarCuotaModal from './CobrarCuotaModal'
import BitacoraModal from './BitacoraModal'

// ── Tipos ─────────────────────────────────────────────────────
type BitacoraEntry = {
  id: number
  tipo_evento: string
  descripcion: string
  taller: string | null
  tercero_nombre: string | null
  tercero_telefono: string | null
  costo_estimado: number | null
  costo_real: number | null
  nivel_urgencia: string | null
  resuelto: boolean
  fecha_evento: string
  fecha_fin: string | null
  observaciones: string | null
  usuario_registra: string | null
}

type Pension = {
  id: number
  id_socio_fk: number
  id_carrito_fk: number
  id_slot_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  monto_mensual: number
  activo: boolean
  observaciones: string | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_carritos: { marca: string | null; modelo: string | null; tipo: string; color: string | null; placa: string | null } | null
  cat_slots: { numero: string } | null
  pendientes: number    // cuotas pendientes (calculado)
  monto_pendiente: number
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
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  recibos_golf_det: DetRecibo[]
}
type PosCfg = { razon_social: string | null; rfc: string | null; direccion: string | null; telefono: string | null; municipio: string | null; leyenda_ticket: string | null }

const INSTITUCION = {
  nombre:    'Club de Golf Balvanera',
  rfc:       'CGB000101AAA',
  domicilio: 'Balvanera, Corregidora, Querétaro',
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

type Tab = 'pensiones' | 'recibos' | 'config'

export default function CarritosPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-carritos')

  const [tab, setTab] = useState<Tab>('pensiones')

  // ── Pensiones ─────────────────────────────────────────────
  const [pensiones, setPensiones]       = useState<Pension[]>([])
  const [loadingP, setLoadingP]         = useState(true)
  const [expandido, setExpandido]       = useState<number | null>(null)
  const [soloActivas, setSoloActivas]   = useState(true)
  const [busquedaP, setBusquedaP]       = useState('')

  // modales
  const [showCarrito, setShowCarrito]   = useState(false)
  const [showPension, setShowPension]   = useState<{
    idSocio: number; idCarrito: number; nombreSocio: string; descCarrito: string
    idPension?: number; idSlotExistente?: number | null; montoMensualExistente?: number
  } | null>(null)
  const [carritoNuevo, setCarritoNuevo] = useState<{ id: number; id_socio_fk: number } | null>(null)

  const [showCobrar, setShowCobrar]     = useState<{ cuotas: Cuota[]; nombreSocio: string; idSocio: number } | null>(null)

  // ── Bitácora ──────────────────────────────────────────────
  const [bitacora, setBitacora]         = useState<Record<number, BitacoraEntry[]>>({})
  const [loadingBit, setLoadingBit]     = useState<Record<number, boolean>>({})
  const [showBitacora, setShowBitacora] = useState<{ idCarrito: number; idPension: number | null; idSocio: number | null; nombreSocio: string; descCarrito: string } | null>(null)

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
  const [nuevoSlot, setNuevoSlot]       = useState('')
  const [savingSlot, setSavingSlot]     = useState(false)

  // ── Stats ─────────────────────────────────────────────────
  const [stats, setStats] = useState({ pensionesActivas: 0, cuotasPendientes: 0, montoPendiente: 0, vencidas: 0 })

  // ── Fetch pensiones ───────────────────────────────────────
  const fetchPensiones = useCallback(async () => {
    setLoadingP(true)
    let q = dbGolf.from('ctrl_pensiones')
      .select(`id, id_socio_fk, id_carrito_fk, id_slot_fk, fecha_inicio, fecha_fin, monto_mensual, activo, observaciones,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
        cat_carritos(marca, modelo, tipo, color, placa),
        cat_slots(numero)`)
      .order('created_at', { ascending: false })
    if (soloActivas) q = q.eq('activo', true)
    const { data: pData } = await q

    // Cuotas pendientes por pensión (incluye PAGO_PARCIAL)
    const { data: cxcData } = await dbGolf.from('cxc_golf')
      .select('id_pension_fk, saldo, status')
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .eq('tipo', 'PENSION_CARRITO')

    const pendPorPension: Record<number, { count: number; monto: number }> = {}
    for (const c of cxcData ?? []) {
      if (!c.id_pension_fk) continue
      if (!pendPorPension[c.id_pension_fk]) pendPorPension[c.id_pension_fk] = { count: 0, monto: 0 }
      pendPorPension[c.id_pension_fk].count++
      pendPorPension[c.id_pension_fk].monto += c.saldo
    }

    const result: Pension[] = (pData ?? []).map((p: any) => ({
      ...p,
      pendientes: pendPorPension[p.id]?.count ?? 0,
      monto_pendiente: pendPorPension[p.id]?.monto ?? 0,
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
    const { data: cfg } = await dbGolf.from('cfg_carritos').select('tarifa_mensual').single()
    const t = cfg?.tarifa_mensual ?? 0
    setTarifa(t); setTarifaEdit(t)
    const { data: sl } = await dbGolf.from('cat_slots').select('id, numero').eq('activo', true).order('numero')
    setSlots(sl ?? [])
  }, [])

  const fetchBitacora = async (idCarrito: number) => {
    setLoadingBit(prev => ({ ...prev, [idCarrito]: true }))
    const { data } = await dbGolf
      .from('bitacora_carritos')
      .select('id, tipo_evento, descripcion, taller, tercero_nombre, tercero_telefono, costo_estimado, costo_real, nivel_urgencia, resuelto, fecha_evento, fecha_fin, observaciones, usuario_registra')
      .eq('id_carrito_fk', idCarrito)
      .order('fecha_evento', { ascending: false })
    setBitacora(prev => ({ ...prev, [idCarrito]: (data as unknown as BitacoraEntry[]) ?? [] }))
    setLoadingBit(prev => ({ ...prev, [idCarrito]: false }))
  }

  // ── Fetch Recibos Pensiones ───────────────────────────────
  const fetchRecibosCarritos = useCallback(async () => {
    setLoadingR(true)
    const q = dbGolf.from('recibos_golf')
      .select(`id, folio, fecha_recibo, subtotal, descuento, total,
        forma_pago_nombre, referencia_pago, observaciones, usuario_cobra,
        status, id_socio_fk, id_venta_pos_fk, id_forma_pago_fk,
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
      const [{ data: centros }, { data: cfg }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, rfc, direccion, telefono, municipio, leyenda_ticket').single(),
      ])
      const centrosPos = (centros as { id: number; nombre: string; activo: boolean }[]) ?? []
      if (centrosPos.length === 0) throw new Error('No hay centros de venta POS activos.')
      // Buscar centro "Carritos/Pensiones" — fallback Membresías — fallback primero
      const centroSel = centrosPos.find(c => {
        const n = normR(c.nombre)
        return n.includes('carrito') || n.includes('pension') || n.includes('pensiones')
      }) ?? centrosPos.find(c => {
        const n = normR(c.nombre)
        return n.includes('membresia') || n.includes('club')
      }) ?? centrosPos[0]

      let ventaId = r.id_venta_pos_fk ?? null
      let folioDia = 0
      const fechaVentaIso = `${r.fecha_recibo}T12:00:00`

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
          subtotal: r.subtotal, descuento: r.descuento, iva: 0, total: r.total,
          status: 'PAGADA', usuario_crea: 'sistema',
          notas: `Ticket POS regenerado desde recibo pensión ${r.folio} (#${r.id})`,
        }).select('id, folio_dia').single()
        if (errVenta || !ventaData) throw new Error(errVenta?.message ?? 'No se pudo crear la venta POS')

        ventaId = (ventaData as any).id
        folioDia = (ventaData as any).folio_dia

        const detInsert = r.recibos_golf_det.map(d => ({
          id_venta_fk: ventaId!, id_producto_fk: null,
          concepto: d.concepto, cantidad: 1,
          precio_unitario: d.monto_final, descuento: 0, iva_pct: 0, iva: 0,
          subtotal: d.monto_final, total: d.monto_final, notas: d.periodo ?? null,
        }))
        if (r.descuento > 0) {
          detInsert.push({
            id_venta_fk: ventaId!, id_producto_fk: null,
            concepto: `Descuento adicional (${r.folio})`, cantidad: 1,
            precio_unitario: -r.descuento, descuento: 0, iva_pct: 0, iva: 0,
            subtotal: -r.descuento, total: -r.descuento, notas: null,
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

      const itemsTicket = r.recibos_golf_det.map(d => ({
        concepto: d.concepto, cantidad: 1, precio_unitario: d.monto_final, iva: 0, total: d.monto_final,
      }))
      if (r.descuento > 0) {
        itemsTicket.push({ concepto: `Descuento adicional`, cantidad: 1, precio_unitario: -r.descuento, iva: 0, total: -r.descuento })
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
        subtotal: r.subtotal, iva: 0, total: r.total,
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
  const handlePrintRecibo = (r: ReciboCarrito) => {
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
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:2px solid #059669;padding-bottom:16px}
        .inst-name{font-size:18px;font-weight:700;color:#065f46}
        .inst-sub{font-size:11px;color:#64748b;margin-top:2px}
        .folio-box{text-align:right}
        .folio-lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
        .folio-val{font-size:20px;font-weight:700;color:#065f46}
        .section{margin-bottom:18px}
        .section-title{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{padding:7px 10px;background:#065f46;color:#fff;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em}
        td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}
        tr:last-child td{border-bottom:none}
        .right{text-align:right}
        .totales{margin-left:auto;width:260px}
        .totales-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
        .totales-row.total{font-weight:700;font-size:15px;border-top:2px solid #059669;padding-top:8px;margin-top:4px;color:#065f46}
        .pago-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px}
        .pago-label{font-size:10px;color:#15803d;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
        .pago-val{font-size:14px;font-weight:700;color:#15803d}
        .firma-area{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}
        .firma-line{border-top:1px solid #1e293b;padding-top:4px;font-size:10px;color:#64748b;text-align:center}
        .footer{margin-top:32px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px}
      </style></head><body>
      <div class="header">
        <div>
          <div class="inst-name">${INSTITUCION.nombre}</div>
          <div class="inst-sub">${INSTITUCION.domicilio}</div>
          <div class="inst-sub">RFC: ${INSTITUCION.rfc}</div>
        </div>
        <div class="folio-box">
          <div class="folio-lbl">Recibo Pensión Carrito</div>
          <div class="folio-val">${r.folio}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${fechaFmtR(r.fecha_recibo)}</div>
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
        ${INSTITUCION.nombre} · ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  useEffect(() => { fetchPensiones() }, [fetchPensiones])
  useEffect(() => { if (tab === 'config') fetchConfig() }, [tab, fetchConfig])
  useEffect(() => { if (tab === 'recibos') fetchRecibosCarritos() }, [tab, fetchRecibosCarritos])

  const guardarTarifa = async () => {
    setSavingConfig(true)
    await dbGolf.from('cfg_carritos').update({ tarifa_mensual: tarifaEdit, updated_at: new Date().toISOString() }).eq('id', 1)
    setTarifa(tarifaEdit)
    setSavingConfig(false)
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

  // Tras crear carrito, abrir modal de pensión
  const handleCarritoSaved = (c: { id: number; id_socio_fk: number }) => {
    setShowCarrito(false)
    setCarritoNuevo(c)
    fetchPensiones()
  }

  const handlePensionSaved = () => {
    setShowPension(null)
    setCarritoNuevo(null)
    fetchPensiones()
  }

  // Cuotas pendientes del socio de una pensión
  const abrirCobro = async (pension: Pension) => {
    const { data } = await dbGolf.from('cxc_golf')
      .select('id, concepto, periodo, monto_original, descuento, monto_final, saldo, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago, tipo, id_socio_fk, cat_socios(nombre, apellido_paterno, apellido_materno)')
      .eq('id_socio_fk', pension.id_socio_fk)
      .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
      .order('fecha_vencimiento', { ascending: true })
    setShowCobrar({
      cuotas: (data as unknown as Cuota[]) ?? [],
      nombreSocio: nc(pension.cat_socios),
      idSocio: pension.id_socio_fk,
    })
  }

  const pensionesF = pensiones.filter(p => {
    if (!busquedaP.trim()) return true
    const q = busquedaP.toLowerCase()
    const nombre = nc(p.cat_socios).toLowerCase()
    const placa = (p.cat_carritos?.placa ?? '').toLowerCase()
    return nombre.includes(q) || placa.includes(q)
  })

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'pensiones', label: 'Pensiones',     icon: Car      },
    { key: 'recibos',   label: 'Recibos',       icon: Receipt  },
    { key: 'config',    label: 'Configuración', icon: Settings },
  ]

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
            <Link href="/golf" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
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
                    {['', 'Socio', 'Carrito', 'Cajón', 'Placa', 'Tarifa/mes', 'Pendientes', 'Status', ''].map(h => (
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
                            const next = abierto ? null : p.id
                            setExpandido(next)
                            if (next && !bitacora[p.id_carrito_fk]) fetchBitacora(p.id_carrito_fk)
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
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ color: 'var(--text-secondary)' }}>{carDesc}</div>
                            {p.cat_carritos?.tipo && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: p.cat_carritos.tipo === 'ELECTRICO' ? '#eff6ff' : '#fffbeb', color: p.cat_carritos.tipo === 'ELECTRICO' ? '#1d4ed8' : '#92400e', fontWeight: 600 }}>
                                {p.cat_carritos.tipo === 'ELECTRICO' ? '⚡ Eléctrico' : '⛽ Combustión'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                            {p.cat_slots ? `Cajón ${p.cat_slots.numero}` : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                            {p.cat_carritos?.placa ?? '—'}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#059669', whiteSpace: 'nowrap' }}>
                            {fmt$(p.monto_mensual)}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {p.pendientes > 0
                              ? <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{p.pendientes} · {fmt$(p.monto_pendiente)}</span>
                              : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: p.activo ? '#dcfce7' : '#f1f5f9', color: p.activo ? '#15803d' : '#64748b' }}>
                              {p.activo ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            {puedeEscribir && p.activo && p.pendientes > 0 && (
                              <button onClick={e => { e.stopPropagation(); abrirCobro(p) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <CreditCard size={12} /> {p.monto_pendiente > 0 ? 'Cobrar' : 'Ver cuotas'}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Fila expandida */}
                        {abierto && (() => {
                          const idCar = p.id_carrito_fk
                          const entries = bitacora[idCar] ?? []
                          const loadingB = loadingBit[idCar]
                          const carDesc2 = [p.cat_carritos?.marca, p.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
                          const tipoLabel: Record<string, string> = {
                            SALIDA_TALLER:    '🔧 Salida a Taller',
                            REGRESO_TALLER:   '✅ Regreso de Taller',
                            PRESTAMO_TERCERO: '🤝 Préstamo a Tercero',
                            INCIDENCIA:       '⚠️ Incidencia',
                          }
                          const tipoColor: Record<string, { color: string; bg: string }> = {
                            SALIDA_TALLER:    { color: '#d97706', bg: '#fffbeb' },
                            REGRESO_TALLER:   { color: '#15803d', bg: '#f0fdf4' },
                            PRESTAMO_TERCERO: { color: '#2563eb', bg: '#eff6ff' },
                            INCIDENCIA:       { color: '#dc2626', bg: '#fef2f2' },
                          }
                          const fmtDt = (d: string) => new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
                                      {puedeEscribir && p.activo && (
                                        <button onClick={e => {
                                          e.stopPropagation()
                                          setShowPension({
                                            idSocio: p.id_socio_fk,
                                            idCarrito: idCar,
                                            nombreSocio: nc(p.cat_socios),
                                            descCarrito: carDesc2,
                                            idPension: p.id,
                                            idSlotExistente: p.id_slot_fk,
                                            montoMensualExistente: p.monto_mensual,
                                          })
                                        }}
                                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#475569', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                                          <Plus size={12} /> Agregar cuotas
                                        </button>
                                      )}
                                      {puedeEscribir && (
                                        <button onClick={e => {
                                          e.stopPropagation()
                                          setShowBitacora({ idCarrito: idCar, idPension: p.id, idSocio: p.id_socio_fk, nombreSocio: nc(p.cat_socios), descCarrito: carDesc2 })
                                        }}
                                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#1e293b', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                                          <BookOpen size={12} /> Nuevo registro
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Bitácora — tabla */}
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <BookOpen size={12} /> Bitácora del carrito
                                    {loadingB && <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>Cargando…</span>}
                                    {!loadingB && <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>({entries.length} registro{entries.length !== 1 ? 's' : ''})</span>}
                                  </div>

                                  {!loadingB && entries.length === 0 ? (
                                    <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', paddingLeft: 4 }}>
                                      Sin registros en bitácora. Usa "Nuevo registro" para agregar el primero.
                                    </div>
                                  ) : (
                                    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                            {['Tipo', 'Descripción', 'Detalle', 'Fecha', 'Resuelto', ''].map(h => (
                                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {entries.map(e => {
                                            const tc = tipoColor[e.tipo_evento] ?? { color: '#475569', bg: '#f8fafc' }
                                            let detalle = ''
                                            if (e.taller) detalle = `Taller: ${e.taller}`
                                            if (e.costo_estimado) detalle += `${detalle ? ' · ' : ''}Est: $${e.costo_estimado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                                            if (e.costo_real) detalle += `${detalle ? ' · ' : ''}Real: $${e.costo_real.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
                                            if (e.tercero_nombre) detalle = `${e.tercero_nombre}${e.tercero_telefono ? ` · ${e.tercero_telefono}` : ''}`
                                            if (e.nivel_urgencia) detalle = `Urgencia: ${e.nivel_urgencia}`
                                            return (
                                              <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: tc.bg, color: tc.color }}>
                                                    {tipoLabel[e.tipo_evento] ?? e.tipo_evento}
                                                  </span>
                                                </td>
                                                <td style={{ padding: '8px 12px', color: '#1e293b', maxWidth: 240 }}>
                                                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.descripcion}</div>
                                                  {e.observaciones && <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>{e.observaciones}</div>}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{detalle || '—'}</td>
                                                <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                  {fmtDt(e.fecha_evento)}
                                                  {e.fecha_fin && <div style={{ fontSize: 10, color: '#94a3b8' }}>→ {fmtDt(e.fecha_fin)}</div>}
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                  {e.resuelto
                                                    ? <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 20, background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>✓</span>
                                                    : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                  {!e.resuelto && puedeEscribir && (
                                                    <button
                                                      onClick={async ev => {
                                                        ev.stopPropagation()
                                                        await dbGolf.from('bitacora_carritos').update({ resuelto: true }).eq('id', e.id)
                                                        fetchBitacora(idCar)
                                                      }}
                                                      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'none', border: '1px solid #e2e8f0', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                                                      Resolver
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

      {/* ── TAB: CONFIGURACIÓN ───────────────────────────── */}
      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>

          {/* Tarifa mensual */}
          <div className="card" style={{ padding: 20 }}>
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

          {/* Slots */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Slots / Cajones ({slots.length})</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
                placeholder="Número de cajón (ej. 42, A-12)…" value={nuevoSlot} onChange={e => setNuevoSlot(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && agregarSlot()} />
              <button onClick={agregarSlot} disabled={savingSlot || !nuevoSlot.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (!nuevoSlot.trim() || savingSlot) ? 0.6 : 1 }}>
                <Plus size={13} /> Agregar
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {slots.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 20 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46' }}>Cajón {s.numero}</span>
                  <button onClick={() => desactivarSlot(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 1, lineHeight: 1 }}><X size={11} /></button>
                </div>
              ))}
              {slots.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No hay slots configurados</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      {showCarrito && (
        <CarritoModal onClose={() => setShowCarrito(false)} onSaved={handleCarritoSaved} />
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
                const { data: s } = await dbGolf.from('cat_socios').select('nombre, apellido_paterno, apellido_materno').eq('id', carritoNuevo.id_socio_fk).single()
                const { data: c } = await dbGolf.from('cat_carritos').select('marca, modelo').eq('id', carritoNuevo.id).single()
                const nombreS = s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : ''
                const descC = c ? [c.marca, c.modelo].filter(Boolean).join(' ') || 'Carrito' : 'Carrito'
                setShowPension({ idSocio: carritoNuevo.id_socio_fk, idCarrito: carritoNuevo.id, nombreSocio: nombreS, descCarrito: descC })
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
          idPension={showPension.idPension}
          idSlotExistente={showPension.idSlotExistente}
          montoMensualExistente={showPension.montoMensualExistente}
          onClose={() => { setShowPension(null); setCarritoNuevo(null) }}
          onSaved={handlePensionSaved}
        />
      )}

      {showCobrar && (
        <CobrarCuotaModal
          cuotas={showCobrar.cuotas}
          nombreSocio={showCobrar.nombreSocio}
          idSocio={showCobrar.idSocio}
          onClose={() => setShowCobrar(null)}
          onSaved={() => { setShowCobrar(null); fetchPensiones() }}
        />
      )}

      {showBitacora && (
        <BitacoraModal
          idCarrito={showBitacora.idCarrito}
          idPension={showBitacora.idPension}
          idSocio={showBitacora.idSocio}
          nombreSocio={showBitacora.nombreSocio}
          descCarrito={showBitacora.descCarrito}
          onClose={() => setShowBitacora(null)}
          onSaved={() => {
            setShowBitacora(null)
            fetchBitacora(showBitacora.idCarrito)
          }}
        />
      )}
    </div>
  )
}
