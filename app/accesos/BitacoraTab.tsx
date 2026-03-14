'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import { Plus, Search, RefreshCw, X, ChevronLeft, ChevronRight, LogIn, LogOut } from 'lucide-react'
import { type Acceso, type Visitante, TURNOS } from './types'

const PAGE_SIZE = 30

export default function BitacoraTab() {
  const [accesos, setAccesos]   = useState<Acceso[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl
      .from('accesos')
      .select('*, visitantes(nombre, apellido_paterno), lotes(cve_lote, lote)', { count: 'exact' })
      .order('fecha_hora', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    const { data, count, error } = await q
    if (!error) { setAccesos(data as Acceso[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, search])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const entradas = accesos.filter(a => a.tipo === 'Entrada').length
  const salidas  = accesos.filter(a => a.tipo === 'Salida').length

  return (
    <div>
      {/* Stats + botón */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'Registros hoy', value: total,    color: 'var(--text-primary)' },
            { label: 'Entradas',      value: entradas, color: '#4ade80' },
            { label: 'Salidas',       value: salidas,  color: '#60a5fa' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '10px 16px', minWidth: 100 }}>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Registrar Acceso
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar visitante, lote…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={13} /></button>}
        </div>
        <button className="btn-ghost" onClick={fetchData}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Tipo</th>
                <th>Visitante</th>
                <th>Lote</th>
                <th>Turno</th>
                <th>Guardia</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
                </td></tr>
              ) : accesos.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  Sin registros de acceso
                </td></tr>
              ) : accesos.map(a => (
                <tr key={a.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {new Date(a.fecha_hora).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      className={`badge ${a.tipo === 'Entrada' ? 'badge-vendido' : 'badge-libre'}`}>
                      {a.tipo === 'Entrada' ? <LogIn size={10} /> : <LogOut size={10} />}
                      {a.tipo ?? '—'}
                    </span>
                  </td>
                  <td>
                    {a.visitantes
                      ? <span>{a.visitantes.nombre} {a.visitantes.apellido_paterno ?? ''}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>
                    }
                  </td>
                  <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold-light)' }}>
                    {(a as any).lotes?.cve_lote ?? (a.id_lote_fk ? `#${a.id_lote_fk}` : '—')}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.turno ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{a.guardia ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notas ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page + 1} de {totalPages} · {total} registros</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {showForm && <RegistrarAccesoModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchData() }} />}
    </div>
  )
}

// ── Modal registro rápido de acceso ─────────────────────────
function RegistrarAccesoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving]   = useState(false)
  const [lotes, setLotes]     = useState<any[]>([])
  const [visitantes, setVisitantes] = useState<Visitante[]>([])
  const [loteSearch, setLoteSearch] = useState('')
  const [visitSearch, setVisitSearch] = useState('')

  const [form, setForm] = useState({
    id_lote_fk:       '',
    id_visitante_fk:  '',
    tipo:             'Entrada',
    turno:            '',
    guardia:          '',
    notas:            '',
    fecha_hora:       new Date().toISOString().slice(0, 16),
  })

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  useEffect(() => {
    if (visitSearch.length < 2) { setVisitantes([]); return }
    dbCat.from('visitantes').select('id, nombre, apellido_paterno, tipo_visitante')
      .or(`nombre.ilike.%${visitSearch}%,apellido_paterno.ilike.%${visitSearch}%`)
      .eq('activo', true).limit(8)
      .then(({ data }) => setVisitantes(data as Visitante[] ?? []))
  }, [visitSearch])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    await dbCtrl.from('accesos').insert({
      id_lote_fk:      form.id_lote_fk ? Number(form.id_lote_fk) : null,
      id_visitante_fk: form.id_visitante_fk ? Number(form.id_visitante_fk) : null,
      tipo:            form.tipo,
      turno:           form.turno || null,
      guardia:         form.guardia.trim() || null,
      notas:           form.notas.trim() || null,
      fecha_hora:      form.fecha_hora ? new Date(form.fecha_hora).toISOString() : new Date().toISOString(),
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>Registrar Acceso</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {['Entrada', 'Salida'].map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, tipo: t }))} style={{
                padding: '10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14,
                border: `1px solid ${form.tipo === t ? 'var(--gold)' : 'var(--border)'}`,
                background: form.tipo === t ? 'rgba(196,128,31,0.12)' : 'var(--surface-900)',
                color: form.tipo === t ? 'var(--gold-light)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {t === 'Entrada' ? <LogIn size={14} /> : <LogOut size={14} />} {t}
              </button>
            ))}
          </div>

          {/* Lote */}
          <div>
            <label className="label">Lote</label>
            <input className="input" placeholder="Busca por clave de lote…" value={loteSearch}
              onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
            {lotes.length > 0 && (
              <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                {lotes.map((l: any) => (
                  <button key={l.id} onClick={() => { setForm(f => ({ ...f, id_lote_fk: l.id })); setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([]) }}
                    style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-light)', fontFamily: 'var(--font-display)', fontSize: 15, textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-700)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    {l.cve_lote ?? `#${l.lote}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Visitante */}
          <div>
            <label className="label">Visitante</label>
            <input className="input" placeholder="Busca por nombre…" value={visitSearch}
              onChange={e => { setVisitSearch(e.target.value); setForm(f => ({ ...f, id_visitante_fk: '' })) }} />
            {visitantes.length > 0 && (
              <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                {visitantes.map(v => (
                  <button key={v.id} onClick={() => { setForm(f => ({ ...f, id_visitante_fk: String(v.id) })); setVisitSearch(`${v.nombre} ${v.apellido_paterno ?? ''}`); setVisitantes([]) }}
                    style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flexDirection: 'column' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-700)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{v.nombre} {v.apellido_paterno ?? ''}</span>
                    {v.tipo_visitante && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v.tipo_visitante}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Turno</label>
              <select className="select" value={form.turno} onChange={set('turno')}>
                <option value="">— Seleccionar —</option>
                {TURNOS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="label">Guardia</label>
              <input className="input" value={form.guardia} onChange={set('guardia')} placeholder="Nombre del guardia" />
            </div>
          </div>

          <div><label className="label">Fecha y Hora</label>
            <input className="input" type="datetime-local" value={form.fecha_hora} onChange={set('fecha_hora')} />
          </div>

          <div><label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <RefreshCw size={13} className="animate-spin" /> : (form.tipo === 'Entrada' ? <LogIn size={13} /> : <LogOut size={13} />)}
            Registrar {form.tipo}
          </button>
        </div>
      </div>
    </div>
  )
}
