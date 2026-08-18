'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { PrintBar } from './utils'
import ModalShell from '@/components/ui/ModalShell'
import { RefreshCw, Filter, ChevronDown, ChevronRight, FileSpreadsheet, LayoutList, Grid3x3, Pencil, Tag, Save, Loader } from 'lucide-react'
import * as XLSX from 'xlsx'

const STATUS_OP = ['Pendiente Auth', 'Pendiente Auth Finanzas', 'Pendiente', 'Pagada', 'Rechazada', 'Sustituida', 'Cancelada'] as const

// Sincronizado con app/compras/ordenes-pago/page.tsx
const TIPOS_GASTO = [
  'Agua', 'Arrendamiento', 'Asesoría', 'Capacitación', 'Comisiones Bancarias', 'Combustible',
  'Depósitos en Garantía (Fianzas)', 'Desazolves', 'Electricidad', 'Finiquitos y Liquidaciones', 'Fonacot',
  'Gasto Operativo Eventos', 'Honorarios',
  'Impuestos Estatales', 'Impuestos Federales', 'IMSS', 'Intercompañías BPCC', 'Intercompañías OOB', 'Intercompañías RBA', 'Licencias de Software', 'Mantenimiento de Instalaciones e Infraestructura', 'Mantenimiento de Vehículos',
  'Nómina Semanal', 'Nómina Quincenal', 'Otro', 'Pagos a Personal Externo', 'Perimetrales', 'PTU', 'Publicidad',
  'Recolección de Basura', 'Renta de Mobiliario y Equipo', 'Reparación', 'Seguros', 'Servicios de Vigilancia',
  'Servicios Profesionales', 'Telefonía / Internet', 'Vales Despensa',
]

const statusColor = (s: string) =>
  s === 'Pagada'         ? '#15803d' :
  s === 'Pendiente'      ? '#d97706' :
  s === 'Pendiente Auth' ? '#7c3aed' :
  s === 'Pendiente Auth Finanzas' ? '#6d28d9' :
  s === 'Rechazada'      ? '#dc2626' :
  s === 'Sustituida'     ? '#64748b' :
  s === 'Cancelada'      ? '#64748b' : '#64748b'

type OP = {
  id: number
  folio: string
  concepto: string | null
  tipo_gasto: string | null
  monto: number | null
  saldo: number | null
  fecha_op: string | null
  fecha_vencimiento: string | null
  status: string
  id_proveedor_fk: number | null
  id_centro_costo_fk: number | null
  id_area_fk: number | null
  id_frente_fk: number | null
  id_oc_fk: number | null
  reclasificado_por: string | null
  fecha_reclasificacion: string | null
}

type TipoBucket = {
  nombre: string
  total: number
  pagado: number
  saldo: number
  docs: number
  ops: OP[]
}

type Tab = 'jerarquico' | 'matriz'

