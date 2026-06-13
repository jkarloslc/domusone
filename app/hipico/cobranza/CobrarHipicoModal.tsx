'use client'
import { useState, useEffect } from 'react'
import { dbHip, dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Save, Loader, CheckCircle, Printer, Receipt, Plus, Trash2 } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { inicioDelDia, finDelDia } from '@/lib/dateUtils'
import { fechaLocal } from '@/lib/dateUtils'

// ── Tipos ────────────────────────────────────────────────────────
export type CargoPendiente = {
  id: number
  descripcion: string
  mes_aplicacion: string | null
  monto: number
  saldo: number
  status: string
  fecha_vencimiento: string | null
}

type FormaPago   = { id: number; nombre: string }
type PosCentro   = { id: number; nombre: string; activo: boolean }
type PosCfg      = { razon_social: string | null; rfc: string | null; direccion: string | null; telefono: string | null; municipio: string | null; leyenda_ticket: string | null }

type PagoLinea = { id_forma_fk: number; forma_nombre: string; monto: string; referencia: string }

type Props = {
  cargos:       CargoPendiente[]
  nombreSocio:  string
  idArrendatario: number
  idContrato?:  number | null
  onClose:      () => void
  onSaved:      () => void
}

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const fmtMes = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : null
const hoyLocal = () => new Date().toLocaleDateString('en-CA')

// ── Genera folio RH-YYYY-NNN ─────────────────────────────────────
async function generarFolio(): Promise<string> {
  const anio = new Date().getFullYear()
  const { data } = await dbHip.from('ctrl_pagos')
    .select('folio').like('folio', `RH-${anio}-%`)
    .order('folio', { ascending: false }).limit(1)
  const ultimo = (data as { folio: string }[] | null)?.[0]?.folio
  const num = ultimo ? parseInt(ultimo.split('-')[2] ?? '0') + 1 : 1
  return `RH-${anio}-${String(num).padStart(3, '0')}`
}

