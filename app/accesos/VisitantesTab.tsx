'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { Plus, Search, RefreshCw, Edit2, Trash2, X, Save, Loader, UserCheck } from 'lucide-react'
import { type Visitante, type VisitanteAutorizado, TIPOS_VISITANTE, TIPOS_PASE } from './types'

export default function VisitantesTab() {
  const [visitantes, setVisitantes] = useState<Visitante[]>([])
  const [total, setTotal]           = useState(0)
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<Visitante | null>(null)
  const [autModal, setAutModal]     = useState<Visitante | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCat.from('visitantes').select('*', { count: 'exact' }).order('nombre')
    if (search) q = q.or(`nombre.ilike.%${search}%,apellido_paterno.ilike.%${search}%`)
    const { data, count } = await q
    setVisitantes(data as Visitante[] ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar visitante?')) return
    await dbCat.from('visitantes').delete().eq('id', id)
    fetchData()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar visitante…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus size={14} /> Nuevo Visitante
          </button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Parentesco</th>
                <th>Identificación</th>
                <th>Status</th>
                <th style={{ width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              ) : visitantes.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin visitantes registrados</td></tr>
              ) : visitantes.map(v => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 500 }}>{v.nombre} {v.apellido_paterno ?? ''} {v.apellido_materno ?? ''}</td>
                  <td><span className="badge badge-default">{v.tipo_visitante ?? '—'}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v.parentesco ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {v.identificacion_tipo ? `${v.identificacion_tipo}: ${v.identificacion_num ?? ''}` : '—'}
                  </td>
                  <td><span className={`badge ${v.activo ? 'badge-vendido' : 'badge-bloqueado'}`}>{v.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setAutModal(v)} title="Asignar a lote">
                        <UserCheck size={13} />
                      </button>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(v); setModalOpen(true) }} title="Editar">
                        <Edit2 size={13} />
                      </button>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(v.id)} title="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && <VisitanteModal visitante={editing} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
      {autModal  && <AutorizarModal visitante={autModal} onClose={() => setAutModal(null)} />}
    </div>
  )
}

