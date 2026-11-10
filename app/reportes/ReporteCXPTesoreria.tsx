'use client'
// Reporte con la misma estructura que /tesoreria/cxp (solo lectura):
// KPIs + filtros CC/Área/Frente/Proveedor + 4 vistas
// (Programación de Pago, Por Proveedor, Antigüedad de Saldos, Remesas de Pago).
import { useState, useCallback, useEffect, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { dbComp, dbCfg } from '@/lib/supabase'
import { RefreshCw, FileText, AlertTriangle, Clock, Calendar, ChevronRight, ChevronDown, Download } from 'lucide-react'
import { fmt, fmtFecha, StatusBadge } from '../compras/types'
import KpiCard from '@/components/ui/KpiCard'
import { PrintBar } from './utils'
import { useZonas, SelectZona } from '@/lib/zonas'

// ── Mismas reglas que la página de CXP ─────────────────────
const diasVencido = (fecha: string | null) => {
  if (!fecha) return 0
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}

const BANDAS = [
  { key: 'por_vencer', label: 'Por vencer', min: null as number | null, max: 0 as number | null,  color: '#15803d' },
  { key: '1_30',       label: '1-30 días',  min: 1,  max: 30,   color: '#d97706' },
  { key: '31_60',      label: '31-60 días', min: 31, max: 60,   color: '#ea580c' },
  { key: '61_90',      label: '61-90 días', min: 61, max: 90,   color: '#dc2626' },
  { key: '+90',        label: '+90 días',   min: 91, max: null, color: '#7f1d1d' },
]
const enBanda = (d: number, b: typeof BANDAS[number]) =>
  b.min === null ? d <= 0 : b.max === null ? d >= b.min : d >= b.min && d <= b.max

// Ciclo semanal: entra a CxP de martes a lunes → se paga el martes siguiente
const toDateOnly = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const cicloDePago = (fechaEntradaISO: string | null | undefined) => {
  if (!fechaEntradaISO) return null
  const entrada = toDateOnly(new Date(fechaEntradaISO))
  const offsetAMartes = (entrada.getDay() - 2 + 7) % 7
  const ventanaInicio = new Date(entrada); ventanaInicio.setDate(entrada.getDate() - offsetAMartes)
  const fechaPago = new Date(ventanaInicio); fechaPago.setDate(ventanaInicio.getDate() + 7)
  return { fechaPago }
}
const fmtCorta = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).replace('.', '')
const fmtLarga = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
const diasA = (d: Date) => Math.round((d.getTime() - toDateOnly(new Date()).getTime()) / 86400000)

type Tab = 'programacion' | 'resumen' | 'antiguedad' | 'remesas'
const TABS: { key: Tab; label: string }[] = [
  { key: 'programacion', label: 'Programación de Pago' },
  { key: 'resumen',      label: 'Por Proveedor' },
  { key: 'antiguedad',   label: 'Antigüedad de Saldos' },
  { key: 'remesas',      label: 'Remesas de Pago' },
]

type Linea = { id_area_fk: number | null; id_cuadrante_fk?: number | null; id_frente_fk: number | null; monto: number }

