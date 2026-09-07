'use client'
import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, Filter, ChevronDown, ChevronRight, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'

const STATUS_ROL = ['Capturado', 'Autorizado', 'Rechazado'] as const

const statusColor = (s: string) =>
  s === 'Autorizado' ? '#15803d' :
  s === 'Capturado'  ? '#d97706' :
  s === 'Rechazado'  ? '#dc2626' : '#64748b'

type Lote = {
  id: number
  folio: string
  fecha_desde: string
  fecha_hasta: string
  id_centro_costo_fk: number | null
  status: string
  total: number
  captured_by: string | null
  authorized_by: string | null
  notas: string | null
}

type ColabDet = {
  id: number
  id_lote_fk: number
  id_colaborador_fk: number | null
  nombre: string
  puesto: string | null
  costo_dia: number
  dias: number
  costo: number
}

type Periodo = Lote & { colaboradores: ColabDet[] }

export default function ReporteRolPagos() {
  const [lotes, setLotes]           = useState<Lote[]>([])
  const [colabs, setColabs]         = useState<ColabDet[]>([])
  const [centrosCosto, setCentros]  = useState<{ id: number; nombre: string }[]>([])
  const [colabTipo, setColabTipo]   = useState<Record<number, string>>({})
  const [loading, setLoading]       = useState(true)

  // Filtros
  const [filtroCC, setFiltroCC]         = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [filtroDe, setFiltroDe]         = useState<string>('')
  const [filtroA,  setFiltroA]          = useState<string>('')

  const [expandedPeriodo, setExpandedPeriodo] = useState<Set<number>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ccs }, { data: lotesData }, { data: colabsData }, { data: colaboradores }] = await Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCtrl.from('rol_pagos_lotes').select('*').order('fecha_desde', { ascending: false }),
      dbCtrl.from('rol_pagos_colaboradores').select('*'),
      dbCfg.from('colaboradores').select('id, tipo'),
    ])
    setCentros((ccs ?? []) as any)
    setLotes((lotesData ?? []) as Lote[])
    setColabs((colabsData ?? []) as ColabDet[])
    const tm: Record<number, string> = {}
    ;(colaboradores ?? []).forEach((c: any) => { tm[c.id] = c.tipo ?? 'Interno' })
    setColabTipo(tm)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const ccMap = useMemo(() => {
    const m: Record<number, string> = {}
    centrosCosto.forEach(c => { m[c.id] = c.nombre })
    return m
  }, [centrosCosto])

  const colabsByLote = useMemo(() => {
    const m: Record<number, ColabDet[]> = {}
    colabs.forEach(c => {
      if (!m[c.id_lote_fk]) m[c.id_lote_fk] = []
      m[c.id_lote_fk].push(c)
    })
    return m
  }, [colabs])

  // Aplicar filtros sobre los lotes (periodos)
  const periodos = useMemo((): Periodo[] => {
    return lotes
      .filter(l => {
        if (filtroCC     && l.id_centro_costo_fk !== Number(filtroCC)) return false
        if (filtroStatus && l.status !== filtroStatus) return false
        if (filtroDe     && l.fecha_desde < filtroDe) return false
        if (filtroA      && l.fecha_desde > filtroA)  return false
        return true
      })
      .map(l => ({ ...l, colaboradores: colabsByLote[l.id] ?? [] }))
  }, [lotes, colabsByLote, filtroCC, filtroStatus, filtroDe, filtroA])

  const fmt  = (n: number) => '$' + Number(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
  const fmtF = (s: string | null) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

  const totalGeneral    = periodos.reduce((a, p) => a + Number(p.total ?? 0), 0)
  const colaboradoresN  = periodos.reduce((a, p) => a + p.colaboradores.length, 0)
  const periodosN       = periodos.length

  const togglePeriodo = (id: number) => setExpandedPeriodo(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const expandAll   = () => setExpandedPeriodo(new Set(periodos.map(p => p.id)))
  const collapseAll = () => setExpandedPeriodo(new Set())

  // KPIs por status (ignoran el filtro de status, respetan CC y fechas)
  const periodosParaKPIs = useMemo(() => {
    return lotes.filter(l => {
      if (filtroCC && l.id_centro_costo_fk !== Number(filtroCC)) return false
      if (filtroDe && l.fecha_desde < filtroDe) return false
      if (filtroA  && l.fecha_desde > filtroA)  return false
      return true
    })
  }, [lotes, filtroCC, filtroDe, filtroA])

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()

    // Hoja 1: Resumen por periodo
    const resumenRows = periodos.map(p => ({
      'Folio':              p.folio,
      'Periodo Desde':      p.fecha_desde,
      'Periodo Hasta':      p.fecha_hasta,
      'Centro de Costo':    p.id_centro_costo_fk != null ? (ccMap[p.id_centro_costo_fk] ?? `Centro #${p.id_centro_costo_fk}`) : 'Sin centro de costo',
      'Status':             p.status,
      '# Colaboradores':    p.colaboradores.length,
      'Total':              Number(p.total ?? 0),
    }))
    resumenRows.push({
      'Folio': 'TOTAL GENERAL', 'Periodo Desde': '', 'Periodo Hasta': '', 'Centro de Costo': '',
      'Status': '', '# Colaboradores': colaboradoresN, 'Total': totalGeneral,
    } as any)
    const ws1 = XLSX.utils.json_to_sheet(resumenRows)
    ws1['!cols'] = [{ wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 24 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

    // Hoja 2: Detalle de colaboradores
    const detalleRows: any[] = []
    periodos.forEach(p => {
      const ccNom = p.id_centro_costo_fk != null ? (ccMap[p.id_centro_costo_fk] ?? `Centro #${p.id_centro_costo_fk}`) : 'Sin centro de costo'
      p.colaboradores.forEach(c => {
        detalleRows.push({
          'Folio':           p.folio,
          'Periodo Desde':   p.fecha_desde,
          'Periodo Hasta':   p.fecha_hasta,
          'Centro de Costo': ccNom,
          'Colaborador':     c.nombre,
          'Tipo':            c.id_colaborador_fk ? (colabTipo[c.id_colaborador_fk] ?? 'Interno') : '—',
          'Puesto':          c.puesto ?? '',
          'Días':            c.dias,
          '$/Día':           Number(c.costo_dia ?? 0),
          'Monto a Pagar':   Number(c.costo ?? 0),
        })
      })
    })
    const ws2 = XLSX.utils.json_to_sheet(detalleRows)
    ws2['!cols'] = [
      { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 24 }, { wch: 26 },
      { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
    ]
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle')

    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `Rol-de-Pagos_${today}.xlsx`)
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <select className="select" style={{ minWidth: 200 }} value={filtroCC} onChange={e => setFiltroCC(e.target.value)}>
          <option value="">Todos los Centros</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUS_ROL.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Recargar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn-secondary" onClick={exportExcel} style={{ fontSize: 12 }}>
            <FileSpreadsheet size={13} /> Exportar Excel
          </button>
          <button className="btn-ghost" onClick={expandAll} style={{ fontSize: 12 }}>Expandir todo</button>
          <button className="btn-ghost" onClick={collapseAll} style={{ fontSize: 12 }}>Colapsar</button>
        </div>
      </div>

      <PrintBar title="Rol-de-Pagos" count={colaboradoresN} reportTitle="Rol de Pagos por Periodo y Centro de Costo" />

      {/* KPIs por status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
        {STATUS_ROL.map(s => {
          const subset = periodosParaKPIs.filter(l => l.status === s)
          const tot    = subset.reduce((a, l) => a + Number(l.total ?? 0), 0)
          return (
            <div key={s} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: statusColor(s), fontVariantNumeric: 'tabular-nums' }}>{fmt(tot)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subset.length} periodo{subset.length !== 1 ? 's' : ''}</div>
            </div>
          )
        })}
      </div>

      {/* Totales generales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total del rango',    value: fmt(totalGeneral),       color: '#b45309' },
          { label: 'Periodos (roles)',   value: String(periodosN),       color: 'var(--blue)' },
          { label: 'Colaboradores',      value: String(colaboradoresN),  color: '#7c3aed' },
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
        ) : periodos.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            Sin datos para los filtros seleccionados
          </div>
        ) : (
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Folio / Colaborador</th>
                <th>Centro de Costo</th>
                <th>Tipo / Puesto</th>
                <th style={{ textAlign: 'center' }}>Días</th>
                <th style={{ textAlign: 'right' }}>$/Día</th>
                <th style={{ textAlign: 'right' }}>Monto a Pagar</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map(p => {
                const open = expandedPeriodo.has(p.id)
                const ccNom = p.id_centro_costo_fk != null ? (ccMap[p.id_centro_costo_fk] ?? `Centro #${p.id_centro_costo_fk}`) : 'Sin centro de costo'
                return (
                  <Fragment key={`periodo-frag-${p.id}`}>
                    <tr style={{ background: '#fff7ed', cursor: 'pointer' }} onClick={() => togglePeriodo(p.id)}>
                      <td colSpan={3} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {open ? <ChevronDown size={14} style={{ color: '#b45309' }} /> : <ChevronRight size={14} style={{ color: '#b45309' }} />}
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#b45309', fontFamily: 'monospace' }}>{p.folio}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtF(p.fecha_desde)} – {fmtF(p.fecha_hasta)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: '#ffedd5', padding: '1px 8px', borderRadius: 20 }}>
                            {p.colaboradores.length} colaborador{p.colaboradores.length !== 1 ? 'es' : ''}
                          </span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}></td>
                      <td style={{ textAlign: 'right' }}></td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#b45309' }}>{fmt(p.total)}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                          color: statusColor(p.status), background: statusColor(p.status) + '15',
                          border: `1px solid ${statusColor(p.status)}40` }}>
                          {p.status}
                        </span>
                      </td>
                    </tr>

                    {open && p.colaboradores.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '10px 12px 10px 40px', color: 'var(--text-muted)', fontSize: 12 }}>
                          Sin colaboradores capturados en este periodo
                        </td>
                      </tr>
                    )}

                    {open && p.colaboradores.map(c => {
                      const tipo = c.id_colaborador_fk ? (colabTipo[c.id_colaborador_fk] ?? 'Interno') : null
                      return (
                        <tr key={`colab-${c.id}`}>
                          <td style={{ fontSize: 12, paddingLeft: 40 }}>{c.nombre}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ccNom}</td>
                          <td style={{ fontSize: 12 }}>
                            {tipo && (
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 20, marginRight: 6,
                                background: tipo === 'Externo' ? '#fff7ed' : '#eff6ff', color: tipo === 'Externo' ? '#c2410c' : '#0369a1' }}>
                                {tipo}
                              </span>
                            )}
                            <span style={{ color: 'var(--text-secondary)' }}>{c.puesto ?? '—'}</span>
                          </td>
                          <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{c.dias}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.costo_dia)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#15803d' }}>{fmt(c.costo)}</td>
                          <td></td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}

              <tr style={{ background: '#fef3c7', fontWeight: 700 }}>
                <td colSpan={5} style={{ color: '#92400e', padding: '10px 12px' }}>
                  TOTAL GENERAL ({periodosN} periodo{periodosN !== 1 ? 's' : ''} · {colaboradoresN} colaborador{colaboradoresN !== 1 ? 'es' : ''})
                </td>
                <td style={{ textAlign: 'right', color: '#92400e', fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(totalGeneral)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
