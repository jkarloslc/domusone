'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCfg, type Lote } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, MapPin,
  ChevronLeft, ChevronRight, X, Edit2, Trash2, Eye, Users, MapPinned, List
} from 'lucide-react'
import Link from 'next/link'
import LoteModal from './LoteModal'
import LoteDetail from './LoteDetail'
import HistorialPropietarios from './HistorialPropietarios'
import { useAuth } from '@/lib/AuthContext'

// ── Tabs compartidos ─────────────────────────────────────────
function LotesTabs() {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
      {[
        { href: '/lotes', label: 'Catálogo', icon: List },
        { href: '/lotes/expediente', label: 'Expediente de Lote', icon: MapPinned },
      ].map(t => {
        const Icon = t.icon
        const active = t.href === '/lotes'
        return (
          <Link key={t.href} href={t.href}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px',
              fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -2, textDecoration: 'none', transition: 'all 0.15s',
            }}>
            <Icon size={14} />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  'Vendido':   'badge-vendido',
  'Libre':     'badge-libre',
  'Bloqueado': 'badge-bloqueado',
}

const PAGE_SIZE = 20

export default function LotesPage({ embedded }: { embedded?: boolean }) {
  const { canWrite, canDelete } = useAuth()
  const [lotes, setLotes]               = useState<Lote[]>([])
  const [secciones, setSecciones]       = useState<Record<number, string>>({})
  const [clasificaciones, setClasifs]   = useState<Record<number, string>>({})
  const [total, setTotal]               = useState(0)
  const [page, setPage]               = useState(0)
  const [search, setSearch]           = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilter]     = useState('')
  const [filterDir, setFilterDir]     = useState('')
  const debouncedDir = useDebounce(filterDir, 300)
  const [loading, setLoading]         = useState(true)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editing, setEditing]         = useState<Lote | null>(null)
  const [detail, setDetail]           = useState<Lote | null>(null)
  const [deleting, setDeleting]       = useState<number | null>(null)
  const [historial, setHistorial]     = useState<Lote | null>(null)

  // Cargar secciones una sola vez (cross-schema, no se puede hacer join en Supabase)
  useEffect(() => {
    dbCfg.from('secciones').select('id, nombre').eq('activo', true)
      .then(({ data }) => {
        const map: Record<number, string> = {}
        ;(data ?? []).forEach((s: any) => { map[s.id] = s.nombre })
        setSecciones(map)
      })
    dbCfg.from('clasificacion').select('id, nombre').eq('activo', true)
      .then(({ data }) => {
        const map: Record<number, string> = {}
        ;(data ?? []).forEach((c: any) => { map[c.id] = c.nombre })
        setClasifs(map)
      })
  }, [])

  const fetchLotes = useCallback(async () => {
    setLoading(true)
    let q = dbCat
      .from('lotes')
      .select('*', { count: 'exact' })
      .order('cve_lote', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (debouncedSearch) q = q.ilike('cve_lote', `%${debouncedSearch}%`)
    if (filterStatus)    q = q.eq('status_lote', filterStatus)
    if (debouncedDir)    q = q.or(`calle.ilike.%${debouncedDir}%,numero.ilike.%${debouncedDir}%`)

    const { data, count, error } = await q
    if (!error) {
      setLotes(data as Lote[])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [page, debouncedSearch, filterStatus, debouncedDir])

  useEffect(() => { fetchLotes() }, [fetchLotes])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este lote? Esta acción no se puede deshacer.')) return
    setDeleting(id)
    await dbCat.from('lotes').delete().eq('id', id)
    setDeleting(null)
    fetchLotes()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Tabs (solo en ruta directa /lotes, no cuando está embebido en /residencial) */}
      {!embedded && <LotesTabs />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <MapPin size={16} style={{ color: 'var(--gold)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Catálogo de Lotes
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            {total} lotes registrados
          </p>
        </div>
        {canWrite('lotes') && <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <Plus size={14} /> Nuevo Lote
        </button>}
      </div>

      {/* Stats rápidas */}
      <StatsRow lotes={lotes} />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Buscar clave, tipo…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Calle o número…"
            value={filterDir}
            onChange={e => { setFilterDir(e.target.value); setPage(0) }}
          />
          {filterDir && (
            <button onClick={() => setFilterDir('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <select
          className="select"
          style={{ width: 160 }}
          value={filterStatus}
          onChange={e => { setFilter(e.target.value); setPage(0) }}
        >
          <option value="">Todos los status</option>
          <option value="Libre">Libre</option>
          <option value="Vendido">Vendido</option>
          <option value="Bloqueado">Bloqueado</option>
        </select>

        <button className="btn-ghost" onClick={fetchLotes} title="Actualizar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Clave Lote</th>
                <th>Clasificación</th>
                <th>Sección</th>
                <th>Dirección</th>
                <th>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : lotes.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  No se encontraron lotes
                </td></tr>
              ) : lotes.map(l => {
                const dir = [l.calle, l.numero, l.Diferenciador, l.manzana].filter(Boolean).join(' ') || '—'
                return (
                <tr key={l.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold-light)' }}>
                      {l.cve_lote ?? `#${l.lote}`}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {(l as any).id_clasificacion_fk ? (clasificaciones[(l as any).id_clasificacion_fk] ?? '—') : '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {l.id_seccion_fk ? (secciones[l.id_seccion_fk] ?? '—') : '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{dir}</td>
                  <td>
                    <span className={`badge ${STATUS_COLORS[l.status_lote ?? ''] ?? 'badge-default'}`}>
                      {l.status_lote ?? 'Sin status'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(l)} title="Ver detalle">
                        <Eye size={13} />
                      </button>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setHistorial(l)} title="Historial de propietarios">
                        <Users size={13} />
                      </button>
                      {canWrite('lotes') && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(l); setModalOpen(true) }} title="Editar">
                        <Edit2 size={13} />
                      </button>}
                      {canDelete() && <button
                        className="btn-ghost"
                        style={{ padding: '4px 6px', color: deleting === l.id ? 'var(--text-muted)' : undefined }}
                        onClick={() => handleDelete(l.id)}
                        title="Eliminar"
                        disabled={deleting === l.id}
                      >
                        <Trash2 size={13} />
                      </button>}
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderTop: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Página {page + 1} de {totalPages} · {total} registros
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={13} />
              </button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal alta/edición */}
      {modalOpen && (
        <LoteModal
          lote={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchLotes() }}
        />
      )}

      {/* Panel detalle */}
      {detail && (
        <LoteDetail lote={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); setModalOpen(true) }} />
      )}

      {historial && (
        <HistorialPropietarios
          loteId={historial.id}
          cveLote={historial.cve_lote ?? `#${historial.lote}`}
          onClose={() => setHistorial(null)}
        />
      )}
    </div>
  )
}

// ── Stats rápidas ────────────────────────────────────────────
function StatsRow({ lotes }: { lotes: Lote[] }) {
  const vendidos   = lotes.filter(l => l.status_lote === 'Vendido').length
  const libres     = lotes.filter(l => l.status_lote === 'Libre').length
  const bloqueados = lotes.filter(l => l.status_lote === 'Bloqueado').length

  const stats = [
    { label: 'En esta página', value: lotes.length,  color: 'var(--text-primary)' },
    { label: 'Vendidos',       value: vendidos,       color: '#4ade80' },
    { label: 'Libres',         value: libres,         color: '#60a5fa' },
    { label: 'Bloqueados',     value: bloqueados,     color: '#f87171' },
  ]

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
      {stats.map(s => (
        <div key={s.label} className="card" style={{ padding: '12px 18px', minWidth: 110 }}>
          <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 400, color: s.color }}>{s.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}