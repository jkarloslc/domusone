'use client'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, X, Save, Loader,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle, Clock, Ban
} from 'lucide-react'
import { type Cargo, fmt, STATUS_CARGO_COLOR, MESES } from './types'
import ReciboModal from './ReciboModal'

const PAGE_SIZE = 30

export default function CargosTab() {
  const [cargos, setCargos]         = useState<Cargo[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilter]   = useState('Pendiente')
  const [loading, setLoading]       = useState(true)
  const [nuevoModal, setNuevoModal] = useState(false)
  const [pagarModal, setPagarModal] = useState<Cargo | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('cargos')
      .select('*, lotes(cve_lote, lote)', { count: 'exact' })
      .order('fecha_cargo', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (filterStatus) q = q.eq('status', filterStatus)
    if (search) q = q.ilike('concepto', `%${search}%`)

    const { data, count, error } = await q
    if (!error) { setCargos(data as Cargo[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, search, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const totalMonto   = cargos.reduce((a, c) => a + (c.monto ?? 0), 0)
  const totalPagado  = cargos.reduce((a, c) => a + (c.monto_pagado ?? 0), 0)
  const totalSaldo   = cargos.reduce((a, c) => a + (c.saldo ?? 0), 0)

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total cargado',   value: fmt(totalMonto),  color: 'var(--text-primary)' },
          { label: 'Total pagado',    value: fmt(totalPagado), color: '#15803d' },
          { label: 'Saldo pendiente', value: fmt(totalSaldo),  color: totalSaldo > 0 ? '#dc2626' : '#15803d' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 18px', minWidth: 150 }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 600, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar concepto…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="select" style={{ width: 150 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
            <option value="">Todos</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Parcial">Parcial</option>
            <option value="Pagado">Pagado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <button className="btn-primary" onClick={() => setNuevoModal(true)}>
          <Plus size={14} /> Nuevo Cargo
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Lote</th>
              <th>Concepto</th>
              <th>Período</th>
              <th>Fecha</th>
              <th style={{ textAlign: 'right' }}>Cargo</th>
              <th style={{ textAlign: 'right' }}>Pagado</th>
              <th style={{ textAlign: 'right' }}>Saldo</th>
              <th>Status</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
            ) : cargos.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin cargos registrados</td></tr>
            ) : cargos.map(c => {
              const sc = STATUS_CARGO_COLOR[c.status] ?? STATUS_CARGO_COLOR['Pendiente']
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{(c as any).lotes?.cve_lote ?? `#${c.id_lote_fk}`}</td>
                  <td style={{ fontSize: 13 }}>{c.concepto}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {c.periodo_mes && c.periodo_anio ? `${c.periodo_mes} ${c.periodo_anio}` : '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(c.fecha_cargo + 'T12:00:00').toLocaleDateString('es-MX')}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(c.monto)}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803d' }}>
                    {c.monto_pagado > 0 ? fmt(c.monto_pagado) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: c.saldo > 0 ? '#dc2626' : '#15803d' }}>
                    {fmt(c.saldo)}
                  </td>
                  <td>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    {c.status !== 'Pagado' && c.status !== 'Cancelado' && (
                      <button className="btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setPagarModal(c)}>
                        Pagar
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
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

      {nuevoModal && <NuevoCargoModal onClose={() => setNuevoModal(false)} onSaved={() => { setNuevoModal(false); fetchData() }} />}
      {pagarModal && (
        <ReciboModal
          cargoInicial={pagarModal}
          onClose={() => setPagarModal(null)}
          onSaved={() => { setPagarModal(null); fetchData() }}
        />
      )}
    </div>
  )
}

// ── Modal nuevo cargo manual ──────────────────────────────────
function NuevoCargoModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving]         = useState(false)
  const [lotes, setLotes]           = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState('')
  const [cuotas, setCuotas]         = useState<any[]>([])

  const [form, setForm] = useState({
    id_lote_fk:       '',
    id_cuota_lote_fk: '',
    concepto:         '',
    monto:            '',
    periodo_mes:      MESES[new Date().getMonth()],
    periodo_anio:     new Date().getFullYear().toString(),
    fecha_cargo:      new Date().toISOString().split('T')[0],
    notas:            '',
  })

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const selectLote = async (l: any) => {
    setForm(f => ({ ...f, id_lote_fk: String(l.id) }))
    setLoteSearch(l.cve_lote ?? `#${l.lote}`); setLotes([])
    // Cargar cuotas del lote
    const { data } = await dbCtrl.from('cuotas_lotes')
      .select('*, cuotas_estandar(nombre)')
      .eq('id_lote_fk', l.id).eq('activo', true)
    setCuotas(data ?? [])
  }

  const aplicarCuota = (id: string) => {
    const c = cuotas.find((x: any) => x.id === Number(id))
    if (c) setForm(f => ({ ...f, id_cuota_lote_fk: id, concepto: c.cuotas_estandar?.nombre ?? f.concepto, monto: c.monto?.toString() ?? f.monto }))
    else setForm(f => ({ ...f, id_cuota_lote_fk: id }))
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_lote_fk || !form.concepto || !form.monto) return
    setSaving(true)
    await dbCtrl.from('cargos').insert({
      id_lote_fk:       Number(form.id_lote_fk),
      id_cuota_lote_fk: form.id_cuota_lote_fk ? Number(form.id_cuota_lote_fk) : null,
      concepto:         form.concepto.trim(),
      monto:            Number(form.monto),
      periodo_mes:      form.periodo_mes || null,
      periodo_anio:     form.periodo_anio ? Number(form.periodo_anio) : null,
      fecha_cargo:      form.fecha_cargo,
      notas:            form.notas.trim() || null,
      monto_pagado:     0,
    })
    setSaving(false); onSaved()
  }

  const ANIOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Nuevo Cargo</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Lote */}
          <div>
            <label className="label">Lote *</label>
            <input className="input" placeholder="Busca clave de lote…" value={loteSearch}
              onChange={e => { setLoteSearch(e.target.value); setForm(f => ({ ...f, id_lote_fk: '' })) }} />
            {lotes.length > 0 && (
              <div className="card" style={{ marginTop: 4, padding: '4px 0' }}>
                {lotes.map((l: any) => (
                  <button key={l.id} onClick={() => selectLote(l)}
                    style={{ display: 'flex', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 14 }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    {l.cve_lote ?? `#${l.lote}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cuota del lote (si tiene asignadas) */}
          {cuotas.length > 0 && (
            <div>
              <label className="label">Aplicar desde cuota asignada (opcional)</label>
              <select className="select" value={form.id_cuota_lote_fk} onChange={e => aplicarCuota(e.target.value)}>
                <option value="">— Cargo manual —</option>
                {cuotas.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.cuotas_estandar?.nombre ?? 'Cuota'} — {fmt(c.monto)} / {c.periodicidad}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Concepto *</label>
            <input className="input" value={form.concepto} onChange={set('concepto')} placeholder="Ej: Cuota de Mantenimiento" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Monto *</label>
              <input className="input" type="number" step="0.01" value={form.monto} onChange={set('monto')} />
            </div>
            <div>
              <label className="label">Fecha del Cargo</label>
              <input className="input" type="date" value={form.fecha_cargo} onChange={set('fecha_cargo')} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Mes</label>
              <select className="select" value={form.periodo_mes} onChange={set('periodo_mes')}>
                <option value="">—</option>
                {MESES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Año</label>
              <select className="select" value={form.periodo_anio} onChange={set('periodo_anio')}>
                <option value="">—</option>
                {ANIOS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={set('notas')} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !form.id_lote_fk || !form.concepto || !form.monto}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Generar Cargo
          </button>
        </div>
      </div>
    </div>
  )
}
