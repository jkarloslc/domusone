'use client'
import { useState, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, CheckCircle2, Clock, XCircle, AlertCircle,
  Droplets, Calendar, Gauge, X, Save, Plus, Pencil, Trash2, BookOpen,
} from 'lucide-react'
import Link from 'next/link'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'

// ── Types ────────────────────────────────────────────────────────────────────
type Programa = {
  id: string
  hoyo: number | null
  area: string
  dia_semana: string
  tipo_riego: string
  origen: string
  zona: string | null
  hora_inicio: string | null
  hora_fin: string | null
  horas_prog: number
  m3_prog: number
  litros_prog: number
  activo: boolean
}

type Ejecucion = {
  id: string
  id_programa_fk: string
  fecha_prog: string
  status: 'pendiente' | 'completado' | 'parcial' | 'no_realizado'
  hora_inicio_real: string | null
  hora_fin_real: string | null
  horas_real: number | null
  m3_real: number | null
  observaciones: string | null
}

type ConsumoDiario = {
  id?: string
  fecha: string
  origen: string
  m3_programado: number | null
  horas_bomba: number | null
  lectura_inicio: number | null
  lectura_fin: number | null
  m3_real: number | null
  observaciones: string | null
}

// ── Constants ────────────────────────────────────────────────────────────────
const DIAS    = ['Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo']
const AREAS   = ['Pista / Fairway','Taludes Green','Green','Salidas / Tees','Rebombeo Lago 5']
const TIPOS   = ['Manual / Manguera','Cañon Agricola']
const ORIGENES_ALL = ['Lago 7','Lago 2','Ordeña','Lago 12']
const ZONAS   = ['Sur','Norte']

const STATUS_CONFIG = {
  pendiente:    { label: 'Pendiente',    color: '#d97706', bg: '#fef3c7', icon: Clock },
  completado:   { label: 'Completado',   color: '#16a34a', bg: '#dcfce7', icon: CheckCircle2 },
  parcial:      { label: 'Parcial',      color: '#2563eb', bg: '#dbeafe', icon: AlertCircle },
  no_realizado: { label: 'No realizado', color: '#dc2626', bg: '#fee2e2', icon: XCircle },
}

const M3_PROG_DIA_ORIGEN: Record<string, Record<string, number>> = {
  'Lunes':     { 'Lago 7': 519.2, 'Lago 2': 244.8, 'Ordeña': 204.4, 'Lago 12': 0 },
  'Martes':    { 'Lago 7': 803.0, 'Lago 2': 163.2, 'Ordeña': 163.2, 'Lago 12': 0 },
  'Miercoles': { 'Lago 7': 519.2, 'Lago 2': 244.8, 'Ordeña': 204.4, 'Lago 12': 0 },
  'Jueves':    { 'Lago 7': 803.0, 'Lago 2': 163.2, 'Ordeña': 163.2, 'Lago 12': 0 },
  'Viernes':   { 'Lago 7': 516.4, 'Lago 2': 190.8, 'Ordeña': 190.8, 'Lago 12': 0 },
  'Sabado':    { 'Lago 7': 408.4, 'Lago 2': 136.8, 'Ordeña': 176.4, 'Lago 12': 0 },
  'Domingo':   { 'Lago 7': 0,     'Lago 2': 108.0, 'Ordeña': 54.0,  'Lago 12': 354.0 },
}

// ── Week helpers ─────────────────────────────────────────────────────────────
function getISOWeek(d: Date): number {
  const date = new Date(d)
  date.setHours(0,0,0,0)
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7))
  const w1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7)
}

function getWeekDates(anio: number, semana: number): Date[] {
  const jan4 = new Date(anio, 0, 4)
  const startW1 = new Date(jan4)
  startW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7))
  const monday = new Date(startW1)
  monday.setDate(startW1.getDate() + (semana - 1) * 7)
  return [0,1,2,3,4,5,6].map(i => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
}

function toDateStr(d: Date): string { return d.toISOString().slice(0,10) }
function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}
function fmtDateLong(d: Date): string {
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
}

// ── StatusBadge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:20, fontSize:11, fontWeight:600, color:cfg.color, background:cfg.bg }}>
      <Icon size={11} /> {cfg.label}
    </span>
  )
}

