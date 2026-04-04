'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw } from 'lucide-react'

const TIPOS = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Otro']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function ReporteProgramasMantenimiento() {
  const [rows,    setRows]    = useState<any[]>([])
  const [tareas,  setTareas]  = useState<any[]>([])
  const [secMap,  setSecMap]  = useState<Record<number, string>>({})
  const [secciones, setSecs]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo,   setFiltroTipo]   = useState('')
  const [filtroSec,    setFiltroSec]    = useState('')
  const [filtroAnio,   setFiltroAnio]   = useState(new Date().getFullYear().toString())

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: progs }, { data: tar }, { data: secs }] = await Promise.all([
      dbCtrl.from('programas_mantenimiento').select('*').order('anio', { ascending: false }).order('semana_inicio'),
      dbCtrl.from('programa_tareas').select('*').order('id'),
      dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre'),
    ])
    setSecs(secs ?? [])
    const sm: Record<number, string> = {}
    ;(secs ?? []).forEach((s: any) => { sm[s.id] = s.nombre })
    setSecMap(sm)
    setTareas(tar ?? [])

    let result = progs ?? []
    if (filtroTipo)  result = result.filter((r: any) => r.tipo_trabajo === filtroTipo)
    if (filtroSec)   result = result.filter((r: any) => r.id_seccion_fk === Number(filtroSec))
    if (filtroAnio)  result = result.filter((r: any) => String(r.anio)  === filtroAnio)

    setRows(result)
    setLoading(false)
  }, [filtroTipo, filtroSec, filtroAnio])

  useEffect(() => { fetchData() }, [fetchData])

  const tareasDePrograma = (progId: number) => tareas.filter(t => t.id_programa_fk === progId)

  const anios = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i))

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 100 }} value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)}>
          <option value="">Todos los años</option>
          {anios.map(a => <option key={a}>{a}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroSec} onChange={e => setFiltroSec(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
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
                <th>Sección</th>
                <th>Frente / Área</th>
                <th>Año</th>
                <th>Semanas</th>
                <th>Meses aplicables</th>
                <th># Tareas</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
              ) : rows.map((r, i) => {
                const tar = tareasDePrograma(r.id)
                const mesesAplic = r.meses_aplicables ? (Array.isArray(r.meses_aplicables)
                  ? r.meses_aplicables.map((m: number) => MESES[m - 1] ?? m).join(', ')
                  : r.meses_aplicables) : '—'
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{r.nombre ?? r.titulo ?? `Prog #${r.id}`}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.tipo_trabajo ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_seccion_fk ? (secMap[r.id_seccion_fk] ?? `#${r.id_seccion_fk}`) : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.frente ?? r.ubicacion ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{r.anio ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.semana_inicio && r.semana_fin ? `${r.semana_inicio} – ${r.semana_fin}` : r.semana_inicio ?? '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mesesAplic}</td>
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
