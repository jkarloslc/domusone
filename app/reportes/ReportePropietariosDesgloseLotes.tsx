'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { RefreshCw, Filter, ChevronDown, ChevronRight, User } from 'lucide-react'
import { PrintBar } from './utils'

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 0 })
const fmtPeso = (n: number) =>
  n > 0 ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

const STATUS_COLOR: Record<string, string> = {
  Vendido: '#15803d', Libre: '#1d4ed8', Bloqueado: '#dc2626',
}

export default function ReportePropietariosDesgloseLotes() {
  const [rows,            setRows]            = useState<any[]>([])   // enriched relations
  const [secciones,       setSecciones]       = useState<any[]>([])
  const [clasificaciones, setClasificaciones] = useState<any[]>([])
  const [loading,         setLoading]         = useState(true)
  const [queryError,      setQueryError]      = useState<string | null>(null)

  const [filterSec,    setFilterSec]    = useState('')
  const [filterClasif, setFilterClasif] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search,       setSearch]       = useState('')

  const [expandedSec,  setExpandedSec]  = useState<Record<string, boolean>>({})
  const [expandedProp, setExpandedProp] = useState<Record<string, boolean>>({})

  // Catálogos
  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSecciones(data ?? []))
    dbCfg.from('clasificacion').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setClasificaciones(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setQueryError(null)

    // 1. Relaciones propietario ↔ lote
    const { data: rels, error: relsError } = await dbCtrl
      .from('propietarios_lotes')
      .select('*')
      .eq('activo', true)
    if (relsError) { setQueryError(relsError.message); setLoading(false); return }
    if (!rels?.length) { setRows([]); setLoading(false); return }

    // 2. IDs únicos
    const loteIds = Array.from(new Set(rels.map((r: any) => r.id_lote_fk).filter(Boolean)))
    const propIds = Array.from(new Set(rels.map((r: any) => r.id_propietario_fk).filter(Boolean)))

    // 3. Lotes y propietarios en paralelo
    const [{ data: lotesData, error: lotesErr }, { data: propsData, error: propsErr }] =
      await Promise.all([
        dbCat.from('lotes').select('*').in('id', loteIds),
        dbCat.from('propietarios')
          .select('id, nombre, apellido_paterno, apellido_materno, rfc, tipo_persona')
          .in('id', propIds),
      ])

    if (lotesErr)  { setQueryError(lotesErr.message);  setLoading(false); return }
    if (propsErr)  { setQueryError(propsErr.message);  setLoading(false); return }

    const loteMap: Record<number, any> = {}
    ;(lotesData ?? []).forEach((l: any) => { loteMap[l.id] = l })
    const propMap: Record<number, any> = {}
    ;(propsData ?? []).forEach((p: any) => { propMap[p.id] = p })

    // 4. Enriquecer relaciones
    let enriched = rels.map((r: any) => ({
      ...r,
      _lote: loteMap[r.id_lote_fk]          ?? null,
      _prop: propMap[r.id_propietario_fk]    ?? null,
    })).filter((r: any) => r._lote && r._prop)   // solo vínculos completos

    setRows(enriched)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Mapas para nombres
  const secMap: Record<number, string> = {}
  secciones.forEach(s => { secMap[s.id] = s.nombre })
  const clasifMap: Record<number, string> = {}
  clasificaciones.forEach(c => { clasifMap[c.id] = c.nombre })

  const propNombre = (p: any) =>
    [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') || p.razon_social || '—'

  // Aplicar filtros en JS (secciones y clasificaciones se filtran por FK del lote)
  const filtered = rows.filter(r => {
    const lote = r._lote
    if (filterSec    && lote?.id_seccion_fk      !== Number(filterSec))    return false
    if (filterClasif && lote?.id_clasificacion_fk !== Number(filterClasif)) return false
    if (filterStatus && lote?.status_lote         !== filterStatus)         return false
    if (search) {
      const nombre = propNombre(r._prop).toLowerCase()
      const clave  = (lote?.cve_lote ?? '').toLowerCase()
      if (!nombre.includes(search.toLowerCase()) && !clave.includes(search.toLowerCase())) return false
    }
    return true
  })

  // Construir jerarquía: sección → propietario → clasificación → lotes[]
  type HierMap = Record<string, Record<string, Record<string, any[]>>>
  const hier: HierMap = {}

  filtered.forEach(r => {
    const lote  = r._lote
    const sec   = lote?.id_seccion_fk      ? (secMap[lote.id_seccion_fk]           ?? 'Sin sección')         : 'Sin sección'
    const clas  = lote?.id_clasificacion_fk ? (clasifMap[lote.id_clasificacion_fk]  ?? 'Sin clasificación')   : 'Sin clasificación'
    const prop  = propNombre(r._prop)

    if (!hier[sec])              hier[sec] = {}
    if (!hier[sec][prop])        hier[sec][prop] = {}
    if (!hier[sec][prop][clas])  hier[sec][prop][clas] = []
    hier[sec][prop][clas].push(r)
  })

  const seccionesOrdenadas = Object.keys(hier).sort()

  // Expand / collapse helpers
  const toggleSec  = (sec: string)  => setExpandedSec(e  => ({ ...e, [sec]:  e[sec]  === false }))
  const toggleProp = (key: string)  => setExpandedProp(e => ({ ...e, [key]:  e[key]  === false }))

  const expandAll = () => {
    const s: Record<string, boolean> = {}
    const p: Record<string, boolean> = {}
    seccionesOrdenadas.forEach(sec => {
      s[sec] = true
      Object.keys(hier[sec]).forEach(prop => { p[`${sec}::${prop}`] = true })
    })
    setExpandedSec(s); setExpandedProp(p)
  }
  const collapseAll = () => {
    const s: Record<string, boolean> = {}
    seccionesOrdenadas.forEach(sec => { s[sec] = false })
    setExpandedSec(s); setExpandedProp({})
  }

  // KPIs globales (sobre filtered)
  const totalRels      = filtered.length
  const totalProps     = new Set(filtered.map(r => r.id_propietario_fk)).size
  const totalLotesU    = new Set(filtered.map(r => r.id_lote_fk)).size
  const totalVendidos  = new Set(filtered.filter(r => r._lote?.status_lote === 'Vendido').map(r => r.id_lote_fk)).size
  const totalLibres    = new Set(filtered.filter(r => r._lote?.status_lote === 'Libre').map(r => r.id_lote_fk)).size
  const totalSuperficie = Array.from(new Set(filtered.map(r => r.id_lote_fk)))
    .reduce((a, id) => {
      const lote = filtered.find(r => r.id_lote_fk === id)?._lote
      return a + (lote?.superficie ?? 0)
    }, 0)

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
        <select className="select" style={{ minWidth: 130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {['Vendido', 'Libre', 'Bloqueado'].map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="input" style={{ minWidth: 200 }} placeholder="Buscar propietario o lote…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={expandAll}>Expandir todo</button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={collapseAll}>Colapsar todo</button>
        </div>
      </div>

      <PrintBar title="Propietarios_Lotes_Seccion_Clasif" count={totalRels}
        reportTitle="Propietarios — Desglose por Sección, Clasificación y Lote" />

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Propietarios',  value: totalProps,     color: 'var(--blue)' },
          { label: 'Lotes únicos',  value: totalLotesU,    color: '#6366f1' },
          { label: 'Vendidos',      value: totalVendidos,  color: '#15803d' },
          { label: 'Libres',        value: totalLibres,    color: '#1d4ed8' },
          { label: 'Superficie m²', value: fmt(totalSuperficie), color: 'var(--text-primary)' },
        ].map(k => (
          <div key={k.label} className="card"
            style={{ padding: '10px 16px', flex: '1 1 120px', maxWidth: 180, borderTop: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.label}</div>
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
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          Sin registros para los filtros seleccionados
        </div>
      ) : (
        <div id="reporte-print-area" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {seccionesOrdenadas.map(sec => {
            const propsEnSec     = Object.keys(hier[sec]).sort()
            const totalLotesSec  = propsEnSec.reduce((a, p) =>
              a + Object.values(hier[sec][p]).reduce((b, arr) => b + arr.length, 0), 0)
            const totalPropsSec  = propsEnSec.length
            const expandedS      = expandedSec[sec] !== false  // open by default

            return (
              <div key={sec} className="card" style={{ overflow: 'hidden' }}>
                {/* ── Header SECCIÓN ── */}
                <button onClick={() => toggleSec(sec)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: 'var(--blue-pale)', border: 'none', cursor: 'pointer',
                    borderBottom: expandedS ? '1px solid #e2e8f0' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {expandedS
                      ? <ChevronDown  size={14} style={{ color: 'var(--blue)' }} />
                      : <ChevronRight size={14} style={{ color: 'var(--blue)' }} />}
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>{sec}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      · {totalPropsSec} propietario{totalPropsSec !== 1 ? 's' : ''}
                      &nbsp;·&nbsp;{totalLotesSec} lote{totalLotesSec !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>

                {expandedS && propsEnSec.map(prop => {
                  const clasifsEnProp = Object.keys(hier[sec][prop]).sort()
                  const propKey       = `${sec}::${prop}`
                  const expandedP     = expandedProp[propKey] !== false  // open by default
                  const totalLotesProp = clasifsEnProp.reduce((a, cl) => a + hier[sec][prop][cl].length, 0)
                  // cualquier row tiene _prop
                  const propData = hier[sec][prop][clasifsEnProp[0]][0]._prop

                  return (
                    <div key={propKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {/* ── Sub-header PROPIETARIO ── */}
                      <button onClick={() => toggleProp(propKey)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 20px', background: '#f8fafc', border: 'none', cursor: 'pointer',
                          borderBottom: expandedP ? '1px solid #e2e8f0' : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {expandedP
                            ? <ChevronDown  size={12} style={{ color: '#64748b' }} />
                            : <ChevronRight size={12} style={{ color: '#64748b' }} />}
                          <div style={{ width: 26, height: 26, borderRadius: '50%',
                            background: '#6366f115', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={12} style={{ color: '#6366f1' }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{prop}</span>
                          {propData?.rfc && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {propData.rfc}
                            </span>
                          )}
                          {propData?.tipo_persona && (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10,
                              background: '#e0e7ff', color: '#4f46e5' }}>
                              {propData.tipo_persona}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {totalLotesProp} lote{totalLotesProp !== 1 ? 's' : ''}
                        </span>
                      </button>

                      {expandedP && (
                        <div>
                          {clasifsEnProp.map(clasif => {
                            const lotesEnClasif = hier[sec][prop][clasif]

                            return (
                              <div key={clasif} style={{ borderBottom: '1px solid #f8fafc' }}>
                                {/* ── Sub-sub-header CLASIFICACIÓN ── */}
                                <div style={{ padding: '6px 32px', background: '#f0f7ff',
                                  borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#3b5bdb',
                                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {clasif}
                                  </span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    · {lotesEnClasif.length} lote{lotesEnClasif.length !== 1 ? 's' : ''}
                                  </span>
                                </div>

                                {/* ── Tabla LOTES ── */}
                                <table id="reporte-table">
                                  <thead>
                                    <tr>
                                      <th style={{ paddingLeft: 32 }}>Clave Lote</th>
                                      <th>Tipo</th>
                                      <th style={{ textAlign: 'right' }}>Superficie m²</th>
                                      <th>Status</th>
                                      <th>Cobranza</th>
                                      <th style={{ textAlign: 'right' }}>% Propiedad</th>
                                      <th style={{ textAlign: 'right' }}>Valor Operación</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lotesEnClasif.map((rel: any) => {
                                      const l = rel._lote
                                      const stColor = STATUS_COLOR[l?.status_lote ?? ''] ?? 'var(--text-muted)'
                                      return (
                                        <tr key={`${rel.id_propietario_fk}-${rel.id_lote_fk}`}>
                                          <td style={{ paddingLeft: 32, fontWeight: 600, color: 'var(--blue)' }}>
                                            {l?.cve_lote ?? `#${l?.lote}`}
                                            {rel.es_principal && (
                                              <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px',
                                                borderRadius: 8, background: '#dcfce7', color: '#15803d' }}>
                                                Principal
                                              </span>
                                            )}
                                          </td>
                                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            {l?.tipo_lote ?? '—'}
                                          </td>
                                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                            {l?.superficie ? fmt(l.superficie) : '—'}
                                          </td>
                                          <td>
                                            <span style={{ fontSize: 11, fontWeight: 600,
                                              padding: '2px 8px', borderRadius: 20,
                                              color: stColor, background: stColor + '15', border: `1px solid ${stColor}40` }}>
                                              {l?.status_lote ?? '—'}
                                            </span>
                                          </td>
                                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            {l?.clasificacion_cobranza ?? '—'}
                                          </td>
                                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                                            {rel.porcentaje ? `${rel.porcentaje}%` : '—'}
                                          </td>
                                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                                            {l?.valor_operacion ? fmtPeso(Number(l.valor_operacion)) : '—'}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
