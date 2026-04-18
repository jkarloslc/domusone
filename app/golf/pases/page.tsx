'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, ChevronLeft, Tag, Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import PaseModal from './PaseModal'

type LotePase = {
  id: number
  cantidad_otorgada: number
  cantidad_usada: number
  cantidad_disponible: number
  periodo: string | null
  fecha_inicio: string
  fecha_vencimiento: string
  observaciones: string | null
  cat_pases_config?: { nombre: string } | null
}

type SocioConPases = {
  id: number
  numero_socio: string | null
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  cat_categorias_socios?: { nombre: string } | null
  pases: LotePase[]
  total_disponibles: number
  total_usados: number
}

type Movimiento = {
  id: number
  tipo: string
  cantidad: number
  motivo: string | null
  created_at: string
  ctrl_accesos?: { fecha_entrada: string } | null
}

const hoy = new Date().toISOString().split('T')[0]

const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

const vencido = (d: string) => d < hoy
const porVencer = (d: string) => {
  const dias = Math.ceil((new Date(d + 'T12:00:00').getTime() - new Date(hoy + 'T12:00:00').getTime()) / 86400000)
  return dias >= 0 && dias <= 7
}

export default function PasesPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-pases')

  const [socios, setSocios]         = useState<SocioConPases[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [busqueda, setBusqueda]     = useState('')
  const [soloActivos, setSoloActivos] = useState(true)

  // detalle expandido por socio
  const [expandido, setExpandido]   = useState<number | null>(null)
  const [movimientos, setMovimientos] = useState<Record<number, Movimiento[]>>({})
  const [loadingMov, setLoadingMov] = useState<number | null>(null)

  const [stats, setStats] = useState({ socios: 0, disponibles: 0, usados: 0, vencidos: 0 })

  const fetchPases = useCallback(async () => {
    setLoading(true)

    // Traer socios activos con sus lotes de pases vigentes (o todos si !soloActivos)
    const { data: sociosData } = await dbGolf
      .from('cat_socios')
      .select('id, numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre)')
      .eq('activo', true)
      .order('apellido_paterno', { ascending: true })

    if (!sociosData) { setLoading(false); return }

    // Traer todos los lotes de pases
    let q = dbGolf
      .from('ctrl_pases')
      .select('id, id_socio_fk, cantidad_otorgada, cantidad_usada, cantidad_disponible, periodo, fecha_inicio, fecha_vencimiento, observaciones, cat_pases_config(nombre)')
      .order('fecha_vencimiento', { ascending: false })

    if (soloActivos) q = q.gte('fecha_vencimiento', hoy)

    const { data: pasesData } = await q

    // Agrupar pases por socio
    const pasesPorSocio: Record<number, LotePase[]> = {}
    for (const p of (pasesData ?? [])) {
      if (!pasesPorSocio[p.id_socio_fk]) pasesPorSocio[p.id_socio_fk] = []
      pasesPorSocio[p.id_socio_fk].push(p as LotePase)
    }

    // Solo socios con pases (o todos si !soloActivos)
    const resultado: SocioConPases[] = (sociosData as any[])
      .map(s => ({
        ...s,
        pases: pasesPorSocio[s.id] ?? [],
        total_disponibles: (pasesPorSocio[s.id] ?? []).reduce((a: number, p: LotePase) => a + (p.cantidad_disponible ?? 0), 0),
        total_usados: (pasesPorSocio[s.id] ?? []).reduce((a: number, p: LotePase) => a + p.cantidad_usada, 0),
      }))
      .filter(s => soloActivos ? s.pases.length > 0 : true)

    setSocios(resultado)

    // Stats
    const conPases = resultado.filter(s => s.pases.length > 0)
    const totalDisp = conPases.reduce((a, s) => a + s.total_disponibles, 0)
    const totalUsados = conPases.reduce((a, s) => a + s.total_usados, 0)
    const vencidos = (pasesData ?? []).filter((p: any) => vencido(p.fecha_vencimiento) && p.cantidad_disponible > 0).length
    setStats({ socios: conPases.length, disponibles: totalDisp, usados: totalUsados, vencidos })

    setLoading(false)
  }, [soloActivos])

  useEffect(() => { fetchPases() }, [fetchPases])

  const toggleExpand = async (socioId: number) => {
    if (expandido === socioId) { setExpandido(null); return }
    setExpandido(socioId)
    if (movimientos[socioId]) return

    setLoadingMov(socioId)
    const { data } = await dbGolf
      .from('ctrl_pases_movimientos')
      .select('id, tipo, cantidad, motivo, created_at, ctrl_accesos(fecha_entrada)')
      .eq('id_socio_fk', socioId)
      .order('created_at', { ascending: false })
      .limit(20)
    setMovimientos(m => ({ ...m, [socioId]: (data as Movimiento[]) ?? [] }))
    setLoadingMov(null)
  }

  const sociosFiltrados = socios.filter(s => {
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    const nombre = [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ').toLowerCase()
    return nombre.includes(q) || (s.numero_socio ?? '').includes(q)
  })

  const badgePase = (p: LotePase) => {
    if (vencido(p.fecha_vencimiento)) return { bg: '#fef2f2', color: '#dc2626', label: 'Vencido' }
    if (porVencer(p.fecha_vencimiento)) return { bg: '#fff7ed', color: '#c2410c', label: 'Por vencer' }
    if (p.cantidad_disponible <= 0) return { bg: '#f1f5f9', color: '#64748b', label: 'Agotado' }
    return { bg: '#f0fdf4', color: '#16a34a', label: 'Vigente' }
  }

  const tipoMovColor: Record<string, string> = {
    ASIGNACION: '#16a34a',
    CONSUMO:    '#dc2626',
    AJUSTE:     '#d97706',
  }

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/golf" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', textDecoration: 'none', fontSize: 12, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#2563eb'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#94a3b8'}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span style={{ fontSize: 12, color: '#cbd5e1' }}>/</span>
            <Tag size={13} style={{ color: '#d97706' }} />
            <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pases</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Pases de Invitación
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchPases} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#d97706' }}>
              <Plus size={14} /> Asignar Pases
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Socios con Pases', value: stats.socios,      color: '#d97706', bg: '#fffbeb' },
          { label: 'Disponibles',      value: stats.disponibles,  color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Usados',           value: stats.usados,       color: '#2563eb', bg: '#eff6ff' },
          { label: 'Lotes Vencidos',   value: stats.vencidos,     color: '#dc2626', bg: '#fef2f2' },
        ].map(card => (
          <div key={card.label} className="card" style={{ flex: '1 1 140px', maxWidth: 200, padding: '12px 16px', background: card.bg, border: `1px solid ${card.color}22` }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            style={{ width: '100%', padding: '7px 10px 7px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#1e293b', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            placeholder="Buscar socio…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} />
          Solo pases vigentes
        </label>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</div>
      ) : sociosFiltrados.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin pases registrados</div>
          <div style={{ fontSize: 12 }}>Asigna pases a los socios del club</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sociosFiltrados.map(s => {
            const nombreS = [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')
            const abierto = expandido === s.id
            const movsSocio = movimientos[s.id] ?? []

            return (
              <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${s.total_disponibles > 0 ? '#fde68a' : '#e2e8f0'}` }}>

                {/* Fila principal */}
                <div
                  onClick={() => toggleExpand(s.id)}
                  style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', flexWrap: 'wrap' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fffbeb'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}
                >
                  {/* Expand icon */}
                  <div style={{ color: '#94a3b8', flexShrink: 0 }}>
                    {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </div>

                  {/* Nombre */}
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{nombreS}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                      {s.numero_socio && `#${s.numero_socio} · `}{s.cat_categorias_socios?.nombre}
                    </div>
                  </div>

                  {/* Resumen pases */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: s.total_disponibles > 0 ? '#d97706' : '#94a3b8', lineHeight: 1 }}>{s.total_disponibles}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>disponibles</div>
                    </div>
                    <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: '#64748b', lineHeight: 1 }}>{s.total_usados}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>usados</div>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{s.pases.length} lote{s.pases.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>

                {/* Panel expandido */}
                {abierto && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 18px', background: '#fafafa' }}>

                    {/* Lotes de pases */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Lotes asignados</div>
                      {s.pases.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Sin lotes</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {s.pases.map(p => {
                            const badge = badgePase(p)
                            return (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 120 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                                    {p.cat_pases_config?.nombre ?? 'Pase estándar'}
                                    {p.periodo && <span style={{ fontWeight: 400, color: '#64748b' }}> — {p.periodo}</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                    {fmtFecha(p.fecha_inicio)} → {fmtFecha(p.fecha_vencimiento)}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706' }}>{p.cantidad_disponible} disp.</span>
                                  <span style={{ fontSize: 11, color: '#94a3b8' }}>/ {p.cantidad_otorgada} total</span>
                                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.color, fontWeight: 600 }}>{badge.label}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Movimientos recientes */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Últimos movimientos</div>
                      {loadingMov === s.id ? (
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Cargando…</div>
                      ) : movsSocio.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Sin movimientos</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {movsSocio.map(m => (
                            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontWeight: 700, color: tipoMovColor[m.tipo] ?? '#475569', minWidth: 80 }}>{m.tipo}</span>
                              <span style={{ fontWeight: 600, color: m.cantidad > 0 ? '#16a34a' : '#dc2626', minWidth: 30 }}>
                                {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                              </span>
                              <span style={{ color: '#64748b', flex: 1 }}>{m.motivo ?? '—'}</span>
                              <span style={{ color: '#94a3b8', flexShrink: 0 }}>
                                {new Date(m.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    {puedeEscribir && (
                      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setShowModal(true) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
                          <Plus size={12} /> Asignar más pases
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && <PaseModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchPases() }} />}
    </div>
  )
}
