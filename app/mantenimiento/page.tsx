'use client'
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, RefreshCw, Eye, X, Save, Loader,
  Calendar, Edit2, Trash2, ChevronLeft, ChevronRight,
  ClipboardList, Wrench, Zap, User, Search, ChevronDown
} from 'lucide-react'
import OrdenesTrabajoTab from './OrdenesTrabajoTab'
import ServiciosTab from './ServiciosTab'
import ModalShell from '@/components/ui/ModalShell'
import { Colaborador, nombreCompletoColaborador } from '@/lib/colaboradores'

const FRECUENCIAS = ['Diario','Semanal','Quincenal','Mensual','Bimestral','Trimestral','Semestral','Anual']
const TIPOS       = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Mantto. Lineas Sanitarias','Otro']
const MESES       = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const DIAS        = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']

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

// ── Cálculo de ocurrencias bajo demanda (no se almacenan 365 filas) ──────────

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }

function monthDiff(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

function estaActivoEnFecha(frecuencia: string, fechaInicio: string | null, fechaFin: string | null, fecha: Date): boolean {
  if (!fechaInicio) return false
  const inicio = startOfDay(new Date(fechaInicio + 'T12:00:00'))
  const fin = fechaFin ? startOfDay(new Date(fechaFin + 'T12:00:00')) : null
  const f = startOfDay(fecha)
  if (f < inicio) return false
  if (fin && f > fin) return false
  const diffDias = Math.round((f.getTime() - inicio.getTime()) / 86400000)
  switch (frecuencia) {
    case 'Diario':     return true
    case 'Semanal':    return diffDias % 7 === 0
    case 'Quincenal':  return diffDias % 14 === 0
    case 'Mensual':    return f.getDate() === inicio.getDate()
    case 'Bimestral':  return f.getDate() === inicio.getDate() && monthDiff(inicio, f) % 2 === 0
    case 'Trimestral': return f.getDate() === inicio.getDate() && monthDiff(inicio, f) % 3 === 0
    case 'Semestral':  return f.getDate() === inicio.getDate() && monthDiff(inicio, f) % 6 === 0
    case 'Anual':      return f.getDate() === inicio.getDate() && f.getMonth() === inicio.getMonth()
    default: return false
  }
}

function mondayOf(d: Date): Date {
  const day = d.getDay() // 0=Dom..6=Sáb
  const diff = day === 0 ? -6 : 1 - day
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff))
}
function addDays(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n) }
function toISODate(d: Date) { return d.toISOString().slice(0, 10) }

