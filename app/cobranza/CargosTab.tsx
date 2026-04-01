'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useAuth } from '@/lib/AuthContext'
import { useEffect, useState, useCallback } from 'react'
import { dbCat, dbCtrl, dbCfg } from '@/lib/supabase'
import {
  Plus, Search, RefreshCw, X, Save, Loader,
  ChevronLeft, ChevronRight, Zap, AlertTriangle,
  CheckCircle, Edit3, ChevronDown
} from 'lucide-react'
import { type Cargo, fmt, STATUS_CARGO_COLOR, MESES } from './types'

const PAGE_SIZE = 30

// ─────────────────────────────────────────────────────────────────────────────
export default function CargosTab() {
  const { canWrite } = useAuth()
  const [cargos, setCargos]         = useState<Cargo[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [search, setSearch]         = useState('')
  const debouncedSearch             = useDebounce(search, 300)
  const [filterStatus, setFilter]   = useState('Pendiente')
  const [loading, setLoading]       = useState(true)
  const [modalMasivo, setModalMasivo] = useState(false)
  const [modalManual, setModalManual] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('cargos')
      .select('*, lotes(cve_lote, lote)', { count: 'exact' })
      .order('fecha_cargo', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (debouncedSearch) q = q.ilike('concepto', `%${debouncedSearch}%`)
    const { data, count, error } = await q
    if (!error) { setCargos(data as Cargo[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, debouncedSearch, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages  = Math.ceil(total / PAGE_SIZE)
  const totalMonto  = cargos.reduce((a, c) => a + (c.monto ?? 0), 0)
  const totalPagado = cargos.reduce((a, c) => a + (c.monto_pagado ?? 0), 0)
  const totalSaldo  = cargos.reduce((a, c) => a + (c.saldo ?? 0), 0)

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

      {/* Filtros y acciones */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar concepto o lote…"
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
        {canWrite('cobranza') && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => setModalManual(true)}>
              <Plus size={14} /> Cargo especial
            </button>
            <button className="btn-primary" onClick={() => setModalMasivo(true)}>
              <Zap size={14} /> Generar cargos del mes
            </button>
          </div>
        )}
      </div>

      {/* Tabla */}
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
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : cargos.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin cargos registrados</td></tr>
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

      {modalMasivo && <GenerarCargosModal onClose={() => setModalMasivo(false)} onSaved={() => { setModalMasivo(false); fetchData() }} />}
      {modalManual && <CargoEspecialModal onClose={() => setModalManual(false)} onSaved={() => { setModalManual(false); fetchData() }} />}
    </div>
  )
}

// ─── Modal: Generar Cargos del Mes ───────────────────────────────────────────
function GenerarCargosModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep]               = useState<1 | 2>(1)
  const [saving, setSaving]           = useState(false)
  const [cuotas, setCuotas]           = useState<any[]>([])
  const [cuotaId, setCuotaId]         = useState('')
  const [cuotaSel, setCuotaSel]       = useState<any>(null)
  const [periodoMes, setPeriodoMes]   = useState(MESES[new Date().getMonth()])
  const [periodoAnio, setPeriodoAnio] = useState(new Date().getFullYear().toString())
  const [preview, setPreview]         = useState<any[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [duplicados, setDuplicados]   = useState(0)

  const ANIOS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i)

  // Cargar catálogo de cuotas con su clasificación
  useEffect(() => {
    dbCfg.from('cuotas_estandar')
      .select('id, nombre, monto, periodicidad, id_clasificacion_fk, clasificacion(nombre)')
      .eq('activo', true)
      .not('id_clasificacion_fk', 'is', null)
      .order('nombre')
      .then(({ data }) => setCuotas(data ?? []))
  }, [])

  const seleccionarCuota = (id: string) => {
    setCuotaId(id)
    setCuotaSel(cuotas.find(c => c.id === Number(id)) ?? null)
    setPreview([])
    setStep(1)
  }

  // Generar preview: lotes del tipo correcto que NO tienen ya ese cargo en ese período
  const generarPreview = async () => {
    if (!cuotaSel || !periodoMes || !periodoAnio) return
    setLoadingPreview(true)

    // 1. Lotes con la clasificación de la cuota
    const { data: lotesData } = await dbCat.from('lotes')
      .select('id, cve_lote, lote')
      .eq('id_clasificacion_fk', cuotaSel.id_clasificacion_fk)

    const lotes = lotesData ?? []

    // 2. Cargos ya existentes para esa cuota en ese período
    const { data: existentes } = await dbCtrl.from('cargos')
      .select('id_lote_fk')
      .eq('periodo_mes', periodoMes)
      .eq('periodo_anio', Number(periodoAnio))
      .ilike('concepto', cuotaSel.nombre)

    const lotesCargados = new Set((existentes ?? []).map((e: any) => e.id_lote_fk))

    const aptos    = lotes.filter(l => !lotesCargados.has(l.id))
    const saltados = lotes.filter(l =>  lotesCargados.has(l.id))

    setPreview(aptos)
    setDuplicados(saltados.length)
    setLoadingPreview(false)
    setStep(2)
  }

  const handleGenerar = async () => {
    if (!preview.length || !cuotaSel) return
    setSaving(true)
    const hoy = new Date().toISOString().split('T')[0]
    await dbCtrl.from('cargos').insert(
      preview.map(l => ({
        id_lote_fk:   l.id,
        concepto:     cuotaSel.nombre,
        monto:        cuotaSel.monto,
        monto_pagado: 0,
        periodo_mes:  periodoMes,
        periodo_anio: Number(periodoAnio),
        fecha_cargo:  hoy,
        status:       'Pendiente',
      }))
    )
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Generar Cargos del Mes</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {step === 1 ? 'Selecciona la cuota y el período' : `Vista previa — ${preview.length} lotes recibirán el cargo`}
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Step 1: configuración */}
          <>
            {/* Cuota */}
            <div>
              <label className="label">Cuota a aplicar *</label>
              <select className="select" value={cuotaId} onChange={e => seleccionarCuota(e.target.value)}>
                <option value="">— Selecciona una cuota —</option>
                {cuotas.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {fmt(c.monto)} · {(c as any).clasificacion?.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Info de la cuota seleccionada */}
            {cuotaSel && (
              <div style={{ display: 'flex', gap: 16, padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                <InfoChip label="Clasificación" value={(cuotaSel as any).clasificacion?.nombre ?? '—'} />
                <InfoChip label="Monto"        value={fmt(cuotaSel.monto)} />
                <InfoChip label="Periodicidad" value={cuotaSel.periodicidad ?? '—'} />
              </div>
            )}

            {/* Período */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Mes *</label>
                <select className="select" value={periodoMes} onChange={e => { setPeriodoMes(e.target.value); setStep(1); setPreview([]) }}>
                  {MESES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Año *</label>
                <select className="select" value={periodoAnio} onChange={e => { setPeriodoAnio(e.target.value); setStep(1); setPreview([]) }}>
                  {ANIOS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {step === 1 && (
              <button className="btn-primary" disabled={!cuotaId || !periodoMes || !periodoAnio || loadingPreview}
                onClick={generarPreview}
                style={{ alignSelf: 'flex-end' }}>
                {loadingPreview ? <><Loader size={13} className="animate-spin" /> Calculando…</> : <><Search size={13} /> Ver vista previa</>}
              </button>
            )}
          </>

          {/* Step 2: preview */}
          {step === 2 && (
            <>
              {duplicados > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                  <AlertTriangle size={14} />
                  {duplicados} lote(s) ya tienen este cargo en {periodoMes} {periodoAnio} — se omitirán.
                </div>
              )}

              {preview.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: 13, background: '#f8fafc', borderRadius: 8 }}>
                  Todos los lotes de este tipo ya tienen el cargo generado para este período.
                </div>
              ) : (
                <div className="card" style={{ overflow: 'hidden', maxHeight: 280, overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Lote</th>
                        <th style={{ textAlign: 'right' }}>Monto a cargar</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map(l => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 600, color: 'var(--blue)' }}>{l.cve_lote ?? `#${l.lote}`}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(cuotaSel?.monto)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <CheckCircle size={11} /> Por generar
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 13 }}>
                          Total — {preview.length} lotes
                        </td>
                        <td style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--blue)' }}>
                          {fmt((cuotaSel?.monto ?? 0) * preview.length)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          {step === 2 && preview.length > 0 && (
            <button className="btn-primary" onClick={handleGenerar} disabled={saving}>
              {saving
                ? <><Loader size={13} className="animate-spin" /> Generando…</>
                : <><Zap size={13} /> Confirmar — {preview.length} cargos</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Cargo especial manual ────────────────────────────────────────────
function CargoEspecialModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving]         = useState(false)
  const [lotes, setLotes]           = useState<any[]>([])
  const [loteSearch, setLoteSearch] = useState('')
  const [showCatalogo, setShowCatalogo] = useState(false)
  const [catalogoCuotas, setCatalogoCuotas] = useState<any[]>([])
  const [conceptoManual, setConceptoManual] = useState(false)

  const [form, setForm] = useState({
    id_lote_fk:   '',
    concepto:     '',
    monto:        '',
    periodo_mes:  MESES[new Date().getMonth()],
    periodo_anio: new Date().getFullYear().toString(),
    fecha_cargo:  new Date().toISOString().split('T')[0],
    notas:        '',
  })

  const ANIOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

  useEffect(() => {
    dbCfg.from('cuotas_estandar').select('id, nombre, monto').eq('activo', true).order('nombre')
      .then(({ data }) => setCatalogoCuotas(data ?? []))
  }, [])

  useEffect(() => {
    if (loteSearch.length < 2) { setLotes([]); return }
    dbCat.from('lotes').select('id, cve_lote, lote').ilike('cve_lote', `%${loteSearch}%`).limit(8)
      .then(({ data }) => setLotes(data ?? []))
  }, [loteSearch])

  const selectLote = (l: any) => {
    setForm(f => ({ ...f, id_lote_fk: String(l.id) }))
    setLoteSearch(l.cve_lote ?? `#${l.lote}`)
    setLotes([])
  }

  const aplicarCatalogo = (c: any) => {
    setForm(f => ({ ...f, concepto: c.nombre, monto: c.monto?.toString() ?? f.monto }))
    setShowCatalogo(false)
    setConceptoManual(false)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.id_lote_fk || !form.concepto || !form.monto) return
    setSaving(true)
    await dbCtrl.from('cargos').insert({
      id_lote_fk:   Number(form.id_lote_fk),
      concepto:     form.concepto.trim(),
      monto:        Number(form.monto),
      monto_pagado: 0,
      periodo_mes:  form.periodo_mes || null,
      periodo_anio: form.periodo_anio ? Number(form.periodo_anio) : null,
      fecha_cargo:  form.fecha_cargo,
      notas:        form.notas.trim() || null,
      status:       'Pendiente',
    })
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Cargo Especial</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Cargo individual a un lote específico</p>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

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

          {/* Concepto */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <label className="label" style={{ marginBottom: 0 }}>Concepto *</label>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--blue)' }}
                onClick={() => setConceptoManual(m => !m)}>
                <Edit3 size={11} /> {conceptoManual ? 'Elegir del catálogo' : 'Editar manual'}
              </button>
            </div>
            {!conceptoManual ? (
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowCatalogo(s => !s)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', background: form.concepto ? '#eff6ff' : 'var(--surface-600)', border: `1px solid ${form.concepto ? '#bfdbfe' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', fontSize: 13, color: form.concepto ? 'var(--blue)' : 'var(--text-muted)', fontWeight: form.concepto ? 600 : 400 }}>
                  <span>{form.concepto || 'Selecciona del catálogo…'}</span>
                  <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
                </button>
                {showCatalogo && (
                  <div className="card" style={{ position: 'absolute', left: 0, right: 0, zIndex: 50, marginTop: 4, padding: '4px 0', maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
                    {catalogoCuotas.map(c => (
                      <button key={c.id} onClick={() => aplicarCatalogo(c)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <span style={{ fontSize: 13 }}>{c.nombre}</span>
                        <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{fmt(c.monto)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input className="input" value={form.concepto} onChange={set('concepto')} placeholder="Escribe el concepto…" autoFocus />
            )}
          </div>

          {/* Monto y fecha */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Monto *</label>
              <input className="input" type="number" step="0.01" value={form.monto} onChange={set('monto')} />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.fecha_cargo} onChange={set('fecha_cargo')} />
            </div>
          </div>

          {/* Período */}
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

          {/* Notas */}
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

// ─── Helper ───────────────────────────────────────────────────────────────────
const InfoChip = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
  </div>
)
