'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl } from '@/lib/supabase'
import ModalShell from '@/components/ui/ModalShell'
import {
  ChevronLeft, ChevronRight, Star, MapPin, Users,
  Clock, DollarSign, ShoppingBag, Phone, Mail, Calendar,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────

type Evento = {
  id: number
  folio: string
  nombre: string
  id_tipo_evento_fk: number | null
  id_lugar_fk: number | null
  fecha_inicio: string
  fecha_fin: string | null
  hora_inicio: string | null
  hora_fin: string | null
  num_asistentes: number | null
  responsable: string | null
  cliente_nombre: string | null
  cliente_telefono: string | null
  cliente_email: string | null
  notas: string | null
  status: string
  cat_tipos_evento?: { nombre: string; color: string }
  cat_lugares?: { nombre: string; capacidad: number | null }
}

type Ingreso = { id: number; folio: string; descripcion: string; monto: number; fecha_pago: string; forma_pago: string }
type OP      = { id: number; folio: string; concepto: string; monto: number; saldo: number; status: string; proveedor_nombre: string | null }

// ── Constants ────────────────────────────────────────────────

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  'Cotización': { bg: '#f0fdf4', color: '#16a34a' },
  'Confirmado': { bg: '#eff6ff', color: '#2563eb' },
  'En curso':   { bg: '#fff7ed', color: '#ea580c' },
  'Realizado':  { bg: '#f0fdf4', color: '#15803d' },
  'Cancelado':  { bg: '#fef2f2', color: '#dc2626' },
}

const fmt$ = (v: number) => '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Helpers calendario ───────────────────────────────────────

function getDiasDelMes(year: number, month: number) {
  // month: 0-11
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  // Lunes como primer día de semana
  let startDow = firstDay.getDay() // 0=Dom
  startDow = startDow === 0 ? 6 : startDow - 1 // 0=Lun
  const dias: (number | null)[] = []
  for (let i = 0; i < startDow; i++) dias.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) dias.push(d)
  // padding final para completar semanas
  while (dias.length % 7 !== 0) dias.push(null)
  return dias
}

function eventoEnDia(ev: Evento, year: number, month: number, day: number): boolean {
  const d     = new Date(year, month, day, 12, 0, 0)
  const start = new Date(ev.fecha_inicio + 'T12:00:00')
  const end   = ev.fecha_fin ? new Date(ev.fecha_fin + 'T12:00:00') : start
  return d >= start && d <= end
}

function sortEventos(a: Evento, b: Evento) {
  const fecha = a.fecha_inicio.localeCompare(b.fecha_inicio)
  if (fecha !== 0) return fecha
  return (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? '')
}

// ── Component ────────────────────────────────────────────────

