'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, Edit2, Eye, Trash2, ChevronLeft, ChevronRight, MapPin, CalendarDays, List } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import PageHeader from '@/components/layout/PageHeader'

import Paginador from '@/components/ui/Paginador'
// ── Types ────────────────────────────────────────────────────

type Lugar = {
  id: number; nombre: string; capacidad: number | null; descripcion: string | null
  activo: boolean; tipo: string | null; ubicacion: string | null
}
type EventoOcup = {
  id: number; folio: string; nombre: string; id_lugar_fk: number | null
  fecha_inicio: string; fecha_fin: string | null; hora_inicio: string | null; hora_fin: string | null
  status: string; cat_tipos_evento?: { nombre: string; color: string } | null
}
type Bloqueo = {
  id: number; id_lugar_fk: number; tipo: string; titulo: string
  fecha_inicio: string; fecha_fin: string; hora_inicio: string | null; hora_fin: string | null
  responsable: string | null; notas: string | null
}
// Ocupación normalizada (evento o bloqueo manual)
type Ocup = {
  key: string; origen: 'evento' | 'bloqueo'; id: number; id_lugar: number
  titulo: string; detalle: string; ini: string; fin: string
  horaIni: string | null; horaFin: string | null; color: string; status?: string
}

const TIPOS_LUGAR = ['Pista', 'Paddock', 'Salón', 'Área', 'Otro']
const TIPOS_BLOQUEO = ['Mantenimiento', 'Clase / Entrenamiento', 'Uso de arrendatario', 'Bloqueo', 'Otro'] as const
const COLOR_BLOQUEO: Record<string, string> = {
  'Mantenimiento': '#7c3aed', 'Clase / Entrenamiento': '#0369a1', 'Uso de arrendatario': '#b45309',
  'Bloqueo': '#dc2626', 'Otro': '#64748b',
}
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const EMPTY_LUGAR = { nombre: '', tipo: 'Pista', capacidad: '' as number | '', ubicacion: '', descripcion: '', activo: true }

const iso = (d: Date) => d.toLocaleDateString('en-CA')
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d) }
const fmtFecha = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const rango = (o: { ini: string; fin: string }) => o.ini === o.fin ? fmtFecha(o.ini) : `${fmtFecha(o.ini)} → ${fmtFecha(o.fin)}`
const horas = (a: string | null, b: string | null) => a ? `${a.slice(0, 5)}${b ? '–' + b.slice(0, 5) : ''}` : ''
const traslapa = (a: { ini: string; fin: string }, b: { ini: string; fin: string }) => a.ini <= b.fin && b.ini <= a.fin

// ── Page ─────────────────────────────────────────────────────

