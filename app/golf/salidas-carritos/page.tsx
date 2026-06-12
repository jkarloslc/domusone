'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, LogIn, LogOut, ChevronLeft, Car, Clock, Filter, Eye, Printer, BookOpen, ArrowRightLeft, Search, X } from 'lucide-react'
import Link from 'next/link'
import SalidaCarritoModal from './SalidaCarritoModal'
import BitacoraModal from './BitacoraModal'
import { abrirTicketSalidaCarrito } from './ticket'

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

type BitacoraEntry = {
  id: number
  id_carrito_fk: number
  id_socio_fk: number | null
  tipo_evento: string
  descripcion: string
  fecha_evento: string
  fecha_fin: string | null
  observaciones: string | null
  usuario_registra: string | null
}

type CarritoMini = { id: number; marca: string | null; modelo: string | null; placa: string | null; tipo: string | null }
type SocioMini   = { id: number; nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null }

type PensionBit = {
  id: number
  id_socio_fk: number
  id_carrito_fk: number
  id_slot_fk: number | null
  cat_socios: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null; numero_socio: string | null } | null
  cat_carritos: { marca: string | null; modelo: string | null; placa: string | null } | null
  cat_slots: { numero: string } | null
}

const fmtHora = (d: string) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const fmtFecha = (d: string) => new Date(d).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })
const fmtDt = (d: string) => new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const nc = (s: { nombre: string; apellido_paterno: string | null; apellido_materno: string | null } | null) =>
  s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—'

const TIPO_LABEL: Record<string, string> = {
  SALIDA_TALLER:     '🔧 Salida a Taller',
  REGRESO_TALLER:    '✅ Regreso de Taller',
  PRESTAMO_TERCERO:  '🤝 Préstamo a Tercero',
  INCIDENCIA:        '⚠️ Incidencia',
  SALIDA_DEFINITIVA: '🚗 Salida Definitiva',
}
const TIPO_COLOR: Record<string, { color: string; bg: string }> = {
  SALIDA_TALLER:     { color: '#d97706', bg: '#fffbeb' },
  REGRESO_TALLER:    { color: '#15803d', bg: '#f0fdf4' },
  PRESTAMO_TERCERO:  { color: '#2563eb', bg: '#eff6ff' },
  INCIDENCIA:        { color: '#dc2626', bg: '#fef2f2' },
  SALIDA_DEFINITIVA: { color: '#7c3aed', bg: '#f5f3ff' },
}

type Tab = 'salidas' | 'bitacora'

