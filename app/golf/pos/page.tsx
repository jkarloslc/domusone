'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf, dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  ShoppingCart, RefreshCw, Plus, Search, X, ChevronLeft,
  ChevronDown, ChevronRight, Scissors, Settings, History,
  Printer, Ban, AlertCircle, Store, Save, Loader, FileText, Receipt,
} from 'lucide-react'
import Link from 'next/link'
import NuevaVentaModal from './NuevaVentaModal'
import CorteModal from './CorteModal'

// ── Tipos ──────────────────────────────────────────────────────
type Centro = { id: number; nombre: string; descripcion: string | null; activo: boolean; orden: number }
type CentroIngreso = { id: number; nombre: string; activo: boolean }
type CentroIngresoMap = {
  id: number
  id_centro_venta_fk: number
  id_centro_ingreso_fk: number
  activo: boolean
}
type Venta = {
  id: number; folio_dia: number; fecha: string; nombre_cliente: string
  es_socio: boolean; total: number; subtotal: number; iva: number
  status: string; id_centro_fk: number; usuario_crea: string | null
  num_impresiones: number; id_corte_fk: number | null; facturada: boolean
  cat_socios: { nombre: string; apellido_paterno: string | null } | null
}
type Corte = {
  id: number; id_centro_fk: number; centro_nombre: string; fecha_corte: string
  fecha_inicio: string; fecha_fin: string
  num_ventas: number; num_canceladas: number
  total_ventas: number; total_cancelado: number; total_neto: number
  usuario: string | null; notas: string | null
  id_recibo_ingreso: number | null
}
type Producto = {
  id: number; nombre: string; descripcion: string | null; sku: string | null
  precio: number; costo: number; iva_pct: number; aplica_iva: boolean
  tipo: string; activo: boolean; id_centro_fk: number | null
}
type FormaPago = { id: number; nombre: string; activo: boolean }
type CfgPos = { id: number; razon_social: string; rfc: string | null; direccion: string | null; telefono: string | null; municipio: string | null; leyenda_ticket: string }

type Tab = 'pos' | 'ventas' | 'cortes' | 'config'

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtDT = (d: string) => new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtD  = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