export default function ReporteOPsPorTipoGasto() {
  const { authUser } = useAuth()
  const esSuperadmin = authUser?.rol === 'superadmin'

  const [ops, setOps]               = useState<OP[]>([])
  const [centrosCosto, setCentros]  = useState<{ id: number; nombre: string }[]>([])
  const [areas, setAreas]           = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [frentes, setFrentes]       = useState<{ id: number; nombre: string }[]>([])
  const [relAF, setRelAF]           = useState<{ id_area: number; id_frente: number }[]>([])
  const [provs, setProvs]           = useState<{ id: number; nombre: string }[]>([])
  const [provMap, setProvMap]       = useState<Record<number, string>>({})
  const [loading, setLoading]       = useState(true)

  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [filtroCC, setFiltroCC]         = useState<string>('')
  const [filtroArea, setFiltroArea]     = useState<string>('')
  const [filtroProv, setFiltroProv]     = useState<string>('')
  const [filtroTipo, setFiltroTipo]     = useState<string>('')
  const [filtroDe, setFiltroDe]         = useState<string>('')
  const [filtroA,  setFiltroA]          = useState<string>('')

  const [tab, setTab] = useState<Tab>('jerarquico')
  const [expandedTipo, setExpandedTipo] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ccs }, { data: ars }, { data: frs }, { data: raf }, { data: ps }, { data: opsData }, { data: junction }] = await Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre').order('nombre'),
      dbCfg.from('rel_area_frente').select('id_area, id_frente'),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
      dbComp.from('ordenes_pago')
        .select('id, folio, concepto, tipo_gasto, monto, saldo, fecha_op, fecha_vencimiento, status, id_proveedor_fk, id_centro_costo_fk, id_area_fk, id_frente_fk, id_oc_fk, reclasificado_por, fecha_reclasificacion')
        .order('fecha_op', { ascending: false }),
      dbComp.from('ordenes_pago_oc').select('id_op_fk'),
    ])

    setCentros((ccs ?? []) as any)
    setAreas((ars ?? []) as any)
    setFrentes((frs ?? []) as any)
    setRelAF((raf ?? []) as any)
    setProvs((ps ?? []) as any)
    const pm: Record<number, string> = {}
    ;(ps ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)

    // OPs "sin OC": ni FK directa en el encabezado, ni fila en la tabla puente ordenes_pago_oc
    const idsConOC = new Set<number>((junction ?? []).map((j: any) => j.id_op_fk))
    const sinOC = ((opsData ?? []) as OP[]).filter(op => op.id_oc_fk == null && !idsConOC.has(op.id))
    setOps(sinOC)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const ccMap   = useMemo(() => {
    const m: Record<number, string> = {}
    centrosCosto.forEach(c => { m[c.id] = c.nombre })
    return m
  }, [centrosCosto])

  const areaMap = useMemo(() => {
    const m: Record<number, { nombre: string; id_centro_costo_fk: number }> = {}
    areas.forEach(a => { m[a.id] = { nombre: a.nombre, id_centro_costo_fk: a.id_centro_costo_fk } })
    return m
  }, [areas])

  const areasDelCC = useMemo(
    () => filtroCC ? areas.filter(a => a.id_centro_costo_fk === Number(filtroCC)) : areas,
    [areas, filtroCC]
  )

  const opsFiltradas = useMemo(() => {
    return ops.filter(op => {
      if (filtroStatus && op.status !== filtroStatus) return false
      if (filtroCC     && op.id_centro_costo_fk !== Number(filtroCC)) return false
      if (filtroArea   && op.id_area_fk !== Number(filtroArea)) return false
      if (filtroProv   && op.id_proveedor_fk !== Number(filtroProv)) return false
      if (filtroTipo   && op.tipo_gasto !== filtroTipo) return false
      if (filtroDe     && (!op.fecha_op || op.fecha_op < filtroDe)) return false
      if (filtroA      && (!op.fecha_op || op.fecha_op > filtroA))  return false
      return true
    })
  }, [ops, filtroStatus, filtroCC, filtroArea, filtroProv, filtroTipo, filtroDe, filtroA])

  // Agrupar por Tipo de Gasto
  const grupos = useMemo(() => {
    const res: Record<string, TipoBucket> = {}
    for (const op of opsFiltradas) {
      const key    = op.tipo_gasto ?? 'sin-tipo'
      const nombre = op.tipo_gasto ?? 'Sin tipo de gasto'
      if (!res[key]) res[key] = { nombre, total: 0, pagado: 0, saldo: 0, docs: 0, ops: [] }

      const monto  = Number(op.monto ?? 0)
      const saldo  = Number(op.saldo ?? op.monto ?? 0)
      const pagado = monto - saldo

      const b = res[key]
      b.total += monto; b.saldo += saldo; b.pagado += pagado; b.docs += 1
      b.ops.push(op)
    }
    return Object.values(res).sort((a, b) => b.total - a.total)
  }, [opsFiltradas])

  // Matriz Tipo de Gasto × Centro de Costo
  const matriz = useMemo(() => {
    const colMap = new Map<string, { id: number | null; nombre: string }>()
    opsFiltradas.forEach(op => {
      const ccId  = op.id_centro_costo_fk
      const ccKey = ccId != null ? String(ccId) : 'sin-cc'
      if (!colMap.has(ccKey)) colMap.set(ccKey, { id: ccId, nombre: ccId != null ? (ccMap[ccId] ?? `Centro #${ccId}`) : 'Sin CC' })
    })
    const columnas = Array.from(colMap.entries())
      .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'))

    const filas = grupos.map(g => {
      const celdas: Record<string, number> = {}
      columnas.forEach(([key]) => { celdas[key] = 0 })
      g.ops.forEach(op => {
        const ccKey = op.id_centro_costo_fk != null ? String(op.id_centro_costo_fk) : 'sin-cc'
        celdas[ccKey] = (celdas[ccKey] ?? 0) + Number(op.monto ?? 0)
      })
      return { nombre: g.nombre, total: g.total, celdas }
    })

    const totalesCol: Record<string, number> = {}
    columnas.forEach(([key]) => {
      totalesCol[key] = filas.reduce((a, f) => a + (f.celdas[key] ?? 0), 0)
    })
    const totalGeneral = filas.reduce((a, f) => a + f.total, 0)

    return { columnas, filas, totalesCol, totalGeneral }
  }, [grupos, opsFiltradas, ccMap])

  const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

  const totalGeneral  = grupos.reduce((a, g) => a + g.total, 0)
  const pagadoGeneral = grupos.reduce((a, g) => a + g.pagado, 0)
  const saldoGeneral  = grupos.reduce((a, g) => a + g.saldo, 0)
  const docsTotal     = grupos.reduce((a, g) => a + g.docs, 0)

  const toggleTipo = (key: string) => setExpandedTipo(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })
  const expandAll   = () => setExpandedTipo(new Set(grupos.map(g => g.nombre)))
  const collapseAll = () => setExpandedTipo(new Set())

  // Reclasificar (solo superadmin) — mismo alcance y reglas que el panel del
  // modal de OP en app/compras/ordenes-pago/page.tsx: corrige CC/Área/Frente/
  // Tipo de Gasto sin importar status, nunca toca monto/saldo/pagos.
  const [reclasOp, setReclasOp]         = useState<OP | null>(null)
  const [reclasCC, setReclasCC]         = useState('')
  const [reclasArea, setReclasArea]     = useState('')
  const [reclasFrente, setReclasFrente] = useState('')
  const [reclasTipoGasto, setReclasTipoGasto] = useState('')
  const [reclasSaving, setReclasSaving] = useState(false)
  const [reclasError, setReclasError]   = useState('')

  const abrirReclasificar = (op: OP) => {
    setReclasOp(op)
    setReclasCC(op.id_centro_costo_fk?.toString() ?? '')
    setReclasArea(op.id_area_fk?.toString() ?? '')
    setReclasFrente(op.id_frente_fk?.toString() ?? '')
    setReclasTipoGasto(op.tipo_gasto ?? '')
    setReclasError('')
  }
  const cerrarReclasificar = () => { setReclasOp(null); setReclasError('') }

  // Update mínimo y explícito: SOLO estos 4 campos + auditoría. Nunca monto,
  // saldo, status, ni ningún campo de pago.
  const handleReclasificar = async () => {
    if (!reclasOp) return
    setReclasSaving(true); setReclasError('')
    const { error: err } = await dbComp.from('ordenes_pago').update({
      id_centro_costo_fk: reclasCC ? Number(reclasCC) : null,
      id_area_fk:         reclasArea ? Number(reclasArea) : null,
      id_frente_fk:        reclasFrente ? Number(reclasFrente) : null,
      tipo_gasto:          reclasTipoGasto || null,
      reclasificado_por:      authUser?.nombre ?? null,
      fecha_reclasificacion:  new Date().toISOString(),
    }).eq('id', reclasOp.id)
    setReclasSaving(false)
    if (err) { setReclasError(err.message); return }
    setReclasOp(null)
    fetchData()
  }

  // KPIs por status (ignora el filtro de status, respeta el resto)
  const opsParaKPIs = useMemo(() => {
    return ops.filter(op => {
      if (filtroCC   && op.id_centro_costo_fk !== Number(filtroCC)) return false
      if (filtroArea && op.id_area_fk !== Number(filtroArea)) return false
      if (filtroProv && op.id_proveedor_fk !== Number(filtroProv)) return false
      if (filtroTipo && op.tipo_gasto !== filtroTipo) return false
      if (filtroDe   && (!op.fecha_op || op.fecha_op < filtroDe)) return false
      if (filtroA    && (!op.fecha_op || op.fecha_op > filtroA))  return false
      return true
    })
  }, [ops, filtroCC, filtroArea, filtroProv, filtroTipo, filtroDe, filtroA])

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()

    const resumenRows: any[] = grupos.map(g => ({
      'Tipo de Gasto': g.nombre,
      '# OPs':         g.docs,
      'Monto Total':   g.total,
      'Pagado':        g.pagado,
      'Saldo':         g.saldo,
    }))
    resumenRows.push({})
    resumenRows.push({
      'Tipo de Gasto': 'TOTAL GENERAL',
      '# OPs':         docsTotal,
      'Monto Total':   totalGeneral,
      'Pagado':        pagadoGeneral,
      'Saldo':         saldoGeneral,
    })
    const ws1 = XLSX.utils.json_to_sheet(resumenRows)
    ws1['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

    const detalleRows = opsFiltradas.map(op => {
      const monto  = Number(op.monto ?? 0)
      const saldo  = Number(op.saldo ?? op.monto ?? 0)
      const ccNom  = op.id_centro_costo_fk != null ? (ccMap[op.id_centro_costo_fk] ?? `Centro #${op.id_centro_costo_fk}`) : 'Sin CC'
      const arNom  = op.id_area_fk != null ? (areaMap[op.id_area_fk]?.nombre ?? `Área #${op.id_area_fk}`) : 'Sin área'
      const provNom = op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? `#${op.id_proveedor_fk}`) : ''
      return {
        'Folio':           op.folio,
        'Tipo de Gasto':   op.tipo_gasto ?? 'Sin tipo de gasto',
        'Centro de Costo': ccNom,
        'Área':            arNom,
        'Proveedor':       provNom,
        'Concepto':        op.concepto ?? '',
        'Fecha OP':        op.fecha_op ?? '',
        'Fecha Venc.':     op.fecha_vencimiento ?? '',
        'Monto':           monto,
        'Pagado':          monto - saldo,
        'Saldo':           saldo,
        'Status':          op.status,
      }
    })
    const ws2 = XLSX.utils.json_to_sheet(detalleRows)
    ws2['!cols'] = [
      { wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 24 }, { wch: 32 },
      { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 14 },
    ]
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle')

    const header: any[] = ['Tipo de Gasto', ...matriz.columnas.map(([, v]) => v.nombre), 'TOTAL']
    const matRows: any[][] = [header]
    matriz.filas.forEach(f => {
      const row: any[] = [f.nombre]
      matriz.columnas.forEach(([key]) => row.push(f.celdas[key] ?? 0))
      row.push(f.total)
      matRows.push(row)
    })
    const totalRow: any[] = ['TOTAL CC']
    matriz.columnas.forEach(([key]) => totalRow.push(matriz.totalesCol[key] ?? 0))
    totalRow.push(matriz.totalGeneral)
    matRows.push(totalRow)
    const ws3 = XLSX.utils.aoa_to_sheet(matRows)
    ws3['!cols'] = [{ wch: 22 }, ...matriz.columnas.map(() => ({ wch: 14 })), { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Matriz Tipo x CC')

    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `OPs-por-Tipo-de-Gasto_${today}.xlsx`)
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ fontSize: 12, padding: '5px 8px', width: 150, flex: '0 0 auto' }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUS_OP.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, padding: '5px 8px', width: 160, flex: '0 0 auto' }} value={filtroCC} onChange={e => { setFiltroCC(e.target.value); setFiltroArea('') }}>
          <option value="">Todos los CC</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, padding: '5px 8px', width: 140, flex: '0 0 auto' }} value={filtroArea} onChange={e => setFiltroArea(e.target.value)} disabled={areasDelCC.length === 0}>
          <option value="">Todas las áreas</option>
          {areasDelCC.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, padding: '5px 8px', width: 160, flex: '0 0 auto' }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, padding: '5px 8px', width: 150, flex: '0 0 auto' }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos de gasto</option>
          {TIPOS_GASTO.map(t => <option key={t}>{t}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: '0 0 auto' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', width: 118 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', width: 118 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Recargar" style={{ flex: '0 0 auto' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flex: '0 0 auto' }}>
          <button className="btn-secondary" onClick={exportExcel} style={{ fontSize: 12 }}>
            <FileSpreadsheet size={13} /> Exportar Excel
          </button>
          {tab === 'jerarquico' && (
            <>
              <button className="btn-ghost" onClick={expandAll} style={{ fontSize: 12 }}>Expandir todo</button>
              <button className="btn-ghost" onClick={collapseAll} style={{ fontSize: 12 }}>Colapsar</button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={() => setTab('jerarquico')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: 13,
            fontWeight: tab === 'jerarquico' ? 700 : 500,
            color: tab === 'jerarquico' ? 'var(--blue)' : 'var(--text-secondary)',
            borderBottom: tab === 'jerarquico' ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <LayoutList size={14} /> Jerárquico (Tipo de Gasto → OPs)
        </button>
        <button
          onClick={() => setTab('matriz')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', fontSize: 13,
            fontWeight: tab === 'matriz' ? 700 : 500,
            color: tab === 'matriz' ? '#7c3aed' : 'var(--text-secondary)',
            borderBottom: tab === 'matriz' ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Grid3x3 size={14} /> Matriz Tipo de Gasto × CC
        </button>
      </div>

      <PrintBar title="OPs-por-Tipo-de-Gasto" count={docsTotal} reportTitle="Órdenes de Pago por Tipo de Gasto (sin OC)" />

      {/* KPIs por status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        {STATUS_OP.map(s => {
          const subset = opsParaKPIs.filter(o => o.status === s)
          const tot    = subset.reduce((a, o) => a + Number(o.monto ?? 0), 0)
          return (
            <div key={s} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: statusColor(s), fontVariantNumeric: 'tabular-nums' }}>{fmt(tot)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subset.length} OP{subset.length !== 1 ? 's' : ''}</div>
            </div>
          )
        })}
      </div>

      {/* Totales generales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total del rango', value: fmt(totalGeneral),  color: 'var(--blue)' },
          { label: 'Pagado',          value: fmt(pagadoGeneral), color: '#15803d' },
          { label: 'Por pagar',       value: fmt(saldoGeneral),  color: saldoGeneral > 0 ? '#dc2626' : '#15803d' },
          { label: 'Total Órdenes',   value: String(docsTotal),  color: '#7c3aed' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div id="reporte-print-area">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : grupos.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            Sin datos para los filtros seleccionados
          </div>
        ) : tab === 'jerarquico' ? (
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Folio / Tipo de Gasto</th>
                <th>Centro de Costo</th>
                <th>Proveedor</th>
                <th>Concepto</th>
                <th>Fecha</th>
                <th>Vencim.</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th style={{ textAlign: 'right' }}>Pagado</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th>Status</th>
                {esSuperadmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => {
                const open = expandedTipo.has(g.nombre)
                return (
                  <Fragment key={`tipo-frag-${g.nombre}`}>
                    <tr style={{ background: '#eff6ff', cursor: 'pointer' }} onClick={() => toggleTipo(g.nombre)}>
                      <td colSpan={6} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {open ? <ChevronDown size={14} style={{ color: 'var(--blue)' }}/> : <ChevronRight size={14} style={{ color: 'var(--blue)' }}/>}
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{g.nombre}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: '#dbeafe', padding: '1px 8px', borderRadius: 20 }}>
                            {g.docs} OP{g.docs !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--blue)' }}>{fmt(g.total)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#15803d' }}>{fmt(g.pagado)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: g.saldo > 0 ? '#dc2626' : '#15803d' }}>{fmt(g.saldo)}</td>
                      <td></td>
                      {esSuperadmin && <td></td>}
                    </tr>

                    {open && g.ops.map(op => {
                      const monto  = Number(op.monto ?? 0)
                      const saldo  = Number(op.saldo ?? op.monto ?? 0)
                      const pagado = monto - saldo
                      const vencido = op.fecha_vencimiento && op.status === 'Pendiente' && new Date(op.fecha_vencimiento) < new Date()
                      const ccNom = op.id_centro_costo_fk != null ? (ccMap[op.id_centro_costo_fk] ?? `Centro #${op.id_centro_costo_fk}`) : '—'
                      return (
                        <tr key={`op-${op.id}`}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, paddingLeft: 32 }}>{op.folio}</td>
                          <td style={{ fontSize: 12 }}>{ccNom}</td>
                          <td style={{ fontSize: 12 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? `#${op.id_proveedor_fk}`) : '—'}</td>
                          <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtF(op.fecha_op)}</td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: vencido ? '#dc2626' : 'var(--text-secondary)', fontWeight: vencido ? 600 : 400 }}>{fmtF(op.fecha_vencimiento)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(monto)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803d' }}>{fmt(pagado)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: saldo > 0 ? '#dc2626' : '#15803d' }}>{fmt(saldo)}</td>
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                              color: statusColor(op.status), background: statusColor(op.status) + '15',
                              border: `1px solid ${statusColor(op.status)}40` }}>
                              {op.status}
                            </span>
                          </td>
                          {esSuperadmin && (
                            <td style={{ textAlign: 'center' }}>
                              <button className="btn-ghost" title="Reclasificar CC/Área/Frente/Tipo de Gasto"
                                style={{ padding: '4px 6px' }} onClick={() => abrirReclasificar(op)}>
                                <Pencil size={13} />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}

              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={6} style={{ color: 'var(--blue)', padding: '10px 12px' }}>TOTAL GENERAL ({docsTotal} OP{docsTotal !== 1 ? 's' : ''})</td>
                <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(totalGeneral)}</td>
                <td style={{ textAlign: 'right', color: '#15803d', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(pagadoGeneral)}</td>
                <td style={{ textAlign: 'right', color: saldoGeneral > 0 ? '#dc2626' : '#15803d', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(saldoGeneral)}</td>
                <td></td>
                {esSuperadmin && <td></td>}
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 2 }}>Tipo de Gasto</th>
                  {matriz.columnas.map(([key, v]) => (
                    <th key={key} style={{ textAlign: 'right', minWidth: 110, color: '#7c3aed' }}>{v.nombre}</th>
                  ))}
                  <th style={{ textAlign: 'right', background: '#eff6ff', color: 'var(--blue)' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {matriz.filas.map(f => (
                  <tr key={`matriz-${f.nombre}`}>
                    <td style={{ fontWeight: 600, color: 'var(--blue)', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{f.nombre}</td>
                    {matriz.columnas.map(([key]) => {
                      const v = f.celdas[key] ?? 0
                      return (
                        <td key={key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13, color: v > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {v > 0 ? fmt(v) : '—'}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', background: '#eff6ff' }}>{fmt(f.total)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                  <td style={{ color: 'var(--blue)', position: 'sticky', left: 0, background: 'var(--blue-pale)', zIndex: 1 }}>TOTAL CC</td>
                  {matriz.columnas.map(([key]) => (
                    <td key={key} style={{ textAlign: 'right', color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(matriz.totalesCol[key] ?? 0)}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(matriz.totalGeneral)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reclasOp && (
        <ModalShell modulo="compras" titulo="Reclasificar Orden de Pago" subtitulo={reclasOp.folio}
          icono={Tag} maxWidth={480} onClose={cerrarReclasificar}
          footer={<>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={cerrarReclasificar}>Cancelar</button>
            <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleReclasificar} disabled={reclasSaving}>
              {reclasSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar reclasificación
            </button>
          </>}
        >
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 0, marginBottom: 16 }}>
            Solo corrige clasificación (CC / Área / Frente / Tipo de Gasto). Nunca toca monto, saldo ni pagos.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div><label className="label">Centro de Costo</label>
              <select className="select" value={reclasCC}
                onChange={e => { setReclasCC(e.target.value); setReclasArea(''); setReclasFrente('') }}>
                <option value="">— Sin asignar —</option>
                {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div><label className="label">Área</label>
              <select className="select" value={reclasArea}
                onChange={e => { setReclasArea(e.target.value); setReclasFrente('') }}
                disabled={!reclasCC}>
                <option value="">— Sin asignar —</option>
                {areas.filter(a => a.id_centro_costo_fk === Number(reclasCC)).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div><label className="label">Frente</label>
              <select className="select" value={reclasFrente} onChange={e => setReclasFrente(e.target.value)} disabled={!reclasArea}>
                <option value="">— Sin asignar —</option>
                {frentes.filter(f => relAF.some(r => r.id_area === Number(reclasArea) && r.id_frente === f.id)).map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </div>
            <div><label className="label">Tipo de Gasto</label>
              <select className="select" value={reclasTipoGasto} onChange={e => setReclasTipoGasto(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {TIPOS_GASTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          {reclasError && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 0 }}>{reclasError}</p>}
          {reclasOp.reclasificado_por && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, marginBottom: 0 }}>
              Última reclasificación: {reclasOp.reclasificado_por} — {reclasOp.fecha_reclasificacion ? new Date(reclasOp.fecha_reclasificacion).toLocaleString('es-MX') : ''}
            </p>
          )}
        </ModalShell>
      )}
    </div>
  )
}
