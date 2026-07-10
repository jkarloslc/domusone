'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw, ChevronDown } from 'lucide-react'

// Fuente de datos: ctrl.mant_programas / mant_programa_areas / mant_ejecuciones
// (la tabla independiente creada 2026-06-29 — NO ctrl.programas_mantenimiento,
// que quedó exclusiva de Golf desde esa separación; este reporte seguía
// apuntando a la tabla vieja compartida, pendiente anotado en memoria de
// proyecto desde la fase 2 de "Programas Mantenimiento N:N áreas" 2026-07-02).

const TIPOS = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Mantto. Lineas Sanitarias','Otro']

const CRIT_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  critico:   { label: 'Crítico',   color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  rutinario: { label: 'Rutinario', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
}

const fmt = (n: number) => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })

export default function ReporteProgramasMantenimiento() {
  const [programas,    setProgramas]    = useState<any[]>([])
  const [programaAreas, setProgramaAreas] = useState<{ id_programa_fk: number; id_area_comun_fk: number }[]>([])
  const [ejecuciones,  setEjecuciones]  = useState<any[]>([])
  const [cuadrantes,   setCuadrantes]   = useState<any[]>([])
  const [areas,        setAreas]        = useState<any[]>([])
  const [areasComunes, setAreasComunes] = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [expanded,     setExpanded]     = useState<Record<number, boolean>>({})

  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear().toString())
  const [filtroCuad, setFiltroCuad] = useState('')
  const [filtroArea, setFiltroArea] = useState('')
  const [filtroAC,   setFiltroAC]   = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroCrit, setFiltroCrit] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: cuads }, { data: areasData }, { data: acs }] = await Promise.all([
      dbCfg.from('cuadrantes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_cuadrante_fk').eq('activo', true).order('nombre'),
      dbCfg.from('areas_comunes').select('id, nombre, criticidad').eq('activo', true).order('nombre'),
    ])
    setCuadrantes(cuads ?? [])
    setAreas(areasData ?? [])
    setAreasComunes(acs ?? [])

    let q = dbCtrl.from('mant_programas').select('*').eq('activo', true).order('nombre')
    if (filtroAnio) q = q.eq('anio', Number(filtroAnio))
    if (filtroCuad) q = q.eq('id_cuadrante_fk', Number(filtroCuad))
    if (filtroArea) q = q.eq('id_area_fk', Number(filtroArea))
    if (filtroTipo) q = q.eq('tipo_trabajo', filtroTipo)
    const { data: progs } = await q

    if (!progs?.length) {
      setProgramas([]); setProgramaAreas([]); setEjecuciones([]); setLoading(false)
      return
    }
    const ids = progs.map((p: any) => p.id)
    const [{ data: pAreas }, { data: ejecs }] = await Promise.all([
      dbCtrl.from('mant_programa_areas').select('id_programa_fk, id_area_comun_fk').in('id_programa_fk', ids),
      dbCtrl.from('mant_ejecuciones').select('id_programa_fk, id_area_comun_fk, fecha_prog, status, costo_mano_obra, costo_materiales').in('id_programa_fk', ids),
    ])
    setProgramaAreas(pAreas ?? [])
    setEjecuciones(ejecs ?? [])
    setProgramas(progs)
    setLoading(false)
  }, [filtroAnio, filtroCuad, filtroArea, filtroTipo])

  useEffect(() => { fetchData() }, [fetchData])

  const cuadMap: Record<number, string> = {}; cuadrantes.forEach(c => { cuadMap[c.id] = c.nombre })
  const areaMap: Record<number, string> = {}; areas.forEach(a => { areaMap[a.id] = a.nombre })
  const acMap: Record<number, string> = {}; areasComunes.forEach(a => { acMap[a.id] = a.nombre })
  const acCritMap: Record<number, string> = {}; areasComunes.forEach(a => { acCritMap[a.id] = a.criticidad ?? 'rutinario' })

  const areasDeProg = (progId: number) => programaAreas.filter(r => r.id_programa_fk === progId).map(r => r.id_area_comun_fk)
  const ejecsDeProg = (progId: number) => ejecuciones.filter(e => e.id_programa_fk === progId)

  // Enriquecer cada programa con criticidad (homogénea, ver fase 2), costo
  // agregado (por ronda/ejecución, no por área individual, ver decisión de
  // usabilidad 2026-07-10) y cumplimiento.
  let filas = programas.map(prog => {
    const acIds = areasDeProg(prog.id)
    const criticidad = acIds.length ? (acCritMap[acIds[0]] ?? 'rutinario') : 'rutinario'
    const ejecs = ejecsDeProg(prog.id)
    const costoMO  = ejecs.reduce((a, e) => a + Number(e.costo_mano_obra ?? 0), 0)
    const costoMat = ejecs.reduce((a, e) => a + Number(e.costo_materiales ?? 0), 0)
    const completadas = ejecs.filter(e => e.status === 'Completada').length
    const omitidas    = ejecs.filter(e => e.status === 'Omitida').length
    return {
      prog, acIds, criticidad, ejecs,
      costoMO, costoMat, costoTotal: costoMO + costoMat,
      registradas: ejecs.length, completadas, omitidas,
      cumplimiento: ejecs.length ? Math.round((completadas / ejecs.length) * 100) : null,
    }
  })
  if (filtroAC)   filas = filas.filter(f => f.acIds.includes(Number(filtroAC)))
  if (filtroCrit) filas = filas.filter(f => f.criticidad === filtroCrit)

  // Rollup por cuadrante (el pedido original: costo de mantenimiento por
  // cuadrante para el comité — ver memoria "mant_estrategia_seguimiento").
  const porCuadrante = new Map<string, typeof filas>()
  filas.forEach(f => {
    const key = f.prog.id_cuadrante_fk ? String(f.prog.id_cuadrante_fk) : 'sin-cuadrante'
    if (!porCuadrante.has(key)) porCuadrante.set(key, [])
    porCuadrante.get(key)!.push(f)
  })
  const gruposCuadrante = Array.from(porCuadrante.entries())
    .map(([key, items]) => ({
      key,
      nombre: key === 'sin-cuadrante' ? 'Sin cuadrante asignado' : (cuadMap[Number(key)] ?? `#${key}`),
      items,
      costoTotal: items.reduce((a, f) => a + f.costoTotal, 0),
      costoMO:    items.reduce((a, f) => a + f.costoMO, 0),
      costoMat:   items.reduce((a, f) => a + f.costoMat, 0),
      registradas: items.reduce((a, f) => a + f.registradas, 0),
      completadas: items.reduce((a, f) => a + f.completadas, 0),
    }))
    .sort((a, b) => b.costoTotal - a.costoTotal)

  const costoTotalGeneral = filas.reduce((a, f) => a + f.costoTotal, 0)
  const registradasTotal  = filas.reduce((a, f) => a + f.registradas, 0)
  const completadasTotal  = filas.reduce((a, f) => a + f.completadas, 0)
  const cumplimientoGeneral = registradasTotal ? Math.round((completadasTotal / registradasTotal) * 100) : 0

  const toggle = (key: string) => setExpanded(e => ({ ...e, [key as any]: !e[key as any] }))
  const anios = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i))

  return (
    <div>
      {/* Filtros: Cuadrante → Área → Área Común (jerarquía vigente desde 2026-06-09) */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 100 }} value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}>
          <option value="">Todos los años</option>
          {anios.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroCuad}
          onChange={e => { setFiltroCuad(e.target.value); setFiltroArea(''); setFiltroAC('') }}>
          <option value="">Todos los cuadrantes</option>
          {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroArea}
          onChange={e => { setFiltroArea(e.target.value); setFiltroAC('') }}>
          <option value="">Todas las áreas</option>
          {areas.filter(a => !filtroCuad || a.id_cuadrante_fk === Number(filtroCuad)).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 170 }} value={filtroAC} onChange={e => setFiltroAC(e.target.value)}>
          <option value="">Todas las áreas comunes</option>
          {areasComunes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 130 }} value={filtroCrit} onChange={e => setFiltroCrit(e.target.value)}>
          <option value="">Crítico y Rutinario</option>
          <option value="critico">Solo Crítico</option>
          <option value="rutinario">Solo Rutinario</option>
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Programas-Mantenimiento" count={filas.length} reportTitle="Programas de Mantenimiento — Costo por Cuadrante" />

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Costo total',       value: fmt(costoTotalGeneral), color: 'var(--blue)', bg: 'var(--blue-pale)' },
          { label: 'Programas',         value: filas.length,           color: '#374151',     bg: '#f1f5f9' },
          { label: 'Ejecuciones registradas', value: registradasTotal, color: '#374151',     bg: '#f1f5f9' },
          { label: 'Cumplimiento',      value: `${cumplimientoGeneral}%`,
            color: cumplimientoGeneral >= 80 ? '#15803d' : cumplimientoGeneral >= 50 ? '#d97706' : '#dc2626', bg: '#fff' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '12px 18px', background: k.bg, minWidth: 130 }}>
            <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>
              {k.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div id="reporte-print-area">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table id="reporte-table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Cuadrante / Programa</th>
                <th>Tipo</th>
                <th>Frecuencia</th>
                <th>Criticidad</th>
                <th style={{ textAlign: 'center' }}>Ejec.</th>
                <th style={{ textAlign: 'center' }}>Cumpl.</th>
                <th style={{ textAlign: 'right' }}>Costo M.O.</th>
                <th style={{ textAlign: 'right' }}>Costo Mat.</th>
                <th style={{ textAlign: 'right' }}>Costo Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : gruposCuadrante.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
              ) : gruposCuadrante.map(g => {
                const isOpen = !!expanded[g.key as any]
                const cumplG = g.registradas ? Math.round((g.completadas / g.registradas) * 100) : null
                return (
                  <Fragment key={g.key}>
                    <tr style={{ background: '#f8fafc', cursor: 'pointer' }} onClick={() => toggle(g.key)}>
                      <td style={{ fontWeight: 700, fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ChevronDown size={13} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s', color: 'var(--text-muted)' }} />
                          {g.nombre}
                          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>({g.items.length} programa{g.items.length === 1 ? '' : 's'})</span>
                        </div>
                      </td>
                      <td></td><td></td><td></td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{g.registradas}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700,
                        color: cumplG === null ? 'var(--text-muted)' : cumplG >= 80 ? '#15803d' : cumplG >= 50 ? '#d97706' : '#dc2626' }}>
                        {cumplG === null ? '—' : `${cumplG}%`}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(g.costoMO)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(g.costoMat)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--blue)' }}>{fmt(g.costoTotal)}</td>
                    </tr>
                    {isOpen && g.items.map(f => {
                      const cs = CRIT_STYLE[f.criticidad]
                      return (
                        <tr key={f.prog.id}>
                          <td style={{ paddingLeft: 30, fontSize: 12.5 }}>{f.prog.nombre}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.prog.tipo_trabajo ?? '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{f.prog.frecuencia}</td>
                          <td>
                            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 20,
                              color: cs.color, background: cs.bg, border: `1px solid ${cs.border}` }}>
                              {cs.label}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontSize: 12 }}>{f.registradas}</td>
                          <td style={{ textAlign: 'center', fontSize: 12,
                            color: f.cumplimiento === null ? 'var(--text-muted)' : f.cumplimiento >= 80 ? '#15803d' : f.cumplimiento >= 50 ? '#d97706' : '#dc2626' }}>
                            {f.cumplimiento === null ? '—' : `${f.cumplimiento}%`}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(f.costoMO)}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(f.costoMat)}</td>
                          <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{fmt(f.costoTotal)}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
            {gruposCuadrante.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                  <td style={{ fontWeight: 700 }}>Total general</td>
                  <td></td><td></td><td></td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{registradasTotal}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{cumplimientoGeneral}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(gruposCuadrante.reduce((a, g) => a + g.costoMO, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(gruposCuadrante.reduce((a, g) => a + g.costoMat, 0))}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--blue)' }}>{fmt(costoTotalGeneral)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