export default function CalendarioPage() {
  const hoy  = new Date()
  const [year,  setYear]  = useState(hoy.getFullYear())
  const [month, setMonth] = useState(hoy.getMonth()) // 0-11

  const [eventos,  setEventos]  = useState<Evento[]>([])
  const [loading,  setLoading]  = useState(false)

  // Modal detalle
  const [selEvento, setSelEvento] = useState<Evento | null>(null)
  const [ingresos,  setIngresos]  = useState<Ingreso[]>([])
  const [ops,       setOps]       = useState<OP[]>([])
  const [activeTab, setActiveTab] = useState('info')

  // ── Cargar eventos del mes ──────────────────────────────────
  const loadEventos = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCtrl.from('eventos')
      .select('id, folio, nombre, id_tipo_evento_fk, id_lugar_fk, fecha_inicio, fecha_fin, hora_inicio, hora_fin, num_asistentes, responsable, cliente_nombre, cliente_telefono, cliente_email, notas, status, cat_tipos_evento(nombre, color), cat_lugares(nombre, capacidad)')
      .order('fecha_inicio')
      .order('hora_inicio')
    setEventos(((data as unknown as Evento[]) ?? []).sort(sortEventos))
    setLoading(false)
  }, [])

  useEffect(() => { loadEventos() }, [loadEventos])

  // ── Abrir detalle ──────────────────────────────────────────
  const openDetalle = async (ev: Evento) => {
    setSelEvento(ev)
    setActiveTab('info')
    const [{ data: ing }, { data: eops }] = await Promise.all([
      dbCtrl.from('eventos_ingresos').select('id, folio, descripcion, monto, fecha_pago, forma_pago').eq('id_evento_fk', ev.id),
      dbCtrl.from('eventos_ops').select('id_op_fk').eq('id_evento_fk', ev.id),
    ])
    setIngresos((ing as unknown as Ingreso[]) ?? [])
    const opIds = ((eops as unknown as { id_op_fk: number }[]) ?? []).map(e => e.id_op_fk)
    if (opIds.length > 0) {
      const { data: opData } = await (dbCtrl as any).schema('comp').from('ordenes_pago')
        .select('id, folio, concepto, monto, saldo, status, proveedor_nombre').in('id', opIds)
      setOps((opData as unknown as OP[]) ?? [])
    } else setOps([])
  }

  // ── Navegación ─────────────────────────────────────────────
  const prevMes = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMes = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const dias = getDiasDelMes(year, month)

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      {/* Back + nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/hospitality" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
            <ChevronLeft size={15} /> Hospitality
          </a>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Calendario</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" onClick={prevMes} style={{ padding: '6px 10px' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', minWidth: 180, textAlign: 'center' }}>
            {MESES[month]} {year}
          </span>
          <button className="btn-ghost" onClick={nextMes} style={{ padding: '6px 10px' }}>
            <ChevronRight size={16} />
          </button>
          <button className="btn-ghost" onClick={() => { setYear(hoy.getFullYear()); setMonth(hoy.getMonth()) }}
            style={{ fontSize: 12, padding: '6px 12px' }}>Hoy</button>
        </div>
      </div>

      {/* Leyenda de status */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
            <span style={{ color: 'var(--text-muted)' }}>{s}</span>
          </div>
        ))}
      </div>

      {/* Calendario */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        {/* Header días semana */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {DIAS_SEMANA.map(d => (
            <div key={d} style={{
              padding: '10px 8px', textAlign: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              letterSpacing: '0.05em', textTransform: 'uppercase',
              background: 'var(--surface-700)',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grid de días */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {dias.map((dia, idx) => {
            const isHoy = dia !== null && dia === hoy.getDate() && month === hoy.getMonth() && year === hoy.getFullYear()
            const evsDia = dia !== null ? eventos.filter(ev => eventoEnDia(ev, year, month, dia)) : []
            return (
              <div
                key={idx}
                style={{
                  minHeight: 100,
                  borderRight: (idx + 1) % 7 === 0 ? 'none' : '1px solid var(--border)',
                  borderBottom: idx < dias.length - 7 ? '1px solid var(--border)' : 'none',
                  padding: '6px 5px',
                  background: dia === null ? 'var(--surface-900)' : 'transparent',
                }}
              >
                {dia !== null && (
                  <>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: '50%', marginBottom: 4,
                      fontSize: 12, fontWeight: isHoy ? 700 : 400,
                      background: isHoy ? '#9333ea' : 'transparent',
                      color: isHoy ? '#fff' : 'var(--text-primary)',
                    }}>
                      {dia}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {evsDia.map(ev => {
                        const tipo  = ev.cat_tipos_evento
                        const color = tipo?.color ?? '#9333ea'
                        const sc    = STATUS_COLORS[ev.status] ?? { color: '#64748b' }
                        return (
                          <button
                            key={ev.id}
                            onClick={() => openDetalle(ev)}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              background: color + '18',
                              border: `1px solid ${color}44`,
                              borderLeft: `3px solid ${color}`,
                              borderRadius: 5, padding: '3px 6px',
                              cursor: 'pointer', fontSize: 10, lineHeight: 1.3,
                              color: 'var(--text-primary)',
                              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                              transition: 'all 0.12s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = color + '30' }}
                            onMouseLeave={e => { e.currentTarget.style.background = color + '18' }}
                          >
                            <span style={{ fontWeight: 600, color }}>
                              {ev.hora_inicio ? ev.hora_inicio.slice(0,5) + ' ' : ''}
                            </span>
                            {ev.nombre}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>Cargando eventos…</div>
      )}

      {/* ── MODAL DETALLE ── */}
      {selEvento && (
        <ModalShell
          modulo="default"
          titulo={selEvento.nombre}
          subtitulo={selEvento.folio}
          icono={Star}
          maxWidth={700}
          onClose={() => setSelEvento(null)}
          tabs={[
            { key: 'info',     label: 'Información',  icon: Star },
            { key: 'ingresos', label: 'Ingresos',     icon: DollarSign, badge: ingresos.length || undefined },
            { key: 'gastos',   label: 'Gastos / OPs', icon: ShoppingBag, badge: ops.length || undefined },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          footer={
            <a href="/hospitality/eventos" style={{ fontSize: 12, color: '#9333ea', textDecoration: 'none' }}>
              Editar en gestión de eventos →
            </a>
          }
        >
          {/* Tab info */}
          {activeTab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Status badge */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                {(() => { const sc = STATUS_COLORS[selEvento.status] ?? { bg: '#f8fafc', color: '#64748b' }; return (
                  <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 700, background: sc.bg, color: sc.color }}>
                    {selEvento.status}
                  </span>
                )})()}
                {selEvento.cat_tipos_evento && (
                  <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 600,
                    background: selEvento.cat_tipos_evento.color + '18', color: selEvento.cat_tipos_evento.color }}>
                    {selEvento.cat_tipos_evento.nombre}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fecha</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Calendar size={13} style={{ color: '#9333ea' }} />
                    {fmtFecha(selEvento.fecha_inicio)}
                    {selEvento.fecha_fin && selEvento.fecha_fin !== selEvento.fecha_inicio && ` — ${fmtFecha(selEvento.fecha_fin)}`}
                  </div>
                </div>
                {(selEvento.hora_inicio || selEvento.hora_fin) && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Horario</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock size={13} style={{ color: '#9333ea' }} />
                      {selEvento.hora_inicio?.slice(0,5) ?? '—'}
                      {selEvento.hora_fin && ` a ${selEvento.hora_fin.slice(0,5)}`}
                    </div>
                  </div>
                )}
                {selEvento.cat_lugares && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lugar</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <MapPin size={13} style={{ color: '#9333ea' }} />
                      {selEvento.cat_lugares.nombre}
                      {selEvento.cat_lugares.capacidad && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(cap. {selEvento.cat_lugares.capacidad})</span>}
                    </div>
                  </div>
                )}
                {selEvento.num_asistentes && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Asistentes</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Users size={13} style={{ color: '#9333ea' }} />
                      {selEvento.num_asistentes} personas
                    </div>
                  </div>
                )}
                {selEvento.responsable && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Responsable</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{selEvento.responsable}</div>
                  </div>
                )}
              </div>

              {/* Cliente */}
              {(selEvento.cliente_nombre || selEvento.cliente_telefono || selEvento.cliente_email) && (
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9333ea', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Cliente</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selEvento.cliente_nombre && <div style={{ fontSize: 13, fontWeight: 600 }}>{selEvento.cliente_nombre}</div>}
                    {selEvento.cliente_telefono && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                        <Phone size={12} /> {selEvento.cliente_telefono}
                      </div>
                    )}
                    {selEvento.cliente_email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                        <Mail size={12} /> {selEvento.cliente_email}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selEvento.notas && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notas</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{selEvento.notas}</div>
                </div>
              )}
            </div>
          )}

          {/* Tab ingresos */}
          {activeTab === 'ingresos' && (
            <div>
              {ingresos.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 13 }}>Sin ingresos registrados</div>
              ) : (
                <>
                  <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                          {['Folio', 'Descripción', 'Fecha', 'Forma', 'Monto'].map(h => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ingresos.map((ing, i) => (
                          <tr key={ing.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#9333ea', fontFamily: 'monospace', fontSize: 10 }}>{ing.folio}</td>
                            <td style={{ padding: '8px 12px' }}>{ing.descripcion}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(ing.fecha_pago)}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{ing.forma_pago}</td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: '#16a34a' }}>{fmt$(ing.monto)}</td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                          <td colSpan={4} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#16a34a' }}>{fmt$(ingresos.reduce((s, i) => s + i.monto, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tab gastos */}
          {activeTab === 'gastos' && (
            <div>
              {ops.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 13 }}>Sin OPs vinculadas</div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-700)', borderBottom: '1px solid var(--border)' }}>
                        {['Folio', 'Concepto', 'Proveedor', 'Monto', 'Saldo', 'Status'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ops.map((op, i) => (
                        <tr key={op.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-800)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace', fontSize: 10 }}>{op.folio}</td>
                          <td style={{ padding: '8px 12px' }}>{op.concepto}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{op.proveedor_nombre ?? '—'}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{fmt$(op.monto)}</td>
                          <td style={{ padding: '8px 12px', color: op.saldo > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{fmt$(op.saldo)}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#f8fafc', color: '#64748b', fontWeight: 600 }}>{op.status}</span>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-700)' }}>
                        <td colSpan={3} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>{fmt$(ops.reduce((s, o) => s + o.monto, 0))}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#dc2626' }}>{fmt$(ops.reduce((s, o) => s + o.saldo, 0))}</td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </ModalShell>
      )}
    </div>
  )
}