// ── Modal Visitante CRUD ─────────────────────────────────────
function VisitanteModal({ visitante, onClose, onSaved }: { visitante: Visitante | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !visitante
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre:              visitante?.nombre ?? '',
    apellido_paterno:    visitante?.apellido_paterno ?? '',
    apellido_materno:    visitante?.apellido_materno ?? '',
    tipo_visitante:      visitante?.tipo_visitante ?? '',
    parentesco:          visitante?.parentesco ?? '',
    identificacion_tipo: visitante?.identificacion_tipo ?? '',
    identificacion_num:  visitante?.identificacion_num ?? '',
    notas:               visitante?.notas ?? '',
    activo:              visitante?.activo ?? true,
  })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.nombre.trim()) return
    setSaving(true)
    const payload = { ...form, nombre: form.nombre.trim(), apellido_paterno: form.apellido_paterno.trim() || null, apellido_materno: form.apellido_materno.trim() || null, tipo_visitante: form.tipo_visitante || null, parentesco: form.parentesco.trim() || null, identificacion_tipo: form.identificacion_tipo || null, identificacion_num: form.identificacion_num.trim() || null, notas: form.notas.trim() || null }
    if (isNew) await dbCat.from('visitantes').insert(payload)
    else await dbCat.from('visitantes').update(payload).eq('id', visitante.id)
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>{isNew ? 'Nuevo Visitante' : 'Editar Visitante'}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Nombre(s) *</label><input className="input" value={form.nombre} onChange={set('nombre')} /></div>
            <div><label className="label">Apellido Paterno</label><input className="input" value={form.apellido_paterno} onChange={set('apellido_paterno')} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Apellido Materno</label><input className="input" value={form.apellido_materno} onChange={set('apellido_materno')} /></div>
            <div><label className="label">Tipo</label>
              <select className="select" value={form.tipo_visitante} onChange={set('tipo_visitante')}>
                <option value="">— Seleccionar —</option>
                {TIPOS_VISITANTE.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Parentesco</label><input className="input" value={form.parentesco} onChange={set('parentesco')} placeholder="Hijo, Cónyuge…" /></div>
            <div><label className="label">Tipo ID</label>
              <select className="select" value={form.identificacion_tipo} onChange={set('identificacion_tipo')}>
                <option value="">—</option>
                <option>INE</option><option>Pasaporte</option><option>Licencia</option><option>Otro</option>
              </select>
            </div>
          </div>
          <div><label className="label">No. Identificación</label><input className="input" value={form.identificacion_num} onChange={set('identificacion_num')} /></div>
          <div><label className="label">Notas</label><textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} /></div>
          <div><label className="label">Activo</label>
            <select className="select" value={form.activo ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
              <option value="true">Sí</option><option value="false">No</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal autorizar visitante a lote ─────────────────────────
function AutorizarModal({ visitante, onClose }: { visitante: Visitante; onClose: () => void }) {
  const [lotes, setLotes]       = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState('')
  const [autorizados, setAutorizados] = useState<VisitanteAutorizado[]>([])
  const [saving, setSaving]     = useState(false)
  const [selectedLote, setSelectedLote] = useState<any>(null)
  const [tipoPase, setTipoPase] = useState('Permanente')
  const [vigDesde, setVigDesde] = useState('')
  const [vigHasta, setVigHasta] = useState('')

  useEffect(() => {
    dbCtrl.from('visitantes_autorizados_lotes').select('*, lotes(cve_lote, lote)')
      .eq('id_visitante_fk', visitante.id).eq('activo', true)
      .then(({ data }) => setAutorizados(data as VisitanteAutorizado[] ?? []))
  }, [visitante.id])

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const handleAutorizar = async () => {
    if (!selectedLote) return
    setSaving(true)
    await dbCtrl.from('visitantes_autorizados_lotes').insert({
      id_lote_fk: selectedLote.id, id_visitante_fk: visitante.id,
      tipo_pase: tipoPase, vigencia_desde: vigDesde || null, vigencia_hasta: vigHasta || null, activo: true,
    })
    const { data } = await dbCtrl.from('visitantes_autorizados_lotes').select('*, lotes(cve_lote, lote)')
      .eq('id_visitante_fk', visitante.id).eq('activo', true)
    setAutorizados(data as VisitanteAutorizado[] ?? [])
    setSelectedLote(null); setLoteSearch(''); setSaving(false)
  }

  const handleRevocar = async (id: number) => {
    await dbCtrl.from('visitantes_autorizados_lotes').update({ activo: false }).eq('id', id)
    setAutorizados(a => a.filter(x => x.id !== id))
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400 }}>Autorizar Acceso</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{visitante.nombre} {visitante.apellido_paterno ?? ''}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {/* Lotes autorizados actuales */}
          {autorizados.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Accesos Autorizados</div>
              {autorizados.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-700)', borderRadius: 6, marginBottom: 6 }}>
                  <div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold-light)' }}>{(a as any).lotes?.cve_lote ?? `#${a.id_lote_fk}`}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{a.tipo_pase}</span>
                  </div>
                  <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: '#f87171' }} onClick={() => handleRevocar(a.id)}>Revocar</button>
                </div>
              ))}
            </div>
          )}

          {/* Agregar autorización */}
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Agregar Lote</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="label">Lote</label>
              <input className="input" placeholder="Busca clave de lote…" value={loteSearch}
                onChange={e => { setLoteSearch(e.target.value); setSelectedLote(null) }} />
              {lotes.length > 0 && (
                <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                  {lotes.map((l: any) => (
                    <button key={l.id} onClick={() => { setSelectedLote(l); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }}
                      style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 15 }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-700)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                      {l.cve_lote ?? `#${l.lote}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div><label className="label">Tipo Pase</label>
                <select className="select" value={tipoPase} onChange={e => setTipoPase(e.target.value)}>
                  {TIPOS_PASE.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="label">Vigencia Desde</label><input className="input" type="date" value={vigDesde} onChange={e => setVigDesde(e.target.value)} /></div>
              <div><label className="label">Vigencia Hasta</label><input className="input" type="date" value={vigHasta} onChange={e => setVigHasta(e.target.value)} /></div>
            </div>
            <button className="btn-primary" onClick={handleAutorizar} disabled={!selectedLote || saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? <Loader size={13} className="animate-spin" /> : <UserCheck size={13} />}
              Autorizar Acceso
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
