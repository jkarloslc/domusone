'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter, ChevronDown, ChevronRight, FileSpreadsheet, LayoutList, Grid3x3 } from 'lucide-react'
import * as XLSX from 'xlsx'

// Status conocidos en comp.ordenes_pago
const STATUS_OP = ['Pendiente Auth', 'Pendiente', 'Pagada', 'Rechazada', 'Cancelada'] as const

// Tipos de gasto (sincronizado con app/compras/ordenes-pago/page.tsx)
const TIPOS_GASTO = [
  'Servicios Profesionales', 'Mantenimiento', 'Reparación',
  'Arrendamiento', 'Seguros', 'Publicidad', 'Combustible',
  'Electricidad', 'Agua', 'Telefonía / Internet',
  'Honorarios', 'Asesoría', 'Capacitación',
  'Nómina Semanal', 'Nómina Quincenal',
  'ISR', 'IMSS', 'IVA', 'IEPS', '3% SN',
  'Otro',
]

const statusColor = (s: string) =>
  s === 'Pagada'         ? '#15803d' :
  s === 'Pendiente'      ? '#d97706' :
  s === 'Pendiente Auth' ? '#7c3aed' :
  s === 'Rechazada'      ? '#dc2626' :
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
}

type AreaBucket = {
  id: number | null
  nombre: string
  total: number
  pagado: number
  saldo: number
  docs: number
  ops: OP[]
}

type CCBucket = {
  id: number | null
  nombre: string
  total: number
  pagado: number
  saldo: number
  docs: number
  areas: Record<string, AreaBucket> // key = area id o 'sin-area'
}

type Tab = 'jerarquico' | 'matriz'

