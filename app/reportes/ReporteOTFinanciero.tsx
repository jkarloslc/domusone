'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

const fmt$ = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
const fmtFecha = (f: string | null) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUSES = ['Pendiente','En Proceso','En Pausa','Completada','Cancelada']
const statusColor = (s: string) =>
  s === 'Completada' ? '#15803d' : s === 'En Proceso' ? '#2563eb' :
  s === 'En Pausa' ? '#7c3aed' : s === 'Cancelada' ? '#94a3b8' : '#d97706'

export default function ReporteOTFinanciero() {
  const [rows,        setRows]        = useState<any[]>([])
  const [costMap,     setCostMap]     = useState<Record<number, { mo: number; rec: number }>>({})
  const [ccMap,       setCcMap]       = useState<Record<number, string>>({})
  const [areaMap,     setAreaMap]     = useState<Record<number, string>>({})
  const [frMap,       setFrMap]       = useState<Record<number, string>>({})
  const [areas,       setAreas]       = useState<any[]>([])
  const [centrosCosto, setCentros]    = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)

  // Filtros
  const [fEmpresa, setFEmpresa] = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fCc,      setFCc]      = useState('')
  const [fArea,    setFArea]    = useState('')
  const [fDe,      setFDe]      = useState('')
  const [fA,       setFA]       = useState('')

  // Expansión jerarquía
  const [openCC,    setOpenCC]   = useState<Record<string, boolean>>({})
  const [openArea,  setOpenArea] = useState<Record<string, boolean>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ots }, { data: ccs }, { data: secs }, { data: frs },
           { data: recursos }, { data: moRows }] = await Promise.all([
      dbCtrl.from('ordenes_trabajo').select('*').order('created_at', { ascending: false }),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCtrl.from('ot_recursos').select('id_ot_fk, costo'),
      dbCtrl.from('ot_mano_obra').select('id_ot_fk, costo_total'),
    ])

    const cm: Record<number, string> = {}; (ccs ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
    const am: Record<number, string> = {}; (secs ?? []).forEach((s: any) => { am[s.id] = s.nombre })
    const fm: Record<number, string> = {}; (frs ?? []).forEach((f: any) => { fm[f.id] = f.nombre })
    setCcMap(cm); setAreaMap(am); setFrMap(fm)
    setCentros(ccs ?? [])
    setAreas(secs ?? [])

    // Costos por OT
    const costs: Record<number, { mo: number; rec: number }> = {}
    ;(recursos ?? []).forEach((r: any) => {
      if (!costs[r.id_ot_fk]) costs[r.id_ot_fk] = { mo: 0, rec: 0 }
      costs[r.id_ot_fk].rec += Number(r.costo ?? 0)
    })
    ;(moRows ?? []).forEach((r: any) => {
      if (!costs[r.id_ot_fk]) costs[r.id_ot_fk] = { mo: 0, rec: 0 }
      costs[r.id_ot_fk].mo += Number(r.costo_total ?? 0)
    })
    setCostMap(costs)

    let result = ots ?? []
    if (fEmpresa) result = result.filter((r: any) => r.empresa === fEmpresa)
    if (fStatus)  result = result.filter((r: any) => r.status  === fStatus)
    if (fCc)      result = result.filter((r: any) => String(r.id_centro_costo_fk) === fCc)
    if (fArea)    result = result.filter((r: any) => String(r.id_area_fk) === fArea)
    if (fDe)      result = result.filter((r: any) => r.created_at?.slice(0,10) >= fDe)
    if (fA)       result = result.filter((r: any) => r.created_at?.slice(0,10) <= fA)
    setRows(result)
    setLoading(false)
  }, [fEmpresa, fStatus, fCc, fArea, fDe, fA])

  useEffect(() => { fetchData() }, [fetchData])

  // Agrupar CC → Area → Frente → OTs
  type OTRow = any & { _mo: number; _rec: number; _total: number }
  const grouped: Record<string, { label: string; areas: Record<string, { label: string; frentes: Record<string, { label: string; ots: OTRow[] }> }> }> = {}

  rows.forEach((r: any) => {
    const ccKey  = r.id_centro_costo_fk ? String(r.id_centro_costo_fk) : '__sin_cc'
    const ccLbl  = r.id_centro_costo_fk ? (ccMap[r.id_centro_costo_fk] ?? `#${r.id_centro_costo_fk}`) : 'Sin Centro de Costo'
    const aKey   = r.id_area_fk ? String(r.id_area_fk) : '__sin_area'
    const aLbl   = r.id_area_fk ? (areaMap[r.id_area_fk] ?? `#${r.id_area_fk}`) : 'Sin Área'
    const fKey   = r.id_frente_fk ? String(r.id_frente_fk) : '__sin_frente'
    const fLbl   = r.id_frente_fk ? (frMap[r.id_frente_fk] ?? `#${r.id_frente_fk}`) : 'Sin Frente'
    const c      = costMap[r.id] ?? { mo: 0, rec: 0 }
    const row: OTRow = { ...r, _mo: c.mo, _rec: c.rec, _total: c.mo + c.rec }

    if (!grouped[ccKey]) grouped[ccKey] = { label: ccLbl, areas: {} }
    if (!grouped[ccKey].areas[aKey]) grouped[ccKey].areas[aKey] = { label: aLbl, frentes: {} }
    if (!grouped[ccKey].areas[aKey].frentes[fKey]) grouped[ccKey].areas[aKey].frentes[fKey] = { label: fLbl, ots: [] }
    grouped[ccKey].areas[aKey].frentes[fKey].ots.push(row)
  })

  const totalMO  = rows.reduce((a, r) => a + (costMap[r.id]?.mo  ?? 0), 0)
  const totalRec = rows.reduce((a, r) => a + (costMap[r.id]?.rec ?? 0), 0)
  const totalGen = totalMO + totalRec
  const conCosto = rows.filter(r => (costMap[r.id]?.mo ?? 0) + (costMap[r.id]?.rec ?? 0) > 0).length

  const filteredAreas = fCc
    ? areas.filter((a: any) => String(a.id_centro_costo_fk) === fCc)
    : areas

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px',
        background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 110 }}
          value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}>
          <option value="">Empresa</option>
          <option value="Balvanera">Balvanera</option>
          <option value="Cuadrilla">Cuadrilla</option>
        </select>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 130 }}
          value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 180 }}
          value={fCc} onChange={e => { setFCc(e.target.value); setFArea('') }}>
          <option value="">Centro de Costo</option>
          {centrosCosto.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 160 }}
          value={fArea} onChange={e => setFArea(e.target.value)}>
          <option value="">Área</option>
          {filteredAreas.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <input type="date" className="input" style={{ fontSize: 12, height: 28, padding: '2px 8px', width: 130 }}
          value={fDe} onChange={e => setFDe(e.target.value)} title="Desde" />
        <input type="date" className="input" style={{ fontSize: 12, height: 28, padding: '2px 8px', width: 130 }}
          value={fA} onChange={e => setFA(e.target.value)} title="Hasta" />
        <button className="btn-ghost" style={{ padding: '2px 8px', height: 28 }} onClick={fetchData}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { label: 'OTs',           value: rows.length,       color: 'var(--blue)', bg: 'var(--blue-pale)' },
          { label: 'Con costo reg.', value: conCosto,         color: '#7c3aed',     bg: '#f5f3ff' },
          { label: 'Total MO',      value: fmt$(totalMO),     color: '#b45309',     bg: '#fef3c7' },
          { label: 'Total Recursos', value: fmt$(totalRec),   color: '#0891b2',     bg: '#ecfeff' },
          { label: 'Costo Total',   value: fmt$(totalGen),    color: '#15803d',     bg: '#f0fdf4' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 16px', background: k.bg, flex: '1 1 120px', maxWidth: 220 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <PrintBar title="OT-Financiero-CC-Area" count={rows.length} reportTitle="Reporte Financiero de Órdenes de Trabajo" />

      <div id="reporte-print-area">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin OTs para los filtros aplicados</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(grouped).map(([ccKey, ccGrp]) => {
              const ccMO  = Object.values(ccGrp.areas).flatMap(a => Object.values(a.frentes).flatMap(f => f.ots)).reduce((a, r) => a + r._mo, 0)
              const ccRec = Object.values(ccGrp.areas).flatMap(a => Object.values(a.frentes).flatMap(f => f.ots)).reduce((a, r) => a + r._rec, 0)
              const ccTot = ccMO + ccRec
              const isOpenCC = openCC[ccKey] !== false

              return (
                <div key={ccKey} className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  {/* Fila CC */}
                  <div onClick={() => setOpenCC(p => ({ ...p, [ccKey]: !isOpenCC }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      background: '#1e3a5f', cursor: 'pointer', userSelect: 'none' }}>
                    {isOpenCC ? <ChevronDown size={13} style={{ color: '#93c5fd', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: '#93c5fd', flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e0f2fe', flex: 1 }}>{ccGrp.label}</span>
                    <span style={{ fontSize: 11, color: '#93c5fd' }}>MO: {fmt$(ccMO)}</span>
                    <span style={{ fontSize: 11, color: '#93c5fd', marginLeft: 12 }}>Rec: {fmt$(ccRec)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#7dd3fc', marginLeft: 16, minWidth: 120, textAlign: 'right' }}>{fmt$(ccTot)}</span>
                  </div>

                  {isOpenCC && Object.entries(ccGrp.areas).map(([aKey, aGrp]) => {
                    const aMO  = Object.values(aGrp.frentes).flatMap(f => f.ots).reduce((a, r) => a + r._mo, 0)
                    const aRec = Object.values(aGrp.frentes).flatMap(f => f.ots).reduce((a, r) => a + r._rec, 0)
                    const aTot = aMO + aRec
                    const groupKey = `${ccKey}_${aKey}`
                    const isOpenA  = openArea[groupKey] !== false

                    return (
                      <div key={aKey}>
                        {/* Fila Área */}
                        <div onClick={() => setOpenArea(p => ({ ...p, [groupKey]: !isOpenA }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 28px',
                            background: '#f0f9ff', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
                          {isOpenA ? <ChevronDown size={12} style={{ color: '#0891b2', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: '#0891b2', flexShrink: 0 }} />}
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0c4a6e', flex: 1 }}>{aGrp.label}</span>
                          <span style={{ fontSize: 11, color: '#0891b2' }}>MO: {fmt$(aMO)}</span>
                          <span style={{ fontSize: 11, color: '#0891b2', marginLeft: 12 }}>Rec: {fmt$(aRec)}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', marginLeft: 16, minWidth: 120, textAlign: 'right' }}>{fmt$(aTot)}</span>
                        </div>

                        {isOpenA && Object.entries(aGrp.frentes).map(([fKey, fGrp]) => {
                          const fMO  = fGrp.ots.reduce((a: number, r: OTRow) => a + r._mo, 0)
                          const fRec = fGrp.ots.reduce((a: number, r: OTRow) => a + r._rec, 0)
                          const fTot = fMO + fRec
                          return (
                            <div key={fKey}>
                              {/* Fila Frente */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px 6px 44px',
                                background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', flex: 1 }}>⬦ {fGrp.label}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>MO: {fmt$(fMO)}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 10 }}>Rec: {fmt$(fRec)}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#334155', marginLeft: 14, minWidth: 120, textAlign: 'right' }}>{fmt$(fTot)}</span>
                              </div>
                              {/* Tabla OTs */}
                              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9' }}>
                                    <th style={{ padding: '5px 10px 5px 56px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Folio</th>
                                    <th style={{ padding: '5px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Título</th>
                                    <th style={{ padding: '5px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Status</th>
                                    <th style={{ padding: '5px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>MO</th>
                                    <th style={{ padding: '5px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Recursos</th>
                                    <th style={{ padding: '5px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {fGrp.ots.map((ot: OTRow) => (
                                    <tr key={ot.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '6px 10px 6px 56px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{ot.folio}</td>
                                      <td style={{ padding: '6px 10px' }}>
                                        <div style={{ fontSize: 12, fontWeight: 500 }}>{ot.titulo}</div>
                                        {ot.tipo_trabajo && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ot.tipo_trabajo}</div>}
                                      </td>
                                      <td style={{ padding: '6px 10px' }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(ot.status) }}>{ot.status}</span>
                                      </td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#b45309' }}>
                                        {ot._mo > 0 ? fmt$(ot._mo) : '—'}
                                      </td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#0891b2' }}>
                                        {ot._rec > 0 ? fmt$(ot._rec) : '—'}
                                      </td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                                        {ot._total > 0 ? fmt$(ot._total) : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  {/* Subtotal CC */}
                  {isOpenCC && (
                    <div style={{ display: 'flex', gap: 10, padding: '8px 14px', background: '#dbeafe',
                      borderTop: '1px solid #bfdbfe', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 11, color: '#1e40af' }}>Subtotal MO: {fmt$(ccMO)}</span>
                      <span style={{ fontSize: 11, color: '#1e40af', marginLeft: 12 }}>Subtotal Recursos: {fmt$(ccRec)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', marginLeft: 16 }}>Total {ccGrp.label}: {fmt$(ccTot)}</span>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Gran Total */}
            <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: '#1e3a5f',
              borderRadius: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <span style={{ fontSize: 12, color: '#93c5fd' }}>Total MO: {fmt$(totalMO)}</span>
              <span style={{ fontSize: 12, color: '#93c5fd', marginLeft: 14 }}>Total Recursos: {fmt$(totalRec)}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginLeft: 20 }}>Gran Total: {fmt$(totalGen)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
