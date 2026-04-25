'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw } from 'lucide-react'

const TIPOS = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Otro']
const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function ReporteProgramasMantenimiento() {
  const [rows,         setRows]    = useState<any[]>([])
  const [tareas,       setTareas]  = useState<any[]>([])
  const [areaMap,     setAreaMap]  = useState<Record<number, string>>({})
  const [ccMap,        setCcMap]   = useState<Record<number, string>>({})
  const [frMap,        setFrMap]   = useState<Record<number, string>>({})
  const [areas,       setSecs]    = useState<any[]>([])
  const [centrosCosto, setCentros] = useState<any[]>([])
  const [frentes,      setFrentes] = useState<any[]>([])
  const [relAF,        setRelAF]   = useState<{id_area: number; id_frente: number}[]>([])
  const [loading,      setLoading] = useState(true)
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [filtroCc,     setFiltroCc]     = useState('')
  const [filtroArea,    setFiltroArea]    = useState('')
  const [filtroFr,     setFiltroFr]     = useState('')
  const [filtroAnio,   setFiltroAnio]   = useState(new Date().getFullYear().toString())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: progs }, { data: tar }, { data: secs }, { data: ccs }, { data: frs }, { data: relaf }] = await Promise.all([
      dbCtrl.from('programas_mantenimiento').select('*').eq('activo', true).order('anio', { ascending: false }).order('nombre'),
      dbCtrl.from('programa_tareas').select('*').order('id'),
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
    setTareas(tar ?? [])

    let result = progs ?? []
    if (filtroAnio)  result = result.filter((r: any) => String(r.anio) === filtroAnio)
    if (filtroTipo)  result = result.filter((r: any) => r.tipo_trabajo          === filtroTipo)
    if (filtroCc)    result = result.filter((r: any) => r.id_centro_costo_fk    === Number(filtroCc))
    if (filtroArea)   result = result.filter((r: any) => r.id_area_fk         === Number(filtroArea))
    if (filtroFr)    result = result.filter((r: any) => r.id_frente_fk          === Number(filtroFr))

    setRows(result)
    setLoading(false)
  }, [filtroTipo, filtroCc, filtroArea, filtroFr, filtroAnio])

  useEffect(() => { fetchData() }, [fetchData])

  const tareasDePrograma = (progId: number) => tareas.filter(t => t.id_programa_fk === progId)

  const anios = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i))

  return (
    <div>
      {/* Filtros: CC → Sección → Frente */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 100 }} value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}>
          <option value="">Todos los años</option>
          {anios.map(a => <option key={a}>{a}</option>)}
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
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Programas-Mantenimiento" count={rows.length} reportTitle="Programas de Mantenimiento" />

      <div id="reporte-print-area">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table id="reporte-table">
            <thead>
              <tr>
                <th>Programa</th>
                <th>Tipo</th>
                <th>Centro de Costo</th>
                <th>Área</th>
                <th>Frente</th>
                <th>Año</th>
                <th>Semanas</th>
                <th>Meses aplicables</th>
                <th># Tareas</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
              ) : rows.map((r, i) => {
                const tar = tareasDePrograma(r.id)
                const mesesAplic = r.meses_aplicables ? (Array.isArray(r.meses_aplicables)
                  ? r.meses_aplicables.map((m: number) => MESES_NOMBRE[m - 1] ?? m).join(', ')
                  : r.meses_aplicables) : '—'
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{r.nombre ?? `Prog #${r.id}`}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.tipo_trabajo ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_centro_costo_fk ? (ccMap[r.id_centro_costo_fk] ?? `#${r.id_centro_costo_fk}`) : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_area_fk ? (areaMap[r.id_area_fk] ?? `#${r.id_area_fk}`) : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_frente_fk ? (frMap[r.id_frente_fk] ?? `#${r.id_frente_fk}`) : '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.anio ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.semana_inicio && r.semana_fin ? `${r.semana_inicio} – ${r.semana_fin}` : r.semana_inicio ?? '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mesesAplic}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--blue)' }}>{tar.length}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.responsable ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
