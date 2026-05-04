'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  RefreshCw, Search, Receipt, Printer, FileCheck,
  XCircle, ChevronLeft, FileText, AlertTriangle, Loader,
} from 'lucide-react'
import Link from 'next/link'

// ── Tipos ─────────────────────────────────────────────────────
type Recibo = {
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
  status: string               // VIGENTE | CANCELADO
  facturable: boolean
  folio_fiscal: string | null
  created_at: string
  id_socio_fk: number
  id_venta_pos_fk: number | null
  id_forma_pago_fk: number | null
  cat_socios: {
    nombre: string
    apellido_paterno: string | null
    apellido_materno: string | null
    numero_socio: string | null
    email: string | null
    cat_categorias_socios: { nombre: string } | null
  } | null
  recibos_golf_det: DetRecibo[]
}

type DetRecibo = {
  id: number
  concepto: string
  tipo: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
}

// ── Helpers ────────────────────────────────────────────────────
const fmt$ = (v: number) => `$${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc   = (s: Recibo['cat_socios']) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'
const fechaFmt = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

const TIPOS_LABEL: Record<string, string> = {
  INSCRIPCION: 'Inscripción', MENSUALIDAD: 'Mensualidad', PENSION_CARRITO: 'Pensión Carrito',
}

const INSTITUCION = {
  nombre:    'Club de Golf Balvanera',
  rfc:       'CGB000101AAA',
  domicilio: 'Balvanera, Corregidora, Querétaro',
}

const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  VIGENTE:   { bg: '#dcfce7', color: '#15803d', label: 'Vigente' },
  CANCELADO: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelado' },
}

const PAGE_SIZE = 50

// ── Componente principal ───────────────────────────────────────
export default function RecibosPage() {
  const { authUser } = useAuth()

  const [recibos, setRecibos]         = useState<Recibo[]>([])
  const [loading, setLoading]         = useState(true)
  const [busqueda, setBusqueda]       = useState('')
  const [filtroStatus, setFiltroStatus] = useState('VIGENTE')
  const [filtroFact, setFiltroFact]   = useState<'todos' | 'si' | 'no'>('todos')
  const [pagina, setPagina]           = useState(1)

  // Modal detalle
  const [detalle, setDetalle]         = useState<Recibo | null>(null)

  // Modal cancelar
  const [cancelando, setCancelando]   = useState<Recibo | null>(null)
  const [motivoCancel, setMotivoCancel] = useState('')
  const [savingCancel, setSavingCancel] = useState(false)

  // Modal facturar
  const [facturando, setFacturando]   = useState<Recibo | null>(null)
  const [folioFiscal, setFolioFiscal] = useState('')
  const [savingFact, setSavingFact]   = useState(false)

  const printRef = useRef<HTMLDivElement>(null)

  const [generandoTicketDetalle, setGenerandoTicketDetalle] = useState(false)
  const [ticketErrDetalle, setTicketErrDetalle] = useState('')

  // ── Carga ──────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setLoading(true)
    const q = dbGolf.from('recibos_golf')
      .select(`
        id, folio, fecha_recibo, subtotal, descuento, total,
        forma_pago_nombre, referencia_pago, observaciones,
        usuario_cobra, status, facturable, folio_fiscal, created_at, id_socio_fk,
        id_venta_pos_fk, id_forma_pago_fk,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio, email,
          cat_categorias_socios(nombre)),
        recibos_golf_det(id, concepto, tipo, periodo, monto_original, descuento, monto_final)
      `)
      .order('created_at', { ascending: false })
      .limit(500)

    if (filtroStatus !== 'todos') q.eq('status', filtroStatus)

    const { data } = await q
    setRecibos((data as unknown as Recibo[]) ?? [])
    setLoading(false)
    setPagina(1)
  }, [filtroStatus])

  useEffect(() => { cargar() }, [cargar])

  // ── Filtros cliente ────────────────────────────────────────
  const recibosF = recibos.filter(r => {
    const nombre = nc(r.cat_socios).toLowerCase()
    const folio  = r.folio.toLowerCase()
    const q      = busqueda.toLowerCase()
    if (q && !nombre.includes(q) && !folio.includes(q)) return false
    if (filtroFact === 'si'  && !r.facturable)  return false
    if (filtroFact === 'no'  &&  r.facturable)  return false
    return true
  })

  const totalPages = Math.ceil(recibosF.length / PAGE_SIZE)
  const recibosPag = recibosF.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  // KPIs
  const totalVigente   = recibos.filter(r => r.status === 'VIGENTE').reduce((a, r) => a + r.total, 0)
  const countVigente   = recibos.filter(r => r.status === 'VIGENTE').length
  const countFacturable = recibos.filter(r => r.status === 'VIGENTE' && r.facturable && !r.folio_fiscal).length
  const countFacturado  = recibos.filter(r => !!r.folio_fiscal).length

  // ── Cancelar recibo ────────────────────────────────────────
  const handleCancelar = async () => {
    if (!cancelando) return
    setSavingCancel(true)
    // 1. Cancelar recibo
    await dbGolf.from('recibos_golf').update({
      status: 'CANCELADO',
      observaciones: motivoCancel || 'Cancelado por usuario',
    }).eq('id', cancelando.id)
    // 2. Revertir cuotas a PENDIENTE
    const ids = cancelando.recibos_golf_det.map(d => d.id)
    if (ids.length) {
      await dbGolf.from('cxc_golf').update({
        status: 'PENDIENTE',
        fecha_pago: null,
        forma_pago: null,
        referencia_pago: null,
        usuario_cobra: null,
        id_recibo_fk: null,
      }).eq('id_recibo_fk', cancelando.id)
    }
    setSavingCancel(false)
    setCancelando(null)
    setMotivoCancel('')
    cargar()
  }

  // ── Marcar facturado ───────────────────────────────────────
  const handleFacturar = async () => {
    if (!facturando || !folioFiscal.trim()) return
    setSavingFact(true)
    await dbGolf.from('recibos_golf').update({
      folio_fiscal: folioFiscal.trim(),
    }).eq('id', facturando.id)
    setSavingFact(false)
    setFacturando(null)
    setFolioFiscal('')
    cargar()
  }

  // ── Imprimir recibo ────────────────────────────────────────
  const handlePrint = (r: Recibo) => {
    const win = window.open('', '_blank', 'width=750,height=900')
    if (!win) return
    const rows = r.recibos_golf_det.map(d => `
      <tr>
        <td>${d.concepto}</td>
        <td>${TIPOS_LABEL[d.tipo] ?? d.tipo}</td>
        <td>${d.periodo ?? '—'}</td>
        <td class="right">${fmt$(d.monto_original)}</td>
        <td class="right">${d.descuento > 0 ? fmt$(d.descuento) : '—'}</td>
        <td class="right" style="font-weight:600">${fmt$(d.monto_final)}</td>
      </tr>`).join('')
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Recibo ${r.folio}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;font-size:12px;color:#1e293b;padding:32px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:2px solid #1e3a5f;padding-bottom:16px}
        .inst-name{font-size:18px;font-weight:700;color:#1e3a5f}
        .inst-sub{font-size:11px;color:#64748b;margin-top:2px}
        .folio-box{text-align:right}
        .folio-lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
        .folio-val{font-size:20px;font-weight:700;color:#1e3a5f}
        .section{margin-bottom:18px}
        .section-title{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
        .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
        .info-item label{font-size:10px;color:#64748b;display:block;margin-bottom:1px}
        .info-item span{font-size:12px;font-weight:500}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{padding:7px 10px;background:#1e3a5f;color:#fff;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em}
        td{padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:12px}
        tr:last-child td{border-bottom:none}
        .right{text-align:right}
        .totales{margin-left:auto;width:260px}
        .totales-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
        .totales-row.total{font-weight:700;font-size:15px;border-top:2px solid #1e3a5f;padding-top:8px;margin-top:4px;color:#1e3a5f}
        .pago-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:12px}
        .pago-label{font-size:10px;color:#15803d;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
        .pago-val{font-size:14px;font-weight:700;color:#15803d}
        .firma-area{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}
        .firma-line{border-top:1px solid #1e293b;padding-top:4px;font-size:10px;color:#64748b;text-align:center}
        .footer{margin-top:32px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px}
        .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600}
        .badge-fact{background:#eff6ff;color:#1d4ed8}
        .badge-cancel{background:#fee2e2;color:#dc2626}
      </style></head><body>
      <div class="header">
        <div>
          <div class="inst-name">${INSTITUCION.nombre}</div>
          <div class="inst-sub">${INSTITUCION.domicilio}</div>
          <div class="inst-sub">RFC: ${INSTITUCION.rfc}</div>
        </div>
        <div class="folio-box">
          <div class="folio-lbl">Recibo de Cobro</div>
          <div class="folio-val">${r.folio}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${fechaFmt(r.fecha_recibo)}</div>
          ${r.facturable ? '<span class="badge badge-fact" style="margin-top:4px">Facturable</span>' : ''}
          ${r.status === 'CANCELADO' ? '<span class="badge badge-cancel" style="margin-top:4px">CANCELADO</span>' : ''}
          ${r.folio_fiscal ? `<div style="font-size:10px;color:#7c3aed;margin-top:4px">UUID: ${r.folio_fiscal}</div>` : ''}
        </div>
      </div>
      <div class="section">
        <div class="section-title">Datos del Socio</div>
        <div class="info-grid">
          <div class="info-item"><label>Nombre</label><span>${nc(r.cat_socios)}</span></div>
          ${r.cat_socios?.numero_socio ? `<div class="info-item"><label>No. Socio</label><span>${r.cat_socios.numero_socio}</span></div>` : ''}
          ${r.cat_socios?.cat_categorias_socios?.nombre ? `<div class="info-item"><label>Categoría</label><span>${r.cat_socios.cat_categorias_socios.nombre}</span></div>` : ''}
          ${r.cat_socios?.email ? `<div class="info-item"><label>Email</label><span>${r.cat_socios.email}</span></div>` : ''}
        </div>
      </div>
      <div class="section">
        <div class="section-title">Detalle de Cuotas</div>
        <table>
          <thead><tr><th>Concepto</th><th>Tipo</th><th>Período</th><th class="right">Monto</th><th class="right">Desc.</th><th class="right">Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totales">
          <div class="totales-row"><span>Subtotal</span><span>${fmt$(r.subtotal)}</span></div>
          ${r.descuento > 0 ? `<div class="totales-row"><span>Descuento adicional</span><span style="color:#dc2626">– ${fmt$(r.descuento)}</span></div>` : ''}
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
        Este recibo es comprobante de pago de cuotas del club. Para facturación, presentar este folio en administración.<br/>
        ${INSTITUCION.nombre} · ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  // ── Generar Ticket POS desde recibo ───────────────────────
  const generarTicketDesdeRecibo = async (r: Recibo) => {
    setGenerandoTicketDetalle(true)
    setTicketErrDetalle('')
    const normStr = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    try {
      const [{ data: centros }, { data: cfg }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cfg_pos').select('razon_social, rfc, direccion, telefono, municipio, leyenda_ticket').single(),
      ])
      const centrosPos = (centros as { id: number; nombre: string; activo: boolean }[]) ?? []
      if (centrosPos.length === 0) throw new Error('No hay centros de venta POS activos.')
      const centroSel = centrosPos.find(c =>
        normStr(c.nombre).includes('membresia') || normStr(c.nombre).includes('membresias') || normStr(c.nombre).includes('club')
      ) ?? centrosPos[0]

      let ventaId = r.id_venta_pos_fk ?? null
      let folioDia = 0
      const fechaPagoStr = r.fecha_recibo
      const fechaVentaIso = `${fechaPagoStr}T12:00:00`

      if (!ventaId) {
        const { data: maxFolio } = await dbGolf.from('ctrl_ventas')
          .select('folio_dia').eq('id_centro_fk', centroSel.id)
          .gte('fecha', `${fechaPagoStr}T00:00:00`).lte('fecha', `${fechaPagoStr}T23:59:59`)
          .order('folio_dia', { ascending: false }).limit(1)
        folioDia = maxFolio && maxFolio.length > 0 ? ((maxFolio[0] as any).folio_dia + 1) : 1

        const nombreSocio = nc(r.cat_socios)
        const { data: ventaData, error: errVenta } = await dbGolf.from('ctrl_ventas').insert({
          folio_dia: folioDia, id_centro_fk: centroSel.id, fecha: fechaVentaIso,
          id_socio_fk: r.id_socio_fk, nombre_cliente: nombreSocio, es_socio: true,
          subtotal: r.subtotal, descuento: r.descuento, iva: 0, total: r.total,
          status: 'PAGADA', usuario_crea: authUser?.nombre ?? 'sistema',
          notas: `Ticket POS regenerado desde recibo ${r.folio} (#${r.id})`,
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
          id_venta_fk: ventaId, id_forma_fk: r.id_forma_pago_fk || null,
          forma_nombre: r.forma_pago_nombre ?? '', monto: r.total,
        })
        if (errPag) throw new Error(errPag.message)

        await dbGolf.from('recibos_golf').update({ id_venta_pos_fk: ventaId }).eq('id', r.id)
        // Actualizar el objeto local
        setDetalle(prev => prev ? { ...prev, id_venta_pos_fk: ventaId } : prev)
        cargar()
      } else {
        const { data: ventaExist } = await dbGolf.from('ctrl_ventas').select('folio_dia').eq('id', ventaId).single()
        folioDia = (ventaExist as any)?.folio_dia ?? 0
      }

      const itemsTicket = r.recibos_golf_det.map(d => ({
        concepto: d.concepto, cantidad: 1,
        precio_unitario: d.monto_final, iva: 0, total: d.monto_final,
      }))
      if (r.descuento > 0) {
        itemsTicket.push({ concepto: `Descuento adicional`, cantidad: 1, precio_unitario: -r.descuento, iva: 0, total: -r.descuento })
      }

      const ticketData = {
        id: ventaId, folio_dia: folioDia || '—', fecha: fechaVentaIso,
        cliente: nc(r.cat_socios), cajero: r.usuario_cobra ?? '—',
        centro: centroSel.nombre,
        razon_social: (cfg as any)?.razon_social ?? INSTITUCION.nombre,
        municipio: (cfg as any)?.municipio ?? '',
        direccion: (cfg as any)?.direccion ?? INSTITUCION.domicilio,
        rfc: (cfg as any)?.rfc ?? INSTITUCION.rfc,
        telefono: (cfg as any)?.telefono ?? '',
        leyenda: (cfg as any)?.leyenda_ticket ?? `Cobro relacionado al recibo ${r.folio}.`,
        subtotal: r.subtotal, iva: 0, total: r.total,
        pagos: [{ forma: r.forma_pago_nombre ?? '—', monto: r.total }],
        items: itemsTicket,
      }
      const encoded = encodeURIComponent(JSON.stringify(ticketData))
      window.open(`/ticket-golf.html?data=${encoded}&print=1`, '_blank', 'width=400,height=700')
    } catch (e: any) {
      setTicketErrDetalle(e?.message ?? 'No se pudo generar el ticket POS')
    } finally {
      setGenerandoTicketDetalle(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, color: '#94a3b8' }}>
        <Link href="/golf" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={14} /> Club
        </Link>
        <span>/</span>
        <span style={{ color: '#475569', fontWeight: 500 }}>Recibos de Cobro</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Receipt size={20} color="#0891b2" />
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b' }}>Recibos de Cobro</h1>
          </div>
          <p style={{ fontSize: 13, color: '#64748b' }}>Consulta, reimpresión y facturación de cobros de cuotas</p>
        </div>
        <button onClick={cargar}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Recibos vigentes', value: countVigente, sub: fmt$(totalVigente), color: '#15803d', bg: '#dcfce7' },
          { label: 'Por facturar', value: countFacturable, sub: 'Marcados facturable sin UUID', color: '#d97706', bg: '#fef3c7' },
          { label: 'Facturados', value: countFacturado, sub: 'Con folio fiscal capturado', color: '#7c3aed', bg: '#ede9fe' },
        ].map(k => (
          <div key={k.label} style={{ flex: '1 1 180px', minWidth: 160, background: k.bg, borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: k.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: k.color, opacity: 0.75, marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            style={{ width: '100%', paddingLeft: 32, paddingRight: 10, paddingTop: 8, paddingBottom: 8, fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', background: '#fff' }}
            placeholder="Buscar por socio o folio…"
            value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1) }}
          />
        </div>
        <select
          style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', outline: 'none' }}
          value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPagina(1) }}>
          <option value="todos">Todos los status</option>
          <option value="VIGENTE">Vigentes</option>
          <option value="CANCELADO">Cancelados</option>
        </select>
        <select
          style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', outline: 'none' }}
          value={filtroFact} onChange={e => { setFiltroFact(e.target.value as 'todos'|'si'|'no'); setPagina(1) }}>
          <option value="todos">Todos (facturación)</option>
          <option value="si">Solo facturables</option>
          <option value="no">No facturables</option>
        </select>
      </div>

      {/* Tabla */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Folio', 'Socio', 'Fecha', 'Cuotas', 'Total', 'Forma pago', 'Status', 'Facturación', 'Acciones'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 13 }}>Cargando recibos…</td></tr>
            ) : recibosPag.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 13 }}>Sin recibos con los filtros actuales</td></tr>
            ) : recibosPag.map((r, i) => {
              const sc  = STATUS_COLOR[r.status] ?? STATUS_COLOR['VIGENTE']
              const cancelado = r.status === 'CANCELADO'
              return (
                <tr key={r.id} style={{ borderBottom: i < recibosPag.length - 1 ? '1px solid #f1f5f9' : 'none', opacity: cancelado ? 0.65 : 1 }}>
                  {/* Folio */}
                  <td style={{ padding: '12px 14px' }}>
                    <button onClick={() => setDetalle(r)}
                      style={{ fontSize: 13, fontWeight: 700, color: '#0891b2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                      {r.folio}
                    </button>
                  </td>
                  {/* Socio */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{nc(r.cat_socios)}</div>
                    {r.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: '#94a3b8' }}>#{r.cat_socios.numero_socio}</div>}
                  </td>
                  {/* Fecha */}
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                    {fechaFmt(r.fecha_recibo)}
                  </td>
                  {/* Cuotas */}
                  <td style={{ padding: '12px 14px', fontSize: 13, color: '#475569', textAlign: 'center' }}>
                    {r.recibos_golf_det.length}
                  </td>
                  {/* Total */}
                  <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: cancelado ? '#94a3b8' : '#059669', whiteSpace: 'nowrap' }}>
                    {fmt$(r.total)}
                  </td>
                  {/* Forma pago */}
                  <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>
                    {r.forma_pago_nombre ?? '—'}
                  </td>
                  {/* Status */}
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>
                      {sc.label}
                    </span>
                  </td>
                  {/* Facturación */}
                  <td style={{ padding: '12px 14px' }}>
                    {r.folio_fiscal ? (
                      <div>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#ede9fe', color: '#7c3aed' }}>Facturado</span>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.folio_fiscal}</div>
                      </div>
                    ) : r.facturable ? (
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#d97706' }}>Por facturar</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
                    )}
                  </td>
                  {/* Acciones */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => handlePrint(r)} title="Reimprimir"
                        style={{ padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center' }}>
                        <Printer size={13} />
                      </button>
                      {!cancelado && r.facturable && !r.folio_fiscal && (
                        <button onClick={() => { setFacturando(r); setFolioFiscal('') }} title="Capturar folio fiscal"
                          style={{ padding: '5px 8px', border: '1px solid #ddd6fe', borderRadius: 6, background: '#f5f3ff', cursor: 'pointer', color: '#7c3aed', display: 'flex', alignItems: 'center' }}>
                          <FileCheck size={13} />
                        </button>
                      )}
                      {!cancelado && (
                        <button onClick={() => { setCancelando(r); setMotivoCancel('') }} title="Cancelar recibo"
                          style={{ padding: '5px 8px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' }}>
                          <XCircle size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 }}>
          <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: pagina === 1 ? 'default' : 'pointer', color: '#475569', opacity: pagina === 1 ? 0.4 : 1 }}>‹</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPagina(p)}
              style={{ padding: '6px 10px', border: `1px solid ${pagina === p ? '#0891b2' : '#e2e8f0'}`, borderRadius: 6, background: pagina === p ? '#0891b2' : '#fff', color: pagina === p ? '#fff' : '#475569', cursor: 'pointer', fontWeight: pagina === p ? 700 : 400, fontSize: 13 }}>
              {p}
            </button>
          ))}
          <button onClick={() => setPagina(p => Math.min(totalPages, p + 1))} disabled={pagina === totalPages}
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: pagina === totalPages ? 'default' : 'pointer', color: '#475569', opacity: pagina === totalPages ? 0.4 : 1 }}>›</button>
        </div>
      )}

      {/* ── Modal Detalle ──────────────────────────────────────── */}
      {detalle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color="#0891b2" />
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>{detalle.folio}</span>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: STATUS_COLOR[detalle.status]?.bg, color: STATUS_COLOR[detalle.status]?.color }}>
                    {STATUS_COLOR[detalle.status]?.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{fechaFmt(detalle.fecha_recibo)} · {nc(detalle.cat_socios)}</div>
              </div>
              <button onClick={() => setDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><XCircle size={18} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {/* Socio */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', marginBottom: 20, padding: '12px 16px', background: '#f8fafc', borderRadius: 10 }}>
                <div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Socio</div><div style={{ fontSize: 13, fontWeight: 600 }}>{nc(detalle.cat_socios)}</div></div>
                {detalle.cat_socios?.numero_socio && <div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>No. Socio</div><div style={{ fontSize: 13, fontWeight: 600 }}>#{detalle.cat_socios.numero_socio}</div></div>}
                {detalle.cat_socios?.cat_categorias_socios?.nombre && <div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Categoría</div><div style={{ fontSize: 13, fontWeight: 600 }}>{detalle.cat_socios.cat_categorias_socios.nombre}</div></div>}
                <div><div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Cajero</div><div style={{ fontSize: 13, fontWeight: 600 }}>{detalle.usuario_cobra ?? '—'}</div></div>
              </div>
              {/* Cuotas */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Cuotas cobradas</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  {detalle.recibos_golf_det.map((d, i) => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < detalle.recibos_golf_det.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{d.concepto}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{TIPOS_LABEL[d.tipo] ?? d.tipo}{d.periodo ? ` · ${d.periodo}` : ''}</div>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', padding: '3px 0' }}><span>Subtotal</span><span>{fmt$(detalle.subtotal)}</span></div>
                  {detalle.descuento > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#dc2626', padding: '3px 0' }}><span>Descuento</span><span>– {fmt$(detalle.descuento)}</span></div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#059669', borderTop: '2px solid #e2e8f0', paddingTop: 6, marginTop: 4 }}><span>Total</span><span>{fmt$(detalle.total)}</span></div>
                </div>
              </div>
              {/* Pago */}
              <div style={{ display: 'flex', gap: 12, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 10, color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Forma de pago</div><div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{detalle.forma_pago_nombre ?? '—'}</div></div>
                {detalle.referencia_pago && <div><div style={{ fontSize: 10, color: '#15803d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Referencia</div><div style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{detalle.referencia_pago}</div></div>}
              </div>
              {/* Factura */}
              {detalle.folio_fiscal && (
                <div style={{ padding: '8px 14px', background: '#ede9fe', border: '1px solid #ddd6fe', borderRadius: 8, fontSize: 12, color: '#7c3aed', marginBottom: 12 }}>
                  <strong>UUID Fiscal:</strong> {detalle.folio_fiscal}
                </div>
              )}
              {detalle.observaciones && (
                <div style={{ padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, color: '#64748b' }}>
                  <strong>Observaciones:</strong> {detalle.observaciones}
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
              {ticketErrDetalle && (
                <div style={{ marginBottom: 10, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
                  {ticketErrDetalle}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setDetalle(null); setTicketErrDetalle('') }}
                  style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                  Cerrar
                </button>
                {detalle.status === 'VIGENTE' && (
                  <button onClick={() => generarTicketDesdeRecibo(detalle)} disabled={generandoTicketDetalle}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, border: '1px solid #a7f3d0', borderRadius: 8, background: '#ecfdf5', color: '#047857', cursor: 'pointer', opacity: generandoTicketDetalle ? 0.6 : 1 }}>
                    {generandoTicketDetalle ? <Loader size={14} /> : <Receipt size={14} />}
                    {detalle.id_venta_pos_fk ? 'Reimprimir Ticket POS' : 'Generar Ticket POS'}
                  </button>
                )}
                <button onClick={() => handlePrint(detalle)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#1e3a5f', color: '#fff', cursor: 'pointer' }}>
                  <Printer size={14} /> Imprimir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Cancelar ─────────────────────────────────────── */}
      {cancelando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1010, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#fee2e2', borderRadius: 8, padding: 8 }}><AlertTriangle size={20} color="#dc2626" /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Cancelar recibo</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{cancelando.folio} · {nc(cancelando.cat_socios)}</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: 1.5 }}>
              Las cuotas incluidas volverán a status <strong>PENDIENTE</strong>. Esta acción no se puede deshacer.
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Motivo de cancelación</label>
            <textarea
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none', height: 72, resize: 'vertical', marginBottom: 20 }}
              value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)} placeholder="Opcional…" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setCancelando(null)} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleCancelar} disabled={savingCancel}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#dc2626', color: '#fff', cursor: 'pointer', opacity: savingCancel ? 0.6 : 1 }}>
                <XCircle size={14} /> {savingCancel ? 'Cancelando…' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Facturar ─────────────────────────────────────── */}
      {facturando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1010, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 20px 50px rgba(0,0,0,0.25)', padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ background: '#ede9fe', borderRadius: 8, padding: 8 }}><FileCheck size={20} color="#7c3aed" /></div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>Capturar folio fiscal</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{facturando.folio} · {nc(facturando.cat_socios)}</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Ingresa el UUID o folio fiscal emitido por el SAT para vincular la factura a este recibo.
            </p>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>UUID / Folio fiscal *</label>
            <input
              style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #ddd6fe', borderRadius: 8, fontFamily: 'inherit', outline: 'none', marginBottom: 20 }}
              value={folioFiscal} onChange={e => setFolioFiscal(e.target.value)} placeholder="Ej: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" autoFocus />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setFacturando(null)} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleFacturar} disabled={savingFact || !folioFiscal.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: (savingFact || !folioFiscal.trim()) ? 0.6 : 1 }}>
                <FileCheck size={14} /> {savingFact ? 'Guardando…' : 'Guardar folio'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
