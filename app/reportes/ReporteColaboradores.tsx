'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCfg } from '@/lib/supabase'
import { antiguedad } from '@/lib/dateUtils'
import { Colaborador, nombreCompletoColaborador } from '@/lib/colaboradores'
import { PrintBar } from './utils'
import { RefreshCw, CheckCircle } from 'lucide-react'

export default function ReporteColaboradores() {
  const [rows, setRows]               = useState<Colaborador[]>([])
  const [cuadrantes, setCuadrantes]   = useState<{ id: number; nombre: string }[]>([])
  const [secciones, setSecciones]     = useState<{ id: number; nombre: string }[]>([])
  const [centrosCosto, setCC]         = useState<{ id: number; nombre: string }[]>([])
  const [areas, setAreas]             = useState<{ id: number; nombre: string; id_centro_costo_fk?: number }[]>([])
  const [loading, setLoading]         = useState(true)

  const [filtroAsignado, setFA]       = useState('')
  const [filtroSupervisor, setFS]     = useState('')
  const [filtroCuadrante, setFCuad]   = useState('')
  const [filtroSeccion, setFSecc]     = useState('')
  const [filtroCC, setFCC]            = useState('')
  const [filtroArea, setFArea]        = useState('')
  const [filtroStatus, setFStatus]    = useState('activos')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: colabs }, { data: cuads }, { data: secs }, { data: ccs }, { data: ars }] = await Promise.all([
      dbCfg.from('colaboradores').select('*').order('nombre'),
      dbCfg.from('cuadrantes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
    ])
    setRows((colabs as Colaborador[]) ?? [])
    setCuadrantes(cuads ?? [])
    setSecciones(secs ?? [])
    setCC(ccs ?? [])
    setAreas(ars ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const cuadMap = Object.fromEntries(cuadrantes.map(c => [c.id, c.nombre]))
  const seccMap = Object.fromEntries(secciones.map(s => [s.id, s.nombre]))
  const ccMap   = Object.fromEntries(centrosCosto.map(c => [c.id, c.nombre]))
  const areaMap = Object.fromEntries(areas.map(a => [a.id, a.nombre]))

  const filtered = rows.filter(c => {
    if (filtroAsignado   && c.es_asignado   !== (filtroAsignado === 'true'))   return false
    if (filtroSupervisor && c.es_supervisor !== (filtroSupervisor === 'true')) return false
    if (filtroCuadrante  && c.id_cuadrante_fk    !== Number(filtroCuadrante)) return false
    if (filtroSeccion    && c.id_seccion_fk      !== Number(filtroSeccion))   return false
    if (filtroCC         && c.id_centro_costo_fk !== Number(filtroCC))        return false
    if (filtroArea       && c.id_area_fk         !== Number(filtroArea))      return false
    if (filtroStatus === 'activos'   && !c.activo) return false
    if (filtroStatus === 'inactivos' && c.activo)  return false
    return true
  })

  const fmt$ = (v: number | null) => v == null ? '—' : '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'

  const activos      = filtered.filter(c => c.activo).length
  const asignados    = filtered.filter(c => c.es_asignado).length
  const supervisores = filtered.filter(c => c.es_supervisor).length
  const nominaBruta   = filtered.reduce((a, c) => a + (c.sueldo_bruto_mensual ?? 0), 0)

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 150 }} value={filtroAsignado} onChange={e => setFA(e.target.value)}>
          <option value="">Asignado: todos</option>
          <option value="true">Solo asignables</option>
          <option value="false">No asignables</option>
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroSupervisor} onChange={e => setFS(e.target.value)}>
          <option value="">Supervisor: todos</option>
          <option value="true">Solo supervisores</option>
          <option value="false">No supervisores</option>
        </select>
        <select className="select" style={{ minWidth: 160 }} value={filtroCC} onChange={e => { setFCC(e.target.value); setFArea('') }}>
          <option value="">Todos los CC</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroArea} onChange={e => setFArea(e.target.value)}>
          <option value="">Todas las áreas</option>
          {areas.filter(a => !filtroCC || a.id_centro_costo_fk === Number(filtroCC)).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroSeccion} onChange={e => setFSecc(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 150 }} value={filtroCuadrante} onChange={e => setFCuad(e.target.value)}>
          <option value="">Todos los cuadrantes</option>
          {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select className="select" style={{ minWidth: 130 }} value={filtroStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
          <option value="all">Todos</option>
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Colaboradores" count={filtered.length} reportTitle="Colaboradores — Mantenimiento" />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Activos</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#15803d' }}>{activos}</div>
        </div>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Asignables</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0369a1' }}>{asignados}</div>
        </div>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Supervisores</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#7c3aed' }}>{supervisores}</div>
        </div>
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Nómina Bruta Mensual</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{fmt$(nominaBruta)}</div>
        </div>
      </div>

      <div id="reporte-print-area">
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table id="reporte-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Puesto</th>
                <th>Fecha Ingreso</th>
                <th>Antigüedad</th>
                <th style={{ textAlign: 'right' }}>Sueldo Bruto</th>
                <th style={{ textAlign: 'right' }}>Sueldo Neto</th>
                <th style={{ textAlign: 'center' }}>Asignado</th>
                <th style={{ textAlign: 'center' }}>Supervisor</th>
                <th>Cuadrante</th>
                <th>Sección</th>
                <th>CC</th>
                <th>Área</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{nombreCompletoColaborador(c)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.puesto ?? '—'}</td>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(c.fecha_ingreso)}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{antiguedad(c.fecha_ingreso)}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt$(c.sueldo_bruto_mensual)}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmt$(c.sueldo_neto_mensual)}</td>
                  <td style={{ textAlign: 'center' }}>{c.es_asignado ? <CheckCircle size={14} style={{ color: '#0369a1' }} /> : '—'}</td>
                  <td style={{ textAlign: 'center' }}>{c.es_supervisor ? <CheckCircle size={14} style={{ color: '#7c3aed' }} /> : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.id_cuadrante_fk ? (cuadMap[c.id_cuadrante_fk] ?? '—') : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.id_seccion_fk ? (seccMap[c.id_seccion_fk] ?? '—') : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.id_centro_costo_fk ? (ccMap[c.id_centro_costo_fk] ?? '—') : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.id_area_fk ? (areaMap[c.id_area_fk] ?? '—') : '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      color: c.activo ? '#15803d' : '#94a3b8', background: c.activo ? '#dcfce7' : '#f1f5f9' }}>
                      {c.activo ? 'Activo' : 'Inactivo'}
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