export default function ReporteCXPTesoreria() {
  const [tab, setTab]           = useState<Tab>('programacion')
  const [loading, setLoading]   = useState(true)
  const [ops, setOps]           = useState<any[]>([])
  const [proveedores, setProvs] = useState<any[]>([])
  const [centros, setCentros]   = useState<any[]>([])
  const [areas, setAreas]       = useState<any[]>([])
  const [frentes, setFrentes]   = useState<any[]>([])
  const [lineasOP, setLineasOP] = useState<Record<number, Linea[]>>({})
  const [remesas, setRemesas]   = useState<any[]>([])
  const [filterCC, setFilterCC]         = useState('')
  const [filterArea, setFilterArea]     = useState('')
  const [filtroZona, setFiltroZona] = useState('')
  const zonasCat = useZonas()
  // Zona es un nivel intermedio solo bajo el centro que la usa
  useEffect(() => { if (!zonasCat.ccUsaZonas(filterCC)) setFiltroZona('') }, [filterCC, zonasCat])
  const [filterFrente, setFilterFrente] = useState('')
  const [filterProv, setFilterProv]     = useState('')
  const [abiertos, setAbiertos]         = useState<Set<number>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: provs }, { data: allOps }, { data: ccs }, { data: ars }, { data: frs }, { data: remRows }] = await Promise.all([
      dbComp.from('proveedores').select('id, nombre, rfc').order('nombre'),
      dbComp.from('ordenes_pago').select('*')
        .neq('status', 'Cancelada')
        .neq('status', 'Pendiente Auth')
        .neq('status', 'Pendiente Auth Finanzas')
        .neq('status', 'Rechazada')
        .neq('status', 'Sustituida')
        .order('fecha_vencimiento'),
      dbCfg.from('centros_costo').select('id, nombre').order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').order('nombre'),
      dbCfg.from('frentes').select('id, nombre').order('nombre'),
      dbComp.from('cxp_pagos_remesa').select('*').order('created_at', { ascending: false }),
    ])
    setProvs(provs ?? [])
    setOps(allOps ?? [])
    setCentros(ccs ?? [])
    setAreas(ars ?? [])
    setFrentes(frs ?? [])

    // OP distribuidas: CC/Área/Frente viven en ordenes_pago_det
    const ids = (allOps ?? []).map((o: any) => o.id)
    const lm: Record<number, Linea[]> = {}
    for (let i = 0; i < ids.length; i += 200) {
      const { data: dets } = await dbComp.from('ordenes_pago_det')
        .select('*').in('id_op_fk', ids.slice(i, i + 200)).limit(5000)
      ;(dets ?? []).forEach((d: any) => { (lm[d.id_op_fk] ??= []).push({ id_area_fk: d.id_area_fk, id_cuadrante_fk: d.id_cuadrante_fk ?? null, id_frente_fk: d.id_frente_fk, monto: Number(d.monto) || 0 }) })
    }
    setLineasOP(lm)

    // Remesas: # de OPs aplicadas y sus ids (para filtrar por CC/Área/Frente)
    const remIds = (remRows ?? []).map((r: any) => r.id)
    const countMap: Record<number, number> = {}
    const opIdsMap: Record<number, number[]> = {}
    for (let i = 0; i < remIds.length; i += 200) {
      const { data: abonos } = await dbComp.from('cxp_abonos')
        .select('id_remesa_fk, id_op_fk').in('id_remesa_fk', remIds.slice(i, i + 200)).eq('status', 'Aplicado')
      ;(abonos ?? []).forEach((a: any) => {
        countMap[a.id_remesa_fk] = (countMap[a.id_remesa_fk] ?? 0) + 1
        ;(opIdsMap[a.id_remesa_fk] ??= []).push(a.id_op_fk)
      })
    }
    setRemesas((remRows ?? []).map((r: any) => ({ ...r, _numOps: countMap[r.id] ?? 0, _opIds: opIdsMap[r.id] ?? [] })))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const provMap = useMemo(() => {
    const m: Record<number, any> = {}
    proveedores.forEach(p => { m[p.id] = p })
    return m
  }, [proveedores])
  const areaCC = useMemo(() => {
    const m: Record<number, number> = {}
    areas.forEach(a => { m[a.id] = a.id_centro_costo_fk })
    return m
  }, [areas])
  const areasFiltro = (filterCC ? areas.filter(a => a.id_centro_costo_fk === Number(filterCC)) : areas).filter(a => zonasCat.areaEnZona(filtroZona, a.id))
  const hayFiltro = !!(filterCC || filtroZona || filterArea || filterFrente || filterProv)

  // Fracción del saldo que corresponde a los filtros CC/Área/Frente (igual que la página CXP)
  const fraccionOP = useCallback((o: any) => {
    if (!filterCC && !filtroZona && !filterArea && !filterFrente) return 1
    const ok = (cc: number | null | undefined, area: number | null, frente: number | null, zona?: number | null) =>
      (!filterCC || cc === Number(filterCC)) &&
      (!filtroZona || zonasCat.docEnZona(filtroZona, { id_cuadrante_fk: zona, id_area_fk: area })) &&
      (!filterArea || area === Number(filterArea)) &&
      (!filterFrente || frente === Number(filterFrente))
    const lineas = lineasOP[o.id] ?? []
    if (lineas.length === 0) {
      return ok(o.id_centro_costo_fk ?? (o.id_area_fk ? areaCC[o.id_area_fk] : null), o.id_area_fk, o.id_frente_fk, o.id_cuadrante_fk) ? 1 : 0
    }
    const total = lineas.reduce((a, l) => a + l.monto, 0) || Number(o.monto ?? 0) || 1
    return lineas.reduce((a, l) => {
      const cc = l.id_area_fk != null ? (areaCC[l.id_area_fk] ?? o.id_centro_costo_fk) : o.id_centro_costo_fk
      return ok(cc, l.id_area_fk, l.id_frente_fk, l.id_cuadrante_fk) ? a + l.monto / total : a
    }, 0)
  }, [filterCC, filtroZona, zonasCat, filterArea, filterFrente, areaCC, lineasOP])
  const sd = useCallback((o: any) => Number(o.saldo ?? o.monto ?? 0) * fraccionOP(o), [fraccionOP])

  const opsFiltradas = useMemo(
    () => ops.filter(o => fraccionOP(o) > 0 && (!filterProv || o.id_proveedor_fk === Number(filterProv))),
    [ops, fraccionOP, filterProv])
  const opsPendientes = useMemo(() => opsFiltradas.filter(o => o.status !== 'Pagada'), [opsFiltradas])

  const totalPorPagar  = opsPendientes.reduce((a, o) => a + sd(o), 0)
  const totalVencido   = opsPendientes.filter(o => diasVencido(o.fecha_vencimiento) > 0).reduce((a, o) => a + sd(o), 0)
  const totalPorVencer = totalPorPagar - totalVencido

  const gruposPago = useMemo(() => {
    const map = new Map<string, { fechaPago: Date; ops: any[]; total: number }>()
    opsPendientes.forEach(o => {
      const ciclo = cicloDePago(o.fecha_autorizacion || o.created_at)
      if (!ciclo) return
      const key = ciclo.fechaPago.toISOString().slice(0, 10)
      if (!map.has(key)) map.set(key, { fechaPago: ciclo.fechaPago, ops: [], total: 0 })
      const g = map.get(key)!
      g.ops.push(o)
      g.total += sd(o)
    })
    return Array.from(map.values()).sort((a, b) => a.fechaPago.getTime() - b.fechaPago.getTime())
  }, [opsPendientes, sd])
  const proximoPago = gruposPago[0] ?? null
  const proximoDiff = proximoPago ? diasA(proximoPago.fechaPago) : null
  const proximoColor = proximoDiff === null ? '#94a3b8' : proximoDiff < 0 ? '#dc2626' : proximoDiff === 0 ? '#15803d' : '#3F4A75'

  const porProveedor = useMemo(() => {
    const m = new Map<number, { id: number; nombre: string; rfc: string | null; ops: any[]; saldo: number; vencido: number }>()
    opsPendientes.forEach(o => {
      const p = provMap[o.id_proveedor_fk]
      const id = o.id_proveedor_fk ?? 0
      if (!m.has(id)) m.set(id, { id, nombre: p?.nombre ?? 'Sin proveedor', rfc: p?.rfc ?? null, ops: [], saldo: 0, vencido: 0 })
      const r = m.get(id)!
      r.ops.push(o)
      r.saldo += sd(o)
      if (diasVencido(o.fecha_vencimiento) > 0) r.vencido += sd(o)
    })
    return Array.from(m.values()).sort((a, b) => b.saldo - a.saldo)
  }, [opsPendientes, provMap, sd])

  const antiguedad = useMemo(() => BANDAS.map(b => {
    const lista = opsPendientes.filter(o => enBanda(diasVencido(o.fecha_vencimiento), b))
    return { ...b, ops: lista, count: lista.length, total: lista.reduce((a, o) => a + sd(o), 0) }
  }), [opsPendientes, sd])

  const remesasFiltradas = useMemo(() => {
    let r = remesas
    if (filterProv) r = r.filter(x => x.id_proveedor_fk === Number(filterProv))
    if (filterCC || filtroZona || filterArea || filterFrente) {
      const okIds = new Set(opsFiltradas.map(o => o.id))
      r = r.filter(x => (x._opIds ?? []).some((id: number) => okIds.has(id)))
    }
    return r
  }, [remesas, opsFiltradas, filterProv, filterCC, filtroZona, filterArea, filterFrente])
  const totalRemesas = remesasFiltradas.filter(r => r.status !== 'Cancelada').reduce((a, r) => a + Number(r.monto_total ?? 0), 0)

  const provNombre = (id: number | null) => (id != null ? provMap[id]?.nombre : null) ?? '—'
  const countTab = tab === 'remesas' ? remesasFiltradas.length : tab === 'resumen' ? porProveedor.length : opsPendientes.length
  const tabLabel = TABS.find(t => t.key === tab)!.label

  const filtrosTexto = [
    filterCC && `CC: ${centros.find(c => c.id === Number(filterCC))?.nombre}`,
    filtroZona && `Zona: ${zonasCat.zonas.find(z => z.id === Number(filtroZona))?.nombre}`,
    filterArea && `Área: ${areas.find(a => a.id === Number(filterArea))?.nombre}`,
    filterFrente && `Frente: ${frentes.find(f => f.id === Number(filterFrente))?.nombre}`,
    filterProv && `Proveedor: ${provNombre(Number(filterProv))}`,
  ].filter(Boolean).join(' · ')

  const toggleProv = (id: number) => setAbiertos(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todosAbiertos = porProveedor.length > 0 && porProveedor.every(p => abiertos.has(p.id))

  // ── Excel: una hoja por vista + resumen ──────────────────
  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()
    const r2 = (n: number) => Math.round(n * 100) / 100

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Cuentas por Pagar — Resumen'],
      ['Fecha', new Date().toLocaleDateString('es-MX')],
      ['Filtros', filtrosTexto || 'Ninguno'],
      [],
      ['Total por Pagar', r2(totalPorPagar)],
      ['Vencido', r2(totalVencido)],
      ['Por Vencer', r2(totalPorVencer)],
      ['Próximo Pago', proximoPago ? `Martes ${fmtLarga(proximoPago.fechaPago)}` : '—', proximoPago ? r2(proximoPago.total) : 0],
      [],
      ['Banda', '# OPs', 'Saldo', '%'],
      ...antiguedad.map(b => [b.label, b.count, r2(b.total), totalPorPagar > 0 ? r2(b.total / totalPorPagar * 100) : 0]),
    ]), 'Resumen')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gruposPago.flatMap(g => g.ops.map(o => ({
      'Día de pago': fmtLarga(g.fechaPago),
      'Folio': o.folio, 'Proveedor': provNombre(o.id_proveedor_fk), 'Concepto': o.concepto ?? '',
      'Entró a CxP': fmtFecha(o.fecha_autorizacion || o.created_at),
      'Saldo': r2(sd(o)), 'Status': o.status,
    })))), 'Programación de Pago')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porProveedor.map(p => ({
      'Proveedor': p.nombre, 'RFC': p.rfc ?? '', 'OPs': p.ops.length,
      'Saldo Pendiente': r2(p.saldo), 'Vencido': r2(p.vencido),
    }))), 'Por Proveedor')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(antiguedad.flatMap(b => b.ops.map(o => {
      const ciclo = cicloDePago(o.fecha_autorizacion || o.created_at)
      return {
        'Banda': b.label, 'Folio': o.folio, 'Proveedor': provNombre(o.id_proveedor_fk), 'Concepto': o.concepto ?? '',
        'Vencimiento': fmtFecha(o.fecha_vencimiento), 'Días': diasVencido(o.fecha_vencimiento),
        'Saldo': r2(sd(o)), 'Día de Pago': ciclo ? fmtLarga(ciclo.fechaPago) : '', 'Status': o.status,
      }
    }))), 'Antigüedad')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(remesasFiltradas.map(r => ({
      'Folio': r.folio, 'Proveedor': provNombre(r.id_proveedor_fk), '# OPs': r._numOps,
      'Fecha de Pago': fmtFecha(r.fecha_pago), 'Monto Total': r2(Number(r.monto_total ?? 0)), 'Status': r.status,
    }))), 'Remesas')

    XLSX.writeFile(wb, `Cuentas-por-Pagar_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const th: React.CSSProperties = { textAlign: 'right' }
  const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const folio: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }
  const concepto: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', maxWidth: 240 }

  return (
    <div>
      <PrintBar
        title={`CXP-${tabLabel.replace(/\s+/g, '-')}`}
        count={countTab}
        reportTitle={`Cuentas por Pagar — ${tabLabel}${filtrosTexto ? ` (${filtrosTexto})` : ''}`}
        hideCSV
        extra={
          <button className="btn-secondary" onClick={exportarExcel} disabled={loading}>
            <Download size={13} /> Exportar Excel
          </button>
        }
      />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select className="input" style={{ width: 200 }} value={filterCC}
          onChange={e => { setFilterCC(e.target.value); setFilterArea('') }}>
          <option value="">Todos los CC</option>
          {centros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {zonasCat.ccUsaZonas(filterCC) && <SelectZona className="input" zonas={zonasCat.zonas} value={filtroZona} onChange={v => { setFiltroZona(v); setFilterArea('') }} />}
        <select className="input" style={{ width: 200 }} value={filterArea} onChange={e => setFilterArea(e.target.value)}>
          <option value="">Todas las áreas</option>
          {areasFiltro.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="input" style={{ width: 200 }} value={filterFrente} onChange={e => setFilterFrente(e.target.value)}>
          <option value="">Todos los frentes</option>
          {frentes.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
        </select>
        <select className="input" style={{ width: 240 }} value={filterProv} onChange={e => setFilterProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {hayFiltro && (
          <button className="btn-ghost" onClick={() => { setFilterCC(''); setFiltroZona(''); setFilterArea(''); setFilterFrente(''); setFilterProv('') }}>Limpiar filtros</button>
        )}
        <button className="btn-ghost" onClick={fetchData} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-body)', fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div id="reporte-print-area">
        {/* KPIs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          {[
            <KpiCard key="t" label="Total por Pagar" value={fmt(totalPorPagar)} color="#3F4A75" icon={FileText} />,
            <KpiCard key="v" label="Vencido" value={fmt(totalVencido)} color="#dc2626" icon={AlertTriangle} />,
            <KpiCard key="p" label="Por Vencer" value={fmt(totalPorVencer)} color="#d97706" icon={Clock} />,
            <KpiCard key="n"
              label={proximoPago ? `Próx. Pago · Martes ${fmtCorta(proximoPago.fechaPago)}` : 'Próx. Pago'}
              value={proximoPago ? fmt(proximoPago.total) : '—'} color={proximoColor} icon={Calendar} />,
          ].map((k, i) => <div key={i} style={{ flex: '1 1 200px' }}>{k}</div>)}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></div>
        ) : (
          <>
            {/* ── Programación de Pago ── */}
            {tab === 'programacion' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {gruposPago.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin OPs pendientes de pago</div>
                ) : (
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table id="reporte-table">
                        <thead>
                          <tr><th>Folio</th><th>Proveedor</th><th>Concepto</th><th>Entró a CxP</th><th style={th}>Saldo</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {gruposPago.map(g => {
                            const diff = diasA(g.fechaPago)
                            const estado = diff < 0 ? { label: 'Atrasado', color: '#b91c1c' }
                              : diff === 0 ? { label: 'Se paga HOY', color: '#15803d' }
                              : { label: `En ${diff} día${diff === 1 ? '' : 's'}`, color: '#b45309' }
                            return [
                              <tr key={`h-${g.fechaPago.toISOString()}`} style={{ background: '#f8fafc' }}>
                                <td colSpan={4} style={{ fontWeight: 700 }}>
                                  Martes {fmtLarga(g.fechaPago)}
                                  <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: estado.color }}>{estado.label}</span>
                                  <span style={{ marginLeft: 10, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{g.ops.length} OP{g.ops.length === 1 ? '' : "'s"}</span>
                                </td>
                                <td style={{ ...num, fontWeight: 700, color: 'var(--blue)' }}>{fmt(g.total)}</td>
                                <td></td>
                              </tr>,
                              ...g.ops.map(op => (
                                <tr key={op.id}>
                                  <td style={folio}>{op.folio}</td>
                                  <td style={{ fontSize: 13 }}>{provNombre(op.id_proveedor_fk)}</td>
                                  <td style={concepto}>{op.concepto ?? '—'}</td>
                                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(op.fecha_autorizacion || op.created_at)}</td>
                                  <td style={num}>{fmt(sd(op))}</td>
                                  <td><StatusBadge status={op.status} /></td>
                                </tr>
                              )),
                            ]
                          })}
                          <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                            <td colSpan={4} style={{ color: 'var(--blue)' }}>TOTAL</td>
                            <td style={{ ...num, color: 'var(--blue)' }}>{fmt(totalPorPagar)}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Por Proveedor ── */}
            {tab === 'resumen' && (
              porProveedor.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin saldos pendientes por proveedor</div>
              ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ fontSize: 12 }}
                      onClick={() => setAbiertos(todosAbiertos ? new Set() : new Set(porProveedor.map(p => p.id)))}>
                      {todosAbiertos ? 'Colapsar todo' : 'Expandir todo'}
                    </button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table id="reporte-table">
                      <thead>
                        <tr><th>Proveedor</th><th>RFC</th><th style={th}>OPs</th><th style={th}>Saldo Pendiente</th><th style={th}>Vencido</th></tr>
                      </thead>
                      <tbody>
                        {porProveedor.map(p => {
                          const open = abiertos.has(p.id)
                          return [
                            <tr key={`p-${p.id}`} style={{ cursor: 'pointer' }} onClick={() => toggleProv(p.id)}>
                              <td style={{ fontWeight: 600 }}>
                                {open ? <ChevronDown size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> : <ChevronRight size={13} style={{ verticalAlign: -2, marginRight: 4 }} />}
                                {p.nombre}
                              </td>
                              <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{p.rfc ?? '—'}</td>
                              <td style={{ ...num, fontSize: 13 }}>{p.ops.length}</td>
                              <td style={{ ...num, fontWeight: 700, color: 'var(--blue)' }}>{fmt(p.saldo)}</td>
                              <td style={{ ...num, color: p.vencido > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: p.vencido > 0 ? 600 : 400 }}>{p.vencido > 0 ? fmt(p.vencido) : '—'}</td>
                            </tr>,
                            ...(open ? p.ops.map(op => {
                              const venc = diasVencido(op.fecha_vencimiento) > 0
                              return (
                                <tr key={`o-${op.id}`} style={{ background: '#fafbfc' }}>
                                  <td style={{ ...folio, paddingLeft: 32 }}>{op.folio}</td>
                                  <td style={concepto}>{op.concepto ?? '—'}</td>
                                  <td style={{ ...num, fontSize: 12, color: venc ? '#dc2626' : 'var(--text-muted)' }}>{fmtFecha(op.fecha_vencimiento)}</td>
                                  <td style={num}>{fmt(sd(op))}</td>
                                  <td style={{ textAlign: 'right' }}><StatusBadge status={op.status} /></td>
                                </tr>
                              )
                            }) : []),
                          ]
                        })}
                        <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                          <td colSpan={2} style={{ color: 'var(--blue)' }}>TOTAL</td>
                          <td style={num}>{opsPendientes.length}</td>
                          <td style={{ ...num, color: 'var(--blue)' }}>{fmt(totalPorPagar)}</td>
                          <td style={{ ...num, color: totalVencido > 0 ? '#dc2626' : 'var(--text-muted)' }}>{totalVencido > 0 ? fmt(totalVencido) : '—'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {/* ── Antigüedad de Saldos ── */}
            {tab === 'antiguedad' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="card" style={{ padding: '20px 24px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Distribución de Saldos</div>
                  {antiguedad.map(b => {
                    const pct = totalPorPagar > 0 ? (b.total / totalPorPagar) * 100 : 0
                    return (
                      <div key={b.key} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: b.color }}>{b.label}</span>
                          <div style={{ display: 'flex', gap: 16 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.count} OPs · {pct.toFixed(1)}%</span>
                            <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: b.color }}>{fmt(b.total)}</span>
                          </div>
                        </div>
                        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: b.color, borderRadius: 4 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {opsPendientes.length > 0 && (
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table id="reporte-table">
                        <thead>
                          <tr><th>Folio OP</th><th>Proveedor</th><th>Concepto</th><th>Vencimiento</th><th style={th}>Días</th><th style={th}>Saldo</th><th>Día de Pago</th></tr>
                        </thead>
                        <tbody>
                          {antiguedad.filter(b => b.count > 0).map(b => [
                            <tr key={`b-${b.key}`} style={{ background: '#f8fafc' }}>
                              <td colSpan={5} style={{ fontWeight: 700, color: b.color }}>
                                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: b.color, marginRight: 8 }} />
                                {b.label} <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>· {b.count} documentos</span>
                              </td>
                              <td style={{ ...num, fontWeight: 700, color: b.color }}>{fmt(b.total)}</td>
                              <td></td>
                            </tr>,
                            ...b.ops.map(op => {
                              const ciclo = cicloDePago(op.fecha_autorizacion || op.created_at)
                              return (
                                <tr key={op.id}>
                                  <td style={folio}>{op.folio}</td>
                                  <td style={{ fontSize: 13 }}>{provNombre(op.id_proveedor_fk)}</td>
                                  <td style={concepto}>{op.concepto ?? '—'}</td>
                                  <td style={{ fontSize: 12, color: b.color, fontWeight: 600 }}>{fmtFecha(op.fecha_vencimiento)}</td>
                                  <td style={{ ...num, fontSize: 12 }}>{diasVencido(op.fecha_vencimiento)}</td>
                                  <td style={num}>{fmt(sd(op))}</td>
                                  <td style={{ fontSize: 12, color: ciclo && diasA(ciclo.fechaPago) < 0 ? '#b91c1c' : 'var(--text-muted)' }}>
                                    {ciclo ? `Martes ${fmtCorta(ciclo.fechaPago)}` : '—'}
                                  </td>
                                </tr>
                              )
                            }),
                          ])}
                          <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                            <td colSpan={5} style={{ color: 'var(--blue)' }}>TOTAL</td>
                            <td style={{ ...num, color: 'var(--blue)' }}>{fmt(totalPorPagar)}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Remesas de Pago ── */}
            {tab === 'remesas' && (
              remesasFiltradas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin remesas de pago registradas</div>
              ) : (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table id="reporte-table">
                      <thead>
                        <tr><th>Folio</th><th>Proveedor</th><th style={th}># OPs</th><th>Fecha de Pago</th><th style={th}>Monto Total</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {remesasFiltradas.map(r => {
                          const ok = r.status === 'Aplicado'
                          return (
                            <tr key={r.id}>
                              <td style={folio}>{r.folio}</td>
                              <td style={{ fontSize: 13 }}>{provNombre(r.id_proveedor_fk)}</td>
                              <td style={num}>{r._numOps}</td>
                              <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(r.fecha_pago)}</td>
                              <td style={{ ...num, fontWeight: 700, color: r.status === 'Cancelada' ? 'var(--text-muted)' : 'var(--blue)' }}>{fmt(r.monto_total)}</td>
                              <td>
                                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                                  background: ok ? '#f0fdf4' : '#f1f5f9', color: ok ? '#15803d' : '#64748b',
                                  border: `1px solid ${ok ? '#bbf7d0' : '#e2e8f0'}` }}>{r.status}</span>
                              </td>
                            </tr>
                          )
                        })}
                        <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                          <td colSpan={4} style={{ color: 'var(--blue)' }}>TOTAL (sin canceladas)</td>
                          <td style={{ ...num, color: 'var(--blue)' }}>{fmt(totalRemesas)}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
