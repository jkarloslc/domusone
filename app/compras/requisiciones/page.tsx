import { useDebounce } from '@/lib/useDebounce'
'use client'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Edit2, Eye, X, Save, Loader,
  ArrowLeft, CheckCircle, XCircle, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type Articulo, fmt, fmtFecha, folioGen, StatusBadge, UNIDADES } from '../types'

const PAGE_SIZE = 20

type Det = { id?: number; id_articulo_fk: number | null; descripcion: string; cantidad: string; unidad: string; notas: string }

export default function RequisicionesPage() {
  const router  = useRouter()
  const { authUser } = useAuth()
  const [rows, setRows]       = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(0)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<any | null | 'new'>(null)
  const [detail, setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('requisiciones').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (debouncedSearch) q = q.or(`folio.ilike.%${debouncedSearch}%,area_solicitante.ilike.%${debouncedSearch}%,solicitante.ilike.%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0); setLoading(false)
  }, [page, debouncedSearch, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleAuth = async (id: number, aprobar: boolean, comentario = '') => {
    await dbComp.from('requisiciones').update({
      status:            aprobar ? 'Aprobada' : 'Rechazada',
      autorizado_por:    authUser?.nombre ?? 'Sistema',
      fecha_autorizacion: new Date().toISOString(),
      comentario_auth:   comentario || null,
    }).eq('id', id)
    setDetail(null); fetchData()
  }

  const canAuth = authUser?.rol === 'admin' || authUser?.rol === 'cobranza'

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Requisiciones</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Solicitudes de compra · {total} registros</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, área, solicitante…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="select" style={{ width: 160 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
            <option value="">Todos los status</option>
            {['Borrador','Enviada','Aprobada','Rechazada','En Proceso','Cerrada'].map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nueva Requisición</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th><th>Área</th><th>Solicitante</th><th>Fecha Solicitud</th>
              <th>Fecha Requerida</th><th>Prioridad</th><th>Status</th><th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin requisiciones</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td style={{ fontSize: 13 }}>{r.area_solicitante}</td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.solicitante}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtFecha(r.fecha_solicitud)}</td>
                <td style={{ fontSize: 12, color: r.fecha_requerida ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{fmtFecha(r.fecha_requerida)}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, color: r.prioridad === 'Crítica' ? '#dc2626' : r.prioridad === 'Urgente' ? '#d97706' : '#64748b' }}>
                    {r.prioridad}
                  </span>
                </td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(r)} title="Ver"><Eye size={13} /></button>
                    {r.status === 'Borrador' && (
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(r)} title="Editar"><Edit2 size={13} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pág. {page+1} de {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page===0} onClick={() => setPage(p=>p-1)}><ChevronLeft size={13}/></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page>=totalPages-1} onClick={() => setPage(p=>p+1)}><ChevronRight size={13}/></button>
            </div>
          </div>
        )}
      </div>

      {modal !== null && <RequisicionModal row={modal==='new'?null:modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />}
      {detail && <RequisicionDetail req={detail} canAuth={canAuth} onClose={() => setDetail(null)} onAuth={handleAuth} />}
    </div>
  )
}

// ── Modal crear/editar requisición ──────────────────────────
function RequisicionModal({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [articulos, setArticulos] = useState<Articulo[]>([])
  const [areas, setAreas]   = useState<{id: number; nombre: string}[]>([])
  const [form, setForm] = useState({
    area_solicitante: row?.area_solicitante ?? '',
    solicitante:      row?.solicitante ?? (authUser?.nombre ?? ''),
    fecha_requerida:  row?.fecha_requerida ?? '',
    centro_costo:     row?.centro_costo ?? '',
    prioridad:        row?.prioridad ?? 'Normal',
    justificacion:    row?.justificacion ?? '',
  })
  const [det, setDet] = useState<Det[]>([{ id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', notas: '' }])

  useEffect(() => {
    dbComp.from('articulos').select('id, clave, nombre, unidad').eq('activo', true).order('nombre')
      .then(({ data }) => setArticulos(data as Articulo[] ?? []))
    dbComp.from('areas_solicitantes').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setAreas(data ?? []))
    if (!isNew && row?.id) {
      dbComp.from('requisiciones_det').select('*').eq('id_requisicion_fk', row.id)
        .then(({ data }) => {
          if (data?.length) setDet(data.map((d: any) => ({ id: d.id, id_articulo_fk: d.id_articulo_fk, descripcion: d.descripcion, cantidad: d.cantidad?.toString(), unidad: d.unidad, notas: d.notas ?? '' })))
        })
    }
  }, [])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const setDL = (i: number, k: string, v: any) =>
    setDet(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const aplicarArticulo = (i: number, artId: string) => {
    const art = articulos.find(a => a.id === Number(artId))
    setDet(d => d.map((x, j) => j === i ? { ...x, id_articulo_fk: art?.id ?? null, descripcion: art?.nombre ?? x.descripcion, unidad: art?.unidad ?? x.unidad } : x))
  }

  const handleSave = async (enviar = false) => {
    if (!form.area_solicitante.trim() || !form.solicitante.trim()) { setError('Área y Solicitante son obligatorios'); return }
    const detValidos = det.filter(d => d.descripcion.trim() && Number(d.cantidad) > 0)
    if (!detValidos.length) { setError('Agrega al menos un producto'); return }
    setSaving(true); setError('')

    let reqId = row?.id
    if (isNew) {
      const { count } = await dbComp.from('requisiciones').select('id', { count: 'exact', head: true })
      const folio = folioGen('REQ', (count ?? 0) + 1)
      const { data, error: err } = await dbComp.from('requisiciones').insert({
        folio, ...form, status: enviar ? 'Enviada' : 'Borrador',
        created_by: authUser?.nombre ?? null,
      }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      reqId = data.id
    } else {
      await dbComp.from('requisiciones').update({ ...form, status: enviar ? 'Enviada' : row.status }).eq('id', reqId)
      await dbComp.from('requisiciones_det').delete().eq('id_requisicion_fk', reqId)
    }

    await dbComp.from('requisiciones_det').insert(
      detValidos.map(d => ({
        id_requisicion_fk: reqId, id_articulo_fk: d.id_articulo_fk || null,
        descripcion: d.descripcion.trim(), cantidad: Number(d.cantidad),
        unidad: d.unidad, notas: d.notas.trim() || null,
      }))
    )
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{isNew ? 'Nueva Requisición' : `Editar ${row.folio}`}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <Sec label="Datos de la Solicitud">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Área Solicitante *</label>
                <select className="select" value={form.area_solicitante} onChange={setF('area_solicitante')}>
                  <option value="">— Seleccionar —</option>
                  {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                </select>
              </div>
              <div><label className="label">Solicitante *</label><input className="input" value={form.solicitante} onChange={setF('solicitante')} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><label className="label">Fecha Requerida</label><input className="input" type="date" value={form.fecha_requerida} onChange={setF('fecha_requerida')} /></div>
              <div><label className="label">Centro de Costo</label><input className="input" value={form.centro_costo} onChange={setF('centro_costo')} /></div>
              <div><label className="label">Prioridad</label>
                <select className="select" value={form.prioridad} onChange={setF('prioridad')}>
                  {['Normal','Urgente','Crítica'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label">Justificación</label><textarea className="input" rows={2} value={form.justificacion} onChange={setF('justificacion')} style={{ resize: 'vertical' }} /></div>
          </Sec>

          <Sec label="Productos Solicitados">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 80px 80px 1fr 28px', gap: 6, marginBottom: 4 }}>
              {['Artículo','Descripción','Cantidad','Unidad','Notas',''].map(h => (
                <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {det.map((d, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 80px 80px 1fr 28px', gap: 6, marginBottom: 6 }}>
                <select className="select" value={d.id_articulo_fk?.toString() ?? ''} onChange={e => aplicarArticulo(i, e.target.value)}>
                  <option value="">— Libre —</option>
                  {articulos.map(a => <option key={a.id} value={a.id}>{a.clave} — {a.nombre}</option>)}
                </select>
                <input className="input" value={d.descripcion} onChange={e => setDL(i,'descripcion',e.target.value)} placeholder="Descripción del producto" />
                <input className="input" type="number" min="0.001" step="0.001" value={d.cantidad} onChange={e => setDL(i,'cantidad',e.target.value)} style={{ textAlign: 'right' }} />
                <select className="select" value={d.unidad} onChange={e => setDL(i,'unidad',e.target.value)}>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
                <input className="input" value={d.notas} onChange={e => setDL(i,'notas',e.target.value)} placeholder="Notas" />
                <button className="btn-ghost" style={{ padding: '4px' }} onClick={() => setDet(d => d.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
              </div>
            ))}
            <button className="btn-ghost" onClick={() => setDet(d => [...d, { id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', notas: '' }])}>
              <Plus size={12} /> Agregar producto
            </button>
          </Sec>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar Borrador
          </button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />} Enviar para Autorización
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vista de detalle + autorización ────────────────────────
function RequisicionDetail({ req, canAuth, onClose, onAuth }: { req: any; canAuth: boolean; onClose: () => void; onAuth: (id: number, ap: boolean, c: string) => void }) {
  const [det, setDet]           = useState<any[]>([])
  const [comentario, setComent] = useState('')
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    dbComp.from('requisiciones_det').select('*').eq('id_requisicion_fk', req.id)
      .then(({ data }) => setDet(data ?? []))
  }, [req.id])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{req.folio}</span>
              <StatusBadge status={req.status} />
              <span style={{ fontSize: 11, fontWeight: 600, color: req.prioridad === 'Crítica' ? '#dc2626' : req.prioridad === 'Urgente' ? '#d97706' : '#64748b' }}>● {req.prioridad}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{req.area_solicitante} · {req.solicitante} · {fmtFecha(req.fecha_solicitud)}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '18px 24px', overflowY: 'auto', maxHeight: 'calc(88vh - 120px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            <DI label="Fecha Requerida"  value={fmtFecha(req.fecha_requerida)} />
            <DI label="Centro de Costo"  value={req.centro_costo} />
            {req.justificacion && <DI label="Justificación" value={req.justificacion} />}
            {req.autorizado_por && <DI label="Autorizado por" value={`${req.autorizado_por} — ${fmtFecha(req.fecha_autorizacion)}`} />}
            {req.comentario_auth && <DI label="Comentario" value={req.comentario_auth} />}
          </div>

          {/* Detalle */}
          <Sec label={`Productos (${det.length})`}>
            <div className="card" style={{ overflow: 'hidden' }}>
              <table>
                <thead><tr><th>Descripción</th><th style={{ textAlign: 'right' }}>Cantidad</th><th>Unidad</th><th>Notas</th></tr></thead>
                <tbody>
                  {det.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{d.descripcion}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.cantidad}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.notas ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sec>

          {/* Panel autorización */}
          {canAuth && req.status === 'Enviada' && (
            <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Autorización de Requisición</div>
              <textarea className="input" rows={2} value={comentario} onChange={e => setComent(e.target.value)}
                placeholder="Comentario (opcional)" style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => onAuth(req.id, true, comentario)} style={{ flex: 1 }}>
                  <CheckCircle size={13} /> Aprobar
                </button>
                <button onClick={() => onAuth(req.id, false, comentario)}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 7, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  <XCircle size={13} /> Rechazar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const Sec = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  </div>
)
const DI = ({ label, value }: { label: string; value?: string | null }) => value ? (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</div>
  </div>
) : null
