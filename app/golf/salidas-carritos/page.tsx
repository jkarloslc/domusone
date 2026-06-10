'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, LogIn, LogOut, ChevronLeft, Car, Clock, Filter } from 'lucide-react'
import Link from 'next/link'
import SalidaCarritoModal from './SalidaCarritoModal'

type Salida = {
  id: number
  fecha_salida: string
  fecha_regreso: string | null
  observaciones: string | null
  usuario_registra: string | null
  id_carrito_fk: number
  cat_carritos: { marca: string | null; modelo: string | null; placa: string | null; tipo: string } | null
  ctrl_pensiones: { cat_slots: { numero: string } | null } | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
}

const fmtHora = (d: string) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const fmtFecha = (d: string) => new Date(d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'

export default function SalidasCarritosPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-carritos')

  const [salidas, setSalidas]     = useState<Salida[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [registrandoRegreso, setRegistrandoRegreso] = useState<number | null>(null)

  const localToday = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  const [fecha, setFecha] = useState(localToday)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'en_ronda' | 'regresados'>('todos')

  const [stats, setStats] = useState({ total: 0, enRonda: 0, regresados: 0 })

  const fetchSalidas = useCallback(async () => {
    setLoading(true)
    // Salidas del día + las de días anteriores que siguen en ronda
    const [{ data: delDia }, { data: pendientes }] = await Promise.all([
      dbGolf.from('ctrl_salidas_carritos')
        .select(`id, fecha_salida, fecha_regreso, observaciones, usuario_registra, id_carrito_fk,
          cat_carritos(marca, modelo, placa, tipo),
          ctrl_pensiones(cat_slots(numero)),
          cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio)`)
        .gte('fecha_salida', new Date(`${fecha}T00:00:00`).toISOString())
        .lte('fecha_salida', new Date(`${fecha}T23:59:59`).toISOString())
        .order('fecha_salida', { ascending: false }),
      dbGolf.from('ctrl_salidas_carritos')
        .select(`id, fecha_salida, fecha_regreso, observaciones, usuario_registra, id_carrito_fk,
          cat_carritos(marca, modelo, placa, tipo),
          ctrl_pensiones(cat_slots(numero)),
          cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio)`)
        .is('fecha_regreso', null)
        .lt('fecha_salida', new Date(`${fecha}T00:00:00`).toISOString())
        .order('fecha_salida', { ascending: false }),
    ])

    const raw = [...((pendientes as unknown as Salida[]) ?? []), ...((delDia as unknown as Salida[]) ?? [])]
    const all = Array.from(new Map(raw.map(s => [s.id, s])).values())

    const enRondaArr = all.filter(s => !s.fecha_regreso)
    setStats({ total: all.length, enRonda: enRondaArr.length, regresados: all.length - enRondaArr.length })

    let filtradas = all
    if (filtroStatus === 'en_ronda')   filtradas = all.filter(s => !s.fecha_regreso)
    if (filtroStatus === 'regresados') filtradas = all.filter(s =>  s.fecha_regreso)

    setSalidas(filtradas)
    setLoading(false)
  }, [fecha, filtroStatus])

  useEffect(() => { fetchSalidas() }, [fetchSalidas])

  const registrarRegreso = async (id: number) => {
    if (!confirm('¿Confirmar regreso del carrito a motor lobby?')) return
    setRegistrandoRegreso(id)
    await dbGolf.from('ctrl_salidas_carritos').update({ fecha_regreso: new Date().toISOString() }).eq('id', id)
    setRegistrandoRegreso(null)
    fetchSalidas()
  }

  const handleSaved = () => { setShowModal(false); fetchSalidas() }

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
            <span style={{ color: '#475569', fontWeight: 500 }}>Entrada/Salida de Carritos</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Entrada/Salida de Carritos
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchSalidas} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669' }}>
              <Plus size={14} /> Registrar Salida
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: esHoy ? 'Salidas Hoy' : 'Salidas del Día', value: stats.total,      color: '#2563eb', bg: '#eff6ff', icon: Car    },
          { label: 'En ronda de juego',                       value: stats.enRonda,    color: '#16a34a', bg: '#f0fdf4', icon: LogOut },
          { label: 'Regresados',                              value: stats.regresados, color: '#64748b', bg: '#f8fafc', icon: LogIn  },
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
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {(['todos', 'en_ronda', 'regresados'] as const).map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)} style={{
              padding: '7px 14px', fontSize: 12, fontWeight: filtroStatus === s ? 600 : 400,
              background: filtroStatus === s ? '#059669' : 'var(--surface)',
              color: filtroStatus === s ? '#fff' : 'var(--text-muted)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}>
              {s === 'todos' ? 'Todos' : s === 'en_ronda' ? 'En ronda' : 'Regresados'}
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
                {['Carrito', 'Socio', 'Cajón', 'Salida', 'Regreso', 'Registró', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
              ) : salidas.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>-</div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin registros para este día</div>
                  <div style={{ fontSize: 12 }}>Registra la primera salida de carrito a ronda de juego</div>
                </td></tr>
              ) : salidas.map(s => {
                const carDesc = [s.cat_carritos?.marca, s.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito'
                const enRonda = !s.fecha_regreso
                const isRegreso = registrandoRegreso === s.id
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{carDesc}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                        {s.cat_carritos?.placa && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Placa {s.cat_carritos.placa}</span>}
                        {s.cat_carritos?.tipo && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: s.cat_carritos.tipo === 'ELECTRICO' ? '#eff6ff' : '#fffbeb', color: s.cat_carritos.tipo === 'ELECTRICO' ? '#1d4ed8' : '#92400e', fontWeight: 600 }}>
                            {s.cat_carritos.tipo === 'ELECTRICO' ? '⚡ Eléctrico' : '⛽ Combustión'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{nc(s.cat_socios)}</div>
                      {s.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{s.cat_socios.numero_socio}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {s.ctrl_pensiones?.cat_slots ? `Cajón ${s.ctrl_pensiones.cat_slots.numero}` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={11} style={{ color: '#16a34a' }} />
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtHora(s.fecha_salida)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtFecha(s.fecha_salida)}</div>
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {s.fecha_regreso ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={11} style={{ color: '#64748b' }} />
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtHora(s.fecha_regreso)}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#16a34a' }}>En ronda</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.usuario_registra ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {enRonda && puedeEscribir && (
                        <button
                          className="btn-ghost"
                          style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: '#2563eb', opacity: isRegreso ? 0.5 : 1 }}
                          onClick={() => registrarRegreso(s.id)}
                          disabled={isRegreso}
                          title="Registrar regreso a motor lobby">
                          <LogIn size={13} /> Regreso
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <SalidaCarritoModal onClose={() => setShowModal(false)} onSaved={handleSaved} />}
    </div>
  )
}
