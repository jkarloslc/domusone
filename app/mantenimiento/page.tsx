'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, RefreshCw, Eye, X, Save, Loader,
  Calendar, CheckCircle, ChevronDown, ChevronRight,
  Filter, ClipboardList, Wrench
} from 'lucide-react'
import OrdenesTrabajoTab from './OrdenesTrabajoTab'
import ModalShell from '@/components/ui/ModalShell'

const FRECUENCIAS = ['Semanal','Quincenal','Mensual','Bimestral','Trimestral','Semestral','Anual']
const TIPOS       = ['Jardinería','Plomería','Electricidad','Limpieza','Obra Civil','Pintura','Fumigación','Otro']
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
  const [tab,          setTab]        = useState<'programa' | 'ordenes' | 'ordenes_oitydisa'>('programa')
  const [programas,    setProgramas]  = useState<any[]>([])
  const [areas,       setAreas]  = useState<any[]>([])
  const [areaMap,     setAreaMap]     = useState<Record<number, string>>({})
  const [centrosCosto, setCentros]    = useState<any[]>([])
  const [ccMap,        setCcMap]      = useState<Record<number, string>>({})
  const [frentes,      setFrentes]    = useState<any[]>([])
  const [frMap,        setFrMap]      = useState<Record<number, string>>({})
  const [relAF,        setRelAF]      = useState<{id_area: number; id_frente: number}[]>([])
  const [loading,      setLoading]    = useState(true)
  const [filterAnio,   setFilterAnio] = useState(new Date().getFullYear())
  const [filterCC,     setFilterCC]   = useState('')
  const [filterArea,  setFilterArea]  = useState('')
  const [filterFr,     setFilterFr]   = useState('')
  const [modal,        setModal]      = useState(false)
  const [editing,      setEditing]    = useState<any | null>(null)
  const [detail,       setDetail]     = useState<any | null>(null)
  const [expandidos,   setExpandidos] = useState<Record<number, boolean>>({})

  useEffect(() => {
    Promise.all([
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('frentes').select('id, nombre, id_area_fk').eq('activo', true).order('nombre'),
      dbCfg.from('rel_area_frente').select('id_area, id_frente'),
    ]).then(([{ data: secs }, { data: ccs }, { data: frs }, { data: relaf }]) => {
      setAreas(secs ?? [])
      setCentros(ccs ?? [])
      setFrentes(frs ?? [])
      setRelAF((relaf ?? []) as any)
      const sm: Record<number, string> = {}; (secs ?? []).forEach((s: any) => { sm[s.id] = s.nombre })
      const cm: Record<number, string> = {}; (ccs ?? []).forEach((c: any) => { cm[c.id] = c.nombre })
      const fm: Record<number, string> = {}; (frs ?? []).forEach((f: any) => { fm[f.id] = f.nombre })
      setAreaMap(sm); setCcMap(cm); setFrMap(fm)
    })
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('programas_mantenimiento').select('*')
      .eq('anio', filterAnio).eq('activo', true).order('nombre')
    if (filterCC)  q = q.eq('id_centro_costo_fk', Number(filterCC))
    if (filterArea) q = q.eq('id_area_fk', Number(filterArea))
    if (filterFr)  q = q.eq('id_frente_fk', Number(filterFr))
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
  }, [filterAnio, filterCC, filterArea, filterFr])

  useEffect(() => { fetchData() }, [fetchData])

  const todasTareas = programas.flatMap((p: any) => p.tareas ?? [])
  const completadas = todasTareas.filter((t: any) => t.status === 'Completada').length
  const cumplimiento = todasTareas.length ? Math.round((completadas / todasTareas.length) * 100) : 0

  const toggleExpand = (id: number) => setExpandidos(e => ({ ...e, [id]: !e[id] }))

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este programa?')) return
    await dbCtrl.from('programas_mantenimiento').update({ activo: false }).eq('id', id)
    fetchData()
  }

  return (
    <div style={{ padding: '20px 24px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--blue-pale)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={16} style={{ color: 'var(--blue)' }} />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
              Mantenimiento
            </h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Programa anual · Órdenes de trabajo · {filterAnio}
            </p>
          </div>
        </div>
        {tab === 'programa' && canWrite('mantenimiento') && (
          <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setEditing(null); setModal(true) }}>
            <Plus size={12} /> Nuevo Programa
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 14 }}>
        <button onClick={() => setTab('programa')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: tab === 'programa' ? 600 : 400,
            color: tab === 'programa' ? 'var(--blue)' : 'var(--text-muted)',
            borderBottom: tab === 'programa' ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -1 }}>
          <Calendar size={12} /> Programa Anual
        </button>
        <button onClick={() => setTab('ordenes')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: tab === 'ordenes' ? 600 : 400,
            color: tab === 'ordenes' ? 'var(--blue)' : 'var(--text-muted)',
            borderBottom: tab === 'ordenes' ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -1 }}>
          <ClipboardList size={12} /> OT Balvanera
        </button>
        <button onClick={() => setTab('ordenes_oitydisa')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: tab === 'ordenes_oitydisa' ? 600 : 400,
            color: tab === 'ordenes_oitydisa' ? '#2563eb' : 'var(--text-muted)',
            borderBottom: tab === 'ordenes_oitydisa' ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: -1 }}>
          <Wrench size={12} /> OT Oitydisa
        </button>
      </div>

      {/* Tab: Órdenes de Trabajo Balvanera */}
      {tab === 'ordenes' && <OrdenesTrabajoTab empresa="Balvanera" />}

      {/* Tab: Órdenes de Trabajo Oitydisa */}
      {tab === 'ordenes_oitydisa' && <OrdenesTrabajoTab empresa="Oitydisa" />}

      {/* Tab: Programa Anual */}
      {tab === 'programa' && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 14 }}>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>{programas.length}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Programas</div>
            </div>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>
                {todasTareas.filter((t: any) => t.status === 'Pendiente').length}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendientes</div>
            </div>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#15803d' }}>{completadas}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completadas</div>
            </div>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#94a3b8' }}>
                {todasTareas.filter((t: any) => t.status === 'Omitida').length}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Omitidas</div>
            </div>
            <div className="card" style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 20, fontWeight: 700,
                color: cumplimiento >= 80 ? '#15803d' : cumplimiento >= 50 ? '#d97706' : '#dc2626' }}>
                {cumplimiento}%
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cumplimiento</div>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              <Filter size={11} /> Filtros
            </span>
            <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
            <select className="select" style={{ width: 72, fontSize: 12, padding: '3px 6px', height: 28 }} value={filterAnio}
              onChange={e => setFilterAnio(Number(e.target.value))}>
              {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 130px', maxWidth: 210, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterCC}
              onChange={e => { setFilterCC(e.target.value); setFilterArea(''); setFilterFr('') }}>
              <option value="">Centro de costo</option>
              {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 110px', maxWidth: 190, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterArea}
              onChange={e => { setFilterArea(e.target.value); setFilterFr('') }}>
              <option value="">Área</option>
              {(areas as any[])
                .filter(s => !filterCC || s.id_centro_costo_fk === Number(filterCC))
                .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <select className="select" style={{ flex: '1 1 100px', maxWidth: 170, fontSize: 12, padding: '3px 8px', height: 28 }} value={filterFr}
              onChange={e => setFilterFr(e.target.value)}>
              <option value="">Frente</option>
              {(() => {
                const aId = Number(filterArea)
                const permitidos = filterArea
                  ? new Set(relAF.filter(r => r.id_area === aId).map(r => r.id_frente))
                  : null
                return frentes
                  .filter(f => !permitidos || permitidos.has(f.id))
                  .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)
              })()}
            </select>
            {(filterCC || filterArea || filterFr) && (
              <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', height: 28, color: '#dc2626', whiteSpace: 'nowrap' }}
                onClick={() => { setFilterCC(''); setFilterArea(''); setFilterFr('') }}>
                <X size={11} /> Limpiar
              </button>
            )}
            <button className="btn-ghost" style={{ padding: '3px 8px', height: 28, marginLeft: 'auto' }} onClick={fetchData}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Lista programas */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
            </div>
          ) : programas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
              Sin programas de mantenimiento para {filterAnio}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {programas.map((prog: any) => {
                const tareas      = prog.tareas ?? []
                const comp        = tareas.filter((t: any) => t.status === 'Completada').length
                const pct         = tareas.length ? Math.round((comp / tareas.length) * 100) : 0
                const expanded    = expandidos[prog.id] !== false
                const proxima     = tareas.find((t: any) => t.status === 'Pendiente')

                return (
                  <div key={prog.id} className="card" style={{ overflow: 'hidden', padding: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderBottom: expanded ? '1px solid #e2e8f0' : 'none',
                      background: 'var(--blue-pale)', cursor: 'pointer' }}
                      onClick={() => toggleExpand(prog.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {expanded
                          ? <ChevronDown size={12} style={{ color: 'var(--blue)' }} />
                          : <ChevronRight size={12} style={{ color: 'var(--blue)' }} />}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>{prog.nombre}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            {prog.id_area_fk ? areaMap[prog.id_area_fk] : 'Sin área'} ·{' '}
                            {prog.tipo_trabajo ?? '—'} · {prog.frecuencia}
                            {prog.responsable ? ` · ${prog.responsable}` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                            {comp}/{tareas.length} · {pct}%
                          </div>
                          <div style={{ width: 100, height: 5, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2,
                              background: pct >= 80 ? '#15803d' : pct >= 50 ? '#d97706' : '#2563eb' }} />
                          </div>
                        </div>
                        {proxima && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                            Próxima: <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{fmtDate(proxima.fecha_prog)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                          <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }}
                            onClick={() => setDetail(prog)}>
                            <Eye size={10} /> Ver
                          </button>
                          {canWrite('mantenimiento') && (
                            <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }}
                              onClick={() => { setEditing(prog); setModal(true) }}>
                              Editar
                            </button>
                          )}
                          {canDelete() && (
                            <button className="btn-ghost" style={{ fontSize: 11, color: '#dc2626', padding: '4px 6px' }}
                              onClick={() => handleDelete(prog.id)}>
                              <X size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    {expanded && (
                      <div style={{ padding: '10px 14px' }}>
                        <MiniCalendario tareas={tareas} onRefresh={fetchData} prog={prog} areaMap={areaMap} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {modal  && <ProgramaModal areas={areas} prog={editing}
        onClose={() => setModal(false)}
        onSaved={() => { setModal(false); fetchData() }} />}
      {detail && <ProgramaDetail prog={detail} areaMap={areaMap} ccMap={ccMap} frMap={frMap}
        onClose={() => { setDetail(null); fetchData() }} />}
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
                        style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
                          background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        {generando === t.id ? '…' : '+ OT'}
                      </button>
                    )}
                    {t.id_ot_fk && (
                      <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
                        background: '#eff6ff', color: 'var(--blue)', border: '1px solid #bfdbfe' }}>
                        OT
                      </span>
                    )}
                    {t.status !== 'Completada' && (
                      <button onClick={() => cambiarStatus(t.id, 'Completada')} disabled={updating === t.id}
                        style={{ fontSize: 9, padding: '2px 5px', borderRadius: 3,
                          background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', cursor: 'pointer' }}>
                        ✓
                      </button>
                    )}
                    {t.status === 'Pendiente' && (
                      <button onClick={() => cambiarStatus(t.id, 'Omitida')} disabled={updating === t.id}
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
function ProgramaModal({ areas, prog, onClose, onSaved }: {
  areas: any[]; prog: any; onClose: () => void; onSaved: () => void
}) {
  const { authUser } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [centrosCosto, setCentros] = useState<any[]>([])
  const [frentes, setFrentes]      = useState<any[]>([])
  const [relAF, setRelAFProg]      = useState<{id_area: number; id_frente: number}[]>([])
  const [form, setForm] = useState({
    nombre:             prog?.nombre             ?? '',
    anio:               prog?.anio?.toString()   ?? new Date().getFullYear().toString(),
    id_area_fk:         prog?.id_area_fk?.toString() ?? '',
    id_centro_costo_fk: prog?.id_centro_costo_fk?.toString() ?? '',
    id_frente_fk:       prog?.id_frente_fk?.toString() ?? '',
    tipo_trabajo:       prog?.tipo_trabajo       ?? '',
    frecuencia:         prog?.frecuencia         ?? 'Mensual',
    mes_inicio:         prog?.mes_inicio?.toString() ?? '1',
    responsable:        prog?.responsable        ?? '',
    descripcion:        prog?.descripcion        ?? '',
    presupuesto_est:    prog?.presupuesto_est?.toString() ?? '0',
  })

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCentros(data ?? []))
    dbCfg.from('frentes').select('id, nombre, id_area_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setFrentes(data ?? []))
    dbCfg.from('rel_area_frente').select('id_area, id_frente')
      .then(({ data }) => setRelAFProg((data ?? []) as any))
  }, [])

  const totalFechas = generarFechas(Number(form.anio), form.frecuencia, Number(form.mes_inicio)).length

  const handleSave = async () => {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
    setSaving(true); setError('')
    const payload = {
      nombre:             form.nombre.trim(),
      anio:               Number(form.anio),
      id_area_fk:         form.id_area_fk      ? Number(form.id_area_fk)      : null,
      id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
      id_frente_fk:       form.id_frente_fk        ? Number(form.id_frente_fk)       : null,
      tipo_trabajo:       form.tipo_trabajo || null,
      frecuencia:         form.frecuencia,
      mes_inicio:         Number(form.mes_inicio),
      responsable:        form.responsable.trim() || null,
      descripcion:        form.descripcion.trim() || null,
      presupuesto_est:    Number(form.presupuesto_est || 0),
      updated_at:         new Date().toISOString(),
    }
    let progId = prog?.id
    if (prog) {
      const { error: err } = await dbCtrl.from('programas_mantenimiento').update(payload).eq('id', prog.id)
      if (err) { setError(err.message); setSaving(false); return }
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
            <div><label className="label" style={{ fontSize: 11 }}>Centro de Costo</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_centro_costo_fk}
                onChange={e => setForm(f => ({ ...f, id_centro_costo_fk: e.target.value, id_area_fk: '', id_frente_fk: '' }))}>
                <option value="">—</option>
                {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Área</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_area_fk}
                onChange={e => setForm(f => ({ ...f, id_area_fk: e.target.value, id_frente_fk: '' }))}>
                <option value="">—</option>
                {(areas as any[])
                  .filter(s => !form.id_centro_costo_fk || s.id_centro_costo_fk === Number(form.id_centro_costo_fk))
                  .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <div><label className="label" style={{ fontSize: 11 }}>Frente</label>
              <select className="select" style={{ fontSize: 12 }} value={form.id_frente_fk} onChange={setF('id_frente_fk')}>
                <option value="">—</option>
                {(() => {
                  const aId = Number(form.id_area_fk)
                  const permitidos = form.id_area_fk
                    ? new Set(relAF.filter(r => r.id_area === aId).map(r => r.id_frente))
                    : null
                  return frentes
                    .filter(f => !permitidos || permitidos.has(f.id))
                    .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)
                })()}
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
          {!prog && (
            <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 6, fontSize: 12, color: 'var(--blue)' }}>
              Se generarán <strong>{totalFechas} tareas</strong> para {form.anio}
            </div>
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
function ProgramaDetail({ prog, areaMap, ccMap, frMap, onClose }: {
  prog: any
  areaMap: Record<number, string>
  ccMap: Record<number, string>
  frMap: Record<number, string>
  onClose: () => void
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

  return (
    <ModalShell modulo="mantenimiento" titulo={prog.nombre} onClose={onClose} maxWidth={760}
    >
        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 120px)' }}>
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
                            {generando === t.id ? <Loader size={10} className="animate-spin" /> : <Wrench size={10} />} OT
                          </button>
                        )}
                        {t.status !== 'Completada' && (
                          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#15803d' }}
                            onClick={() => cambiarStatus(t.id, 'Completada')} disabled={updating === t.id}>
                            <CheckCircle size={11} />
                          </button>
                        )}
                        {t.status === 'Pendiente' && (
                          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#94a3b8' }}
                            onClick={() => cambiarStatus(t.id, 'Omitida')} disabled={updating === t.id}>
                            —
                          </button>
                        )}
                        {t.status === 'Completada' && (
                          <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: '#d97706' }}
                            onClick={() => cambiarStatus(t.id, 'Pendiente')} disabled={updating === t.id}>
                            ↩
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
    </ModalShell>
  )
}
