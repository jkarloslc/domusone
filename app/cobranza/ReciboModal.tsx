'use client'
import { useState, useEffect } from 'react'
import { dbCat, dbCtrl, dbCfg, dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Save, Loader, Plus, Trash2, CheckCircle, Printer, Receipt } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { prorratearDescuento } from '@/lib/prorateoDescuento'
import { type ReciboDetalle, type ReciboPago, type Cargo, fmt, MESES, CUENTAS } from './types'

type Lote = { id: number; cve_lote: string | null; lote: number | null }
type FormaPago = { id: number; nombre: string }
type PosCfg = { razon_social: string | null; rfc: string | null; direccion: string | null; telefono: string | null; municipio: string | null; leyenda_ticket: string | null }

const ANIOS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i)
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Props = {
  cargoInicial?: Cargo
  onClose: () => void
  onSaved: () => void
}

// Folio autogenerado RC-YYYY-NNNN cuando el usuario no captura uno manual
async function generarFolio(): Promise<string> {
  const anio = new Date().getFullYear()
  const { data } = await dbCtrl.from('recibos')
    .select('folio').like('folio', `RC-${anio}-%`)
    .order('folio', { ascending: false }).limit(1)
  const ultimo = (data as { folio: string }[] | null)?.[0]?.folio
  const num = ultimo ? parseInt(ultimo.split('-')[2] ?? '0') + 1 : 1
  return `RC-${anio}-${String(num).padStart(4, '0')}`
}

