'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useAuth } from '@/lib/AuthContext'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, Edit2, Trash2, X, Save, Loader,
  ChevronLeft, ChevronRight, DollarSign
} from 'lucide-react'
import FileUpload from '@/components/FileUpload'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 20

type Proyecto = {
  id: number; id_lote_fk: number; nombre: string | null; tipo: string | null
  status: string | null; fecha_inicio: string | null; fecha_fin_estimada: string | null
  fecha_fin_real: string | null; presupuesto: number | null; notas: string | null
  created_at: string; lotes?: { cve_lote: string | null; lote: number | null }
}
type PagoProyecto = {
  id?: number; id_proyecto_fk?: number; monto: number; fecha: string
  forma_pago: string | null; referencia: string | null; no_factura: string | null; notas: string | null
}

const TIPOS_PROYECTO  = ['Casa', 'Alberca', 'Barda', 'Remodelación', 'Ampliación', 'Obra Exterior', 'Otro']
const STATUS_PROYECTO = ['En Planeación', 'En Proceso', 'Suspendido', 'Terminado', 'Cancelado']
const FORMAS_PAGO     = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Otro']
const fmt = (v: number | null) => v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'
const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX') : '—'
const STATUS_COLOR: Record<string, string> = {
  'En Planeación': 'badge-default', 'En Proceso': 'badge-libre',
  'Suspendido': 'badge-bloqueado', 'Terminado': 'badge-vendido', 'Cancelado': 'badge-bloqueado',
}