export default function SalidasCarritosPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-carritos')

  const [tab, setTab] = useState<Tab>('salidas')

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

  // ── Bitácora ──────────────────────────────────────────────
  const [entriesBit, setEntriesBit]     = useState<BitacoraEntry[]>([])
  const [loadingBit, setLoadingBit]     = useState(false)
  const [carritosMap, setCarritosMap]   = useState<Record<number, CarritoMini>>({})
  const [sociosMap, setSociosMap]       = useState<Record<number, SocioMini>>({})
  const [busquedaBit, setBusquedaBit]   = useState('')
  const [filtroTipoBit, setFiltroTipoBit] = useState('')
  const [pensionesBit, setPensionesBit] = useState<PensionBit[]>([])
  const [showNuevaBitacora, setShowNuevaBitacora] = useState(false)
  const [showBitacora, setShowBitacora] = useState<{ idCarrito: number; idPension: number | null; idSlot: number | null; idSocio: number | null; nombreSocio: string; descCarrito: string } | null>(null)

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

  const fetchBitacora = useCallback(async () => {
    setLoadingBit(true)
    const [{ data: bData }, { data: pData }] = await Promise.all([
      dbGolf.from('bitacora_carritos')
        .select('id, id_carrito_fk, id_socio_fk, tipo_evento, descripcion, fecha_evento, fecha_fin, observaciones, usuario_registra')
        .order('fecha_evento', { ascending: false })
        .limit(500),
      dbGolf.from('ctrl_pensiones')
        .select(`id, id_socio_fk, id_carrito_fk, id_slot_fk,
          cat_socios(nombre, apellido_paterno, apellido_materno, numero_socio),
          cat_carritos(marca, modelo, placa),
          cat_slots(numero)`)
        .eq('activo', true),
    ])
    const entries = (bData as unknown as BitacoraEntry[]) ?? []
    setEntriesBit(entries)
    // Orden por número de cajón/slot (numérico), sin cajón al final, luego por nombre
    const parseCajon = (p: PensionBit) => {
      if (!p.cat_slots) return Number.MAX_SAFE_INTEGER
      const n = parseInt(p.cat_slots.numero, 10)
      return isNaN(n) ? Number.MAX_SAFE_INTEGER - 1 : n
    }
    const pensiones = ((pData as unknown as PensionBit[]) ?? [])
      .sort((a, b) => {
        const diff = parseCajon(a) - parseCajon(b)
        if (diff !== 0) return diff
        if (a.cat_slots && b.cat_slots) return a.cat_slots.numero.localeCompare(b.cat_slots.numero, 'es', { numeric: true })
        return nc(a.cat_socios).localeCompare(nc(b.cat_socios))
      })
    setPensionesBit(pensiones)

    // Resolver carrito y socio de cada entrada por ID (sin depender de joins)
    const idsCarrito = Array.from(new Set(entries.map(e => e.id_carrito_fk)))
    const idsSocio   = Array.from(new Set(entries.map(e => e.id_socio_fk).filter((v): v is number => v != null)))
    const [{ data: cData }, { data: sData }] = await Promise.all([
      idsCarrito.length
        ? dbGolf.from('cat_carritos').select('id, marca, modelo, placa, tipo').in('id', idsCarrito)
        : Promise.resolve({ data: [] as CarritoMini[] }),
      idsSocio.length
        ? dbGolf.from('cat_socios').select('id, nombre, apellido_paterno, apellido_materno, numero_socio').in('id', idsSocio)
        : Promise.resolve({ data: [] as SocioMini[] }),
    ])
    const cMap: Record<number, CarritoMini> = {}
    ;((cData as CarritoMini[]) ?? []).forEach(c => { cMap[c.id] = c })
    const sMap: Record<number, SocioMini> = {}
    ;((sData as SocioMini[]) ?? []).forEach(s => { sMap[s.id] = s })
    setCarritosMap(cMap)
    setSociosMap(sMap)
    setLoadingBit(false)
  }, [])

  useEffect(() => { if (tab === 'bitacora') fetchBitacora() }, [tab, fetchBitacora])

  const registrarRegreso = async (id: number) => {
    if (!confirm('¿Confirmar regreso del carrito a motor lobby?')) return
    setRegistrandoRegreso(id)
    await dbGolf.from('ctrl_salidas_carritos').update({ fecha_regreso: new Date().toISOString() }).eq('id', id)
    setRegistrandoRegreso(null)
    fetchSalidas()
  }

  const handleSaved = () => { setShowModal(false); fetchSalidas() }

  const abrirTicket = (s: Salida, autoPrint: boolean) => {
    abrirTicketSalidaCarrito({
      id:               s.id,
      fecha_salida:     s.fecha_salida,
      fecha_regreso:    s.fecha_regreso,
      carrito:          [s.cat_carritos?.marca, s.cat_carritos?.modelo].filter(Boolean).join(' ') || 'Carrito',
      placa:            s.cat_carritos?.placa ?? null,
      tipo:             s.cat_carritos?.tipo ?? null,
      cajon:            s.ctrl_pensiones?.cat_slots ? `Cajón ${s.ctrl_pensiones.cat_slots.numero}` : null,
      socio:            nc(s.cat_socios),
      numero_socio:     s.cat_socios?.numero_socio ?? null,
      observaciones:    s.observaciones,
      usuario_registra: s.usuario_registra,
    }, autoPrint)
  }

  const entriesBitF = entriesBit.filter(e => {
    if (filtroTipoBit && e.tipo_evento !== filtroTipoBit) return false
    if (busquedaBit.trim()) {
      const q = busquedaBit.toLowerCase()
      const car = carritosMap[e.id_carrito_fk]
      const socio = e.id_socio_fk != null ? sociosMap[e.id_socio_fk] : null
      const carDesc = [car?.marca, car?.modelo, car?.placa].filter(Boolean).join(' ').toLowerCase()
      const socioDesc = socio ? nc(socio).toLowerCase() : ''
      if (!carDesc.includes(q) && !socioDesc.includes(q) && !e.descripcion.toLowerCase().includes(q)) return false
    }
    return true
  })

  const esHoy = fecha === localToday()

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'salidas',  label: 'Entrada / Salida', icon: ArrowRightLeft },
    { key: 'bitacora', label: 'Bitácora',          icon: BookOpen       },
  ]

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
            <span style={{ color: '#475569', fontWeight: 500 }}>Entrada / Salida y Bitácora de Carritos</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Entrada / Salida y Bitácora de Carritos
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => tab === 'salidas' ? fetchSalidas() : fetchBitacora()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && tab === 'salidas' && (
            <button className="btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669' }}>
              <Plus size={14} /> Registrar Salida
            </button>
          )}
          {puedeEscribir && tab === 'bitacora' && (
            <button className="btn-primary" onClick={() => setShowNuevaBitacora(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#059669' }}>
              <Plus size={14} /> Nuevo registro
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', fontSize: 13, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#059669' : '#94a3b8',
              borderBottom: tab === t.key ? '2px solid #059669' : '2px solid transparent',
              marginBottom: -1,
            }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ── TAB: ENTRADA / SALIDA ─────────────────────────── */}
      {tab === 'salidas' && (
        <>
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
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button
                              className="btn-ghost"
                              style={{ padding: '4px 6px', color: '#64748b' }}
                              onClick={() => abrirTicket(s, false)}
                              title="Consultar ticket">
                              <Eye size={13} />
                            </button>
                            <button
                              className="btn-ghost"
                              style={{ padding: '4px 6px', color: '#64748b' }}
                              onClick={() => abrirTicket(s, true)}
                              title="Reimprimir ticket">
                              <Printer size={13} />
                            </button>
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
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── TAB: BITÁCORA ─────────────────────────────────── */}
      {tab === 'bitacora' && (
        <>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: '1 1 160px', maxWidth: 220, padding: '14px 18px', background: '#eff6ff', border: '1px solid #2563eb22' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <BookOpen size={14} style={{ color: '#2563eb' }} />
                <span style={{ fontSize: 11, color: '#64748b' }}>Registros</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb', lineHeight: 1 }}>{loadingBit ? '—' : entriesBit.length}</div>
            </div>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Buscar carrito, socio o descripción…" value={busquedaBit} onChange={e => setBusquedaBit(e.target.value)} />
              {busquedaBit && <button onClick={() => setBusquedaBit('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
            </div>
            <select
              value={filtroTipoBit}
              onChange={e => setFiltroTipoBit(e.target.value)}
              style={{ padding: '7px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', outline: 'none', fontFamily: 'inherit' }}>
              <option value="">Todos los tipos</option>
              {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Tabla */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                    {['Carrito', 'Socio', 'Tipo', 'Descripción', 'Fecha'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingBit ? (
                    <tr><td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
                  ) : entriesBitF.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin registros en bitácora</div>
                      <div style={{ fontSize: 12 }}>Usa "Nuevo registro" para agregar el primero</div>
                    </td></tr>
                  ) : entriesBitF.map(e => {
                    const tc = TIPO_COLOR[e.tipo_evento] ?? { color: '#475569', bg: '#f8fafc' }
                    const car = carritosMap[e.id_carrito_fk]
                    const socio = e.id_socio_fk != null ? sociosMap[e.id_socio_fk] : null
                    const carDesc = car ? ([car.marca, car.modelo].filter(Boolean).join(' ') || 'Carrito') : `Carrito #${e.id_carrito_fk}`
                    return (
                      <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{carDesc}</div>
                          {car?.placa && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Placa {car.placa}</div>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{socio ? nc(socio) : '—'}</div>
                          {socio?.numero_socio && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{socio.numero_socio}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: tc.bg, color: tc.color }}>
                            {TIPO_LABEL[e.tipo_evento] ?? e.tipo_evento}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-primary)', maxWidth: 240 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.descripcion}</div>
                          {e.observaciones && <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 2 }}>{e.observaciones}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {fmtDt(e.fecha_evento)}
                          {e.fecha_fin && <div style={{ fontSize: 10, color: '#94a3b8' }}>→ {fmtDt(e.fecha_fin)}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showModal && <SalidaCarritoModal onClose={() => setShowModal(false)} onSaved={handleSaved} />}

      {showNuevaBitacora && (
        <BitacoraModal
          pensiones={pensionesBit}
          onClose={() => setShowNuevaBitacora(false)}
          onSaved={() => { setShowNuevaBitacora(false); fetchBitacora() }}
        />
      )}

      {showBitacora && (
        <BitacoraModal
          idCarrito={showBitacora.idCarrito}
          idPension={showBitacora.idPension}
          idSlot={showBitacora.idSlot}
          idSocio={showBitacora.idSocio}
          nombreSocio={showBitacora.nombreSocio}
          descCarrito={showBitacora.descCarrito}
          onClose={() => setShowBitacora(null)}
          onSaved={() => {
            setShowBitacora(null)
            fetchBitacora()
          }}
        />
      )}
    </div>
  )
}
