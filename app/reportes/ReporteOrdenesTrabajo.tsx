'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw } from 'lucide-react'

const STATUSES    = ['Pendiente','En Proceso','En Pausa','Completada','Cancelada']
const PRIORIDADES = ['Urgente','Alta','Media','Baja']
const TIPOS = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Otro']

const statusColor = (s: string) =>
  s === 'Completada' ? '#15803d' : s === 'En Proceso' ? '#2563eb' :
  s === 'En Pausa' ? '#7c3aed' : s === 'Cancelada' ? '#94a3b8' : '#d97706'

const prioColor = (p: string) =>
  p === 'Urgente' ? '#dc2626' : p === 'Alta' ? '#ea580c' :
  p === 'Media' ? '#d97706' : '#64748b'

export default function ReporteOrdenesTrabajo() {
  const [rows,         setRows]    = useState<any[]>([])
  const [areaMap,     setAreaMap]  = useState<Record<number, string>>({})
  const [ccMap,        setCcMap]   = useState<Record<number, string>>({})
  const [frMap,        setFrMap]   = useState<Record<number, string>>({})
  const [areas,       setSecs]    = useState<any[]>([])
  const [centrosCosto, setCentros] = useState<any[]>([])
  const [frentes,      setFrentes] = useState<any[]>([])
  const [relAF,        setRelAF]   = useState<{id_area: number; id_frente: number}[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [filtroCc,     setFiltroCc]     = useState('')
  const [filtroArea,    setFiltroArea]    = useState('')
  const [filtroFr,     setFiltroFr]     = useState('')
  const [filtroPrio,   setFiltroPrio]   = useState('')
  const [filtroDe,     setFiltroDe]     = useState('')
  const [filtroA,      setFiltroA]      = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ots }, { data: secs }, { data: ccs }, { data: frs }, { data: relaf }] = await Promise.all([
      dbCtrl.from('ordenes_trabajo').select('*').order('created_at', { ascending: false }).limit(5000),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre, id_area_fk').eq('activo', true).order('nombre'),
      dbCfg.from('rel_area_frente').select('id_area, id_frente'),
    ])
    setSecs(secs ?? [])
    setCentros(ccs ?? [])
    setFrentes(frs ?? [])
    setRelAF((relaf ?? []) as any)
    const sm: Record<number, string> = {}; (secs ?? []).forEach((s: any) => { sm[s.id] = s.nombre })
    const cm: Record<number, string> = {}; (ccs ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
    const fm: Record<number, string> = {}; (frs ?? []).forEach((f: any) => { fm[f.id] = f.nombre })
    setAreaMap(sm); setCcMap(cm); setFrMap(fm)

    let result = ots ?? []
    if (filtroEmpresa) result = result.filter((r: any) => r.empresa           === filtroEmpresa)
    if (filtroStatus)  result = result.filter((r: any) => r.status            === filtroStatus)
    if (filtroTipo)    result = result.filter((r: any) => r.tipo_trabajo       === filtroTipo)
    if (filtroCc)      result = result.filter((r: any) => r.id_centro_costo_fk === Number(filtroCc))
    if (filtroArea)    result = result.filter((r: any) => r.id_area_fk         === Number(filtroArea))
    if (filtroFr)      result = result.filter((r: any) => r.id_frente_fk       === Number(filtroFr))
    if (filtroPrio)    result = result.filter((r: any) => r.prioridad          === filtroPrio)
    if (filtroDe)      result = result.filter((r: any) => r.fecha_inicio       >= filtroDe)
    if (filtroA)       result = result.filter((r: any) => r.fecha_inicio       <= filtroA)

    setRows(result)
    setLoading(false)
  }, [filtroEmpresa, filtroStatus, filtroTipo, filtroCc, filtroArea, filtroFr, filtroPrio, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

  return (
    <div>
      {/* Filtros: CC → Sección → Frente */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 150, fontWeight: filtroEmpresa ? 600 : 400 }}
          value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}>
          <option value="">Todas las empresas</option>
          <option value="Balvanera">Balvanera</option>
          <option value="Oitydisa">Oitydisa</option>
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="select" style={{ minWidth: 180 }} value={filtroCc} onChange={e => { setFiltroCc(e.target.value); setFiltroArea(''); setFiltroFr('') }}>
          <option value="">Todos los centros de costo</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroArea} onChange={e => { setFiltroArea(e.target.value); setFiltroFr('') }}>
          <option value="">Todas las áreas</option>
          {(areas as any[])
            .filter(s => !filtroCc || s.id_centro_costo_fk === Number(filtroCc))
            .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroFr} onChange={e => setFiltroFr(e.target.value)}>
          <option value="">Todos los frentes</option>
          {(() => {
            const aId = Number(filtroArea)
            const permitidos = filtroArea
              ? new Set(relAF.filter(r => r.id_area === aId).map(r => r.id_frente))
              : null
            return frentes
              .filter(f => !permitidos || permitidos.has(f.id))
              .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)
          })()}
        </select>
        <select className="select" style={{ minWidth: 130 }} value={filtroPrio} onChange={e => setFiltroPrio(e.target.value)}>
          <option value="">Todas las prioridades</option>
          {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} />
        </div>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Ordenes-de-Trabajo" count={rows.length} reportTitle="Órdenes de Trabajo — Mantenimiento" />

      {/* Resumen por status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
        {STATUSES.map(s => {
          const n = rows.filter(r => r.status === s).length
          return (
            <div key={s} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: statusColor(s) }}>{n}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>órdenes</div>
            </div>
          )
        })}
      </div>

      <div id="reporte-print-area">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table id="reporte-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Empresa</th>
                <th>Título</th>
                <th>Centro de Costo</th>
                <th>Área</th>
                <th>Frente</th>
                <th>Tipo</th>
                <th>Prioridad</th>
                <th>Asignado a</th>
                <th>Fecha Inicio</th>
                <th>Fecha Límite</th>
                <th>Fecha Cierre</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.folio}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                      background: r.empresa === 'Oitydisa' ? '#eff6ff' : '#f0fdf4',
                      color: r.empresa === 'Oitydisa' ? '#2563eb' : '#15803d',
                      border: `1px solid ${r.empresa === 'Oitydisa' ? '#bfdbfe' : '#bbf7d0'}` }}>
                      {r.empresa ?? 'Balvanera'}
                    </span>
                  </td>
                  <td style={{ fontSize: 13, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_centro_costo_fk ? (ccMap[r.id_centro_costo_fk] ?? `#${r.id_centro_costo_fk}`) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_area_fk ? (areaMap[r.id_area_fk] ?? `#${r.id_area_fk}`) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_frente_fk ? (frMap[r.id_frente_fk] ?? `#${r.id_frente_fk}`) : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.tipo_trabajo ?? '—'}</td>
                  <td>
                    {r.prioridad && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                        color: prioColor(r.prioridad), background: prioColor(r.prioridad) + '15',
                        border: `1px solid ${prioColor(r.prioridad)}40` }}>
                        {r.prioridad}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.asignado_a ?? '—'}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(r.fecha_inicio)}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: r.fecha_limite && new Date(r.fecha_limite) < new Date() && r.status !== 'Completada' ? '#dc2626' : 'var(--text-secondary)' }}>
                    {fmtF(r.fecha_limite)}
                  </td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#15803d' }}>{fmtF(r.fecha_cierre)}</td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      color: statusColor(r.status), background: statusColor(r.status) + '15',
                      border: `1px solid ${statusColor(r.status)}40` }}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
