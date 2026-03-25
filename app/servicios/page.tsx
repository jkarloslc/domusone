'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { Plus, Search, RefreshCw, Zap, Droplets, Edit2, Trash2, X, Save, Loader } from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────
type ServicioCFE = {
  id: number; id_lote_fk: number; no_medidor: string | null
  tarifa: string | null; status: string | null; notas: string | null
  lotes?: { cve_lote: string | null; lote: number | null }
}
type ServicioAgua = {
  id: number; id_lote_fk: number; no_medidor: string | null
  instruccion: string | null; status: string | null
  fecha_instruccion: string | null; notas: string | null
  lotes?: { cve_lote: string | null; lote: number | null }
}

const STATUS_CFE  = ['Activo', 'Suspendido', 'Sin Servicio', 'En Trámite']
const STATUS_AGUA = ['Activo', 'Suspendido', 'Sin Servicio', 'Cortado']
const TARIFAS_CFE = ['DAC', '1', '1A', '1B', '1C', '1D', '1E', '1F', 'PDBT', 'GDBT']
const INSTRUCCIONES_AGUA = ['Servicio Normal', 'Corte Programado', 'Corte por Morosidad', 'Reconexión Autorizada']

const STATUS_COLOR: Record<string, string> = {
  'Activo': 'badge-vendido', 'Suspendido': 'badge-bloqueado',
  'Sin Servicio': 'badge-default', 'En Trámite': 'badge-libre',
  'Cortado': 'badge-bloqueado',
}

const fmtFecha = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX') : '—'

export default function ServiciosPage() {
  const [tab, setTab] = useState<'cfe' | 'agua'>('cfe')

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Zap size={16} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, letterSpacing: '-0.01em' }}>Servicios</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { id: 'cfe',  label: 'CFE / Luz',      icon: <Zap size={13} /> },
          { id: 'agua', label: 'Agua Potable',    icon: <Droplets size={13} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontFamily: 'var(--font-body)',
            display: 'flex', alignItems: 'center', gap: 6,
            color: tab === t.id ? 'var(--gold-light)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.2s',
          }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {tab === 'cfe'  && <CfeTab />}
      {tab === 'agua' && <AguaTab />}
    </div>
  )
}

// ── Tab CFE ──────────────────────────────────────────────────
function CfeTab() {
  const [rows, setRows]           = useState<ServicioCFE[]>([])
  const [total, setTotal]         = useState(0)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<ServicioCFE | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('servicio_cfe').select('*, lotes(cve_lote, lote)', { count: 'exact' }).order('id')
    if (debouncedSearch) q = q.or(`no_medidor.ilike.%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data as ServicioCFE[] ?? []); setTotal(count ?? 0)
    setLoading(false)
  }, [debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro CFE?')) return
    await dbCtrl.from('servicio_cfe').delete().eq('id', id); fetchData()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar no. medidor…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={14} /> Agregar CFE</button>
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Lote</th><th>No. Medidor</th><th>Tarifa</th><th>Status</th><th>Notas</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold-light)' }}>{(r as any).lotes?.cve_lote ?? `#${r.id_lote_fk}`}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.no_medidor ?? '—'}</td>
                  <td><span className="badge badge-default">{r.tarifa ?? '—'}</span></td>
                  <td><span className={`badge ${STATUS_COLOR[r.status ?? ''] ?? 'badge-default'}`}>{r.status ?? '—'}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notas ?? '—'}</td>
                  <td><div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(r); setModalOpen(true) }}><Edit2 size={13} /></button>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(r.id)}><Trash2 size={13} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modalOpen && <CfeModal servicio={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
    </div>
  )
}