// ── ProgramaModal (Alta / Edición del catálogo base) ─────────────────────────
function ProgramaModal({ prog, onClose, onSave }: {
  prog: Partial<Programa> | null
  onClose: () => void
  onSave: () => void
}) {
  const isEdit = !!prog?.id
  const [hoyo, setHoyo]     = useState(String(prog?.hoyo ?? ''))
  const [area, setArea]     = useState(prog?.area ?? AREAS[0])
  const [dia, setDia]       = useState(prog?.dia_semana ?? DIAS[0])
  const [tipo, setTipo]     = useState(prog?.tipo_riego ?? TIPOS[0])
  const [orig, setOrig]     = useState(prog?.origen ?? ORIGENES_ALL[0])
  const [zona, setZona]     = useState(prog?.zona ?? 'Norte')
  const [hIn, setHIn]       = useState(prog?.hora_inicio ?? '05:00')
  const [hFn, setHFn]       = useState(prog?.hora_fin ?? '08:30')
  const [hrs, setHrs]       = useState(String(prog?.horas_prog ?? ''))
  const [m3, setM3]         = useState(String(prog?.m3_prog ?? ''))
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  async function handleSave() {
    if (!area || !dia || !tipo || !orig) { setErr('Completa todos los campos obligatorios.'); return }
    const m3val = parseFloat(m3)
    if (isNaN(m3val) || m3val <= 0) { setErr('M³ debe ser un número mayor a 0.'); return }
    setSaving(true); setErr('')
    const payload = {
      hoyo: hoyo !== '' ? parseInt(hoyo) : null,
      area, dia_semana: dia, tipo_riego: tipo, origen: orig,
      zona: zona || null, hora_inicio: hIn || null, hora_fin: hFn || null,
      horas_prog: hrs !== '' ? parseFloat(hrs) : null,
      m3_prog: m3val,
      litros_prog: Math.round(m3val * 1000),
      activo: true,
    }
    if (isEdit) {
      await dbGolf.from('riego_programa').update(payload).eq('id', prog!.id!)
    } else {
      await dbGolf.from('riego_programa').insert(payload)
    }
    setSaving(false)
    onSave()
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'28px 32px', width:520, maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
          <div>
            <div style={{ fontSize:11, color:'#94a3b8', fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase' }}>Catálogo Programa</div>
            <div style={{ fontSize:17, fontWeight:700, color:'#1e293b', marginTop:2 }}>
              {isEdit ? 'Editar actividad' : 'Nueva actividad'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={20} /></button>
        </div>

        {err && <div style={{ background:'#fee2e2', color:'#dc2626', padding:'8px 12px', borderRadius:8, fontSize:12, marginBottom:14 }}>{err}</div>}

        <div style={{ display:'grid', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Día de la semana *</label>
              <select value={dia} onChange={e => setDia(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }}>
                {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Hoyo (vacío = Rebombeo)</label>
              <input type="number" min={1} max={18} value={hoyo} onChange={e => setHoyo(e.target.value)}
                placeholder="1 – 18"
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Área *</label>
            <select value={area} onChange={e => setArea(e.target.value)}
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }}>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Tipo de riego *</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Origen (lago) *</label>
              <select value={orig} onChange={e => setOrig(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }}>
                {ORIGENES_ALL.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Zona</label>
              <select value={zona} onChange={e => setZona(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }}>
                {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>M³ programados *</label>
              <input type="number" step="0.1" value={m3} onChange={e => setM3(e.target.value)}
                placeholder="ej. 27.2"
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Hora inicio</label>
              <input type="time" value={hIn} onChange={e => setHIn(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Hora fin</label>
              <input type="time" value={hFn} onChange={e => setHFn(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Horas prog.</label>
              <input type="number" step="0.25" value={hrs} onChange={e => setHrs(e.target.value)}
                placeholder="ej. 2"
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
            </div>
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:22 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Save size={14} /> {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Agregar actividad')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EjecucionModal ────────────────────────────────────────────────────────────
function EjecucionModal({ prog, ejecucion, fecha, onClose, onSave }: {
  prog: Programa
  ejecucion: Ejecucion | null
  fecha: string
  onClose: () => void
  onSave: (data: Partial<Ejecucion>) => Promise<void>
}) {
  const [status, setStatus] = useState<Ejecucion['status']>(ejecucion?.status ?? 'completado')
  const [hIn, setHIn]   = useState(ejecucion?.hora_inicio_real ?? prog.hora_inicio ?? '')
  const [hFn, setHFn]   = useState(ejecucion?.hora_fin_real ?? prog.hora_fin ?? '')
  const [m3, setM3]     = useState(String(ejecucion?.m3_real ?? prog.m3_prog ?? ''))
  const [obs, setObs]   = useState(ejecucion?.observaciones ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({ status, hora_inicio_real: hIn||null, hora_fin_real: hFn||null, m3_real: m3 ? parseFloat(m3) : null, observaciones: obs||null })
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'28px 32px', width:480, maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11, color:'#94a3b8', fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase' }}>
              Registrar ejecución · {fecha}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:'#1e293b', marginTop:2 }}>
              {prog.hoyo ? `Hoyo ${prog.hoyo}` : 'Rebombeo'} — {prog.area}
            </div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
              {prog.tipo_riego} · {prog.origen} · {prog.m3_prog} m³ prog.
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={20} /></button>
        </div>
        <div style={{ display:'grid', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as Ejecucion['status'])}
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }}>
              <option value="completado">Completado</option>
              <option value="parcial">Parcial</option>
              <option value="no_realizado">No realizado</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Hora inicio real</label>
              <input type="time" value={hIn} onChange={e => setHIn(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Hora fin real</label>
              <input type="time" value={hFn} onChange={e => setHFn(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>M³ reales consumidos</label>
            <input type="number" step="0.1" value={m3} onChange={e => setM3(e.target.value)}
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Observaciones</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, resize:'vertical' }} />
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:22 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ConsumoModal ──────────────────────────────────────────────────────────────
function ConsumoModal({ fecha, origenes_data, onClose, onSave }: {
  fecha: string
  origenes_data: ConsumoDiario[]
  onClose: () => void
  onSave: (rows: ConsumoDiario[]) => Promise<void>
}) {
  const [rows, setRows] = useState<ConsumoDiario[]>(
    ORIGENES_ALL.map(origen => {
      const ex = origenes_data.find(o => o.origen === origen)
      return ex ?? { fecha, origen, m3_programado:null, horas_bomba:null, lectura_inicio:null, lectura_fin:null, m3_real:null, observaciones:null }
    })
  )
  const [saving, setSaving] = useState(false)

  function upd(i: number, f: keyof ConsumoDiario, v: string) {
    setRows(prev => prev.map((r,idx) => {
      if (idx !== i) return r
      const nv = v==='' ? null : parseFloat(v)
      const u = { ...r, [f]: f==='observaciones' ? v : nv }
      if (f==='lectura_inicio'||f==='lectura_fin') {
        const li = f==='lectura_inicio' ? nv : r.lectura_inicio
        const lf = f==='lectura_fin' ? nv : r.lectura_fin
        if (li!=null&&lf!=null) u.m3_real = lf-li
      }
      return u
    }))
  }

  async function handleSave() {
    setSaving(true)
    await onSave(rows.filter(r=>r.m3_real!=null||r.horas_bomba!=null))
    setSaving(false); onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'28px 32px', width:680, maxWidth:'96vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div>
            <div style={{ fontSize:11, color:'#94a3b8', fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase' }}>Consumo diario</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#1e293b', marginTop:2 }}><Droplets size={16} style={{ display:'inline', marginRight:6, color:'#0ea5e9' }} />{fecha}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={20} /></button>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr style={{ background:'#f8fafc' }}>
              {['Origen','Hrs Bomba','Lect. Inicio','Lect. Fin','M³ Real','Obs.'].map(h=>(
                <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748b', borderBottom:'1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((row,i) => (
                <tr key={row.origen} style={{ borderBottom:'1px solid #f1f5f9' }}>
                  <td style={{ padding:'8px 10px', fontWeight:600, color:'#1e293b' }}>{row.origen}</td>
                  {(['horas_bomba','lectura_inicio','lectura_fin'] as const).map(f=>(
                    <td key={f} style={{ padding:'4px 6px' }}>
                      <input type="number" step="0.01" value={row[f]??''} onChange={e=>upd(i,f,e.target.value)}
                        style={{ width:80, padding:'5px 7px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12 }} />
                    </td>
                  ))}
                  <td style={{ padding:'8px 10px', fontWeight:700, color:'#0ea5e9' }}>
                    {row.m3_real!=null ? row.m3_real.toFixed(1) : (
                      <input type="number" step="0.1" value={''} onChange={e=>upd(i,'m3_real',e.target.value)}
                        placeholder="manual" style={{ width:80, padding:'5px 7px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12 }} />
                    )}
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <input type="text" value={row.observaciones??''} onChange={e=>upd(i,'observaciones',e.target.value)}
                      style={{ width:120, padding:'5px 7px', borderRadius:6, border:'1px solid #e2e8f0', fontSize:12 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:22 }}>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Save size={14} /> {saving ? 'Guardando…' : 'Guardar registros'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RiegoPage() {
  const { canWrite } = useAuth()
  const writer = canWrite('golf-riego')
  const today  = new Date()

  // Navigation
  const [tab, setTab]         = useState<'programa' | 'catalogo' | 'consumo'>('programa')
  const [anio, setAnio]       = useState(today.getFullYear())
  const [semana, setSemana]   = useState(getISOWeek(today))

  // Data
  const [programa, setPrograma]     = useState<Programa[]>([])
  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([])
  const [consumos, setConsumos]     = useState<ConsumoDiario[]>([])
  const [loading, setLoading]       = useState(true)

  // Filters – programa
  const [filtroDia, setFiltroDia]       = useState('todos')
  const [filtroArea, setFiltroArea]     = useState('todas')
  const [filtroStatus, setFiltroStatus] = useState('todos')

  // Filters – catálogo
  const [catDia, setCatDia]   = useState('todos')
  const [catArea, setCatArea] = useState('todas')

  // Modals
  const [modalEj, setModalEj]     = useState<{ prog: Programa; ej: Ejecucion|null; fecha: string }|null>(null)
  const [modalProg, setModalProg] = useState<{ prog: Partial<Programa>|null }|null>(null)
  const [modalConsumo, setModalConsumo] = useState<{ fecha: string }|null>(null)
  const [delConfirm, setDelConfirm]     = useState<Programa|null>(null)

  const weekDates = getWeekDates(anio, semana)
  const dateMap: Record<string, Date> = {}
  DIAS.forEach((d,i) => { dateMap[d] = weekDates[i] })

  const ejMap: Record<string, Ejecucion> = {}
  ejecuciones.forEach(e => { ejMap[`${e.id_programa_fk}|${e.fecha_prog}`] = e })

  useEffect(() => { loadPrograma() }, [])
  useEffect(() => { loadEjecuciones(); loadConsumos() }, [anio, semana])

  async function loadPrograma() {
    const { data } = await dbGolf.from('riego_programa').select('*').eq('activo', true).order('dia_semana').order('area').order('hoyo')
    if (data) setPrograma(data as Programa[])
    setLoading(false)
  }

  async function loadEjecuciones() {
    const fechas = weekDates.map(toDateStr)
    const { data } = await dbGolf.from('riego_ejecucion').select('*')
      .gte('fecha_prog', fechas[0]).lte('fecha_prog', fechas[fechas.length-1])
    if (data) setEjecuciones(data as Ejecucion[])
  }

  async function loadConsumos() {
    const fechas = weekDates.map(toDateStr)
    const { data } = await dbGolf.from('riego_consumo_diario').select('*')
      .gte('fecha', fechas[0]).lte('fecha', fechas[fechas.length-1])
    if (data) setConsumos(data as ConsumoDiario[])
  }

  async function saveEjecucion(prog: Programa, fecha: string, data: Partial<Ejecucion>) {
    const key = `${prog.id}|${fecha}`
    const existing = ejMap[key]
    const payload = { id_programa_fk: prog.id, fecha_prog: fecha, semana_iso: semana, anio, ...data }
    if (existing) {
      await dbGolf.from('riego_ejecucion').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await dbGolf.from('riego_ejecucion').insert(payload)
    }
    await loadEjecuciones()
  }

  async function saveConsumos(rows: ConsumoDiario[]) {
    for (const row of rows) {
      await dbGolf.from('riego_consumo_diario').upsert(
        { ...row, updated_at: new Date().toISOString() }, { onConflict: 'fecha,origen' }
      )
    }
    await loadConsumos()
  }

  async function deletePrograma(p: Programa) {
    await dbGolf.from('riego_programa').update({ activo: false }).eq('id', p.id)
    setDelConfirm(null)
    await loadPrograma()
  }

  function navSemana(delta: number) {
    let s = semana + delta, a = anio
    if (s < 1) { a -= 1; s = getISOWeek(new Date(a, 11, 28)) }
    if (s > 53) { a += 1; s = 1 }
    setAnio(a); setSemana(s)
  }

  // ── Derived: KPIs ─────────────────────────────────────────────────────────
  const totalActs = programa.length
  const completadas  = ejecuciones.filter(e=>e.status==='completado').length
  const parciales    = ejecuciones.filter(e=>e.status==='parcial').length
  const noRealizadas = ejecuciones.filter(e=>e.status==='no_realizado').length
  const m3ProgSem = programa.reduce((s,p)=>s+(p.m3_prog??0),0)
  const m3RealSem = ejecuciones.reduce((s,e)=>s+(e.m3_real??0),0)
  const pctCumpl  = totalActs>0 ? Math.round((completadas+parciales*0.5)/totalActs*100) : 0

  const consumoSemOrigen: Record<string, {prog:number;real:number}> = {}
  ORIGENES_ALL.forEach(o => {
    consumoSemOrigen[o] = {
      prog: programa.filter(p=>p.origen===o).reduce((s,p)=>s+(p.m3_prog??0),0),
      real: consumos.filter(c=>c.origen===o).reduce((s,c)=>s+(c.m3_real??0),0),
    }
  })

  // ── Filtered programs (tab programa – semana con ejecución) ───────────────
  const progFiltrado = programa.filter(p => {
    if (filtroDia !== 'todos' && p.dia_semana !== filtroDia) return false
    if (filtroArea !== 'todas' && p.area !== filtroArea) return false
    if (filtroStatus !== 'todos') {
      const fecha = toDateStr(dateMap[p.dia_semana])
      const s = ejMap[`${p.id}|${fecha}`]?.status ?? 'pendiente'
      if (s !== filtroStatus) return false
    }
    return true
  })

  // Group for programa tab: día → área
  const grupos: { dia: string; area: string; fecha: Date; items: { prog: Programa; ej: Ejecucion|null; fecha: string }[] }[] = []
  DIAS.forEach(dia => {
    AREAS.forEach(area => {
      const items = progFiltrado.filter(p=>p.dia_semana===dia && p.area===area).map(p => ({
        prog: p, ej: ejMap[`${p.id}|${toDateStr(dateMap[dia])}`]??null, fecha: toDateStr(dateMap[dia]),
      }))
      if (items.length>0) grupos.push({ dia, area, fecha: dateMap[dia], items })
    })
  })

  // ── Filtered programs (tab catálogo – para edición) ───────────────────────
  const catFiltrado = programa.filter(p => {
    if (catDia !== 'todos' && p.dia_semana !== catDia) return false
    if (catArea !== 'todas' && p.area !== catArea) return false
    return true
  })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:'24px 28px', animation:'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, fontSize:12, color:'#94a3b8' }}>
            <Link href="/golf" style={{ color:'#94a3b8', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
              <ChevronLeft size={13} /> Club Golf
            </Link>
            <span>/</span>
            <span style={{ color:'#475569', fontWeight:500 }}>Riego</span>
          </div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:26, fontWeight:400, color:'var(--gold-light)', letterSpacing:'-0.01em', display:'flex', alignItems:'center', gap:10 }}>
            <Droplets size={24} style={{ color:'#0ea5e9' }} /> Programa de Riego
          </h1>
        </div>
        {/* Week nav — visible en programa y consumo */}
        {tab !== 'catalogo' && (
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f8fafc', borderRadius:12, padding:'8px 14px', border:'1px solid #e2e8f0' }}>
            <button onClick={()=>navSemana(-1)} style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', display:'flex' }}><ChevronLeft size={18} /></button>
            <div style={{ textAlign:'center', minWidth:170 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#1e293b' }}>Semana {semana} · {anio}</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>
                {fmtDate(weekDates[0])} – {fmtDate(weekDates[6])}
              </div>
            </div>
            <button onClick={()=>navSemana(1)} style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', display:'flex' }}><ChevronRight size={18} /></button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:24 }}>
        {[
          { label:'Total Actividades', value:totalActs,   sub:`${programa.filter(p=>p.dia_semana==='Lunes').length} por día (aprox)`, color:'#2563eb', bg:'#eff6ff' },
          { label:'Completadas sem.',  value:completadas, sub:`${pctCumpl}% cumplimiento`,    color:'#16a34a', bg:'#dcfce7' },
          { label:'Parciales sem.',    value:parciales,   sub:'completado parcialmente',       color:'#2563eb', bg:'#dbeafe' },
          { label:'No realizadas',     value:noRealizadas,sub:'actividades omitidas',          color:'#dc2626', bg:'#fee2e2' },
          { label:'M³ Programado sem.',value:m3ProgSem.toLocaleString('es-MX',{maximumFractionDigits:0}), sub:'según programa', color:'#0ea5e9', bg:'#e0f2fe' },
          { label:'M³ Real Ejecutado', value:m3RealSem.toLocaleString('es-MX',{maximumFractionDigits:0}), sub:`${ejecuciones.filter(e=>e.m3_real).length} actividades`, color:'#7c3aed', bg:'#f5f3ff' },
        ].map(k=>(
          <div key={k.label} style={{ flex:'1 1 140px', maxWidth:200, background:k.bg, borderRadius:14, padding:'16px 18px', border:`1.5px solid ${k.color}22` }}>
            <div style={{ fontSize:11, color:k.color, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:24, fontWeight:800, color:'#1e293b' }}>{k.value}</div>
            <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid #e2e8f0' }}>
        {([
          { key:'programa', label:'Ejecución Semanal',  icon:Calendar,  tip:'Registra qué actividades se realizaron esta semana' },
          { key:'catalogo', label:'Catálogo Programa',  icon:BookOpen,  tip:'Ver, agregar y editar actividades del programa base' },
          { key:'consumo',  label:'Consumo de Agua',    icon:Gauge,     tip:'Registro diario de m³ reales por origen' },
        ] as {key:typeof tab;label:string;icon:React.ComponentType<{size?:number}>;tip:string}[]).map(t=>{
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={()=>setTab(t.key)} title={t.tip}
              style={{ padding:'10px 18px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:active?700:500, color:active?'#2563eb':'#64748b', borderBottom:active?'2px solid #2563eb':'2px solid transparent', marginBottom:-2, display:'flex', alignItems:'center', gap:6, transition:'all 0.15s' }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB: EJECUCIÓN SEMANAL ──────────────────────────────────────────── */}
      {tab === 'programa' && (
        <div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:18, alignItems:'center' }}>
            <select value={filtroDia} onChange={e=>setFiltroDia(e.target.value)}
              style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, background:'#fff' }}>
              <option value="todos">Todos los días</option>
              {DIAS.map(d=><option key={d} value={d}>{d} — {fmtDate(dateMap[d])}</option>)}
            </select>
            <select value={filtroArea} onChange={e=>setFiltroArea(e.target.value)}
              style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, background:'#fff' }}>
              <option value="todas">Todas las áreas</option>
              {AREAS.map(a=><option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filtroStatus} onChange={e=>setFiltroStatus(e.target.value)}
              style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, background:'#fff' }}>
              <option value="todos">Todos los status</option>
              {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            {(filtroDia!=='todos'||filtroArea!=='todas'||filtroStatus!=='todos') && (
              <button className="btn-ghost" onClick={()=>{setFiltroDia('todos');setFiltroArea('todas');setFiltroStatus('todos')}} style={{ fontSize:12 }}>
                Limpiar filtros
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'#94a3b8' }}>Cargando…</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              {grupos.map((g,gi)=>{
                const comp = g.items.filter(it=>it.ej?.status==='completado').length
                const pct  = Math.round(comp/g.items.length*100)
                const m3g  = g.items.reduce((s,it)=>s+(it.prog.m3_prog??0),0)
                const m3r  = g.items.reduce((s,it)=>s+(it.ej?.m3_real??0),0)
                return (
                  <div key={gi} className="card" style={{ padding:0, overflow:'hidden' }}>
                    <div style={{ background:'#f8fafc', padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, borderBottom:'1px solid #e2e8f0' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                        <div>
                          <span style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>{g.dia}</span>
                          <span style={{ fontSize:12, color:'#94a3b8', marginLeft:8 }}>{fmtDateLong(g.fecha)}</span>
                          <span style={{ marginLeft:12, fontSize:12, fontWeight:600, color:'#475569' }}>{g.area}</span>
                        </div>
                        <span style={{ fontSize:11, background:'#e0f2fe', color:'#0369a1', padding:'3px 8px', borderRadius:20, fontWeight:600 }}>
                          {g.items.length} hoyos · {m3g.toFixed(1)} m³ prog.
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:'#64748b' }}>
                        {comp}/{g.items.length} completadas ({pct}%)
                        {m3r>0 && <span style={{ color:'#0ea5e9', marginLeft:8 }}>{m3r.toFixed(1)} m³ real</span>}
                      </div>
                    </div>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'#fafafa' }}>
                            {['Hoyo','Tipo','Origen','Zona','H.Inicio','H.Fin','Hrs Prog','M³ Prog','Status','M³ Real','Acción'].map(h=>(
                              <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748b', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {g.items.map((it,ii)=>(
                            <tr key={ii} style={{ borderBottom:'1px solid #f8fafc' }}
                              onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')}
                              onMouseLeave={e=>(e.currentTarget.style.background='')}>
                              <td style={{ padding:'9px 12px', fontWeight:700, color:'#1e293b' }}>{it.prog.hoyo?`H${it.prog.hoyo}`:'Reb.'}</td>
                              <td style={{ padding:'9px 12px', color:'#475569' }}>{it.prog.tipo_riego}</td>
                              <td style={{ padding:'9px 12px', color:'#475569' }}>{it.prog.origen}</td>
                              <td style={{ padding:'9px 12px', color:'#64748b', fontSize:11 }}>{it.prog.zona??'—'}</td>
                              <td style={{ padding:'9px 12px', color:'#64748b' }}>{it.ej?.hora_inicio_real??it.prog.hora_inicio??'—'}</td>
                              <td style={{ padding:'9px 12px', color:'#64748b' }}>{it.ej?.hora_fin_real??it.prog.hora_fin??'—'}</td>
                              <td style={{ padding:'9px 12px', color:'#475569' }}>{it.prog.horas_prog}</td>
                              <td style={{ padding:'9px 12px', color:'#0ea5e9', fontWeight:600 }}>{it.prog.m3_prog}</td>
                              <td style={{ padding:'9px 12px' }}><StatusBadge status={it.ej?.status??'pendiente'} /></td>
                              <td style={{ padding:'9px 12px', fontWeight:700, color:it.ej?.m3_real?'#7c3aed':'#94a3b8' }}>
                                {it.ej?.m3_real?.toFixed(1)??'—'}
                              </td>
                              <td style={{ padding:'9px 12px' }}>
                                <button onClick={()=>setModalEj({ prog:it.prog, ej:it.ej, fecha:it.fecha })}
                                  style={{ background:'#eff6ff', color:'#2563eb', border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                                  {it.ej?'Editar':'Registrar'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
              {grupos.length===0 && (
                <div style={{ textAlign:'center', padding:'60px 0', color:'#94a3b8' }}>Sin actividades con los filtros seleccionados.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CATÁLOGO PROGRAMA ──────────────────────────────────────────── */}
      {tab === 'catalogo' && (
        <div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:18, alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              <select value={catDia} onChange={e=>setCatDia(e.target.value)}
                style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, background:'#fff' }}>
                <option value="todos">Todos los días</option>
                {DIAS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
              <select value={catArea} onChange={e=>setCatArea(e.target.value)}
                style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, background:'#fff' }}>
                <option value="todas">Todas las áreas</option>
                {AREAS.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
              {(catDia!=='todos'||catArea!=='todas') && (
                <button className="btn-ghost" onClick={()=>{setCatDia('todos');setCatArea('todas')}} style={{ fontSize:12 }}>Limpiar</button>
              )}
            </div>
            {writer && (
              <button className="btn-primary" onClick={()=>setModalProg({ prog:null })}
                style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Plus size={15} /> Nueva actividad
              </button>
            )}
          </div>

          <div style={{ marginBottom:12, fontSize:12, color:'#64748b' }}>
            {catFiltrado.length} actividades · {catFiltrado.reduce((s,p)=>s+(p.m3_prog??0),0).toLocaleString('es-MX',{maximumFractionDigits:0})} m³/semana (con filtros actuales)
          </div>

          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
                    {['Día','Hoyo','Área','Tipo','Origen','Zona','H.Inicio','H.Fin','Hrs','M³'].concat(writer?['Acciones']:[]).map(h=>(
                      <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748b', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catFiltrado.map(p=>(
                    <tr key={p.id} style={{ borderBottom:'1px solid #f1f5f9' }}
                      onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')}
                      onMouseLeave={e=>(e.currentTarget.style.background='')}>
                      <td style={{ padding:'9px 12px', fontWeight:700, color:'#1e293b', whiteSpace:'nowrap' }}>{p.dia_semana}</td>
                      <td style={{ padding:'9px 12px', color:'#475569' }}>{p.hoyo??'Reb.'}</td>
                      <td style={{ padding:'9px 12px', color:'#475569', maxWidth:140, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.area}</td>
                      <td style={{ padding:'9px 12px', color:'#64748b' }}>{p.tipo_riego}</td>
                      <td style={{ padding:'9px 12px', color:'#64748b' }}>{p.origen}</td>
                      <td style={{ padding:'9px 12px', color:'#94a3b8', fontSize:11 }}>{p.zona??'—'}</td>
                      <td style={{ padding:'9px 12px', color:'#64748b' }}>{p.hora_inicio??'—'}</td>
                      <td style={{ padding:'9px 12px', color:'#64748b' }}>{p.hora_fin??'—'}</td>
                      <td style={{ padding:'9px 12px', color:'#475569' }}>{p.horas_prog}</td>
                      <td style={{ padding:'9px 12px', color:'#0ea5e9', fontWeight:600 }}>{p.m3_prog}</td>
                      {writer && (
                        <td style={{ padding:'9px 12px' }}>
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={()=>setModalProg({ prog:p })}
                              title="Editar"
                              style={{ background:'#f1f5f9', color:'#475569', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:3, fontSize:11 }}>
                              <Pencil size={12} /> Editar
                            </button>
                            <button onClick={()=>setDelConfirm(p)}
                              title="Eliminar"
                              style={{ background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:3, fontSize:11 }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {catFiltrado.length===0 && (
              <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8', fontSize:13 }}>
                No hay actividades. {writer && <button className="btn-ghost" onClick={()=>setModalProg({prog:null})} style={{fontSize:12}}>+ Agregar la primera</button>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: CONSUMO DE AGUA ────────────────────────────────────────────── */}
      {tab === 'consumo' && (
        <div>
          <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
            <Link href="/reportes?grupo=golf&id=riego-consumo" style={{ fontSize:12, color:'#2563eb', fontWeight:600, textDecoration:'none' }}>
              Ver reporte completo →
            </Link>
          </div>

          <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:20 }}>
            {ORIGENES_ALL.map(orig=>{
              const c = consumoSemOrigen[orig]
              const gap = c.real>0 ? c.real-c.prog : null
              return (
                <div key={orig} style={{ flex:'1 1 180px', maxWidth:240, background:'#f8fafc', borderRadius:14, padding:'16px 18px', border:'1.5px solid #e2e8f0' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#1e293b', marginBottom:8 }}>{orig}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div>
                      <div style={{ fontSize:10, color:'#94a3b8', fontWeight:600 }}>PROG. SEM.</div>
                      <div style={{ fontSize:16, fontWeight:700, color:'#0ea5e9' }}>{c.prog.toFixed(0)} m³</div>
                    </div>
                    <div>
                      <div style={{ fontSize:10, color:'#94a3b8', fontWeight:600 }}>REAL SEM.</div>
                      <div style={{ fontSize:16, fontWeight:700, color:c.real>0?'#7c3aed':'#cbd5e1' }}>{c.real>0?c.real.toFixed(0):'—'} m³</div>
                    </div>
                  </div>
                  {gap!=null && (
                    <div style={{ marginTop:8, fontSize:11, fontWeight:600, color:gap>0?'#dc2626':'#16a34a' }}>
                      Gap: {gap>0?'+':''}{gap.toFixed(0)} m³
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
                    {['Fecha','Origen','M³ Prog.','M³ Real','Hrs Bomba','Gap m³','Obs.','Acción'].map(h=>(
                      <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#64748b' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekDates.map((date,di)=>{
                    const fecha = toDateStr(date)
                    const dNom  = DIAS[di]
                    const dayCons = ORIGENES_ALL.map(origen=>{
                      const c = consumos.find(c=>c.fecha===fecha&&c.origen===origen)
                      const prog = M3_PROG_DIA_ORIGEN[dNom]?.[origen]??0
                      return { origen, c, prog }
                    }).filter(x=>x.prog>0||x.c)
                    return dayCons.map((x,xi)=>{
                      const gap = x.c?.m3_real!=null ? x.c.m3_real-x.prog : null
                      return (
                        <tr key={`${fecha}|${x.origen}`} style={{ borderBottom:'1px solid #f1f5f9' }}
                          onMouseEnter={e=>(e.currentTarget.style.background='#f8fafc')}
                          onMouseLeave={e=>(e.currentTarget.style.background='')}>
                          {xi===0 && (
                            <td rowSpan={dayCons.length} style={{ padding:'10px 16px', fontWeight:700, color:'#1e293b', borderRight:'1px solid #f1f5f9', verticalAlign:'top' }}>
                              <div>{dNom}</div>
                              <div style={{ fontSize:11, color:'#94a3b8', fontWeight:400 }}>{fmtDate(date)}</div>
                            </td>
                          )}
                          <td style={{ padding:'10px 16px', color:'#475569', fontWeight:600 }}>{x.origen}</td>
                          <td style={{ padding:'10px 16px', color:'#0ea5e9', fontWeight:600 }}>{x.prog.toFixed(1)}</td>
                          <td style={{ padding:'10px 16px', fontWeight:700, color:x.c?.m3_real?'#7c3aed':'#cbd5e1' }}>{x.c?.m3_real?.toFixed(1)??'—'}</td>
                          <td style={{ padding:'10px 16px', color:'#64748b' }}>{x.c?.horas_bomba?.toFixed(1)??'—'}</td>
                          <td style={{ padding:'10px 16px', fontWeight:600, color:gap==null?'#94a3b8':gap>0?'#dc2626':'#16a34a' }}>
                            {gap!=null?(gap>0?'+':'')+gap.toFixed(1):'—'}
                          </td>
                          <td style={{ padding:'10px 16px', color:'#64748b', fontSize:12 }}>{x.c?.observaciones??'—'}</td>
                          {xi===0 && (
                            <td rowSpan={dayCons.length} style={{ padding:'10px 16px', textAlign:'center', verticalAlign:'middle' }}>
                              <button onClick={()=>setModalConsumo({fecha})}
                                style={{ background:'#e0f2fe', color:'#0369a1', border:'none', borderRadius:6, padding:'5px 12px', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                                <Droplets size={11} style={{ display:'inline', marginRight:4 }} />
                                {consumos.some(c=>c.fecha===fecha)?'Editar':'Registrar'}
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background:'#f8fafc', borderTop:'2px solid #e2e8f0', fontWeight:700 }}>
                    <td colSpan={2} style={{ padding:'12px 16px', color:'#1e293b' }}>TOTAL SEMANA</td>
                    <td style={{ padding:'12px 16px', color:'#0ea5e9' }}>
                      {Object.values(M3_PROG_DIA_ORIGEN).reduce((s,d)=>s+Object.values(d).reduce((a,v)=>a+v,0),0).toFixed(0)} m³
                    </td>
                    <td style={{ padding:'12px 16px', color:'#7c3aed' }}>{consumos.reduce((s,c)=>s+(c.m3_real??0),0).toFixed(1)} m³</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {modalProg && (
        <ProgramaModal
          prog={modalProg.prog}
          onClose={()=>setModalProg(null)}
          onSave={loadPrograma}
        />
      )}

      {modalEj && (
        <EjecucionModal
          prog={modalEj.prog} ejecucion={modalEj.ej} fecha={modalEj.fecha}
          onClose={()=>setModalEj(null)}
          onSave={data=>saveEjecucion(modalEj.prog, modalEj.fecha, data)}
        />
      )}

      {modalConsumo && (
        <ConsumoModal
          fecha={modalConsumo.fecha}
          origenes_data={consumos.filter(c=>c.fecha===modalConsumo.fecha)}
          onClose={()=>setModalConsumo(null)}
          onSave={saveConsumos}
        />
      )}

      {/* Delete confirm */}
      {delConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'28px 32px', width:400, maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#1e293b', marginBottom:10 }}>¿Eliminar actividad?</div>
            <div style={{ fontSize:13, color:'#64748b', marginBottom:20, lineHeight:1.5 }}>
              Se desactivará <strong>{delConfirm.dia_semana} · {delConfirm.area} · Hoyo {delConfirm.hoyo??'Reb.'}</strong>.<br />
              Los registros de ejecución anteriores se conservan.
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button className="btn-ghost" onClick={()=>setDelConfirm(null)}>Cancelar</button>
              <button onClick={()=>deletePrograma(delConfirm)}
                style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