// ── Imprimir recibo hípico ────────────────────────────────────────
export async function printReciboHipico(pagoId: number, folio: string, nombreSocio: string) {
  const [{ data: detData }, { data: formasData }] = await Promise.all([
    dbHip.from('ctrl_pagos_det')
      .select('monto, ctrl_cargos(descripcion, mes_aplicacion)')
      .eq('id_pago_fk', pagoId),
    dbHip.from('ctrl_pagos_formas')
      .select('forma_nombre, monto, referencia')
      .eq('id_pago_fk', pagoId),
  ])
  const { data: pagoData } = await dbHip.from('ctrl_pagos')
    .select('monto_total, fecha_pago, notas')
    .eq('id', pagoId).single()
  const pago = pagoData as { monto_total: number; fecha_pago: string; notas: string | null } | null
  if (!pago) return

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

  const det = (detData ?? []) as unknown as { monto: number; ctrl_cargos?: { descripcion: string; mes_aplicacion: string | null } }[]
  const formas = (formasData ?? []) as { forma_nombre: string; monto: number; referencia: string | null }[]

  const fmtFechaLarga = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

  const filas = det.map(d => `
    <tr>
      <td>${d.ctrl_cargos?.descripcion ?? '—'}</td>
      <td>${fmtMes(d.ctrl_cargos?.mes_aplicacion ?? null) ?? '—'}</td>
      <td class="right" style="font-weight:600">$${d.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')

  const win = window.open('', '_blank', 'width=720,height=900')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"/><title>Recibo Hípico ${folio}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:32px}
      .org-header{display:flex;align-items:center;gap:16px;padding-bottom:14px;border-bottom:2px solid #b45309;margin-bottom:18px}
      .org-nombre{font-size:18px;font-weight:700;color:#b45309}
      .org-sub{font-size:11px;color:#64748b}
      .doc-title{font-size:14px;font-weight:600;color:#b45309;margin-bottom:2px}
      .section-title{font-size:10px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid #fed7aa;padding-bottom:4px;margin-top:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{padding:7px 10px;background:#fff7ed;color:#b45309;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em;border:1px solid #fed7aa}
      td{padding:8px 10px;border-bottom:1px solid #fed7aa;font-size:12px}
      tr:last-child td{border-bottom:none}
      .right{text-align:right}
      .totales{margin-left:auto;width:220px}
      .totales-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
      .totales-row.total{font-weight:700;font-size:16px;border-top:2px solid #b45309;padding-top:8px;margin-top:4px;color:#b45309}
      .pago-box{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;flex-direction:column;gap:8px}
      .pago-row{display:flex;justify-content:space-between;font-size:13px}
      .pago-label{font-size:10px;color:#b45309;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
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
        <div class="doc-title">Recibo de Renta de Caballeriza</div>
        <div style="font-size:11px;color:#64748b">Folio: <strong>${folio}</strong></div>
        <div style="font-size:11px;color:#64748b">${fmtFechaLarga(pago.fecha_pago)}</div>
      </div>
    </div>
    <div class="section-title">Datos del Socio</div>
    <div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:14px">${nombreSocio}</div>
    <div class="section-title">Cargos cubiertos</div>
    <table>
      <thead><tr><th>Descripción</th><th>Mes</th><th class="right">Importe</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="totales">
      <div class="totales-row total"><span>TOTAL</span><span>$${pago.monto_total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
    </div>
    <div class="pago-box" style="margin-top:16px">
      <div class="pago-label">Forma${formas.length > 1 ? 's' : ''} de pago</div>
      ${formas.map(f => `<div class="pago-row"><span><strong>${f.forma_nombre}</strong>${f.referencia ? ` · Ref: ${f.referencia}` : ''}</span><span style="font-weight:700;color:#b45309">$${f.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>`).join('')}
    </div>
    ${pago.notas ? `<div style="font-size:11px;color:#64748b;padding:8px 12px;background:#f8fafc;border-radius:6px;margin-bottom:16px"><strong>Notas:</strong> ${pago.notas}</div>` : ''}
    <div class="firma-area">
      <div class="firma-line">Firma del Socio</div>
      <div class="firma-line">Recibió / Administración</div>
    </div>
    <div class="footer">
      Recibo de pago de renta de caballeriza.<br/>
      ${orgNombre} · ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}

// ── Componente ───────────────────────────────────────────────────
export default function CobrarHipicoModal({ cargos, nombreSocio, idArrendatario, idContrato, onClose, onSaved }: Props) {
  const { authUser } = useAuth()

  const [formasPago, setFormasPago] = useState<FormaPago[]>([])
  const [loading, setLoading]       = useState(true)

  const [seleccionados, setSeleccionados] = useState<Set<number>>(() => new Set(cargos.map(c => c.id)))
  const [pagos, setPagos] = useState<PagoLinea[]>([
    { id_forma_fk: 0, forma_nombre: '', monto: '', referencia: '' }
  ])
  const [montoParcial, setMontoParcial] = useState('')
  const [notas, setNotas]               = useState('')
  const [saving, setSaving]             = useState(false)
  const [err, setErr]                   = useState('')

  // Success state
  const [exito, setExito] = useState<{ idPago: number; folio: string } | null>(null)
  const [imprimiendo, setImprimiendo]   = useState(false)
  const [genTicket, setGenTicket]       = useState(false)
  const [ticketErr, setTicketErr]       = useState('')

  useEffect(() => {
    dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => {
        const fps = (data as FormaPago[] | null) ?? []
        setFormasPago(fps)
        if (fps.length > 0) setPagos([{ id_forma_fk: fps[0].id, forma_nombre: fps[0].nombre, monto: '', referencia: '' }])
        setLoading(false)
      })
  }, [])

  const toggle = (id: number) =>
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const cargosSeleccionados = cargos.filter(c => seleccionados.has(c.id))
  const montoTotal = cargosSeleccionados.reduce((s, c) => s + c.saldo, 0)
  const montoCobrar = Math.min(parseFloat(montoParcial) || montoTotal, montoTotal)
  const saldoRestante = Math.max(0, parseFloat((montoTotal - montoCobrar).toFixed(2)))
  const esParcial = saldoRestante > 0

  // Multi-forma
  const pagosValidos = pagos.filter(p => p.id_forma_fk > 0 && parseFloat(p.monto) > 0)
  const totalDistribuido = pagosValidos.reduce((s, p) => s + parseFloat(p.monto), 0)
  const balance = parseFloat((montoCobrar - totalDistribuido).toFixed(2))

  const setPagoLinea = (i: number, partial: Partial<PagoLinea>) =>
    setPagos(ls => ls.map((l, j) => j !== i ? l : { ...l, ...partial }))

  const agregarLinea = () => {
    const prim = formasPago[0]
    const saldo = parseFloat((montoCobrar - totalDistribuido).toFixed(2))
    setPagos(ls => [...ls, { id_forma_fk: prim?.id ?? 0, forma_nombre: prim?.nombre ?? '', monto: saldo > 0 ? saldo.toFixed(2) : '', referencia: '' }])
  }

  const quitarLinea = (i: number) =>
    setPagos(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)

  const handleGuardar = async () => {
    if (seleccionados.size === 0) { setErr('Selecciona al menos un cargo'); return }
    if (pagosValidos.length === 0) { setErr('Agrega al menos una forma de pago con monto'); return }
    if (Math.abs(balance) > 0.01) {
      setErr(`La suma de pagos ($${totalDistribuido.toFixed(2)}) debe ser igual al monto a cobrar ($${montoCobrar.toFixed(2)})`)
      return
    }
    setSaving(true); setErr('')

    const folio = await generarFolio()
    const formasNombre = pagosValidos.map(p => p.forma_nombre).join(' + ')

    // 1. Insertar recibo
    const { data: pagoData, error: e1 } = await dbHip.from('ctrl_pagos').insert({
      folio,
      id_arrendatario_fk: idArrendatario,
      fecha_pago: fechaLocal(),
      monto_total: montoCobrar,
      forma_pago: formasNombre,
      referencia: pagosValidos[0]?.referencia || null,
      notas: notas || null,
    }).select('id').single()

    if (e1 || !pagoData) { setSaving(false); setErr(e1?.message ?? 'Error al crear recibo'); return }
    const idPago = (pagoData as { id: number }).id

    // 2. Detalle de cargos cubiertos (greedy)
    let rem = montoCobrar
    const detalle = cargosSeleccionados.map(c => {
      const aplicar = Math.min(rem, c.saldo)
      rem = parseFloat((rem - aplicar).toFixed(2))
      return { id_pago_fk: idPago, id_cargo_fk: c.id, monto: aplicar }
    }).filter(d => d.monto > 0)

    const { error: e2 } = await dbHip.from('ctrl_pagos_det').insert(detalle)
    if (e2) { setSaving(false); setErr(e2.message); return }

    // 3. Formas de pago
    const { error: e3 } = await dbHip.from('ctrl_pagos_formas').insert(
      pagosValidos.map(p => ({
        id_pago_fk:   idPago,
        id_forma_fk:  p.id_forma_fk,
        forma_nombre: p.forma_nombre,
        monto:        parseFloat(p.monto),
        referencia:   p.referencia || null,
      }))
    )
    if (e3) { setSaving(false); setErr(e3.message); return }

    // 4. Actualizar saldo de cargos (greedy)
    let remaining = montoCobrar
    for (const c of cargosSeleccionados) {
      const aplicar = Math.min(remaining, c.saldo)
      const nuevoSaldo = parseFloat((c.saldo - aplicar).toFixed(2))
      await dbHip.from('ctrl_cargos').update({
        saldo:  nuevoSaldo,
        status: nuevoSaldo === 0 ? 'Pagado' : 'Pago Parcial',
      }).eq('id', c.id)
      remaining = parseFloat((remaining - aplicar).toFixed(2))
    }

    setSaving(false)
    setExito({ idPago, folio })
  }

  const handleImprimir = async () => {
    if (!exito) return
    setImprimiendo(true)
    await printReciboHipico(exito.idPago, exito.folio, nombreSocio)
    setImprimiendo(false)
  }

  const handleTicketPOS = async () => {
    if (!exito) return
    setGenTicket(true); setTicketErr('')
    try {
      const [{ data: centros }, { data: cfg }, { data: formasPos }, { data: detPago }, { data: formasRec }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, municipio, direccion, rfc, telefono, leyenda_ticket').single(),
        dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre'),
        dbHip.from('ctrl_pagos_det').select('monto, ctrl_cargos(descripcion)').eq('id_pago_fk', exito.idPago),
        dbHip.from('ctrl_pagos_formas').select('id_forma_fk, forma_nombre, monto').eq('id_pago_fk', exito.idPago),
      ])
      const centrosPos = (centros as PosCentro[]) ?? []
      if (!centrosPos.length) throw new Error('No hay centros POS activos.')
      const centroHip = centrosPos.find(c => { const n = norm(c.nombre); return n.includes('hipico') || n.includes('caballeriza') }) ?? centrosPos[0]

      const { data: pagoFull } = await dbHip.from('ctrl_pagos').select('monto_total, fecha_pago, id_venta_pos_fk').eq('id', exito.idPago).single()
      const p = pagoFull as { monto_total: number; fecha_pago: string; id_venta_pos_fk: number | null } | null
      if (!p) throw new Error('No se encontró el recibo.')

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
          id_socio_fk: null, nombre_cliente: nombreSocio, es_socio: false,
          subtotal: p.monto_total, descuento: 0, iva: 0, total: p.monto_total,
          status: 'PAGADA', usuario_crea: authUser?.user?.email ?? 'hipico-cobranza',
          notas: `Ticket POS desde recibo hípico ${exito.folio}`,
        }).select('id, folio_dia').single()
        if (ev || !venta) throw new Error(ev?.message ?? 'Error al crear venta POS')
        ventaId = (venta as any).id; folioDia = (venta as any).folio_dia

        const detList = (detPago ?? []) as unknown as { monto: number; ctrl_cargos?: { descripcion: string } }[]
        const rows = detList.length > 0 ? detList.map(d => ({
          id_venta_fk: ventaId!, id_producto_fk: null,
          concepto: d.ctrl_cargos?.descripcion ?? `Cobro Hípico ${exito.folio}`,
          cantidad: 1, precio_unitario: d.monto, descuento: 0, iva_pct: 0, iva: 0, subtotal: d.monto, total: d.monto, notas: null,
        })) : [{ id_venta_fk: ventaId!, id_producto_fk: null, concepto: `Cobro Hípico ${exito.folio}`, cantidad: 1, precio_unitario: p.monto_total, descuento: 0, iva_pct: 0, iva: 0, subtotal: p.monto_total, total: p.monto_total, notas: null }]
        await dbGolf.from('ctrl_ventas_det').insert(rows)

        const formasRList = (formasRec ?? []) as { id_forma_fk: number | null; forma_nombre: string; monto: number }[]
        const pagRows = formasRList.map(fr => ({ id_venta_fk: ventaId!, id_forma_fk: fr.id_forma_fk ?? null, forma_nombre: fr.forma_nombre, monto: fr.monto }))
        if (pagRows.length > 0) await dbGolf.from('ctrl_ventas_pagos').insert(pagRows)

        await dbHip.from('ctrl_pagos').update({ id_venta_pos_fk: ventaId }).eq('id', exito.idPago)
      }

      const detList2 = (detPago ?? []) as unknown as { monto: number; ctrl_cargos?: { descripcion: string } }[]
      const formasRList2 = (formasRec ?? []) as { forma_nombre: string; monto: number }[]
      const cfgP = cfg as PosCfg | null
      const ticketData = {
        id: ventaId, folio_dia: folioDia || '—', fecha: fechaIso,
        cliente: nombreSocio, cajero: authUser?.user?.email ?? 'hipico-cobranza', centro: centroHip.nombre,
        razon_social: cfgP?.razon_social ?? 'Club Hípico Balvanera',
        municipio: cfgP?.municipio ?? '', direccion: cfgP?.direccion ?? '',
        rfc: cfgP?.rfc ?? '', telefono: cfgP?.telefono ?? '',
        leyenda: cfgP?.leyenda_ticket ?? '¡Gracias por su visita!',
        subtotal: p.monto_total, iva: 0, total: p.monto_total,
        pagos: formasRList2.map(f => ({ forma: f.forma_nombre, monto: f.monto })),
        items: detList2.map(d => ({ concepto: d.ctrl_cargos?.descripcion ?? '—', cantidad: 1, precio_unitario: d.monto, iva: 0, total: d.monto })),
      }
      window.open(`/ticket-golf.html?data=${encodeURIComponent(JSON.stringify(ticketData))}&print=1`, '_blank', 'width=400,height=700')
    } catch (e: any) {
      setTicketErr(e?.message ?? 'No se pudo generar el ticket POS')
    } finally {
      setGenTicket(false)
    }
  }

  // ── Pantalla de éxito ─────────────────────────────────────────
  if (exito) {
    return (
      <ModalShell modulo="hipico" titulo="Cobro registrado" onClose={() => { onSaved(); onClose() }} maxWidth={420}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => { onSaved(); onClose() }}>Cerrar</button>
          </div>
        }
      >
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Cobro registrado</div>
          <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#b45309', letterSpacing: 1 }}>{exito.folio}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
            {nombreSocio} · {fmt$(montoCobrar)}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleImprimir} disabled={imprimiendo}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, border: '1px solid #fed7aa', borderRadius: 10, background: '#fff7ed', color: '#b45309', cursor: 'pointer', opacity: imprimiendo ? 0.6 : 1 }}>
            <Printer size={16} /> {imprimiendo ? 'Imprimiendo…' : 'Imprimir Recibo'}
          </button>
          <button onClick={handleTicketPOS} disabled={genTicket}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 10, background: '#b45309', color: '#fff', cursor: 'pointer', opacity: genTicket ? 0.6 : 1 }}>
            <Receipt size={16} /> {genTicket ? 'Generando…' : 'Generar Ticket POS'}
          </button>
          {ticketErr && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{ticketErr}</div>}
        </div>
      </ModalShell>
    )
  }

  // ── Formulario de cobro ──────────────────────────────────────
  return (
    <ModalShell modulo="hipico" titulo="Registrar Cobro" onClose={onClose} maxWidth={580}
      footer={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {seleccionados.size > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, color: esParcial ? '#d97706' : '#16a34a', marginRight: 'auto' }}>
              Total: {fmt$(montoCobrar)}
              {esParcial && <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>(parcial de {fmt$(montoTotal)})</span>}
            </span>
          )}
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleGuardar}
            disabled={saving || seleccionados.size === 0 || loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: esParcial ? '#d97706' : undefined }}>
            {saving ? <Loader size={13} /> : <Save size={13} />}
            {saving ? 'Guardando…' : esParcial ? 'Emitir Recibo Parcial' : 'Emitir Recibo'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Nombre del socio */}
        <div style={{ fontSize: 13, fontWeight: 600, color: '#b45309', padding: '8px 12px', background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa' }}>
          {nombreSocio}
        </div>

        {/* Lista de cargos */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Cargos pendientes — selecciona los que se liquidan</div>
          {cargos.length === 0 ? (
            <div style={{ fontSize: 12, color: '#16a34a', padding: '12px 0' }}>Sin cargos pendientes</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {cargos.map((c, i) => {
                const checked = seleccionados.has(c.id)
                const vencido = c.status === 'Vencido' || (c.fecha_vencimiento && c.fecha_vencimiento < hoyLocal())
                return (
                  <div key={c.id} onClick={() => toggle(c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer',
                      background: checked ? 'rgba(180,83,9,0.07)' : (i % 2 === 0 ? 'transparent' : 'var(--surface-800)'),
                      borderBottom: i < cargos.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.id)}
                      onClick={e => e.stopPropagation()} style={{ accentColor: '#b45309', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: checked ? 600 : 400, color: 'var(--text-primary)' }}>{c.descripcion}</div>
                      {c.mes_aplicacion && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtMes(c.mes_aplicacion)}</div>}
                    </div>
                    {vencido && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>Vencido</span>}
                    <div style={{ fontWeight: 700, color: checked ? '#b45309' : 'var(--text-primary)', fontSize: 13 }}>{fmt$(c.saldo)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Monto parcial */}
        {seleccionados.size > 0 && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Monto a cobrar ahora
              {esParcial && <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706', fontWeight: 600 }}>(PAGO PARCIAL)</span>}
            </label>
            <input className="input" type="number" min={0} step={0.01} max={montoTotal}
              value={montoParcial} onChange={e => setMontoParcial(e.target.value)}
              placeholder={`${montoTotal.toFixed(2)} (total)`}
              style={{ width: '100%', fontWeight: 700, border: esParcial ? '1px solid #fbbf24' : undefined }} />
            {esParcial && (
              <div style={{ marginTop: 6, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                ⚠ Quedará un saldo pendiente de <strong>{fmt$(saldoRestante)}</strong>.
              </div>
            )}
          </div>
        )}

        {/* Formas de pago */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'var(--surface-800)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Formas de pago *</span>
            <button onClick={agregarLinea}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#b45309', background: 'none', border: 'none', cursor: 'pointer' }}>
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
            <span style={{ color: '#64748b' }}>
              {Math.abs(balance) < 0.01 ? '✓ Suma cuadrada' : balance > 0 ? 'Falta distribuir' : 'Exceso'}
            </span>
            <span style={{ fontWeight: 700, color: Math.abs(balance) < 0.01 ? '#15803d' : '#dc2626' }}>
              {Math.abs(balance) < 0.01 ? fmt$(montoCobrar) : fmt$(Math.abs(balance))}
            </span>
          </div>
        </div>

        {/* Notas */}
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
          <textarea className="input" rows={2} value={notas} onChange={e => setNotas(e.target.value)}
            style={{ resize: 'vertical', width: '100%' }} />
        </div>

        {err && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
      </div>
    </ModalShell>
  )
}