export default function ProyectosTab() {
  const { canWrite, canDelete } = useAuth()
  const [proyectos, setProyectos]   = useState<Proyecto[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [search, setSearch]         = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilter]   = useState('')
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<Proyecto | null>(null)
  const [pagosModal, setPagosModal] = useState<Proyecto | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('proyectos').select('*, lotes(cve_lote, lote)', { count: 'exact' })
      .order('created_at', { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (debouncedSearch)       q = q.or(`nombre.ilike.%${debouncedSearch}%,tipo.ilike.%${debouncedSearch}%`)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data, count, error } = await q
    if (!error) { setProyectos(data as Proyecto[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, debouncedSearch, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este proyecto?')) return
    await dbCtrl.from('proyectos').delete().eq('id', id); fetchData()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const totalPresupuesto = proyectos.reduce((a, p) => a + (p.presupuesto ?? 0), 0)

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_PROYECTO.map(s => {
          const count = proyectos.filter(p => p.status === s).length
          if (!count) return null
          return (
            <div key={s} className="card card-hover" style={{ padding: '10px 16px', cursor: 'pointer', minWidth: 110 }}
              onClick={() => setFilter(filterStatus === s ? '' : s)}>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: filterStatus === s ? 'var(--blue)' : 'var(--text-primary)' }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{s}</div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar nombre, tipo…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {canWrite('proyectos') && <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={14} /> Nuevo Proyecto</button>}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Lote</th><th>Nombre / Tipo</th><th>Status</th>
              <th>Inicio</th><th>Fin Estimado</th><th>Fin Real</th>
              <th style={{ textAlign: 'right' }}>Presupuesto</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
            : proyectos.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin proyectos registrados</td></tr>
            : proyectos.map(p => (
              <tr key={p.id}>
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--blue)', fontWeight: 600 }}>{(p as any).lotes?.cve_lote ?? `#${p.id_lote_fk}`}</td>
                <td><div style={{ fontWeight: 500 }}>{p.nombre ?? '—'}</div>{p.tipo && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.tipo}</div>}</td>
                <td><span className={`badge ${STATUS_COLOR[p.status ?? ''] ?? 'badge-default'}`}>{p.status ?? '—'}</span></td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_inicio)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_fin_estimada)}</td>
                <td style={{ fontSize: 12, color: p.fecha_fin_real ? '#15803d' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtFecha(p.fecha_fin_real)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(p.presupuesto)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setPagosModal(p)} title="Pagos"><DollarSign size={13} /></button>
                    {canWrite('proyectos') && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(p); setModalOpen(true) }}><Edit2 size={13} /></button>}
                    {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(p.id)}><Trash2 size={13} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page + 1} de {totalPages} · {total} registros</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {modalOpen  && <ProyectoModal proyecto={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
      {pagosModal && <PagosModal proyecto={pagosModal} onClose={() => setPagosModal(null)} />}
    </div>
  )
}

function ProyectoModal({ proyecto, onClose, onSaved }: { proyecto: Proyecto | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !proyecto
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [lotes, setLotes]           = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState(proyecto ? ((proyecto as any).lotes?.cve_lote ?? '') : '')
  const [form, setForm] = useState({
    id_lote_fk: proyecto?.id_lote_fk?.toString() ?? '', nombre: proyecto?.nombre ?? '',
    tipo: proyecto?.tipo ?? '', status: proyecto?.status ?? 'En Planeación',
    fecha_inicio: proyecto?.fecha_inicio ?? '', fecha_fin_estimada: proyecto?.fecha_fin_estimada ?? '',
    fecha_fin_real: proyecto?.fecha_fin_real ?? '', presupuesto: proyecto?.presupuesto?.toString() ?? '',
    notas: proyecto?.notas ?? '',
    pdf_proyecto: (proyecto as any)?.pdf_proyecto ?? null,
  })
  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8).then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const handleSave = async () => {
    if (!form.id_lote_fk) { setError('Selecciona un lote'); return }
    setSaving(true); setError('')
    const payload = {
      id_lote_fk: Number(form.id_lote_fk), nombre: form.nombre.trim() || null, tipo: form.tipo || null,
      status: form.status || null, fecha_inicio: form.fecha_inicio || null,
      fecha_fin_estimada: form.fecha_fin_estimada || null, fecha_fin_real: form.fecha_fin_real || null,
      presupuesto: form.presupuesto ? Number(form.presupuesto) : null, notas: form.notas.trim() || null,
    }
    const { error: err } = isNew ? await dbCtrl.from('proyectos').insert(payload) : await dbCtrl.from('proyectos').update(payload).eq('id', proyecto.id)
    setSaving(false); if (err) { setError(err.message); return }; onSaved()
  }
  return (
    <ModalShell modulo="proyectos" titulo={isNew ? 'Nuevo Proyecto' : `Editar: ${proyecto.nombre ?? ''}`} onClose={onClose} maxWidth={560}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
      </>}
    >
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div>
            <label className="label">Lote *</label>
            <input className="input" placeholder="Busca clave…" value={loteSearch} onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
            {lotes.length > 0 && <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>{lotes.map((l: any) => <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }} style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 14 }} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>{l.cve_lote ?? `#${l.lote}`}</button>)}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Nombre del Proyecto</label><input className="input" value={form.nombre} onChange={set('nombre')} /></div>
            <div><label className="label">Tipo</label><select className="select" value={form.tipo} onChange={set('tipo')}><option value="">—</option>{TIPOS_PROYECTO.map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Status</label><select className="select" value={form.status} onChange={set('status')}>{STATUS_PROYECTO.map(s => <option key={s}>{s}</option>)}</select></div>
            <div><label className="label">Presupuesto</label><input className="input" type="number" step="0.01" value={form.presupuesto} onChange={set('presupuesto')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
            <div><label className="label">Fecha Inicio</label><input className="input" type="date" value={form.fecha_inicio} onChange={set('fecha_inicio')} /></div>
            <div><label className="label">Fin Estimado</label><input className="input" type="date" value={form.fecha_fin_estimada} onChange={set('fecha_fin_estimada')} /></div>
            <div><label className="label">Fin Real</label><input className="input" type="date" value={form.fecha_fin_real} onChange={set('fecha_fin_real')} /></div>
          </div>
          <FileUpload
            value={(form as any).pdf_proyecto}
            onChange={url => setForm((f: any) => ({ ...f, pdf_proyecto: url }))}
            accept="pdf"
            folder="proyectos"
            label="PDF del Proyecto"
            preview={false}
          />
          <div><label className="label">Notas</label><textarea className="input" rows={3} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} /></div>
        </div>
    </ModalShell>
  )
}