export default function POSPage() {
  const { canWrite, authUser } = useAuth()
  const puedeEscribir = canWrite('golf-pos')

  const [tab, setTab] = useState<Tab>('pos')

  // Centros
  const [centros,        setCentros]        = useState<Centro[]>([])
  const [centroActivo,   setCentroActivo]   = useState<Centro | null>(null)

  // Modales
  const [showVenta,  setShowVenta]  = useState(false)
  const [showCorte,  setShowCorte]  = useState(false)

  // Ventas
  const [ventas,         setVentas]         = useState<Venta[]>([])
  const [loadingV,       setLoadingV]       = useState(false)
  const [busquedaV,      setBusquedaV]      = useState('')
  const [filtroStatus,   setFiltroStatus]   = useState('')
  const [filtroCentro,   setFiltroCentro]   = useState('')
  const [filtroFecha,    setFiltroFecha]    = useState(new Date().toISOString().split('T')[0])
  const [expandidoV,     setExpandidoV]     = useState<number | null>(null)

  // Cortes
  const [cortes,         setCortes]         = useState<Corte[]>([])
  const [loadingC,       setLoadingC]       = useState(false)

  // Config
  const [productos,      setProductos]      = useState<Producto[]>([])
  const [formasPago,     setFormasPago]     = useState<FormaPago[]>([])
  const [cfgPos,         setCfgPos]         = useState<CfgPos | null>(null)
  const [loadingCfg,     setLoadingCfg]     = useState(false)
  const [savingCfg,      setSavingCfg]      = useState(false)
  const [cfgForm,        setCfgForm]        = useState<Partial<CfgPos>>({})
  const [editingProd,    setEditingProd]    = useState<Partial<Producto> | null>(null)
  const [savingProd,     setSavingProd]     = useState(false)
  const [nuevoCentroNom, setNuevoCentroNom] = useState('')
  const [centrosIngreso, setCentrosIngreso] = useState<CentroIngreso[]>([])
  const [centrosIngresoMap, setCentrosIngresoMap] = useState<CentroIngresoMap[]>([])
  const [savingMap, setSavingMap] = useState<number | null>(null)

  // Cortes — acciones
  const [generandoRecibo, setGenerandoRecibo] = useState<number | null>(null)

  // Stats del día
  const [statsHoy, setStatsHoy] = useState({ ventas: 0, total: 0, pendCorte: 0 })
  const [dbError, setDbError]   = useState('')

  // ── Cargar centros de venta ─────────────────────────────
  useEffect(() => {
    if (!authUser) return   // esperar a que la sesión esté lista
    dbGolf.from('cat_centros_venta').select('id, nombre, descripcion, activo, orden').eq('activo', true).order('orden')
      .then(({ data, error }) => {
        if (error) {
          setDbError(`Error cat_centros_venta: ${error.message} | code: ${error.code} | hint: ${error.hint}`)
          return
        }
        const cs = (data as Centro[]) ?? []
        if (cs.length === 0) {
          setDbError('cat_centros_venta sin registros activos')
        } else {
          setDbError('')
          setCentros(cs)
          setCentroActivo(cs[0])
        }
      })
  }, [authUser])

  // ── Stats del día ────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    const hoy = new Date().toISOString().split('T')[0]
    const { data, error } = await dbGolf.from('ctrl_ventas')
      .select('id, total, status, id_corte_fk')
      .eq('status', 'PAGADA')
      .gte('fecha', hoy + 'T00:00:00')
    if (error) { console.error('[POS] fetchStats:', error); return }
    const rows = data ?? []
    setStatsHoy({
      ventas:    rows.length,
      total:     rows.reduce((a: number, r: any) => a + (r.total ?? 0), 0),
      pendCorte: rows.filter((r: any) => !r.id_corte_fk).length,
    })
  }, [])

  // ── Fetch ventas ─────────────────────────────────────────
  const fetchVentas = useCallback(async () => {
    setLoadingV(true)
    let q = dbGolf.from('ctrl_ventas')
      .select('id, folio_dia, fecha, nombre_cliente, es_socio, total, subtotal, iva, status, id_centro_fk, usuario_crea, num_impresiones, id_corte_fk, facturada')
      .order('fecha', { ascending: false })
      .limit(200)
    if (filtroStatus)  q = q.eq('status', filtroStatus)
    if (filtroCentro)  q = q.eq('id_centro_fk', Number(filtroCentro))
    if (filtroFecha)   q = q.gte('fecha', filtroFecha + 'T00:00:00').lte('fecha', filtroFecha + 'T23:59:59')
    const { data, error } = await q
    if (error) { console.error('[POS] fetchVentas:', error) }
    setVentas((data ?? []).map((v: any) => ({ ...v, cat_socios: null })) as Venta[])
    setLoadingV(false)
  }, [filtroStatus, filtroCentro, filtroFecha])

  // ── Fetch cortes ─────────────────────────────────────────
  const fetchCortes = useCallback(async () => {
    setLoadingC(true)
    const { data } = await dbGolf.from('ctrl_cortes_caja')
      .select('*')
      .order('fecha_corte', { ascending: false })
      .limit(50)
    setCortes((data as Corte[]) ?? [])
    setLoadingC(false)
  }, [])

  // ── Fetch config ─────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    setLoadingCfg(true)

    // Asegurar fila en cfg_pos
    const { data: cfgCheck } = await dbGolf.from('cfg_pos').select('id').limit(1)
    if (!cfgCheck || cfgCheck.length === 0) {
      await dbGolf.from('cfg_pos').insert({ razon_social: 'Club de Golf Balvanera', leyenda_ticket: '¡Gracias por su visita!' })
    }

    const [{ data: prods }, { data: fps }, { data: cfg }, { data: cis }, { data: maps }] = await Promise.all([
      dbGolf.from('cat_productos_pos').select('*').order('nombre'),
      dbCfg.from('formas_pago').select('id, nombre, activo').eq('activo', true).order('nombre'),
      dbGolf.from('cfg_pos').select('*').single(),
      dbCfg.from('centros_ingreso').select('id, nombre, activo').eq('activo', true).order('nombre'),
      dbGolf.from('pos_centros_ingreso_map').select('id, id_centro_venta_fk, id_centro_ingreso_fk, activo'),
    ])
    setProductos((prods as Producto[]) ?? [])
    setFormasPago((fps as FormaPago[]) ?? [])
    setCentrosIngreso((cis as CentroIngreso[]) ?? [])
    setCentrosIngresoMap((maps as CentroIngresoMap[]) ?? [])
    const c = cfg as CfgPos
    setCfgPos(c)
    setCfgForm(c ?? {})
    setLoadingCfg(false)
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { if (tab === 'ventas') fetchVentas() }, [tab, fetchVentas])
  useEffect(() => { if (tab === 'cortes') fetchCortes() }, [tab, fetchCortes])
  useEffect(() => { if (tab === 'config') fetchConfig() }, [tab, fetchConfig])

  // ── Cancelar venta ────────────────────────────────────────
  const cancelarVenta = async (id: number) => {
    if (!confirm('¿Cancelar esta venta?')) return
    await dbGolf.from('ctrl_ventas').update({ status: 'CANCELADA' }).eq('id', id)
    fetchVentas(); fetchStats()
  }

  // ── Reimprimir ticket ─────────────────────────────────────
  const reimprimirTicket = async (v: Venta) => {
    const { data: det } = await dbGolf.from('ctrl_ventas_det')
      .select('concepto, cantidad, precio_unitario, iva, total').eq('id_venta_fk', v.id)
    const { data: pagos } = await dbGolf.from('ctrl_ventas_pagos')
      .select('forma_nombre, monto').eq('id_venta_fk', v.id)
    const { data: cfg } = await dbGolf.from('cfg_pos').select('*').single()
    const centro = centros.find(c => c.id === v.id_centro_fk)

    const ticketData = {
      id:          v.id,
      folio_dia:   v.folio_dia,
      fecha:       v.fecha,
      cliente:     v.nombre_cliente,
      cajero:      v.usuario_crea ?? '—',
      centro:      centro?.nombre ?? '—',
      razon_social: (cfg as any)?.razon_social ?? 'Club de Golf',
      municipio:   (cfg as any)?.municipio ?? '',
      direccion:   (cfg as any)?.direccion ?? '',
      rfc:         (cfg as any)?.rfc ?? '',
      telefono:    (cfg as any)?.telefono ?? '',
      leyenda:     (cfg as any)?.leyenda_ticket ?? '¡Gracias por su visita!',
      subtotal:    v.subtotal,
      iva:         v.iva,
      total:       v.total,
      pagos:       (pagos ?? []).map((p: any) => ({ forma: p.forma_nombre, monto: p.monto })),
      items:       det ?? [],
    }
    const url = `/ticket-golf.html?data=${encodeURIComponent(JSON.stringify(ticketData))}`
    window.open(url, '_blank', 'width=400,height=700')
    await dbGolf.from('ctrl_ventas').update({ num_impresiones: v.num_impresiones + 1 }).eq('id', v.id)
  }

  // ── Imprimir corte de caja ────────────────────────────────
  const imprimirCorte = async (c: Corte) => {
    // Cargar desglose de formas de pago
    const { data: det } = await dbGolf.from('ctrl_cortes_caja_det')
      .select('forma_nombre, monto').eq('id_corte_fk', c.id).order('monto', { ascending: false })
    // Cargar cfg del POS
    const { data: cfg } = await dbGolf.from('cfg_pos').select('*').single()
    const rs = (cfg as any)?.razon_social ?? 'Club de Golf Balvanera'
    const dir = (cfg as any)?.direccion ?? ''
    const tel = (cfg as any)?.telefono ?? ''
    const rfc = (cfg as any)?.rfc ?? ''

    const desglose = (det ?? []) as { forma_nombre: string; monto: number }[]
    const fmt = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
    const fdt = (d: string) => new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    const fd  = (d: string) => new Date(d).toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

    const filasDesglose = desglose.map(f => `
      <tr>
        <td>${f.forma_nombre}</td>
        <td class="right">${fmt(f.monto)}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Corte de Caja #${String(c.id).padStart(4,'0')}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:12px; color:#1e293b; background:#fff; padding:20mm 18mm; }
  @media print { body { padding:10mm 12mm; } @page { size:A4; margin:0; } }
  h1 { font-size:20px; font-weight:800; color:#065f46; margin-bottom:2px; }
  h2 { font-size:14px; font-weight:700; color:#1e293b; margin:14px 0 6px; border-bottom:2px solid #e2e8f0; padding-bottom:4px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; border-bottom:3px solid #059669; padding-bottom:14px; }
  .club { }
  .club-sub { font-size:11px; color:#64748b; margin-top:2px; }
  .folio { text-align:right; }
  .folio-num { font-size:26px; font-weight:900; color:#059669; }
  .folio-label { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; }
  table { width:100%; border-collapse:collapse; margin-bottom:8px; }
  th { background:#f1f5f9; color:#475569; font-size:10px; text-transform:uppercase; letter-spacing:.05em; padding:6px 10px; text-align:left; }
  td { padding:7px 10px; border-bottom:1px solid #f1f5f9; font-size:12px; }
  .right { text-align:right; }
  .bold { font-weight:700; }
  .total-row td { font-size:14px; font-weight:800; color:#059669; border-top:2px solid #e2e8f0; padding-top:10px; }
  .kpi-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin:14px 0; }
  .kpi { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; }
  .kpi-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.05em; }
  .kpi-value { font-size:20px; font-weight:800; margin-top:2px; }
  .kpi-green { color:#059669; }
  .kpi-red   { color:#dc2626; }
  .kpi-blue  { color:#2563eb; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:14px 0; font-size:12px; }
  .meta-item { display:flex; gap:8px; }
  .meta-label { color:#94a3b8; min-width:80px; }
  .meta-value { font-weight:600; color:#1e293b; }
  .recibo-badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; background:#dcfce7; color:#15803d; margin-top:4px; }
  .footer { margin-top:24px; border-top:1px solid #e2e8f0; padding-top:12px; text-align:center; font-size:10px; color:#94a3b8; }
  .no-print { margin-bottom:16px; }
  @media print { .no-print { display:none; } }
</style>
</head>
<body>
<div class="no-print">
  <button onclick="window.print()" style="padding:8px 20px;background:#059669;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">🖨 Imprimir</button>
</div>

<div class="header">
  <div class="club">
    <h1>${rs}</h1>
    <div class="club-sub">${dir}</div>
    ${tel ? `<div class="club-sub">Tel. ${tel}</div>` : ''}
    ${rfc ? `<div class="club-sub">RFC: ${rfc}</div>` : ''}
  </div>
  <div class="folio">
    <div class="folio-label">Corte de Caja</div>
    <div class="folio-num">#${String(c.id).padStart(4,'0')}</div>
    <div class="club-sub" style="text-align:right">${fdt(c.fecha_corte)}</div>
    ${c.id_recibo_ingreso ? `<div class="recibo-badge">✓ Recibo ingreso #${c.id_recibo_ingreso}</div>` : ''}
  </div>
</div>

<div class="meta">
  <div class="meta-item"><span class="meta-label">Centro:</span><span class="meta-value">${c.centro_nombre}</span></div>
  <div class="meta-item"><span class="meta-label">Cajero:</span><span class="meta-value">${c.usuario ?? '—'}</span></div>
  <div class="meta-item"><span class="meta-label">Período:</span><span class="meta-value">${fd(c.fecha_inicio)} — ${fd(c.fecha_fin)}</span></div>
  <div class="meta-item"><span class="meta-label">Fecha corte:</span><span class="meta-value">${fdt(c.fecha_corte)}</span></div>
  ${c.notas ? `<div class="meta-item" style="grid-column:1/-1"><span class="meta-label">Notas:</span><span class="meta-value">${c.notas}</span></div>` : ''}
</div>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-label">Ventas cobradas</div><div class="kpi-value kpi-green">${c.num_ventas}</div></div>
  <div class="kpi"><div class="kpi-label">Canceladas</div><div class="kpi-value kpi-red">${c.num_canceladas ?? 0}</div></div>
  <div class="kpi"><div class="kpi-label">Total ventas</div><div class="kpi-value kpi-blue">${fmt(c.total_ventas)}</div></div>
  <div class="kpi"><div class="kpi-label">Total neto</div><div class="kpi-value kpi-green">${fmt(c.total_neto)}</div></div>
</div>

<h2>Desglose por Forma de Pago</h2>
${desglose.length > 0 ? `
<table>
  <thead><tr><th>Forma de Pago</th><th class="right">Monto</th></tr></thead>
  <tbody>
    ${filasDesglose}
    <tr class="total-row"><td class="bold">TOTAL NETO</td><td class="right bold">${fmt(c.total_neto)}</td></tr>
  </tbody>
</table>` : '<p style="color:#94a3b8;font-size:12px;padding:10px 0">Sin desglose de formas de pago registrado.</p>'}

<div class="footer">
  Corte generado el ${fdt(c.fecha_corte)} · ${rs}
  <br/>Este documento es el comprobante oficial del cierre de caja.
</div>
</body>
</html>`

    const w = window.open('', '_blank', 'width=800,height=900')
    if (w) { w.document.write(html); w.document.close(); w.focus() }
  }

  const mapFormasPago = (rows: { forma_nombre: string; monto: number }[]) => {
    const mapped: Record<string, number> = {
      monto_efectivo: 0, monto_transferencia: 0, monto_tarjeta: 0, monto_cheque: 0,
    }
    for (const fp of rows) {
      const n = fp.forma_nombre.toLowerCase()
      if (n.includes('efectivo')) mapped.monto_efectivo += fp.monto
      else if (n.includes('tarjeta')) mapped.monto_tarjeta += fp.monto
      else if (n.includes('transf')) mapped.monto_transferencia += fp.monto
      else if (n.includes('cheque')) mapped.monto_cheque += fp.monto
      else mapped.monto_efectivo += fp.monto
    }
    return mapped
  }

  const getCentroIngresoMap = (idCentroVenta: number) =>
    centrosIngresoMap.find(m => m.id_centro_venta_fk === idCentroVenta && m.activo)

  const getCentroIngresoIdForCentroVenta = (idCentroVenta: number) => {
    const mapped = getCentroIngresoMap(idCentroVenta)
    if (mapped?.id_centro_ingreso_fk) return mapped.id_centro_ingreso_fk
    const sameId = centrosIngreso.find(c => c.id === idCentroVenta)
    return sameId?.id ?? null
  }

  // ── Generar recibo de ingreso para corte ──────────────────
  const generarReciboCorte = async (c: Corte) => {
    if (c.id_recibo_ingreso) {
      alert(`Este corte ya tiene el recibo de ingreso #${c.id_recibo_ingreso} generado.`)
      return
    }
    if (!confirm(`¿Generar recibo de ingreso por ${fmt$(c.total_neto)} para el corte #${String(c.id).padStart(4,'0')}?`)) return
    setGenerandoRecibo(c.id)

    try {
      // Obtener desglose de formas de pago
      const { data: det } = await dbGolf.from('ctrl_cortes_caja_det')
        .select('forma_nombre, monto').eq('id_corte_fk', c.id)
      const fps = (det ?? []) as { forma_nombre: string; monto: number }[]
      const fpagoMap = mapFormasPago(fps)

      const f1 = c.fecha_inicio.split('T')[0]
      const f2 = c.fecha_fin.split('T')[0]

      const idCentroIngreso = getCentroIngresoIdForCentroVenta(c.id_centro_fk)
      if (!idCentroIngreso) {
        alert(`No hay mapeo de centro de ingreso para "${c.centro_nombre}". Configúralo en Configuración > Mapeo POS.`)
        return
      }

      const { data: recibo, error: reErr } = await dbCtrl.from('recibos_ingreso').insert({
        fecha:                f2,
        id_centro_ingreso_fk: idCentroIngreso,
        descripcion:          `Corte POS Golf — ${c.centro_nombre} — ${f1} al ${f2}`,
        monto_efectivo:       fpagoMap.monto_efectivo,
        monto_transferencia:  fpagoMap.monto_transferencia,
        monto_tarjeta:        fpagoMap.monto_tarjeta,
        monto_cheque:         fpagoMap.monto_cheque,
        monto_total:          c.total_neto,
        status:               'Confirmado',
        origen:               'POS_GOLF',
        referencia_externa:   `golf.ctrl_cortes_caja:${c.id}`,
        notas:                `Folio corte Golf: #${c.id}`,
        usuario_crea:         authUser?.nombre ?? 'sistema',
      }).select('id').single()

      if (reErr || !recibo) { alert('Error al generar recibo: ' + (reErr?.message ?? 'desconocido')); return }

      await dbGolf.from('ctrl_cortes_caja').update({ id_recibo_ingreso: recibo.id }).eq('id', c.id)
      fetchCortes()
      alert(`✅ Recibo de ingreso #${recibo.id} generado exitosamente.`)
    } catch (e: any) {
      alert('Error: ' + e.message)
    } finally {
      setGenerandoRecibo(null)
    }
  }

  // ── Guardar producto ──────────────────────────────────────
  const guardarProducto = async () => {
    if (!editingProd?.nombre) return
    setSavingProd(true)
    const payload = {
      nombre:      editingProd.nombre,
      descripcion: editingProd.descripcion || null,
      sku:         editingProd.sku || null,
      precio:      editingProd.precio ?? 0,
      costo:       editingProd.costo ?? 0,
      iva_pct:     editingProd.iva_pct ?? 16,
      aplica_iva:  editingProd.aplica_iva ?? true,
      tipo:        editingProd.tipo ?? 'SERVICIO',
      activo:      editingProd.activo ?? true,
      id_centro_fk: editingProd.id_centro_fk ?? null,
    }
    if (editingProd.id) {
      await dbGolf.from('cat_productos_pos').update(payload).eq('id', editingProd.id)
    } else {
      await dbGolf.from('cat_productos_pos').insert(payload)
    }
    setEditingProd(null)
    setSavingProd(false)
    fetchConfig()
  }

  // ── Guardar cfg pos ───────────────────────────────────────
  const guardarCfg = async () => {
    setSavingCfg(true)
    await dbGolf.from('cfg_pos').update({ ...cfgForm, updated_at: new Date().toISOString() }).eq('id', cfgPos?.id ?? 1)
    setSavingCfg(false)
    fetchConfig()
  }

  const guardarMapCentroIngreso = async (idCentroVenta: number, idCentroIngreso: number | null) => {
    setSavingMap(idCentroVenta)
    if (idCentroIngreso) {
      const existente = centrosIngresoMap.find(m => m.id_centro_venta_fk === idCentroVenta)
      if (existente) {
        await dbGolf.from('pos_centros_ingreso_map').update({
          id_centro_ingreso_fk: idCentroIngreso,
          activo: true,
          updated_at: new Date().toISOString(),
        }).eq('id', existente.id)
      } else {
        await dbGolf.from('pos_centros_ingreso_map').insert({
          id_centro_venta_fk: idCentroVenta,
          id_centro_ingreso_fk: idCentroIngreso,
          activo: true,
        })
      }
    } else {
      await dbGolf.from('pos_centros_ingreso_map').delete().eq('id_centro_venta_fk', idCentroVenta)
    }
    setSavingMap(null)
    fetchConfig()
  }

  // ── Agregar centro ────────────────────────────────────────
  const agregarCentro = async () => {
    if (!nuevoCentroNom.trim()) return
    await dbGolf.from('cat_centros_venta').insert({ nombre: nuevoCentroNom.trim(), orden: centros.length + 1 })
    setNuevoCentroNom('')
    dbGolf.from('cat_centros_venta').select('*').eq('activo', true).order('orden')
      .then(({ data }) => setCentros((data as Centro[]) ?? []))
    fetchConfig()
  }

  const ventasF = ventas.filter(v => {
    if (!busquedaV.trim()) return true
    const q = busquedaV.toLowerCase()
    return v.nombre_cliente.toLowerCase().includes(q) || String(v.id).includes(q) || String(v.folio_dia).includes(q)
  })

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'pos',     label: 'Punto de Venta', icon: ShoppingCart },
    { key: 'ventas',  label: 'Historial',      icon: History      },
    { key: 'cortes',  label: 'Cortes de Caja', icon: Scissors     },
    { key: 'config',  label: 'Configuración',  icon: Settings     },
  ]

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/golf" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', textDecoration: 'none', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#2563eb'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94a3b8'}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>/</span>
            <ShoppingCart size={13} style={{ color: '#059669' }} />
            <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>POS Ventas</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Punto de Venta
          </h1>
        </div>
        <button className="btn-ghost" onClick={() => { fetchStats(); if (tab === 'ventas') fetchVentas() }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* Error de DB visible */}
      {dbError && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 13, color: '#dc2626', fontFamily: 'monospace' }}>
          ⚠ {dbError}
        </div>
      )}

      {/* Stats del día */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Ventas hoy',       value: statsHoy.ventas,          color: '#059669', bg: '#ecfdf5' },
          { label: 'Total del día',    value: fmt$(statsHoy.total),     color: '#2563eb', bg: '#eff6ff' },
          { label: 'Por cortar',       value: statsHoy.pendCorte,       color: statsHoy.pendCorte > 0 ? '#d97706' : '#059669', bg: statsHoy.pendCorte > 0 ? '#fffbeb' : '#ecfdf5' },
        ].map(c => (
          <div key={c.label} className="card" style={{ flex: '1 1 140px', maxWidth: 220, padding: '12px 16px', background: c.bg, border: `1px solid ${c.color}22` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20, flexWrap: 'wrap' }}>
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
              marginBottom: -1, whiteSpace: 'nowrap',
            }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB: PUNTO DE VENTA ──────────────────────────── */}
      {tab === 'pos' && (
        <div>
          {/* Centros de venta */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Centro de Venta</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {centros.map(c => (
                <button key={c.id} onClick={() => setCentroActivo(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', border: `2px solid ${centroActivo?.id === c.id ? '#059669' : '#e2e8f0'}`, borderRadius: 12, background: centroActivo?.id === c.id ? '#ecfdf5' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <Store size={16} style={{ color: centroActivo?.id === c.id ? '#059669' : '#94a3b8' }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: centroActivo?.id === c.id ? '#065f46' : '#1e293b' }}>{c.nombre}</div>
                    {c.descripcion && <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.descripcion}</div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Acciones del centro */}
          {centroActivo && puedeEscribir && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => setShowVenta(true)} className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px', fontSize: 14, fontWeight: 700, background: '#059669' }}>
                <Plus size={16} /> Nueva Venta — {centroActivo.nombre}
              </button>
              <button onClick={() => setShowCorte(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 24px', fontSize: 13, fontWeight: 600, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#475569', cursor: 'pointer' }}>
                <Scissors size={14} /> Corte de Caja
              </button>
            </div>
          )}
          {!centroActivo && (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
              <Store size={32} style={{ margin: '0 auto 10px' }} />
              <div>Selecciona un centro de venta para comenzar</div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: HISTORIAL ───────────────────────────────── */}
      {tab === 'ventas' && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar cliente o folio…" value={busquedaV} onChange={e => setBusquedaV(e.target.value)} />
              {busquedaV && <button onClick={() => setBusquedaV('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }} />
            <select value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">Todos los centros</option>
              {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
              <option value="">Todos</option>
              <option value="PAGADA">Pagada</option>
              <option value="CANCELADA">Cancelada</option>
            </select>
          </div>

          {loadingV ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
          ) : ventasF.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <History size={32} style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 500 }}>Sin ventas en este período</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ventasF.map(v => {
                const abierto = expandidoV === v.id
                const centro  = centros.find(c => c.id === v.id_centro_fk)
                const cancelada = v.status === 'CANCELADA'
                return (
                  <div key={v.id} className="card" style={{ padding: 0, overflow: 'hidden', opacity: cancelada ? 0.6 : 1, borderLeft: `4px solid ${cancelada ? '#e2e8f0' : '#059669'}` }}>
                    <div onClick={() => setExpandidoV(abierto ? null : v.id)}
                      style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flexWrap: 'wrap' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                      <div style={{ color: '#94a3b8', flexShrink: 0 }}>
                        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0, minWidth: 60 }}>
                        #{String(v.id).padStart(6, '0')}<br />
                        <span style={{ color: '#64748b' }}>Día {v.folio_dia}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{v.nombre_cliente}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                          {fmtDT(v.fecha)}
                          {centro && <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{centro.nombre}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: cancelada ? '#f8fafc' : '#ecfdf5', color: cancelada ? '#64748b' : '#15803d', fontWeight: 600 }}>
                          {v.status}
                        </span>
                        {!v.id_corte_fk && !cancelada && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: '#fffbeb', color: '#d97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <AlertCircle size={9} /> Por cortar
                          </span>
                        )}
                        <span style={{ fontSize: 15, fontWeight: 800, color: cancelada ? '#94a3b8' : '#1e293b' }}>{fmt$(v.total)}</span>
                      </div>
                    </div>
                    {abierto && (
                      <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 16px', background: '#fafafa', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, color: '#64748b', flex: 1 }}>
                          {v.usuario_crea && <span>Cajero: <strong>{v.usuario_crea}</strong></span>}
                          {v.num_impresiones > 0 && <span style={{ marginLeft: 12, color: '#94a3b8' }}>🖨 {v.num_impresiones}× impreso</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => reimprimirTicket(v)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                            <Printer size={11} /> {v.num_impresiones > 0 ? 'Reimprimir' : 'Ticket'}
                          </button>
                          {!cancelada && (authUser?.rol === 'superadmin' || authUser?.rol === 'admin') && (
                            <button onClick={() => cancelarVenta(v.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                              <Ban size={11} /> Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Total del filtro */}
              <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {ventasF.filter(v => v.status === 'PAGADA').length} venta{ventasF.filter(v => v.status === 'PAGADA').length !== 1 ? 's' : ''} ·
                <span style={{ fontWeight: 700, color: '#059669', marginLeft: 6 }}>
                  {fmt$(ventasF.filter(v => v.status === 'PAGADA').reduce((a, v) => a + v.total, 0))}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── TAB: CORTES ──────────────────────────────────── */}
      {tab === 'cortes' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-ghost" onClick={fetchCortes} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <RefreshCw size={12} /> Actualizar
            </button>
          </div>

          {loadingC ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
          ) : cortes.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <Scissors size={32} style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 500 }}>Sin cortes registrados</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Realiza un corte de caja desde el Punto de Venta</div>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                      {['Folio', 'Centro', 'Período', 'Ventas', 'Canceladas', 'Total Neto', 'Cajero', 'Recibo Ingreso', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cortes.map(c => {
                      const hasCentroIngreso = !!getCentroIngresoIdForCentroVenta(c.id_centro_fk)
                      return (
                      <tr key={c.id}
                        style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>#{String(c.id).padStart(4, '0')}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDT(c.fecha_corte)}</div>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {c.centro_nombre}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 12, color: '#475569' }}>{fmtD(c.fecha_inicio)}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>— {fmtD(c.fecha_fin)}</div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{c.num_ventas}</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {(c.num_canceladas ?? 0) > 0
                            ? <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{c.num_canceladas}</span>
                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#059669' }}>{fmt$(c.total_neto)}</span>
                          {c.total_cancelado > 0 && (
                            <div style={{ fontSize: 11, color: '#dc2626' }}>−{fmt$(c.total_cancelado)} cancelado</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                          {c.usuario ?? '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {c.id_recibo_ingreso ? (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#15803d', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              ✓ #{c.id_recibo_ingreso}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Sin recibo</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                            <button
                              onClick={() => imprimirCorte(c)}
                              title="Imprimir corte de caja"
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <Printer size={11} /> Imprimir
                            </button>
                            {!c.id_recibo_ingreso && puedeEscribir && (
                              <button
                                onClick={() => generarReciboCorte(c)}
                                disabled={generandoRecibo === c.id || !hasCentroIngreso}
                                title="Generar recibo de ingreso"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', opacity: (generandoRecibo === c.id || !hasCentroIngreso) ? 0.5 : 1 }}>
                                {generandoRecibo === c.id ? <Loader size={11} /> : <Receipt size={11} />}
                                {generandoRecibo === c.id ? 'Generando…' : 'Recibo'}
                              </button>
                            )}
                            {!c.id_recibo_ingreso && !hasCentroIngreso && (
                              <span style={{ fontSize: 10, color: '#dc2626', whiteSpace: 'nowrap' }}>
                                Sin mapeo POS
                              </span>
                            )}
                            {c.id_recibo_ingreso && (
                              <button
                                onClick={() => alert(`Recibo de ingreso #${c.id_recibo_ingreso} ya generado. Puedes consultarlo en el módulo de Ingresos.`)}
                                title="Ver recibo de ingreso"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <FileText size={11} /> Recibo #{c.id_recibo_ingreso}
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
            </div>
          )}
        </>
      )}

      {/* ── TAB: CONFIGURACIÓN ───────────────────────────── */}
      {tab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {loadingCfg ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
          ) : (
            <>
              {/* Datos del ticket */}
              <div className="card" style={{ padding: 20, maxWidth: 600 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 14 }}>Datos del Ticket / Club</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {([
                    { k: 'razon_social', label: 'Razón Social' },
                    { k: 'rfc',          label: 'RFC' },
                    { k: 'municipio',    label: 'Municipio / Estado' },
                    { k: 'telefono',     label: 'Teléfono' },
                  ] as { k: keyof CfgPos; label: string }[]).map(f => (
                    <div key={f.k}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>{f.label}</label>
                      <input value={(cfgForm[f.k] as string) ?? ''} onChange={e => setCfgForm(p => ({ ...p, [f.k]: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Dirección</label>
                    <input value={(cfgForm.direccion as string) ?? ''} onChange={e => setCfgForm(p => ({ ...p, direccion: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Leyenda del ticket</label>
                    <input value={(cfgForm.leyenda_ticket as string) ?? ''} onChange={e => setCfgForm(p => ({ ...p, leyenda_ticket: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <button onClick={guardarCfg} disabled={savingCfg}
                  style={{ marginTop: 14, padding: '8px 18px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: savingCfg ? 0.6 : 1 }}>
                  {savingCfg ? 'Guardando…' : 'Guardar Datos'}
                </button>
              </div>

              {/* Centros de venta */}
              <div className="card" style={{ padding: 20, maxWidth: 600 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Centros de Venta</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {centros.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 20 }}>
                      <Store size={12} color="#059669" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#065f46' }}>{c.nombre}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={nuevoCentroNom} onChange={e => setNuevoCentroNom(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && agregarCentro()}
                    placeholder="Nombre del nuevo centro…"
                    style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={agregarCentro} disabled={!nuevoCentroNom.trim()}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: nuevoCentroNom.trim() ? 1 : 0.5 }}>
                    <Plus size={13} /> Agregar
                  </button>
                </div>
              </div>

              {/* Mapeo POS a Ingresos */}
              <div className="card" style={{ padding: 20, maxWidth: 760 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>Mapeo POS a Centro de Ingreso</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                  Define qué centro de ingreso se usa al generar recibos desde cortes de caja.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {centros.map(c => {
                    const m = getCentroIngresoMap(c.id)
                    return (
                      <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px' }}>
                        <div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>Centro POS</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{c.nombre}</div>
                        </div>
                        <select
                          value={m?.id_centro_ingreso_fk ?? ''}
                          onChange={e => guardarMapCentroIngreso(c.id, e.target.value ? Number(e.target.value) : null)}
                          style={{ width: '100%', padding: '7px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'inherit', outline: 'none', background: '#fff' }}>
                          <option value="">Sin asignar</option>
                          {centrosIngreso.map(ci => <option key={ci.id} value={ci.id}>{ci.nombre}</option>)}
                        </select>
                        <div style={{ minWidth: 90, textAlign: 'right', fontSize: 11, color: m ? '#15803d' : '#94a3b8', fontWeight: 600 }}>
                          {savingMap === c.id ? 'Guardando…' : (m ? 'Mapeado' : 'Pendiente')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Productos */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Productos y Servicios ({productos.length})</div>
                  {puedeEscribir && (
                    <button onClick={() => setEditingProd({ tipo: 'SERVICIO', aplica_iva: true, iva_pct: 16, activo: true, precio: 0, costo: 0, id_centro_fk: centros[0]?.id ?? null })}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer' }}>
                      <Plus size={13} /> Nuevo
                    </button>
                  )}
                </div>

                {/* Form edición */}
                {editingProd && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>
                      {editingProd.id ? 'Editar producto' : 'Nuevo producto / servicio'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                      {([
                        { k: 'nombre',      label: 'Nombre *',    type: 'text'   },
                        { k: 'sku',         label: 'SKU / Clave', type: 'text'   },
                        { k: 'precio',      label: 'Precio',      type: 'number' },
                        { k: 'costo',       label: 'Costo',       type: 'number' },
                        { k: 'iva_pct',     label: '% IVA',       type: 'number' },
                      ] as { k: keyof Producto; label: string; type: string }[]).map(f => (
                        <div key={f.k}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 3, display: 'block' }}>{f.label}</label>
                          <input type={f.type} value={(editingProd[f.k] as any) ?? ''}
                            onChange={e => setEditingProd(p => ({ ...p, [f.k]: f.type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      ))}
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 3, display: 'block' }}>Tipo</label>
                        <select value={editingProd.tipo ?? 'SERVICIO'} onChange={e => setEditingProd(p => ({ ...p, tipo: e.target.value }))}
                          style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'inherit', outline: 'none' }}>
                          <option value="SERVICIO">Servicio</option>
                          <option value="PRODUCTO">Producto</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 3, display: 'block' }}>Centro de Venta</label>
                        <select value={editingProd.id_centro_fk ?? ''} onChange={e => setEditingProd(p => ({ ...p, id_centro_fk: e.target.value ? Number(e.target.value) : null }))}
                          style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, fontFamily: 'inherit', outline: 'none' }}>
                          <option value="">— Todos —</option>
                          {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={editingProd.aplica_iva ?? true} onChange={e => setEditingProd(p => ({ ...p, aplica_iva: e.target.checked }))} />
                        Aplica IVA
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={editingProd.activo ?? true} onChange={e => setEditingProd(p => ({ ...p, activo: e.target.checked }))} />
                        Activo
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={guardarProducto} disabled={savingProd}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer' }}>
                        {savingProd ? <Loader size={12} /> : <Save size={12} />} Guardar
                      </button>
                      <button onClick={() => setEditingProd(null)}
                        style={{ padding: '7px 12px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
                    </div>
                  </div>
                )}

                {/* Lista de productos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {productos.map(p => {
                    const centro = centros.find(c => c.id === p.id_centro_fk)
                    return (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: '1px solid #f1f5f9', borderRadius: 8, background: p.activo ? '#fff' : '#f8fafc', opacity: p.activo ? 1 : 0.6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, marginTop: 1 }}>
                            {p.sku && <span>{p.sku}</span>}
                            {centro && <span>{centro.nombre}</span>}
                            <span style={{ padding: '1px 5px', borderRadius: 10, background: p.tipo === 'PRODUCTO' ? '#eff6ff' : '#ecfdf5', color: p.tipo === 'PRODUCTO' ? '#1d4ed8' : '#065f46', fontWeight: 600 }}>
                              {p.tipo === 'PRODUCTO' ? '📦' : '⚡'} {p.tipo === 'PRODUCTO' ? 'Producto' : 'Servicio'}
                            </span>
                            {p.aplica_iva && <span>+IVA {p.iva_pct}%</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', flexShrink: 0 }}>{fmt$(p.precio)}</div>
                        {puedeEscribir && (
                          <button onClick={() => setEditingProd(p)}
                            style={{ fontSize: 11, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}>
                            Editar
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {productos.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Sin productos configurados. Agrega el primero.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modales */}
      {showVenta && centroActivo && (
        <NuevaVentaModal
          idCentro={centroActivo.id}
          nombreCentro={centroActivo.nombre}
          onClose={() => setShowVenta(false)}
          onVentaGuardada={() => { fetchStats(); if (tab === 'ventas') fetchVentas() }}
        />
      )}
      {showCorte && centroActivo && (
        <CorteModal
          idCentro={centroActivo.id}
          nombreCentro={centroActivo.nombre}
          onClose={() => setShowCorte(false)}
          onSaved={() => { fetchStats(); if (tab === 'cortes') fetchCortes() }}
        />
      )}
    </div>
  )
}
