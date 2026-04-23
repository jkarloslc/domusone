'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useAuth } from '@/lib/AuthContext'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { Plus, Search, RefreshCw, Edit2, Trash2, X, Save, Loader, Car } from 'lucide-react'
import { type Vehiculo, TIPOS_VEHICULO } from './types'
import ModalShell from '@/components/ui/ModalShell'

export default function VehiculosTab() {
  const { canWrite, canDelete } = useAuth()
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([])
  const [marcas, setMarcas]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Vehiculo | null>(null)
  const [autModal, setAutModal]   = useState<Vehiculo | null>(null)

  useEffect(() => {
    dbCfg.from('marcas_vehiculos').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setMarcas(data ?? []))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCat.from('vehiculos').select('*, marcas_vehiculos(nombre)').order('placas')
    if (debouncedSearch) q = q.or(`placas.ilike.%${debouncedSearch}%,modelo.ilike.%${debouncedSearch}%,color.ilike.%${debouncedSearch}%`)
    const { data } = await q
    setVehiculos(data as Vehiculo[] ?? [])
    setLoading(false)
  }, [debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar vehículo?')) return
    await dbCat.from('vehiculos').delete().eq('id', id)
    fetchData()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar placas, modelo…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          {canWrite('accesos') && <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus size={14} /> Nuevo Vehículo
          </button>}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Placas</th>
                <th>TAG</th>
                <th>Tipo</th>
                <th>Marca / Modelo</th>
                <th>Color</th>
                <th>No. Serie</th>
                <th>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
              ) : vehiculos.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin vehículos registrados</td></tr>
              ) : vehiculos.map(v => (
                <tr key={v.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--gold-light)' }}>{v.placas ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {(v as any).tag
                      ? <span style={{ background: 'var(--blue-subtle)', color: 'var(--blue-dark)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{(v as any).tag}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>
                    }
                  </td>
                  <td><span className="badge badge-default">{v.tipo_vehiculo ?? '—'}</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {[(v as any).marcas_vehiculos?.nombre, v.modelo].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{v.color ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{v.num_serie ?? '—'}</td>
                  <td><span className={`badge ${v.activo ? 'badge-vendido' : 'badge-bloqueado'}`}>{v.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setAutModal(v)} title="Asignar a lote"><Car size={13} /></button>
                      {canWrite('accesos') && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => { setEditing(v); setModalOpen(true) }} title="Editar"><Edit2 size={13} /></button>}
                      {canDelete() && <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => handleDelete(v.id)} title="Eliminar"><Trash2 size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && <VehiculoModal vehiculo={editing} marcas={marcas} onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
      {autModal  && <AutorizarVehiculoModal vehiculo={autModal} onClose={() => setAutModal(null)} />}
    </div>
  )
}

function VehiculoModal({ vehiculo, marcas, onClose, onSaved }: { vehiculo: Vehiculo | null; marcas: any[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !vehiculo
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    id_marca_fk:   vehiculo?.id_marca_fk?.toString() ?? '',
    tipo_vehiculo: vehiculo?.tipo_vehiculo ?? '',
    modelo:        vehiculo?.modelo ?? '',
    color:         vehiculo?.color ?? '',
    placas:        vehiculo?.placas ?? '',
    num_serie:     vehiculo?.num_serie ?? '',
    tag:           (vehiculo as any)?.tag ?? '',
    activo:        vehiculo?.activo ?? true,
  })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    const payload = { id_marca_fk: form.id_marca_fk ? Number(form.id_marca_fk) : null, tipo_vehiculo: form.tipo_vehiculo || null, modelo: form.modelo.trim() || null, color: form.color.trim() || null, placas: form.placas.trim().toUpperCase() || null, num_serie: form.num_serie.trim() || null, tag: form.tag.trim().toUpperCase() || null, activo: form.activo }
    if (isNew) await dbCat.from('vehiculos').insert(payload)
    else await dbCat.from('vehiculos').update(payload).eq('id', vehiculo.id)
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>{isNew ? 'Nuevo Vehículo' : 'Editar Vehículo'}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Placas</label><input className="input" value={form.placas} onChange={set('placas')} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} /></div>
            <div><label className="label">TAG</label><input className="input" value={form.tag} onChange={set('tag')} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} placeholder="Ej: 1234" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Tipo</label>
              <select className="select" value={form.tipo_vehiculo} onChange={set('tipo_vehiculo')}>
                <option value="">—</option>{TIPOS_VEHICULO.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Marca</label>
              <select className="select" value={form.id_marca_fk} onChange={set('id_marca_fk')}>
                <option value="">— Seleccionar —</option>
                {marcas.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div><label className="label">Modelo / Año</label><input className="input" value={form.modelo} onChange={set('modelo')} placeholder="Ej: Tahoe 2022" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Color</label><input className="input" value={form.color} onChange={set('color')} /></div>
            <div><label className="label">No. Serie</label><input className="input" value={form.num_serie} onChange={set('num_serie')} style={{ fontFamily: 'monospace', fontSize: 11 }} /></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

function AutorizarVehiculoModal({ vehiculo, onClose }: { vehiculo: Vehiculo; onClose: () => void }) {
  const [lotes, setLotes]         = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState('')
  const [autorizados, setAutorizados] = useState<any[]>([])
  const [selectedLote, setSelectedLote] = useState<any>(null)
  const [saving, setSaving]       = useState(false)
  const [vigDesde, setVigDesde]   = useState('')
  const [vigHasta, setVigHasta]   = useState('')

  useEffect(() => {
    dbCtrl.from('vehiculos_autorizados_lotes').select('*, lotes(cve_lote, lote)')
      .eq('id_vehiculo_fk', vehiculo.id).eq('activo', true)
      .then(({ data }) => setAutorizados(data ?? []))
  }, [vehiculo.id])

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const handleAutorizar = async () => {
    if (!selectedLote) return
    setSaving(true)
    await dbCtrl.from('vehiculos_autorizados_lotes').insert({ id_lote_fk: selectedLote.id, id_vehiculo_fk: vehiculo.id, vigencia_desde: vigDesde || null, vigencia_hasta: vigHasta || null, activo: true })
    const { data } = await dbCtrl.from('vehiculos_autorizados_lotes').select('*, lotes(cve_lote, lote)').eq('id_vehiculo_fk', vehiculo.id).eq('activo', true)
    setAutorizados(data ?? [])
    setSelectedLote(null); setLoteSearch(''); setSaving(false)
  }

  const handleRevocar = async (id: number) => {
    await dbCtrl.from('vehiculos_autorizados_lotes').update({ activo: false }).eq('id', id)
    setAutorizados(a => a.filter((x: any) => x.id !== id))
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400 }}>Autorizar Vehículo</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{vehiculo.placas ?? '—'} · {vehiculo.tipo_vehiculo}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {autorizados.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Lotes Autorizados</div>
              {autorizados.map((a: any) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-700)', borderRadius: 6, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold-light)' }}>{a.lotes?.cve_lote ?? `#${a.id_lote_fk}`}</span>
                  <button className="btn-ghost" style={{ padding: '3px 8px', fontSize: 11, color: '#f87171' }} onClick={() => handleRevocar(a.id)}>Revocar</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Agregar Lote</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="label">Lote</label>
              <input className="input" placeholder="Busca clave…" value={loteSearch} onChange={e => { setLoteSearch(e.target.value); setSelectedLote(null) }} />
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label className="label">Vigencia Desde</label><input className="input" type="date" value={vigDesde} onChange={e => setVigDesde(e.target.value)} /></div>
              <div><label className="label">Vigencia Hasta</label><input className="input" type="date" value={vigHasta} onChange={e => setVigHasta(e.target.value)} /></div>
            </div>
            <button className="btn-primary" onClick={handleAutorizar} disabled={!selectedLote || saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Car size={13} />} Autorizar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}