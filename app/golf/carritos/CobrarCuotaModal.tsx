'use client'
import { useState, useEffect, useRef } from 'react'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Save, Loader, CheckCircle, Printer, Receipt, Plus, Trash2 } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'

type Cuota = {
  id: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  saldo: number          // saldo restante a pagar
  status: string
  fecha_vencimiento: string | null
  tipo: string
}

type FormaPago = { id: number; nombre: string }
type PosCentro = { id: number; nombre: string; activo: boolean }
type PosCfg = { razon_social: string | null; rfc: string | null; direccion: string | null; telefono: string | null; municipio: string | null; leyenda_ticket: string | null }

type Socio = {
  id: number
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  numero_socio: string | null
  email: string | null
  telefono: string | null
  cat_categorias_socios?: { nombre: string } | null
}

type Props = {
  cuotas: Cuota[]
  nombreSocio: string
  idSocio: number
  onClose: () => void
  onSaved: () => void
}

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const hoy  = new Date().toISOString().split('T')[0]
const vencida = (f: string | null) => !!f && f < hoy

const TIPOS_LABEL: Record<string, string> = {
  INSCRIPCION:     'Inscripción',
  MENSUALIDAD:     'Mensualidad',
  PENSION_CARRITO: 'Pensión Carrito',
}
const norm = (s: string) => s
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')

// ── Config de la institución (ajusta a tu realidad) ──────────
const INSTITUCION = {
  nombre:    'Club de Golf Balvanera',
  rfc:       'CGB000101AAA',
  domicilio: 'Balvanera, Corregidora, Querétaro',
  tel:       '',
  logo:      '/logo.png',   // opcional – si existe en /public
}

