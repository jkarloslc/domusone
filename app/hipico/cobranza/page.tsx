'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbHip, dbCfg, dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, DollarSign, ChevronLeft, CheckCircle, AlertCircle, Clock, Receipt, Zap, Printer } from 'lucide-react'
import Link from 'next/link'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 30

type ArrendCat   = { id: number; nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
type ConceptoCat  = { id: number; nombre: string; tipo: string; monto: number }
type FormaPagoCat = { id: number; nombre: string }

type Cargo = {
  id: number
  id_arrendatario_fk: number
  id_concepto_fk: number | null
  descripcion: string
  mes_aplicacion: string | null
  monto: number
  saldo: number
  fecha_vencimiento: string | null
  status: string
  notas: string | null
  created_at: string
  cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
  cat_conceptos_cuota?: { nombre: string }
}

type Pago = {
  id: number
  folio: string
  id_arrendatario_fk: number
  fecha_pago: string
  monto_total: number
  forma_pago: string
  referencia: string | null
  notas: string | null
  id_venta_pos_fk: number | null
  created_at: string
  cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
}
type VentaPOS = {
  id: number
  folio_dia: number
  fecha: string
  nombre_cliente: string
  subtotal: number
  iva: number
  total: number
  usuario_crea: string | null
  id_centro_fk: number
}
type VentaPOSDet = { concepto: string; cantidad: number; precio_unitario: number; iva: number; total: number }
type VentaPOSPago = { forma_nombre: string; monto: number }
type CentroPOS = { id: number; nombre: string; activo: boolean }
type CfgPOS = { razon_social: string | null; municipio: string | null; direccion: string | null; rfc: string | null; telefono: string | null; leyenda_ticket: string | null }

const EMPTY_CARGO = {
  id_arrendatario_fk: null as number | null,
  id_concepto_fk: null as number | null,
  descripcion: '', mes_aplicacion: '', monto: 0,
  fecha_vencimiento: '', notas: '',
}


const fmtNombreArr = (a?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }) => {
  if (!a) return '—'
  if (a.tipo_persona === 'Moral' && a.razon_social) return a.razon_social
  return [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')
}

const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'Pendiente': { bg: '#fef9c3', color: '#ca8a04' },
  'Pagado':    { bg: '#dcfce7', color: '#16a34a' },
  'Vencido':   { bg: '#fee2e2', color: '#dc2626' },
  'Cancelado': { bg: '#f8fafc', color: '#64748b' },
}

// ── Institución ──────────────────────────────────────────────
const INSTITUCION = {
  nombre:    'Club Hípico Balvanera',
  domicilio: 'Balvanera, Corregidora, Querétaro',
  rfc:       'CGB000101AAA',
}

