'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, RefreshCw, Eye, X, Save, Loader, Printer,
  Calendar, CheckCircle, Edit2, Trash2,
  ClipboardList, Wrench, Zap
} from 'lucide-react'
import OrdenesTrabajoTab from './OrdenesTrabajoTab'
import ServiciosTab from './ServiciosTab'
import ModalShell from '@/components/ui/ModalShell'

const FRECUENCIAS = ['Semanal','Quincenal','Mensual','Bimestral','Trimestral','Semestral','Anual']
const TIPOS       = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Mantto. Lineas Sanitarias','Otro']
const MESES       = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  'Pendiente':  { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'En Proceso': { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Completada': { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'Omitida':    { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}

const Badge = ({ text }: { text: string }) => {
  const s = STATUS_STYLE[text] ?? STATUS_STYLE['Pendiente']
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

function generarFechas(anio: number, frecuencia: string, mesInicio: number): Date[] {
  const fechas: Date[] = []
  if (['Mensual','Bimestral','Trimestral','Semestral','Anual'].includes(frecuencia)) {
    const paso = frecuencia === 'Mensual' ? 1 : frecuencia === 'Bimestral' ? 2 :
      frecuencia === 'Trimestral' ? 3 : frecuencia === 'Semestral' ? 6 : 12
    for (let m = mesInicio - 1; m < 12; m += paso) {
      fechas.push(new Date(anio, m, 1))
    }
  } else {
    const dias = frecuencia === 'Quincenal' ? 14 : 7
    let d = new Date(anio, mesInicio - 1, 1)
    const fin = new Date(anio, 11, 31)
    while (d <= fin) {
      fechas.push(new Date(d))
      d = new Date(d.getTime() + dias * 86400000)
    }
  }
  return fechas
}

const getSemana = (d: Date) => {
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

const fmtDate = (d: string | Date) => {
  const dt = typeof d === 'string' ? new Date(d + 'T12:00:00') : d
  return dt.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ═══════════════════════════════════════════════════════════════
export default function MantenimientoPage() {
  const { canWrite, canDelete } = useAuth()
  const [tab,          setTab]        = useState<'programa' | 'ordenes' | 'ordenes_cuadrilla' | 'servicios'>('programa')
  const [programas,    setProgramas]  = useState<any[]>([])
  const [cuadrantes,    setCuadrantes]    = useState<any[]>([])
  const [cuadMap,       setCuadMap]       = useState<Record<number, string>>({})
  const [cuadColorMap,  setCuadColorMap]  = useState<Record<number, string>>({})
  const [secciones,    setSecciones]    = useState<any[]>([])
  const [secMap,       setSecMap]       = useState<Record<number, string>>({})
  const [areasComunes, setAreasComunes] = useState<any[]>([])
  const [acMap,        setAcMap]        = useState<Record<number, string>>({})
  const [secToAcs,     setSecToAcs]     = useState<Record<number, number[]>>({})
  const [loading,      setLoading]    = useState(true)
  const [filterAnio,   setFilterAnio] = useState(new Date().getFullYear())
  const [filterCuad,   setFilterCuad] = useState('')
  const [filterSec,    setFilterSec]  = useState('')
  const [filterAC,     setFilterAC]   = useState('')
  const [modal,        setModal]      = useState(false)
  const [editing,      setEditing]    = useState<any | null>(null)
  const [detail,       setDetail]     = useState<any | null>(null)

  useEffect(() => {
    Promise.all([
      dbCfg.from('cuadrantes').select('id, nombre, color').eq('activo', true).order('nombre'),
      dbCfg.from('secciones').select('id, nombre, id_cuadrante_fk').eq('activo', true).order('nombre'),
      dbCfg.from('areas_comunes').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('rel_seccion_area_comun').select('id_seccion_fk, id_area_comun_fk'),
    ]).then(([{ data: cuads }, { data: secs }, { data: acs }, { data: rels }]) => {
      setCuadrantes(cuads ?? [])
      setSecciones(secs ?? [])
      setAreasComunes(acs ?? [])
      const cm: Record<number, string> = {}; (cuads ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
      const cc: Record<number, string> = {}; (cuads ?? []).forEach((c: any) => { if (c.color) cc[c.id] = c.color })
      const sm: Record<number, string> = {}; (secs ?? []).forEach((s: any) => { sm[s.id] = s.nombre })
      const am: Record<number, string> = {}; (acs ?? []).forEach((a: any) => { am[a.id] = a.nombre })
      const sta: Record<number, number[]> = {};
      (rels ?? []).forEach((r: any) => {
        const sid = Number(r.id_seccion_fk)
        if (!sta[sid]) sta[sid] = []
        sta[sid].push(Number(r.id_area_comun_fk))
      })
      setCuadMap(cm); setCuadColorMap(cc); setSecMap(sm); setAcMap(am); setSecToAcs(sta)
    })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('programas_mantenimiento').select('*')
      .eq('anio', filterAnio).eq('activo', true).eq('modulo', 'mantenimiento').order('nombre')
    if (filterCuad) q = q.eq('id_cuadrante_fk',  Number(filterCuad))
    if (filterSec)  q = q.eq('id_seccion_fk',    Number(filterSec))
    if (filterAC)   q = q.eq('id_area_comun_fk', Number(filterAC))
    const { data: progs } = await q

    if (!progs?.length) { setProgramas([]); setLoading(false); return }

    const ids = progs.map((p: any) => p.id)
    const { data: tareas } = await dbCtrl.from('programa_tareas')
      .select('*').in('id_programa_fk', ids).order('fecha_prog')

    const tMap: Record<number, any[]> = {}
    ;(tareas ?? []).forEach((t: any) => {
      if (!tMap[t.id_programa_fk]) tMap[t.id_programa_fk] = []
      tMap[t.id_programa_fk].push(t)
    })

    setProgramas(progs.map((p: any) => ({ ...p, tareas: tMap[p.id] ?? [] })))
    setLoading(false)
  }, [filterAnio, filterCuad, filterSec, filterAC])

  useEffect(() => { fetchData() }, [fetchData])

  const todasTareas = programas.flatMap((p: any) => p.tareas ?? [])
  const completadas = todasTareas.filter((t: any) => t.status === 'Completada').length
  const cumplimiento = todasTareas.length ? Math.round((completadas / todasTareas.length) * 100) : 0

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este programa?')) return
    await dbCtrl.from('programas_mantenimiento').update({ activo: false }).eq('id', id)
    fetchData()
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Mantenimiento</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Programa anual · Órdenes de trabajo · {filterAnio}
          </p>
        </div>
        {tab === 'programa' && canWrite('mantenimiento') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModal(true) }}>
            <Plus size={14} /> Nuevo Programa
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        {([
          { key: 'programa',          label: 'Programa Anual', icon: <Calendar size={13} /> },
          { key: 'ordenes',           label: 'OT Mantto. Res', icon: <ClipboardList size={13} /> },
          { key: 'ordenes_cuadrilla', label: 'OT Cuadrilla',   icon: <Wrench size={13} /> },
          { key: 'servicios',         label: 'Servicios',      icon: <Zap size={13} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -1 }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'ordenes'           && <OrdenesTrabajoTab empresa="Balvanera" />}
      {tab === 'ordenes_cuadrilla' && <OrdenesTrabajoTab empresa="Cuadrilla" />}
      {tab === 'servicios'         && <ServiciosTab />}

      {tab === 'programa' && (
        <div>
          {/* KPIs Programa Anual */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Programas',   value: programas.length,                                       color: 'var(--blue)', bg: 'var(--blue-pale)' },
              { label: 'Pendientes',  value: todasTareas.filter((t: any) => t.status === 'Pendiente').length, color: '#d97706', bg: '#fffbeb' },
              { label: 'Completadas', value: completadas,                                             color: '#15803d',    bg: '#f0fdf4' },
              { label: 'Omitidas',    value: todasTareas.filter((t: any) => t.status === 'Omitida').length,  color: '#94a3b8',    bg: '#f8fafc' },
              { label: 'Cumplimiento',value: `${cumplimiento}%`,
                color: cumplimiento >= 80 ? '#15803d' : cumplimiento >= 50 ? '#d97706' : '#dc2626', bg: '#fff' },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: '12px 18px', background: k.bg, minWidth: 120 }}>
                <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>
                  {k.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select className="select" style={{ width: 80 }} value={filterAnio}
              onChange={e => setFilterAnio(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
            <select className="select" style={{ width: 200 }} value={filterCuad}
              onChange={e => { setFilterCuad(e.target.value); setFilterSec(''); setFilterAC('') }}>
              <option value="">Cuadrante</option>
              {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select className="select" style={{ width: 190 }} value={filterSec}
              onChange={e => { setFilterSec(e.target.value); setFilterAC('') }}>
              <option value="">Sección</option>
              {secciones
                .filter(s => !filterCuad || s.id_cuadrante_fk === Number(filterCuad))
                .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className="select" style={{ width: 190 }} value={filterAC}
              onChange={e => setFilterAC(e.target.value)}>
              <option value="">Área Común</option>
              {areasComunes
                .filter(a => !filterSec || (secToAcs[Number(filterSec)] ?? []).includes(a.id))
                .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            {(filterCuad || filterSec || filterAC) && (
              <button className="btn-ghost" style={{ color: '#dc2626' }}
                onClick={() => { setFilterCuad(''); setFilterSec(''); setFilterAC('') }}>
                <X size={13} /> Limpiar
              </button>
            )}
            <button className="btn-ghost" onClick={fetchData}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Tabla de programas */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  <th>Programa</th>
                  <th>Tipo</th>
                  <th>Frecuencia</th>
                  <th>Sección / Área Común</th>
                  <th>Periodo</th>
                  <th>Progreso</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                    <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                  </td></tr>
                ) : programas.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    Sin programas de mantenimiento para {filterAnio}
                  </td></tr>
                ) : programas.map((prog: any) => {
                  const tareas = prog.tareas ?? []
                  const comp   = tareas.filter((t: any) => t.status === 'Completada').length
                  const pct    = tareas.length ? Math.round((comp / tareas.length) * 100) : 0
                  const proxima = tareas.find((t: any) => t.status === 'Pendiente')
                  const rowColor   = prog.id_cuadrante_fk ? cuadColorMap[prog.id_cuadrante_fk] : undefined
                  const cuadNombre = prog.id_cuadrante_fk ? cuadMap[prog.id_cuadrante_fk]      : undefined
                  return (
                    <tr key={prog.id} style={rowColor ? {
                      borderLeft:  `5px solid ${rowColor}`,
                      background:  `${rowColor}12`,
                    } : undefined}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{prog.nombre}</div>
                        {cuadNombre && rowColor && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            marginTop: 4, background: rowColor, color: '#fff',
                            letterSpacing: '0.04em', textTransform: 'uppercase',
                          }}>
                            {cuadNombre}
                          </span>
                        )}
                        {prog.responsable && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{prog.responsable}</div>
                        )}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{prog.tipo_trabajo ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>{prog.frecuencia}</td>
                      <td style={{ fontSize: 13 }}>
                        {prog.id_seccion_fk
                          ? <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{secMap[prog.id_seccion_fk] ?? '—'}</span>
                          : null}
                        {prog.id_seccion_fk && prog.id_area_comun_fk ? <br /> : null}
                        {prog.id_area_comun_fk
                          ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{acMap[prog.id_area_comun_fk]}</span>
                          : (!prog.id_seccion_fk ? <span style={{ color: 'var(--text-muted)' }}>—</span> : null)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {prog.fecha_inicio ? fmtDate(prog.fecha_inicio) : '—'}
                        {prog.fecha_fin && prog.fecha_inicio
                          ? <><br /><span style={{ color: 'var(--text-muted)' }}>→ {fmtDate(prog.fecha_fin)}</span></>
                          : null}
                        {proxima && (
                          <div style={{ marginTop: 2, color: 'var(--blue)', fontWeight: 500 }}>
                            Próx: {fmtDate(proxima.fecha_prog)}
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3,
                              background: pct >= 80 ? '#15803d' : pct >= 50 ? '#d97706' : '#2563eb' }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {comp}/{tareas.length}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" style={{ padding: '4px 6px' }}
                            onClick={() => setDetail(prog)} title="Ver detalle">
                            <Eye size={13} />
                          </button>
                          {canWrite('mantenimiento') && (
                            <button className="btn-ghost" style={{ padding: '4px 6px' }}
                              onClick={() => { setEditing(prog); setModal(true) }} title="Editar">
                              <Edit2 size={13} />
                            </button>
                          )}
                          {canDelete() && (
                            <button className="btn-ghost" style={{ padding: '4px 6px', color: '#dc2626' }}
                              onClick={() => handleDelete(prog.id)} title="Eliminar">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal  && <ProgramaModal cuadrantes={cuadrantes} secciones={secciones} areasComunes={areasComunes} secToAcs={secToAcs} prog={editing}
        onClose={() => setModal(false)}
        onSaved={() => { setModal(false); fetchData() }} />}
      {detail && <ProgramaDetail prog={detail} cuadMap={cuadMap} secMap={secMap} acMap={acMap}
        onClose={() => { setDetail(null); fetchData() }}
        onEdit={() => { setDetail(null); setEditing(detail); setModal(true) }} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Mini calendario
// ═══════════════════════════════════════════════════════════════
function MiniCalendario({ tareas, onRefresh, prog, areaMap }: {
  tareas: any[]; onRefresh: () => void; prog: any; areaMap: Record<number, string>
}) {
  const { authUser } = useAuth()
  const [updating,  setUpdating]  = useState<number | null>(null)
  const [generando, setGenerando] = useState<number | null>(null)

  const porMes: Record<number, any[]> = {}
  tareas.forEach((t: any) => {
    const m = new Date(t.fecha_prog + 'T12:00:00').getMonth()
    if (!porMes[m]) porMes[m] = []
    porMes[m].push(t)
  })

  const cambiarStatus = async (tareaId: number, nuevoStatus: string) => {
    setUpdating(tareaId)
    await dbCtrl.from('programa_tareas').update({ status: nuevoStatus, updated_at: new Date().toISOString() }).eq('id', tareaId)
    setUpdating(null); onRefresh()
  }

  const generarOT = async (tarea: any) => {
    setGenerando(tarea.id)
    const { count } = await dbCtrl.from('ordenes_trabajo').select('id', { count: 'exact', head: true })
    const anio  = new Date().getFullYear()
    const folio = `OT-${anio}-${String((count ?? 0) + 1).padStart(4, '0')}`
    const { data: ot, error: otErr } = await dbCtrl.from('ordenes_trabajo').insert({
      folio, titulo: `${prog.nombre} — ${fmtDate(tarea.fecha_prog)}`,
      tipo_trabajo:       prog.tipo_trabajo       ?? null,
      prioridad:          'Media', status: 'Pendiente',
      id_area_fk:         prog.id_area_fk      ?? null,
      id_centro_costo_fk: prog.id_centro_costo_fk ?? null,
      id_frente_fk:       prog.id_frente_fk       ?? null,
      descripcion:        prog.descripcion        ?? null,
      asignado_a:         prog.responsable        ?? null,
      fecha_limite:       tarea.fecha_prog,
      semana_no:          tarea.semana_no, anio, created_by: authUser?.nombre ?? null,
    }).select('id, folio').single()
    if (otErr) { alert(`Error al crear OT: ${otErr.message}`); setGenerando(null); return }
    if (ot) {
      await dbCtrl.from('programa_tareas').update({
        id_ot_fk: ot.id, status: 'En Proceso', updated_at: new Date().toISOString()
      }).eq('id', tarea.id)
    }
    setGenerando(null); onRefresh()
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
      {Array.from({ length: 12 }, (_, m) => {
        const tareasDelMes = porMes[m] ?? []
        if (!tareasDelMes.length) return null
        const comp  = tareasDelMes.filter((t: any) => t.status === 'Completada').length
        const total = tareasDelMes.length
        return (
          <div key={m} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: '#f1f5f9', padding: '6px 10px', fontSize: 11, fontWeight: 700,
              color: 'var(--blue)', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between' }}>
              <span>{MESES[m]}</span>
              <span style={{ color: comp === total ? '#15803d' : 'var(--text-muted)' }}>{comp}/{total}</span>
            </div>
            <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tareasDelMes.map((t: any) => (
                <div key={t.id} style={{ fontSize: 10, padding: '4px 6px', borderRadius: 4,
                  background: STATUS_STYLE[t.status]?.bg ?? '#f8fafc',
                  border: `1px solid ${STATUS_STYLE[t.status]?.border ?? '#e2e8f0'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {new Date(t.fecha_prog + 'T12:00:00').getDate()} {MESES[m]}
                    </span>
                    <span style={{ color: STATUS_STYLE[t.status]?.color ?? '#64748b', fontWeight: 600 }}>
                      {t.status === 'Completada' ? '✓' : t.status === 'Omitida' ? '—' : '●'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                    {t.status === 'Pendiente' && !t.id_ot_fk && (
                      <button onClick={() => generarOT(t)} disabled={generando === t.id}
                        title="Crear Orden de Trabajo para esta tarea"
                        style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
                          background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        {generando === t.id ? '…' : '+ OT'}
                      </button>
                    )}
                    {t.id_ot_fk && (
                      <span title="Orden de Trabajo generada"
                        style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
                          background: '#eff6ff', color: 'var(--blue)', border: '1px solid #bfdbfe',
                          fontFamily: 'monospace', cursor: 'default' }}>
                        OT ✓
                      </span>
                    )}
                    {t.status !== 'Completada' && (
                      <button onClick={() => cambiarStatus(t.id, 'Completada')} disabled={updating === t.id}
                        title="Marcar como Completada"
                        style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
                          background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', cursor: 'pointer' }}>
                        ✓
                      </button>
                    )}
                    {t.status === 'Pendiente' && (
                      <button onClick={() => cambiarStatus(t.id, 'Omitida')} disabled={updating === t.id}
                        title="Marcar como Omitida"
                        style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
                          background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                        —
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Modal Nuevo/Editar Programa
// ═══════════════════════════════════════════════════════════════
function ProgramaModal({ cuadrantes, secciones, areasComunes, secToAcs, prog, onClose, onSaved }: {
  cuadrantes: any[]; secciones: any[]; areasComunes: any[]; secToAcs: Record<number, number[]>
  prog: any; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [form, setForm] = useState({
    nombre:           prog?.nombre             ?? '',
    anio:             prog?.anio?.toString()   ?? new Date().getFullYear().toString(),
    id_cuadrante_fk:  prog?.id_cuadrante_fk?.toString()  ?? '',
    id_seccion_fk:    prog?.id_seccion_fk?.toString()    ?? '',
    id_area_comun_fk: prog?.id_area_comun_fk?.toString() ?? '',
    tipo_trabajo:     prog?.tipo_trabajo       ?? '',
    frecuencia:       prog?.frecuencia         ?? 'Mensual',
    mes_inicio:       prog?.mes_inicio?.toString() ?? '1',
    responsable:      prog?.responsable        ?? '',
    descripcion:      prog?.descripcion        ?? '',
    presupuesto_est:  prog?.presupuesto_est?.toString() ?? '0',
    fecha_inicio:     prog?.fecha_inicio       ?? '',
    fecha_fin:        prog?.fecha_fin          ?? '',
  })
  const [regenerarTareas, setRegenerarTareas] = useState(false)

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Auto-compute fecha_inicio / fecha_fin when scheduling fields change
  useEffect(() => {
    const fechas = generarFechas(Number(form.anio), form.frecuencia, Number(form.mes_inicio))
    if (fechas.length > 0) {
      setForm(f => ({
        ...f,
        fecha_inicio: fechas[0].toISOString().slice(0, 10),
        fecha_fin:    fechas[fechas.length - 1].toISOString().slice(0, 10),
      }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.anio, form.frecuencia, form.mes_inicio])

  const totalFechas = generarFechas(Number(form.anio), form.frecuencia, Number(form.mes_inicio)).length

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre:           form.nombre.trim(),
      anio:             Number(form.anio),
      id_cuadrante_fk:  form.id_cuadrante_fk  ? Number(form.id_cuadrante_fk)  : null,
      id_seccion_fk:    form.id_seccion_fk    ? Number(form.id_seccion_fk)    : null,
      id_area_comun_fk: form.id_area_comun_fk ? Number(form.id_area_comun_fk) : null,
      tipo_trabajo:     form.tipo_trabajo || null,
      frecuencia:       form.frecuencia,
      mes_inicio:       Number(form.mes_inicio),
      responsable:      form.responsable.trim() || null,
      descripcion:      form.descripcion.trim() || null,
      presupuesto_est:  Number(form.presupuesto_est || 0),
      fecha_inicio:     form.fecha_inicio || null,
      fecha_fin:        form.fecha_fin    || null,
      modulo:           'mantenimiento',
      updated_at:       new Date().toISOString(),
    }
    let progId = prog?.id
    if (prog) {
      const { error: err } = await dbCtrl.from('programas_mantenimiento').update(payload).eq('id', prog.id)
      if (err) { setError(err.message); setSaving(false); return }
      if (regenerarTareas) {
        // Eliminar solo tareas Pendiente sin OT vinculada
        await dbCtrl.from('programa_tareas')
          .delete().eq('id_programa_fk', prog.id).eq('status', 'Pendiente').is('id_ot_fk', null)
        const fechas = generarFechas(Number(form.anio), form.frecuencia, Number(form.mes_inicio))
        const nuevasTareas = fechas.map(d => ({
          id_programa_fk: prog.id,
          fecha_prog:     d.toISOString().slice(0, 10),
          mes:            d.getMonth() + 1,
          semana_no:      getSemana(d),
          status:         'Pendiente',
        }))
        if (nuevasTareas.length) {
          const { error: errT } = await dbCtrl.from('programa_tareas').insert(nuevasTareas)
          if (errT) { setError(errT.message); setSaving(false); return }
        }
      }
    } else {
      const { data: newProg, error: err } = await dbCtrl.from('programas_mantenimiento')
        .insert({ ...payload, created_by: authUser?.nombre ?? null }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      progId = newProg?.id
      if (progId) {
        const fechas = generarFechas(Number(form.anio), form.frecuencia, Number(form.mes_inicio))
        const tareas = fechas.map(d => ({
          id_programa_fk: progId,
          fecha_prog:     d.toISOString().slice(0, 10),
          mes:            d.getMonth() + 1,
          semana_no:      getSemana(d),
          status:         'Pendiente',
        }))
        if (tareas.length) {
          const { error: errT } = await dbCtrl.from('programa_tareas').insert(tareas)
          if (errT) { setError(errT.message); setSaving(false); return }
        }
      }
    }
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={prog ? 'Editar Programa' : 'Nuevo Programa de Mantenimiento'} onClose={onClose} maxWidth={540}
    >
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10,
          overflowY: 'auto', maxHeight: 'calc(90vh - 110px)' }}>
          {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}
          <div>
            <label className="label" style={{ fontSize: 11 }}>Nombre *</label>
            <input className="input" style={{ fontSize: 13 }} value={form.nombre} onChange={setF('nombre')} placeholder="ej. Jardinería Semanal Palermo" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Año</label>
              <input className="input" style={{ fontSize: 13 }} type="number" value={form.anio} onChange={setF('anio')} />
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Tipo de Trabajo</label>
              <select className="select" style={{ fontSize: 12 }} value={form.tipo_trabajo} onChange={setF('tipo_trabajo')}>
                <option value="">—</option>
                {TIPOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Cuadrante</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_cuadrante_fk}
                onChange={e => setForm(f => ({ ...f, id_cuadrante_fk: e.target.value, id_seccion_fk: '', id_area_comun_fk: '' }))}>
                <option value="">—</option>
                {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Sección</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_seccion_fk}
                onChange={e => setForm(f => ({ ...f, id_seccion_fk: e.target.value, id_area_comun_fk: '' }))}>
                <option value="">—</option>
                {secciones
                  .filter(s => !form.id_cuadrante_fk || s.id_cuadrante_fk === Number(form.id_cuadrante_fk))
                  .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Área Común</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_area_comun_fk}
                onChange={setF('id_area_comun_fk')} disabled={!form.id_seccion_fk}>
                <option value="">— {form.id_seccion_fk ? 'Seleccionar' : 'Elige sección primero'} —</option>
                {areasComunes
                  .filter(a => !form.id_seccion_fk || (secToAcs[Number(form.id_seccion_fk)] ?? []).includes(a.id))
                  .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Frecuencia *</label>
              <select className="select" style={{ fontSize: 12 }} value={form.frecuencia} onChange={setF('frecuencia')}>
                {FRECUENCIAS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Mes de inicio</label>
              <select className="select" style={{ fontSize: 12 }} value={form.mes_inicio} onChange={setF('mes_inicio')}>
                {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Fecha de inicio</label>
              <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_inicio} onChange={setF('fecha_inicio')} />
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Fecha de fin</label>
              <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_fin} onChange={setF('fecha_fin')} />
            </div>
          </div>
          {!prog ? (
            <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 6, fontSize: 12, color: 'var(--blue)' }}>
              Se generarán <strong>{totalFechas} tareas</strong> para {form.anio}
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer',
              padding: '8px 12px', background: regenerarTareas ? '#fff7ed' : '#f8fafc',
              border: `1px solid ${regenerarTareas ? '#fed7aa' : '#e2e8f0'}`, borderRadius: 6 }}>
              <input type="checkbox" checked={regenerarTareas} onChange={e => setRegenerarTareas(e.target.checked)} />
              <span>Regenerar tareas pendientes al guardar</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(elimina Pendientes sin OT y recrea según la nueva programación)</span>
            </label>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Responsable</label>
              <input className="input" style={{ fontSize: 13 }} value={form.responsable} onChange={setF('responsable')} />
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Presupuesto estimado</label>
              <input className="input" style={{ fontSize: 13 }} type="number" value={form.presupuesto_est} onChange={setF('presupuesto_est')} />
            </div>
          </div>
          <div><label className="label" style={{ fontSize: 11 }}>Descripción / Alcance</label>
            <textarea className="input" rows={3} value={form.descripcion} onChange={setF('descripcion')}
              style={{ fontSize: 13, resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '12px 20px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onClose}>Cancelar</button>
          <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
            {prog ? 'Guardar' : 'Crear'}
          </button>
        </div>
    </ModalShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Detalle del Programa
// ═══════════════════════════════════════════════════════════════
function ProgramaDetail({ prog, cuadMap, secMap, acMap, onClose, onEdit }: {
  prog: any
  cuadMap: Record<number, string>
  secMap: Record<number, string>
  acMap: Record<number, string>
  onClose: () => void
  onEdit?: () => void
}) {
  const { authUser } = useAuth()
  const [tareas,    setTareas]    = useState<any[]>([])
  const [otMap,     setOtMap]     = useState<Record<number, string>>({})
  const [loading,   setLoading]   = useState(true)
  const [updating,  setUpdating]  = useState<number | null>(null)
  const [generando, setGenerando] = useState<number | null>(null)

  const fetchTareas = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCtrl.from('programa_tareas').select('*')
      .eq('id_programa_fk', prog.id).order('fecha_prog')
    setTareas(data ?? [])
    const otIds = Array.from(new Set((data ?? []).filter((t: any) => t.id_ot_fk).map((t: any) => t.id_ot_fk)))
    if (otIds.length) {
      const { data: ots } = await dbCtrl.from('ordenes_trabajo').select('id, folio').in('id', otIds)
      const om: Record<number, string> = {}
      ;(ots ?? []).forEach((o: any) => { om[o.id] = o.folio })
      setOtMap(om)
    }
    setLoading(false)
  }, [prog.id])

  useEffect(() => { fetchTareas() }, [fetchTareas])

  const cambiarStatus = async (id: number, status: string) => {
    setUpdating(id)
    await dbCtrl.from('programa_tareas').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setUpdating(null); fetchTareas()
  }

  const generarOT = async (tarea: any) => {
    setGenerando(tarea.id)
    const { count } = await dbCtrl.from('ordenes_trabajo').select('id', { count: 'exact', head: true })
    const anio  = new Date().getFullYear()
    const folio = `OT-${anio}-${String((count ?? 0) + 1).padStart(4, '0')}`
    const { data: ot } = await dbCtrl.from('ordenes_trabajo').insert({
      folio, titulo: `${prog.nombre} — ${fmtDate(tarea.fecha_prog)}`,
      tipo_trabajo:       prog.tipo_trabajo       ?? null,
      prioridad:          'Media', status: 'Pendiente',
      id_area_fk:         prog.id_area_fk      ?? null,
      id_centro_costo_fk: prog.id_centro_costo_fk ?? null,
      id_frente_fk:       prog.id_frente_fk       ?? null,
      descripcion:        prog.descripcion        ?? null,
      asignado_a:         prog.responsable        ?? null,
      fecha_limite:       tarea.fecha_prog,
      semana_no:          tarea.semana_no, anio, created_by: authUser?.nombre ?? null,
    }).select('id, folio').single()
    if (ot) {
      await dbCtrl.from('programa_tareas').update({
        id_ot_fk: ot.id, status: 'En Proceso', updated_at: new Date().toISOString()
      }).eq('id', tarea.id)
      setOtMap(m => ({ ...m, [ot.id]: ot.folio }))
    }
    setGenerando(null); fetchTareas()
  }

  const completadas = tareas.filter(t => t.status === 'Completada').length

  const imprimirPrograma = async () => {
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
      const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
        .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
      ;(cfgRows ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
    } catch {}

    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;">🔧</div>`

    const pend = tareas.filter(t => t.status === 'Pendiente').length
    const omit = tareas.filter(t => t.status === 'Omitida').length
    const pct  = tareas.length ? Math.round((completadas / tareas.length) * 100) : 0
    const SC: Record<string, string> = {
      'Pendiente': '#d97706', 'En Proceso': '#2563eb', 'Completada': '#15803d', 'Omitida': '#94a3b8'
    }

    const tareaRows = tareas.map(t => {
      const sc = SC[t.status] ?? '#64748b'
      const otFolio = t.id_ot_fk && otMap[t.id_ot_fk] ? otMap[t.id_ot_fk] : '—'
      return `<tr>
        <td>${fmtDate(t.fecha_prog)}</td>
        <td>${MESES[(t.mes ?? 1) - 1]}</td>
        <td style="text-align:center">${t.semana_no ?? '—'}</td>
        <td><span style="color:${sc};font-weight:600;font-size:11px">${t.status}</span></td>
        <td style="font-family:monospace;color:#2563eb;font-size:11px">${otFolio}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><title>Programa ${prog.nombre}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 36px; font-size: 13px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 20px; }
        .org-nombre { font-size: 17px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        h2 { font-size: 14px; font-weight: 700; color: #0D4F80; margin: 16px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 30px; margin-bottom: 12px; }
        .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin-bottom: 2px; }
        .val { font-size: 13px; color: #1e293b; }
        .kpis { display: flex; gap: 14px; margin: 12px 0; }
        .kpi { text-align: center; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px; min-width: 72px; }
        .kpi-num { font-size: 22px; font-weight: 700; }
        .kpi-lbl { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: .04em; }
        table { width: 100%; border-collapse: collapse; margin: 8px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 6px 10px; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
          <div style="font-size:12px;font-weight:600;color:#0D4F80;margin-top:3px;">Programa de Mantenimiento</div>
        </div>
        <div style="margin-left:auto;text-align:right;font-size:11px;color:#94a3b8;">
          Año: <strong style="color:#0D4F80">${prog.anio}</strong><br/>
          ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div style="font-size:18px;font-weight:700;margin-bottom:12px;">${prog.nombre}</div>

      <div class="grid">
        ${prog.tipo_trabajo ? `<div><div class="lbl">Tipo de Trabajo</div><div class="val">${prog.tipo_trabajo}</div></div>` : ''}
        <div><div class="lbl">Frecuencia</div><div class="val">${prog.frecuencia}</div></div>
        ${prog.responsable ? `<div><div class="lbl">Responsable</div><div class="val">${prog.responsable}</div></div>` : ''}
        ${prog.id_cuadrante_fk && cuadMap[prog.id_cuadrante_fk] ? `<div><div class="lbl">Cuadrante</div><div class="val">${cuadMap[prog.id_cuadrante_fk]}</div></div>` : ''}
        ${prog.id_seccion_fk && secMap[prog.id_seccion_fk] ? `<div><div class="lbl">Sección</div><div class="val">${secMap[prog.id_seccion_fk]}</div></div>` : ''}
        ${prog.id_area_comun_fk && acMap[prog.id_area_comun_fk] ? `<div><div class="lbl">Área Común</div><div class="val">${acMap[prog.id_area_comun_fk]}</div></div>` : ''}
        ${prog.fecha_inicio ? `<div><div class="lbl">Fecha Inicio</div><div class="val">${fmtDate(prog.fecha_inicio)}</div></div>` : ''}
        ${prog.fecha_fin ? `<div><div class="lbl">Fecha Fin</div><div class="val">${fmtDate(prog.fecha_fin)}</div></div>` : ''}
        ${prog.presupuesto_est ? `<div><div class="lbl">Presupuesto Est.</div><div class="val">$${Number(prog.presupuesto_est).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div></div>` : ''}
      </div>
      ${prog.descripcion ? `<p style="background:#f8fafc;border-left:3px solid #0D4F80;padding:8px 12px;font-size:13px;margin:8px 0">${prog.descripcion}</p>` : ''}

      <div class="kpis">
        <div class="kpi"><div class="kpi-num" style="color:#0D4F80">${tareas.length}</div><div class="kpi-lbl">Total</div></div>
        <div class="kpi"><div class="kpi-num" style="color:#15803d">${completadas}</div><div class="kpi-lbl">Completadas</div></div>
        <div class="kpi"><div class="kpi-num" style="color:#d97706">${pend}</div><div class="kpi-lbl">Pendientes</div></div>
        <div class="kpi"><div class="kpi-num" style="color:#94a3b8">${omit}</div><div class="kpi-lbl">Omitidas</div></div>
        <div class="kpi"><div class="kpi-num" style="color:${pct>=80?'#15803d':pct>=50?'#d97706':'#dc2626'}">${pct}%</div><div class="kpi-lbl">Cumplimiento</div></div>
      </div>

      <h2>Calendario de Tareas</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Mes</th><th>Semana</th><th>Status</th><th>Folio OT</th></tr></thead>
        <tbody>${tareaRows}</tbody>
      </table>
      </body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(html)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  return (
    <ModalShell modulo="mantenimiento" titulo={prog.nombre} onClose={onClose} maxWidth={760}
    >
        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 165px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Mes</th>
                  <th>Sem.</th>
                  <th>Status</th>
                  <th>OT</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tareas.map((t: any) => (
                  <tr key={t.id} style={{ opacity: t.status === 'Omitida' ? 0.5 : 1 }}>
                    <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtDate(t.fecha_prog)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{MESES[(t.mes ?? 1) - 1]}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>{t.semana_no ?? '—'}</td>
                    <td><Badge text={t.status} /></td>
                    <td>
                      {t.id_ot_fk && otMap[t.id_ot_fk] ? (
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600 }}>
                          {otMap[t.id_ot_fk]}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {!t.id_ot_fk && t.status !== 'Completada' && t.status !== 'Omitida' && (
                          <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={() => generarOT(t)} disabled={generando === t.id}>
                            {generando === t.id ? <Loader size={10} className="animate-spin" /> : <Wrench size={10} />}
                            {generando === t.id ? ' Creando…' : ' Crear OT'}
                          </button>
                        )}
                        {t.status !== 'Completada' && (
                          <button className="btn-ghost"
                            style={{ fontSize: 11, padding: '3px 8px', color: '#15803d', display: 'flex', alignItems: 'center', gap: 3 }}
                            onClick={() => cambiarStatus(t.id, 'Completada')} disabled={updating === t.id}
                            title="Marcar como Completada">
                            <CheckCircle size={11} /> Completar
                          </button>
                        )}
                        {t.status === 'Pendiente' && (
                          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#94a3b8' }}
                            onClick={() => cambiarStatus(t.id, 'Omitida')} disabled={updating === t.id}
                            title="Marcar como Omitida">
                            Omitir
                          </button>
                        )}
                        {t.status === 'Completada' && (
                          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#d97706' }}
                            onClick={() => cambiarStatus(t.id, 'Pendiente')} disabled={updating === t.id}
                            title="Reabrir tarea">
                            Reabrir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {completadas}/{tareas.length} completadas · {tareas.length ? Math.round((completadas/tareas.length)*100) : 0}% cumplimiento
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onEdit && (
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>
                Editar programa
              </button>
            )}
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={imprimirPrograma}>
              <Printer size={12} /> Imprimir programa
            </button>
          </div>
        </div>
    </ModalShell>
  )
}