export default function ReporteOrdenesPago() {
  const [ops, setOps]               = useState<OP[]>([])
  const [centrosCosto, setCentros]  = useState<{ id: number; nombre: string }[]>([])
  const [areas, setAreas]           = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [provs, setProvs]           = useState<{ id: number; nombre: string }[]>([])
  const [provMap, setProvMap]       = useState<Record<number, string>>({})
  const [loading, setLoading]       = useState(true)

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [filtroCC, setFiltroCC]         = useState<string>('')
  const [filtroArea, setFiltroArea]     = useState<string>('')
  const [filtroProv, setFiltroProv]     = useState<string>('')
  const [filtroTipo, setFiltroTipo]     = useState<string>('')
  const [filtroDe, setFiltroDe]         = useState<string>('')
  const [filtroA,  setFiltroA]          = useState<string>('')

  // Tabs
  const [tab, setTab] = useState<Tab>('jerarquico')

  // Expandir / colapsar
  const [expandedCC,   setExpandedCC]   = useState<Set<string>>(new Set())
  const [expandedArea, setExpandedArea] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ccs }, { data: ars }, { data: ps }, { data: opsData }] = await Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
      dbComp.from('ordenes_pago')
        .select('id, folio, concepto, tipo_gasto, monto, saldo, fecha_op, fecha_vencimiento, status, id_proveedor_fk, id_centro_costo_fk, id_area_fk')
        .order('fecha_op', { ascending: false }),
    ])

    setCentros((ccs ?? []) as any)
    setAreas((ars ?? []) as any)
    setProvs((ps ?? []) as any)
    const pm: Record<number, string> = {}
    ;(ps ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)
    setOps((opsData ?? []) as OP[])
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

  // Áreas filtradas por CC seleccionado
  const areasDelCC = useMemo(
    () => filtroCC ? areas.filter(a => a.id_centro_costo_fk === Number(filtroCC)) : areas,
    [areas, filtroCC]
  )

  // Aplicar filtros
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

  // Agrupar CC → Área → OPs
  const grupos = useMemo(() => {
    const res: Record<string, CCBucket> = {}
    for (const op of opsFiltradas) {
      const ccId    = op.id_centro_costo_fk
      const ccKey   = ccId != null ? String(ccId) : 'sin-cc'
      const ccName  = ccId != null ? (ccMap[ccId] ?? `Centro #${ccId}`) : 'Sin centro de costo'

      const areaId   = op.id_area_fk
      const areaKey  = areaId != null ? String(areaId) : 'sin-area'
      const areaName = areaId != null ? (areaMap[areaId]?.nombre ?? `Área #${areaId}`) : 'Sin área'

      if (!res[ccKey]) res[ccKey] = {
        id: ccId, nombre: ccName, total: 0, pagado: 0, saldo: 0, docs: 0, areas: {},
      }
      const cc = res[ccKey]
      if (!cc.areas[areaKey]) cc.areas[areaKey] = {
        id: areaId, nombre: areaName, total: 0, pagado: 0, saldo: 0, docs: 0, ops: [],
      }

      const monto  = Number(op.monto ?? 0)
      const saldo  = Number(op.saldo ?? op.monto ?? 0)
      const pagado = monto - saldo

      cc.total += monto; cc.saldo += saldo; cc.pagado += pagado; cc.docs += 1
      const ar = cc.areas[areaKey]
      ar.total += monto; ar.saldo += saldo; ar.pagado += pagado; ar.docs += 1
      ar.ops.push(op)
    }
    return Object.values(res).sort((a, b) => b.total - a.total)
  }, [opsFiltradas, ccMap, areaMap])

  // Matriz CC × Área: columnas dinámicas según áreas presentes en el filtro
  const matriz = useMemo(() => {
    // Columnas: conjunto de áreas únicas (id) ordenadas alfabéticamente
    const colMap = new Map<string, { id: number | null; nombre: string }>()
    grupos.forEach(cc => {
      Object.values(cc.areas).forEach(ar => {
        const key = ar.id != null ? String(ar.id) : 'sin-area'
        if (!colMap.has(key)) colMap.set(key, { id: ar.id, nombre: ar.nombre })
      })
    })
    const columnas = Array.from(colMap.entries())
      .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'))

    // Filas: cc con celdas por cada columna
    const filas = grupos.map(cc => {
      const celdas: Record<string, number> = {}
      columnas.forEach(([key]) => {
        celdas[key] = cc.areas[key]?.total ?? 0
      })
      return { id: cc.id, nombre: cc.nombre, total: cc.total, celdas }
    })

    // Totales por columna
    const totalesCol: Record<string, number> = {}
    columnas.forEach(([key]) => {
      totalesCol[key] = filas.reduce((a, f) => a + (f.celdas[key] ?? 0), 0)
    })
    const totalGeneral = filas.reduce((a, f) => a + f.total, 0)

    return { columnas, filas, totalesCol, totalGeneral }
  }, [grupos])

  const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

  const totalGeneral  = grupos.reduce((a, g) => a + g.total, 0)
  const pagadoGeneral = grupos.reduce((a, g) => a + g.pagado, 0)
  const saldoGeneral  = grupos.reduce((a, g) => a + g.saldo, 0)
  const docsTotal     = grupos.reduce((a, g) => a + g.docs, 0)

  const toggleCC = (key: string) => setExpandedCC(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })
  const toggleArea = (key: string) => setExpandedArea(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  const expandAll = () => {
    const ccKeys   = new Set<string>()
    const areaKeys = new Set<string>()
    grupos.forEach(cc => {
      const ccKey = cc.id != null ? String(cc.id) : 'sin-cc'
      ccKeys.add(ccKey)
      Object.values(cc.areas).forEach(ar => {
        const areaKey = ar.id != null ? String(ar.id) : 'sin-area'
        areaKeys.add(`${ccKey}:${areaKey}`)
      })
    })
    setExpandedCC(ccKeys)
    setExpandedArea(areaKeys)
  }
  const collapseAll = () => { setExpandedCC(new Set()); setExpandedArea(new Set()) }

  // KPIs por status (sobre OPs filtradas, ignorando el filtro de status)
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

  // Export Excel (3 hojas: Resumen, Detalle, Matriz)
  const exportExcel = () => {
    const wb = XLSX.utils.book_new()

    // Hoja 1: Resumen CC/Área
    const resumenRows: any[] = []
    grupos.forEach(cc => {
      Object.values(cc.areas).forEach(ar => {
        resumenRows.push({
          'Centro de Costo': cc.nombre,
          'Área':            ar.nombre,
          '# OPs':           ar.docs,
          'Monto Total':     ar.total,
          'Pagado':          ar.pagado,
          'Saldo':           ar.saldo,
        })
      })
    })
    resumenRows.push({})
    resumenRows.push({
      'Centro de Costo': 'TOTAL GENERAL',
      'Área':            '',
      '# OPs':           docsTotal,
      'Monto Total':     totalGeneral,
      'Pagado':          pagadoGeneral,
      'Saldo':           saldoGeneral,
    })
    const ws1 = XLSX.utils.json_to_sheet(resumenRows)
    ws1['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

    // Hoja 2: Detalle completo
    const detalleRows = opsFiltradas.map(op => {
      const monto  = Number(op.monto ?? 0)
      const saldo  = Number(op.saldo ?? op.monto ?? 0)
      const ccNom  = op.id_centro_costo_fk != null ? (ccMap[op.id_centro_costo_fk] ?? `Centro #${op.id_centro_costo_fk}`) : 'Sin CC'
      const arNom  = op.id_area_fk != null ? (areaMap[op.id_area_fk]?.nombre ?? `Área #${op.id_area_fk}`) : 'Sin área'
      const provNom = op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? `#${op.id_proveedor_fk}`) : ''
      return {
        'Folio':             op.folio,
        'Centro de Costo':   ccNom,
        'Área':              arNom,
        'Proveedor':         provNom,
        'Concepto':          op.concepto ?? '',
        'Tipo Gasto':        op.tipo_gasto ?? '',
        'Fecha OP':          op.fecha_op ?? '',
        'Fecha Venc.':       op.fecha_vencimiento ?? '',
        'Monto':             monto,
        'Pagado':            monto - saldo,
        'Saldo':             saldo,
        'Status':            op.status,
      }
    })
    const ws2 = XLSX.utils.json_to_sheet(detalleRows)
    ws2['!cols'] = [
      { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 24 }, { wch: 32 }, { wch: 20 },
      { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 14 },
    ]
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle')

    // Hoja 3: Matriz CC × Área
    const header: any[] = ['Centro de Costo', ...matriz.columnas.map(([, v]) => v.nombre), 'TOTAL CC']
    const matRows: any[][] = [header]
    matriz.filas.forEach(f => {
      const row: any[] = [f.nombre]
      matriz.columnas.forEach(([key]) => row.push(f.celdas[key] ?? 0))
      row.push(f.total)
      matRows.push(row)
    })
    const totalRow: any[] = ['TOTAL ÁREA']
    matriz.columnas.forEach(([key]) => totalRow.push(matriz.totalesCol[key] ?? 0))
    totalRow.push(matriz.totalGeneral)
    matRows.push(totalRow)
    const ws3 = XLSX.utils.aoa_to_sheet(matRows)
    ws3['!cols'] = [{ wch: 28 }, ...matriz.columnas.map(() => ({ wch: 14 })), { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Matriz CC x Area')

    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Ordenes-de-Pago-CC-Area_${today}.xlsx`)
  }

  return (
    <div>
      {/* Filtros fila 1 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ minWidth: 160 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUS_OP.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" style={{ minWidth: 200 }} value={filtroCC} onChange={e => { setFiltroCC(e.target.value); setFiltroArea('') }}>
          <option value="">Todos los centros de costo</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 180 }} value={filtroArea} onChange={e => setFiltroArea(e.target.value)} disabled={areasDelCC.length === 0}>
          <option value="">Todas las áreas{filtroCC ? ' del CC' : ''}</option>
          {areasDelCC.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Recargar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Filtros fila 2 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" style={{ minWidth: 220 }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 200 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos de gasto</option>
          {TIPOS_GASTO.map(t => <option key={t}>{t}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
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
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: tab === 'jerarquico' ? 700 : 500,
            color: tab === 'jerarquico' ? 'var(--blue)' : 'var(--text-secondary)',
            borderBottom: tab === 'jerarquico' ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <LayoutList size={14} /> Jerárquico (CC → Área → OPs)
        </button>
        <button
          onClick={() => setTab('matriz')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: tab === 'matriz' ? 700 : 500,
            color: tab === 'matriz' ? '#7c3aed' : 'var(--text-secondary)',
            borderBottom: tab === 'matriz' ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom: -1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Grid3x3 size={14} /> Matriz CC × Área
        </button>
      </div>

      <PrintBar title="Ordenes-de-Pago-por-CC-Area" count={docsTotal} reportTitle="Órdenes de Pago por Centro de Costo y Área" />

      {/* KPIs por status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
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
          { label: 'Total del rango',     value: fmt(totalGeneral),  color: 'var(--blue)' },
          { label: 'Pagado',              value: fmt(pagadoGeneral), color: '#15803d' },
          { label: 'Por pagar',           value: fmt(saldoGeneral),  color: saldoGeneral > 0 ? '#dc2626' : '#15803d' },
          { label: 'Total Órdenes',       value: String(docsTotal),  color: '#7c3aed' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Área de impresión */}
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
          /* VISTA JERÁRQUICA */
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Folio / Centro / Área</th>
                <th>Proveedor</th>
                <th>Concepto</th>
                <th>Tipo Gasto</th>
                <th>Fecha</th>
                <th>Vencim.</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
                <th style={{ textAlign: 'right' }}>Pagado</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(cc => {
                const ccKey = cc.id != null ? String(cc.id) : 'sin-cc'
                const ccOpen = expandedCC.has(ccKey)
                const ccAreasOrdenadas = Object.values(cc.areas).sort((a, b) => b.total - a.total)
                return (
                  <Fragment key={`cc-frag-${ccKey}`}>
                    <tr style={{ background: '#eff6ff', cursor: 'pointer' }} onClick={() => toggleCC(ccKey)}>
                      <td colSpan={6} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {ccOpen ? <ChevronDown size={14} style={{ color: 'var(--blue)' }}/> : <ChevronRight size={14} style={{ color: 'var(--blue)' }}/>}
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{cc.nombre}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: '#dbeafe', padding: '1px 8px', borderRadius: 20 }}>
                            {cc.docs} OP{cc.docs !== 1 ? 's' : ''} · {ccAreasOrdenadas.length} área{ccAreasOrdenadas.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--blue)' }}>{fmt(cc.total)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#15803d' }}>{fmt(cc.pagado)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: cc.saldo > 0 ? '#dc2626' : '#15803d' }}>{fmt(cc.saldo)}</td>
                      <td></td>
                    </tr>

                    {ccOpen && ccAreasOrdenadas.map(ar => {
                      const areaKeyBase = ar.id != null ? String(ar.id) : 'sin-area'
                      const areaFullKey = `${ccKey}:${areaKeyBase}`
                      const arOpen = expandedArea.has(areaFullKey)
                      return (
                        <Fragment key={`ar-frag-${areaFullKey}`}>
                          <tr style={{ background: '#f8fafc', cursor: 'pointer' }} onClick={() => toggleArea(areaFullKey)}>
                            <td colSpan={6} style={{ padding: '7px 12px 7px 32px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {arOpen ? <ChevronDown size={12} style={{ color: '#7c3aed' }}/> : <ChevronRight size={12} style={{ color: '#7c3aed' }}/>}
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>{ar.nombre}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: '#ede9fe', padding: '1px 7px', borderRadius: 20 }}>
                                  {ar.docs} OP{ar.docs !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#7c3aed' }}>{fmt(ar.total)}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803d' }}>{fmt(ar.pagado)}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ar.saldo > 0 ? '#dc2626' : '#15803d' }}>{fmt(ar.saldo)}</td>
                            <td></td>
                          </tr>

                          {arOpen && ar.ops.map(op => {
                            const monto  = Number(op.monto ?? 0)
                            const saldo  = Number(op.saldo ?? op.monto ?? 0)
                            const pagado = monto - saldo
                            const vencido = op.fecha_vencimiento && op.status === 'Pendiente' && new Date(op.fecha_vencimiento) < new Date()
                            return (
                              <tr key={`op-${op.id}`}>
                                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, paddingLeft: 48 }}>{op.folio}</td>
                                <td style={{ fontSize: 12 }}>{op.id_proveedor_fk ? (provMap[op.id_proveedor_fk] ?? `#${op.id_proveedor_fk}`) : '—'}</td>
                                <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{op.tipo_gasto ?? '—'}</td>
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
                              </tr>
                            )
                          })}
                        </Fragment>
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
              </tr>
            </tbody>
          </table>
        ) : (
          /* VISTA MATRIZ */
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', position: 'sticky', left: 0, background: '#f1f5f9', zIndex: 2 }}>Centro de Costo</th>
                  {matriz.columnas.map(([key, v]) => (
                    <th key={key} style={{ textAlign: 'right', minWidth: 110, color: '#7c3aed' }}>{v.nombre}</th>
                  ))}
                  <th style={{ textAlign: 'right', background: '#eff6ff', color: 'var(--blue)' }}>TOTAL CC</th>
                </tr>
              </thead>
              <tbody>
                {matriz.filas.map(f => (
                  <tr key={`matriz-${f.id ?? 'sin-cc'}`}>
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
                  <td style={{ color: 'var(--blue)', position: 'sticky', left: 0, background: 'var(--blue-pale)', zIndex: 1 }}>TOTAL ÁREA</td>
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
    </div>
  )
}