function PagosModal({ proyecto, onClose }: { proyecto: Proyecto; onClose: () => void }) {
  const [pagos, setPagos]   = useState<PagoProyecto[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm]     = useState<PagoProyecto>({ monto: 0, fecha: new Date().toISOString().split('T')[0], forma_pago: '', referencia: '', no_factura: '', notas: '' })
  useEffect(() => {
    dbCtrl.from('pagos_proyecto').select('*').eq('id_proyecto_fk', proyecto.id).order('fecha', { ascending: false }).then(({ data }) => setPagos(data as PagoProyecto[] ?? []))
  }, [proyecto.id])
  const handleAdd = async () => {
    if (!form.monto || form.monto <= 0) return
    setSaving(true)
    await dbCtrl.from('pagos_proyecto').insert({ id_proyecto_fk: proyecto.id, monto: Number(form.monto), fecha: form.fecha, forma_pago: form.forma_pago || null, referencia: form.referencia?.trim() || null, no_factura: form.no_factura?.trim() || null, notas: form.notas?.trim() || null })
    const { data } = await dbCtrl.from('pagos_proyecto').select('*').eq('id_proyecto_fk', proyecto.id).order('fecha', { ascending: false })
    setPagos(data as PagoProyecto[] ?? [])
    setForm({ monto: 0, fecha: new Date().toISOString().split('T')[0], forma_pago: '', referencia: '', no_factura: '', notas: '' })
    setSaving(false)
  }
  const totalPagado = pagos.reduce((a, p) => a + (p.monto ?? 0), 0)
  const saldo = (proyecto.presupuesto ?? 0) - totalPagado
  return (
    <ModalShell modulo="proyectos" titulo="Pagos del Proyecto" onClose={onClose} maxWidth={560}
    >
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {[{ label: 'Presupuesto', value: fmt(proyecto.presupuesto), color: 'var(--text-primary)' }, { label: 'Pagado', value: fmt(totalPagado), color: '#15803d' }, { label: 'Saldo', value: fmt(saldo), color: saldo > 0 ? '#dc2626' : '#15803d' }].map(s => (
              <div key={s.label} className="card" style={{ padding: '10px 14px', flex: 1 }}>
                <div style={{ fontSize: 17, fontFamily: 'var(--font-display)', color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {pagos.length > 0 && <div style={{ marginBottom: 20 }}>{pagos.map((p, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 6, marginBottom: 6 }}><div><span style={{ fontSize: 13, fontWeight: 500, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(p.monto)}</span>{p.forma_pago && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{p.forma_pago}</span>}{p.referencia && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>· {p.referencia}</span>}</div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtFecha(p.fecha)}</span></div>)}</div>}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Registrar Pago</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div><label className="label">Monto *</label><input className="input" type="number" step="0.01" value={form.monto || ''} onChange={e => setForm(f => ({ ...f, monto: Number(e.target.value) }))} /></div>
              <div><label className="label">Fecha</label><input className="input" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div><label className="label">Forma de Pago</label><select className="select" value={form.forma_pago ?? ''} onChange={e => setForm(f => ({ ...f, forma_pago: e.target.value }))}><option value="">—</option>{FORMAS_PAGO.map(p => <option key={p}>{p}</option>)}</select></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label className="label">Referencia</label><input className="input" value={form.referencia ?? ''} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} /></div>
              <div><label className="label">No. Factura</label><input className="input" value={form.no_factura ?? ''} onChange={e => setForm(f => ({ ...f, no_factura: e.target.value }))} /></div>
            </div>
            <button className="btn-primary" onClick={handleAdd} disabled={saving || !form.monto} style={{ alignSelf: 'flex-start' }}>{saving ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />} Registrar Pago</button>
          </div>
        </div>
    </ModalShell>
  )
}