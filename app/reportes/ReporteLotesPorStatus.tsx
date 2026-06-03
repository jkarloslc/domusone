'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCfg } from '@/lib/supabase'
import { RefreshCw, Filter, ChevronDown, ChevronRight } from 'lucide-react'
import { PrintBar } from './utils'

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 0 })
const fmtPeso = (n: number) =>
  n > 0 ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

const STATUSES = ['Vendido', 'Libre', 'Bloqueado']

const STATUS_META: Record<string, { color: string; bg: string; border: string; headerBg: string }> = {
  Vendido:   { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', headerBg: '#dcfce7' },
  Libre:     { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', headerBg: '#dbeafe' },
  Bloqueado: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', headerBg: '#fee2e2' },
}

export default function ReporteLotesPorStatus() {
  const [lotes,           setLotes]           = useState<any[]>([])
  const [secciones,       setSecciones]       = useState<any[]>([])
  const [clasificaciones, setClasificaciones] = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)
  const [queryError,      setQueryError]      = useState<string | null>(null)

  const [filterSec,    setFilterSec]    = useState('')
  const [filterClasif, setFilterClasif] = useState('')
  const [filterStatus, setFilterStatus] = useState('')   // '' = todos

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Catálogos
  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
    dbCfg.from('clasificacion').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setClasificaciones(data ?? []))
  }, [])

  const fetchLotes = useCallback(async () => {
    setLoading(true)
    setQueryError(null)
    let q = dbCat.from('lotes').select('*').order('cve_lote')
    if (filterSec)    q = q.eq('id_seccion_fk', Number(filterSec))
    if (filterClasif) q = q.eq('id_clasificacion_fk', Number(filterClasif))
    if (filterStatus) q = q.eq('status_lote', filterStatus)
    const { data, error } = await q
    if (error) setQueryError(error.message)
    setLotes(data ?? [])
    setLoading(false)
  }, [filterSec, filterClasif, filterStatus])

  useEffect(() => { fetchLotes() }, [fetchLotes])

  // Lookup maps
  const secMap: Record<number, string> = {}
  secciones.forEach(s => { secMap[s.id] = s.nombre })
  const clasifMap: Record<number, string> = {}
  clasificaciones.forEach(c => { clasifMap[c.id] = c.nombre })

  // Agrupar por status
  const porStatus: Record<string, any[]> = {}
  lotes.forEach(l => {
    const st = l.status_lote ?? 'Sin status'
    if (!porStatus[st]) porStatus[st] = []
    porStatus[st].push(l)
  })

  // Orden fijo: Vendido → Libre → Bloqueado → otros
  const statusOrdenados = [
    ...STATUSES.filter(s => porStatus[s]?.length),
    ...Object.keys(porStatus).filter(s => !STATUSES.includes(s)),
  ]

  const toggleStatus = (st: string) =>
    setExpanded(e => ({ ...e, [st]: e[st] === false }))

  const expandAll  = () => {
    const e: Record<string, boolean> = {}
    statusOrdenados.forEach(s => { e[s] = true })
    setExpanded(e)
  }
  const collapseAll = () => {
    const e: Record<string, boolean> = {}
    statusOrdenados.forEach(s => { e[s] = false })
    setExpanded(e)
  }

  // KPIs
  const totalLotes    = lotes.length
  const totalVendidos = lotes.filter(l => l.status_lote === 'Vendido').length
  const totalLibres   = lotes.filter(l => l.status_lote === 'Libre').length
  const totalBloq     = lotes.filter(l => l.status_lote === 'Bloqueado').length
  const supTotal      = lotes.reduce((a, l) => a + (l.superficie ?? 0), 0)
  const valTotal      = lotes.reduce((a, l) => a + (l.valor_operacion ? Number(l.valor_operacion) : 0), 0)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 175 }} value={filterSec} onChange={e => setFilterSec(e.target.value)}>
            <option value="">Todas las secciones</option>
            {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <select className="select" style={{ minWidth: 175 }} value={filterClasif} onChange={e => setFilterClasif(e.target.value)}>
          <option value="">Todas las clasificaciones</option>
          {clasificaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchLotes}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={collapseAll}>Colapsar todo</button>
        </div>
      </div>

      <PrintBar title="Lotes_por_Status" count={totalLotes} reportTitle="Lotes por Status" />

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total',       value: totalLotes,    color: 'var(--blue)',      pct: null },
          { label: 'Vendidos',    value: totalVendidos, color: '#15803d',          pct: totalLotes ? Math.round(totalVendidos / totalLotes * 100) : 0 },
          { label: 'Libres',      value: totalLibres,   color: '#1d4ed8',          pct: totalLotes ? Math.round(totalLibres   / totalLotes * 100) : 0 },
          { label: 'Bloqueados',  value: totalBloq,     color: '#dc2626',          pct: totalLotes ? Math.round(totalBloq     / totalLotes * 100) : 0 },
          { label: 'Sup. total m²', value: fmt(supTotal), color: 'var(--text-primary)', pct: null },
          { label: 'Valor total', value: fmtPeso(valTotal), color: '#0f766e',      pct: null },
        ].map(k => (
          <div key={k.label} className="card"
            style={{ padding: '10px 16px', flex: '1 1 120px', maxWidth: 185, borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>
              {k.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{k.label}</span>
              {k.pct !== null && <span style={{ fontWeight: 600, color: k.color }}>{k.pct}%</span>}
            </div>
          </div>
        ))}
      </div>

      {queryError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>
          Error: {queryError}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : lotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Sin registros para los filtros seleccionados
        </div>
      ) : (
        <div id="reporte-print-area" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {statusOrdenados.map(st => {
            const grupo    = porStatus[st]
            const meta     = STATUS_META[st]
            const isOpen   = expanded[st] !== false   // abierto por default
            const supGrupo = grupo.reduce((a, l) => a + (l.superficie ?? 0), 0)
            const valGrupo = grupo.reduce((a, l) => a + (l.valor_operacion ? Number(l.valor_operacion) : 0), 0)
            const pct      = totalLotes ? Math.round(grupo.length / totalLotes * 100) : 0

            return (
              <div key={st} className="card" style={{ overflow: 'hidden' }}>
                {/* Header status */}
                <button onClick={() => toggleStatus(st)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', border: 'none', cursor: 'pointer',
                    background: meta?.headerBg ?? '#f8fafc',
                    borderBottom: isOpen ? `1px solid ${meta?.border ?? '#e2e8f0'}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isOpen
                      ? <ChevronDown  size={14} style={{ color: meta?.color ?? '#64748b' }} />
                      : <ChevronRight size={14} style={{ color: meta?.color ?? '#64748b' }} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: meta?.color ?? '#64748b' }}>{st}</span>
                    <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 20, fontWeight: 600,
                      color: meta?.color ?? '#64748b',
                      background: (meta?.color ?? '#64748b') + '15',
                      border: `1px solid ${meta?.border ?? '#e2e8f0'}` }}>
                      {grupo.length} lote{grupo.length !== 1 ? 's' : ''} · {pct}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(supGrupo)} m²</span>
                    {valGrupo > 0 && (
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: meta?.color ?? '#64748b', fontWeight: 600 }}>
                        {fmtPeso(valGrupo)}
                      </span>
                    )}
                  </div>
                </button>

                {/* Tabla lotes */}
                {isOpen && (
                  <table id="reporte-table">
                    <thead>
                      <tr>
                        <th>Clave Lote</th>
                        <th>Sección</th>
                        <th>Clasificación</th>
                        <th>Tipo</th>
                        <th style={{ textAlign: 'right' }}>Superficie m²</th>
                        <th>Cobranza</th>
                        <th>Vendedor</th>
                        <th style={{ textAlign: 'right' }}>Valor Operación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap' }}>
                            {l.cve_lote ?? (l.lote ? `#${l.lote}` : '—')}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            {l.id_seccion_fk ? (secMap[l.id_seccion_fk] ?? '—') : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {l.id_clasificacion_fk ? (clasifMap[l.id_clasificacion_fk] ?? '—') : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {l.tipo_lote ?? '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {l.superficie ? fmt(l.superficie) : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {l.clasificacion_cobranza ?? '—'}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {l.vendedor ?? '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                            {l.valor_operacion ? fmtPeso(Number(l.valor_operacion)) : '—'}
                          </td>
                        </tr>
                      ))}
                      {/* Subtotal del grupo */}
                      <tr style={{ background: meta?.bg ?? '#f8fafc', fontWeight: 600 }}>
                        <td colSpan={4} style={{ fontSize: 11, color: meta?.color ?? '#64748b', paddingLeft: 12 }}>
                          Subtotal {st} — {grupo.length} lote{grupo.length !== 1 ? 's' : ''}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: meta?.color ?? '#64748b' }}>
                          {fmt(supGrupo)}
                        </td>
                        <td colSpan={2} />
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          color: meta?.color ?? '#64748b' }}>
                          {fmtPeso(valGrupo)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
