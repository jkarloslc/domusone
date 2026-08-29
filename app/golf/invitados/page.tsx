'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, RefreshCw, ChevronLeft, Search, X, ChevronDown, ChevronRight, Settings, Save, Loader, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import InvitadoModal from './InvitadoModal'

type Invitado = {
  id: number
  nombre: string
  telefono: string | null
  email: string | null
  observaciones: string | null
  activo: boolean
}

type Visita = {
  id: number
  id_invitado_fk: number
  fecha_entrada: string
  anfitrion: string
}

type Politica = { id?: number; limite_anual: number }

const anioActual = new Date().getFullYear()

const fmtFecha = (d: string) =>
  new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

export default function InvitadosPage() {
  const { canWrite } = useAuth()
  const puedeEscribir = canWrite('golf-invitados')

  const [invitados, setInvitados]   = useState<Invitado[]>([])
  const [visitasPorInvitado, setVisitasPorInvitado] = useState<Record<number, Visita[]>>({})
  const [loading, setLoading]       = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [soloActivos, setSoloActivos] = useState(true)

  const [expandido, setExpandido]   = useState<number | null>(null)
  const [showModal, setShowModal]   = useState(false)
  const [editando, setEditando]     = useState<Invitado | null>(null)

  const [politica, setPolitica]           = useState<Politica>({ limite_anual: 20 })
  const [showPolitica, setShowPolitica]   = useState(false)
  const [loadingPolitica, setLoadingPolitica] = useState(false)
  const [savingPolitica, setSavingPolitica]   = useState(false)

  const fetchPolitica = useCallback(async () => {
    setLoadingPolitica(true)
    const { data } = await dbGolf.from('cfg_invitados_politica').select('id, limite_anual').order('id').limit(1).maybeSingle()
    setPolitica((data as Politica) ?? { limite_anual: 20 })
    setLoadingPolitica(false)
  }, [])

  useEffect(() => { if (showPolitica) fetchPolitica() }, [showPolitica, fetchPolitica])

  const guardarPolitica = async () => {
    setSavingPolitica(true)
    if (politica.id) {
      await dbGolf.from('cfg_invitados_politica').update({ limite_anual: politica.limite_anual, updated_at: new Date().toISOString() }).eq('id', politica.id)
    } else {
      const { data } = await dbGolf.from('cfg_invitados_politica').insert({ limite_anual: politica.limite_anual }).select('id, limite_anual').single()
      if (data) setPolitica(data as Politica)
    }
    setSavingPolitica(false)
  }

  const fetchInvitados = useCallback(async () => {
    setLoading(true)

    let q = dbGolf.from('cat_invitados').select('id, nombre, telefono, email, observaciones, activo').order('nombre')
    if (soloActivos) q = q.eq('activo', true)
    const { data: invData } = await q

    const { data: visitasData } = await dbGolf
      .from('ctrl_acceso_acomp')
      .select('id, id_invitado_fk, ctrl_accesos(fecha_entrada, cat_socios(nombre, apellido_paterno, apellido_materno))')
      .not('id_invitado_fk', 'is', null)

    const porInvitado: Record<number, Visita[]> = {}
    for (const v of (visitasData ?? []) as any[]) {
      const acc = v.ctrl_accesos
      if (!acc?.fecha_entrada) continue
      const socio = acc.cat_socios
      const anfitrion = socio ? [socio.nombre, socio.apellido_paterno, socio.apellido_materno].filter(Boolean).join(' ') : '—'
      if (!porInvitado[v.id_invitado_fk]) porInvitado[v.id_invitado_fk] = []
      porInvitado[v.id_invitado_fk].push({ id: v.id, id_invitado_fk: v.id_invitado_fk, fecha_entrada: acc.fecha_entrada, anfitrion })
    }
    for (const arr of Object.values(porInvitado)) arr.sort((a, b) => b.fecha_entrada.localeCompare(a.fecha_entrada))

    setInvitados((invData as Invitado[]) ?? [])
    setVisitasPorInvitado(porInvitado)
    setLoading(false)
  }, [soloActivos])

  useEffect(() => { fetchInvitados() }, [fetchInvitados])

  const visitasAnio = (id: number) =>
    (visitasPorInvitado[id] ?? []).filter(v => new Date(v.fecha_entrada).getFullYear() === anioActual).length

  const invitadosFiltrados = invitados.filter(i => {
    if (!busqueda.trim()) return true
    return i.nombre.toLowerCase().includes(busqueda.toLowerCase())
  })

  const stats = {
    total: invitados.length,
    enTope: invitados.filter(i => visitasAnio(i.id) >= politica.limite_anual).length,
    visitasAnio: Object.values(visitasPorInvitado).reduce((a, arr) => a + arr.filter(v => new Date(v.fecha_entrada).getFullYear() === anioActual).length, 0),
  }

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12, color: '#94a3b8' }}>
            <Link href="/golf/administracion" style={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ChevronLeft size={13} /> Club
            </Link>
            <span>/</span>
            <span style={{ color: '#475569', fontWeight: 500 }}>Invitados</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Invitados
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchInvitados} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && (
            <button className="btn-ghost" onClick={() => setShowPolitica(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Settings size={13} /> Política de Tope
            </button>
          )}
          {puedeEscribir && (
            <button className="btn-primary" onClick={() => { setEditando(null); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#d97706' }}>
              <Plus size={14} /> Nuevo Invitado
            </button>
          )}
        </div>
      </div>

      {/* Política de tope */}
      {showPolitica && puedeEscribir && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 20px', background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>Tope Anual de Visitas por Invitado</div>
          <div style={{ fontSize: 11, color: '#78716c', marginBottom: 14 }}>
            Máximo de visitas al campo por año calendario que puede acumular un mismo invitado, sumando todos los socios que lo hayan traído. Aplica igual para todo tipo de socio, e incluye tanto accesos con pase como Green Fee.
          </div>
          {loadingPolitica ? (
            <div style={{ padding: 12 }}><Loader size={16} className="animate-spin" color="#d97706" /></div>
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#92400e', marginBottom: 4, display: 'block' }}>Límite anual (visitas)</label>
                <input type="number" min={1} value={politica.limite_anual}
                  onChange={e => setPolitica(p => ({ ...p, limite_anual: Math.max(1, Number(e.target.value)) }))}
                  style={{ width: 100, padding: '7px 10px', fontSize: 13, border: '1px solid #fde68a', borderRadius: 8, fontFamily: 'inherit' }} />
              </div>
              <button onClick={guardarPolitica} disabled={savingPolitica}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, background: '#d97706', color: '#fff', cursor: 'pointer', opacity: savingPolitica ? 0.7 : 1 }}>
                {savingPolitica ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Invitados Registrados', value: stats.total,      color: '#d97706', bg: '#fffbeb' },
          { label: `Visitas ${anioActual}`,  value: stats.visitasAnio, color: '#2563eb', bg: '#eff6ff' },
          { label: 'En Tope Anual',          value: stats.enTope,      color: '#dc2626', bg: '#fef2f2' },
        ].map(card => (
          <div key={card.label} className="card" style={{ flex: '1 1 160px', maxWidth: 220, padding: '12px 16px', background: card.bg, border: `1px solid ${card.color}22` }}>
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
            placeholder="Buscar invitado…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          {busqueda && <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={12} /></button>}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                {['', 'Invitado', 'Teléfono', `Visitas ${anioActual}`, 'Visitas Históricas', 'Anfitriones'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
              ) : invitadosFiltrados.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Sin invitados registrados</div>
                  <div style={{ fontSize: 12 }}>Se dan de alta automáticamente al registrar una salida al campo, o desde &quot;Nuevo Invitado&quot;</div>
                </td></tr>
              ) : invitadosFiltrados.map(inv => {
                const abierto = expandido === inv.id
                const visitas = visitasPorInvitado[inv.id] ?? []
                const anfitriones = Array.from(new Set(visitas.map(v => v.anfitrion)))
                const vAnio = visitasAnio(inv.id)
                const alTope = vAnio >= politica.limite_anual
                return (
                  <>
                    <tr key={inv.id}
                      onClick={() => setExpandido(abierto ? null : inv.id)}
                      style={{ borderBottom: abierto ? 'none' : '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s', background: abierto ? '#fffbeb' : '' }}
                      onMouseEnter={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)' }}
                      onMouseLeave={e => { if (!abierto) (e.currentTarget as HTMLElement).style.background = '' }}>
                      <td style={{ padding: '10px 10px 10px 14px', width: 28, color: '#94a3b8' }}>
                        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{inv.nombre}</div>
                        {!inv.activo && <div style={{ fontSize: 11, color: '#94a3b8' }}>Inactivo</div>}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>{inv.telefono ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 14, padding: '2px 10px', borderRadius: 20, background: alTope ? '#fef2f2' : '#f0fdf4', color: alTope ? '#dc2626' : '#15803d' }}>
                          {alTope && <AlertTriangle size={12} />}
                          {vAnio}/{politica.limite_anual}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{visitas.length}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {anfitriones.length === 0 ? '—' : anfitriones.length === 1 ? anfitriones[0] : `${anfitriones.length} socios distintos`}
                      </td>
                    </tr>

                    {abierto && (
                      <tr key={`${inv.id}-det`}>
                        <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
                          <div style={{ padding: '16px 20px 20px 48px', background: '#fafafa' }}>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Historial de Visitas (cruzado entre socios)
                              </div>
                              {puedeEscribir && (
                                <button
                                  onClick={e => { e.stopPropagation(); setEditando(inv); setShowModal(true) }}
                                  style={{ fontSize: 12, fontWeight: 600, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
                                  Editar datos
                                </button>
                              )}
                            </div>

                            {visitas.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Sin visitas registradas</div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    {['Fecha de Acceso', 'Anfitrión (Socio)'].map(h => (
                                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {visitas.map(v => (
                                    <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '7px 10px', color: '#1e293b', whiteSpace: 'nowrap' }}>{fmtFecha(v.fecha_entrada)}</td>
                                      <td style={{ padding: '7px 10px', color: '#475569' }}>{v.anfitrion}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <InvitadoModal
          invitado={editando}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); fetchInvitados() }}
        />
      )}
    </div>
  )
}