// ── Imprimir recibo hípico ───────────────────────────────────
const printReciboHipico = async (pago: {
  id: number
  folio: string
  fecha_pago: string
  monto_total: number
  forma_pago: string
  referencia: string | null
  notas: string | null
  cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
}, dbHipRef: typeof import('@/lib/supabase').dbHip) => {
  // Cargar detalle de cargos cubiertos
  const { data: detData } = await dbHipRef
    .from('ctrl_pagos_det')
    .select('monto, ctrl_cargos(descripcion, mes_aplicacion, id_concepto_fk)')
    .eq('id_pago_fk', pago.id)

  const det = (detData ?? []) as unknown as {
    monto: number
    ctrl_cargos?: { descripcion: string; mes_aplicacion: string | null }
  }[]

  const fmtFechaLarga = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

  const fmtMes = (d: string | null) =>
    d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'

  const fmt$p = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })

  const nombreArr = pago.cat_arrendatarios
    ? pago.cat_arrendatarios.tipo_persona === 'Moral' && pago.cat_arrendatarios.razon_social
      ? pago.cat_arrendatarios.razon_social
      : [pago.cat_arrendatarios.nombre, pago.cat_arrendatarios.apellido_paterno].filter(Boolean).join(' ')
    : '—'

  const filas = det.map(d => `
    <tr>
      <td>${d.ctrl_cargos?.descripcion ?? '—'}</td>
      <td>${fmtMes(d.ctrl_cargos?.mes_aplicacion ?? null)}</td>
      <td class="right" style="font-weight:600">${fmt$p(d.monto)}</td>
    </tr>`).join('')

  const win = window.open('', '_blank', 'width=720,height=900')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8"/>
    <title>Recibo Hípico ${pago.folio}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:12px;color:#1c0a00;padding:32px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #44200d;padding-bottom:16px}
      .inst-name{font-size:18px;font-weight:700;color:#44200d}
      .inst-sub{font-size:11px;color:#6b4c3b;margin-top:2px}
      .folio-box{text-align:right}
      .folio-lbl{font-size:10px;color:#6b4c3b;text-transform:uppercase;letter-spacing:.08em}
      .folio-val{font-size:22px;font-weight:700;color:#44200d;font-family:monospace}
      .section{margin-bottom:18px}
      .section-title{font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid #d6b99a;padding-bottom:4px}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}
      .info-item label{font-size:10px;color:#6b4c3b;display:block;margin-bottom:1px}
      .info-item span{font-size:12px;font-weight:600;color:#1c0a00}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{padding:7px 10px;background:#44200d;color:#f5e6d3;font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.05em}
      td{padding:8px 10px;border-bottom:1px solid #e8d5c0;font-size:12px}
      tr:last-child td{border-bottom:none}
      .right{text-align:right}
      .totales{margin-left:auto;width:240px}
      .totales-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
      .totales-row.total{font-weight:700;font-size:16px;border-top:2px solid #44200d;padding-top:8px;margin-top:4px;color:#44200d}
      .pago-box{background:#fdf6ec;border:1px solid #d6b99a;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:16px}
      .pago-label{font-size:10px;color:#92400e;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
      .pago-val{font-size:14px;font-weight:700;color:#44200d}
      .firma-area{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:52px}
      .firma-line{border-top:1px solid #44200d;padding-top:4px;font-size:10px;color:#6b4c3b;text-align:center}
      .footer{margin-top:32px;font-size:10px;color:#a87d5c;text-align:center;border-top:1px solid #e8d5c0;padding-top:12px}
      @media print{body{padding:20px}}
    </style></head><body>

    <div class="header">
      <div>
        <div class="inst-name">${INSTITUCION.nombre}</div>
        <div class="inst-sub">${INSTITUCION.domicilio}</div>
        <div class="inst-sub">RFC: ${INSTITUCION.rfc}</div>
      </div>
      <div class="folio-box">
        <div class="folio-lbl">Recibo de Cobro</div>
        <div class="folio-val">${pago.folio}</div>
        <div style="font-size:11px;color:#6b4c3b;margin-top:3px">${fmtFechaLarga(pago.fecha_pago)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Datos del Arrendatario</div>
      <div class="info-grid">
        <div class="info-item"><label>Nombre / Razón Social</label><span>${nombreArr}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Cargos Cubiertos</div>
      <table>
        <thead><tr>
          <th>Descripción</th>
          <th>Mes Aplicación</th>
          <th class="right">Importe</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="totales">
        <div class="totales-row total">
          <span>TOTAL</span>
          <span>${fmt$p(pago.monto_total)}</span>
        </div>
      </div>
    </div>

    <div class="pago-box">
      <div>
        <div class="pago-label">Forma de Pago</div>
        <div class="pago-val">${pago.forma_pago}</div>
      </div>
      ${pago.referencia ? `
      <div style="margin-left:24px">
        <div class="pago-label">Referencia / Folio bancario</div>
        <div class="pago-val" style="font-size:12px">${pago.referencia}</div>
      </div>` : ''}
    </div>

    ${pago.notas ? `
    <div style="font-size:11px;color:#6b4c3b;padding:8px 12px;background:#fdf6ec;border:1px solid #e8d5c0;border-radius:6px;margin-bottom:16px">
      <strong>Notas:</strong> ${pago.notas}
    </div>` : ''}

    <div class="firma-area">
      <div class="firma-line">Firma del Arrendatario</div>
      <div class="firma-line">Recibió / Administración</div>
    </div>

    <div class="footer">
      Este recibo es comprobante de pago de rentas y servicios de caballeriza.<br/>
      ${INSTITUCION.nombre} &middot; ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
    </div>

  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 400)
}

export default function CobranzaPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('hipico-cobranza')
  const puedeEliminar = canDelete()

  const [tab, setTab] = useState<'cargos' | 'recibos' | 'generar'>('cargos')

  // ── Cargos ──
  const [cargos, setCargos]     = useState<Cargo[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [filtroStatus, setFiltroStatus] = useState<string>('Pendiente')
  const [filtroArr, setFiltroArr]       = useState<number | ''>('')
  const [loading, setLoading]   = useState(true)
  const [kpis, setKpis] = useState({ pendiente: 0, vencido: 0, pagado: 0, total_cargos: 0 })

  // ── Recibos ──
  const [pagos, setPagos]         = useState<Pago[]>([])
  const [totalPagos, setTotalPagos] = useState(0)
  const [pagePagos, setPagePagos]   = useState(0)
  const [filtroArrPagos, setFiltroArrPagos] = useState<number | ''>('')
  const [loadingPagos, setLoadingPagos] = useState(false)
  const [generandoTicketPagoId, setGenerandoTicketPagoId] = useState<number | null>(null)

  // ── Catálogos ──
  const [arrendatarios, setArrendatarios] = useState<ArrendCat[]>([])
  const [conceptos, setConceptos]         = useState<ConceptoCat[]>([])

  // ── Modal nuevo cargo ──
  const [showCargo, setShowCargo] = useState(false)
  const [formCargo, setFormCargo] = useState<typeof EMPTY_CARGO>(EMPTY_CARGO)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')

  // ── Modal cobrar (recibo) ──
  const [showCobrar, setShowCobrar]       = useState(false)
  const [cobrarArr, setCobrarArr]         = useState<number | ''>('')
  const [cargosArrendatario, setCargosArrendatario] = useState<Cargo[]>([])
  const [selectedCargos, setSelectedCargos]         = useState<Set<number>>(new Set())
  const [formasPago, setFormasPago]       = useState<FormaPagoCat[]>([])
  const [formaPago, setFormaPago]         = useState('')
  const [referencia, setReferencia]       = useState('')
  const [notasPago, setNotasPago]         = useState('')
  const [savingPago, setSavingPago]       = useState(false)
  const [errPago, setErrPago]             = useState('')
  const [loadingCargosArr, setLoadingCargosArr] = useState(false)

  // ── Generar cargos mensuales ──
  type ContratoPrev = {
    id: number
    folio: string
    renta_mensual: number
    dia_pago: number
    moneda: string
    id_arrendatario_fk: number
    cat_arrendatarios?: { nombre: string; apellido_paterno: string | null; razon_social: string | null; tipo_persona: string }
    cat_caballerizas?: { clave: string; nombre: string | null }
    // estado calculado
    ya_tiene_cargo?: boolean
  }
  const [mesGenerar, setMesGenerar] = useState<string>(() => {
    const hoy = new Date()
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [contratosVigentes, setContratosVigentes] = useState<ContratoPrev[]>([])
  const [loadingContratos, setLoadingContratos] = useState(false)
  const [selectedContratos, setSelectedContratos] = useState<Set<number>>(new Set())
  const [generando, setGenerando] = useState(false)
  const [resGenerar, setResGenerar] = useState<{ ok: number; skip: number } | null>(null)
  const [errGenerar, setErrGenerar] = useState('')

  const loadContratosVigentes = useCallback(async (mes: string) => {
    setLoadingContratos(true)
    setResGenerar(null)
    setErrGenerar('')
    // 1. Contratos vigentes
    const { data: contratos } = await dbHip
      .from('ctrl_contratos')
      .select('id, folio, renta_mensual, dia_pago, moneda, id_arrendatario_fk, cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), cat_caballerizas(clave, nombre)')
      .eq('status', 'Vigente')
      .order('folio')
    if (!contratos) { setLoadingContratos(false); return }

    // 2. Cargos ya existentes para ese mes
    const { data: cargosExist } = await dbHip
      .from('ctrl_cargos')
      .select('id_contrato_fk, mes_aplicacion')
      .eq('mes_aplicacion', mes)
      .not('id_contrato_fk', 'is', null)

    const contratosCargados = new Set((cargosExist ?? []).map((c: any) => c.id_contrato_fk as number))

    const lista = (contratos as unknown as ContratoPrev[]).map(ct => ({
      ...ct,
      ya_tiene_cargo: contratosCargados.has(ct.id),
    }))
    setContratosVigentes(lista)
    // Preseleccionar los que no tienen cargo
    setSelectedContratos(new Set(lista.filter(c => !c.ya_tiene_cargo).map(c => c.id)))
    setLoadingContratos(false)
  }, [])

  useEffect(() => { if (tab === 'generar') loadContratosVigentes(mesGenerar) }, [tab, mesGenerar, loadContratosVigentes])

  const toggleContrato = (id: number) => {
    setSelectedContratos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleGenerarCargos = async () => {
    if (selectedContratos.size === 0) { setErrGenerar('Selecciona al menos un contrato'); return }
    setGenerando(true); setErrGenerar(''); setResGenerar(null)

    const seleccionados = contratosVigentes.filter(c => selectedContratos.has(c.id))
    const mesDate = new Date(mesGenerar + 'T12:00:00')
    const mesLabel = mesDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

    let ok = 0, skip = 0
    for (const ct of seleccionados) {
      if (ct.ya_tiene_cargo) { skip++; continue }
      // Fecha vencimiento: día de pago del contrato en el mes seleccionado
      const diaVenc = ct.dia_pago ?? 1
      const fechaVenc = new Date(mesDate.getFullYear(), mesDate.getMonth(), diaVenc)
      const payload = {
        id_arrendatario_fk: ct.id_arrendatario_fk,
        id_contrato_fk: ct.id,
        descripcion: `Renta de caballeriza — ${mesLabel}`,
        mes_aplicacion: mesGenerar,
        monto: ct.renta_mensual,
        saldo: ct.renta_mensual,
        fecha_vencimiento: fechaVenc.toISOString().split('T')[0],
        status: 'Pendiente',
        notas: `Generado automáticamente desde contrato ${ct.folio}`,
      }
      const { error } = await dbHip.from('ctrl_cargos').insert(payload)
      if (error) { skip++ } else { ok++ }
    }

    setGenerando(false)
    setResGenerar({ ok, skip })
    // Recargar para marcar ya_tiene_cargo
    loadContratosVigentes(mesGenerar)
    // Refrescar KPIs
    dbHip.from('ctrl_cargos').select('status, monto, saldo').then(({ data }: any) => {
      const all = (data ?? []) as { status: string; monto: number; saldo: number }[]
      setKpis({
        pendiente:    all.filter(x => x.status === 'Pendiente').reduce((s, x) => s + x.saldo, 0),
        vencido:      all.filter(x => x.status === 'Vencido').reduce((s, x) => s + x.saldo, 0),
        pagado:       all.filter(x => x.status === 'Pagado').reduce((s, x) => s + x.monto, 0),
        total_cargos: all.length,
      })
    })
  }

  // ── Carga catálogos ──
  useEffect(() => {
    dbHip.from('cat_arrendatarios').select('id, nombre, apellido_paterno, razon_social, tipo_persona').eq('activo', true).order('apellido_paterno')
      .then(({ data }: any) => setArrendatarios(data ?? []))
    dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }: any) => {
        const fps = data ?? []
        setFormasPago(fps)
        if (fps.length > 0) setFormaPago(fps[0].nombre)
      })
    dbHip.from('cat_conceptos_cuota').select('id, nombre, tipo, monto').eq('activo', true).order('nombre')
      .then(({ data }: any) => {
        // Deduplicar por nombre+tipo (por si hay duplicados en BD)
        const seen = new Set<string>()
        const unique = (data ?? []).filter((c: ConceptoCat) => {
          const key = `${c.tipo}|${c.nombre.trim().toLowerCase()}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        setConceptos(unique)
      })
    // KPIs
    dbHip.from('ctrl_cargos').select('status, monto, saldo')
      .then(({ data }: any) => {
        const all = (data ?? []) as { status: string; monto: number; saldo: number }[]
        setKpis({
          pendiente:    all.filter(x => x.status === 'Pendiente').reduce((s, x) => s + x.saldo, 0),
          vencido:      all.filter(x => x.status === 'Vencido').reduce((s, x) => s + x.saldo, 0),
          pagado:       all.filter(x => x.status === 'Pagado').reduce((s, x) => s + x.monto, 0),
          total_cargos: all.length,
        })
      })
  }, [])

  // ── Fetch cargos ──
  const fetchCargos = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = dbHip
      .from('ctrl_cargos')
      .select('*, cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), cat_conceptos_cuota(nombre)', { count: 'exact' })
      .order('fecha_vencimiento', { ascending: true })
      .range(from, to)
    if (filtroStatus) q = q.eq('status', filtroStatus)
    if (filtroArr !== '') q = q.eq('id_arrendatario_fk', filtroArr)
    const { data, count } = await q
    setCargos((data as Cargo[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, filtroStatus, filtroArr])

  useEffect(() => { fetchCargos() }, [fetchCargos])

  // ── Fetch recibos ──
  const fetchPagos = useCallback(async () => {
    setLoadingPagos(true)
    const from = pagePagos * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    let q = dbHip
      .from('ctrl_pagos')
      .select('*, cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona)', { count: 'exact' })
      .order('fecha_pago', { ascending: false })
      .range(from, to)
    if (filtroArrPagos !== '') q = q.eq('id_arrendatario_fk', filtroArrPagos)
    const { data, count } = await q
    setPagos((data as Pago[]) ?? [])
    setTotalPagos(count ?? 0)
    setLoadingPagos(false)
  }, [pagePagos, filtroArrPagos])

  useEffect(() => { if (tab === 'recibos') fetchPagos() }, [fetchPagos, tab])

  const abrirTicketPOS = (payload: any, autoPrint = true) => {
    const encoded = encodeURIComponent(JSON.stringify(payload))
    const url = `/ticket-golf.html?data=${encoded}${autoPrint ? '&print=1' : ''}`
    window.open(url, '_blank', 'width=400,height=700')
  }

  const mapFormaPagoHipicoToPOS = (formas: { id: number; nombre: string }[], formaHipico: string) => {
    const f = norm(formaHipico)
    return formas.find(x => norm(x.nombre) === f)
      ?? formas.find(x => norm(x.nombre).includes(f) || f.includes(norm(x.nombre)))
      ?? formas[0]
  }

  const construirTicketDesdeVenta = async (ventaId: number) => {
    const [{ data: venta, error: e1 }, { data: det }, { data: pagosVenta }, { data: cfg }, { data: centrosPos }] = await Promise.all([
      dbGolf.from('ctrl_ventas').select('id, folio_dia, fecha, nombre_cliente, subtotal, iva, total, usuario_crea, id_centro_fk').eq('id', ventaId).single(),
      dbGolf.from('ctrl_ventas_det').select('concepto, cantidad, precio_unitario, iva, total').eq('id_venta_fk', ventaId),
      dbGolf.from('ctrl_ventas_pagos').select('forma_nombre, monto').eq('id_venta_fk', ventaId),
      dbGolf.from('cfg_pos').select('razon_social, municipio, direccion, rfc, telefono, leyenda_ticket').single(),
      dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true),
    ])
    if (e1 || !venta) throw new Error(e1?.message ?? 'No se pudo cargar la venta POS vinculada')

    const v = venta as VentaPOS
    const centro = ((centrosPos as CentroPOS[] | null) ?? []).find(c => c.id === v.id_centro_fk)
    return {
      id: v.id,
      folio_dia: v.folio_dia,
      fecha: v.fecha,
      cliente: v.nombre_cliente,
      cajero: v.usuario_crea ?? '—',
      centro: centro?.nombre ?? '—',
      razon_social: (cfg as CfgPOS | null)?.razon_social ?? 'Club de Golf Balvanera',
      municipio: (cfg as CfgPOS | null)?.municipio ?? '',
      direccion: (cfg as CfgPOS | null)?.direccion ?? '',
      rfc: (cfg as CfgPOS | null)?.rfc ?? '',
      telefono: (cfg as CfgPOS | null)?.telefono ?? '',
      leyenda: (cfg as CfgPOS | null)?.leyenda_ticket ?? '¡Gracias por su visita!',
      subtotal: v.subtotal,
      iva: v.iva,
      total: v.total,
      pagos: ((pagosVenta as VentaPOSPago[] | null) ?? []).map(p => ({ forma: p.forma_nombre, monto: p.monto })),
      items: (det as VentaPOSDet[]) ?? [],
    }
  }

  const generarTicketPagoHipico = async (p: Pago) => {
    setGenerandoTicketPagoId(p.id)
    try {
      if (p.id_venta_pos_fk) {
        const payload = await construirTicketDesdeVenta(p.id_venta_pos_fk)
        abrirTicketPOS(payload, true)
        return
      }

      const [{ data: centrosPos }, { data: formasPos }, { data: cfgPos }, { data: detPago }] = await Promise.all([
        dbGolf.from('cat_centros_venta').select('id, nombre, activo').eq('activo', true).order('orden'),
        dbGolf.from('cat_formas_pago_pos').select('id, nombre').eq('activo', true).order('id'),
        dbGolf.from('cfg_pos').select('razon_social, municipio, direccion, rfc, telefono, leyenda_ticket').single(),
        dbHip.from('ctrl_pagos_det')
          .select('monto, ctrl_cargos(descripcion)')
          .eq('id_pago_fk', p.id),
      ])

      const centros = (centrosPos as CentroPOS[]) ?? []
      const formas = (formasPos as { id: number; nombre: string }[]) ?? []
      if (centros.length === 0) throw new Error('No hay centros POS activos.')
      if (formas.length === 0) throw new Error('No hay formas de pago POS activas.')

      const centroHipico = centros.find(c => {
        const n = norm(c.nombre)
        return n.includes('hipico') || n.includes('caballeriza')
      })
      if (!centroHipico) throw new Error('No encontré un centro POS llamado Hípico/Caballeriza.')

      const formaSel = mapFormaPagoHipicoToPOS(formas, p.forma_pago)
      if (!formaSel) throw new Error('No se pudo mapear forma de pago POS.')

      const fechaPagoIso = `${p.fecha_pago}T12:00:00`
      const { data: maxFolio } = await dbGolf.from('ctrl_ventas')
        .select('folio_dia')
        .eq('id_centro_fk', centroHipico.id)
        .gte('fecha', `${p.fecha_pago}T00:00:00`)
        .lte('fecha', `${p.fecha_pago}T23:59:59`)
        .order('folio_dia', { ascending: false })
        .limit(1)
      const folioDia = maxFolio && maxFolio.length > 0 ? ((maxFolio[0] as { folio_dia: number }).folio_dia + 1) : 1

      const { data: venta, error: errVenta } = await dbGolf.from('ctrl_ventas').insert({
        folio_dia: folioDia,
        id_centro_fk: centroHipico.id,
        fecha: fechaPagoIso,
        id_socio_fk: null,
        nombre_cliente: fmtNombreArr(p.cat_arrendatarios),
        es_socio: false,
        subtotal: p.monto_total,
        descuento: 0,
        iva: 0,
        total: p.monto_total,
        status: 'PAGADA',
        usuario_crea: 'hipico-cobranza',
        notas: `Ticket POS generado desde recibo hípico ${p.folio} (#${p.id})`,
      }).select('id, folio_dia').single()
      if (errVenta || !venta) throw new Error(errVenta?.message ?? 'No se pudo crear venta POS')

      const ventaId = (venta as { id: number; folio_dia: number }).id
      const ventaFolioDia = (venta as { id: number; folio_dia: number }).folio_dia
      const detallePago = (detPago ?? []) as { monto: number; ctrl_cargos?: { descripcion: string } }[]
      const detalleRows = (detallePago.length > 0 ? detallePago.map(d => ({
        id_venta_fk: ventaId,
        id_producto_fk: null,
        concepto: d.ctrl_cargos?.descripcion ?? `Cobro Hípico ${p.folio}`,
        cantidad: 1,
        precio_unitario: d.monto,
        descuento: 0,
        iva_pct: 0,
        iva: 0,
        subtotal: d.monto,
        total: d.monto,
        notas: null,
      })) : [{
        id_venta_fk: ventaId,
        id_producto_fk: null,
        concepto: `Cobro Hípico ${p.folio}`,
        cantidad: 1,
        precio_unitario: p.monto_total,
        descuento: 0,
        iva_pct: 0,
        iva: 0,
        subtotal: p.monto_total,
        total: p.monto_total,
        notas: null,
      }])
      const { error: errDet } = await dbGolf.from('ctrl_ventas_det').insert(detalleRows)
      if (errDet) throw new Error(errDet.message)

      const { error: errPag } = await dbGolf.from('ctrl_ventas_pagos').insert({
        id_venta_fk: ventaId,
        id_forma_fk: formaSel.id,
        forma_nombre: formaSel.nombre,
        monto: p.monto_total,
      })
      if (errPag) throw new Error(errPag.message)

      const { error: errLink } = await dbHip.from('ctrl_pagos').update({ id_venta_pos_fk: ventaId }).eq('id', p.id)
      if (errLink) throw new Error(errLink.message)

      setPagos(prev => prev.map(x => x.id === p.id ? { ...x, id_venta_pos_fk: ventaId } : x))

      const payload = {
        id: ventaId,
        folio_dia: ventaFolioDia,
        fecha: fechaPagoIso,
        cliente: fmtNombreArr(p.cat_arrendatarios),
        cajero: 'hipico-cobranza',
        centro: centroHipico.nombre,
        razon_social: (cfgPos as CfgPOS | null)?.razon_social ?? 'Club de Golf Balvanera',
        municipio: (cfgPos as CfgPOS | null)?.municipio ?? '',
        direccion: (cfgPos as CfgPOS | null)?.direccion ?? '',
        rfc: (cfgPos as CfgPOS | null)?.rfc ?? '',
        telefono: (cfgPos as CfgPOS | null)?.telefono ?? '',
        leyenda: (cfgPos as CfgPOS | null)?.leyenda_ticket ?? '¡Gracias por su visita!',
        subtotal: p.monto_total,
        iva: 0,
        total: p.monto_total,
        pagos: [{ forma: formaSel.nombre, monto: p.monto_total }],
        items: detalleRows.map(d => ({ concepto: d.concepto, cantidad: d.cantidad, precio_unitario: d.precio_unitario, iva: d.iva, total: d.total })),
      }
      abrirTicketPOS(payload, true)
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo generar ticket POS')
    } finally {
      setGenerandoTicketPagoId(null)
    }
  }

  // ── Nuevo cargo ──
  const openNuevoCargo = () => { setFormCargo(EMPTY_CARGO); setErr(''); setShowCargo(true) }

  const handleConceptoChange = (idStr: string) => {
    const id = idStr ? Number(idStr) : null
    const concepto = conceptos.find(c => c.id === id)
    setFormCargo(f => ({
      ...f,
      id_concepto_fk: id,
      descripcion: concepto?.nombre ?? f.descripcion,
      monto: concepto?.monto ?? f.monto,
    }))
  }

  const handleSaveCargo = async () => {
    if (!formCargo.id_arrendatario_fk) { setErr('Selecciona un arrendatario'); return }
    if (!formCargo.descripcion.trim())  { setErr('La descripción es obligatoria'); return }
    if (formCargo.monto <= 0)           { setErr('El monto debe ser mayor a 0'); return }
    setSaving(true); setErr('')
    const payload = {
      id_arrendatario_fk: formCargo.id_arrendatario_fk,
      id_concepto_fk: formCargo.id_concepto_fk ?? null,
      descripcion: formCargo.descripcion.trim(),
      mes_aplicacion: formCargo.mes_aplicacion || null,
      monto: formCargo.monto,
      saldo: formCargo.monto,
      fecha_vencimiento: formCargo.fecha_vencimiento || null,
      status: 'Pendiente',
      notas: formCargo.notas || null,
    }
    const { error } = await dbHip.from('ctrl_cargos').insert(payload)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowCargo(false)
    fetchCargos()
    // refrescar KPIs
    dbHip.from('ctrl_cargos').select('status, monto, saldo').then(({ data }: any) => {
      const all = (data ?? []) as { status: string; monto: number; saldo: number }[]
      setKpis({
        pendiente:    all.filter(x => x.status === 'Pendiente').reduce((s, x) => s + x.saldo, 0),
        vencido:      all.filter(x => x.status === 'Vencido').reduce((s, x) => s + x.saldo, 0),
        pagado:       all.filter(x => x.status === 'Pagado').reduce((s, x) => s + x.monto, 0),
        total_cargos: all.length,
      })
    })
  }

  // ── Modal cobrar ──
  const openCobrar = () => {
    setCobrarArr('')
    setCargosArrendatario([])
    setSelectedCargos(new Set())
    setFormaPago('Transferencia')
    setReferencia('')
    setNotasPago('')
    setErrPago('')
    setShowCobrar(true)
  }

  const loadCargosArrendatario = async (idArr: number) => {
    setLoadingCargosArr(true)
    const { data } = await dbHip
      .from('ctrl_cargos')
      .select('*, cat_conceptos_cuota(nombre)')
      .eq('id_arrendatario_fk', idArr)
      .in('status', ['Pendiente', 'Vencido'])
      .order('fecha_vencimiento', { ascending: true })
    setCargosArrendatario((data as Cargo[]) ?? [])
    // seleccionar todos por defecto
    setSelectedCargos(new Set(((data as Cargo[]) ?? []).map(c => c.id)))
    setLoadingCargosArr(false)
  }

  const toggleCargo = (id: number) => {
    setSelectedCargos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const montoSeleccionado = cargosArrendatario
    .filter(c => selectedCargos.has(c.id))
    .reduce((s, c) => s + c.saldo, 0)

  // Genera folio RH-YYYY-NNN
  const generarFolio = async (): Promise<string> => {
    const anio = new Date().getFullYear()
    const { data } = await dbHip
      .from('ctrl_pagos')
      .select('folio')
      .like('folio', `RH-${anio}-%`)
      .order('folio', { ascending: false })
      .limit(1)
    const ultimo = (data as { folio: string }[] | null)?.[0]?.folio
    const num = ultimo ? parseInt(ultimo.split('-')[2] ?? '0') + 1 : 1
    return `RH-${anio}-${String(num).padStart(3, '0')}`
  }

  const handleCobrar = async () => {
    if (cobrarArr === '') { setErrPago('Selecciona un arrendatario'); return }
    if (selectedCargos.size === 0) { setErrPago('Selecciona al menos un cargo'); return }
    setSavingPago(true); setErrPago('')

    const folio = await generarFolio()

    // 1. Insertar recibo
    const { data: pagoData, error: errPago1 } = await dbHip
      .from('ctrl_pagos')
      .insert({
        folio,
        id_arrendatario_fk: cobrarArr,
        fecha_pago: new Date().toISOString().split('T')[0],
        monto_total: montoSeleccionado,
        forma_pago: formaPago,
        referencia: referencia || null,
        notas: notasPago || null,
      })
      .select('id')
      .single()

    if (errPago1 || !pagoData) {
      setSavingPago(false)
      setErrPago(errPago1?.message ?? 'Error al crear recibo')
      return
    }

    const idPago = pagoData.id

    // 2. Insertar detalle
    const cargosSeleccionados = cargosArrendatario.filter(c => selectedCargos.has(c.id))
    const detalle = cargosSeleccionados.map(c => ({
      id_pago_fk: idPago,
      id_cargo_fk: c.id,
      monto: c.saldo,
    }))
    const { error: errDet } = await dbHip.from('ctrl_pagos_det').insert(detalle)
    if (errDet) {
      setSavingPago(false)
      setErrPago(errDet.message)
      return
    }

    // 3. Marcar cargos como Pagado con saldo 0
    for (const c of cargosSeleccionados) {
      await dbHip.from('ctrl_cargos').update({ status: 'Pagado', saldo: 0 }).eq('id', c.id)
    }

    setSavingPago(false)
    setShowCobrar(false)
    fetchCargos()
    if (tab === 'recibos') fetchPagos()
    // refrescar KPIs
    dbHip.from('ctrl_cargos').select('status, monto, saldo').then(({ data }: any) => {
      const all = (data ?? []) as { status: string; monto: number; saldo: number }[]
      setKpis({
        pendiente:    all.filter(x => x.status === 'Pendiente').reduce((s, x) => s + x.saldo, 0),
        vencido:      all.filter(x => x.status === 'Vencido').reduce((s, x) => s + x.saldo, 0),
        pagado:       all.filter(x => x.status === 'Pagado').reduce((s, x) => s + x.monto, 0),
        total_cargos: all.length,
      })
    })
  }

  const totalPags      = Math.ceil(total / PAGE_SIZE)
  const totalPagsPagos = Math.ceil(totalPagos / PAGE_SIZE)

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Link href="/hipico" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
          <ChevronLeft size={14} /> Hípico
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Cobranza Hípico</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={tab === 'cargos' ? fetchCargos : fetchPagos}><RefreshCw size={13} /></button>
          {puedeEscribir && tab === 'cargos' && (
            <>
              <button className="btn-ghost" onClick={openNuevoCargo}><Plus size={13} /> Cargo</button>
              <button className="btn-primary" onClick={openCobrar}><Receipt size={13} /> Cobrar</button>
            </>
          )}
          {puedeEscribir && tab === 'generar' && (
            <button className="btn-primary" onClick={handleGenerarCargos} disabled={generando || selectedContratos.size === 0}>
              <Zap size={13} /> {generando ? 'Generando…' : `Generar ${selectedContratos.size} cargo${selectedContratos.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Por Cobrar', value: fmt$(kpis.pendiente), icon: <Clock size={14} />, color: '#ca8a04', bg: '#fefce8' },
          { label: 'Vencido',    value: fmt$(kpis.vencido),   icon: <AlertCircle size={14} />, color: '#dc2626', bg: '#fef2f2' },
          { label: 'Cobrado',    value: fmt$(kpis.pagado),    icon: <CheckCircle size={14} />, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Total Cargos', value: kpis.total_cargos.toString(), icon: <DollarSign size={14} />, color: '#2563eb', bg: '#eff6ff' },
        ].map(k => (
          <div key={k.label} className="card" style={{ flex: '1 1 160px', padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color, flexShrink: 0 }}>
              {k.icon}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {([
          ['cargos',  'Cargos'],
          ['recibos', 'Recibos emitidos'],
          ['generar', '⚡ Generar del mes'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? 'var(--gold-light)' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid var(--gold-light)' : '2px solid transparent',
              background: 'none', border: 'none', borderRadius: 0, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB CARGOS ── */}
      {tab === 'cargos' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select className="input" value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(0) }} style={{ fontSize: 12 }}>
              <option value="">Todos los status</option>
              {['Pendiente', 'Vencido', 'Pagado', 'Cancelado'].map(s => <option key={s}>{s}</option>)}
            </select>
            <select className="input" value={filtroArr} onChange={e => { setFiltroArr(e.target.value ? Number(e.target.value) : ''); setPage(0) }} style={{ fontSize: 12, minWidth: 200 }}>
              <option value="">Todos los arrendatarios</option>
              {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{total} cargo{total !== 1 ? 's' : ''}</div>

          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                  {['Arrendatario', 'Descripción', 'Mes', 'Vencimiento', 'Monto', 'Saldo', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                ) : cargos.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin cargos</td></tr>
                ) : cargos.map((c, i) => {
                  const sc = STATUS_COLOR[c.status] ?? { bg: '#f8fafc', color: '#64748b' }
                  const vencido = c.fecha_vencimiento && c.status === 'Pendiente' && new Date(c.fecha_vencimiento) < new Date()
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{fmtNombreArr(c.cat_arrendatarios)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{c.descripcion}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                        {c.mes_aplicacion ? new Date(c.mes_aplicacion + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', color: vencido ? '#dc2626' : 'var(--text-muted)', fontWeight: vencido ? 600 : 400, fontSize: 12 }}>{fmtFecha(c.fecha_vencimiento)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt$(c.monto)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: c.saldo > 0 ? '#dc2626' : '#16a34a' }}>{fmt$(c.saldo)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: sc.bg, color: sc.color }}>{c.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPags > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Pág. {page + 1} / {totalPags}</span>
              <button className="btn-ghost" disabled={page >= totalPags - 1} onClick={() => setPage(p => p + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}

      {/* ── TAB RECIBOS ── */}
      {tab === 'recibos' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <select className="input" value={filtroArrPagos} onChange={e => { setFiltroArrPagos(e.target.value ? Number(e.target.value) : ''); setPagePagos(0) }} style={{ fontSize: 12, minWidth: 220 }}>
              <option value="">Todos los arrendatarios</option>
              {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>)}
            </select>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{totalPagos} recibo{totalPagos !== 1 ? 's' : ''}</div>

          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                  {['Folio', 'Arrendatario', 'Fecha', 'Forma de Pago', 'Referencia', 'Total', 'Ticket POS', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingPagos ? (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                ) : pagos.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin recibos</td></tr>
                ) : pagos.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--gold-light)', fontFamily: 'monospace' }}>{p.folio}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{fmtNombreArr(p.cat_arrendatarios)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{fmtFecha(p.fecha_pago)}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{p.forma_pago}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{p.referencia ?? '—'}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#16a34a' }}>{fmt$(p.monto_total)}</td>
                    <td style={{ padding: '10px 14px', color: p.id_venta_pos_fk ? '#15803d' : '#94a3b8', fontSize: 11, fontFamily: p.id_venta_pos_fk ? 'monospace' : 'inherit' }}>
                      {p.id_venta_pos_fk ? `#${String(p.id_venta_pos_fk).padStart(6, '0')}` : 'Sin ticket'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn-ghost"
                          title="Imprimir recibo"
                          onClick={() => printReciboHipico(p, dbHip)}
                          style={{ padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Printer size={13} /> Imprimir
                        </button>
                        <button
                          className="btn-ghost"
                          title="Generar/Reimprimir ticket POS"
                          onClick={() => generarTicketPagoHipico(p)}
                          disabled={generandoTicketPagoId === p.id}
                          style={{ padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#0f766e', opacity: generandoTicketPagoId === p.id ? 0.6 : 1 }}>
                          {generandoTicketPagoId === p.id ? '…' : <Receipt size={13} />}
                          {p.id_venta_pos_fk ? 'Ticket POS' : 'Generar Ticket'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPagsPagos > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn-ghost" disabled={pagePagos === 0} onClick={() => setPagePagos(p => p - 1)}>Anterior</button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Pág. {pagePagos + 1} / {totalPagsPagos}</span>
              <button className="btn-ghost" disabled={pagePagos >= totalPagsPagos - 1} onClick={() => setPagePagos(p => p + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}

      {/* ── TAB GENERAR CARGOS ── */}
      {tab === 'generar' && (
        <>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Mes a generar</label>
              <input className="input" type="month"
                value={mesGenerar.slice(0, 7)}
                onChange={e => setMesGenerar(e.target.value + '-01')}
                style={{ fontSize: 13 }} />
            </div>
            <button className="btn-ghost" onClick={() => loadContratosVigentes(mesGenerar)} style={{ marginBottom: 0 }}>
              <RefreshCw size={13} /> Recargar
            </button>
          </div>

          {/* Resultado */}
          {resGenerar && (
            <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8,
              background: resGenerar.ok > 0 ? '#f0fdf4' : '#fefce8',
              color: resGenerar.ok > 0 ? '#15803d' : '#ca8a04',
              fontSize: 13, fontWeight: 600, border: `1px solid ${resGenerar.ok > 0 ? '#bbf7d0' : '#fde68a'}` }}>
              ✓ {resGenerar.ok} cargo{resGenerar.ok !== 1 ? 's' : ''} generado{resGenerar.ok !== 1 ? 's' : ''}
              {resGenerar.skip > 0 && ` · ${resGenerar.skip} omitido${resGenerar.skip !== 1 ? 's' : ''} (ya existían o error)`}
            </div>
          )}
          {errGenerar && (
            <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{errGenerar}</div>
          )}

          {/* Lista contratos */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            {loadingContratos ? 'Cargando contratos…' : `${contratosVigentes.length} contrato${contratosVigentes.length !== 1 ? 's' : ''} vigente${contratosVigentes.length !== 1 ? 's' : ''}`}
            {!loadingContratos && contratosVigentes.length > 0 && (
              <span style={{ marginLeft: 12 }}>
                <button style={{ fontSize: 11, color: 'var(--gold-light)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setSelectedContratos(new Set(contratosVigentes.filter(c => !c.ya_tiene_cargo).map(c => c.id)))}>
                  Seleccionar pendientes
                </button>
                {' · '}
                <button style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setSelectedContratos(new Set())}>
                  Quitar selección
                </button>
              </span>
            )}
          </div>

          {!loadingContratos && contratosVigentes.length > 0 && (
            <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '10px 14px', width: 36 }}></th>
                    {['Contrato', 'Arrendatario', 'Caballeriza', 'Renta Mensual', 'Día Pago', 'Estado'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contratosVigentes.map((ct, i) => {
                    const checked = selectedContratos.has(ct.id)
                    const disabled = ct.ya_tiene_cargo
                    return (
                      <tr key={ct.id}
                        onClick={() => !disabled && toggleContrato(ct.id)}
                        style={{ borderBottom: '1px solid var(--border)',
                          background: ct.ya_tiene_cargo ? 'var(--surface-800)' : checked ? 'rgba(180,83,9,0.07)' : (i % 2 === 0 ? 'transparent' : 'var(--surface-800)'),
                          cursor: disabled ? 'default' : 'pointer',
                          opacity: disabled ? 0.6 : 1 }}>
                        <td style={{ padding: '10px 14px' }}>
                          <input type="checkbox" checked={checked} disabled={disabled}
                            onChange={() => !disabled && toggleContrato(ct.id)}
                            onClick={e => e.stopPropagation()}
                            style={{ accentColor: '#b45309' }} />
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--gold-light)', fontFamily: 'monospace', fontSize: 12 }}>{ct.folio}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)' }}>{fmtNombreArr(ct.cat_arrendatarios)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                          {ct.cat_caballerizas?.clave}{ct.cat_caballerizas?.nombre ? ` — ${ct.cat_caballerizas.nombre}` : ''}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {fmt$(ct.renta_mensual)}{ct.moneda === 'USD' ? ' USD' : ''}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>Día {ct.dia_pago}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {ct.ya_tiene_cargo
                            ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>✓ Ya generado</span>
                            : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#fef9c3', color: '#ca8a04', fontWeight: 600 }}>Pendiente</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loadingContratos && contratosVigentes.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              No hay contratos vigentes
            </div>
          )}
        </>
      )}

      {/* ── Modal nuevo cargo ── */}
      {showCargo && (
        <ModalShell modulo="hipico" titulo="Nuevo Cargo" onClose={() => setShowCargo(false)} maxWidth={560}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowCargo(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveCargo} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Arrendatario *</label>
              <select className="input" value={formCargo.id_arrendatario_fk ?? ''} onChange={e => setFormCargo(f => ({ ...f, id_arrendatario_fk: e.target.value ? Number(e.target.value) : null }))} style={{ width: '100%' }}>
                <option value="">— Seleccionar —</option>
                {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Concepto (opcional)</label>
              <select className="input" value={formCargo.id_concepto_fk ?? ''} onChange={e => handleConceptoChange(e.target.value)} style={{ width: '100%' }}>
                <option value="">— Sin concepto —</option>
                {conceptos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Descripción *</label>
              <input className="input" value={formCargo.descripcion} onChange={e => setFormCargo(f => ({ ...f, descripcion: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Monto *</label>
              <input className="input" type="number" value={formCargo.monto} onChange={e => setFormCargo(f => ({ ...f, monto: Number(e.target.value) }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Mes Aplicación</label>
              <input className="input" type="date" value={formCargo.mes_aplicacion} onChange={e => setFormCargo(f => ({ ...f, mes_aplicacion: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Fecha Vencimiento</label>
              <input className="input" type="date" value={formCargo.fecha_vencimiento} onChange={e => setFormCargo(f => ({ ...f, fecha_vencimiento: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea className="input" rows={2} value={formCargo.notas} onChange={e => setFormCargo(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
            </div>
            {err && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{err}</div>}
          </div>
        </ModalShell>
      )}

      {/* ── Modal cobrar ── */}
      {showCobrar && (
        <ModalShell modulo="hipico" titulo="Registrar Cobro" onClose={() => setShowCobrar(false)} maxWidth={580}
          footer={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {selectedCargos.size > 0 && (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginRight: 'auto' }}>
                  Total: {fmt$(montoSeleccionado)}
                </span>
              )}
              <button className="btn-ghost" onClick={() => setShowCobrar(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleCobrar} disabled={savingPago || selectedCargos.size === 0 || cobrarArr === ''}>
                {savingPago ? 'Guardando…' : 'Emitir Recibo'}
              </button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            {/* Arrendatario */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Arrendatario *</label>
              <select className="input" value={cobrarArr} style={{ width: '100%' }}
                onChange={e => {
                  const id = e.target.value ? Number(e.target.value) : ''
                  setCobrarArr(id)
                  if (id) loadCargosArrendatario(id)
                  else { setCargosArrendatario([]); setSelectedCargos(new Set()) }
                }}>
                <option value="">— Seleccionar —</option>
                {arrendatarios.map(a => <option key={a.id} value={a.id}>{fmtNombreArr(a)}</option>)}
              </select>
            </div>

            {/* Lista de cargos pendientes */}
            {cobrarArr !== '' && (
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Cargos pendientes — selecciona los que se liquidan
                </label>
                {loadingCargosArr ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>Cargando cargos…</div>
                ) : cargosArrendatario.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>Sin cargos pendientes para este arrendatario</div>
                ) : (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {cargosArrendatario.map((c, i) => {
                      const checked = selectedCargos.has(c.id)
                      const vencido = c.status === 'Vencido' || (c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date())
                      return (
                        <div key={c.id} onClick={() => toggleCargo(c.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer',
                            background: checked ? 'rgba(180,83,9,0.08)' : (i % 2 === 0 ? 'transparent' : 'var(--surface-800)'),
                            borderBottom: i < cargosArrendatario.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleCargo(c.id)}
                            onClick={e => e.stopPropagation()} style={{ accentColor: '#b45309', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: checked ? 600 : 400 }}>{c.descripcion}</div>
                            {c.mes_aplicacion && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {new Date(c.mes_aplicacion + 'T12:00:00').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                          {vencido && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>Vencido</span>}
                          <div style={{ fontWeight: 700, color: checked ? '#b45309' : 'var(--text-primary)', fontSize: 13, flexShrink: 0 }}>{fmt$(c.saldo)}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Forma de pago */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Forma de Pago</label>
              <select className="input" value={formaPago} onChange={e => setFormaPago(e.target.value)} style={{ width: '100%' }}>
                {formasPago.map(f => <option key={f.id} value={f.nombre}>{f.nombre}</option>)}
              </select>
            </div>

            {/* Referencia */}
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Referencia / Folio bancario</label>
              <input className="input" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Opcional" style={{ width: '100%' }} />
            </div>

            {/* Notas */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notas</label>
              <textarea className="input" rows={2} value={notasPago} onChange={e => setNotasPago(e.target.value)} style={{ resize: 'vertical', width: '100%' }} />
            </div>

            {errPago && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{errPago}</div>}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
