'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import ReservacionModal from './ReservacionModal'

type Reservacion = {
  id: number
  fecha_reservacion: string
  hora_reservacion: string
  num_jugadores: number
  carro_golf: boolean
  monto: number | null
  monto_carro_golf: number | null
  observaciones: string | null
  cancelado: boolean
  es_externo: boolean
  nombre_externo: string | null
  telefono_externo: string | null
  cat_socios?: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_espacios_deportivos?: { nombre: string } | null
  cat_formas_juego?: { nombre: string } | null
}

type Espacio = { id: number; nombre: string }

const fmt$ = (v: number | null) => v ? `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'

const addDays = (dateStr: string, n: number) => {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

const fmtFechaLarga = (dateStr: string) =>
  new Date(dateStr + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const fmtHora = (h: string) => h.slice(0, 5)

export default function ReservacionesPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-reservaciones')

  const [reservaciones, setReservaciones] = useState<Reservacion[]>([])
  const [espacios, setEspacios]           = useState<Espacio[]>([])
  const [loading, setLoading]             = useState(true)
  const [showModal, setShowModal]         = useState(false)
  const [cancelando, setCancelando]       = useState<number | null>(null)

  const hoy = new Date().toISOString().split('T')[0]
  const [fecha, setFecha]                 = useState(hoy)
  const [filtroEspacio, setFiltroEspacio] = useState<number | ''>('')
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false)

  const [stats, setStats] = useState({ total: 0, jugadores: 0, carros: 0, monto: 0 })

  const fetchReservaciones = useCallback(async () => {
    setLoading(true)
    let q = dbGolf
      .from('ctrl_reservaciones')
      .select(`
        id, fecha_reservacion, hora_reservacion, num_jugadores,
        carro_golf, monto, monto_carro_golf, observaciones, cancelado,
        es_externo, nombre_externo, telefono_externo,
        cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
        cat_espacios_deportivos(nombre),
        cat_formas_juego(nombre)
      `)
      .eq('fecha_reservacion', fecha)
      .order('hora_reservacion', { ascending: true })

    if (filtroEspacio) q = q.eq('id_espacio_fk', filtroEspacio)
    if (!mostrarCanceladas) q = q.eq('cancelado', false)

    const { data } = await q
    const all = (data as unknown as Reservacion[]) ?? []

    const activas = all.filter(r => !r.cancelado)
    setStats({
      total:     activas.length,
      jugadores: activas.reduce((s, r) => s + (r.num_jugadores ?? 0), 0),
      carros:    activas.filter(r => r.carro_golf).length,
      monto:     activas.reduce((s, r) => s + (r.monto ?? 0) + (r.monto_carro_golf ?? 0), 0),
    })

    setReservaciones(all)
    setLoading(false)
  }, [fecha, filtroEspacio, mostrarCanceladas])

  useEffect(() => { fetchReservaciones() }, [fetchReservaciones])

  useEffect(() => {
    dbGolf.from('cat_espacios_deportivos').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setEspacios(data ?? []))
  }, [])

  const cancelar = async (id: number) => {
    if (!confirm('¿Cancelar esta reservación?')) return
    setCancelando(id)
    await dbGolf.from('ctrl_reservaciones').update({ cancelado: true, fecha_cancelacion: new Date().toISOString() }).eq('id', id)
    setCancelando(null)
    fetchReservaciones()
  }

  const handleSaved = () => { setShowModal(false); fetchReservaciones() }
  const esHoy = fecha === hoy

  const nc = (r: Reservacion) => r.es_externo
    ? (r.nombre_externo || 'Visitante')
    : r.cat_socios ? [r.cat_socios.nombre, r.cat_socios.apellido_paterno, r.cat_socios.apellido_materno].filter(Boolean).join(' ') : '—'

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
            <span style={{ color: '#475569', fontWeight: 500 }}>Reservaciones</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Reservaciones
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchReservaciones} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nueva Reservación
            </button>
          )}
        </div>
      </div>

      {/* Navegación de fecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 6px' }}>
          <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setFecha(f => addDays(f, -1))}>
            <ChevronLeft size={15} />
          </button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ padding: '5px 8px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }} />
          <button className="btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setFecha(f => addDays(f, 1))}>
            <ChevronRight size={15} />
          </button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
          {fmtFechaLarga(fecha)}
          {esHoy && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#16a34a' }}>HOY</span>}
        </div>
        {!esHoy && (
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setFecha(hoy)}>← Hoy</button>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Reservaciones', value: stats.total,              color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Jugadores',     value: stats.jugadores,          color: '#2563eb', bg: '#eff6ff' },
          { label: 'Carros',        value: stats.carros,             color: '#0891b2', bg: '#ecfeff' },
          { label: 'Monto Total',   value: fmt$(stats.monto),        color: '#16a34a', bg: '#f0fdf4' },
        ].map(card => (
          <div key={card.label} className="card" style={{ flex: '1 1 140px', maxWidth: 200, padding: '12px 16px', background: card.bg, border: `1px solid ${card.color}22` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filtroEspacio} onChange={e => setFiltroEspacio(e.target.value ? Number(e.target.value) : '')}
          style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }}>
          <option value="">Todos los espacios</option>
          {espacios.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarCanceladas} onChange={e => setMostrarCanceladas(e.target.checked)} />
          Mostrar canceladas
        </label>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                {['Hora', 'Socio / Visitante', 'Espacio', 'Forma de Juego', 'Jugadores', 'Carro', 'Monto', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
              ) : reservaciones.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin reservaciones para este día</div>
                  <div style={{ fontSize: 12 }}>Crea la primera reservación del día</div>
                </td></tr>
              ) : reservaciones.map(r => {
                const montoTotal = (r.monto ?? 0) + (r.carro_golf ? (r.monto_carro_golf ?? 0) : 0)
                return (
                  <tr key={r.id}
                    style={{ borderBottom: '1px solid var(--border)', opacity: r.cancelado ? 0.5 : 1, transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                    <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: r.cancelado ? '#94a3b8' : 'var(--text-primary)' }}>{fmtHora(r.hora_reservacion)}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{nc(r)}</div>
                      {!r.es_externo && r.cat_socios?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{r.cat_socios.numero_socio}</div>}
                      {r.es_externo && r.telefono_externo && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.telefono_externo}</div>}
                      {r.es_externo && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: '#fff7ed', color: '#c2410c', fontWeight: 600 }}>Visitante</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {r.cat_espacios_deportivos?.nombre ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {r.cat_formas_juego?.nombre ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {r.num_jugadores}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {r.carro_golf
                        ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#ecfeff', color: '#0891b2', fontWeight: 600 }}>Sí</span>
                        : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#16a34a', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {montoTotal > 0 ? fmt$(montoTotal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {r.cancelado
                        ? <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>Cancelada</span>
                        : <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a', fontWeight: 600 }}>Activa</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {!r.cancelado && puedeEscribir && (
                        <button className="btn-ghost"
                          style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5, opacity: cancelando === r.id ? 0.5 : 1 }}
                          onClick={() => cancelar(r.id)} disabled={cancelando === r.id}>
                          <X size={13} /> Cancelar
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

      {showModal && <ReservacionModal fecha={fecha} onClose={() => setShowModal(false)} onSaved={handleSaved} />}
    </div>
  )
}
