'use client'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/lib/useDebounce'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, type Propietario } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, Users,
  Edit2, Trash2, Eye, X, ChevronLeft, ChevronRight, Phone, Mail
} from 'lucide-react'
import PropietarioModal from './PropietarioModal'
import PropietarioDetail from './PropietarioDetail'

const PAGE_SIZE = 20

export default function PropietariosPage() {
  const { canWrite, canDelete } = useAuth()
  const [propietarios, setPropietarios] = useState<Propietario[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(0)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Propietario | null>(null)
  const [detail, setDetail]       = useState<Propietario | null>(null)
  const [deleting, setDeleting]   = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCat
      .from('propietarios')
      .select('*', { count: 'exact' })
      .order('apellido_paterno', { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (debouncedSearch) q = q.or(
      `nombre.ilike.%${debouncedSearch}%,apellido_paterno.ilike.%${debouncedSearch}%,rfc.ilike.%${debouncedSearch}%`
    )

    const { data, count, error } = await q
    if (!error) { setPropietarios(data as Propietario[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este propietario? Esta acción no se puede deshacer.')) return
    setDeleting(id)
    await dbCat.from('propietarios').delete().eq('id', id)
    setDeleting(null)
    fetchData()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Users size={16} style={{ color: 'var(--gold)' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl" style={{ fontWeight: 400 }}>
            Propietarios
          </h1>
          <p className="page-subtitle">
            {total} propietarios registrados
          </p>
        </div>
        {canWrite('propietarios') && (
          <div className="page-header-actions">
            <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
              <Plus size={14} /> Nuevo Propietario
            </button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: 30 }}
            placeholder="Buscar nombre, RFC…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>RFC</th>
                <th>Contacto</th>
                <th>Estado Civil</th>
                <th>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : propietarios.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  No se encontraron propietarios
                </td></tr>
              ) : propietarios.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {[p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')}
                    </div>
                    {(p as any).razon_social && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(p as any).razon_social}</div>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${(p as any).tipo_persona === 'Moral' ? 'badge-bloqueado' : 'badge-libre'}`}>
                      {(p as any).tipo_persona ?? 'Física'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {p.rfc ?? '—'}
                  </td>
                  <td><ContactoCell id={p.id} /></td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {(p as any).estado_civil ?? '—'}
                  </td>
                  <td>
                    <span className={`badge ${p.activo ? 'badge-vendido' : 'badge-bloqueado'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(p)} title="Ver detalle">
                        <Eye size={13} />
                      </button>
                      {canWrite('propietarios') && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(p); setModalOpen(true) }} title="Editar">
                        <Edit2 size={13} />
                      </button>}
                      {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(p.id)} disabled={deleting === p.id} title="Eliminar">
                        <Trash2 size={13} />
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
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

      {modalOpen && (
        <PropietarioModal
          propietario={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchData() }}
        />
      )}

      {detail && (
        <PropietarioDetail
          propietario={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); setModalOpen(true) }}
        />
      )}
    </div>
  )
}

function ContactoCell({ id }: { id: number }) {
  const [tel, setTel]   = useState<string | null>(null)
  const [mail, setMail] = useState<string | null>(null)

  useEffect(() => {
    dbCat.from('propietarios_telefonos').select('numero').eq('id_propietario_fk', id).eq('activo', true).limit(1)
      .then(({ data }) => setTel(data?.[0]?.numero ?? null))
    dbCat.from('propietarios_correos').select('correo').eq('id_propietario_fk', id).eq('activo', true).limit(1)
      .then(({ data }) => setMail(data?.[0]?.correo ?? null))
  }, [id])

  return (
    <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {tel  && <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}><Phone size={10} />{tel}</span>}
      {mail && <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}><Mail size={10} />{mail}</span>}
      {!tel && !mail && <span style={{ color: 'var(--text-muted)' }}>—</span>}
    </div>
  )
}