function CfeModal({ servicio, onClose, onSaved }: { servicio: ServicioCFE | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !servicio
  const [saving, setSaving] = useState(false)
  const [lotes, setLotes]   = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState(servicio ? ((servicio as any).lotes?.cve_lote ?? '') : '')
  const [form, setForm] = useState({ id_lote_fk: servicio?.id_lote_fk?.toString() ?? '', no_medidor: servicio?.no_medidor ?? '', tarifa: servicio?.tarifa ?? '', status: servicio?.status ?? 'Activo', notas: servicio?.notas ?? '' })

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8).then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_lote_fk) return
    setSaving(true)
    const payload = { id_lote_fk: Number(form.id_lote_fk), no_medidor: form.no_medidor.trim() || null, tarifa: form.tarifa || null, status: form.status || null, notas: form.notas.trim() || null }
    if (isNew) await dbCtrl.from('servicio_cfe').insert(payload)
    else await dbCtrl.from('servicio_cfe').update(payload).eq('id', servicio.id)
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400 }}>{isNew ? 'Nuevo Servicio CFE' : 'Editar CFE'}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="label">Lote *</label>
            <input className="input" placeholder="Busca clave…" value={loteSearch} onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
            {lotes.length > 0 && <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>{lotes.map((l: any) => <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }} style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 15 }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-700)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>{l.cve_lote ?? `#${l.lote}`}</button>)}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">No. Medidor</label><input className="input" value={form.no_medidor} onChange={set('no_medidor')} style={{ fontFamily: 'monospace' }} /></div>
            <div><label className="label">Tarifa</label><select className="select" value={form.tarifa} onChange={set('tarifa')}><option value="">—</option>{TARIFAS_CFE.map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div><label className="label">Status</label><select className="select" value={form.status} onChange={set('status')}>{STATUS_CFE.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label className="label">Notas</label><textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !form.id_lote_fk}>{saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
        </div>
      </div>
    </div>
  )
}

// ── Tab Agua ─────────────────────────────────────────────────
function AguaTab() {
  const [rows, setRows]           = useState<ServicioAgua[]>([])
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<ServicioAgua | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('servicio_agua').select('*, lotes(cve_lote, lote)').order('id')
    if (debouncedSearch) q = q.or(`no_medidor.ilike.%${debouncedSearch}%`)
    const { data } = await q
    setRows(data as ServicioAgua[] ?? [])
    setLoading(false)
  }, [debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este registro?')) return
    await dbCtrl.from('servicio_agua').delete().eq('id', id); fetchData()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 300 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar no. medidor…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}><Plus size={14} /> Agregar Contrato</button>
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Lote</th><th>No. Medidor</th><th>Notas</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              : rows.length === 0 ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
              : rows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold-light)' }}>{(r as any).lotes?.cve_lote ?? `#${r.id_lote_fk}`}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.no_medidor ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notas ?? '—'}</td>
                  <td><div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(r); setModalOpen(true) }}><Edit2 size={13} /></button>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(r.id)}><Trash2 size={13} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modalOpen && <AguaModal servicio={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
    </div>
  )
}

function AguaModal({ servicio, onClose, onSaved }: { servicio: ServicioAgua | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !servicio
  const [saving, setSaving] = useState(false)
  const [lotes, setLotes]   = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState(servicio ? ((servicio as any).lotes?.cve_lote ?? '') : '')
  const [form, setForm] = useState({ id_lote_fk: servicio?.id_lote_fk?.toString() ?? '', no_medidor: servicio?.no_medidor ?? '', notas: servicio?.notas ?? '' })

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8).then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_lote_fk) return
    setSaving(true)
    const payload = { id_lote_fk: Number(form.id_lote_fk), no_medidor: form.no_medidor.trim() || null, notas: form.notas.trim() || null }
    if (isNew) await dbCtrl.from('servicio_agua').insert(payload)
    else await dbCtrl.from('servicio_agua').update(payload).eq('id', servicio.id)
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400 }}>{isNew ? 'Agregar Contrato de Agua' : 'Editar Contrato de Agua'}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="label">Lote *</label>
            <input className="input" placeholder="Busca clave…" value={loteSearch} onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
            {lotes.length > 0 && <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>{lotes.map((l: any) => <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }} style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 15 }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-700)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>{l.cve_lote ?? `#${l.lote}`}</button>)}</div>}
          </div>
          <div>
            <label className="label">No. Medidor</label>
            <input className="input" value={form.no_medidor} onChange={set('no_medidor')} style={{ fontFamily: 'monospace' }} />
          </div>
          <div><label className="label">Notas</label><textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !form.id_lote_fk}>{saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
        </div>
      </div>
    </div>
  )
}