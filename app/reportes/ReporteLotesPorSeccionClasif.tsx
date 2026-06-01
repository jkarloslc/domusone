'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCfg } from '@/lib/supabase'
import { RefreshCw, Filter, ChevronDown, ChevronRight } from 'lucide-react'
import { PrintBar } from './utils'

const fmt = (n: number | null | undefined) =>
  n != null ? n.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'
const fmtPeso = (n: number | null | undefined) =>
  n != null ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

const STATUS_COLOR: Record<string, string> = {
  Vendido:   '#15803d',
  Libre:     '#1d4ed8',
  Bloqueado: '#dc2626',
}

export default function ReporteLotesPorSeccionClasif() {
  const [lotes,    setLotes]    = useState<any[]>([])
  const [secciones,    setSecciones]    = useState<any[]>([])
  const [clasificaciones, setClasificaciones] = useState<any[]>([])
  const [tiposLote,    setTiposLote]    = useState<Record<number, string>>({})
  const [loading,  setLoading]  = useState(true)

  const [filterSec,   setFilterSec]   = useState('')
  const [filterClasif, setFilterClasif] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // sección expandida → clasificaciones expandidas dentro de ella
  const [expandedSec,   setExpandedSec]   = useState<Record<string, boolean>>({})
  const [expandedClasif, setExpandedClasif] = useState<Record<string, boolean>>({})

  useEffect(() => {
    Promise.all([
      dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('clasificacion').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('tipos_lote').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([{ data: secs }, { data: clasifs }, { data: tipos }]) => {
      setSecciones(secs ?? [])
      setClasificaciones(clasifs ?? [])
      const tMap: Record<number, string> = {}
      ;(tipos ?? []).forEach((t: any) => { tMap[t.id] = t.nombre })
      setTiposLote(tMap)
    })
  }, [])

  const fetchLotes = useCallback(async () => {
    setLoading(true)
    let q = dbCat.from('lotes').select('*').order('cve_lote')
    if (filterSec)    q = q.eq('id_seccion_fk', Number(filterSec))
    if (filterClasif) q = q.eq('id_clasificacion_fk', Number(filterClasif))
    if (filterStatus) q = q.eq('status_lote', filterStatus)
    const { data } = await q
    setLotes(data ?? [])
    setLoading(false)
  }, [filterSec, filterClasif, filterStatus])

  useEffect(() => { fetchLotes() }, [fetchLotes])

  // Build lookup maps
  const secMap: Record<number, string> = {}
  secciones.forEach(s => { secMap[s.id] = s.nombre })
  const clasifMap: Record<number, string> = {}
  clasificaciones.forEach(c => { clasifMap[c.id] = c.nombre })

  // Group: seccion → clasificacion → lotes[]
  type Grup = Record<string, Record<string, any[]>>
  const grouped: Grup = {}
  lotes.forEach(l => {
    const sec   = l.id_seccion_fk    ? (secMap[l.id_seccion_fk]    ?? 'Sin sección')      : 'Sin sección'
    const clas  = l.id_clasificacion_fk ? (clasifMap[l.id_clasificacion_fk] ?? 'Sin clasificación') : 'Sin clasificación'
    if (!grouped[sec])        grouped[sec] = {}
    if (!grouped[sec][clas])  grouped[sec][clas] = []
    grouped[sec][clas].push(l)
  })

  const seccionesOrdenadas = Object.keys(grouped).sort()

  const toggleSec = (sec: string) =>
    setExpandedSec(e => ({ ...e, [sec]: e[sec] === false ? true : false }))
  const toggleClasif = (key: string) =>
    setExpandedClasif(e => ({ ...e, [key]: e[key] === false ? true : false }))

  const expandAll = () => {
    const s: Record<string, boolean> = {}
    const c: Record<string, boolean> = {}
    seccionesOrdenadas.forEach(sec => {
      s[sec] = true
      Object.keys(grouped[sec]).forEach(cl => { c[`${sec}::${cl}`] = true })
    })
    setExpandedSec(s)
    setExpandedClasif(c)
  }
  const collapseAll = () => {
    const s: Record<string, boolean> = {}
    seccionesOrdenadas.forEach(sec => { s[sec] = false })
    setExpandedSec(s)
    setExpandedClasif({})
  }

  // KPIs
  const totalLotes    = lotes.length
  const totalVendidos = lotes.filter(l => l.status_lote === 'Vendido').length
  const totalLibres   = lotes.filter(l => l.status_lote === 'Libre').length
  const totalBloqueados = lotes.filter(l => l.status_lote === 'Bloqueado').length
  const totalSuperficie = lotes.reduce((a, l) => a + (l.superficie ?? 0), 0)
  const totalValor      = lotes.reduce((a, l) => a + (l.valor_operacion ? Number(l.valor_operacion) : 0), 0)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="select" style={{ minWidth: 180 }} value={filterSec} onChange={e => setFilterSec(e.target.value)}>
            <option value="">Todas las secciones</option>
            {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <select className="select" style={{ minWidth: 180 }} value={filterClasif} onChange={e => setFilterClasif(e.target.value)}>
          <option value="">Todas las clasificaciones</option>
          {clasificaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {['Vendido', 'Libre', 'Bloqueado'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn-ghost" onClick={fetchLotes}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={collapseAll}>Colapsar todo</button>
        </div>
      </div>

      <PrintBar title="Lotes_por_Seccion_Clasificacion" count={totalLotes} reportTitle="Lotes por Sección y Clasificación" />

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total Lotes',    value: totalLotes,      color: 'var(--blue)' },
          { label: 'Vendidos',       value: totalVendidos,   color: '#15803d' },
          { label: 'Libres',         value: totalLibres,     color: '#1d4ed8' },
          { label: 'Bloqueados',     value: totalBloqueados, color: '#dc2626' },
          { label: 'Superficie m²',  value: fmt(totalSuperficie),  color: 'var(--text-primary)', raw: true },
          { label: 'Valor Operación', value: fmtPeso(totalValor),  color: '#0f766e', raw: true },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 16px', flex: '1 1 140px', maxWidth: 200, borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>
              {k.raw ? k.value : k.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
        </div>
      ) : lotes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin registros para los filtros seleccionados</div>
      ) : (
        <div id="reporte-print-area" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {seccionesOrdenadas.map(sec => {
            const clasifsDeSec  = grouped[sec]
            const clasifsOrden  = Object.keys(clasifsDeSec).sort()
            const totalSec      = clasifsOrden.reduce((a, cl) => a + clasifsDeSec[cl].length, 0)
            const superficieSec = clasifsOrden.reduce((a, cl) => a + clasifsDeSec[cl].reduce((b, l) => b + (l.superficie ?? 0), 0), 0)
            const valorSec      = clasifsOrden.reduce((a, cl) => a + clasifsDeSec[cl].reduce((b, l) => b + (l.valor_operacion ? Number(l.valor_operacion) : 0), 0), 0)
            const vendidosSec   = clasifsOrden.reduce((a, cl) => a + clasifsDeSec[cl].filter(l => l.status_lote === 'Vendido').length, 0)
            const expanded      = expandedSec[sec] !== false // open by default

            return (
              <div key={sec} className="card" style={{ overflow: 'hidden' }}>
                {/* Header sección */}
                <button
                  onClick={() => toggleSec(sec)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--blue-pale)', border: 'none', cursor: 'pointer',
                    borderBottom: expanded ? '1px solid #e2e8f0' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {expanded
                      ? <ChevronDown  size={14} style={{ color: 'var(--blue)' }} />
                      : <ChevronRight size={14} style={{ color: 'var(--blue)' }} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{sec}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {totalSec} lote{totalSec !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    {vendidosSec > 0 && (
                      <span style={{ color: '#15803d', fontWeight: 600 }}>{vendidosSec} vendido{vendidosSec !== 1 ? 's' : ''}</span>
                    )}
                    <span style={{ color: 'var(--text-secondary)' }}>{fmt(superficieSec)} m²</span>
                    {valorSec > 0 && (
                      <span style={{ color: '#0f766e', fontWeight: 600 }}>{fmtPeso(valorSec)}</span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div>
                    {clasifsOrden.map(clasif => {
                      const lotesClasif   = clasifsDeSec[clasif]
                      const key           = `${sec}::${clasif}`
                      const expClasif     = expandedClasif[key] !== false // open by default
                      const supClasif     = lotesClasif.reduce((a, l) => a + (l.superficie ?? 0), 0)
                      const valClasif     = lotesClasif.reduce((a, l) => a + (l.valor_operacion ? Number(l.valor_operacion) : 0), 0)
                      const vendClasif    = lotesClasif.filter(l => l.status_lote === 'Vendido').length
                      const libresClasif  = lotesClasif.filter(l => l.status_lote === 'Libre').length

                      return (
                        <div key={key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          {/* Sub-header clasificación */}
                          <button
                            onClick={() => toggleClasif(key)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '9px 16px 9px 32px', background: '#f8fafc', border: 'none', cursor: 'pointer',
                              borderBottom: expClasif ? '1px solid #e2e8f0' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {expClasif
                                ? <ChevronDown  size={12} style={{ color: '#64748b' }} />
                                : <ChevronRight size={12} style={{ color: '#64748b' }} />}
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{clasif}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {lotesClasif.length} lote{lotesClasif.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)' }}>
                              {vendClasif > 0  && <span style={{ color: '#15803d', fontWeight: 600 }}>{vendClasif} vendido{vendClasif !== 1 ? 's' : ''}</span>}
                              {libresClasif > 0 && <span style={{ color: '#1d4ed8' }}>{libresClasif} libre{libresClasif !== 1 ? 's' : ''}</span>}
                              <span>{fmt(supClasif)} m²</span>
                              {valClasif > 0 && <span style={{ color: '#0f766e' }}>{fmtPeso(valClasif)}</span>}
                            </div>
                          </button>

                          {expClasif && (
                            <table id="reporte-table">
                              <thead>
                                <tr>
                                  <th>Clave Lote</th>
                                  <th>Tipo</th>
                                  <th style={{ textAlign: 'right' }}>Superficie m²</th>
                                  <th>Status</th>
                                  <th>Cobranza</th>
                                  <th>Vendedor</th>
                                  <th style={{ textAlign: 'right' }}>Valor Operación</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lotesClasif.map(l => {
                                  const stColor = STATUS_COLOR[l.status_lote ?? ''] ?? 'var(--text-muted)'
                                  return (
                                    <tr key={l.id}>
                                      <td style={{ fontWeight: 600, color: 'var(--blue)' }}>
                                        {l.cve_lote ?? `#${l.lote}`}
                                      </td>
                                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {l.id_tipo_lote_fk ? (tiposLote[l.id_tipo_lote_fk] ?? l.tipo_lote ?? '—') : (l.tipo_lote ?? '—')}
                                      </td>
                                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {l.superficie ? fmt(l.superficie) : '—'}
                                      </td>
                                      <td>
                                        <span style={{ fontSize: 11, fontWeight: 600,
                                          padding: '2px 8px', borderRadius: 20,
                                          color: stColor, background: stColor + '15', border: `1px solid ${stColor}40` }}>
                                          {l.status_lote ?? '—'}
                                        </span>
                                      </td>
                                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {l.clasificacion_cobranza ?? '—'}
                                      </td>
                                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                        {l.vendedor ?? '—'}
                                      </td>
                                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                                        {fmtPeso(l.valor_operacion ? Number(l.valor_operacion) : null)}
                                      </td>
                                    </tr>
                                  )
                                })}
                                {/* Subtotal clasificación */}
                                <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                                  <td colSpan={2} style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 16 }}>
                                    Subtotal — {lotesClasif.length} lote{lotesClasif.length !== 1 ? 's' : ''}
                                  </td>
                                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                                    {fmt(supClasif)}
                                  </td>
                                  <td colSpan={3} />
                                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: '#0f766e' }}>
                                    {valClasif > 0 ? fmtPeso(valClasif) : '—'}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      )
                    })}

                    {/* Total sección */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '8px 16px',
                      background: '#eff6ff', fontSize: 12, fontWeight: 600, borderTop: '1px solid #bfdbfe' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Total sección: {totalSec} lotes</span>
                      <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(superficieSec)} m²</span>
                      {valorSec > 0 && (
                        <span style={{ color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>{fmtPeso(valorSec)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