function proximasFechas(prog: any, n: number, desde = new Date()): Date[] {
  const out: Date[] = []
  let cursor = startOfDay(desde)
  const fin = prog.fecha_fin ? startOfDay(new Date(prog.fecha_fin + 'T12:00:00')) : null
  let guard = 0
  while (out.length < n && guard < 2000) {
    guard++
    if (fin && cursor > fin) break
    if (estaActivoEnFecha(prog.frecuencia, prog.fecha_inicio, prog.fecha_fin, cursor)) out.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return out
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
  const { authUser, canWrite, canDelete } = useAuth()
  const [tab,          setTab]        = useState<'programa' | 'ordenes' | 'ordenes_cuadrilla' | 'servicios'>('programa')
  const [innerTab,     setInnerTab]   = useState<'ejecucion' | 'programas'>('ejecucion')
  const [programas,    setProgramas]  = useState<any[]>([])
  const [cuadrantes,    setCuadrantes]    = useState<any[]>([])
  const [cuadMap,       setCuadMap]       = useState<Record<number, string>>({})
  const [cuadColorMap,  setCuadColorMap]  = useState<Record<number, string>>({})
  const [areas,        setAreas]        = useState<any[]>([])
  const [areaMap,      setAreaMap]      = useState<Record<number, string>>({})
  const [areasComunes, setAreasComunes] = useState<any[]>([])
  const [acMap,        setAcMap]        = useState<Record<number, string>>({})
  const [areaToAcs,    setAreaToAcs]    = useState<Record<number, number[]>>({})
  const [loading,      setLoading]    = useState(true)
  const [filterAnio,   setFilterAnio] = useState(new Date().getFullYear())
  const [filterCuad,   setFilterCuad] = useState('')
  const [filterArea,   setFilterArea] = useState('')
  const [filterAC,     setFilterAC]   = useState('')
  const [modal,        setModal]      = useState(false)
  const [editing,      setEditing]    = useState<any | null>(null)
  const [detail,       setDetail]     = useState<any | null>(null)
  const [weekStart,    setWeekStart]  = useState(() => mondayOf(new Date()))

  useEffect(() => {
    Promise.all([
      dbCfg.from('cuadrantes').select('id, nombre, color').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_cuadrante_fk').eq('activo', true).order('nombre'),
      dbCfg.from('areas_comunes').select('id, nombre, descripcion').eq('activo', true).order('nombre'),
      dbCfg.from('rel_area_area_comun').select('id_area, id_area_comun'),
    ]).then(([{ data: cuads }, { data: areasData }, { data: acs }, { data: rels }]) => {
      setCuadrantes(cuads ?? [])
      setAreas(areasData ?? [])
      setAreasComunes(acs ?? [])
      const cm: Record<number, string> = {}; (cuads ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
      const cc: Record<number, string> = {}; (cuads ?? []).forEach((c: any) => { if (c.color) cc[c.id] = c.color })
      const am2: Record<number, string> = {}; (areasData ?? []).forEach((a: any) => { am2[a.id] = a.nombre })
      const acm: Record<number, string> = {}; (acs ?? []).forEach((a: any) => { acm[a.id] = a.nombre })
      const ata: Record<number, number[]> = {};
      (rels ?? []).forEach((r: any) => {
        const aid = Number(r.id_area)
        if (!ata[aid]) ata[aid] = []
        ata[aid].push(Number(r.id_area_comun))
      })
      setCuadMap(cm); setCuadColorMap(cc); setAreaMap(am2); setAcMap(acm); setAreaToAcs(ata)
    })
  }, [])

  // Plantillas + áreas comunes asignadas (N:N) + sus ejecuciones registradas
  // (lazy: solo existen las filas que alguien ya marcó — nunca se
  // pre-generan 365 por programa, ni un programa por área común)
  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('mant_programas').select('*')
      .eq('anio', filterAnio).eq('activo', true).order('nombre')
    if (filterCuad) q = q.eq('id_cuadrante_fk', Number(filterCuad))
    if (filterArea) q = q.eq('id_area_fk',      Number(filterArea))
    const { data: progs } = await q

    if (!progs?.length) { setProgramas([]); setLoading(false); return }

    const ids = progs.map((p: any) => p.id)
    const [{ data: areasRel }, { data: ejecs }] = await Promise.all([
      dbCtrl.from('mant_programa_areas').select('*').in('id_programa_fk', ids),
      dbCtrl.from('mant_ejecuciones').select('*').in('id_programa_fk', ids).order('fecha_prog'),
    ])

    const aMap: Record<number, number[]> = {}
    ;(areasRel ?? []).forEach((r: any) => {
      if (!aMap[r.id_programa_fk]) aMap[r.id_programa_fk] = []
      aMap[r.id_programa_fk].push(r.id_area_comun_fk)
    })

    const eMap: Record<number, any[]> = {}
    ;(ejecs ?? []).forEach((e: any) => {
      if (!eMap[e.id_programa_fk]) eMap[e.id_programa_fk] = []
      eMap[e.id_programa_fk].push(e)
    })

    let merged = progs.map((p: any) => ({
      ...p,
      areasComunes: aMap[p.id] ?? [],
      ejecuciones:  eMap[p.id] ?? [],
    }))
    if (filterAC) merged = merged.filter((p: any) => p.areasComunes.includes(Number(filterAC)))
    setProgramas(merged)
    setLoading(false)
  }, [filterAnio, filterCuad, filterArea, filterAC])

  useEffect(() => { fetchData() }, [fetchData])

  const todasEjecuciones = programas.flatMap((p: any) => p.ejecuciones ?? [])
  const completadasTotal = todasEjecuciones.filter((e: any) => e.status === 'Completada').length
  const registradasTotal = todasEjecuciones.length
  const cumplimientoTotal = registradasTotal ? Math.round((completadasTotal / registradasTotal) * 100) : 0

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este programa? Se conservará el historial de ejecuciones ya registradas.')) return
    await dbCtrl.from('mant_programas').update({ activo: false }).eq('id', id)
    fetchData()
  }

  // Registrar/actualizar el status de una ocurrencia para UN área común
  // (areaComunId = null cuando el programa no tiene áreas comunes asignadas
  // y se registra a nivel programa). Crea la fila solo cuando hace falta.
  const upsertEjecucion = async (prog: any, areaComunId: number | null, fecha: Date, status: string) => {
    const fechaISO = toISODate(fecha)
    const existing = (prog.ejecuciones ?? []).find((e: any) => e.fecha_prog === fechaISO && e.id_area_comun_fk === areaComunId)
    if (existing) {
      await dbCtrl.from('mant_ejecuciones').update({ status, updated_at: new Date().toISOString() }).eq('id', existing.id)
      setProgramas(prev => prev.map((p: any) => p.id !== prog.id ? p : {
        ...p, ejecuciones: p.ejecuciones.map((e: any) => e.id === existing.id ? { ...e, status } : e),
      }))
    } else {
      const { data } = await dbCtrl.from('mant_ejecuciones')
        .insert({ id_programa_fk: prog.id, id_area_comun_fk: areaComunId, fecha_prog: fechaISO, status })
        .select('*').single()
      if (data) setProgramas(prev => prev.map((p: any) => p.id !== prog.id ? p : { ...p, ejecuciones: [...p.ejecuciones, data] }))
    }
  }

  // Marcar de un solo golpe el mismo status para todas las áreas comunes
  // de un programa en una fecha (reemplaza tener que repetir la acción
  // área por área cuando el trabajo se hizo igual en todas).
  const upsertEjecucionesBulk = async (prog: any, areaIds: (number | null)[], fecha: Date, status: string) => {
    await Promise.all(areaIds.map(id => upsertEjecucion(prog, id, fecha, status)))
  }

  const generarOT = async (prog: any, areaComunId: number | null, fecha: Date) => {
    const fechaISO = toISODate(fecha)
    const { count } = await dbCtrl.from('ordenes_trabajo').select('id', { count: 'exact', head: true })
    const anio  = fecha.getFullYear()
    const folio = `OT-${anio}-${String((count ?? 0) + 1).padStart(4, '0')}`
    const { data: ot, error: otErr } = await dbCtrl.from('ordenes_trabajo').insert({
      folio, empresa: 'Balvanera', modulo: 'mantenimiento', titulo: `${prog.nombre} — ${fmtDate(fechaISO)}`,
      tipo_trabajo: prog.tipo_trabajo ?? null,
      prioridad:    'Media', status: 'Pendiente',
      id_area_fk:       prog.id_area_fk ?? null,
      id_cuadrante_fk:  prog.id_cuadrante_fk ?? null,
      id_area_comun_fk: areaComunId,
      descripcion:  prog.descripcion ?? null,
      asignado_a:   prog.responsable ?? null,
      fecha_limite: fechaISO,
      semana_no:    getSemana(fecha), anio, created_by: authUser?.nombre ?? null,
    }).select('id, folio').single()
    if (otErr) { alert(`Error al crear OT: ${otErr.message}`); return }
    if (!ot) return
    const existing = (prog.ejecuciones ?? []).find((e: any) => e.fecha_prog === fechaISO && e.id_area_comun_fk === areaComunId)
    if (existing) {
      await dbCtrl.from('mant_ejecuciones').update({ id_ot_fk: ot.id, status: 'En Proceso', updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await dbCtrl.from('mant_ejecuciones').insert({ id_programa_fk: prog.id, id_area_comun_fk: areaComunId, fecha_prog: fechaISO, status: 'En Proceso', id_ot_fk: ot.id })
    }
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
        {tab === 'programa' && innerTab === 'programas' && canWrite('mantenimiento') && (
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
          { key: 'ordenes_cuadrilla', label: "OT's Generales",   icon: <Wrench size={13} /> },
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

      {tab === 'ordenes'           && <OrdenesTrabajoTab empresa="Balvanera" modulo="mantenimiento" />}
      {tab === 'ordenes_cuadrilla' && <OrdenesTrabajoTab empresa="Cuadrilla" modulo="generales" />}
      {tab === 'servicios'         && <ServiciosTab />}

      {tab === 'programa' && (
        <div>
          {/* Sub-tabs: Ejecución Semanal / Programas */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 18 }}>
            {([
              { key: 'ejecucion', label: 'Ejecución Semanal' },
              { key: 'programas', label: 'Programas' },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setInnerTab(t.key)} style={{
                padding: '7px 16px', fontWeight: 600, fontSize: 12.5,
                border: 'none', cursor: 'pointer',
                borderRadius: 20,
                background: innerTab === t.key ? 'var(--blue-pale)' : 'transparent',
                color: innerTab === t.key ? 'var(--blue)' : 'var(--text-muted)',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Filtros (comunes a ambas sub-vistas) */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select className="select" style={{ width: 80 }} value={filterAnio}
              onChange={e => setFilterAnio(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
            <select className="select" style={{ width: 200 }} value={filterCuad}
              onChange={e => { setFilterCuad(e.target.value); setFilterArea(''); setFilterAC('') }}>
              <option value="">Cuadrante</option>
              {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select className="select" style={{ width: 190 }} value={filterArea}
              onChange={e => { setFilterArea(e.target.value); setFilterAC('') }}>
              <option value="">Área</option>
              {areas
                .filter(a => !filterCuad || a.id_cuadrante_fk === Number(filterCuad))
                .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <select className="select" style={{ width: 190 }} value={filterAC}
              onChange={e => setFilterAC(e.target.value)}>
              <option value="">Área Común</option>
              {areasComunes
                .filter(a => !filterArea || (areaToAcs[Number(filterArea)] ?? []).includes(a.id))
                .map(a => <option key={a.id} value={a.id}>{a.nombre}{a.descripcion ? ` - ${a.descripcion}` : ''}</option>)}
            </select>
            {(filterCuad || filterArea || filterAC) && (
              <button className="btn-ghost" style={{ color: '#dc2626' }}
                onClick={() => { setFilterCuad(''); setFilterArea(''); setFilterAC('') }}>
                <X size={13} /> Limpiar
              </button>
            )}
            <button className="btn-ghost" onClick={fetchData}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {innerTab === 'ejecucion' ? (
            <EjecucionSemanal
              programas={programas} loading={loading}
              weekStart={weekStart} setWeekStart={setWeekStart}
              cuadMap={cuadMap} cuadColorMap={cuadColorMap} acMap={acMap}
              onCambiarStatus={upsertEjecucion}
              onCambiarStatusBulk={upsertEjecucionesBulk}
              onGenerarOT={generarOT}
            />
          ) : (
            <>
              {/* KPIs */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                  { label: 'Programas',   value: programas.length, color: 'var(--blue)', bg: 'var(--blue-pale)' },
                  { label: 'Registradas', value: registradasTotal, color: '#374151',     bg: '#f1f5f9' },
                  { label: 'Completadas', value: completadasTotal, color: '#15803d',     bg: '#f0fdf4' },
                  { label: 'Cumplimiento',value: `${cumplimientoTotal}%`,
                    color: cumplimientoTotal >= 80 ? '#15803d' : cumplimientoTotal >= 50 ? '#d97706' : '#dc2626', bg: '#fff' },
                ].map(k => (
                  <div key={k.label} className="card" style={{ padding: '12px 18px', background: k.bg, minWidth: 120 }}>
                    <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>
                      {k.value}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Tabla de programas (plantillas) */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Programa</th>
                      <th>Tipo</th>
                      <th>Frecuencia</th>
                      <th>Área / Área Común</th>
                      <th>Periodo</th>
                      <th>Historial</th>
                      <th style={{ width: 96 }}></th>
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
                      const ejecuciones = prog.ejecuciones ?? []
                      const comp   = ejecuciones.filter((e: any) => e.status === 'Completada').length
                      const proxima = proximasFechas(prog, 1)[0]
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
                            {prog.id_area_fk
                              ? <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{areaMap[prog.id_area_fk] ?? '—'}</span>
                              : null}
                            {prog.id_area_fk && prog.areasComunes.length > 0 ? <br /> : null}
                            {prog.areasComunes.length > 0 ? (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}
                                title={prog.areasComunes.map((id: number) => acMap[id]).filter(Boolean).join(', ')}>
                                {prog.areasComunes.length === 1
                                  ? acMap[prog.areasComunes[0]]
                                  : `${prog.areasComunes.length} áreas comunes`}
                              </span>
                            ) : (!prog.id_area_fk ? <span style={{ color: 'var(--text-muted)' }}>—</span> : null)}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {prog.fecha_inicio ? fmtDate(prog.fecha_inicio) : '—'}
                            {prog.fecha_fin && prog.fecha_inicio
                              ? <><br /><span style={{ color: 'var(--text-muted)' }}>→ {fmtDate(prog.fecha_fin)}</span></>
                              : null}
                            {proxima && (
                              <div style={{ marginTop: 2, color: 'var(--blue)', fontWeight: 500 }}>
                                Próx: {fmtDate(proxima)}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {ejecuciones.length === 0 ? '—' : `${comp}/${ejecuciones.length} completadas`}
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
            </>
          )}
        </div>
      )}

      {modal  && <ProgramaModal cuadrantes={cuadrantes} areas={areas} areasComunes={areasComunes} areaToAcs={areaToAcs} prog={editing}
        onClose={() => setModal(false)}
        onSaved={() => { setModal(false); fetchData() }} />}
      {detail && <ProgramaDetail prog={detail} cuadMap={cuadMap} areaMap={areaMap} acMap={acMap}
        onClose={() => { setDetail(null); fetchData() }}
        onEdit={() => { setDetail(null); setEditing(detail); setModal(true) }}
        onCambiarStatus={upsertEjecucion} onCambiarStatusBulk={upsertEjecucionesBulk} onGenerarOT={generarOT} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Ejecución Semanal — un renglón por PROGRAMA (no por área común).
// Si el programa tiene varias áreas comunes asignadas, cada celda-día
// muestra el avance agregado ("3/5") con un botón para marcar todas
// las áreas de un golpe; el detalle por área solo aparece al expandir
// el renglón — así no hay que dar clic área por área cada semana.
// ═══════════════════════════════════════════════════════════════
function EjecucionSemanal({ programas, loading, weekStart, setWeekStart, cuadMap, cuadColorMap, acMap, onCambiarStatus, onCambiarStatusBulk, onGenerarOT }: {
  programas: any[]; loading: boolean
  weekStart: Date; setWeekStart: (d: Date) => void
  cuadMap: Record<number, string>; cuadColorMap: Record<number, string>; acMap: Record<number, string>
  onCambiarStatus: (prog: any, areaComunId: number | null, fecha: Date, status: string) => Promise<void>
  onCambiarStatusBulk: (prog: any, areaIds: (number | null)[], fecha: Date, status: string) => Promise<void>
  onGenerarOT: (prog: any, areaComunId: number | null, fecha: Date) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const dias = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = dias[6]

  const activos = useMemo(() => programas
    .map(prog => {
      const areaSlots: (number | null)[] = prog.areasComunes.length ? prog.areasComunes : [null]
      return {
        prog,
        areaSlots,
        dias: dias.map(fecha => {
          const activo = estaActivoEnFecha(prog.frecuencia, prog.fecha_inicio, prog.fecha_fin, fecha)
          if (!activo) return null
          const fechaISO = toISODate(fecha)
          const celdas = areaSlots.map(areaId => {
            const ejec = (prog.ejecuciones ?? []).find((e: any) => e.fecha_prog === fechaISO && e.id_area_comun_fk === areaId)
            return { areaId, status: ejec?.status ?? 'Pendiente', id_ot_fk: ejec?.id_ot_fk ?? null }
          })
          return { fecha, celdas }
        }),
      }
    })
    .filter(r => r.dias.some(d => d !== null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programas, weekStart])

  const totalCeldas = activos.reduce((a, r) => a + r.dias.reduce((b: number, d: any) => b + (d ? d.celdas.length : 0), 0), 0)
  const completadasCeldas = activos.reduce((a, r) => a + r.dias.reduce((b: number, d: any) =>
    b + (d ? d.celdas.filter((c: any) => c.status === 'Completada').length : 0), 0), 0)

  const handle = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); await fn(); setBusy(null)
  }
  const toggleExpand = (id: number) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <div>
      {/* Navegación de semana */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="btn-ghost" style={{ padding: '7px 10px' }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, minWidth: 200, textAlign: 'center' }}>
          {fmtDate(weekStart)} – {fmtDate(weekEnd)}
        </span>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="btn-ghost" style={{ padding: '7px 10px' }}>
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setWeekStart(mondayOf(new Date()))} className="btn-secondary" style={{ fontSize: 11, marginLeft: 4 }}>
          Hoy
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {completadasCeldas}/{totalCeldas} completadas esta semana
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : activos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)',
          background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>
          Sin programas activos esta semana.
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Programa</th>
                {dias.map((d, i) => (
                  <th key={i} style={{ textAlign: 'center', minWidth: 86 }}>
                    {DIAS[i]}<br />
                    <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>{d.getDate()}/{d.getMonth() + 1}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activos.map(({ prog, areaSlots, dias: celdas }) => {
                const rowColor = prog.id_cuadrante_fk ? cuadColorMap[prog.id_cuadrante_fk] : undefined
                const multi = areaSlots.length > 1
                const isExpanded = multi && !!expanded[prog.id]
                return (
                  <Fragment key={prog.id}>
                    <tr style={rowColor ? { borderLeft: `5px solid ${rowColor}`, background: `${rowColor}0a` } : undefined}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {multi && (
                            <button onClick={() => toggleExpand(prog.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                              title={isExpanded ? 'Ocultar áreas' : 'Ver áreas comunes'}>
                              <ChevronDown size={13} style={{ transform: isExpanded ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
                            </button>
                          )}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{prog.nombre}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {prog.frecuencia}{prog.id_cuadrante_fk && cuadMap[prog.id_cuadrante_fk] ? ` · ${cuadMap[prog.id_cuadrante_fk]}` : ''}
                              {multi ? ` · ${areaSlots.length} áreas` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      {celdas.map((c, i) => {
                        if (!c) return <td key={i} style={{ textAlign: 'center', color: '#e2e8f0' }}>·</td>
                        const key = `${prog.id}-${i}`
                        if (!multi) {
                          const cell = c.celdas[0]
                          const sc = STATUS_STYLE[cell.status] ?? STATUS_STYLE['Pendiente']
                          return (
                            <td key={i} style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <select
                                  value={cell.status}
                                  disabled={busy === key}
                                  onChange={e => handle(key, () => onCambiarStatus(prog, cell.areaId, c.fecha, e.target.value))}
                                  style={{
                                    fontSize: 10.5, fontWeight: 600, padding: '3px 4px', borderRadius: 5,
                                    background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}`,
                                    cursor: 'pointer', outline: 'none', opacity: busy === key ? 0.5 : 1,
                                  }}>
                                  <option value="Pendiente">Pendiente</option>
                                  <option value="En Proceso">En Proceso</option>
                                  <option value="Completada">Completada</option>
                                  <option value="Omitida">Omitida</option>
                                </select>
                                {cell.id_ot_fk ? (
                                  <span style={{ fontSize: 9, color: 'var(--blue)' }}>OT ✓</span>
                                ) : (
                                  <button onClick={() => handle(key, () => onGenerarOT(prog, cell.areaId, c.fecha))} disabled={busy === key}
                                    title="Crear Orden de Trabajo"
                                    style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: '1px solid #bfdbfe',
                                      background: '#eff6ff', color: 'var(--blue)', cursor: 'pointer' }}>
                                    + OT
                                  </button>
                                )}
                              </div>
                            </td>
                          )
                        }
                        const completas = c.celdas.filter((x: any) => x.status === 'Completada').length
                        const total = c.celdas.length
                        const allDone = completas === total
                        return (
                          <td key={i} style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 11, fontWeight: 700,
                                color: allDone ? '#15803d' : completas > 0 ? '#d97706' : 'var(--text-muted)' }}>
                                {completas}/{total}
                              </span>
                              {!allDone && (
                                <button onClick={() => handle(key, () => onCambiarStatusBulk(prog, areaSlots, c.fecha, 'Completada'))}
                                  disabled={busy === key} title="Marcar todas las áreas como completadas"
                                  style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: '1px solid #bbf7d0',
                                    background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}>
                                  ✓ Todas
                                </button>
                              )}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                    {isExpanded && areaSlots.map(areaId => (
                      <tr key={`${prog.id}-${areaId}`} style={{ background: '#f8fafc' }}>
                        <td style={{ paddingLeft: 30, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          {acMap[areaId as number] ?? '—'}
                        </td>
                        {celdas.map((c, i) => {
                          if (!c) return <td key={i} style={{ textAlign: 'center', color: '#e2e8f0' }}>·</td>
                          const cell = c.celdas.find((x: any) => x.areaId === areaId)
                          if (!cell) return <td key={i} />
                          const key = `${prog.id}-${areaId}-${i}`
                          const sc = STATUS_STYLE[cell.status] ?? STATUS_STYLE['Pendiente']
                          return (
                            <td key={i} style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                <select
                                  value={cell.status}
                                  disabled={busy === key}
                                  onChange={e => handle(key, () => onCambiarStatus(prog, areaId, c.fecha, e.target.value))}
                                  style={{
                                    fontSize: 10, fontWeight: 600, padding: '2px 4px', borderRadius: 5,
                                    background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}`,
                                    cursor: 'pointer', outline: 'none', opacity: busy === key ? 0.5 : 1,
                                  }}>
                                  <option value="Pendiente">Pendiente</option>
                                  <option value="En Proceso">En Proceso</option>
                                  <option value="Completada">Completada</option>
                                  <option value="Omitida">Omitida</option>
                                </select>
                                {cell.id_ot_fk ? (
                                  <span style={{ fontSize: 9, color: 'var(--blue)' }}>OT ✓</span>
                                ) : (
                                  <button onClick={() => handle(key, () => onGenerarOT(prog, areaId, c.fecha))} disabled={busy === key}
                                    title="Crear Orden de Trabajo"
                                    style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: '1px solid #bfdbfe',
                                      background: '#eff6ff', color: 'var(--blue)', cursor: 'pointer' }}>
                                    + OT
                                  </button>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Modal Nuevo/Editar Programa (plantilla — sin pre-generar ocurrencias)
// ═══════════════════════════════════════════════════════════════
function ProgramaModal({ cuadrantes, areas, areasComunes, areaToAcs, prog, onClose, onSaved }: {
  cuadrantes: any[]; areas: any[]; areasComunes: any[]; areaToAcs: Record<number, number[]>
  prog: any; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [form, setForm] = useState({
    nombre:           prog?.nombre             ?? '',
    anio:             prog?.anio?.toString()   ?? new Date().getFullYear().toString(),
    id_cuadrante_fk:  prog?.id_cuadrante_fk?.toString()  ?? '',
    id_area_fk:       prog?.id_area_fk?.toString()       ?? '',
    areasComunes:     (prog?.areasComunes ?? []) as number[],
    tipo_trabajo:     prog?.tipo_trabajo       ?? '',
    frecuencia:       prog?.frecuencia         ?? 'Mensual',
    mes_inicio:       prog?.mes_inicio?.toString() ?? '1',
    id_responsable_fk: prog?.id_responsable_fk ?? null as number | null,
    responsable:      prog?.responsable        ?? '',
    descripcion:      prog?.descripcion        ?? '',
    presupuesto_est:  prog?.presupuesto_est?.toString() ?? '0',
    fecha_inicio:     prog?.fecha_inicio       ?? '',
    fecha_fin:        prog?.fecha_fin          ?? '',
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Si no se definió fecha_inicio, proponer el 1° del mes de inicio del año
  useEffect(() => {
    if (form.fecha_inicio) return
    const d = new Date(Number(form.anio), Number(form.mes_inicio) - 1, 1)
    setForm(f => ({ ...f, fecha_inicio: toISODate(d) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.anio, form.mes_inicio])

  const previewFechas = form.fecha_inicio
    ? proximasFechas({ frecuencia: form.frecuencia, fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin }, 5,
        new Date(form.fecha_inicio + 'T12:00:00'))
    : []

  const areaComunesDisponibles = areasComunes
    .filter(a => !form.id_area_fk || (areaToAcs[Number(form.id_area_fk)] ?? []).includes(a.id))
  const todasSeleccionadas = areaComunesDisponibles.length > 0
    && areaComunesDisponibles.every(a => form.areasComunes.includes(a.id))

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre:           form.nombre.trim(),
      anio:             Number(form.anio),
      id_cuadrante_fk:  form.id_cuadrante_fk  ? Number(form.id_cuadrante_fk)  : null,
      id_area_fk:       form.id_area_fk       ? Number(form.id_area_fk)       : null,
      tipo_trabajo:     form.tipo_trabajo || null,
      frecuencia:       form.frecuencia,
      mes_inicio:       Number(form.mes_inicio),
      id_responsable_fk: form.id_responsable_fk ?? null,
      responsable:      form.responsable.trim() || null,
      descripcion:      form.descripcion.trim() || null,
      presupuesto_est:  Number(form.presupuesto_est || 0),
      fecha_inicio:     form.fecha_inicio || null,
      fecha_fin:        form.fecha_fin    || null,
      updated_at:       new Date().toISOString(),
    }
    let programaId = prog?.id ?? null
    if (prog) {
      const { error: err } = await dbCtrl.from('mant_programas').update(payload).eq('id', prog.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await dbCtrl.from('mant_programas')
        .insert({ ...payload, created_by: authUser?.nombre ?? null })
        .select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      programaId = data?.id ?? null
    }
    if (programaId) {
      // Reemplaza el set completo de áreas comunes asignadas al programa
      await dbCtrl.from('mant_programa_areas').delete().eq('id_programa_fk', programaId)
      if (form.areasComunes.length) {
        const { error: errAreas } = await dbCtrl.from('mant_programa_areas')
          .insert(form.areasComunes.map(id => ({ id_programa_fk: programaId, id_area_comun_fk: id })))
        if (errAreas) { setError(errAreas.message); setSaving(false); return }
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
            <input className="input" style={{ fontSize: 13 }} value={form.nombre} onChange={setF('nombre')} placeholder="ej. Barrido y soplado St. Andrews" />
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Cuadrante</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_cuadrante_fk}
                onChange={e => setForm(f => ({ ...f, id_cuadrante_fk: e.target.value, id_area_fk: '', areasComunes: [] }))}>
                <option value="">—</option>
                {cuadrantes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Área</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk}
                onChange={e => setForm(f => ({ ...f, id_area_fk: e.target.value, areasComunes: [] }))}>
                <option value="">—</option>
                {areas
                  .filter(a => !form.id_cuadrante_fk || a.id_cuadrante_fk === Number(form.id_cuadrante_fk))
                  .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="label" style={{ fontSize: 11 }}>Áreas Comunes</label>
              {areaComunesDisponibles.length > 0 && (
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, areasComunes: todasSeleccionadas ? [] : areaComunesDisponibles.map(a => a.id) }))}
                  style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {todasSeleccionadas ? 'Quitar todas' : 'Seleccionar todas'}
                </button>
              )}
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 150, overflowY: 'auto', padding: 6 }}>
              {!form.id_area_fk ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 4px' }}>Elige un área para ver sus áreas comunes</div>
              ) : areaComunesDisponibles.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 4px' }}>Esta área no tiene áreas comunes registradas</div>
              ) : areaComunesDisponibles.map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.areasComunes.includes(a.id)}
                    onChange={e => setForm(f => ({
                      ...f,
                      areasComunes: e.target.checked ? [...f.areasComunes, a.id] : f.areasComunes.filter(id => id !== a.id),
                    }))} />
                  {a.nombre}{a.descripcion ? ` - ${a.descripcion}` : ''}
                </label>
              ))}
            </div>
            {form.areasComunes.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {form.areasComunes.length} área{form.areasComunes.length === 1 ? '' : 's'} común{form.areasComunes.length === 1 ? '' : 'es'} seleccionada{form.areasComunes.length === 1 ? '' : 's'}
              </div>
            )}
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
            <div><label className="label" style={{ fontSize: 11 }}>Fecha de fin (opcional)</label>
              <input className="input" type="date" style={{ fontSize: 13 }} value={form.fecha_fin} onChange={setF('fecha_fin')} />
            </div>
          </div>
          <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
            borderRadius: 6, fontSize: 12, color: 'var(--blue)' }}>
            {previewFechas.length > 0
              ? <>Próximas ocurrencias: {previewFechas.map(d => fmtDate(d)).join(' · ')}{form.frecuencia === 'Diario' ? ' …' : ''}</>
              : 'Define la fecha de inicio para previsualizar las ocurrencias'}
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              No se crean filas por adelantado — las ejecuciones se registran semana a semana en &quot;Ejecución Semanal&quot;.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label className="label" style={{ fontSize: 11 }}>Responsable</label>
              <ColaboradorPopup
                value={{ id: form.id_responsable_fk, nombre: form.responsable }}
                onChange={c => setForm(f => ({
                  ...f,
                  id_responsable_fk: c ? c.id : null,
                  responsable: c ? c.nombre : '',
                }))}
              />
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
// Detalle del Programa — datos de la plantilla + próximas ocurrencias
// (ya no lista las 365 filas del año completo)
// ═══════════════════════════════════════════════════════════════
function ProgramaDetail({ prog, cuadMap, areaMap, acMap, onClose, onEdit, onCambiarStatus, onCambiarStatusBulk, onGenerarOT }: {
  prog: any
  cuadMap: Record<number, string>
  areaMap: Record<number, string>
  acMap: Record<number, string>
  onClose: () => void
  onEdit?: () => void
  onCambiarStatus: (prog: any, areaComunId: number | null, fecha: Date, status: string) => Promise<void>
  onCambiarStatusBulk: (prog: any, areaIds: (number | null)[], fecha: Date, status: string) => Promise<void>
  onGenerarOT: (prog: any, areaComunId: number | null, fecha: Date) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [localProg, setLocalProg] = useState(prog)
  const [showAreas, setShowAreas] = useState(false)

  const areaSlots: (number | null)[] = (localProg.areasComunes ?? []).length ? localProg.areasComunes : [null]
  const multi = areaSlots.length > 1
  const proximas = proximasFechas(localProg, 14)
  const historial = (localProg.ejecuciones ?? []).slice().reverse().slice(0, 10)

  const handle = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    await fn()
    setBusy(null)
  }

  const cambiarYReflejar = async (areaId: number | null, fecha: Date, status: string) => {
    await onCambiarStatus(localProg, areaId, fecha, status)
    const fechaISO = toISODate(fecha)
    setLocalProg((p: any) => {
      const existing = (p.ejecuciones ?? []).find((e: any) => e.fecha_prog === fechaISO && e.id_area_comun_fk === areaId)
      const ejecuciones = existing
        ? p.ejecuciones.map((e: any) => e.id === existing.id ? { ...e, status } : e)
        : [...(p.ejecuciones ?? []), { id: `tmp-${fechaISO}-${areaId}`, fecha_prog: fechaISO, id_area_comun_fk: areaId, status }]
      return { ...p, ejecuciones }
    })
  }

  const bulkYReflejar = async (fecha: Date, status: string) => {
    await onCambiarStatusBulk(localProg, areaSlots, fecha, status)
    const fechaISO = toISODate(fecha)
    setLocalProg((p: any) => {
      let ejecuciones = p.ejecuciones ?? []
      areaSlots.forEach(areaId => {
        const existing = ejecuciones.find((e: any) => e.fecha_prog === fechaISO && e.id_area_comun_fk === areaId)
        ejecuciones = existing
          ? ejecuciones.map((e: any) => e.id === existing.id ? { ...e, status } : e)
          : [...ejecuciones, { id: `tmp-${fechaISO}-${areaId}`, fecha_prog: fechaISO, id_area_comun_fk: areaId, status }]
      })
      return { ...p, ejecuciones }
    })
  }

  const completadas = (localProg.ejecuciones ?? []).filter((e: any) => e.status === 'Completada').length
  const total = (localProg.ejecuciones ?? []).length

  return (
    <ModalShell modulo="mantenimiento" titulo={prog.nombre} onClose={onClose} maxWidth={640}
    >
        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 110px)', padding: '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 14, fontSize: 13 }}>
            {prog.tipo_trabajo && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tipo</div>{prog.tipo_trabajo}</div>}
            <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Frecuencia</div>{prog.frecuencia}</div>
            {prog.responsable && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Responsable</div>{prog.responsable}</div>}
            {prog.id_cuadrante_fk && cuadMap[prog.id_cuadrante_fk] && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Cuadrante</div>{cuadMap[prog.id_cuadrante_fk]}</div>}
            {prog.id_area_fk && areaMap[prog.id_area_fk] && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Área</div>{areaMap[prog.id_area_fk]}</div>}
            {prog.fecha_inicio && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inicio</div>{fmtDate(prog.fecha_inicio)}</div>}
            {prog.fecha_fin && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fin</div>{fmtDate(prog.fecha_fin)}</div>}
          </div>
          {(localProg.areasComunes ?? []).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                Áreas Comunes ({localProg.areasComunes.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {localProg.areasComunes.map((id: number) => (
                  <span key={id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: 'var(--text-secondary)' }}>
                    {acMap[id] ?? `#${id}`}
                  </span>
                ))}
              </div>
            </div>
          )}
          {prog.descripcion && (
            <p style={{ background: '#f8fafc', borderLeft: '3px solid var(--blue)', padding: '8px 12px', fontSize: 13, marginBottom: 16 }}>
              {prog.descripcion}
            </p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Próximas ocurrencias
            </div>
            {multi && (
              <button onClick={() => setShowAreas(s => !s)}
                style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {showAreas ? 'Vista resumida' : `Desglosar por área (${areaSlots.length})`}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {proximas.map(fecha => {
              const fechaISO = toISODate(fecha)
              const cells = areaSlots.map(areaId => {
                const ejec = (localProg.ejecuciones ?? []).find((e: any) => e.fecha_prog === fechaISO && e.id_area_comun_fk === areaId)
                return { areaId, status: ejec?.status ?? 'Pendiente', id_ot_fk: ejec?.id_ot_fk ?? null }
              })

              if (!multi) {
                const cell = cells[0]
                const sc = STATUS_STYLE[cell.status] ?? STATUS_STYLE['Pendiente']
                const key = fechaISO
                return (
                  <div key={fechaISO} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', border: '1px solid #f1f5f9', borderRadius: 6 }}>
                    <span style={{ fontSize: 12.5, minWidth: 110 }}>{fmtDate(fecha)}</span>
                    <select value={cell.status} disabled={busy === key}
                      onChange={e => handle(key, () => cambiarYReflejar(cell.areaId, fecha, e.target.value))}
                      style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, cursor: 'pointer' }}>
                      <option value="Pendiente">Pendiente</option>
                      <option value="En Proceso">En Proceso</option>
                      <option value="Completada">Completada</option>
                      <option value="Omitida">Omitida</option>
                    </select>
                    {cell.id_ot_fk ? (
                      <span style={{ fontSize: 11, color: 'var(--blue)' }}>OT generada</span>
                    ) : (
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={() => handle(key, () => onGenerarOT(localProg, cell.areaId, fecha))} disabled={busy === key}>
                        <Wrench size={10} /> Crear OT
                      </button>
                    )}
                  </div>
                )
              }

              if (!showAreas) {
                const completasFecha = cells.filter(c => c.status === 'Completada').length
                const key = fechaISO
                return (
                  <div key={fechaISO} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', border: '1px solid #f1f5f9', borderRadius: 6 }}>
                    <span style={{ fontSize: 12.5, minWidth: 110 }}>{fmtDate(fecha)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700,
                      color: completasFecha === cells.length ? '#15803d' : completasFecha > 0 ? '#d97706' : 'var(--text-muted)' }}>
                      {completasFecha}/{cells.length} áreas completadas
                    </span>
                    {completasFecha < cells.length && (
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                        onClick={() => handle(key, () => bulkYReflejar(fecha, 'Completada'))} disabled={busy === key}>
                        ✓ Marcar todas
                      </button>
                    )}
                  </div>
                )
              }

              return (
                <div key={fechaISO} style={{ border: '1px solid #f1f5f9', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{fmtDate(fecha)}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {cells.map(cell => {
                      const sc = STATUS_STYLE[cell.status] ?? STATUS_STYLE['Pendiente']
                      const key = `${fechaISO}-${cell.areaId}`
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11.5, minWidth: 140, color: 'var(--text-secondary)' }}>{acMap[cell.areaId as number] ?? '—'}</span>
                          <select value={cell.status} disabled={busy === key}
                            onChange={e => handle(key, () => cambiarYReflejar(cell.areaId, fecha, e.target.value))}
                            style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
                              background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, cursor: 'pointer' }}>
                            <option value="Pendiente">Pendiente</option>
                            <option value="En Proceso">En Proceso</option>
                            <option value="Completada">Completada</option>
                            <option value="Omitida">Omitida</option>
                          </select>
                          {cell.id_ot_fk ? (
                            <span style={{ fontSize: 10, color: 'var(--blue)' }}>OT ✓</span>
                          ) : (
                            <button className="btn-ghost" style={{ fontSize: 10, padding: '2px 6px' }}
                              onClick={() => handle(key, () => onGenerarOT(localProg, cell.areaId, fecha))} disabled={busy === key}>
                              + OT
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {proximas.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin ocurrencias futuras (verifica fecha de fin).</div>
            )}
          </div>

          {historial.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Historial reciente
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {historial.map((e: any) => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                    <span>{fmtDate(e.fecha_prog)}</span>
                    <Badge text={e.status} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {completadas}/{total} ejecuciones completadas (histórico registrado)
          </div>
          {onEdit && (
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>
              Editar programa
            </button>
          )}
        </div>
    </ModalShell>
  )
}

// ═══════════════════════════════════════════════════════════════
// Popup selector de Colaborador
// ═══════════════════════════════════════════════════════════════
function ColaboradorPopup({ value, onChange }: {
  value: { id: number | null; nombre: string }
  onChange: (c: { id: number; nombre: string } | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    dbCfg.from('colaboradores').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setColaboradores(data ?? []))
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtrados = colaboradores.filter(c => {
    const full = nombreCompletoColaborador(c).toLowerCase()
    return full.includes(query.toLowerCase())
  })

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--input-bg, #fff)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '6px 10px', fontSize: 13, cursor: 'pointer',
          color: value.nombre ? 'var(--text)' : 'var(--text-muted)' }}>
        <User size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value.nombre || 'Seleccionar responsable…'}
        </span>
        {value.nombre && (
          <span onClick={e => { e.stopPropagation(); onChange(null) }}
            style={{ color: 'var(--text-muted)', lineHeight: 1 }}>
            <X size={12} />
          </span>
        )}
        <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
          background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.12)', marginTop: 4, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar colaborador…"
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: 12, background: 'transparent' }} />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtrados.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Sin resultados</div>
            ) : filtrados.map(c => {
              const nombre = nombreCompletoColaborador(c)
              const selected = c.id === value.id
              return (
                <button key={c.id} type="button"
                  onClick={() => { onChange({ id: c.id, nombre }); setOpen(false); setQuery('') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px',
                    fontSize: 13, background: selected ? '#eff6ff' : 'transparent',
                    color: selected ? 'var(--blue)' : 'var(--text)',
                    border: 'none', cursor: 'pointer' }}>
                  {nombre}
                  {c.puesto && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{c.puesto}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