export default function CobrarCuotaModal({ cuotas, nombreSocio, idSocio, onClose, onSaved }: Props) {
  const { authUser } = useAuth()

  const [formasPago, setFormasPago]     = useState<FormaPago[]>([])
  const [socioInfo, setSocioInfo]       = useState<Socio | null>(null)
  const [loadingInit, setLoadingInit]   = useState(true)

  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(() => new Set(cuotas.map(c => c.id)))

  const toggleCuota = (id: number) =>
    setSeleccionadas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  type PagoLinea = { id_forma_pago_fk: number; forma_nombre: string; monto: string; referencia: string }

  const [descuentoExtra, setDescuentoExtra] = useState('')
  const [pagosLineas, setPagosLineas] = useState<PagoLinea[]>([
    { id_forma_pago_fk: 0, forma_nombre: '', monto: '', referencia: '' }
  ])
  const [fechaPago, setFechaPago] = useState(hoy)
  const [observaciones, setObservaciones] = useState('')
  const [facturable, setFacturable]     = useState(false)
  const [montoParcialStr, setMontoParcialStr] = useState('')

  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [recibo, setRecibo]     = useState<{ id: number; folio: string } | null>(null)
  const [idVentaPos, setIdVentaPos] = useState<number | null>(null)
  const [generandoTicket, setGenerandoTicket] = useState(false)
  const [ticketErr, setTicketErr] = useState('')

  const printRef = useRef<HTMLDivElement>(null)

  // ── Carga inicial ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre'),
      dbGolf.from('cat_socios')
        .select('id, nombre, apellido_paterno, apellido_materno, numero_socio, email, telefono, cat_categorias_socios(nombre)')
        .eq('id', idSocio).single(),
    ]).then(([{ data: fps }, { data: soc }]) => {
      const fpsList = (fps as FormaPago[]) ?? []
      setFormasPago(fpsList)
      if (fpsList.length) {
        setPagosLineas([{ id_forma_pago_fk: fpsList[0].id, forma_nombre: fpsList[0].nombre, monto: '', referencia: '' }])
      }
      setSocioInfo(soc as unknown as Socio)
      setLoadingInit(false)
    })
  }, [idSocio])

  // ── Cálculos ───────────────────────────────────────────────
  const cuotasSelec   = cuotas.filter(c => seleccionadas.has(c.id))
  const subtotalBruto = cuotasSelec.reduce((a, c) => a + (c.saldo ?? c.monto_final), 0)
  const descExtra     = Math.min(parseFloat(descuentoExtra) || 0, subtotalBruto)
  const totalCobro    = Math.max(0, subtotalBruto - descExtra)

  // Cobro parcial
  const montoParcial  = Math.min(parseFloat(montoParcialStr) || totalCobro, totalCobro)
  const saldoQuedara  = Math.max(0, parseFloat((totalCobro - montoParcial).toFixed(2)))
  const esParcial     = saldoQuedara > 0

  // Multi-forma de pago
  const pagosValidos    = pagosLineas.filter(p => p.id_forma_pago_fk > 0)
  const totalDistribuido = pagosValidos.reduce((a, p) => a + (parseFloat(p.monto) || 0), 0)
  const balancePagos    = parseFloat((montoParcial - totalDistribuido).toFixed(2))
  // Para backward compat en header del recibo y POS
  const idFormaPago     = pagosLineas[0]?.id_forma_pago_fk ?? 0
  const formaPagoNombre = pagosLineas[0]?.forma_nombre ?? ''

  const setPagoLinea = (i: number, partial: Partial<PagoLinea>) =>
    setPagosLineas(ls => ls.map((l, j) => j !== i ? l : { ...l, ...partial }))

  const agregarPagoLinea = () => {
    const balance = parseFloat((montoParcial - totalDistribuido).toFixed(2))
    const primera = formasPago[0]
    setPagosLineas(ls => [...ls, {
      id_forma_pago_fk: primera?.id ?? 0,
      forma_nombre: primera?.nombre ?? '',
      monto: balance > 0 ? balance.toFixed(2) : '',
      referencia: '',
    }])
  }

  const removerPagoLinea = (i: number) =>
    setPagosLineas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)

  const abrirTicketPOS = (payload: any, autoPrint = true) => {
    const encoded = encodeURIComponent(JSON.stringify(payload))
    const url = `/ticket-golf.html?data=${encoded}${autoPrint ? '&print=1' : ''}`
    window.open(url, '_blank', 'width=400,height=700')
  }

  // ── Guardar cobro ──────────────────────────────────────────
  const handleSave = async () => {
    if (cuotasSelec.length === 0) { setError('No hay cuotas para cobrar'); return }
    const pagosOk = pagosLineas.filter(p => p.id_forma_pago_fk > 0 && parseFloat(p.monto) > 0)
    if (pagosOk.length === 0) { setError('Agrega al menos una forma de pago con monto'); return }
    if (Math.abs(balancePagos) > 0.01) {
      setError(`La suma de los pagos (${fmt$(totalDistribuido)}) debe ser igual al monto a cobrar (${fmt$(montoParcial)})`)
      return
    }
    setSaving(true); setError('')

    // 1. Generar folio
    const anio = new Date().getFullYear()
    const { data: folioData } = await dbGolf.rpc('next_folio_recibo', { anio })
    const folio = (folioData as string) ?? `RG-${anio}-?????`

    // Formas de pago concatenadas para el header (backward compat)
    const formasNombres = pagosOk.map(p => p.forma_nombre).join(' + ')

    // 2. Insertar recibo cabecera
    const { data: reciboData, error: e1 } = await dbGolf.from('recibos_golf').insert({
      folio,
      id_socio_fk:       idSocio,
      fecha_recibo:      fechaPago,
      subtotal:          subtotalBruto,
      descuento:         descExtra,
      total:             montoParcial,
      id_forma_pago_fk:  pagosOk[0]?.id_forma_pago_fk ?? null,
      forma_pago_nombre: formasNombres,
      referencia_pago:   pagosOk[0]?.referencia || null,
      observaciones:     observaciones || null,
      usuario_cobra:     authUser?.nombre ?? 'sistema',
      status:            'VIGENTE',
      facturable,
    }).select('id, folio, id_venta_pos_fk').single()

    if (e1 || !reciboData) { setError(e1?.message ?? 'Error al crear recibo'); setSaving(false); return }
    const reciboId = (reciboData as { id: number; folio: string; id_venta_pos_fk: number | null }).id
    const folioFinal = (reciboData as { id: number; folio: string; id_venta_pos_fk: number | null }).folio
    setIdVentaPos((reciboData as { id: number; folio: string; id_venta_pos_fk: number | null }).id_venta_pos_fk ?? null)

    // 3. Insertar detalle del recibo — monto aplicado por cuota (greedy)
    let rem2 = montoParcial
    const detRows = cuotasSelec.map(c => {
      const cuotaSaldo = c.saldo ?? c.monto_final
      const aplicar = Math.min(rem2, cuotaSaldo)
      rem2 = parseFloat((rem2 - aplicar).toFixed(2))
      return {
        id_recibo_fk:   reciboId,
        id_cuota_fk:    c.id,
        concepto:       c.concepto,
        tipo:           c.tipo,
        periodo:        c.periodo,
        monto_original: c.monto_original,
        descuento:      c.descuento,
        monto_final:    parseFloat(aplicar.toFixed(2)),
      }
    }).filter(d => d.monto_final > 0)

    const { error: e2 } = await dbGolf.from('recibos_golf_det').insert(detRows)
    if (e2) { setError(e2.message); setSaving(false); return }

    // 4. Insertar formas de pago del recibo (tabla multi-pago)
    const { error: ePagos } = await dbGolf.from('recibos_golf_pagos').insert(
      pagosOk.map(p => ({
        id_recibo_fk:     reciboId,
        id_forma_pago_fk: p.id_forma_pago_fk,
        forma_nombre:     p.forma_nombre,
        monto:            parseFloat(p.monto),
        referencia:       p.referencia || null,
      }))
    )
    if (ePagos) { setError(ePagos.message); setSaving(false); return }

    // 5. Aplicar pago greedy a cuotas
    let remaining = montoParcial
    const updates: Promise<any>[] = []
    for (const c of cuotasSelec) {
      const cuotaSaldo = c.saldo ?? c.monto_final
      const aplicar = Math.min(remaining, cuotaSaldo)
      const nuevoSaldo = parseFloat((cuotaSaldo - aplicar).toFixed(2))
      const nuevoStatus = nuevoSaldo === 0 ? 'PAGADO' : 'PAGO_PARCIAL'
      updates.push(
        dbGolf.from('cxc_golf').update({
          saldo:           nuevoSaldo,
          status:          nuevoStatus,
          fecha_pago:      nuevoStatus === 'PAGADO' ? fechaPago : null,
          forma_pago:      formasNombres,
          referencia_pago: pagosOk[0]?.referencia || null,
          observaciones:   observaciones || null,
          usuario_cobra:   authUser?.nombre ?? null,
          id_recibo_fk:    reciboId,
        }).eq('id', c.id)
      )
      remaining = parseFloat((remaining - aplicar).toFixed(2))
    }
    const results = await Promise.all(updates)
    const updateError = results.find(r => r.error)?.error
    if (updateError) { setError(updateError.message); setSaving(false); return }

    setSaving(false)
    setTicketErr('')
    setRecibo({ id: reciboId, folio: folioFinal })
  }

  const generarTicketPOS = async () => {
    if (!recibo) return
    setGenerandoTicket(true)
    setTicketErr('')

    try {
      const [{ data: reciboDB, error: errRec }, { data: centros }, { data: cfg }] = await Promise.all([
        dbGolf.from('recibos_golf').select('id, folio, id_venta_pos_fk').eq('id', recibo.id).single(),
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, rfc, direccion, telefono, municipio, leyenda_ticket').single(),
      ])
      if (errRec || !reciboDB) throw new Error(errRec?.message ?? 'No se pudo leer el recibo para generar ticket')

      const centrosPos = (centros as PosCentro[]) ?? []
      if (centrosPos.length === 0) throw new Error('No hay centros de venta POS activos.')

      // Si las cuotas son de pensión carrito, buscar centro "Carritos/Pensiones"; si no, "Membresías"
      const esPension = cuotas.some(c => c.tipo === 'PENSION_CARRITO')
      const centroSel = centrosPos.find(c => {
        const n = norm(c.nombre)
        return esPension
          ? (n.includes('carrito') || n.includes('pension') || n.includes('pensiones'))
          : (n.includes('membresia') || n.includes('membresias') || n.includes('club'))
      }) ?? centrosPos[0]

      let ventaId = (reciboDB as { id_venta_pos_fk: number | null }).id_venta_pos_fk ?? null
      let folioDia = 0
      const fechaVentaIso = `${fechaPago}T12:00:00`

      if (!ventaId) {
        const { data: maxFolio } = await dbGolf.from('ctrl_ventas')
          .select('folio_dia')
          .eq('id_centro_fk', centroSel.id)
          .gte('fecha', `${fechaPago}T00:00:00`)
          .lte('fecha', `${fechaPago}T23:59:59`)
          .order('folio_dia', { ascending: false })
          .limit(1)
        folioDia = maxFolio && maxFolio.length > 0 ? ((maxFolio[0] as { folio_dia: number }).folio_dia + 1) : 1

        const { data: ventaData, error: errVenta } = await dbGolf.from('ctrl_ventas').insert({
          folio_dia: folioDia,
          id_centro_fk: centroSel.id,
          fecha: fechaVentaIso,
          id_socio_fk: idSocio,
          nombre_cliente: nc(socioInfo),
          es_socio: true,
          subtotal: subtotalBruto,
          descuento: descExtra,
          iva: 0,
          total: montoParcial,
          status: 'PAGADA',
          usuario_crea: authUser?.nombre ?? 'sistema',
          notas: `Ticket POS generado desde recibo golf ${recibo.folio} (#${recibo.id})${esParcial ? ' [PAGO PARCIAL]' : ''}`,
        }).select('id, folio_dia').single()
        if (errVenta || !ventaData) throw new Error(errVenta?.message ?? 'No se pudo crear la venta POS')

        ventaId = (ventaData as { id: number; folio_dia: number }).id
        folioDia = (ventaData as { id: number; folio_dia: number }).folio_dia

        const detInsert = cuotasSelec.map(c => ({
          id_venta_fk: ventaId!,
          id_producto_fk: null,
          concepto: c.concepto,
          cantidad: 1,
          precio_unitario: c.saldo ?? c.monto_final,
          descuento: 0,
          iva_pct: 0,
          iva: 0,
          subtotal: c.saldo ?? c.monto_final,
          total: c.saldo ?? c.monto_final,
          notas: c.periodo ?? null,
        }))
        if (descExtra > 0) {
          detInsert.push({
            id_venta_fk: ventaId!,
            id_producto_fk: null,
            concepto: `Descuento adicional (${recibo.folio})`,
            cantidad: 1,
            precio_unitario: -descExtra,
            descuento: 0,
            iva_pct: 0,
            iva: 0,
            subtotal: -descExtra,
            total: -descExtra,
            notas: null,
          })
        }
        const { error: errDet } = await dbGolf.from('ctrl_ventas_det').insert(detInsert)
        if (errDet) throw new Error(errDet.message)

        // Insertar todas las formas de pago en ctrl_ventas_pagos
        const pagosVenta = pagosLineas.filter(p => p.id_forma_pago_fk > 0 && parseFloat(p.monto) > 0)
        const { error: errPag } = await dbGolf.from('ctrl_ventas_pagos').insert(
          pagosVenta.map(p => ({
            id_venta_fk:  ventaId,
            id_forma_fk:  p.id_forma_pago_fk || null,
            forma_nombre: p.forma_nombre,
            monto:        parseFloat(p.monto),
          }))
        )
        if (errPag) throw new Error(errPag.message)

        const { error: errLink } = await dbGolf.from('recibos_golf').update({ id_venta_pos_fk: ventaId }).eq('id', recibo.id)
        if (errLink) throw new Error(errLink.message)
        setIdVentaPos(ventaId)
      } else {
        const { data: ventaExist } = await dbGolf.from('ctrl_ventas').select('folio_dia').eq('id', ventaId).single()
        folioDia = ((ventaExist as { folio_dia: number } | null)?.folio_dia) ?? 0
      }

      const itemsTicket = cuotasSelec.map(c => ({
        concepto: c.concepto,
        cantidad: 1,
        precio_unitario: c.saldo ?? c.monto_final,
        iva: 0,
        total: c.saldo ?? c.monto_final,
      }))
      if (descExtra > 0) {
        itemsTicket.push({
          concepto: `Descuento adicional (${recibo.folio})`,
          cantidad: 1,
          precio_unitario: -descExtra,
          iva: 0,
          total: -descExtra,
        })
      }

      const ticketData = {
        id: ventaId,
        folio_dia: folioDia || '—',
        fecha: fechaVentaIso,
        cliente: nc(socioInfo),
        cajero: authUser?.nombre ?? '—',
        centro: centroSel.nombre,
        razon_social: (cfg as PosCfg | null)?.razon_social ?? INSTITUCION.nombre,
        municipio: (cfg as PosCfg | null)?.municipio ?? '',
        direccion: (cfg as PosCfg | null)?.direccion ?? INSTITUCION.domicilio,
        rfc: (cfg as PosCfg | null)?.rfc ?? INSTITUCION.rfc,
        telefono: (cfg as PosCfg | null)?.telefono ?? INSTITUCION.tel,
        leyenda: (cfg as PosCfg | null)?.leyenda_ticket ?? `Cobro relacionado al recibo ${recibo.folio}.`,
        subtotal: subtotalBruto,
        iva: 0,
        total: montoParcial,
        pagos: pagosLineas.filter(p => p.id_forma_pago_fk > 0 && parseFloat(p.monto) > 0).map(p => ({ forma: p.forma_nombre, monto: parseFloat(p.monto) })),
        items: itemsTicket,
      }
      abrirTicketPOS(ticketData, true)
    } catch (e: any) {
      setTicketErr(e?.message ?? 'No se pudo generar el ticket POS')
    } finally {
      setGenerandoTicket(false)
    }
  }

  // ── Imprimir ───────────────────────────────────────────────
  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=750,height=900')
    if (!win || !printRef.current) return
    win.document.write(`
      <!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Recibo ${recibo?.folio}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 32px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #1e3a5f; padding-bottom: 16px; }
        .inst-name { font-size: 18px; font-weight: 700; color: #1e3a5f; }
        .inst-sub  { font-size: 11px; color: #64748b; margin-top: 2px; }
        .folio-box { text-align: right; }
        .folio-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
        .folio-val { font-size: 20px; font-weight: 700; color: #1e3a5f; }
        .section   { margin-bottom: 18px; }
        .section-title { font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
        .info-item label { font-size: 10px; color: #64748b; display: block; margin-bottom: 1px; }
        .info-item span  { font-size: 12px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { padding: 7px 10px; background: #1e3a5f; color: #fff; font-size: 10px; text-align: left; text-transform: uppercase; letter-spacing: 0.05em; }
        td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
        tr:last-child td { border-bottom: none; }
        .right { text-align: right; }
        .totales { margin-left: auto; width: 260px; }
        .totales-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
        .totales-row.total { font-weight: 700; font-size: 15px; border-top: 2px solid #1e3a5f; padding-top: 8px; margin-top: 4px; color: #1e3a5f; }
        .pago-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
        .pago-label { font-size: 10px; color: #15803d; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }
        .pago-val   { font-size: 14px; font-weight: 700; color: #15803d; }
        .parcial-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 11px; color: #92400e; }
        .firma-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
        .firma-line { border-top: 1px solid #1e293b; padding-top: 4px; font-size: 10px; color: #64748b; text-align: center; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
        .badge-fact { background: #eff6ff; color: #1d4ed8; }
        .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
      </style></head><body>
      ${printRef.current.innerHTML}
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const nc = (s: Socio | null) => s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : nombreSocio
  const fechaFmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

  // ── Panel de recibo emitido ────────────────────────────────
  if (recibo) {
    return (
      <ModalShell modulo="golf-carritos" titulo="Cobro registrado" subtitulo={`Folio: ${recibo.folio}`} maxWidth={680} icono={CheckCircle} onClose={onSaved} footer={<>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {cuotasSelec.length} cuota{cuotasSelec.length !== 1 ? 's' : ''} cobrada{cuotasSelec.length !== 1 ? 's' : ''} · {fmt$(montoParcial)}
          {esParcial && <span style={{ marginLeft: 6, color: '#d97706', fontWeight: 600 }}>PAGO PARCIAL</span>}
          {idVentaPos && <span style={{ marginLeft: 8, color: '#15803d', fontWeight: 600 }}>Ticket POS #{String(idVentaPos).padStart(6, '0')}</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onSaved} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cerrar</button>
          <button onClick={generarTicketPOS} disabled={generandoTicket}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: '1px solid #a7f3d0', borderRadius: 8, background: '#ecfdf5', color: '#047857', cursor: 'pointer', opacity: generandoTicket ? 0.6 : 1 }}>
            {generandoTicket ? <Loader size={14} className="animate-spin" /> : <Receipt size={14} />}
            {idVentaPos ? 'Reimprimir Ticket POS' : 'Generar Ticket POS'}
          </button>
          <button onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#1e3a5f', color: '#fff', cursor: 'pointer' }}>
            <Printer size={14} /> Imprimir Recibo
          </button>
        </div>
      </>}>
        {/* Vista previa del recibo */}
            <div ref={printRef}>
              {/* ── RECIBO IMPRIMIBLE ── */}
              <div className="header">
                <div>
                  <div className="inst-name">{INSTITUCION.nombre}</div>
                  <div className="inst-sub">{INSTITUCION.domicilio}</div>
                  {INSTITUCION.rfc && <div className="inst-sub">RFC: {INSTITUCION.rfc}</div>}
                </div>
                <div className="folio-box">
                  <div className="folio-lbl">Recibo de Cobro</div>
                  <div className="folio-val">{recibo.folio}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{fechaFmt(fechaPago)}</div>
                  {facturable && <span className="badge badge-fact" style={{ marginTop: 4 }}>Facturable</span>}
                </div>
              </div>

              <div className="section">
                <div className="section-title">Datos del Socio</div>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Nombre</label>
                    <span>{nc(socioInfo)}</span>
                  </div>
                  {socioInfo?.numero_socio && (
                    <div className="info-item">
                      <label>No. Socio</label>
                      <span>{socioInfo.numero_socio}</span>
                    </div>
                  )}
                  {socioInfo?.cat_categorias_socios?.nombre && (
                    <div className="info-item">
                      <label>Categoría</label>
                      <span>{socioInfo.cat_categorias_socios.nombre}</span>
                    </div>
                  )}
                  {socioInfo?.email && (
                    <div className="info-item">
                      <label>Email</label>
                      <span>{socioInfo.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {esParcial && (
                <div className="parcial-box">
                  <strong>PAGO PARCIAL:</strong> Se cobró {fmt$(montoParcial)} de {fmt$(totalCobro)} adeudado.
                  Saldo pendiente: <strong>{fmt$(saldoQuedara)}</strong>. Las cuotas no liquidadas quedan en estado PAGO_PARCIAL.
                </div>
              )}

              <div className="section">
                <div className="section-title">Detalle de Cuotas</div>
                <table>
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th>Tipo</th>
                      <th>Período</th>
                      <th className="right">Monto</th>
                      <th className="right">Desc.</th>
                      <th className="right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuotasSelec.map(c => (
                      <tr key={c.id}>
                        <td>{c.concepto}</td>
                        <td>{TIPOS_LABEL[c.tipo] ?? c.tipo}</td>
                        <td>{c.periodo ?? '—'}</td>
                        <td className="right">{fmt$(c.monto_original)}</td>
                        <td className="right">{c.descuento > 0 ? fmt$(c.descuento) : '—'}</td>
                        <td className="right" style={{ fontWeight: 600 }}>{fmt$(c.saldo ?? c.monto_final)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="totales">
                  <div className="totales-row">
                    <span>Subtotal adeudado</span>
                    <span>{fmt$(subtotalBruto)}</span>
                  </div>
                  {descExtra > 0 && (
                    <div className="totales-row">
                      <span>Descuento adicional</span>
                      <span style={{ color: '#dc2626' }}>– {fmt$(descExtra)}</span>
                    </div>
                  )}
                  {esParcial && (
                    <div className="totales-row">
                      <span>Saldo pendiente</span>
                      <span style={{ color: '#d97706' }}>{fmt$(saldoQuedara)}</span>
                    </div>
                  )}
                  <div className="totales-row total">
                    <span>{esParcial ? 'COBRADO AHORA' : 'TOTAL'}</span>
                    <span>{fmt$(montoParcial)}</span>
                  </div>
                </div>
              </div>

              <div className="pago-box" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="pago-label">Formas de pago</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d' }}>{authUser?.nombre ?? '—'}</div>
                </div>
                {pagosLineas.filter(p => p.id_forma_pago_fk > 0 && parseFloat(p.monto) > 0).map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span><strong>{p.forma_nombre}</strong>{p.referencia ? ` · Ref: ${p.referencia}` : ''}</span>
                    <span style={{ fontWeight: 700, color: '#15803d' }}>{fmt$(parseFloat(p.monto))}</span>
                  </div>
                ))}
              </div>

              {ticketErr && (
                <div style={{ marginBottom: 14, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                  {ticketErr}
                </div>
              )}

              {observaciones && (
                <div style={{ fontSize: 11, color: '#64748b', padding: '8px 12px', background: '#f8fafc', borderRadius: 6, marginBottom: 16 }}>
                  <strong>Observaciones:</strong> {observaciones}
                </div>
              )}

              <div className="firma-area">
                <div className="firma-line">Firma del Socio</div>
                <div className="firma-line">Cajero / Recibí</div>
              </div>

              <div className="footer">
                Este recibo es comprobante de pago de cuotas del club. Para facturación, presentar este folio en administración.<br/>
                {INSTITUCION.nombre} · {new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>
        {/* Vista previa del recibo */}
      </ModalShell>
    )
  }

  // ── Formulario de cobro ────────────────────────────────────
  return (
    <ModalShell modulo="golf-carritos" titulo="Cobrar Cuotas" subtitulo={nombreSocio} maxWidth={520} icono={Receipt} onClose={onClose} footer={<>
      <div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{cuotasSelec.length} cuota{cuotasSelec.length !== 1 ? 's' : ''} · subtotal {fmt$(subtotalBruto)}</div>
        {descExtra > 0 && <div style={{ fontSize: 11, color: '#dc2626' }}>– descuento {fmt$(descExtra)}</div>}
        <div style={{ fontSize: 22, fontWeight: 700, color: esParcial ? '#d97706' : '#059669' }}>
          {fmt$(montoParcial)}
          {esParcial && <span style={{ fontSize: 12, marginLeft: 6, color: '#64748b' }}>de {fmt$(totalCobro)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
        <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving || cuotasSelec.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: esParcial ? '#d97706' : '#059669', color: '#fff', cursor: 'pointer', opacity: (saving || cuotasSelec.length === 0 || !idFormaPago) ? 0.6 : 1 }}>
          {saving ? <Loader size={14} className="animate-spin" /> : <Receipt size={14} />}
          {esParcial ? 'Registrar pago parcial' : 'Registrar cobro'}
        </button>
      </div>
    </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loadingInit ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}><Loader size={20} className="animate-spin" /></div>
          ) : (
            <>
              {/* Lista de cuotas con checkboxes */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    {cuotasSelec.length} / {cuotas.length} cuota{cuotas.length !== 1 ? 's' : ''} seleccionada{cuotasSelec.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setSeleccionadas(seleccionadas.size === cuotas.length ? new Set() : new Set(cuotas.map(c => c.id)))}
                    style={{ fontSize: 11, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    {seleccionadas.size === cuotas.length ? 'Desmarcar todo' : 'Marcar todo'}
                  </button>
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: '0 0 10px 10px' }}>
                  {cuotas.map((c, i) => {
                    const venc = vencida(c.fecha_vencimiento)
                    const sel  = seleccionadas.has(c.id)
                    const isParcialCuota = c.status === 'PAGO_PARCIAL'
                    const displaySaldo = c.saldo ?? c.monto_final
                    return (
                      <div key={c.id}
                        onClick={() => toggleCuota(c.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < cuotas.length - 1 ? '1px solid #f1f5f9' : 'none', background: sel ? (venc ? '#fff5f5' : '#f0fdf4') : '#fafafa', cursor: 'pointer', transition: 'background 0.1s' }}>
                        {/* checkbox visual */}
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? '#059669' : '#cbd5e1'}`, background: sel ? '#059669' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div style={{ flex: 1, opacity: sel ? 1 : 0.45 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{c.concepto}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {c.periodo && <span>{c.periodo}</span>}
                            {c.fecha_vencimiento && (
                              <span style={{ color: venc ? '#dc2626' : '#94a3b8' }}>
                                {venc ? '⚠ Vencida' : 'Vence'} {new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                            <span style={{ padding: '1px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 600 }}>
                              {TIPOS_LABEL[c.tipo] ?? c.tipo}
                            </span>
                            {isParcialCuota && (
                              <span style={{ padding: '1px 6px', borderRadius: 20, background: '#fffbeb', color: '#d97706', fontSize: 10, fontWeight: 600 }}>
                                Pago Parcial
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, opacity: sel ? 1 : 0.4 }}>
                          {isParcialCuota && c.monto_final !== displaySaldo && (
                            <div style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(c.monto_final)}</div>
                          )}
                          {!isParcialCuota && c.descuento > 0 && (
                            <div style={{ fontSize: 10, color: '#94a3b8', textDecoration: 'line-through' }}>{fmt$(c.monto_original)}</div>
                          )}
                          <div style={{ fontSize: 14, fontWeight: 700, color: venc ? '#dc2626' : (isParcialCuota ? '#d97706' : '#1e293b') }}>
                            {fmt$(displaySaldo)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Descuento adicional */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Descuento adicional ($)</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                    type="number" min="0" step="0.01"
                    value={descuentoExtra}
                    onChange={e => setDescuentoExtra(e.target.value)}
                    placeholder="0.00"
                  />
                  {descExtra > 0 && (
                    <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>– {fmt$(descExtra)} sobre el total</div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Fecha de pago</label>
                  <input
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                    type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
                  />
                </div>
              </div>

              {/* Formas de pago — multi-línea */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Formas de pago *</span>
                  <button onClick={agregarPagoLinea}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#059669', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pagosLineas.map((p, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr 28px', gap: 6, alignItems: 'center' }}>
                      <select
                        style={{ padding: '7px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                        value={p.id_forma_pago_fk}
                        onChange={e => {
                          const sel = formasPago.find(f => f.id === Number(e.target.value))
                          setPagoLinea(i, { id_forma_pago_fk: Number(e.target.value), forma_nombre: sel?.nombre ?? '' })
                        }}>
                        <option value={0}>— Forma —</option>
                        {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                      </select>
                      <input
                        style={{ padding: '7px 8px', fontSize: 13, fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', fontFamily: 'inherit', outline: 'none', textAlign: 'right' }}
                        type="number" min="0" step="0.01"
                        value={p.monto}
                        placeholder={i === 0 && pagosLineas.length === 1 ? fmt$(montoParcial) : '0.00'}
                        onChange={e => setPagoLinea(i, { monto: e.target.value })}
                      />
                      <input
                        style={{ padding: '7px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 7, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                        value={p.referencia} placeholder="Referencia…"
                        onChange={e => setPagoLinea(i, { referencia: e.target.value })}
                      />
                      <button onClick={() => removerPagoLinea(i)}
                        style={{ padding: '4px', background: 'none', border: 'none', cursor: pagosLineas.length > 1 ? 'pointer' : 'default', color: pagosLineas.length > 1 ? '#dc2626' : '#cbd5e1' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Balance */}
                <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9', background: Math.abs(balancePagos) < 0.01 ? '#f0fdf4' : '#fef2f2', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#64748b' }}>
                    {Math.abs(balancePagos) < 0.01 ? '✓ Suma cuadrada' : balancePagos > 0 ? `Falta distribuir` : `Exceso`}
                  </span>
                  <span style={{ fontWeight: 700, color: Math.abs(balancePagos) < 0.01 ? '#15803d' : '#dc2626' }}>
                    {Math.abs(balancePagos) < 0.01 ? fmt$(montoParcial) : `${fmt$(Math.abs(balancePagos))}`}
                  </span>
                </div>
              </div>

              {/* Monto parcial */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>
                  Monto a cobrar ahora
                  {esParcial && <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706', fontWeight: 600 }}>(PAGO PARCIAL)</span>}
                </label>
                <input
                  style={{ width: '100%', padding: '8px 12px', fontSize: 14, fontWeight: 700, border: `1px solid ${esParcial ? '#fbbf24' : '#e2e8f0'}`, borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}
                  type="number" min="0" step="0.01" max={totalCobro}
                  value={montoParcialStr}
                  onChange={e => setMontoParcialStr(e.target.value)}
                  placeholder={fmt$(totalCobro)}
                />
                {esParcial && (
                  <div style={{ marginTop: 6, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                    ⚠ Quedará un saldo pendiente de <strong>{fmt$(saldoQuedara)}</strong>. Las cuotas no liquidadas quedarán en estado PAGO PARCIAL.
                  </div>
                )}
              </div>

              {/* Observaciones y facturable */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Observaciones</label>
                <textarea
                  style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', height: 52, resize: 'vertical' }}
                  value={observaciones} onChange={e => setObservaciones(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: facturable ? '#eff6ff' : '#f8fafc', border: `1px solid ${facturable ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer' }}
                onClick={() => setFacturable(f => !f)}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${facturable ? '#2563eb' : '#cbd5e1'}`, background: facturable ? '#2563eb' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {facturable && <CheckCircle size={12} color="#fff" />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: facturable ? '#1d4ed8' : '#475569' }}>Solicita factura</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Marca este cobro como facturable para emisión posterior</div>
                </div>
              </div>

              {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}
            </>
          )}
      </div>
    </ModalShell>
  )
}
