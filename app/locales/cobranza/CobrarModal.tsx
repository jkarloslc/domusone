'use client'
import { useState, useEffect } from 'react'
import { dbCtrl, dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Save, Loader, Printer, Receipt, Plus, Trash2 } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { prorratearDescuento } from '@/lib/prorateoDescuento'

// ── Tipos ────────────────────────────────────────────────────
export type CuotaPendiente = {
  id: number
  concepto: string
  periodo: string | null
  monto_final: number
  saldo: number
  status: string
  fecha_vencimiento: string | null
}

type FormaPago   = { id: number; nombre: string }
type PagoLinea   = { id_forma_fk: number; forma_nombre: string; monto: string; referencia: string }
type PosCfg      = { razon_social: string | null; rfc: string | null; direccion: string | null; telefono: string | null; municipio: string | null; leyenda_ticket: string | null }

type Props = {
  cuotas:             CuotaPendiente[]
  nombreArrendatario: string
  idArrendatario:     number
  nombrePropiedad?:   string
  /** Periodo (YYYY-MM) que se preselecciona por defecto; las cuotas de otros periodos quedan visibles pero sin marcar */
  periodoDefault?:    string
  onClose:            () => void
  onSaved:            () => void
}

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const norm  = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const fmtMes = (d: string | null) =>
  d ? new Date(d + '-01T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : null
const hoyLocal = () => new Date().toLocaleDateString('en-CA')

// Rentas de locales/propiedades causan IVA — el monto capturado (monto_final)
// ya lo incluye, se desglosa hacia adentro para el CFDI.
const IVA_PCT_CUOTAS = 16
const desglosarIva = (montoConIva: number) => {
  const subtotal = Math.round((montoConIva / (1 + IVA_PCT_CUOTAS / 100)) * 100) / 100
  const iva      = Math.round((montoConIva - subtotal) * 100) / 100
  return { subtotal, iva }
}

async function generarFolio(): Promise<string> {
  const anio = new Date().getFullYear()
  const { data } = await dbCtrl.from('loc_recibos')
    .select('folio').like('folio', `RL-${anio}-%`)
    .order('folio', { ascending: false }).limit(1)
  const ultimo = (data as { folio: string }[] | null)?.[0]?.folio
  const num = ultimo ? parseInt(ultimo.split('-')[2] ?? '0') + 1 : 1
  return `RL-${anio}-${String(num).padStart(3, '0')}`
}

export type ClasifCuotaPOS = { idConcepto: number | null; idProducto: number | null }

// Resuelve la clasificación (concepto de ingreso y/o producto POS) por cada línea
// de un ticket, según el tipo de cuota:
// - Renta: sigue la cadena cuota (loc_cxc) → asignación (loc_asignaciones) → propiedad
//   (loc_propiedades), usando el concepto propio de la propiedad como id_concepto_ingreso_fk
//   directo en la línea (sin producto POS). Si la propiedad no tiene concepto propio (o la
//   línea no viene de una cuota, como "Cargo adicional"), el corte la clasifica en "Otros".
// - Servicios de Mantto: usa el producto POS compartido "Servicios de Mantto" (catálogo
//   golf.cat_productos_pos, centro Locales Comerciales) — igual que cualquier venta nativa
//   del POS — que a su vez está mapeado al concepto "Servicio de Mantenimiento". El monto
//   real siempre viene de la cuota (precio_variable=true en el producto).
export async function resolveConceptosPorCuota(idsCuota: number[]): Promise<Record<number, ClasifCuotaPOS>> {
  if (idsCuota.length === 0) return {}
  const { data: cxc } = await dbCtrl.from('loc_cxc').select('id, id_asignacion_fk, tipo').in('id', idsCuota)
  const cxcRows = (cxc ?? []) as { id: number; id_asignacion_fk: number | null; tipo: string | null }[]

  const idsAsig = Array.from(new Set(cxcRows.map(c => c.id_asignacion_fk).filter((v): v is number => v != null)))
  const { data: asigs } = idsAsig.length
    ? await dbCtrl.from('loc_asignaciones').select('id, id_propiedad_fk').in('id', idsAsig)
    : { data: [] as { id: number; id_propiedad_fk: number }[] }
  const asigRows = (asigs ?? []) as { id: number; id_propiedad_fk: number }[]

  const idsProp = Array.from(new Set(asigRows.map(a => a.id_propiedad_fk)))
  const { data: props } = idsProp.length
    ? await dbCtrl.from('loc_propiedades').select('id, id_concepto_ingreso_fk, id_producto_pos_fk').in('id', idsProp)
    : { data: [] as { id: number; id_concepto_ingreso_fk: number | null; id_producto_pos_fk: number | null }[] }
  // Prioridad: producto POS por propiedad (ya carga concepto + clave SAT); si a la
  // propiedad le falta el producto, cae de respaldo al concepto de ingreso directo.
  const propClasif: Record<number, ClasifCuotaPOS> = Object.fromEntries(
    (props ?? []).map((p: any) => [p.id, p.id_producto_pos_fk != null
      ? { idConcepto: null, idProducto: p.id_producto_pos_fk }
      : { idConcepto: p.id_concepto_ingreso_fk, idProducto: null }])
  )

  const asigClasif: Record<number, ClasifCuotaPOS> =
    Object.fromEntries(asigRows.map(a => [a.id, propClasif[a.id_propiedad_fk] ?? { idConcepto: null, idProducto: null }]))

  // Producto POS compartido de mantenimiento — se resuelve una sola vez si hay alguna cuota de ese tipo.
  // Si el producto todavía no existe en el catálogo (migración pendiente de correr), se usa como
  // respaldo el concepto de ingreso directo, para no dejar la línea sin clasificar.
  let idProductoMantto: number | null = null
  let idConceptoManttoFallback: number | null = null
  if (cxcRows.some(c => c.tipo === 'SERVICIOS_MANTTO')) {
    const { data: centros } = await dbGolf.from('cat_centros_venta').select('id, nombre').eq('activo', true)
    const centroLoc = ((centros ?? []) as { id: number; nombre: string }[]).find(c => norm(c.nombre).includes('local'))
    const q = dbGolf.from('cat_productos_pos').select('id, nombre').eq('activo', true).ilike('nombre', '%mantto%')
    const { data: prods } = centroLoc ? await q.eq('id_centro_fk', centroLoc.id) : await q
    idProductoMantto = ((prods ?? []) as { id: number; nombre: string }[])[0]?.id ?? null

    if (idProductoMantto == null) {
      const { data: centrosIng } = await dbCfg.from('centros_ingreso').select('id, nombre').eq('activo', true)
      const centroIngLoc = ((centrosIng ?? []) as { id: number; nombre: string }[]).find(c => norm(c.nombre).includes('local'))
      const qc = dbCfg.from('conceptos_ingreso').select('id, nombre').eq('activo', true).ilike('nombre', '%mantenimiento%')
      const { data: cons } = centroIngLoc ? await qc.eq('id_centro_ingreso_fk', centroIngLoc.id) : await qc
      idConceptoManttoFallback = ((cons ?? []) as { id: number; nombre: string }[])[0]?.id ?? null
    }
  }

  const resultado: Record<number, ClasifCuotaPOS> = {}
  for (const c of cxcRows) {
    if (c.tipo === 'SERVICIOS_MANTTO') {
      resultado[c.id] = idProductoMantto != null
        ? { idConcepto: null, idProducto: idProductoMantto }
        : { idConcepto: idConceptoManttoFallback, idProducto: null }
      continue
    }
    resultado[c.id] = c.id_asignacion_fk != null ? (asigClasif[c.id_asignacion_fk] ?? { idConcepto: null, idProducto: null }) : { idConcepto: null, idProducto: null }
  }
  return resultado
}

export async function printReciboLoc(reciboId: number, folio: string, nombreArrendatario: string) {
  const [{ data: detData }, { data: pagosData }, { data: reciboData }] = await Promise.all([
    dbCtrl.from('loc_recibos_det').select('concepto, periodo, monto_final').eq('id_recibo_fk', reciboId),
    dbCtrl.from('loc_recibos_pagos').select('forma_nombre, monto, referencia').eq('id_recibo_fk', reciboId),
    dbCtrl.from('loc_recibos').select('subtotal, descuento, total, fecha_recibo, observaciones').eq('id', reciboId).single(),
  ])
  const recibo = reciboData as { subtotal: number | null; descuento: number | null; total: number; fecha_recibo: string; observaciones: string | null } | null
  if (!recibo) return

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

  const det   = (detData   ?? []) as { concepto: string; periodo: string | null; monto_final: number }[]
  const pagos = (pagosData ?? []) as { forma_nombre: string; monto: number; referencia: string | null }[]

  const fmtFechaLarga = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

  const filas = det.map(d => `
    <tr>
      <td>${d.concepto ?? '—'}</td>
      <td>${fmtMes(d.periodo) ?? '—'}</td>
      <td class="right" style="font-weight:600">$${d.monto_final.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')

  const win = window.open('', '_blank', 'width=720,height=900')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"/><title>Recibo Locales ${folio}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:32px}
      .org-header{display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #0f766e;margin-bottom:18px}
      .org-nombre{font-size:18px;font-weight:700;color:#0f766e}
      .org-sub{font-size:11px;color:#64748b}
      .doc-title{font-size:14px;font-weight:600;color:#0f766e;margin-bottom:2px}
      .section-title{font-size:10px;font-weight:700;color:#0f766e;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid #99f6e4;padding-bottom:4px;margin-top:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{padding:7px 10px;background:#f0fdfa;color:#0f766e;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em;border:1px solid #99f6e4}
      td{padding:8px 10px;border-bottom:1px solid #99f6e4;font-size:12px}
      tr:last-child td{border-bottom:none}
      .right{text-align:right}
      .totales{margin-left:auto;width:220px}
      .totales-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
      .totales-row.total{font-weight:700;font-size:16px;border-top:2px solid #0f766e;padding-top:8px;margin-top:4px;color:#0f766e}
      .pago-box{background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;flex-direction:column;gap:8px}
      .pago-row{display:flex;justify-content:space-between;font-size:13px}
      .pago-label{font-size:10px;color:#0f766e;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
      .firma-area{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:52px}
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
        <div class="doc-title">Recibo de Renta de Local / Propiedad</div>
        <div style="font-size:11px;color:#64748b">Folio: <strong>${folio}</strong></div>
        <div style="font-size:11px;color:#64748b">${fmtFechaLarga(recibo.fecha_recibo)}</div>
      </div>
    </div>
    <div class="section-title">Datos del Arrendatario</div>
    <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:14px">${nombreArrendatario}</div>
    <div class="section-title">Cuotas cubiertas</div>
    <table>
      <thead><tr><th>Descripción</th><th>Período</th><th class="right">Importe</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="totales">
      <div class="totales-row total"><span>TOTAL</span><span>$${recibo.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
    </div>
    <div class="pago-box" style="margin-top:16px">
      <div class="pago-label">Forma${pagos.length > 1 ? 's' : ''} de pago</div>
      ${pagos.map(p => `<div class="pago-row"><span><strong>${p.forma_nombre}</strong>${p.referencia ? ` · Ref: ${p.referencia}` : ''}</span><span style="font-weight:700;color:#0f766e">$${p.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>`).join('')}
    </div>
    ${recibo.observaciones ? `<div style="font-size:11px;color:#64748b;padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:16px"><strong>Notas:</strong> ${recibo.observaciones}</div>` : ''}
    <div class="firma-area">
      <div class="firma-line">Firma del Arrendatario</div>
      <div class="firma-line">Recibió / Administración</div>
    </div>
    <div class="footer">
      Recibo de pago de renta de local / propiedad.<br/>
      ${orgNombre} · ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}

// ── Componente ───────────────────────────────────────────────
export default function CobrarModal({ cuotas, nombreArrendatario, idArrendatario, nombrePropiedad, periodoDefault, onClose, onSaved }: Props) {
  const { authUser } = useAuth()

  const [formasPago, setFormasPago] = useState<FormaPago[]>([])
  const [loading, setLoading]       = useState(true)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(() => {
    // Por defecto solo se marcan las cuotas del periodo actual; los meses atrasados quedan
    // visibles pero sin seleccionar para no tener que destildarlos uno por uno.
    if (periodoDefault) {
      const delPeriodo = cuotas.filter(c => c.periodo === periodoDefault)
      if (delPeriodo.length > 0) return new Set(delPeriodo.map(c => c.id))
    }
    return new Set(cuotas.map(c => c.id))
  })
  const [pagos, setPagos] = useState<PagoLinea[]>([{ id_forma_fk: 0, forma_nombre: '', monto: '', referencia: '' }])
  const [cargoAdicionalStr, setCargoAdicionalStr] = useState('')
  const [descuentoExtra, setDescuentoExtra]       = useState('')
  const [parcialHabilitado, setParcialHabilitado] = useState(false)
  const [montoParcialStr, setMontoParcialStr]     = useState('')
  const [fechaPago, setFechaPago] = useState<string>(hoyLocal())
  const [notas, setNotas]   = useState('')
  const [facturable, setFacturable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const [exito, setExito]           = useState<{ idRecibo: number; folio: string } | null>(null)
  const [idVentaPos, setIdVentaPos] = useState<number | null>(null)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [genTicket, setGenTicket]   = useState(false)
  const [ticketErr, setTicketErr]   = useState('')

  // Cargar formas de pago
  useEffect(() => {
    dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        setFormasPago((data as FormaPago[] | null) ?? [])
        setLoading(false)
      })
  }, [])

  const toggle = (id: number) =>
    setSeleccionados(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })

  const toggleTodas = () =>
    setSeleccionados(prev => prev.size === cuotas.length ? new Set() : new Set(cuotas.map(c => c.id)))

  // Cuotas de meses anteriores al periodo por defecto (adeudo) — se muestran pero no se marcan solas
  const cuotasAnteriores    = periodoDefault ? cuotas.filter(c => c.periodo !== periodoDefault) : []
  const anterioresSeleccionadas = cuotasAnteriores.filter(c => seleccionados.has(c.id))
  const todasAnterioresSel  = cuotasAnteriores.length > 0 && anterioresSeleccionadas.length === cuotasAnteriores.length
  const montoAnteriores     = cuotasAnteriores.reduce((s, c) => s + c.saldo, 0)
  const toggleAnteriores = () =>
    setSeleccionados(prev => {
      const next = new Set(prev)
      cuotasAnteriores.forEach(c => todasAnterioresSel ? next.delete(c.id) : next.add(c.id))
      return next
    })

  const cuotasSel        = cuotas.filter(c => seleccionados.has(c.id))
  const subtotalBruto    = cuotasSel.reduce((s, c) => s + c.saldo, 0)
  const cargoAdicional   = Math.max(0, parseFloat(cargoAdicionalStr) || 0)
  const subtotalConCargo = subtotalBruto + cargoAdicional
  const descExtra        = Math.min(parseFloat(descuentoExtra) || 0, subtotalConCargo)
  const totalCobro       = Math.max(0, subtotalConCargo - descExtra)

  // Cobro parcial
  const montoCobrar    = parcialHabilitado
    ? Math.min(parseFloat(montoParcialStr) || totalCobro, totalCobro)
    : totalCobro
  const saldoRestante  = Math.max(0, parseFloat((totalCobro - montoCobrar).toFixed(2)))
  const esParcial      = saldoRestante > 0

  const toggleParcial = () => {
    if (parcialHabilitado) {
      setParcialHabilitado(false)
      setMontoParcialStr('')
    } else {
      setParcialHabilitado(true)
    }
  }

  // Sincronizar la única línea de pago con el monto a cobrar
  useEffect(() => {
    const str = montoCobrar > 0 ? montoCobrar.toFixed(2) : ''
    setPagos(prev => prev.length !== 1 ? prev : [{ ...prev[0], monto: str }])
  }, [montoCobrar])

  const pagosValidos      = pagos.filter(p => p.id_forma_fk > 0 && parseFloat(p.monto) > 0)
  const totalDistribuido  = pagosValidos.reduce((s, p) => s + parseFloat(p.monto), 0)
  const balance           = parseFloat((montoCobrar - totalDistribuido).toFixed(2))

  const setPagoLinea = (i: number, partial: Partial<PagoLinea>) =>
    setPagos(ls => ls.map((l, j) => j !== i ? l : { ...l, ...partial }))
  const agregarLinea = () => {
    const prim  = formasPago[0]
    const saldo = parseFloat((montoCobrar - totalDistribuido).toFixed(2))
    setPagos(ls => [...ls, { id_forma_fk: prim?.id ?? 0, forma_nombre: prim?.nombre ?? '', monto: saldo > 0 ? saldo.toFixed(2) : '', referencia: '' }])
  }
  const quitarLinea = (i: number) => setPagos(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)

  const handleGuardar = async () => {
    if (seleccionados.size === 0) { setErr('Selecciona al menos una cuota'); return }
    if (pagosValidos.length === 0) { setErr('Agrega al menos una forma de pago con monto'); return }
    if (Math.abs(balance) > 0.01) {
      setErr(`La suma de pagos ($${totalDistribuido.toFixed(2)}) debe igualar el monto a cobrar ($${montoCobrar.toFixed(2)})`)
      return
    }
    setSaving(true); setErr('')

    const folio           = await generarFolio()
    const formasNombre    = pagosValidos.map(p => p.forma_nombre).join(' + ')
    const primerFormaId   = pagosValidos[0]?.id_forma_fk || null
    const primerRef       = pagosValidos[0]?.referencia || null

    // 1. Insertar recibo
    const { data: recData, error: e1 } = await dbCtrl.from('loc_recibos').insert({
      folio,
      fecha_recibo:       fechaPago,
      id_arrendatario_fk: idArrendatario,
      subtotal:           subtotalConCargo,
      descuento:          descExtra,
      total:              montoCobrar,
      forma_pago_nombre:  formasNombre,
      referencia_pago:    primerRef,
      observaciones:      notas || null,
      usuario_cobra:      authUser?.nombre ?? authUser?.user?.email ?? null,
      status:             'VIGENTE',
      id_forma_pago_fk:   primerFormaId,
      facturable,
    }).select('id').single()
    if (e1 || !recData) { setSaving(false); setErr(e1?.message ?? 'Error al crear recibo'); return }
    const idRecibo = (recData as { id: number }).id

    // 2. Detalle de cuotas — el cargo adicional se cobra primero, luego cuotas. El descuento
    // adicional (descExtra) ya viene prorrateado dentro de cada línea de cuota (prorratearDescuento):
    // no se guarda como línea aparte, así ticket POS y factura (armados a partir de este detalle)
    // nunca desglosan el descuento — cada línea trae directamente su monto neto.
    const cargoAplicado = cargoAdicional > 0 ? Math.min(montoCobrar, cargoAdicional) : 0
    const detalleNeto = prorratearDescuento(
      cuotasSel,
      c => c.saldo,
      parseFloat((montoCobrar - cargoAplicado + descExtra).toFixed(2)),
      parseFloat((montoCobrar - cargoAplicado).toFixed(2)),
    )
    const detalle = detalleNeto.map(({ item: c, montoNeto }) => ({
      id_recibo_fk:   idRecibo,
      id_cuota_fk:    c.id as number | null,
      concepto:       c.concepto,
      tipo:           'RENTA_LOCAL' as string | null,
      periodo:        c.periodo ?? null,
      monto_original: c.monto_final,
      descuento:      0,
      monto_final:    montoNeto,
    }))
    if (cargoAplicado > 0) {
      detalle.unshift({
        id_recibo_fk:   idRecibo,
        id_cuota_fk:    null,
        concepto:       'Cargo adicional',
        tipo:           null,
        periodo:        null,
        monto_original: cargoAdicional,
        descuento:      0,
        monto_final:    parseFloat(cargoAplicado.toFixed(2)),
      })
    }

    const { error: e2 } = await dbCtrl.from('loc_recibos_det').insert(detalle)
    if (e2) { setSaving(false); setErr(e2.message); return }

    // 3. Formas de pago del recibo
    const { error: e3 } = await dbCtrl.from('loc_recibos_pagos').insert(
      pagosValidos.map(p => ({
        id_recibo_fk:     idRecibo,
        id_forma_pago_fk: p.id_forma_fk,
        forma_nombre:     p.forma_nombre,
        monto:            parseFloat(p.monto),
        referencia:       p.referencia || null,
      }))
    )
    if (e3) { setSaving(false); setErr(e3.message); return }

    // 4. Actualizar saldo de cuotas (greedy, en paralelo). El descuento adicional también
    // extingue saldo de las cuotas (quedó condonado); lo cobrado del cargo adicional no
    // reduce saldo de ninguna cuota.
    let remaining = parseFloat((montoCobrar - cargoAplicado + descExtra).toFixed(2))
    const cuotaUpdates: PromiseLike<any>[] = []
    for (const c of cuotasSel) {
      const aplicar = Math.min(remaining, c.saldo)
      remaining = parseFloat((remaining - aplicar).toFixed(2))
      if (aplicar <= 0) continue // no se le aplicó nada: no tocar su status/saldo/fecha_pago
      const nuevoSaldo = parseFloat((c.saldo - aplicar).toFixed(2))
      cuotaUpdates.push(
        dbCtrl.from('loc_cxc').update({
          saldo:      nuevoSaldo,
          status:     nuevoSaldo === 0 ? 'PAGADO' : 'PAGO_PARCIAL',
          fecha_pago: nuevoSaldo === 0 ? fechaPago : null,
          forma_pago: formasNombre,
        }).eq('id', c.id).select('id')
      )
    }
    const results = await Promise.all(cuotaUpdates)
    const updErr = results.find((r: any) => r.error)?.error
    if (updErr) { setSaving(false); setErr(updErr.message); return }

    setSaving(false)
    setExito({ idRecibo, folio })
  }

  const handleImprimir = async () => {
    if (!exito) return
    setImprimiendo(true)
    await printReciboLoc(exito.idRecibo, exito.folio, nombreArrendatario)
    setImprimiendo(false)
  }

  const handleTicketPOS = async () => {
    if (!exito) return
    setGenTicket(true); setTicketErr('')
    try {
      const [{ data: centros }, { data: cfg }, { data: arr }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, rfc, direccion, telefono, municipio, leyenda_ticket').single(),
        dbCtrl.from('loc_arrendatarios').select('id_socio_fk').eq('id', idArrendatario).maybeSingle(),
      ])
      const centrosPos = (centros as { id: number; nombre: string }[]) ?? []
      if (!centrosPos.length) throw new Error('No hay centros POS activos.')
      const centroLoc = centrosPos.find(c => { const n = norm(c.nombre); return n.includes('local') || n.includes('propiedad') }) ?? centrosPos[0]
      // Si el arrendatario está vinculado a un socio, la venta se marca como suya —
      // así el modal de facturar (abrirFacturarPOS) precarga sus datos fiscales
      // automáticamente, igual que ya hace con ventas nativas de Golf.
      const idSocio = (arr as { id_socio_fk: number | null } | null)?.id_socio_fk ?? null

      const { data: recFull } = await dbCtrl.from('loc_recibos')
        .select('subtotal, descuento, total, fecha_recibo, id_venta_pos_fk, facturable').eq('id', exito.idRecibo).single()
      const rf = recFull as { subtotal: number; descuento: number; total: number; fecha_recibo: string; id_venta_pos_fk: number | null; facturable: boolean | null } | null
      if (!rf) throw new Error('No se encontró el recibo.')

      let ventaId = rf.id_venta_pos_fk
      let folioDia = 0
      const fechaIso = `${rf.fecha_recibo}T12:00:00`

      const { data: detPago } = await dbCtrl.from('loc_recibos_det').select('concepto, monto_final, id_cuota_fk').eq('id_recibo_fk', exito.idRecibo)
      const detList = ((detPago ?? []) as { concepto: string; monto_final: number; id_cuota_fk: number | null }[]).length > 0
        ? (detPago as { concepto: string; monto_final: number; id_cuota_fk: number | null }[])
        : [{ concepto: `Cobro Locales ${exito.folio}`, monto_final: rf.total, id_cuota_fk: null }]
      const detDesglosado = detList.map(d => ({ ...d, ...desglosarIva(d.monto_final) }))
      const totalIvaCuotas = detDesglosado.reduce((a, d) => a + d.iva, 0)

      const idsCuota = Array.from(new Set(detList.map(d => d.id_cuota_fk).filter((v): v is number => v != null)))
      const clasifPorCuota = await resolveConceptosPorCuota(idsCuota)
      const clasifDeLinea = (d: { id_cuota_fk: number | null }): { idConcepto: number | null; idProducto: number | null } =>
        (d.id_cuota_fk != null ? clasifPorCuota[d.id_cuota_fk] : null) ?? { idConcepto: null, idProducto: null }

      if (!ventaId) {
        const { data: maxF } = await dbGolf.from('ctrl_ventas').select('folio_dia')
          .eq('id_centro_fk', centroLoc.id)
          .gte('fecha', `${rf.fecha_recibo}T00:00:00`).lte('fecha', `${rf.fecha_recibo}T23:59:59`)
          .order('folio_dia', { ascending: false }).limit(1)
        folioDia = maxF && maxF.length > 0 ? ((maxF[0] as any).folio_dia + 1) : 1

        const { data: venta, error: ev } = await dbGolf.from('ctrl_ventas').insert({
          folio_dia: folioDia, id_centro_fk: centroLoc.id, fecha: fechaIso,
          nombre_cliente: nombreArrendatario, es_socio: idSocio != null, id_socio_fk: idSocio,
          subtotal: rf.subtotal ?? rf.total, descuento: rf.descuento ?? 0, iva: totalIvaCuotas, total: rf.total,
          status: 'PAGADA', facturable: rf.facturable ?? false, usuario_crea: authUser?.nombre ?? authUser?.user?.email ?? 'locales',
          notas: `Ticket POS desde recibo de locales ${exito.folio}${esParcial ? ' [PAGO PARCIAL]' : ''}`,
        }).select('id, folio_dia').single()
        if (ev || !venta) throw new Error(ev?.message ?? 'Error al crear venta POS')
        ventaId = (venta as any).id; folioDia = (venta as any).folio_dia

        await dbGolf.from('ctrl_ventas_det').insert(detDesglosado.map(d => {
          const clasif = clasifDeLinea(d)
          return {
            id_venta_fk: ventaId!, id_producto_fk: clasif.idProducto, id_concepto_ingreso_fk: clasif.idConcepto,
            concepto: d.concepto, cantidad: 1, precio_unitario: d.monto_final,
            descuento: 0, iva_pct: IVA_PCT_CUOTAS, iva: d.iva, subtotal: d.subtotal, total: d.monto_final, notas: null,
          }
        }))

        const { data: formasR } = await dbCtrl.from('loc_recibos_pagos').select('id_forma_pago_fk, forma_nombre, monto').eq('id_recibo_fk', exito.idRecibo)
        const formasRList = (formasR ?? []) as { id_forma_pago_fk: number | null; forma_nombre: string; monto: number }[]
        if (formasRList.length > 0) {
          await dbGolf.from('ctrl_ventas_pagos').insert(formasRList.map(f => ({ id_venta_fk: ventaId!, id_forma_fk: f.id_forma_pago_fk ?? null, forma_nombre: f.forma_nombre, monto: f.monto })))
        }
        await dbCtrl.from('loc_recibos').update({ id_venta_pos_fk: ventaId }).eq('id', exito.idRecibo)
      } else {
        const { data: ventaEx } = await dbGolf.from('ctrl_ventas').select('folio_dia').eq('id', ventaId).single()
        folioDia = (ventaEx as { folio_dia: number } | null)?.folio_dia ?? 0
      }
      setIdVentaPos(ventaId)

      // Datos para ticket
      const { data: formasFinal } = await dbCtrl.from('loc_recibos_pagos').select('forma_nombre, monto').eq('id_recibo_fk', exito.idRecibo)
      const cfgP = cfg as PosCfg | null
      const ticketData = {
        id: ventaId, folio_dia: folioDia || '—', fecha: fechaIso,
        cliente: nombreArrendatario, cajero: authUser?.nombre ?? authUser?.user?.email ?? 'locales', centro: centroLoc.nombre,
        razon_social: cfgP?.razon_social ?? 'DomusOne',
        municipio: cfgP?.municipio ?? '', direccion: cfgP?.direccion ?? '',
        rfc: cfgP?.rfc ?? '', telefono: cfgP?.telefono ?? '',
        leyenda: cfgP?.leyenda_ticket ?? '¡Gracias por su pago!',
        subtotal: parseFloat((rf.total - totalIvaCuotas).toFixed(2)), iva: totalIvaCuotas, total: rf.total,
        pagos: ((formasFinal ?? []) as { forma_nombre: string; monto: number }[]).map(f => ({ forma: f.forma_nombre, monto: f.monto })),
        items: detDesglosado.map(d => ({ concepto: d.concepto, cantidad: 1, precio_unitario: d.monto_final, iva: d.iva, total: d.monto_final })),
      }
      window.open(`/ticket-golf.html?data=${encodeURIComponent(JSON.stringify(ticketData))}&print=1`, '_blank', 'width=400,height=700')
    } catch (e: any) {
      setTicketErr(e?.message ?? 'Error al generar ticket')
    } finally {
      setGenTicket(false)
    }
  }

  // ── Pantalla de éxito ─────────────────────────────────────
  if (exito) {
    return (
      <ModalShell modulo="locales" titulo="Cobro registrado" onClose={() => { onSaved(); onClose() }} maxWidth={420}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn-ghost" onClick={() => { onSaved(); onClose() }}>Cerrar</button></div>}
      >
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Cobro registrado</div>
          <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#0f766e', letterSpacing: 1 }}>{exito.folio}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
            {nombreArrendatario}
            {nombrePropiedad && <span style={{ color: '#0f766e' }}> · {nombrePropiedad}</span>}
            {' · '}{fmt$(montoCobrar)}
            {esParcial && <span style={{ marginLeft: 6, color: '#d97706', fontWeight: 600 }}>PAGO PARCIAL</span>}
          </div>
          {esParcial && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e', textAlign: 'left' }}>
              Se cobró {fmt$(montoCobrar)} de {fmt$(totalCobro)} adeudado. Saldo pendiente: <strong>{fmt$(saldoRestante)}</strong>.
            </div>
          )}
          {idVentaPos && (
            <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600, marginTop: 6 }}>Ticket POS #{String(idVentaPos).padStart(6, '0')}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleImprimir} disabled={imprimiendo}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, border: '1px solid #99f6e4', borderRadius: 10, background: '#f0fdfa', color: '#0f766e', cursor: 'pointer', opacity: imprimiendo ? 0.6 : 1 }}>
            <Printer size={16} /> {imprimiendo ? 'Imprimiendo…' : 'Imprimir Recibo'}
          </button>
          <button onClick={handleTicketPOS} disabled={genTicket}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 10, background: '#0f766e', color: '#fff', cursor: 'pointer', opacity: genTicket ? 0.6 : 1 }}>
            <Receipt size={16} /> {genTicket ? 'Generando…' : idVentaPos ? 'Reimprimir Ticket POS' : 'Generar Ticket POS'}
          </button>
          {ticketErr && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{ticketErr}</div>}
        </div>
      </ModalShell>
    )
  }

  // ── Formulario ───────────────────────────────────────────
  return (
    <ModalShell modulo="locales" titulo="Registrar Cobro" onClose={onClose} maxWidth={580}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
          {seleccionados.size > 0 && (
            <div style={{ marginRight: 'auto' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>{cuotasSel.length} cuota{cuotasSel.length !== 1 ? 's' : ''} · subtotal {fmt$(subtotalBruto)}</div>
              {cargoAdicional > 0 && <div style={{ fontSize: 11, color: '#059669' }}>+ cargo adicional {fmt$(cargoAdicional)}</div>}
              {descExtra > 0 && <div style={{ fontSize: 11, color: '#dc2626' }}>– descuento {fmt$(descExtra)}</div>}
              <span style={{ fontSize: 15, fontWeight: 700, color: esParcial ? '#d97706' : '#16a34a' }}>
                {fmt$(montoCobrar)}
                {esParcial && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6, fontWeight: 400 }}>de {fmt$(totalCobro)}</span>}
              </span>
            </div>
          )}
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleGuardar}
            disabled={saving || seleccionados.size === 0 || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: esParcial ? '#d97706' : '#0f766e' }}>
            {saving ? <Loader size={13} /> : <Save size={13} />}
            {saving ? 'Guardando…' : esParcial ? 'Emitir Recibo Parcial' : 'Emitir Recibo'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f766e', padding: '8px 12px', background: '#f0fdfa', borderRadius: 8, border: '1px solid #99f6e4' }}>
          {nombreArrendatario}
          {nombrePropiedad && (
            <div style={{ fontSize: 11, fontWeight: 500, color: '#115e59', marginTop: 2 }}>
              Propiedad: {nombrePropiedad}
            </div>
          )}
        </div>

        {/* Cuotas pendientes */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cuotas pendientes — selecciona las que se liquidan</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {cuotasAnteriores.length > 0 && (
                <button onClick={toggleAnteriores} style={{ fontSize: 11, fontWeight: 600, color: todasAnterioresSel ? '#64748b' : '#d97706', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>
                  {todasAnterioresSel ? 'Excluir meses anteriores' : `Incluir meses anteriores (+${cuotasAnteriores.length} · ${fmt$(montoAnteriores)})`}
                </button>
              )}
              {cuotas.length > 1 && (
                <button onClick={toggleTodas} style={{ fontSize: 11, fontWeight: 600, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>
                  {seleccionados.size === cuotas.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
              )}
            </div>
          </div>
          {cuotas.length === 0 ? (
            <div style={{ fontSize: 12, color: '#16a34a', padding: '12px 0' }}>Sin cuotas pendientes</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {cuotas.map((c, i) => {
                const checked  = seleccionados.has(c.id)
                const vencido  = c.status === 'Vencido' || (c.fecha_vencimiento && c.fecha_vencimiento < hoyLocal())
                const esMesActual = !!periodoDefault && c.periodo === periodoDefault
                return (
                  <div key={c.id} onClick={() => toggle(c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer',
                      background: checked ? 'rgba(15,118,110,0.07)' : (i % 2 === 0 ? 'transparent' : 'var(--surface-800)'),
                      borderBottom: i < cuotas.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.id)}
                      onClick={e => e.stopPropagation()} style={{ accentColor: '#0f766e', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400 }}>{c.concepto}</div>
                      {c.periodo && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtMes(c.periodo)}</div>}
                    </div>
                    {esMesActual && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap' }}>Mes actual</span>}
                    {vencido && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>Vencida</span>}
                    <div style={{ fontWeight: 700, color: checked ? '#0f766e' : 'var(--text-primary)', fontSize: 13 }}>{fmt$(c.saldo)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Cargo adicional + Descuento adicional */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>Cargo adicional ($)</label>
            <input className="input" type="number" min={0} step={0.01}
              value={cargoAdicionalStr} onChange={e => setCargoAdicionalStr(e.target.value)}
              placeholder="0.00" style={{ width: '100%' }} />
            {cargoAdicional > 0 && (
              <div style={{ fontSize: 11, color: '#059669', marginTop: 3 }}>+ {fmt$(cargoAdicional)} sobre el total</div>
            )}
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>Descuento adicional ($)</label>
            <input className="input" type="number" min={0} step={0.01}
              value={descuentoExtra} onChange={e => setDescuentoExtra(e.target.value)}
              placeholder="0.00" style={{ width: '100%' }} />
            {descExtra > 0 && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>– {fmt$(descExtra)} sobre el total</div>
            )}
          </div>
        </div>

        {/* Cobro parcial */}
        {seleccionados.size > 0 && (
          <div style={{ border: `1px solid ${parcialHabilitado ? '#fde68a' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s' }}>
            <div
              onClick={toggleParcial}
              style={{ padding: '10px 14px', background: parcialHabilitado ? '#fffbeb' : 'var(--surface-800)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', borderBottom: parcialHabilitado ? '1px solid #fde68a' : 'none' }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: parcialHabilitado ? '#92400e' : 'var(--text-secondary)' }}>Cobro parcial</span>
                {!parcialHabilitado && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>Cobrar menos del total adeudado</span>}
              </div>
              {/* Toggle switch */}
              <div style={{ width: 40, height: 22, borderRadius: 11, background: parcialHabilitado ? '#d97706' : '#cbd5e1', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: parcialHabilitado ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
              </div>
            </div>

            {parcialHabilitado && (
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#92400e', marginBottom: 4, display: 'block', fontWeight: 600 }}>Monto a cobrar ahora</label>
                    <input
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      className="input" type="number" min={0.01} step={0.01} max={totalCobro}
                      value={montoParcialStr} onChange={e => setMontoParcialStr(e.target.value)}
                      placeholder={`Máx. ${fmt$(totalCobro)}`}
                      style={{ width: '100%', fontWeight: 700, border: '1px solid #fbbf24' }} />
                  </div>
                  <button
                    onClick={() => setMontoParcialStr(totalCobro.toFixed(2))}
                    style={{ padding: '8px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    Total
                  </button>
                </div>
                {esParcial ? (
                  <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                    ⚠ Saldo pendiente: <strong>{fmt$(saldoRestante)}</strong> · Las cuotas quedarán en PAGO PARCIAL
                  </div>
                ) : montoParcialStr ? (
                  <div style={{ fontSize: 11, color: '#15803d' }}>✓ Cubre el total adeudado</div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Formas de pago */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'var(--surface-800)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Formas de pago *</span>
            <button onClick={agregarLinea}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#0f766e', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Plus size={12} /> Agregar
            </button>
          </div>
          <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pagos.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1fr 28px', gap: 6, alignItems: 'center' }}>
                <select className="input" value={p.id_forma_fk}
                  onChange={e => {
                    const sel = formasPago.find(f => f.id === Number(e.target.value))
                    setPagoLinea(i, { id_forma_fk: Number(e.target.value), forma_nombre: sel?.nombre ?? '' })
                  }}>
                  <option value={0}>— Forma —</option>
                  {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
                <input className="input" type="number" min={0} step={0.01}
                  value={p.monto}
                  placeholder={i === 0 && pagos.length === 1 ? montoCobrar.toFixed(2) : '0.00'}
                  onChange={e => setPagoLinea(i, { monto: e.target.value })}
                  style={{ textAlign: 'right', fontWeight: 600 }} />
                <input className="input" value={p.referencia} placeholder="Referencia…"
                  onChange={e => setPagoLinea(i, { referencia: e.target.value })} />
                <button onClick={() => quitarLinea(i)}
                  style={{ padding: 4, background: 'none', border: 'none', cursor: pagos.length > 1 ? 'pointer' : 'default', color: pagos.length > 1 ? '#dc2626' : 'var(--border)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: Math.abs(balance) < 0.01 ? '#f0fdf4' : '#fef2f2', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#64748b' }}>{Math.abs(balance) < 0.01 ? '✓ Suma cuadrada' : balance > 0 ? 'Falta distribuir' : 'Exceso'}</span>
            <span style={{ fontWeight: 700, color: Math.abs(balance) < 0.01 ? '#15803d' : '#dc2626' }}>
              {Math.abs(balance) < 0.01 ? fmt$(montoCobrar) : fmt$(Math.abs(balance))}
            </span>
          </div>
        </div>

        {/* Fecha de pago + Notas */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha de pago</label>
            <input className="input" type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
              style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
            <textarea className="input" rows={1} value={notas} onChange={e => setNotas(e.target.value)}
              style={{ resize: 'vertical', width: '100%' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: facturable ? '#f0fdfa' : 'var(--surface-800)', border: `1px solid ${facturable ? '#99f6e4' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer' }}
          onClick={() => setFacturable(f => !f)}>
          <input type="checkbox" checked={facturable} onChange={() => setFacturable(f => !f)}
            onClick={e => e.stopPropagation()} style={{ accentColor: '#0f766e', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: facturable ? '#0f766e' : 'var(--text-secondary)' }}>Solicita factura</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Marca este cobro como facturable para emisión posterior</div>
          </div>
        </div>

        {err && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
      </div>
    </ModalShell>
  )
}
