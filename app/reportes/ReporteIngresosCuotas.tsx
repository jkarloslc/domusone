'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

const fmt  = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtF = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

type Centro = { id: number; nombre: string; tipo: string | null; tipo_desglose: string }

type SeccionRow = {
  id_seccion_fk: number
  nombre_seccion: string
  monto: number
  recibos_ingreso: { id: number; folio: string | null; fecha: string; status: string; id_centro_ingreso_fk: number | null }
}
type ConceptoRow = {
  id_concepto_fk: number
  nombre_concepto: string
  monto: number
  id_recibo_fk: number
}

// Recibo enriquecido con sus secciones y conceptos
type ReciboAgregado = {
  id: number
  folio: string | null
  fecha: string
  status: string
  id_centro_ingreso_fk: number | null
  secciones: { id_seccion_fk: number; nombre_seccion: string; monto: number }[]
  conceptos: { id_concepto_fk: number; nombre_concepto: string; monto: number }[]
  monto_total: number
}

export default function ReporteIngresosCuotas() {
  const [centros, setCentros]   = useState<Centro[]>([])
  const [recibos, setRecibos]   = useState<ReciboAgregado[]>([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [filtroCentro, setFiltroCentro] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Confirmado')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  // Centros filtrados: solo los de tipo 'cuotas' con tipo_desglose = 'secciones'
  const centrosCuotas = centros.filter(c => c.tipo === 'cuotas' && c.tipo_desglose === 'secciones')

  const fetchData = useCallback(async () => {
    setLoading(true)

    const { data: cs } = await dbCfg.from('centros_ingreso')
      .select('id, nombre, tipo, tipo_desglose')
      .order('nombre')
    setCentros(cs ?? [])

    const cuotaIds = (cs ?? [])
      .filter((c: Centro) => c.tipo === 'cuotas' && c.tipo_desglose === 'secciones')
      .map((c: Centro) => c.id)

    if (cuotaIds.length === 0) { setRecibos([]); setLoading(false); return }

    const centroTarget = filtroCentro ? [Number(filtroCentro)] : cuotaIds

    // Cargar secciones con join a recibos (filtrando por centro, status y fechas)
    let secQ = (dbCtrl.from('recibos_ingreso_secciones') as any)
      .select('id_seccion_fk, nombre_seccion, monto, id_recibo_fk, recibos_ingreso!inner(id, folio, fecha, status, id_centro_ingreso_fk)')
      .in('recibos_ingreso.id_centro_ingreso_fk', centroTarget)

    if (filtroStatus) secQ = secQ.eq('recibos_ingreso.status', filtroStatus)
    if (filtroDe)     secQ = secQ.gte('recibos_ingreso.fecha', filtroDe)
    if (filtroA)      secQ = secQ.lte('recibos_ingreso.fecha', filtroA)

    const { data: secRows } = await secQ
    const secciones: (SeccionRow & { id_recibo_fk: number })[] = secRows ?? []

    // Recibos únicos del resultado
    const reciboIds = Array.from(new Set(secciones.map((s: any) => s.recibos_ingreso.id as number)))

    // Cargar conceptos para esos recibos
    let conceptos: ConceptoRow[] = []
    if (reciboIds.length > 0) {
      const { data: cRows } = await dbCtrl
        .from('recibos_ingreso_conceptos')
        .select('id_recibo_fk, id_concepto_fk, nombre_concepto, monto')
        .in('id_recibo_fk', reciboIds)
      conceptos = cRows ?? []
    }

    // Agrupar por recibo
    const reciboMap: Record<number, ReciboAgregado> = {}
    secciones.forEach((s: any) => {
      const r = s.recibos_ingreso
      if (!reciboMap[r.id]) {
        reciboMap[r.id] = {
          id: r.id, folio: r.folio, fecha: r.fecha,
          status: r.status, id_centro_ingreso_fk: r.id_centro_ingreso_fk,
          secciones: [], conceptos: [], monto_total: 0,
        }
      }
      if (s.monto > 0) {
        reciboMap[r.id].secciones.push({ id_seccion_fk: s.id_seccion_fk, nombre_seccion: s.nombre_seccion, monto: s.monto })
        reciboMap[r.id].monto_total += Number(s.monto)
      }
    })
    conceptos.forEach((c: ConceptoRow) => {
      if (reciboMap[c.id_recibo_fk] && c.monto > 0) {
        reciboMap[c.id_recibo_fk].conceptos.push({ id_concepto_fk: c.id_concepto_fk, nombre_concepto: c.nombre_concepto, monto: c.monto })
      }
    })

    setRecibos(Object.values(reciboMap).sort((a, b) => b.fecha.localeCompare(a.fecha)))
    setLoading(false)
  }, [filtroCentro, filtroStatus, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const centroMap = Object.fromEntries(centros.map(c => [c.id, c]))

  // ── Agrupados por sección ────────────────────────────────
  // Mapa: nombre_seccion → { total, conceptos: { nombre → total }, recibos }
  type GrupoSeccion = {
    nombre_seccion: string
    id_seccion_fk: number
    total: number
    conceptos: Record<string, number>
    recibos: ReciboAgregado[]
  }

  const seccionMap: Record<string, GrupoSeccion> = {}
  recibos.forEach(r => {
    r.secciones.forEach(s => {
      if (!seccionMap[s.nombre_seccion]) {
        seccionMap[s.nombre_seccion] = {
          nombre_seccion: s.nombre_seccion,
          id_seccion_fk: s.id_seccion_fk,
          total: 0, conceptos: {}, recibos: [],
        }
      }
      seccionMap[s.nombre_seccion].total += s.monto
      if (!seccionMap[s.nombre_seccion].recibos.find(rb => rb.id === r.id)) {
        seccionMap[s.nombre_seccion].recibos.push(r)
      }
    })
    // Conceptos: asociarlos a la(s) sección(es) del recibo
    r.conceptos.forEach(c => {
      r.secciones.forEach(s => {
        if (!seccionMap[s.nombre_seccion]) return
        seccionMap[s.nombre_seccion].conceptos[c.nombre_concepto] =
          (seccionMap[s.nombre_seccion].conceptos[c.nombre_concepto] ?? 0) + c.monto
      })
    })
  })

  const grupos = Object.values(seccionMap).sort((a, b) => b.total - a.total)

  // ── KPIs por concepto (globales) ─────────────────────────
  const conceptosTotales: Record<string, number> = {}
  recibos.forEach(r => r.conceptos.forEach(c => {
    conceptosTotales[c.nombre_concepto] = (conceptosTotales[c.nombre_concepto] ?? 0) + c.monto
  }))
  const totalGeneral = grupos.reduce((s, g) => s + g.total, 0)
  const totalRecibos = recibos.length

  const toggle     = (k: string) => setExpanded(p => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n })
  const expandAll  = () => setExpanded(new Set(grupos.map(g => g.nombre_seccion)))
  const collapseAll = () => setExpanded(new Set())

  const hayConceptos = Object.keys(conceptosTotales).length > 0
  const conceptosColumnas = Object.keys(conceptosTotales).sort()

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 150 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <select className="select" style={{ minWidth: 220 }} value={filtroCentro} onChange={e => setFiltroCentro(e.target.value)}>
          <option value="">Todos los centros de cuotas</option>
          {centrosCuotas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 140 }} />
        <input className="input" type="date" value={filtroA}  onChange={e => setFiltroA(e.target.value)}  style={{ width: 140 }} />
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="card" style={{ padding: '14px 20px', flex: '1 1 180px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Cuotas</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2563eb' }}>{fmt(totalGeneral)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{totalRecibos} recibo{totalRecibos !== 1 ? 's' : ''} · {grupos.length} sección{grupos.length !== 1 ? 'es' : ''}</div>
        </div>
        {hayConceptos && Object.entries(conceptosTotales).sort((a, b) => b[1] - a[1]).map(([nombre, total]) => (
          <div key={nombre} className="card" style={{ padding: '14px 20px', flex: '1 1 140px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{nombre}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(total)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {totalGeneral > 0 ? Math.round((total / totalGeneral) * 100) : 0}% del total
            </div>
          </div>
        ))}
      </div>

      <PrintBar
        title="Ingresos-Cuotas-Seccion-Concepto"
        count={totalRecibos}
        reportTitle="Cuotas Residenciales — por Sección y Concepto"
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={collapseAll}>Colapsar todo</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
        </div>
      ) : grupos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin registros con los filtros aplicados</div>
      ) : (
        <div id="reporte-print-area" className="card" style={{ overflow: 'auto' }}>
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 220 }}>
                  Sección / Recibo
                </th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Fecha
                </th>
                {hayConceptos && conceptosColumnas.map(c => (
                  <th key={c} style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 120 }}>
                    {c}
                  </th>
                ))}
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 120 }}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => {
                const isOpen = expanded.has(g.nombre_seccion)
                return (
                  <>
                    {/* Fila de sección */}
                    <tr key={`sec-${g.nombre_seccion}`} onClick={() => toggle(g.nombre_seccion)}
                      style={{ background: '#eff6ff', cursor: 'pointer', borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isOpen
                            ? <ChevronDown size={14} style={{ color: '#2563eb' }} />
                            : <ChevronRight size={14} style={{ color: '#2563eb' }} />}
                          <span style={{ color: '#1d4ed8' }}>{g.nombre_seccion}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                            ({g.recibos.length} recibo{g.recibos.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      </td>
                      <td />
                      {hayConceptos && conceptosColumnas.map(c => (
                        <td key={c} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: g.conceptos[c] ? '#1d4ed8' : 'var(--text-muted)' }}>
                          {g.conceptos[c] ? fmt(g.conceptos[c]) : '—'}
                        </td>
                      ))}
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>
                        {fmt(g.total)}
                      </td>
                    </tr>
                    {/* Recibos dentro de la sección */}
                    {isOpen && g.recibos.sort((a, b) => b.fecha.localeCompare(a.fecha)).map(r => {
                      // Monto de esta sección en este recibo
                      const montoSec = r.secciones.find(s => s.nombre_seccion === g.nombre_seccion)?.monto ?? 0
                      const centroNombre = r.id_centro_ingreso_fk ? (centroMap[r.id_centro_ingreso_fk]?.nombre ?? '—') : '—'
                      const conceptosMap = Object.fromEntries(r.conceptos.map(c => [c.nombre_concepto, c.monto]))
                      return (
                        <tr key={`r-${r.id}-${g.nombre_seccion}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 14px 8px 38px', fontSize: 12 }}>
                            <span style={{ fontFamily: 'monospace', color: 'var(--blue)' }}>
                              {r.folio ?? `ING-${r.id}`}
                            </span>
                            {!filtroCentro && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                                {centroNombre}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {fmtF(r.fecha)}
                          </td>
                          {hayConceptos && conceptosColumnas.map(c => (
                            <td key={c} style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, color: conceptosMap[c] ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                              {conceptosMap[c] ? fmt(conceptosMap[c]) : '—'}
                            </td>
                          ))}
                          <td style={{ padding: '8px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
                            {fmt(montoSec)}
                          </td>
                        </tr>
                      )
                    })}
                  </>
                )
              })}
              {/* Total general */}
              <tr style={{ background: '#0f172a', borderTop: '2px solid #334155' }}>
                <td colSpan={2} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                  Total General · {totalRecibos} recibo{totalRecibos !== 1 ? 's' : ''}
                </td>
                {hayConceptos && conceptosColumnas.map(c => (
                  <td key={c} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#93c5fd' }}>
                    {conceptosTotales[c] ? fmt(conceptosTotales[c]) : '—'}
                  </td>
                ))}
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#93c5fd' }}>
                  {fmt(totalGeneral)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