export default function ReciboModal({ cargoInicial, onClose, onSaved }: Props) {
  const { authUser } = useAuth()
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [lotes, setLotes]           = useState<Lote[]>([])
  const [formasPago, setFormasPago] = useState<FormaPago[]>([])
  const [cargosPendientes, setCargosPendientes] = useState<Cargo[]>([])
  const [loteSearch, setLoteSearch] = useState(cargoInicial ? ((cargoInicial as any).lotes?.cve_lote ?? '') : '')

  const [form, setForm] = useState({
    id_lote_fk:       cargoInicial?.id_lote_fk?.toString() ?? '',
    folio:            '',
    fecha_recibo:     new Date().toISOString().split('T')[0],
    fecha_pago:       new Date().toISOString().split('T')[0],
    propietario:      '',
    empresa:          '',
    cuenta_receptora: '1',
    rfc_factura:      '',
    folio_factura:    '',
  })

  type Linea = ReciboDetalle & { id_cargo_fk?: number | null; cargo_saldo?: number }

  const [lineas, setLineas] = useState<Linea[]>(
    cargoInicial ? [{
      id_cargo_fk: cargoInicial.id, cargo_saldo: cargoInicial.saldo,
      concepto: cargoInicial.concepto, cantidad: 1,
      precio_unitario: cargoInicial.saldo, descuento: 0,
      subtotal: cargoInicial.saldo, iva: 0, total: cargoInicial.saldo,
      periodo_mes: cargoInicial.periodo_mes, periodo_anio: cargoInicial.periodo_anio,
      id_cuota_lote_fk: null,
    }] : [{
      id_cargo_fk: null, concepto: '', cantidad: 1, precio_unitario: 0,
      descuento: 0, subtotal: 0, iva: 0, total: 0,
      periodo_mes: MESES[new Date().getMonth()], periodo_anio: new Date().getFullYear(),
      id_cuota_lote_fk: null,
    }]
  )

  const [pagos, setPagos] = useState<ReciboPago[]>([{
    monto: cargoInicial?.saldo ?? 0, referencia: '',
    fecha: new Date().toISOString().split('T')[0], id_forma_pago_fk: null
  }])

  // Homologado con golf: cargo/descuento adicionales sobre el total del recibo
  const [cargoAdicionalStr, setCargoAdicionalStr] = useState('')
  const [descuentoExtra, setDescuentoExtra]       = useState('')

  // Cobro parcial — homologado con golf/hípico/locales
  const [parcialHabilitado, setParcialHabilitado] = useState(false)
  const [montoParcialStr, setMontoParcialStr]     = useState('')
  const toggleParcial = () => {
    if (parcialHabilitado) { setParcialHabilitado(false); setMontoParcialStr('') }
    else setParcialHabilitado(true)
  }

  const [exito, setExito]                 = useState<{ id: number; folio: string } | null>(null)
  const [idVentaPos, setIdVentaPos]       = useState<number | null>(null)
  const [generandoTicket, setGenerandoTicket] = useState(false)
  const [ticketErr, setTicketErr]         = useState('')

  useEffect(() => {
    dbCat.from('lotes').select('id, cve_lote, lote').order('cve_lote')
      .then(({ data }) => setLotes(data as Lote[] ?? []))
    dbCfg.from('formas_pago').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setFormasPago(data as FormaPago[] ?? []))
  }, [])

  useEffect(() => {
    if (!form.id_lote_fk) { setCargosPendientes([]); return }
    dbCtrl.from('cargos').select('*').eq('id_lote_fk', Number(form.id_lote_fk))
      .in('status', ['Pendiente', 'Parcial']).order('fecha_cargo')
      .then(({ data }) => setCargosPendientes(data as Cargo[] ?? []))
  }, [form.id_lote_fk])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const calcLinea = (l: Linea): Linea => {
    const subtotal = Number(l.cantidad) * Number(l.precio_unitario) - Number(l.descuento)
    return { ...l, subtotal, iva: 0, total: subtotal }
  }

  const setLinea = (i: number, partial: Partial<Linea>) =>
    setLineas(ls => ls.map((l, j) => j === i ? calcLinea({ ...l, ...partial }) : l))

  const agregarCargo = (cargo: Cargo) => {
    if (lineas.some(l => l.id_cargo_fk === cargo.id)) return
    const nueva: Linea = {
      id_cargo_fk: cargo.id, cargo_saldo: cargo.saldo,
      concepto: `${cargo.concepto}${cargo.periodo_mes ? ` — ${cargo.periodo_mes} ${cargo.periodo_anio}` : ''}`,
      cantidad: 1, precio_unitario: cargo.saldo, descuento: 0,
      subtotal: cargo.saldo, iva: 0, total: cargo.saldo,
      periodo_mes: cargo.periodo_mes, periodo_anio: cargo.periodo_anio,
      id_cuota_lote_fk: cargo.id_cuota_lote_fk ?? null,
    }
    setLineas(ls => {
      const sinVacias = ls.filter(l => l.id_cargo_fk !== null || l.concepto.trim() !== '')
      return [...sinVacias, nueva]
    })
  }

  const totalLineas      = lineas.reduce((a, l) => a + (l.total ?? 0), 0)
  const cargoAdicional   = Math.max(0, parseFloat(cargoAdicionalStr) || 0)
  const subtotalConCargo = totalLineas + cargoAdicional
  const descExtra        = Math.min(parseFloat(descuentoExtra) || 0, subtotalConCargo)
  const totalRecibo      = Math.max(0, subtotalConCargo - descExtra)

  // Cobro parcial
  const montoCobrar   = parcialHabilitado
    ? Math.min(parseFloat(montoParcialStr) || totalRecibo, totalRecibo)
    : totalRecibo
  const saldoRestante = Math.max(0, parseFloat((totalRecibo - montoCobrar).toFixed(2)))
  const esParcial      = saldoRestante > 0

  const totalPagado      = pagos.reduce((a, p) => a + (Number(p.monto) || 0), 0)
  const diferencia       = parseFloat((montoCobrar - totalPagado).toFixed(2))

  // Sincroniza la única línea de pago con el monto a cobrar (homologado con golf/hípico/locales)
  useEffect(() => {
    setPagos(prev => prev.length !== 1 ? prev : [{ ...prev[0], monto: montoCobrar > 0 ? montoCobrar : 0 }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoCobrar])

  const formaNombre = (id: number | null | undefined) =>
    formasPago.find(f => f.id === id)?.nombre ?? '—'

  const handleSubmit = async () => {
    const lineasValidas = lineas.filter(l => l.concepto.trim() && l.total > 0)
    if (!form.id_lote_fk) { setError('Selecciona un lote'); return }
    if (!lineasValidas.length) { setError('Agrega al menos una línea con monto'); return }
    const pagosValidos = pagos.filter(p => Number(p.monto) > 0)
    if (!pagosValidos.length) { setError('Agrega al menos una forma de pago con monto'); return }
    if (Math.abs(diferencia) > 0.01) {
      setError(`La suma de los pagos (${fmt(totalPagado)}) debe ser igual al monto a cobrar (${fmt(montoCobrar)})`)
      return
    }
    setSaving(true); setError('')

    const folio = form.folio.trim() || await generarFolio()

    const { data: recibo, error: err1 } = await dbCtrl.from('recibos').insert({
      id_lote_fk:       Number(form.id_lote_fk),
      folio,
      fecha_recibo:     form.fecha_recibo,
      fecha_pago:       form.fecha_pago || null,
      propietario:      form.propietario.trim() || null,
      empresa:          form.empresa.trim() || null,
      cuenta_receptora: form.cuenta_receptora ? Number(form.cuenta_receptora) : null,
      monto:            montoCobrar,
      rfc_factura:      form.rfc_factura.trim() || null,
      folio_factura:    form.folio_factura.trim() || null,
      tipo_concepto:    'Pago de Cuota',
      usuario_crea:     authUser?.nombre ?? null,
      activo:           true,
    }).select('id').single()

    if (err1) { setError(err1.message); setSaving(false); return }
    const reciboId = recibo.id

    // Detalle: el cargo adicional se cobra primero, luego las líneas. El descuento adicional
    // (descExtra) y, en su caso, el cobro parcial, se prorratean dentro de cada línea con el
    // mismo helper que golf/hípico/locales (lib/prorateoDescuento) — así el detalle nunca
    // desglosa el descuento aparte y siempre cuadra exactamente con lo realmente cobrado.
    const cargoAplicado = cargoAdicional > 0 ? Math.min(montoCobrar, cargoAdicional) : 0
    const detalleNeto = prorratearDescuento(
      lineasValidas,
      l => l.total,
      parseFloat((montoCobrar - cargoAplicado + descExtra).toFixed(2)),
      parseFloat((montoCobrar - cargoAplicado).toFixed(2)),
    )
    const detRows = detalleNeto.map(({ item: l, montoNeto }) => ({
      id_recibo_fk:     reciboId,
      id_cargo_fk:      (l as any).id_cargo_fk ?? null,
      id_cuota_lote_fk: l.id_cuota_lote_fk ?? null,
      concepto:         l.concepto,
      cantidad:         l.cantidad,
      precio_unitario:  l.precio_unitario,
      descuento:        l.descuento ?? 0,
      subtotal:         montoNeto,
      iva:              0,
      total:            montoNeto,
      periodo_mes:      l.periodo_mes ?? null,
      periodo_anio:     l.periodo_anio ?? null,
    }))
    if (cargoAplicado > 0) {
      detRows.unshift({
        id_recibo_fk: reciboId, id_cargo_fk: null, id_cuota_lote_fk: null,
        concepto: 'Cargo adicional', cantidad: 1, precio_unitario: cargoAplicado,
        descuento: 0, subtotal: cargoAplicado, iva: 0, total: cargoAplicado,
        periodo_mes: null, periodo_anio: null,
      } as any)
    }

    const { error: err2 } = await dbCtrl.from('recibos_detalle').insert(detRows)
    if (err2) { setError(err2.message); setSaving(false); return }

    const { error: err3 } = await dbCtrl.from('recibos_pagos').insert(
      pagosValidos.map(p => ({
        id_recibo_fk:     reciboId,
        id_forma_pago_fk: p.id_forma_pago_fk ?? null,
        monto:            Number(p.monto),
        referencia:       p.referencia?.trim() || null,
        fecha:            p.fecha || null,
      }))
    )
    if (err3) { setError(err3.message); setSaving(false); return }

    // Actualizar saldo de cada cargo vinculado — con el monto neto realmente aplicado
    // (ya prorrateado por descuento/cobro parcial), no el bruto de la línea.
    for (const { item: linea, montoNeto } of detalleNeto) {
      const cargoId = (linea as any).id_cargo_fk
      if (!cargoId) continue
      const { data: cargoDB, error: errC } = await dbCtrl.from('cargos').select('monto_pagado').eq('id', cargoId).single()
      if (errC) { setError(`Recibo ${folio} creado, pero no se pudo actualizar el cargo #${cargoId}: ${errC.message}`); break }
      if (cargoDB) {
        const nuevoPagado = (cargoDB.monto_pagado ?? 0) + montoNeto
        const { error: errU } = await dbCtrl.from('cargos').update({ monto_pagado: nuevoPagado }).eq('id', cargoId)
        if (errU) { setError(`Recibo ${folio} creado, pero no se pudo actualizar el cargo #${cargoId}: ${errU.message}`); break }
      }
    }

    setSaving(false)
    setTicketErr('')
    setExito({ id: reciboId, folio })
  }

  // ── Imprimir recibo (mismo formato que golf/hípico, con datos de la organización) ──
  const handlePrint = async () => {
    if (!exito) return
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

    // Detalle/pagos reales guardados en BD (no el estado del formulario) — así el recibo
    // impreso siempre cuadra con lo realmente cobrado, incluso en pagos parciales.
    const [{ data: detDB }, { data: pagosDB }] = await Promise.all([
      dbCtrl.from('recibos_detalle')
        .select('concepto, cantidad, precio_unitario, descuento, total, periodo_mes, periodo_anio')
        .eq('id_recibo_fk', exito.id),
      dbCtrl.from('recibos_pagos')
        .select('monto, referencia, id_forma_pago_fk')
        .eq('id_recibo_fk', exito.id),
    ])
    const detList = (detDB ?? []) as { concepto: string; cantidad: number; precio_unitario: number; descuento: number; total: number; periodo_mes: string | null; periodo_anio: number | null }[]
    const filas = detList.map(l => `
      <tr>
        <td>${l.concepto}</td>
        <td>${l.periodo_mes ? `${l.periodo_mes} ${l.periodo_anio ?? ''}` : '—'}</td>
        <td class="right">${l.cantidad}</td>
        <td class="right">${fmt(l.precio_unitario)}</td>
        <td class="right">${(l.descuento ?? 0) > 0 ? fmt(l.descuento) : '—'}</td>
        <td class="right" style="font-weight:600">${fmt(l.total)}</td>
      </tr>`).join('')
    const totalImpreso = detList.reduce((a, l) => a + l.total, 0)

    const pagosValidos = ((pagosDB ?? []) as { monto: number; referencia: string | null; id_forma_pago_fk: number | null }[])
    const fechaLarga = new Date(form.fecha_recibo + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

    const win = window.open('', '_blank', 'width=750,height=900')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/><title>Recibo ${exito.folio}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:32px}
        .org-header{display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #0D4F80;margin-bottom:18px}
        .org-nombre{font-size:18px;font-weight:700;color:#0D4F80}
        .org-sub{font-size:11px;color:#64748b}
        .doc-title{font-size:14px;font-weight:600;color:#0D4F80;margin-bottom:2px}
        .section-title{font-size:10px;font-weight:700;color:#0D4F80;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid #bfdbfe;padding-bottom:4px;margin-top:16px}
        .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:14px}
        .info-item label{font-size:10px;color:#64748b;display:block;margin-bottom:1px}
        .info-item span{font-size:12px;font-weight:500}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{padding:7px 10px;background:#f1f5f9;color:#0D4F80;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em;border:1px solid #e2e8f0}
        td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}
        tr:last-child td{border-bottom:none}
        .right{text-align:right}
        .totales{margin-left:auto;width:260px}
        .totales-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
        .totales-row.total{font-weight:700;font-size:15px;border-top:2px solid #0D4F80;padding-top:8px;margin-top:4px;color:#0D4F80}
        .pago-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;flex-direction:column;gap:8px}
        .pago-row{display:flex;justify-content:space-between;font-size:13px}
        .pago-label{font-size:10px;color:#0D4F80;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
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
          <div class="doc-title">Recibo de Cobro</div>
          <div style="font-size:11px;color:#64748b">Folio: <strong>${exito.folio}</strong></div>
          <div style="font-size:11px;color:#64748b">${fechaLarga}</div>
        </div>
      </div>
      <div class="section-title">Datos del Recibo</div>
      <div class="info-grid">
        <div class="info-item"><label>Lote</label><span>${loteSearch || '—'}</span></div>
        <div class="info-item"><label>Propietario</label><span>${form.propietario || '—'}</span></div>
        ${form.empresa ? `<div class="info-item"><label>Empresa</label><span>${form.empresa}</span></div>` : ''}
        <div class="info-item"><label>Fecha de pago</label><span>${form.fecha_pago || '—'}</span></div>
      </div>
      <div class="section-title">Conceptos</div>
      <table>
        <thead><tr><th>Concepto</th><th>Período</th><th class="right">Cant.</th><th class="right">P. Unit.</th><th class="right">Desc.</th><th class="right">Total</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="totales">
        ${esParcial ? `<div class="totales-row"><span>Saldo pendiente</span><span style="color:#d97706">${fmt(saldoRestante)}</span></div>` : ''}
        <div class="totales-row total"><span>${esParcial ? 'COBRADO AHORA' : 'TOTAL'}</span><span>${fmt(totalImpreso)}</span></div>
      </div>
      <div class="pago-box">
        <div class="pago-label">Forma${pagosValidos.length > 1 ? 's' : ''} de pago</div>
        ${pagosValidos.map(p => `<div class="pago-row"><span><strong>${formaNombre(p.id_forma_pago_fk)}</strong>${p.referencia ? ` · Ref: ${p.referencia}` : ''}</span><span style="font-weight:700;color:#0D4F80">${fmt(Number(p.monto))}</span></div>`).join('')}
      </div>
      <div class="firma-area">
        <div class="firma-line">Firma del Propietario</div>
        <div class="firma-line">Cajero / Recibí</div>
      </div>
      <div class="footer">
        Este recibo es comprobante de pago de cuotas. Para facturación, presentar este folio en administración.<br/>
        ${orgNombre} · ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  // ── Ticket POS (homologado con golf/hípico) ─────────────────
  // Crea la venta en golf.ctrl_ventas y la vincula al recibo vía id_venta_pos_fk
  // para no duplicar tickets al reimprimir. Cuotas residenciales van sin IVA.
  const handleTicketPOS = async () => {
    if (!exito) return
    setGenerandoTicket(true); setTicketErr('')
    try {
      const [{ data: centros }, { data: cfg }, { data: recFull, error: errRec }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, rfc, direccion, telefono, municipio, leyenda_ticket').single(),
        dbCtrl.from('recibos').select('monto, fecha_recibo, id_venta_pos_fk').eq('id', exito.id).single(),
      ])
      if (errRec || !recFull) throw new Error(errRec?.message ?? 'No se pudo leer el recibo (¿migración id_venta_pos_fk pendiente?)')
      const rf = recFull as { monto: number; fecha_recibo: string; id_venta_pos_fk: number | null }

      const centrosPos = (centros as { id: number; nombre: string }[]) ?? []
      if (!centrosPos.length) throw new Error('No hay centros POS activos.')
      const centroRes = centrosPos.find(c => {
        const n = norm(c.nombre)
        return n.includes('residencial') || n.includes('administra') || n.includes('cuota') || n.includes('caseta')
      }) ?? centrosPos[0]

      const { data: detDB } = await dbCtrl.from('recibos_detalle')
        .select('concepto, cantidad, precio_unitario, descuento, subtotal, total, periodo_mes, periodo_anio')
        .eq('id_recibo_fk', exito.id)
      const detList = ((detDB ?? []) as { concepto: string; cantidad: number; precio_unitario: number; descuento: number; subtotal: number; total: number; periodo_mes: string | null; periodo_anio: number | null }[])
      if (!detList.length) throw new Error('El recibo no tiene detalle.')

      let ventaId = rf.id_venta_pos_fk
      let folioDia = 0
      const fechaIso = `${rf.fecha_recibo}T12:00:00`

      if (!ventaId) {
        const { data: maxF } = await dbGolf.from('ctrl_ventas').select('folio_dia')
          .eq('id_centro_fk', centroRes.id)
          .gte('fecha', `${rf.fecha_recibo}T00:00:00`).lte('fecha', `${rf.fecha_recibo}T23:59:59`)
          .order('folio_dia', { ascending: false }).limit(1)
        folioDia = maxF && maxF.length > 0 ? ((maxF[0] as any).folio_dia + 1) : 1

        const { data: venta, error: ev } = await dbGolf.from('ctrl_ventas').insert({
          folio_dia: folioDia, id_centro_fk: centroRes.id, fecha: fechaIso,
          nombre_cliente: form.propietario.trim() || loteSearch || `Lote #${form.id_lote_fk}`, es_socio: false,
          subtotal: rf.monto, descuento: 0, iva: 0, total: rf.monto,
          status: 'PAGADA', usuario_crea: authUser?.nombre ?? 'residencial',
          notas: `Ticket POS desde recibo residencial ${exito.folio} (#${exito.id})`,
        }).select('id, folio_dia').single()
        if (ev || !venta) throw new Error(ev?.message ?? 'Error al crear venta POS')
        ventaId = (venta as any).id; folioDia = (venta as any).folio_dia

        const { error: errDet } = await dbGolf.from('ctrl_ventas_det').insert(detList.map(d => ({
          id_venta_fk: ventaId!, id_producto_fk: null, id_concepto_ingreso_fk: null,
          concepto: d.concepto, cantidad: d.cantidad, precio_unitario: d.precio_unitario,
          descuento: d.descuento ?? 0, iva_pct: 0, iva: 0, subtotal: d.total, total: d.total,
          notas: d.periodo_mes ? `${d.periodo_mes} ${d.periodo_anio ?? ''}`.trim() : null,
        })))
        if (errDet) throw new Error(errDet.message)

        const pagosValidos = pagos.filter(p => Number(p.monto) > 0)
        const { error: errPag } = await dbGolf.from('ctrl_ventas_pagos').insert(
          pagosValidos.map(p => ({
            id_venta_fk: ventaId!, id_forma_fk: p.id_forma_pago_fk ?? null,
            forma_nombre: formaNombre(p.id_forma_pago_fk), monto: Number(p.monto),
          }))
        )
        if (errPag) throw new Error(errPag.message)

        const { error: errLink } = await dbCtrl.from('recibos').update({ id_venta_pos_fk: ventaId }).eq('id', exito.id)
        if (errLink) throw new Error(errLink.message)
      } else {
        const { data: ventaExist } = await dbGolf.from('ctrl_ventas').select('folio_dia').eq('id', ventaId).single()
        folioDia = ((ventaExist as { folio_dia: number } | null)?.folio_dia) ?? 0
      }
      setIdVentaPos(ventaId)

      const cfgP = cfg as PosCfg | null
      const pagosValidos = pagos.filter(p => Number(p.monto) > 0)
      const ticketData = {
        id: ventaId, folio_dia: folioDia || '—', fecha: fechaIso,
        cliente: form.propietario.trim() || loteSearch || '—',
        cajero: authUser?.nombre ?? '—', centro: centroRes.nombre,
        razon_social: cfgP?.razon_social ?? 'Organización',
        municipio: cfgP?.municipio ?? '', direccion: cfgP?.direccion ?? '',
        rfc: cfgP?.rfc ?? '', telefono: cfgP?.telefono ?? '',
        leyenda: cfgP?.leyenda_ticket ?? `Cobro relacionado al recibo ${exito.folio}.`,
        subtotal: rf.monto, iva: 0, total: rf.monto,
        pagos: pagosValidos.map(p => ({ forma: formaNombre(p.id_forma_pago_fk), monto: Number(p.monto) })),
        items: detList.map(d => ({ concepto: d.concepto, cantidad: d.cantidad, precio_unitario: d.precio_unitario, iva: 0, total: d.total })),
      }
      window.open(`/ticket-golf.html?data=${encodeURIComponent(JSON.stringify(ticketData))}&print=1`, '_blank', 'width=400,height=700')
    } catch (e: any) {
      setTicketErr(e?.message ?? 'Error al generar ticket')
    } finally {
      setGenerandoTicket(false)
    }
  }

  const filteredLotes = lotes.filter(l => l.cve_lote?.toLowerCase().includes(loteSearch.toLowerCase())).slice(0, 6)

  // ── Pantalla de éxito (homologada con golf/hípico/locales) ────
  if (exito) {
    return (
      <ModalShell modulo="residencial" titulo="Cobro registrado" icono={CheckCircle} onClose={onSaved} maxWidth={420}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="btn-ghost" onClick={onSaved}>Cerrar</button></div>}
      >
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Cobro registrado</div>
          <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#1e3a5f', letterSpacing: 1 }}>{exito.folio}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
            {form.propietario || loteSearch || '—'}{' · '}{fmt(montoCobrar)}
            {esParcial && <span style={{ marginLeft: 6, color: '#d97706', fontWeight: 600 }}>PAGO PARCIAL</span>}
          </div>
          {esParcial && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e', textAlign: 'left' }}>
              Se cobró {fmt(montoCobrar)} de {fmt(totalRecibo)} adeudado. Saldo pendiente: <strong>{fmt(saldoRestante)}</strong>.
            </div>
          )}
          {idVentaPos && (
            <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600, marginTop: 6 }}>Ticket POS #{String(idVentaPos).padStart(6, '0')}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handlePrint}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 10, background: '#1e3a5f', color: '#fff', cursor: 'pointer' }}>
            <Printer size={16} /> Imprimir Recibo
          </button>
          <button onClick={handleTicketPOS} disabled={generandoTicket}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, border: '1px solid #a7f3d0', borderRadius: 10, background: '#ecfdf5', color: '#047857', cursor: 'pointer', opacity: generandoTicket ? 0.6 : 1 }}>
            {generandoTicket ? <Loader size={16} className="animate-spin" /> : <Receipt size={16} />}
            {generandoTicket ? 'Generando…' : idVentaPos ? 'Reimprimir Ticket POS' : 'Generar Ticket POS'}
          </button>
          {ticketErr && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{ticketErr}</div>}
          {error && <div style={{ fontSize: 12, color: '#d97706', background: '#fffbeb', padding: '8px 12px', borderRadius: 6 }}>{error}</div>}
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell modulo="residencial" titulo={cargoInicial ? `Pagar: ${cargoInicial.concepto}` : 'Nuevo Recibo'} icono={Receipt} maxWidth={780} onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
          <div style={{ marginRight: 'auto' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{lineas.filter(l => l.concepto.trim() && l.total > 0).length} concepto{lineas.filter(l => l.concepto.trim() && l.total > 0).length !== 1 ? 's' : ''} · subtotal {fmt(totalLineas)}</div>
            {cargoAdicional > 0 && <div style={{ fontSize: 11, color: '#059669' }}>+ cargo adicional {fmt(cargoAdicional)}</div>}
            {descExtra > 0 && <div style={{ fontSize: 11, color: '#dc2626' }}>– descuento {fmt(descExtra)}</div>}
            <span style={{ fontSize: 15, fontWeight: 700, color: esParcial ? '#d97706' : '#16a34a' }}>
              {fmt(montoCobrar)}
              {esParcial && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6, fontWeight: 400 }}>de {fmt(totalRecibo)}</span>}
            </span>
          </div>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: esParcial ? '#d97706' : undefined }}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? 'Guardando…' : esParcial ? 'Emitir Recibo Parcial' : 'Guardar Recibo'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* Cabecera */}
          <Section label="Datos del Recibo">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <div>
                <label className="label">Lote *</label>
                {cargoInicial ? (
                  <div className="input" style={{ background: '#eff6ff', color: 'var(--blue)', fontWeight: 600 }}>
                    {(cargoInicial as any).lotes?.cve_lote ?? `#${cargoInicial.id_lote_fk}`}
                  </div>
                ) : (
                  <>
                    <input className="input" placeholder="Busca clave…" value={loteSearch}
                      onChange={e => { setLoteSearch(e.target.value); if (form.id_lote_fk) setForm(f => ({ ...f, id_lote_fk: '' })) }} />
                    {filteredLotes.length > 0 && loteSearch.length >= 2 && !form.id_lote_fk && (
                      <div className="card" style={{ position: 'absolute', zIndex: 10, width: 200, marginTop: 4, padding: '4px 0' }}>
                        {filteredLotes.map(l => (
                          <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`) }}
                            style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 14 }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            {l.cve_lote ?? `#${l.lote}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <Field label="Folio"><input className="input" value={form.folio} onChange={set('folio')} placeholder="Autogenerado" /></Field>
              <Field label="Fecha Recibo"><input className="input" type="date" value={form.fecha_recibo} onChange={set('fecha_recibo')} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
              <Field label="Propietario"><input className="input" value={form.propietario} onChange={set('propietario')} /></Field>
              <Field label="Fecha de Pago"><input className="input" type="date" value={form.fecha_pago} onChange={set('fecha_pago')} /></Field>
              <Field label="Cuenta Receptora">
                <select className="select" value={form.cuenta_receptora} onChange={set('cuenta_receptora')}>
                  {CUENTAS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* Cargos pendientes */}
          {!cargoInicial && cargosPendientes.length > 0 && (
            <Section label={`Cargos Pendientes del Lote (${cargosPendientes.length})`}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Haz clic para incluir en el recibo</div>
              {cargosPendientes.map(c => {
                const yaAgregado = lineas.some(l => (l as any).id_cargo_fk === c.id)
                return (
                  <button key={c.id} onClick={() => !yaAgregado && agregarCargo(c)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, cursor: yaAgregado ? 'default' : 'pointer', background: yaAgregado ? '#f0fdf4' : '#f8fafc', border: `1px solid ${yaAgregado ? '#bbf7d0' : '#e2e8f0'}`, textAlign: 'left', width: '100%' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: yaAgregado ? '#15803d' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {yaAgregado && <CheckCircle size={12} />}{c.concepto}
                        {c.periodo_mes && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{c.periodo_mes} {c.periodo_anio}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Cargo: {fmt(c.monto)} · Pagado: {fmt(c.monto_pagado)} · <strong style={{ color: '#dc2626' }}>Saldo: {fmt(c.saldo)}</strong>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: yaAgregado ? '#dcfce7' : '#dbeafe', color: yaAgregado ? '#15803d' : 'var(--blue)' }}>
                      {yaAgregado ? '✓ Incluido' : '+ Agregar'}
                    </span>
                  </button>
                )
              })}
            </Section>
          )}

          {/* Líneas */}
          <Section label="Conceptos">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 110px 90px 100px 32px', gap: 6, marginBottom: 4 }}>
              {['Concepto', 'Cant.', 'Monto', 'Descuento', 'Total', ''].map(h => (
                <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {lineas.map((l, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                {(l as any).id_cargo_fk && (l as any).cargo_saldo !== undefined && (
                  <div style={{ fontSize: 11, marginBottom: 3, color: l.total >= ((l as any).cargo_saldo ?? 0) ? '#15803d' : '#d97706' }}>
                    Saldo del cargo: {fmt((l as any).cargo_saldo)} · {l.total >= ((l as any).cargo_saldo ?? 0) ? '✓ Pago completo' : '~ Pago parcial'}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 110px 90px 100px 32px', gap: 6 }}>
                  <input className="input" value={l.concepto} onChange={e => setLinea(i, { concepto: e.target.value })} />
                  <input className="input" type="number" min="1" style={{ textAlign: 'right' }} value={l.cantidad} onChange={e => setLinea(i, { cantidad: Number(e.target.value) })} />
                  <input className="input" type="number" min="0" step="0.01" style={{ textAlign: 'right' }} value={l.precio_unitario} onChange={e => setLinea(i, { precio_unitario: Number(e.target.value) })} />
                  <input className="input" type="number" min="0" step="0.01" style={{ textAlign: 'right' }} value={l.descuento} onChange={e => setLinea(i, { descuento: Number(e.target.value) })} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{fmt(l.total)}</div>
                  <button className="btn-ghost" style={{ padding: '6px' }} onClick={() => setLineas(ls => ls.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
            <button className="btn-ghost" style={{ marginTop: 4 }}
              onClick={() => setLineas(ls => [...ls, { id_cargo_fk: null, concepto: '', cantidad: 1, precio_unitario: 0, descuento: 0, subtotal: 0, iva: 0, total: 0, periodo_mes: MESES[new Date().getMonth()], periodo_anio: new Date().getFullYear(), id_cuota_lote_fk: null }])}>
              <Plus size={12} /> Agregar línea manual
            </button>

            {/* Cargo adicional + Descuento adicional (homologado con golf) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
              <div>
                <label className="label">Cargo adicional ($)</label>
                <input className="input" type="number" min="0" step="0.01" value={cargoAdicionalStr}
                  onChange={e => setCargoAdicionalStr(e.target.value)} placeholder="0.00" />
                {cargoAdicional > 0 && <div style={{ fontSize: 11, color: '#059669', marginTop: 3 }}>+ {fmt(cargoAdicional)} sobre el total</div>}
              </div>
              <div>
                <label className="label">Descuento adicional ($)</label>
                <input className="input" type="number" min="0" step="0.01" value={descuentoExtra}
                  onChange={e => setDescuentoExtra(e.target.value)} placeholder="0.00" />
                {descExtra > 0 && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>– {fmt(descExtra)} sobre el total</div>}
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
              {(cargoAdicional > 0 || descExtra > 0) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Subtotal {fmt(totalLineas)}
                  {cargoAdicional > 0 && <span style={{ color: '#059669' }}> + {fmt(cargoAdicional)}</span>}
                  {descExtra > 0 && <span style={{ color: '#dc2626' }}> – {fmt(descExtra)}</span>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 24 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>TOTAL</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalRecibo)}</span>
              </div>
            </div>
          </Section>

          {/* Cobro parcial — homologado con golf/hípico/locales */}
          <div style={{ border: `1px solid ${parcialHabilitado ? '#fde68a' : '#e2e8f0'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s' }}>
            <div
              onClick={toggleParcial}
              style={{ padding: '10px 14px', background: parcialHabilitado ? '#fffbeb' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', borderBottom: parcialHabilitado ? '1px solid #fde68a' : 'none' }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: parcialHabilitado ? '#92400e' : '#475569' }}>Cobro parcial</span>
                {!parcialHabilitado && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>Cobrar menos del total del recibo</span>}
              </div>
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
                      className="input" type="number" min={0.01} step={0.01} max={totalRecibo}
                      value={montoParcialStr} onChange={e => setMontoParcialStr(e.target.value)}
                      placeholder={`Máx. ${fmt(totalRecibo)}`}
                      style={{ width: '100%', fontWeight: 700, border: '1px solid #fbbf24' }} />
                  </div>
                  <button
                    onClick={() => setMontoParcialStr(totalRecibo.toFixed(2))}
                    style={{ padding: '8px 10px', fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    Total
                  </button>
                </div>
                {esParcial ? (
                  <div style={{ padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                    ⚠ Saldo pendiente: <strong>{fmt(saldoRestante)}</strong>
                  </div>
                ) : montoParcialStr ? (
                  <div style={{ fontSize: 11, color: '#15803d' }}>✓ Cubre el total del recibo</div>
                ) : null}
              </div>
            )}
          </div>

          {/* Formas de pago */}
          <Section label="Formas de Pago">
            {pagos.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 110px 1fr 120px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div><label className="label">Forma</label>
                  <select className="select" value={p.id_forma_pago_fk?.toString() ?? ''}
                    onChange={e => setPagos(ps => ps.map((x, j) => j === i ? { ...x, id_forma_pago_fk: e.target.value ? Number(e.target.value) : null } : x))}>
                    <option value="">—</option>
                    {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                  </select>
                </div>
                <div><label className="label">Monto</label>
                  <input className="input" type="number" step="0.01" style={{ textAlign: 'right' }} value={p.monto}
                    onChange={e => setPagos(ps => ps.map((x, j) => j === i ? { ...x, monto: Number(e.target.value) } : x))} />
                </div>
                <div><label className="label">Referencia</label>
                  <input className="input" value={p.referencia ?? ''} onChange={e => setPagos(ps => ps.map((x, j) => j === i ? { ...x, referencia: e.target.value } : x))} />
                </div>
                <div><label className="label">Fecha</label>
                  <input className="input" type="date" value={p.fecha ?? ''} onChange={e => setPagos(ps => ps.map((x, j) => j === i ? { ...x, fecha: e.target.value } : x))} />
                </div>
                <button className="btn-ghost" style={{ padding: '6px' }} onClick={() => setPagos(ps => ps.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
              </div>
            ))}
            <button className="btn-ghost"
              onClick={() => setPagos(ps => [...ps, { monto: diferencia > 0 ? diferencia : 0, referencia: '', fecha: new Date().toISOString().split('T')[0], id_forma_pago_fk: null }])}>
              <Plus size={12} /> Agregar forma de pago
            </button>
            <div style={{ marginTop: 10, padding: '10px 14px', background: Math.abs(diferencia) < 0.01 ? '#f0fdf4' : '#fef2f2', borderRadius: 6, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                {Math.abs(diferencia) < 0.01 ? '✓ Suma cuadrada' : diferencia > 0 ? 'Falta distribuir' : 'Exceso'}
              </span>
              <span style={{ fontWeight: 700, color: Math.abs(diferencia) < 0.01 ? '#15803d' : '#dc2626' }}>
                {Math.abs(diferencia) < 0.01 ? fmt(montoCobrar) : fmt(Math.abs(diferencia))}
              </span>
            </div>
          </Section>
      </div>
    </ModalShell>
  )
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
  </div>
)
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div><label className="label">{label}</label>{children}</div>
