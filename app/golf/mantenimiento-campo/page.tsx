'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl } from '@/lib/supabase'
import {
  Leaf, ChevronLeft, ChevronRight, RefreshCw, ChevronDown, Search,
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const TIPO_CLR: Record<string, string> = {
  'Jardinería': '#16a34a',
  'Fumigación': '#d97706',
  'Obra Civil': '#2563eb',
  'Otro':       '#7c3aed',
}

const STATUS_CLR: Record<string, { bg: string; text: string }> = {
  'Pendiente':  { bg: '#fef3c7', text: '#d97706' },
  'En Proceso': { bg: '#dbeafe', text: '#2563eb' },
  'Completada': { bg: '#dcfce7', text: '#16a34a' },
  'Omitida':    { bg: '#f1f5f9', text: '#64748b' },
}

const CAT_CLR: Record<string, string> = {
  'Fungicida':     '#ef4444',
  'Herbicida':     '#f97316',
  'Insecticida':   '#a855f7',
  'Fertilizante':  '#16a34a',
  'Bioestimulante':'#0891b2',
  'Enmienda':      '#92400e',
  'Humectante':    '#0284c7',
  'Agua':          '#2563eb',
  'Semilla':       '#4ade80',
}

// Catálogo de productos — basado en hoja 2 del reporte Excel Nov 2025–Jun 2026
const CATALOGO = [
  { cat: 'Fungicida',     nombre: 'Tilt (Propiconazol)',           dosis: '25–50 ml / 15 lts agua',     areas: 'Greens, Bordos, Fairways',            uso: 'Dollar Spot, Rhizoctonia' },
  { cat: 'Fungicida',     nombre: 'Amistar (Azoxistrobina)',        dosis: '25–50 gr / bomba',            areas: 'Greens, Fairways',                    uso: 'Rhizoctonia, hongos en general' },
  { cat: 'Fungicida',     nombre: 'Sportak (Procloraz)',            dosis: '25–50 ml / 15 lts agua',     areas: 'Greens, Mesas de salida, Fairways',   uso: 'Dollar Spot, Rhizoctonia' },
  { cat: 'Fungicida',     nombre: 'Daconil 2787 (Clorotalonil)',    dosis: '100–150 gr / 15 lts agua',   areas: 'Greens, Mesas de salida, Fairways',   uso: 'Enfermedades fúngicas en general' },
  { cat: 'Fungicida',     nombre: 'Manzate 200 (Mancozeb)',         dosis: '150–200 gr / 15 lts agua',   areas: 'Greens, Fairways',                    uso: 'Rhizoctonia (especialista)' },
  { cat: 'Fungicida',     nombre: 'Quick Silver',                   dosis: '4–4.5 ml / 15 lts agua',     areas: 'Greens, Área de práctica',            uso: 'Dollar Spot, musgo, pasto de agua' },
  { cat: 'Herbicida',     nombre: 'Banvel 12-24 (Dicamba)',         dosis: 'Según área afectada',         areas: 'Fairways, Rough, Bordos',             uso: 'Control continuo de trébol (aplicación más frecuente del campo)' },
  { cat: 'Herbicida',     nombre: 'Trimec / Trimec Azul',           dosis: '90 ml / 15 lts agua',        areas: 'Fairways, Rough, Bordos',             uso: 'Maleza de hoja ancha' },
  { cat: 'Herbicida',     nombre: 'Quinclorac',                     dosis: 'Según necesidad',             areas: 'Greens, Área de práctica',            uso: 'Kikuyo — SUSPENDIDO; solo con autorización agronómica' },
  { cat: 'Herbicida',     nombre: 'Tordon XT',                      dosis: '150 ml / 15 lts agua',       areas: 'Orillas, Mesas de salida',            uso: 'Plantas leñosas invasoras (aplicación dirigida con pincel)' },
  { cat: 'Insecticida',   nombre: 'Allectus 3G',                    dosis: '3–5 gr / m²',                areas: 'H7, H18 y zonas afectadas',           uso: 'Gallina ciega / Phyllophaga spp. — granulado + riego inmediato' },
  { cat: 'Insecticida',   nombre: 'Sevin 80 (Carbarilo)',           dosis: '100 gr / 15 lts agua',       areas: 'General',                             uso: 'Gusano cogollero (Spodoptera), orugas defoliadoras' },
  { cat: 'Insecticida',   nombre: 'Decis / Decis Forte',            dosis: 'Según etiqueta',              areas: 'General',                             uso: 'Plagas en general; alternativa a Sevin en infestaciones severas' },
  { cat: 'Insecticida',   nombre: 'Confidor (Imidacloprid)',         dosis: 'Según etiqueta',              areas: 'General',                             uso: 'Chicharritas, plagas sistémicas' },
  { cat: 'Fertilizante',  nombre: 'Floranid Master Twin Eagle',      dosis: '150 kg / ha',                areas: 'Greens, Fairways',                    uso: 'Fertilización premium de crecimiento' },
  { cat: 'Fertilizante',  nombre: 'Sulfamin 45',                    dosis: '150 kg / ha',                areas: 'Greens, Fairways, Mesas de salida',   uso: 'Fertilización + recuperación de áreas desgastadas' },
  { cat: 'Fertilizante',  nombre: 'DAP (Fosfato Diamónico)',         dosis: 'Según necesidad',             areas: 'Fairways, Bordos',                    uso: 'Densidad foliar, desarrollo radicular' },
  { cat: 'Fertilizante',  nombre: 'Iron Pro',                       dosis: '150–200 gr / 15 lts agua',   areas: 'Greens',                              uso: 'Mantenimiento de color verde intenso' },
  { cat: 'Bioestimulante',nombre: 'Aminoácidos Bio Turf Organics',   dosis: '150 gr / 15 lts agua',       areas: 'Greens, Fairways',                    uso: 'Acondicionamiento y mejoramiento de suelo' },
  { cat: 'Bioestimulante',nombre: 'Extracto de alga marina',         dosis: 'Según etiqueta',              areas: 'Greens',                              uso: 'Estimulación radicular, tolerancia a estrés' },
  { cat: 'Enmienda',      nombre: 'Yeso Agrícola (Gypsum)',          dosis: '150 kg / ha',                areas: 'H3, H7, H9, H17 (drenaje problemático)',uso: 'Mejora drenaje, reduce suelo sódico' },
  { cat: 'Enmienda',      nombre: 'Composta',                        dosis: 'Según necesidad',             areas: 'Fairways, Bordos',                    uso: 'Aporte de materia orgánica' },
  { cat: 'Enmienda',      nombre: 'Arena fina / sílica',             dosis: 'Según necesidad',             areas: 'Greens',                              uso: 'Topdressing — nivelación y drenaje superficial' },
  { cat: 'Humectante',    nombre: 'Yuccah',                          dosis: '250 ml / 15 lts agua',       areas: 'H15 y zonas hidrófobas',              uso: 'Tratamiento de zonas hidrófobas — verificar con prueba de infiltración' },
  { cat: 'Agua',          nombre: 'Cloro (Hipoclorito)',             dosis: '≥ 3 ppm',                    areas: 'Lago H12',                            uso: 'Control de mosquitos y larvas acuáticas — 3 aplic./semana en temporada lluvias' },
  { cat: 'Semilla',       nombre: 'Bent XTREME 7',                   dosis: 'Según necesidad',             areas: 'Greens H2 y H3',                      uso: 'Tapones de pasto — relleno de parches de Bermuda (problemática muy alta)' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type Programa = {
  id: number
  nombre: string
  tipo_trabajo: string
  frecuencia: string
  mes_inicio: number
  fecha_fin: string | null
  responsable: string | null
  descripcion: string | null
  activo: boolean
}

type TareaRec = {
  id: number
  id_programa_fk: number
  mes: number
  status: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function estaActivoEnMes(p: Programa, mes: number): boolean {
  const inicio = p.mes_inicio ?? 1
  const fin = p.fecha_fin
    ? new Date(p.fecha_fin + 'T12:00:00').getMonth() + 1
    : 12
  if (mes < inicio || mes > fin) return false
  const diff = mes - inicio
  switch (p.frecuencia) {
    case 'Semanal':
    case 'Quincenal':
    case 'Mensual':    return true
    case 'Bimestral':  return diff % 2 === 0
    case 'Trimestral': return diff % 3 === 0
    case 'Semestral':  return diff % 6 === 0
    case 'Anual':      return diff === 0
    default:           return false
  }
}

function rangoMeses(p: Programa): string {
  const ini = MESES[(p.mes_inicio ?? 1) - 1].slice(0, 3)
  const fin = p.fecha_fin
    ? MESES[new Date(p.fecha_fin + 'T12:00:00').getMonth()].slice(0, 3)
    : 'Dic'
  return ini === fin ? ini : `${ini}–${fin}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MantenimientoCampoPage() {
  const hoy = new Date()
  const [tab, setTab] = useState<'ejecucion' | 'programas' | 'catalogo'>('ejecucion')
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [anio, setAnio] = useState(hoy.getFullYear())

  const [programas, setProgramas] = useState<Programa[]>([])
  const [tareas, setTareas] = useState<TareaRec[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)

  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat] = useState('Todos')

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadProgramas = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCtrl
      .from('programas_mantenimiento')
      .select('id,nombre,tipo_trabajo,frecuencia,mes_inicio,fecha_fin,responsable,descripcion,activo')
      .eq('anio', anio)
      .eq('activo', true)
      .eq('modulo', 'golf')
      .order('tipo_trabajo')
      .order('frecuencia')
      .order('nombre')
    setProgramas(data ?? [])
    setLoading(false)
  }, [anio])

  const loadTareas = useCallback(async () => {
    if (!programas.length) { setTareas([]); return }
    const { data } = await dbCtrl
      .from('programa_tareas')
      .select('id,id_programa_fk,mes,status')
      .in('id_programa_fk', programas.map(p => p.id))
      .eq('mes', mes)
    setTareas(data ?? [])
  }, [programas, mes])

  useEffect(() => { loadProgramas() }, [loadProgramas])
  useEffect(() => { loadTareas() }, [loadTareas])

  // ── Status helpers ─────────────────────────────────────────────────────────

  function getStatus(progId: number): string {
    return tareas.find(t => t.id_programa_fk === progId)?.status ?? 'Pendiente'
  }

  async function cambiarStatus(prog: Programa, newStatus: string) {
    setSaving(prog.id)
    const existing = tareas.find(t => t.id_programa_fk === prog.id)
    if (existing) {
      await dbCtrl
        .from('programa_tareas')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      setTareas(prev => prev.map(t => t.id === existing.id ? { ...t, status: newStatus } : t))
    } else {
      const fecha_prog = new Date(anio, mes - 1, 1).toISOString().slice(0, 10)
      const { data } = await dbCtrl
        .from('programa_tareas')
        .insert({ id_programa_fk: prog.id, fecha_prog, mes, semana_no: 1, status: newStatus })
        .select('id,id_programa_fk,mes,status')
        .single()
      if (data) setTareas(prev => [...prev, data])
    }
    setSaving(null)
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function prevMes() {
    if (mes === 1) { setMes(12); setAnio(a => a - 1) } else setMes(m => m - 1)
  }
  function nextMes() {
    if (mes === 12) { setMes(1); setAnio(a => a + 1) } else setMes(m => m + 1)
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const progsMes = programas.filter(p => estaActivoEnMes(p, mes))
  const tipos = ['Todos', ...Array.from(new Set(programas.map(p => p.tipo_trabajo))).sort()]

  const progsFiltradosMes = progsMes.filter(p =>
    filtroTipo === 'Todos' || p.tipo_trabajo === filtroTipo
  )
  const agrupados = progsFiltradosMes.reduce<Record<string, Programa[]>>((acc, p) => {
    if (!acc[p.tipo_trabajo]) acc[p.tipo_trabajo] = []
    acc[p.tipo_trabajo].push(p)
    return acc
  }, {})
  const tipoOrder = ['Jardinería', 'Fumigación', 'Obra Civil', 'Otro']
  const gruposOrdenados = tipoOrder.filter(t => agrupados[t])

  const completadas  = progsMes.filter(p => getStatus(p.id) === 'Completada').length
  const enProceso    = progsMes.filter(p => getStatus(p.id) === 'En Proceso').length
  const pendientes   = progsMes.filter(p => getStatus(p.id) === 'Pendiente').length
  const cumplimiento = progsMes.length > 0 ? Math.round(completadas / progsMes.length * 100) : 0

  const esLluvias = mes >= 6 && mes <= 8

  // Programas tab
  const progsAnualesFiltrados = programas.filter(p =>
    (filtroTipo === 'Todos' || p.tipo_trabajo === filtroTipo) &&
    (!busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.descripcion ?? '').toLowerCase().includes(busqueda.toLowerCase()))
  )
  const resumenTipos = programas.reduce<Record<string, number>>((a, p) => {
    a[p.tipo_trabajo] = (a[p.tipo_trabajo] ?? 0) + 1; return a
  }, {})

  // Catalogo tab
  const cats = ['Todos', ...Array.from(new Set(CATALOGO.map(p => p.cat))).sort()]
  const catalogoFiltrado = CATALOGO.filter(p =>
    (filtroCat === 'Todos' || p.cat === filtroCat) &&
    (!busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.uso.toLowerCase().includes(busqueda.toLowerCase()))
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Leaf size={24} color="#16a34a" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Mantenimiento — Campo de Golf
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
            Club de Golf · Campo de Golf · Áreas Verdes y Jardinería
          </p>
        </div>
        {esLluvias && (
          <div style={{
            marginLeft: 'auto', background: '#dbeafe', color: '#1d4ed8',
            borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600,
            border: '1px solid #bfdbfe', whiteSpace: 'nowrap',
          }}>
            ⛈ Temporada lluvias — Protocolos intensificados
          </div>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
        {([
          { key: 'ejecucion', label: 'Ejecución Mensual' },
          { key: 'programas', label: 'Programas Anuales' },
          { key: 'catalogo',  label: 'Catálogo de Productos' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setBusqueda(''); setExpandedId(null) }}
            style={{
              padding: '9px 20px', fontWeight: 600, fontSize: 13.5,
              border: 'none', cursor: 'pointer', background: 'transparent',
              color: tab === t.key ? '#16a34a' : '#64748b',
              borderBottom: `2px solid ${tab === t.key ? '#16a34a' : 'transparent'}`,
              marginBottom: -2,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB: EJECUCIÓN ══════════════════ */}
      {tab === 'ejecucion' && (
        <>
          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <button onClick={prevMes} className="btn-ghost" style={{ padding: '7px 10px' }}>
              <ChevronLeft size={18} />
            </button>
            <span style={{ fontSize: 17, fontWeight: 700, minWidth: 190, textAlign: 'center' }}>
              {MESES[mes - 1]} {anio}
            </span>
            <button onClick={nextMes} className="btn-ghost" style={{ padding: '7px 10px' }}>
              <ChevronRight size={18} />
            </button>
            <button
              onClick={loadTareas}
              className="btn-ghost"
              style={{ marginLeft: 'auto', padding: '7px 10px' }}>
              <RefreshCw size={15} />
            </button>
          </div>

          {/* KPI cards */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
            {[
              { label: 'Completadas',  val: completadas,       bg: '#dcfce7', clr: '#16a34a' },
              { label: 'En Proceso',   val: enProceso,         bg: '#dbeafe', clr: '#2563eb' },
              { label: 'Pendientes',   val: pendientes,        bg: '#fef3c7', clr: '#d97706' },
              { label: 'Total del mes',val: progsMes.length,   bg: '#f1f5f9', clr: '#374151' },
              {
                label: 'Cumplimiento',
                val: `${cumplimiento}%`,
                bg: '#f8fafc',
                clr: cumplimiento >= 80 ? '#16a34a' : cumplimiento >= 50 ? '#d97706' : '#dc2626',
              },
            ].map(k => (
              <div key={k.label} className="card" style={{
                flex: '1 1 140px', maxWidth: 190, padding: '14px 18px',
                background: k.bg, border: 'none',
              }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: k.clr }}>{k.val}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: 500 }}>
                  {k.label}
                </div>
              </div>
            ))}
          </div>

          {/* Tipo filter pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.08em' }}>
              TIPO:
            </span>
            {tipos.map(t => {
              const clr = TIPO_CLR[t] ?? '#374151'
              const active = filtroTipo === t
              return (
                <button key={t} onClick={() => setFiltroTipo(t)} style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${active ? clr : '#e2e8f0'}`,
                  background: active ? clr + '1a' : '#fff',
                  color: active ? clr : '#64748b',
                  cursor: 'pointer',
                }}>
                  {t === 'Todos' ? `Todos (${progsMes.length})` : t}
                </button>
              )
            })}
          </div>

          {/* Program cards */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
              Cargando programas...
            </div>
          ) : progsFiltradosMes.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 60, color: '#94a3b8',
              background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0',
            }}>
              <Leaf size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {programas.length === 0
                  ? 'No se encontraron programas. Ejecuta la migración SQL en Supabase y asigna los IDs de CC/Área.'
                  : `Sin programas de "${filtroTipo}" activos en ${MESES[mes - 1]}.`}
              </div>
            </div>
          ) : (
            gruposOrdenados.map(tipo => (
              <div key={tipo} style={{ marginBottom: 28 }}>
                {/* Group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                  paddingBottom: 8,
                  borderBottom: `2px solid ${TIPO_CLR[tipo] ?? '#e2e8f0'}22`,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
                    color: TIPO_CLR[tipo] ?? '#374151',
                    background: (TIPO_CLR[tipo] ?? '#374151') + '18',
                    borderRadius: 4, padding: '3px 10px',
                  }}>
                    {tipo.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {agrupados[tipo].length} programa{agrupados[tipo].length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {agrupados[tipo].map(p => {
                    const status = getStatus(p.id)
                    const sc = STATUS_CLR[status] ?? STATUS_CLR['Pendiente']
                    const isExpanded = expandedId === p.id
                    const isSaving = saving === p.id

                    return (
                      <div key={p.id} className="card" style={{ padding: '12px 16px' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                        }}>
                          {/* Frecuencia tag */}
                          <span style={{
                            fontSize: 11, color: '#94a3b8', fontStyle: 'italic',
                            background: '#f8fafc', borderRadius: 4,
                            padding: '2px 8px', border: '1px solid #e2e8f0',
                            whiteSpace: 'nowrap', minWidth: 76, textAlign: 'center',
                          }}>
                            {p.frecuencia}
                          </span>
                          {/* Name */}
                          <span style={{
                            flex: 1, fontWeight: 600, fontSize: 13.5, color: '#1e293b',
                            minWidth: 180,
                          }}>
                            {p.nombre}
                          </span>
                          {/* Status selector */}
                          <select
                            disabled={isSaving}
                            value={status}
                            onChange={e => cambiarStatus(p, e.target.value)}
                            style={{
                              padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                              background: sc.bg, color: sc.text,
                              border: `1.5px solid ${sc.text}50`,
                              cursor: 'pointer', opacity: isSaving ? 0.5 : 1,
                              outline: 'none',
                            }}>
                            <option value="Pendiente">Pendiente</option>
                            <option value="En Proceso">En Proceso</option>
                            <option value="Completada">Completada</option>
                            <option value="Omitida">Omitida</option>
                          </select>
                          {/* Expand */}
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            className="btn-ghost"
                            style={{ padding: '5px 8px' }}>
                            <ChevronDown
                              size={16}
                              style={{
                                transform: isExpanded ? 'rotate(180deg)' : 'none',
                                transition: 'transform .2s',
                              }} />
                          </button>
                        </div>

                        {/* Expanded description */}
                        {isExpanded && p.descripcion && (
                          <div style={{
                            marginTop: 12, paddingTop: 12,
                            borderTop: '1px solid #f1f5f9',
                            fontSize: 13, color: '#475569',
                            lineHeight: 1.8,
                          }}>
                            {p.descripcion}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* ══════════════════ TAB: PROGRAMAS ══════════════════ */}
      {tab === 'programas' && (
        <>
          {/* Search + tipo filters */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
              <Search size={14} style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: '#94a3b8',
              }} />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o producto..."
                style={{
                  width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
                  border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none',
                  boxSizing: 'border-box',
                }} />
            </div>
            {tipos.map(t => {
              const clr = TIPO_CLR[t] ?? '#374151'
              const active = filtroTipo === t
              return (
                <button key={t} onClick={() => setFiltroTipo(t)} style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${active ? clr : '#e2e8f0'}`,
                  background: active ? clr + '1a' : '#fff',
                  color: active ? clr : '#64748b', cursor: 'pointer',
                }}>
                  {t}
                </button>
              )
            })}
          </div>

          {/* Summary chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            {Object.entries(resumenTipos).map(([tipo, count]) => (
              <div key={tipo} style={{
                fontSize: 12, padding: '4px 12px', borderRadius: 6,
                background: (TIPO_CLR[tipo] ?? '#374151') + '18',
                color: TIPO_CLR[tipo] ?? '#374151', fontWeight: 600,
              }}>
                {tipo}: {count}
              </div>
            ))}
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              · Mostrando {progsAnualesFiltrados.length} de {programas.length} programas
            </span>
          </div>

          {/* Accordion list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {progsAnualesFiltrados.map(p => {
              const isExp = expandedId === p.id
              const clr = TIPO_CLR[p.tipo_trabajo] ?? '#374151'
              return (
                <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedId(isExp ? null : p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                      padding: '13px 18px', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none', cursor: 'pointer',
                    }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, color: clr,
                      background: clr + '18', borderRadius: 4,
                      padding: '2px 8px', whiteSpace: 'nowrap', minWidth: 70, textAlign: 'center',
                    }}>
                      {p.tipo_trabajo.toUpperCase()}
                    </span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: '#1e293b', textAlign: 'left' }}>
                      {p.nombre}
                    </span>
                    <span style={{
                      fontSize: 11, color: '#64748b',
                      background: '#f1f5f9', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
                    }}>
                      {p.frecuencia}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {rangoMeses(p)}
                    </span>
                    <ChevronDown
                      size={15} color="#94a3b8"
                      style={{ transform: isExp ? 'rotate(180deg)' : 'none', transition: '.2s', flexShrink: 0 }} />
                  </button>

                  {isExp && p.descripcion && (
                    <div style={{
                      padding: '0 20px 18px',
                      fontSize: 13, color: '#475569', lineHeight: 1.8,
                      borderTop: `3px solid ${clr}30`,
                      background: clr + '06',
                    }}>
                      <div style={{ paddingTop: 14 }}>{p.descripcion}</div>
                      {p.responsable && (
                        <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                          Responsable: {p.responsable}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {progsAnualesFiltrados.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                Sin programas que coincidan con el filtro
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════ TAB: CATÁLOGO ══════════════════ */}
      {tab === 'catalogo' && (
        <>
          {/* Search + categoria filters */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
              <Search size={14} style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: '#94a3b8',
              }} />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar producto..."
                style={{
                  width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
                  border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none',
                  boxSizing: 'border-box',
                }} />
            </div>
            {cats.map(c => {
              const clr = CAT_CLR[c] ?? '#374151'
              const active = filtroCat === c
              return (
                <button key={c} onClick={() => setFiltroCat(c)} style={{
                  padding: '5px 13px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  border: `1.5px solid ${active ? clr : '#e2e8f0'}`,
                  background: active ? clr + '18' : '#fff',
                  color: active ? clr : '#64748b', cursor: 'pointer',
                }}>
                  {c}
                </button>
              )
            })}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Categoría', 'Producto', 'Dosificación', 'Área de aplicación', 'Uso principal'].map(h => (
                    <th key={h} style={{
                      padding: '11px 14px', textAlign: 'left', fontWeight: 700,
                      fontSize: 11, color: '#64748b', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0',
                    }}>
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalogoFiltrado.map((p, i) => {
                  const clr = CAT_CLR[p.cat] ?? '#374151'
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: i % 2 === 0 ? '#fff' : '#fafafa',
                    }}>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: clr,
                          background: clr + '18', borderRadius: 4, padding: '2px 8px',
                        }}>
                          {p.cat}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b' }}>
                        {p.nombre}
                      </td>
                      <td style={{
                        padding: '10px 14px', color: '#475569',
                        fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap',
                      }}>
                        {p.dosis}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>
                        {p.areas}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {p.uso}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {catalogoFiltrado.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                Sin resultados
              </div>
            )}
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>
            {catalogoFiltrado.length} de {CATALOGO.length} productos · Fuente: Resumen_Reportes_Balvanera_Nov2025_Mar2026.xlsx
          </p>
        </>
      )}
    </div>
  )
}
