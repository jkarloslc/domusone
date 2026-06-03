'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw } from 'lucide-react'

const fmtFecha = (f: string | null) => f ? new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const pct = (num: number, den: number) => den > 0 ? Math.round((num / den) * 100) : 0
const PctBar = ({ value, color }: { value: number; color: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3, transition: 'width .4s ease' }} />
    </div>
    <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36, textAlign: 'right' }}>{value}%</span>
  </div>
)

const TIPOS = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Mantto. Lineas Sanitarias','Otro']
const STATUSES = ['Pendiente','En Proceso','En Pausa','Completada','Cancelada']
const statusColor = (s: string) =>
  s === 'Completada' ? '#15803d' : s === 'En Proceso' ? '#2563eb' :
  s === 'En Pausa' ? '#7c3aed' : s === 'Cancelada' ? '#94a3b8' : '#d97706'

export default function ReporteOTCumplimiento() {
  const [rows,        setRows]     = useState<any[]>([])
  const [ccMap,       setCcMap]    = useState<Record<number, string>>({})
  const [areaMap,     setAreaMap]  = useState<Record<number, string>>({})
  const [centrosCosto, setCentros] = useState<any[]>([])
  const [areas,       setAreas]    = useState<any[]>([])
  const [loading,     setLoading]  = useState(true)

  // Filtros
  const [fEmpresa, setFEmpresa] = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fCc,      setFCc]      = useState('')
  const [fArea,    setFArea]    = useState('')
  const [fDe,      setFDe]      = useState('')
  const [fA,       setFA]       = useState('')

  // Vista agrupación
  const [groupBy, setGroupBy] = useState<'tipo' | 'area' | 'cc' | 'semana'>('cc')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ots }, { data: ccs }, { data: secs }] = await Promise.all([
      dbCtrl.from('ordenes_trabajo').select('*').order('created_at', { ascending: false }),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
    ])
    const cm: Record<number, string> = {}; (ccs ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
    const am: Record<number, string> = {}; (secs ?? []).forEach((s: any) => { am[s.id] = s.nombre })
    setCcMap(cm); setAreaMap(am)
    setCentros(ccs ?? [])
    setAreas(secs ?? [])

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

  // KPIs globales
  const total      = rows.length
  const completadas = rows.filter(r => r.status === 'Completada').length
  const canceladas  = rows.filter(r => r.status === 'Cancelada').length
  const activas     = rows.filter(r => !['Completada','Cancelada'].includes(r.status)).length
  const pctComp    = pct(completadas, total)

  // En tiempo: completadas donde fecha_cierre <= fecha_limite
  const conLimite   = rows.filter(r => r.status === 'Completada' && r.fecha_limite && r.fecha_cierre)
  const enTiempo    = conLimite.filter(r => r.fecha_cierre <= r.fecha_limite).length
  const fueraTiempo = conLimite.length - enTiempo
  const pctEnTiempo = pct(enTiempo, conLimite.length)

  // Agrupación dinámica
  type GrpItem = { label: string; total: number; completadas: number; activas: number; canceladas: number; enTiempo: number; fueraTiempo: number }
  const grupos: Record<string, GrpItem> = {}

  const getKey = (r: any): string => {
    if (groupBy === 'tipo')   return r.tipo_trabajo ?? 'Sin tipo'
    if (groupBy === 'area')   return r.id_area_fk ? String(r.id_area_fk) : '__sin'
    if (groupBy === 'cc')     return r.id_centro_costo_fk ? String(r.id_centro_costo_fk) : '__sin'
    if (groupBy === 'semana') return r.semana_no ? `Semana ${r.semana_no}` : 'Sin semana'
    return '—'
  }
  const getLabel = (r: any): string => {
    if (groupBy === 'tipo')   return r.tipo_trabajo ?? 'Sin tipo'
    if (groupBy === 'area')   return r.id_area_fk ? (areaMap[r.id_area_fk] ?? `#${r.id_area_fk}`) : 'Sin Área'
    if (groupBy === 'cc')     return r.id_centro_costo_fk ? (ccMap[r.id_centro_costo_fk] ?? `#${r.id_centro_costo_fk}`) : 'Sin CC'
    if (groupBy === 'semana') return r.semana_no ? `Semana ${r.semana_no} — ${r.anio}` : 'Sin semana'
    return '—'
  }

  rows.forEach(r => {
    const k = getKey(r)
    if (!grupos[k]) grupos[k] = { label: getLabel(r), total: 0, completadas: 0, activas: 0, canceladas: 0, enTiempo: 0, fueraTiempo: 0 }
    grupos[k].total++
    if (r.status === 'Completada') grupos[k].completadas++
    else if (r.status === 'Cancelada') grupos[k].canceladas++
    else grupos[k].activas++
    if (r.status === 'Completada' && r.fecha_limite && r.fecha_cierre) {
      if (r.fecha_cierre <= r.fecha_limite) grupos[k].enTiempo++
      else grupos[k].fueraTiempo++
    }
  })

  const sortedGrupos = Object.values(grupos).sort((a, b) => b.total - a.total)
  const filteredAreas = fCc ? areas.filter((a: any) => String(a.id_centro_costo_fk) === fCc) : areas

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px',
        background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <select className="select" style={{ fontSize: 12, height: 28, padding: '2px 8px', minWidth: 110 }}
          value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}>
          <option value="">Empresa</option>
          <option value="Balvanera">Mantto. Res</option>
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
          { label: 'Total OTs',       value: total,         color: 'var(--blue)', bg: 'var(--blue-pale)' },
          { label: 'Activas',         value: activas,       color: '#d97706',     bg: '#fffbeb' },
          { label: 'Completadas',     value: completadas,   color: '#15803d',     bg: '#f0fdf4' },
          { label: 'Canceladas',      value: canceladas,    color: '#94a3b8',     bg: '#f8fafc' },
          { label: '% Cumplimiento',  value: `${pctComp}%`, color: pctComp >= 80 ? '#15803d' : pctComp >= 50 ? '#d97706' : '#dc2626', bg: '#fff' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '10px 16px', background: k.bg, flex: '1 1 100px', maxWidth: 180 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* KPIs en tiempo */}
      {conLimite.length > 0 && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
            Cumplimiento de fecha límite — {conLimite.length} OT{conLimite.length > 1 ? 's' : ''} completadas con fecha límite registrada
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>En tiempo</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#15803d' }}>{enTiempo}</div>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Fuera de tiempo</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{fueraTiempo}</div>
            </div>
            <div style={{ flex: 2, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>% En tiempo</div>
              <PctBar value={pctEnTiempo} color={pctEnTiempo >= 80 ? '#15803d' : pctEnTiempo >= 50 ? '#d97706' : '#dc2626'} />
            </div>
          </div>
        </div>
      )}

      {/* Agrupación selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Agrupar por:</span>
        {(['cc', 'area', 'tipo', 'semana'] as const).map(g => (
          <button key={g} onClick={() => setGroupBy(g)}
            className={groupBy === g ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 11, padding: '3px 10px', height: 26 }}>
            {g === 'cc' ? 'CC' : g === 'area' ? 'Área' : g === 'tipo' ? 'Tipo' : 'Semana'}
          </button>
        ))}
      </div>

      <PrintBar title="OT-Cumplimiento" count={rows.length} reportTitle="Reporte de Cumplimiento de Órdenes de Trabajo" />

      <div id="reporte-print-area">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', background: '#f1f5f9' }}>
                    {groupBy === 'cc' ? 'Centro de Costo' : groupBy === 'area' ? 'Área' : groupBy === 'tipo' ? 'Tipo de Trabajo' : 'Semana'}
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', background: '#f1f5f9' }}>Total</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#d97706', background: '#f1f5f9' }}>Activas</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#15803d', background: '#f1f5f9' }}>Completadas</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', background: '#f1f5f9' }}>Canceladas</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', background: '#f1f5f9', minWidth: 160 }}>% Cumplimiento</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#15803d', background: '#f1f5f9' }}>En tiempo</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#dc2626', background: '#f1f5f9' }}>Fuera tiempo</th>
                </tr>
              </thead>
              <tbody>
                {sortedGrupos.map((g, i) => {
                  const p = pct(g.completadas, g.total)
                  const pColor = p >= 80 ? '#15803d' : p >= 50 ? '#d97706' : '#dc2626'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13 }}>{g.label}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>{g.total}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#d97706', fontWeight: 600 }}>{g.activas || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#15803d', fontWeight: 600 }}>{g.completadas || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>{g.canceladas || '—'}</td>
                      <td style={{ padding: '8px 12px', minWidth: 160 }}><PctBar value={p} color={pColor} /></td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#15803d', fontWeight: 600 }}>{g.enTiempo || '—'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: g.fueraTiempo > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: g.fueraTiempo > 0 ? 700 : 400 }}>{g.fueraTiempo || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--blue)' }}>TOTAL</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>{total}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#d97706' }}>{activas || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#15803d' }}>{completadas || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: '#94a3b8' }}>{canceladas || '—'}</td>
                  <td style={{ padding: '8px 12px' }}><PctBar value={pctComp} color={pctComp >= 80 ? '#15803d' : pctComp >= 50 ? '#d97706' : '#dc2626'} /></td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#15803d' }}>{enTiempo || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: fueraTiempo > 0 ? '#dc2626' : 'var(--text-muted)' }}>{fueraTiempo || '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
