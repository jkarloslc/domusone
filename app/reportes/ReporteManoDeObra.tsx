'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import ModalShell from '@/components/ui/ModalShell'
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Mano de Obra real (ctrl.ot_mano_obra con id_colaborador_fk) por OT/Cuadrante/
// Área y por Trabajador. Las filas "legacy" (categoría genérica, capturas
// anteriores al modelo de colaborador real) se excluyen de Por Trabajador
// -no hay a quién atribuirlas- pero sí se muestran agrupadas en Por OT bajo
// "Sin trabajador identificado" para no perder el monto de vista.
// ─────────────────────────────────────────────────────────────────────────────

const fmt$   = (n: number) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtJor = (n: number) => (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUSES = ['Pendiente', 'En Proceso', 'En Pausa', 'Completada', 'Cancelada']
const TIPOS_OT: { value: string; label: string }[] = [
  { value: 'mantenimiento', label: 'OT Mantto. Residencial' },
  { value: 'generales',     label: "OT's Generales" },
]
const statusColor = (s: string) =>
  s === 'Completada' ? '#15803d' : s === 'En Proceso' ? '#2563eb' :
  s === 'En Pausa' ? '#7c3aed' : s === 'Cancelada' ? '#94a3b8' : '#d97706'

type OT = {
  id: number; folio: string; titulo: string; status: string; empresa: string; modulo: string
  id_cuadrante_fk: number | null; id_area_fk: number | null
  created_at: string; fecha_inicio: string | null
}
type MORow = {
  id: number; id_ot_fk: number; id_colaborador_fk: number | null; nombre: string | null
  jornales: number | null; sueldo_diario: number | null; costo_total: number | null
  id_categoria_fk: number | null; trabajadores: number | null; horas: number | null
}
type MORowOT = MORow & { ot: OT }

const th: React.CSSProperties = { padding: '5px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-muted)', background: '#f8fafc', textAlign: 'center' }
const thLeft: React.CSSProperties = { ...th, textAlign: 'left' }
const td: React.CSSProperties = { padding: '6px 10px', fontSize: 12, textAlign: 'center' }
const tdLeft: React.CSSProperties = { ...td, textAlign: 'left' }

export default function ReporteManoDeObra() {
  const [tab, setTab] = useState<'ot' | 'trabajador'>('ot')
  const [moRows, setMoRows]         = useState<MORow[]>([])
  const [ots, setOts]               = useState<Record<number, OT>>({})
  const [cuadrantes, setCuadrantes] = useState<any[]>([])
  const [areas, setAreas]           = useState<any[]>([])
  const [loading, setLoading]       = useState(true)

  const [fModulo, setFModulo]         = useState('')
  const [fCuadrante, setFCuadrante]   = useState('')
  const [fArea, setFArea]             = useState('')
  const [fTrabajador, setFTrabajador] = useState('')
  const [fStatus, setFStatus]         = useState('')
  const [fDe, setFDe]                 = useState('')
  const [fA, setFA]                   = useState('')

  const [openCuad, setOpenCuad] = useState<Record<string, boolean>>({})
  const [openArea, setOpenArea] = useState<Record<string, boolean>>({})
  const [openTrab, setOpenTrab] = useState<Record<string, boolean>>({})
  const [drill, setDrill] = useState<{ label: string; rows: MORowOT[] } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: mo }, { data: otsData }, { data: cuads }, { data: areasData }] = await Promise.all([
      dbCtrl.from('ot_mano_obra').select('*'),
      dbCtrl.from('ordenes_trabajo').select('id, folio, titulo, status, empresa, modulo, id_cuadrante_fk, id_area_fk, created_at, fecha_inicio'),
      dbCfg.from('cuadrantes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_cuadrante_fk').eq('activo', true).order('nombre'),
    ])
    const otMap: Record<number, OT> = {}
    ;(otsData ?? []).forEach((o: any) => { otMap[o.id] = o })
    setOts(otMap)
    setCuadrantes(cuads ?? [])
    setAreas(areasData ?? [])
    setMoRows((mo ?? []) as MORow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const cuadranteMap = Object.fromEntries(cuadrantes.map((c: any) => [c.id, c.nombre]))
  const areaMap       = Object.fromEntries(areas.map((a: any) => [a.id, a.nombre]))
  const filteredAreas = fCuadrante ? areas.filter((a: any) => String(a.id_cuadrante_fk) === fCuadrante) : areas

  const trabajadoresDisponibles = Array.from(
    new Map(moRows.filter(r => r.id_colaborador_fk).map(r => [r.id_colaborador_fk as number, r.nombre ?? `#${r.id_colaborador_fk}`])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]))

  const rowsConOT: MORowOT[] = moRows
    .map(r => ({ ...r, ot: ots[r.id_ot_fk] }))
    .filter((r): r is MORowOT => !!r.ot)

  const filtered = rowsConOT.filter(r => {
    if (fModulo && r.ot.modulo !== fModulo) return false
    if (fCuadrante && String(r.ot.id_cuadrante_fk) !== fCuadrante) return false
    if (fArea && String(r.ot.id_area_fk) !== fArea) return false
    if (fTrabajador && String(r.id_colaborador_fk) !== fTrabajador) return false
    if (fStatus && r.ot.status !== fStatus) return false
    const fecha = r.ot.fecha_inicio ?? r.ot.created_at?.slice(0, 10)
    if (fDe && fecha && fecha < fDe) return false
    if (fA && fecha && fecha > fA) return false
    return true
  })

  const totalJornales   = filtered.reduce((a, r) => a + Number(r.jornales ?? r.horas ?? 0), 0)
  const totalMonto      = filtered.reduce((a, r) => a + Number(r.costo_total || 0), 0)
  const otsConMO        = new Set(filtered.map(r => r.id_ot_fk)).size
  const trabajadoresSet = new Set(filtered.filter(r => r.id_colaborador_fk).map(r => r.id_colaborador_fk)).size

  // ── Agrupación Cuadrante → Área → OT (tab "ot") ──────────────────────────
  type GrupoOT = { ot: OT; rows: MORowOT[] }
  type GrupoArea = { label: string; ots: Record<string, GrupoOT> }
  type GrupoCuad = { label: string; areas: Record<string, GrupoArea> }
  const groupedOT: Record<string, GrupoCuad> = {}
  filtered.forEach(r => {
    const cKey = r.ot.id_cuadrante_fk ? String(r.ot.id_cuadrante_fk) : '__sin_cuadrante'
    const cLbl = r.ot.id_cuadrante_fk ? (cuadranteMap[r.ot.id_cuadrante_fk] ?? `#${r.ot.id_cuadrante_fk}`) : 'Sin Cuadrante'
    const aKey = r.ot.id_area_fk ? String(r.ot.id_area_fk) : '__sin_area'
    const aLbl = r.ot.id_area_fk ? (areaMap[r.ot.id_area_fk] ?? `#${r.ot.id_area_fk}`) : 'Sin Área'
    const oKey = String(r.ot.id)
    if (!groupedOT[cKey]) groupedOT[cKey] = { label: cLbl, areas: {} }
    if (!groupedOT[cKey].areas[aKey]) groupedOT[cKey].areas[aKey] = { label: aLbl, ots: {} }
    if (!groupedOT[cKey].areas[aKey].ots[oKey]) groupedOT[cKey].areas[aKey].ots[oKey] = { ot: r.ot, rows: [] }
    groupedOT[cKey].areas[aKey].ots[oKey].rows.push(r)
  })

  // ── Agrupación Trabajador → Cuadrante → Área (tab "trabajador") ─────────
  type GrupoTrabArea = { label: string; rows: MORowOT[] }
  type GrupoTrabCuad = { label: string; areas: Record<string, GrupoTrabArea> }
  type GrupoTrab = { nombre: string; cuadrantes: Record<string, GrupoTrabCuad> }
  const groupedTrab: Record<string, GrupoTrab> = {}
  filtered.filter(r => r.id_colaborador_fk).forEach(r => {
    const tKey = String(r.id_colaborador_fk)
    const cKey = r.ot.id_cuadrante_fk ? String(r.ot.id_cuadrante_fk) : '__sin_cuadrante'
    const cLbl = r.ot.id_cuadrante_fk ? (cuadranteMap[r.ot.id_cuadrante_fk] ?? `#${r.ot.id_cuadrante_fk}`) : 'Sin Cuadrante'
    const aKey = r.ot.id_area_fk ? String(r.ot.id_area_fk) : '__sin_area'
    const aLbl = r.ot.id_area_fk ? (areaMap[r.ot.id_area_fk] ?? `#${r.ot.id_area_fk}`) : 'Sin Área'
    if (!groupedTrab[tKey]) groupedTrab[tKey] = { nombre: r.nombre ?? `#${r.id_colaborador_fk}`, cuadrantes: {} }
    if (!groupedTrab[tKey].cuadrantes[cKey]) groupedTrab[tKey].cuadrantes[cKey] = { label: cLbl, areas: {} }
    if (!groupedTrab[tKey].cuadrantes[cKey].areas[aKey]) groupedTrab[tKey].cuadrantes[cKey].areas[aKey] = { label: aLbl, rows: [] }
    groupedTrab[tKey].cuadrantes[cKey].areas[aKey].rows.push(r)
  })
  const sinIdentificar = filtered.filter(r => !r.id_colaborador_fk)
  const montoSinIdentificar = sinIdentificar.reduce((a, r) => a + Number(r.costo_total || 0), 0)

  const sumRows = (rows: MORowOT[]) => ({
    jornales: rows.reduce((a, r) => a + Number(r.jornales ?? r.horas ?? 0), 0),
    monto:    rows.reduce((a, r) => a + Number(r.costo_total || 0), 0),
  })

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px',
        background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 170 }}
          value={fModulo} onChange={e => setFModulo(e.target.value)}>
          <option value="">Tipo de OT</option>
          {TIPOS_OT.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 150 }}
          value={fCuadrante} onChange={e => { setFCuadrante(e.target.value); setFArea('') }}>
          <option value="">Cuadrante</option>
          {cuadrantes.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 150 }}
          value={fArea} onChange={e => setFArea(e.target.value)}>
          <option value="">Área</option>
          {filteredAreas.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 170 }}
          value={fTrabajador} onChange={e => setFTrabajador(e.target.value)}>
          <option value="">Trabajador</option>
          {trabajadoresDisponibles.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 130 }}
          value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">Status OT</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
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
          { label: 'OTs con Mano de Obra', value: otsConMO,          color: 'var(--blue)', bg: 'var(--blue-pale)' },
          { label: 'Trabajadores',         value: trabajadoresSet,   color: '#7c3aed',     bg: '#f5f3ff' },
          { label: 'Jornales',             value: fmtJor(totalJornales), color: '#0891b2', bg: '#ecfeff' },
          { label: 'Monto Total',          value: fmt$(totalMonto),  color: '#b45309',     bg: '#fef3c7' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 16px', background: k.bg, flex: '1 1 130px', maxWidth: 220 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        {([
          { key: 'ot',         label: 'Por OT (Cuadrante / Área)' },
          { key: 'trabajador', label: 'Por Trabajador' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '9px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#7c3aed' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid #7c3aed' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      <PrintBar title={tab === 'ot' ? 'Mano-de-Obra-por-OT' : 'Mano-de-Obra-por-Trabajador'} count={filtered.length} reportTitle="Reporte de Mano de Obra" />

      <div id="reporte-print-area">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin mano de obra registrada para los filtros aplicados</div>
        ) : tab === 'ot' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(groupedOT).map(([cKey, cGrp]) => {
              const cRows = Object.values(cGrp.areas).flatMap(a => Object.values(a.ots).flatMap(o => o.rows))
              const cSum  = sumRows(cRows)
              const isOpenC = openCuad[cKey] !== false
              return (
                <div key={cKey} className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#4c1d95' }}>
                    <button onClick={() => setOpenCuad(p => ({ ...p, [cKey]: !isOpenC }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {isOpenC ? <ChevronDown size={13} style={{ color: '#d8b4fe', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: '#d8b4fe', flexShrink: 0 }} />}
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f3e8ff', flex: 1, textAlign: 'left' }}>{cGrp.label}</span>
                    </button>
                    <span style={{ fontSize: 11, color: '#d8b4fe' }}>Jornales: {fmtJor(cSum.jornales)}</span>
                    <button onClick={() => setDrill({ label: cGrp.label, rows: cRows })}
                      style={{ fontSize: 13, fontWeight: 700, color: '#f3e8ff', background: 'none', border: 'none', cursor: 'pointer',
                        textDecoration: 'underline', textUnderlineOffset: 3, marginLeft: 16, minWidth: 110, textAlign: 'right' }}
                      title="Ver detalle">
                      {fmt$(cSum.monto)}
                    </button>
                  </div>

                  {isOpenC && Object.entries(cGrp.areas).map(([aKey, aGrp]) => {
                    const aRows = Object.values(aGrp.ots).flatMap(o => o.rows)
                    const aSum  = sumRows(aRows)
                    const groupKey = `${cKey}_${aKey}`
                    const isOpenA = openArea[groupKey] !== false
                    return (
                      <div key={aKey}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 28px',
                          background: '#f5f3ff', borderBottom: '1px solid #e2e8f0' }}>
                          <button onClick={() => setOpenArea(p => ({ ...p, [groupKey]: !isOpenA }))}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {isOpenA ? <ChevronDown size={12} style={{ color: '#7c3aed', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: '#7c3aed', flexShrink: 0 }} />}
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#4c1d95', flex: 1, textAlign: 'left' }}>{aGrp.label}</span>
                          </button>
                          <span style={{ fontSize: 11, color: '#7c3aed' }}>Jornales: {fmtJor(aSum.jornales)}</span>
                          <button onClick={() => setDrill({ label: `${cGrp.label} · ${aGrp.label}`, rows: aRows })}
                            style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9', background: 'none', border: 'none', cursor: 'pointer',
                              textDecoration: 'underline', textUnderlineOffset: 3, marginLeft: 16, minWidth: 110, textAlign: 'right' }}
                            title="Ver detalle">
                            {fmt$(aSum.monto)}
                          </button>
                        </div>

                        {isOpenA && (
                          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ ...thLeft, padding: '5px 10px 5px 56px' }}>Folio</th>
                                <th style={thLeft}>Título</th>
                                <th style={th}>Status</th>
                                <th style={thLeft}>Trabajador</th>
                                <th style={{ ...th, textAlign: 'right' }}>Jornales</th>
                                <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.values(aGrp.ots).flatMap(({ ot, rows }) => rows.map((r, i) => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  {i === 0 ? (
                                    <>
                                      <td rowSpan={rows.length} style={{ padding: '6px 10px 6px 56px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600, verticalAlign: 'top' }}>{ot.folio}</td>
                                      <td rowSpan={rows.length} style={{ padding: '6px 10px', fontSize: 12, verticalAlign: 'top' }}>{ot.titulo}</td>
                                      <td rowSpan={rows.length} style={{ padding: '6px 10px', verticalAlign: 'top' }}><span style={{ fontSize: 10, fontWeight: 700, color: statusColor(ot.status) }}>{ot.status}</span></td>
                                    </>
                                  ) : null}
                                  <td style={{ padding: '6px 10px', fontSize: 12 }}>
                                    {r.id_colaborador_fk ? r.nombre : <em style={{ color: 'var(--text-muted)' }}>Sin trabajador identificado (captura anterior)</em>}
                                  </td>
                                  <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtJor(Number(r.jornales ?? r.horas ?? 0))}</td>
                                  <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt$(Number(r.costo_total || 0))}</td>
                                </tr>
                              )))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )
                  })}

                  {isOpenC && (
                    <div style={{ display: 'flex', gap: 10, padding: '8px 14px', background: '#ede9fe',
                      borderTop: '1px solid #ddd6fe', justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 11, color: '#4c1d95' }}>Jornales: {fmtJor(cSum.jornales)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95', marginLeft: 16 }}>Total {cGrp.label}: {fmt$(cSum.monto)}</span>
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: '#4c1d95',
              borderRadius: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <span style={{ fontSize: 12, color: '#d8b4fe' }}>Jornales: {fmtJor(totalJornales)}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginLeft: 20 }}>Gran Total: {fmt$(totalMonto)}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sinIdentificar.length > 0 && (
              <div style={{ padding: '8px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 11.5, color: '#92400e' }}>
                {fmt$(montoSinIdentificar)} en capturas anteriores (categoría genérica, sin trabajador identificado) no se incluyen aquí — sí aparecen en la vista "Por OT".
              </div>
            )}
            {Object.entries(groupedTrab)
              .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre))
              .map(([tKey, tGrp]) => {
                const tRows = Object.values(tGrp.cuadrantes).flatMap(c => Object.values(c.areas).flatMap(a => a.rows))
                const tSum  = sumRows(tRows)
                const otsCount = new Set(tRows.map(r => r.id_ot_fk)).size
                const isOpenT = openTrab[tKey] === true
                return (
                  <div key={tKey} className="card" style={{ overflow: 'hidden', padding: 0 }}>
                    <button onClick={() => setOpenTrab(p => ({ ...p, [tKey]: !isOpenT }))}
                      style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '10px 14px',
                        background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      {isOpenT ? <ChevronDown size={13} style={{ color: '#b45309', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: '#b45309', flexShrink: 0 }} />}
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', flex: 1 }}>{tGrp.nombre}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{otsCount} OT{otsCount !== 1 ? 's' : ''}</span>
                      <span style={{ fontSize: 11, color: '#0891b2', marginLeft: 12 }}>Jornales: {fmtJor(tSum.jornales)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginLeft: 16, minWidth: 110, textAlign: 'right' }}>{fmt$(tSum.monto)}</span>
                    </button>

                    {isOpenT && Object.entries(tGrp.cuadrantes).map(([cKey, cGrp]) => (
                      <div key={cKey}>
                        <div style={{ padding: '6px 14px 6px 28px', background: '#faf5ff', borderTop: '1px solid #f1f5f9', fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>
                          {cGrp.label}
                        </div>
                        {Object.entries(cGrp.areas).map(([aKey, aGrp]) => {
                          const aSum = sumRows(aGrp.rows)
                          return (
                            <div key={aKey}>
                              <div style={{ display: 'flex', padding: '5px 14px 5px 44px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', flex: 1 }}>⬦ {aGrp.label}</span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Jornales: {fmtJor(aSum.jornales)}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#334155', marginLeft: 14, minWidth: 90, textAlign: 'right' }}>{fmt$(aSum.monto)}</span>
                              </div>
                              <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9' }}>
                                    <th style={{ ...thLeft, padding: '5px 10px 5px 56px' }}>Folio</th>
                                    <th style={thLeft}>Título</th>
                                    <th style={th}>Status</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Jornales</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {aGrp.rows.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '6px 10px 6px 56px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{r.ot.folio}</td>
                                      <td style={{ padding: '6px 10px', fontSize: 12 }}>{r.ot.titulo}</td>
                                      <td style={{ padding: '6px 10px' }}><span style={{ fontSize: 10, fontWeight: 700, color: statusColor(r.ot.status) }}>{r.ot.status}</span></td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtJor(Number(r.jornales || 0))}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt$(Number(r.costo_total || 0))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )
              })}

            <div style={{ display: 'flex', gap: 10, padding: '12px 16px', background: '#b45309',
              borderRadius: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <span style={{ fontSize: 12, color: '#fde68a' }}>Jornales: {fmtJor(filtered.filter(r => r.id_colaborador_fk).reduce((a, r) => a + Number(r.jornales || 0), 0))}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginLeft: 20 }}>
                Gran Total: {fmt$(filtered.filter(r => r.id_colaborador_fk).reduce((a, r) => a + Number(r.costo_total || 0), 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {drill && <DetalleDrillModal label={drill.label} rows={drill.rows} onClose={() => setDrill(null)} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de detalle al hacer clic en un total de Cuadrante/Área: dos vistas del
// mismo conjunto de renglones — por OT y por Trabajador.
// ─────────────────────────────────────────────────────────────────────────────
function DetalleDrillModal({ label, rows, onClose }: { label: string; rows: MORowOT[]; onClose: () => void }) {
  const [sub, setSub] = useState<'ots' | 'trabajadores'>('ots')

  const porOT = Object.values(rows.reduce((acc: Record<string, { ot: OT; jornales: number; monto: number; trabajadores: number }>, r) => {
    const k = String(r.id_ot_fk)
    if (!acc[k]) acc[k] = { ot: r.ot, jornales: 0, monto: 0, trabajadores: 0 }
    acc[k].jornales += Number(r.jornales ?? r.horas ?? 0)
    acc[k].monto    += Number(r.costo_total || 0)
    acc[k].trabajadores += 1
    return acc
  }, {})).sort((a, b) => b.monto - a.monto)

  const porTrabajador = Object.values(rows.filter(r => r.id_colaborador_fk).reduce((acc: Record<string, { nombre: string; jornales: number; monto: number; ots: Set<number> }>, r) => {
    const k = String(r.id_colaborador_fk)
    if (!acc[k]) acc[k] = { nombre: r.nombre ?? `#${r.id_colaborador_fk}`, jornales: 0, monto: 0, ots: new Set() }
    acc[k].jornales += Number(r.jornales || 0)
    acc[k].monto    += Number(r.costo_total || 0)
    acc[k].ots.add(r.id_ot_fk)
    return acc
  }, {})).sort((a, b) => b.monto - a.monto)

  const totalMonto    = rows.reduce((a, r) => a + Number(r.costo_total || 0), 0)
  const totalJornales = rows.reduce((a, r) => a + Number(r.jornales ?? r.horas ?? 0), 0)

  return (
    <ModalShell modulo="mantenimiento" titulo={`Detalle Mano de Obra — ${label}`} onClose={onClose} maxWidth={760}
      footer={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}>
      <div style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span>Jornales: <strong>{fmtJor(totalJornales)}</strong></span>
          <span>Monto: <strong>{fmt$(totalMonto)}</strong></span>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 10 }}>
          {([{ key: 'ots', label: 'Por OT' }, { key: 'trabajadores', label: 'Por Trabajador' }] as const).map(t => (
            <button key={t.key} onClick={() => setSub(t.key)}
              style={{ padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: sub === t.key ? 600 : 400,
                color: sub === t.key ? '#7c3aed' : 'var(--text-muted)',
                borderBottom: sub === t.key ? '2px solid #7c3aed' : '2px solid transparent', marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
          {sub === 'ots' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={thLeft}>Folio</th><th style={thLeft}>Título</th><th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Jornales</th><th style={{ ...th, textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {porOT.map(r => (
                  <tr key={r.ot.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>{r.ot.folio}</td>
                    <td style={tdLeft}>{r.ot.titulo}</td>
                    <td style={td}><span style={{ fontSize: 10, fontWeight: 700, color: statusColor(r.ot.status) }}>{r.ot.status}</span></td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtJor(r.jornales)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt$(r.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={thLeft}>Trabajador</th><th style={th}>OTs</th>
                  <th style={{ ...th, textAlign: 'right' }}>Jornales</th><th style={{ ...th, textAlign: 'right' }}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {porTrabajador.map(t => (
                  <tr key={t.nombre} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdLeft}>{t.nombre}</td>
                    <td style={td}>{t.ots.size}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtJor(t.jornales)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt$(t.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