export default function InstalacionesPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('hipico-instalaciones')
  const puedeEliminar = canDelete()

  const hoyStr = iso(new Date())
  const [tab, setTab] = useState<'catalogo' | 'calendario'>('catalogo')
  const [pgIdx, setPgIdx]   = useState(0)
  const [pgSize, setPgSize] = useState(25)
  const [lugares, setLugares] = useState<Lugar[]>([])
  const [ocups, setOcups] = useState<Ocup[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [verInactivas, setVerInactivas] = useState(false)

  // calendario
  const hoy = new Date()
  const [year, setYear] = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth())

  // modal catálogo
  const [showLugar, setShowLugar] = useState(false)
  const [editLugar, setEditLugar] = useState<Lugar | null>(null)
  const [lugarForm, setLugarForm] = useState(EMPTY_LUGAR)
  const [savingLugar, setSavingLugar] = useState(false)
  const [errLugar, setErrLugar] = useState('')

  // modal ocupación
  const [ocupLugar, setOcupLugar] = useState<Lugar | null>(null)
  const [verPasadas, setVerPasadas] = useState(false)
  const [bloqueoForm, setBloqueoForm] = useState({ tipo: 'Bloqueo' as string, titulo: '', fecha_inicio: hoyStr, fecha_fin: hoyStr, hora_inicio: '', hora_fin: '', responsable: '', notas: '' })
  const [showBloqueoForm, setShowBloqueoForm] = useState(false)
  const [savingBloqueo, setSavingBloqueo] = useState(false)
  const [errBloqueo, setErrBloqueo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const desde = addDays(hoyStr, -400)
    const [{ data: l }, { data: e }, { data: b }] = await Promise.all([
      dbCtrl.from('cat_lugares').select('id, nombre, capacidad, descripcion, activo, tipo, ubicacion').eq('modulo', 'hipico').order('nombre'),
      dbCtrl.from('eventos')
        .select('id, folio, nombre, id_lugar_fk, fecha_inicio, fecha_fin, hora_inicio, hora_fin, status, cat_tipos_evento(nombre, color)')
        .in('modulo', ['hospitality', 'hipico']).not('id_lugar_fk', 'is', null).neq('status', 'Cancelado').gte('fecha_inicio', desde),
      dbCtrl.from('lugares_ocupacion').select('*').gte('fecha_fin', desde),
    ])
    setLugares((l as Lugar[]) ?? [])
    const evs: Ocup[] = ((e as unknown as EventoOcup[]) ?? []).map(ev => ({
      key: `e${ev.id}`, origen: 'evento', id: ev.id, id_lugar: ev.id_lugar_fk!, titulo: ev.nombre,
      detalle: `${ev.folio} · ${ev.cat_tipos_evento?.nombre ?? 'Evento'} · ${ev.status}`,
      ini: ev.fecha_inicio, fin: ev.fecha_fin ?? ev.fecha_inicio, horaIni: ev.hora_inicio, horaFin: ev.hora_fin,
      color: ev.cat_tipos_evento?.color ?? '#9333ea', status: ev.status,
    }))
    const bls: Ocup[] = ((b as Bloqueo[]) ?? []).map(x => ({
      key: `b${x.id}`, origen: 'bloqueo', id: x.id, id_lugar: x.id_lugar_fk, titulo: x.titulo,
      detalle: [x.tipo, x.responsable, x.notas].filter(Boolean).join(' · '),
      ini: x.fecha_inicio, fin: x.fecha_fin, horaIni: x.hora_inicio, horaFin: x.hora_fin,
      color: COLOR_BLOQUEO[x.tipo] ?? '#64748b',
    }))
    setOcups([...evs, ...bls])
    setLoading(false)
  }, [hoyStr])

  useEffect(() => { load() }, [load])

  const ocupPorLugar = useMemo(() => {
    const m: Record<number, Ocup[]> = {}
    ocups.forEach(o => { (m[o.id_lugar] ??= []).push(o) })
    Object.values(m).forEach(a => a.sort((x, y) => x.ini.localeCompare(y.ini)))
    return m
  }, [ocups])

  const lugaresVis = lugares.filter(l => (verInactivas || l.activo) && (!filtroTipo || l.tipo === filtroTipo))

  // ── Catálogo CRUD ──
  const openNewLugar = () => { setEditLugar(null); setLugarForm(EMPTY_LUGAR); setErrLugar(''); setShowLugar(true) }
  const openEditLugar = (l: Lugar) => {
    setEditLugar(l)
    setLugarForm({ nombre: l.nombre, tipo: l.tipo ?? 'Otro', capacidad: l.capacidad ?? '', ubicacion: l.ubicacion ?? '', descripcion: l.descripcion ?? '', activo: l.activo })
    setErrLugar(''); setShowLugar(true)
  }
  const saveLugar = async () => {
    if (!lugarForm.nombre.trim()) { setErrLugar('El nombre es obligatorio'); return }
    setSavingLugar(true); setErrLugar('')
    const payload = {
      nombre: lugarForm.nombre.trim(), tipo: lugarForm.tipo || null,
      capacidad: lugarForm.capacidad === '' ? null : Number(lugarForm.capacidad),
      ubicacion: lugarForm.ubicacion.trim() || null, descripcion: lugarForm.descripcion.trim() || null,
      activo: lugarForm.activo, modulo: 'hipico',
    }
    const { error } = editLugar
      ? await dbCtrl.from('cat_lugares').update(payload).eq('id', editLugar.id)
      : await dbCtrl.from('cat_lugares').insert(payload)
    setSavingLugar(false)
    if (error) { setErrLugar(error.message); return }
    setShowLugar(false); load()
  }

  // ── Ocupación (modal) ──
  const openOcup = (l: Lugar) => {
    setOcupLugar(l); setVerPasadas(false); setShowBloqueoForm(false); setErrBloqueo('')
    setBloqueoForm({ tipo: 'Bloqueo', titulo: '', fecha_inicio: hoyStr, fecha_fin: hoyStr, hora_inicio: '', hora_fin: '', responsable: '', notas: '' })
  }

  const conflictos = useMemo(() => {
    if (!ocupLugar || !showBloqueoForm || !bloqueoForm.fecha_inicio || !bloqueoForm.fecha_fin) return []
    return (ocupPorLugar[ocupLugar.id] ?? []).filter(o => traslapa({ ini: bloqueoForm.fecha_inicio, fin: bloqueoForm.fecha_fin }, o))
  }, [ocupLugar, showBloqueoForm, bloqueoForm.fecha_inicio, bloqueoForm.fecha_fin, ocupPorLugar])

  const saveBloqueo = async () => {
    if (!ocupLugar) return
    if (!bloqueoForm.titulo.trim()) { setErrBloqueo('Indica un título'); return }
    if (bloqueoForm.fecha_fin < bloqueoForm.fecha_inicio) { setErrBloqueo('La fecha fin no puede ser anterior al inicio'); return }
    if (conflictos.length > 0 && !confirm(`Hay ${conflictos.length} ocupación(es) empalmada(s) en esas fechas. ¿Registrar de todos modos?`)) return
    setSavingBloqueo(true); setErrBloqueo('')
    const { error } = await dbCtrl.from('lugares_ocupacion').insert({
      id_lugar_fk: ocupLugar.id, tipo: bloqueoForm.tipo, titulo: bloqueoForm.titulo.trim(),
      fecha_inicio: bloqueoForm.fecha_inicio, fecha_fin: bloqueoForm.fecha_fin,
      hora_inicio: bloqueoForm.hora_inicio || null, hora_fin: bloqueoForm.hora_fin || null,
      responsable: bloqueoForm.responsable.trim() || null, notas: bloqueoForm.notas.trim() || null,
    })
    setSavingBloqueo(false)
    if (error) { setErrBloqueo(error.message); return }
    setShowBloqueoForm(false)
    setBloqueoForm(f => ({ ...f, titulo: '', hora_inicio: '', hora_fin: '', responsable: '', notas: '' }))
    load()
  }
  const deleteBloqueo = async (id: number) => {
    if (!confirm('¿Eliminar este bloqueo?')) return
    await dbCtrl.from('lugares_ocupacion').delete().eq('id', id)
    load()
  }

  // ── Estado actual de una instalación ──
  const estadoHoy = (l: Lugar) => (ocupPorLugar[l.id] ?? []).find(o => o.ini <= hoyStr && hoyStr <= o.fin)
  const proxima = (l: Lugar) => (ocupPorLugar[l.id] ?? []).find(o => o.ini > hoyStr)

  // ── Calendario ──
  const diasMes = new Date(year, month + 1, 0).getDate()
  const dias = Array.from({ length: diasMes }, (_, i) => i + 1)
  const fechaDe = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const moverMes = (n: number) => {
    const d = new Date(year, month + n, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
  }
  const celda = (lugarId: number, f: string) => {
    const lista = ocupPorLugar[lugarId] ?? []
    const ocup = lista.filter(o => o.ini <= f && f <= o.fin)
    if (ocup.length > 0) return { ocup, buffer: false }
    // preparación/limpieza: 1 día antes/después de un evento (misma regla que el calendario de eventos)
    const buf = lista.some(o => o.origen === 'evento' && (addDays(o.ini, -1) === f || addDays(o.fin, 1) === f))
    return { ocup: [], buffer: buf }
  }

  const tiposPresentes = Array.from(new Set(lugares.map(l => l.tipo).filter(Boolean))) as string[]
  const th = { padding: '10px 14px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }
  const td = { padding: '10px 14px' }

  const ocupModalLista = ocupLugar
    ? (ocupPorLugar[ocupLugar.id] ?? []).filter(o => verPasadas || o.fin >= hoyStr)
    : []

  const curPg = Math.min(pgIdx, Math.max(0, Math.ceil(lugaresVis.length / pgSize) - 1))
  const lugaresVisPag = lugaresVis.slice(curPg * pgSize, (curPg + 1) * pgSize)
  useEffect(() => { setPgIdx(0) }, [lugaresVis.length])

  return (
    <div style={{ padding: '24px 28px' }}>
      <PageHeader
        variant="xl"
        backHref="/hipico"
        title="Instalaciones"
        subtitle="Pistas, paddocks y salones: qué hay en cada una y cuándo está ocupada"
        actions={<>
          <button className="btn-ghost" onClick={load} title="Actualizar"><RefreshCw size={13} /></button>
          {puedeEscribir && <button className="btn-primary" onClick={openNewLugar}><Plus size={13} /> Nueva instalación</button>}
        </>}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={tab === 'catalogo' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('catalogo')}><List size={13} /> Catálogo</button>
        <button className={tab === 'calendario' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('calendario')}><CalendarDays size={13} /> Calendario de ocupación</button>
        <div style={{ flex: 1 }} />
        <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ width: 160, fontSize: 12 }}>
          <option value="">Todos los tipos</option>
          {tiposPresentes.map(t => <option key={t}>{t}</option>)}
        </select>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={verInactivas} onChange={e => setVerInactivas(e.target.checked)} /> Ver inactivas
        </label>
      </div>

      {/* ── CATÁLOGO ── */}
      {tab === 'catalogo' && (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                  {['Instalación', 'Tipo', 'Capacidad', 'Hoy', 'Próxima ocupación', ''].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                ) : lugaresVis.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin instalaciones</td></tr>
                ) : lugaresVisPag.map((l, i) => {
                  const hoyO = estadoHoy(l)
                  const prox = proxima(l)
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)', opacity: l.activo ? 1 : 0.55 }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={12} style={{ color: '#b45309' }} />{l.nombre}</div>
                        {l.ubicacion && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.ubicacion}</div>}
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>{l.tipo ?? '—'}</td>
                      <td style={{ ...td, color: 'var(--text-muted)' }}>{l.capacidad ?? '—'}</td>
                      <td style={td}>
                        {hoyO
                          ? <span title={hoyO.detalle} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: hoyO.color + '22', color: hoyO.color }}>Ocupada · {hoyO.titulo}</span>
                          : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#dcfce7', color: '#16a34a' }}>Libre</span>}
                      </td>
                      <td style={{ ...td, fontSize: 12, color: 'var(--text-secondary)' }}>
                        {prox ? <>{rango(prox)} <span style={{ color: 'var(--text-muted)' }}>· {prox.titulo}</span></> : '—'}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Ver ocupación" onClick={() => openOcup(l)}><Eye size={13} /></button>
                          {puedeEscribir && <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Editar" onClick={() => openEditLugar(l)}><Edit2 size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Paginador page={curPg} pageSize={pgSize} totalItems={lugaresVis.length} onChange={setPgIdx}
            onPageSizeChange={n => { setPgSize(n); setPgIdx(0) }} />
        </div>
      )}

      {/* ── CALENDARIO ── */}
      {tab === 'calendario' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={() => moverMes(-1)}><ChevronLeft size={14} /></button>
            <div style={{ fontWeight: 700, fontSize: 15, minWidth: 150, textAlign: 'center' }}>{MESES[month]} {year}</div>
            <button className="btn-ghost" onClick={() => moverMes(1)}><ChevronRight size={14} /></button>
            <button className="btn-ghost" onClick={() => { setYear(hoy.getFullYear()); setMonth(hoy.getMonth()) }}>Hoy</button>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#9333ea', marginRight: 4 }} />Evento</span>
              {TIPOS_BLOQUEO.map(t => <span key={t}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: COLOR_BLOQUEO[t], marginRight: 4 }} />{t}</span>)}
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#e2e8f0', marginRight: 4 }} />Preparación/limpieza</span>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-700)' }}>
                    <th style={{ ...th, position: 'sticky', left: 0, background: 'var(--surface-700)', zIndex: 2, minWidth: 170 }}>Instalación</th>
                    {dias.map(d => {
                      const f = fechaDe(d)
                      const dow = new Date(f + 'T12:00:00').getDay()
                      return <th key={d} style={{ padding: '6px 0', width: 30, minWidth: 30, textAlign: 'center', fontSize: 10, color: f === hoyStr ? '#fff' : dow === 0 || dow === 6 ? '#b45309' : 'var(--text-muted)', background: f === hoyStr ? '#b45309' : undefined }}>{d}</th>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {lugaresVis.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 14px', position: 'sticky', left: 0, background: 'var(--surface-900, #fff)', zIndex: 1, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
                        <button className="btn-ghost" style={{ padding: '0 4px', fontWeight: 600 }} title="Ver ocupación" onClick={() => openOcup(l)}>{l.nombre}</button>
                      </td>
                      {dias.map(d => {
                        const f = fechaDe(d)
                        const { ocup, buffer } = celda(l.id, f)
                        const primera = ocup[0]
                        return (
                          <td key={d}
                            title={primera ? ocup.map(o => `${o.titulo} (${rango(o)}${o.horaIni ? ' ' + horas(o.horaIni, o.horaFin) : ''})`).join('\n') : buffer ? 'Preparación / limpieza' : ''}
                            onClick={() => (primera || buffer) && openOcup(l)}
                            style={{
                              height: 30, padding: 0, borderLeft: '1px solid var(--border)',
                              background: primera ? primera.color : buffer ? '#e2e8f0' : 'transparent',
                              outline: ocup.length > 1 ? '2px solid #dc2626' : undefined, outlineOffset: -2,
                              cursor: primera || buffer ? 'pointer' : 'default',
                            }} />
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Celdas con borde rojo = empalme de dos o más ocupaciones. Pasa el cursor para ver el detalle o haz clic para abrir la ocupación de la instalación.</div>
        </>
      )}

      {/* ── MODAL: catálogo ── */}
      {showLugar && (
        <ModalShell modulo="hipico" titulo={editLugar ? `Editar — ${editLugar.nombre}` : 'Nueva instalación'}
          onClose={() => setShowLugar(false)} maxWidth={500}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" onClick={() => setShowLugar(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveLugar} disabled={savingLugar}>{savingLugar ? 'Guardando…' : 'Guardar'}</button>
            </div>
          }>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre *</label>
              <input className="input" value={lugarForm.nombre} onChange={e => setLugarForm(f => ({ ...f, nombre: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Tipo</label>
              <select className="input" value={lugarForm.tipo} onChange={e => setLugarForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: '100%' }}>
                {TIPOS_LUGAR.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Capacidad</label>
              <input className="input" type="number" value={lugarForm.capacidad} onChange={e => setLugarForm(f => ({ ...f, capacidad: e.target.value === '' ? '' : Number(e.target.value) }))} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ubicación</label>
              <input className="input" value={lugarForm.ubicacion} onChange={e => setLugarForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="Ej. Costado norte de caballerizas" style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Descripción</label>
              <textarea className="input" rows={2} value={lugarForm.descripcion} onChange={e => setLugarForm(f => ({ ...f, descripcion: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="activo-lug" checked={lugarForm.activo} onChange={e => setLugarForm(f => ({ ...f, activo: e.target.checked }))} />
              <label htmlFor="activo-lug" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Activa</label>
            </div>
            {errLugar && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{errLugar}</div>}
          </div>
        </ModalShell>
      )}

      {/* ── MODAL: ocupación ── */}
      {ocupLugar && (
        <ModalShell modulo="hipico" titulo={`Ocupación — ${ocupLugar.nombre}`}
          subtitulo={[ocupLugar.tipo, ocupLugar.capacidad ? `cap. ${ocupLugar.capacidad}` : null, ocupLugar.ubicacion].filter(Boolean).join(' · ')}
          onClose={() => setOcupLugar(null)} maxWidth={720}
          footer={
            <div style={{ display: 'flex', gap: 8 }}>
              {puedeEscribir && !showBloqueoForm && <button className="btn-primary" onClick={() => setShowBloqueoForm(true)}><Plus size={13} /> Registrar bloqueo / uso</button>}
              <button className="btn-ghost" onClick={() => setOcupLugar(null)}>Cerrar</button>
            </div>
          }>
          {showBloqueoForm && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tipo</label>
                <select className="input" value={bloqueoForm.tipo} onChange={e => setBloqueoForm(f => ({ ...f, tipo: e.target.value }))} style={{ width: '100%' }}>
                  {TIPOS_BLOQUEO.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Título *</label>
                <input className="input" value={bloqueoForm.titulo} onChange={e => setBloqueoForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej. Nivelación de arena" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Desde</label>
                <input className="input" type="date" value={bloqueoForm.fecha_inicio} onChange={e => setBloqueoForm(f => ({ ...f, fecha_inicio: e.target.value, fecha_fin: f.fecha_fin < e.target.value ? e.target.value : f.fecha_fin }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hasta</label>
                <input className="input" type="date" value={bloqueoForm.fecha_fin} min={bloqueoForm.fecha_inicio} onChange={e => setBloqueoForm(f => ({ ...f, fecha_fin: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hora inicio (opcional)</label>
                <input className="input" type="time" value={bloqueoForm.hora_inicio} onChange={e => setBloqueoForm(f => ({ ...f, hora_inicio: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hora fin (opcional)</label>
                <input className="input" type="time" value={bloqueoForm.hora_fin} onChange={e => setBloqueoForm(f => ({ ...f, hora_fin: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Responsable / arrendatario</label>
                <input className="input" value={bloqueoForm.responsable} onChange={e => setBloqueoForm(f => ({ ...f, responsable: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Notas</label>
                <textarea className="input" rows={2} value={bloqueoForm.notas} onChange={e => setBloqueoForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
              </div>
              {conflictos.length > 0 && (
                <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '8px 12px', borderRadius: 6 }}>
                  ⚠ Se empalma con: {conflictos.map(c => `${c.titulo} (${rango(c)})`).join('; ')}
                </div>
              )}
              {errBloqueo && <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>{errBloqueo}</div>}
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-ghost" onClick={() => setShowBloqueoForm(false)}>Cancelar</button>
                <button className="btn-primary" onClick={saveBloqueo} disabled={savingBloqueo}>{savingBloqueo ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{verPasadas ? 'Historial y próximas' : 'Vigentes y próximas'} ({ocupModalLista.length})</div>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={verPasadas} onChange={e => setVerPasadas(e.target.checked)} /> Incluir pasadas
            </label>
          </div>
          {ocupModalLista.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin ocupaciones registradas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ocupModalLista.map(o => (
                <div key={o.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border)', borderLeft: `4px solid ${o.color}`, borderRadius: 6, opacity: o.fin < hoyStr ? 0.6 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{o.titulo} <span style={{ fontSize: 10, fontWeight: 600, color: o.color, marginLeft: 4 }}>{o.origen === 'evento' ? 'EVENTO' : 'BLOQUEO'}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rango(o)}{o.horaIni ? ` · ${horas(o.horaIni, o.horaFin)}` : ''}{o.detalle ? ` · ${o.detalle}` : ''}</div>
                  </div>
                  {o.origen === 'bloqueo' && puedeEscribir && puedeEliminar && (
                    <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} title="Eliminar" onClick={() => deleteBloqueo(o.id)}><Trash2 size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </ModalShell>
      )}
    </div>
  )
}
