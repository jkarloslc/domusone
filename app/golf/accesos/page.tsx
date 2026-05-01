'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, LogIn, LogOut, ChevronLeft, Users, Clock, Filter, Eye } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import Link from 'next/link'
import AccesoModal from './AccesoModal'

type Acceso = {
  id: number
  fecha_entrada: string
  fecha_salida: string | null
  hoyo_inicio: number | null
  observaciones: string | null
  id_socio_fk: number | null
  cat_socios?: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null; numero_tarjeta: string | null } | null
  cat_espacios_deportivos?: { nombre: string } | null
  cat_formas_juego?: { nombre: string } | null
}

type Espacio = { id: number; nombre: string }

const fmtHora = (d: string) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const fmtFecha = (d: string) => new Date(d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })

export default function AccesosPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-accesos')

  const [accesos, setAccesos]       = useState<Acceso[]>([])
  const [espacios, setEspacios]     = useState<Espacio[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [detalle, setDetalle]           = useState<Acceso | null>(null)
  const [detalleAcomps, setDetalleAcomps] = useState<{ nombre: string; orden: number }[]>([])
  const [loadingAcomps, setLoadingAcomps] = useState(false)
  const [registrandoSalida, setRegistrandoSalida] = useState<number | null>(null)

  // filtros
  const localToday = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const [fecha, setFecha]           = useState(localToday)
  const [filtroEspacio, setFiltroEspacio] = useState<number | ''>('')
  const [filtroStatus, setFiltroStatus]   = useState<'todos' | 'activos' | 'completados'>('todos')

  // stats del día
  const [stats, setStats] = useState({ total: 0, activos: 0, completados: 0 })

  const fetchAccesos = useCallback(async () => {
    setLoading(true)
    let q = dbGolf
      .from('ctrl_accesos')
      .select(`
        id, fecha_entrada, fecha_salida, hoyo_inicio, observaciones, id_socio_fk,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio, numero_tarjeta),
        cat_espacios_deportivos(nombre),
        cat_formas_juego(nombre)
      `)
      .gte('fecha_entrada', new Date(`${fecha}T00:00:00`).toISOString())
      .lte('fecha_entrada', new Date(`${fecha}T23:59:59`).toISOString())
      .order('fecha_entrada', { ascending: false })

    if (filtroEspacio) q = q.eq('id_espacio_fk', filtroEspacio)

    const { data, error: qErr } = await q
    if (qErr) console.error('[AccesosPage] query error:', qErr.message)
    const all = (data as unknown as Acceso[]) ?? []

    const activos     = all.filter(a => !a.fecha_salida).length
    const completados = all.filter(a =>  a.fecha_salida).length
    setStats({ total: all.length, activos, completados })

    let filtrados = all
    if (filtroStatus === 'activos')     filtrados = all.filter(a => !a.fecha_salida)
    if (filtroStatus === 'completados') filtrados = all.filter(a =>  a.fecha_salida)

    setAccesos(filtrados)
    setLoading(false)
  }, [fecha, filtroEspacio, filtroStatus])

  useEffect(() => { fetchAccesos() }, [fetchAccesos])

  useEffect(() => {
    dbGolf.from('cat_espacios_deportivos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setEspacios(data ?? []))
  }, [])

  const registrarSalida = async (id: number) => {
    if (!confirm('¿Confirmar salida del campo?')) return
    setRegistrandoSalida(id)
    await dbGolf.from('ctrl_accesos').update({ fecha_salida: new Date().toISOString() }).eq('id', id)
    setRegistrandoSalida(null)
    fetchAccesos()
  }

  const handleSaved = () => { setShowModal(false); fetchAccesos() }

  const abrirDetalle = async (a: Acceso) => {
    setDetalle(a)
    setDetalleAcomps([])
    setLoadingAcomps(true)
    const { data, error: aErr } = await dbGolf
      .from('ctrl_acceso_acomp')
      .select('nombre, orden')
      .eq('id_acceso_fk', a.id)
      .order('orden', { ascending: true })
    console.log('[acomps] id_acceso_fk:', a.id, '| data:', data, '| error:', aErr?.message)
    setDetalleAcomps((data ?? []) as { nombre: string; orden: number }[])
    setLoadingAcomps(false)
  }

  const esHoy = fecha === localToday()

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
            <Link href="/golf" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span>/</span>
            <span style={{ color: '#475569', fontWeight: 500 }}>Salidas al Campo</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Salidas al Campo
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchAccesos} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Registrar Entrada
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: esHoy ? 'En Campo Hoy' : 'Total del Día', value: stats.total,      color: '#2563eb', bg: '#eff6ff', icon: Users },
          { label: 'Activos (sin salida)',                    value: stats.activos,     color: '#16a34a', bg: '#f0fdf4', icon: LogIn  },
          { label: 'Completados',                             value: stats.completados, color: '#64748b', bg: '#f8fafc', icon: LogOut },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="card" style={{ flex: '1 1 160px', maxWidth: 220, padding: '14px 18px', background: card.bg, border: `1px solid ${card.color}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon size={14} style={{ color: card.color }} />
                <span style={{ fontSize: 11, color: '#64748b' }}>{card.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: card.color, lineHeight: 1 }}>{card.value}</div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={13} style={{ color: '#94a3b8' }} />
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}
          />
        </div>
        <select
          value={filtroEspacio}
          onChange={e => setFiltroEspacio(e.target.value ? Number(e.target.value) : '')}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todos los espacios</option>
          {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['todos', 'activos', 'completados'] as const).map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)} style={{
              padding: '7px 14px', fontSize: 12, fontWeight: filtroStatus === s ? 600 : 400,
              background: filtroStatus === s ? '#2563eb' : 'var(--surface)',
              color: filtroStatus === s ? '#fff' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              {s === 'todos' ? 'Todos' : s === 'activos' ? 'En campo' : 'Completados'}
            </button>
          ))}
        </div>
        {esHoy && <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>● Hoy</span>}
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                {['Socio', 'Espacio', 'Hoyo', 'Entrada', 'Salida', 'Acompañantes', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
              ) : accesos.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>-</div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin registros para este día</div>
                  <div style={{ fontSize: 12 }}>Registra la primera salida al campo</div>
                </td></tr>
              ) : accesos.map(a => {
                const socio = a.cat_socios
                const nombreSocio = socio ? [socio.nombre, socio.apellido_paterno, socio.apellido_materno].filter(Boolean).join(' ') : '—'
                const enCampo = !a.fecha_salida
                const isSalida = registrandoSalida === a.id
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{nombreSocio}</div>
                      {socio?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{socio.numero_socio}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {a.cat_espacios_deportivos?.nombre ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      {a.hoyo_inicio ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={11} style={{ color: '#16a34a' }} />
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtHora(a.fecha_entrada)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtFecha(a.fecha_entrada)}</div>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {a.fecha_salida ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Clock size={11} style={{ color: '#64748b' }} />
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtHora(a.fecha_salida)}</span>
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#16a34a' }}>En campo</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                      Ver detalle →
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          className="btn-ghost"
                          style={{ padding: '4px 6px', color: '#64748b' }}
                          onClick={() => abrirDetalle(a)}
                          title="Ver detalle">
                          <Eye size={13} />
                        </button>
                        {enCampo && puedeEscribir && (
                          <button
                            className="btn-ghost"
                            style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: '#dc2626', opacity: isSalida ? 0.5 : 1 }}
                            onClick={() => registrarSalida(a.id)}
                            disabled={isSalida}
                            title="Registrar salida">
                            <LogOut size={13} /> Salida
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

      {showModal && <AccesoModal onClose={() => setShowModal(false)} onSaved={handleSaved} />}

      {detalle && (
        <ModalShell modulo="golf-accesos" titulo="Detalle de Salida al Campo" onClose={() => setDetalle(null)} maxWidth={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Socio */}
            <div style={{ padding: '12px 16px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4ed8' }}>
                {detalle.cat_socios
                  ? [detalle.cat_socios.nombre, detalle.cat_socios.apellido_paterno, detalle.cat_socios.apellido_materno].filter(Boolean).join(' ')
                  : '—'}
              </div>
              {detalle.cat_socios?.numero_socio && (
                <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>#{detalle.cat_socios.numero_socio}</div>
              )}
            </div>

            {/* Info de la salida */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Espacio deportivo', value: detalle.cat_espacios_deportivos?.nombre ?? '—' },
                { label: 'Hoyo de inicio',    value: detalle.hoyo_inicio ? `Hoyo ${detalle.hoyo_inicio}` : '—' },
                { label: 'Entrada',           value: `${fmtFecha(detalle.fecha_entrada)} ${fmtHora(detalle.fecha_entrada)}` },
                { label: 'Salida',            value: detalle.fecha_salida ? `${fmtFecha(detalle.fecha_salida)} ${fmtHora(detalle.fecha_salida)}` : '—' },
                { label: 'Status',            value: detalle.fecha_salida ? 'Completado' : 'En campo' },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 12px', background: 'var(--bg-muted, #f8fafc)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Acompañantes */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Acompañantes {!loadingAcomps && `(${detalleAcomps.length})`}
              </div>
              {loadingAcomps ? (
                <div style={{ fontSize: 13, color: '#94a3b8' }}>Cargando…</div>
              ) : detalleAcomps.length === 0 ? (
                <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Sin acompañantes registrados</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detalleAcomps.map((ac, i) => (
                    <div key={i} style={{ padding: '8px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155', fontWeight: 500 }}>
                      {ac.nombre}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Observaciones */}
            {detalle.observaciones && (
              <div style={{ padding: '10px 14px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 13, color: '#78350f' }}>
                <span style={{ fontWeight: 600 }}>Observaciones: </span>{detalle.observaciones}
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  )
}
