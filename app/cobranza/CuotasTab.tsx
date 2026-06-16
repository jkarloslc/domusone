'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import { Plus, Search, RefreshCw, X, Save, Loader, Trash2, Settings, AlertTriangle } from 'lucide-react'
import { type CuotaLote, fmt } from './types'
import ModalShell from '@/components/ui/ModalShell'

export default function CuotasTab() {
  const { canWrite, canDelete } = useAuth()
  const [cuotas, setCuotas]       = useState<CuotaLote[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<CuotaLote | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await dbCtrl.from('cuotas_lotes')
      .select('*, cuotas_estandar(nombre), lotes(cve_lote, lote)')
      .order('id', { ascending: false })
    let rows = (data as any[]) ?? []
    if (search) rows = rows.filter((r: any) =>
      (r.lotes?.cve_lote ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.cuotas_estandar?.nombre ?? '').toLowerCase().includes(search.toLowerCase())
    )
    setCuotas(rows as CuotaLote[])
    setLoading(false)
  }, [search])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta tarifa excepcional?')) return
    await dbCtrl.from('cuotas_lotes').delete().eq('id', id)
    fetchData()
  }

  const activas   = cuotas.filter(c => c.activo).length
  const inactivas = cuotas.filter(c => !c.activo).length

  return (
    <div>
      {/* Aviso contextual */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px',
        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#92400e' }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Las tarifas aquí registradas <strong>sobreescriben el monto estándar</strong> de la cuota para ese lote específico
          al generar cargos masivos. Úsalas solo cuando un lote tiene un acuerdo o precio distinto al de su sección/clasificación.
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar lote o cuota…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {canWrite('cobranza') && (
          <button className="btn-primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
            <Plus size={14} /> Nueva Excepción
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Excepciones activas',   value: activas,   color: '#d97706' },
          { label: 'Excepciones inactivas', value: inactivas, color: '#94a3b8' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '10px 16px', minWidth: 140 }}>
            <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Cuota Estándar</th>
              <th style={{ textAlign: 'right' }}>Monto Excepción</th>
              <th>Motivo</th>
              <th>Status</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
              </td></tr>
            ) : cuotas.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Sin tarifas excepcionales registradas
              </td></tr>
            ) : cuotas.map(c => (
              <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600, color: 'var(--blue)' }}>
                  {(c as any).lotes?.cve_lote ?? `#${(c as any).lotes?.lote ?? c.id_lote_fk}`}
                </td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {(c as any).cuotas_estandar?.nombre ?? <span style={{ color: '#dc2626', fontSize: 12 }}>Sin cuota asignada</span>}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#d97706' }}>
                  {fmt(c.monto)}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.motivo_excepcion ?? c.notas ?? '—'}
                </td>
                <td>
                  <span className={`badge ${c.activo ? 'badge-vendido' : 'badge-default'}`}>
                    {c.activo ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }}
                      onClick={() => { setEditing(c); setModalOpen(true) }} title="Editar">
                      <Settings size={13} />
                    </button>
                    {canDelete() && (
                      <button className="btn-ghost" style={{ padding: '4px 6px' }}
                        onClick={() => handleDelete(c.id)} title="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <ExcepcionModal
          cuota={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchData() }}
        />
      )}
    </div>
  )
}

function ExcepcionModal({ cuota, onClose, onSaved }: { cuota: CuotaLote | null; onClose: () => void; onSaved: () => void }) {
  const isNew = !cuota
  const [saving, setSaving]         = useState(false)
  const [lotes, setLotes]           = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState((cuota as any)?.lotes?.cve_lote ?? '')
  const [cuotasEstandar, setCuotasEstandar] = useState<any[]>([])
  const [form, setForm] = useState({
    id_lote_fk:          cuota?.id_lote_fk?.toString() ?? '',
    id_cuota_estandar_fk: cuota?.id_cuota_estandar_fk?.toString() ?? '',
    monto:               cuota?.monto?.toString() ?? '',
    activo:              cuota?.activo ?? true,
    motivo_excepcion:    cuota?.motivo_excepcion ?? '',
    notas:               cuota?.notas ?? '',
  })

  useEffect(() => {
    dbCfg.from('cuotas_estandar')
      .select('id, nombre, periodicidad')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setCuotasEstandar(data ?? []))
  }, [])

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_lote_fk || !form.id_cuota_estandar_fk || !form.monto) return
    setSaving(true)
    const payload = {
      id_lote_fk:          Number(form.id_lote_fk),
      id_cuota_estandar_fk: Number(form.id_cuota_estandar_fk),
      monto:               Number(form.monto),
      periodicidad:        null,
      activo:              form.activo,
      motivo_excepcion:    form.motivo_excepcion.trim() || null,
      notas:               form.notas.trim() || null,
    }
    if (isNew) await dbCtrl.from('cuotas_lotes').insert(payload)
    else await dbCtrl.from('cuotas_lotes').update(payload).eq('id', cuota.id)
    setSaving(false)
    onSaved()
  }

  const canSave = !!form.id_lote_fk && !!form.id_cuota_estandar_fk && !!form.monto

  return (
    <ModalShell modulo="cobranza"
      titulo={isNew ? 'Nueva Tarifa Excepcional' : 'Editar Tarifa Excepcional'}
      onClose={onClose} maxWidth={500}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !canSave}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar
        </button>
      </>}
    >
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Lote */}
        <div>
          <label className="label">Lote *</label>
          <input className="input" placeholder="Busca clave de lote…" value={loteSearch}
            onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
          {lotes.length > 0 && (
            <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
              {lotes.map((l: any) => (
                <button key={l.id}
                  onClick={() => { setForm(f => ({ ...f, id_lote_fk: String(l.id) })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }}
                  style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 14 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  {l.cve_lote ?? `#${l.lote}`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cuota estándar (obligatoria) */}
        <div>
          <label className="label">Cuota Estándar *</label>
          <select className="select" value={form.id_cuota_estandar_fk} onChange={set('id_cuota_estandar_fk')}>
            <option value="">— Selecciona la cuota —</option>
            {cuotasEstandar.map((c: any) => (
              <option key={c.id} value={c.id}>{c.nombre}{c.periodicidad ? ` · ${c.periodicidad}` : ''}</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Cuota a la que aplica la tarifa especial
          </p>
        </div>

        {/* Monto excepción */}
        <div>
          <label className="label">Monto de Excepción *</label>
          <input className="input" type="number" step="0.01" value={form.monto} onChange={set('monto')}
            placeholder="Monto distinto al estándar" />
        </div>

        {/* Motivo */}
        <div>
          <label className="label">Motivo de la excepción</label>
          <textarea className="input" rows={2} value={form.motivo_excepcion} onChange={set('motivo_excepcion')}
            placeholder="Ej. Acuerdo de descuento, convenio especial, tarifa transitoria…"
            style={{ resize: 'vertical' }} />
        </div>

        {/* Status */}
        <div>
          <label className="label">Status</label>
          <select className="select" value={form.activo ? 'true' : 'false'}
            onChange={e => setForm(f => ({ ...f, activo: e.target.value === 'true' }))}>
            <option value="true">Activa</option>
            <option value="false">Inactiva</option>
          </select>
        </div>
      </div>
    </ModalShell>
  )
}
