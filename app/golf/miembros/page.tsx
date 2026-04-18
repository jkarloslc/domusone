'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Search, RefreshCw, Eye, Edit2, Trash2, Users, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import SocioModal from './SocioModal'
import SocioDetail from './SocioDetail'
import type { Socio } from './SocioModal'

const PAGE_SIZE = 20

export default function MiembrosPage() {
  const { canWrite, canDelete } = useAuth()
  const puedeEscribir = canWrite('golf-miembros')
  const puedeEliminar = canDelete()

  const [socios, setSocios]           = useState<Socio[]>([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(0)
  const [search, setSearch]           = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading]         = useState(true)
  const [deleting, setDeleting]       = useState<number | null>(null)

  // modals
  const [showModal, setShowModal]       = useState(false)
  const [editSocio, setEditSocio]       = useState<Socio | null>(null)
  const [detailSocio, setDetailSocio]   = useState<Socio | null>(null)

  // stats
  const [stats, setStats] = useState({ total: 0, activos: 0, inactivos: 0, vencidos: 0 })

  const fetchSocios = useCallback(async () => {
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let q = dbGolf
      .from('cat_socios')
      .select('*, cat_categorias_socios(nombre)', { count: 'exact' })
      .order('apellido_paterno', { ascending: true })
      .order('nombre', { ascending: true })
      .range(from, to)

    if (search.trim()) {
      q = q.or(
        `nombre.ilike.%${search}%,apellido_paterno.ilike.%${search}%,apellido_materno.ilike.%${search}%,numero_socio.ilike.%${search}%,email.ilike.%${search}%`
      )
    }

    const { data, count } = await q
    setSocios((data as Socio[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search])

  const fetchStats = useCallback(async () => {
    const { data } = await dbGolf.from('cat_socios').select('activo, fecha_vencimiento')
    if (!data) return
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    let activos = 0, inactivos = 0, vencidos = 0
    data.forEach((s: any) => {
      if (!s.activo) { inactivos++; return }
      if (s.fecha_vencimiento && new Date(s.fecha_vencimiento) < hoy) { vencidos++ }
      else { activos++ }
    })
    setStats({ total: data.length, activos, inactivos, vencidos })
  }, [])

  useEffect(() => { fetchSocios() }, [fetchSocios])
  useEffect(() => { fetchStats() }, [fetchStats])

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const handleDelete = async (s: Socio) => {
    if (!confirm(`¿Eliminar al socio ${s.nombre} ${s.apellido_paterno ?? ''}? Esta acción no se puede deshacer.`)) return
    setDeleting(s.id)
    await dbGolf.from('cat_socios').delete().eq('id', s.id)
    setDeleting(null)
    fetchSocios()
    fetchStats()
  }

  const handleSaved = () => {
    setShowModal(false)
    setEditSocio(null)
    fetchSocios()
    fetchStats()
  }

  const openEdit = (s: Socio) => { setDetailSocio(null); setEditSocio(s); setShowModal(true) }
  const openNew  = () => { setEditSocio(null); setShowModal(true) }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const statusOf = (s: Socio) => {
    if (!s.activo) return 'inactivo'
    if (s.fecha_vencimiento && new Date(s.fecha_vencimiento) < new Date()) return 'vencido'
    return 'activo'
  }

  const badgeClass = (status: string) =>
    status === 'activo'   ? 'badge badge-libre' :
    status === 'vencido'  ? 'badge badge-pendiente' :
                            'badge badge-bloqueado'

  const badgeLabel = (status: string) =>
    status === 'activo' ? 'Activo' : status === 'vencido' ? 'Vencido' : 'Inactivo'

  return (
    <div style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Users size={14} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Club</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em' }}>
            Miembros
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => { fetchSocios(); fetchStats() }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Actualizar
          </button>
          {puedeEscribir && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Nuevo Socio
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total socios', value: stats.total, icon: Users, color: 'var(--blue)', bg: '#eff6ff' },
          { label: 'Activos',      value: stats.activos,   icon: CheckCircle, color: '#16a34a', bg: '#f0fdf4' },
          { label: 'Vencidos',     value: stats.vencidos,  icon: AlertCircle, color: '#d97706', bg: '#fffbeb' },
          { label: 'Inactivos',    value: stats.inactivos, icon: XCircle,     color: '#64748b', bg: '#f8fafc' },
        ].map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="card" style={{ flex: '1 1 140px', maxWidth: 200, padding: '14px 18px', background: card.bg, border: `1px solid ${card.color}22` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon size={14} style={{ color: card.color }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{card.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: card.color, lineHeight: 1 }}>{card.value}</div>
            </div>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 380 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            style={{
              width: '100%', padding: '8px 12px 8px 32px', fontSize: 13,
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--surface)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)', outline: 'none',
            }}
            placeholder="Buscar por nombre, número de socio, email…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        {search && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {total} resultado{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                {['#', 'Nombre', 'Categoría', 'Tarjeta', 'Vencimiento', 'Estatus', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left', fontSize: 11,
                    fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em',
                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando…</td></tr>
              ) : socios.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {search ? 'Sin resultados para la búsqueda.' : 'No hay socios registrados.'}
                </td></tr>
              ) : socios.map((s, i) => {
                const status = statusOf(s)
                const nombre = [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')
                const isDel  = deleting === s.id
                return (
                  <tr key={s.id} style={{
                    borderBottom: '1px solid var(--border)',
                    opacity: isDel ? 0.4 : 1,
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                  >
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                      {s.numero_socio ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {nombre}
                      {s.email && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.email}</div>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>
                      {s.cat_categorias_socios?.nombre ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                      {s.numero_tarjeta ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: status === 'vencido' ? '#dc2626' : 'var(--text-secondary)', fontSize: 12 }}>
                      {s.fecha_vencimiento
                        ? new Date(s.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span className={badgeClass(status)}>{badgeLabel(status)}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Ver detalle" onClick={() => setDetailSocio(s)}>
                          <Eye size={13} />
                        </button>
                        {puedeEscribir && (
                          <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Editar" onClick={() => openEdit(s)}>
                            <Edit2 size={13} />
                          </button>
                        )}
                        {puedeEliminar && (
                          <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} title="Eliminar" onClick={() => handleDelete(s)} disabled={isDel}>
                            <Trash2 size={13} />
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            padding: '12px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12, color: 'var(--text-muted)',
          }}>
            <span>Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anterior</button>
              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <SocioModal
          socio={editSocio}
          onClose={() => { setShowModal(false); setEditSocio(null) }}
          onSaved={handleSaved}
        />
      )}
      {detailSocio && (
        <SocioDetail
          socio={detailSocio}
          onClose={() => setDetailSocio(null)}
          onEdit={() => openEdit(detailSocio)}
        />
      )}
    </div>
  )
}
