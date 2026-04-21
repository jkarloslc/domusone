'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  ArrowLeft, ChevronRight, CheckCircle, Trash2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge, type Proveedor, FORMAS_PAGO_COMP, nextFolio } from '../types'

const PAGE_SIZE = 20

export default function CotizacionesPage() {
  const { canWrite, canDelete } = useAuth()
  const router = useRouter()
  const [rows, setRows]     = useState<any[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(0)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState<any | null | 'new'>(null)
  const [detail, setDetail] = useState<any | null>(null)
  const [provMap, setProvMap] = useState<Record<number, string>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('rfq').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (debouncedSearch) q = q.ilike('folio', `%${debouncedSearch}%`)
    const [{ data, count }, { data: provs }] = await Promise.all([
      q,
      dbComp.from('proveedores').select('id, nombre'),
    ])
    setRows(data ?? []); setTotal(count ?? 0)
    const pm: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)
    setLoading(false)
  }, [page, debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Cotizaciones (RFQ)</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Solicitudes de cotización y cuadro comparativo · {total} registros</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar folio…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          {canWrite('cotizaciones') && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nueva RFQ</button>}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio RFQ</th><th>Requisición</th><th>Fecha</th>
              <th>Fecha Límite</th><th>Status</th><th>Proveedor Ganador</th><th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin RFQs registradas</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.id_requisicion_fk ? `REQ #${r.id_requisicion_fk}` : '—'}</td>
                <td style={{ fontSize: 12 }}>{fmtFecha(r.fecha_rfq)}</td>
                <td style={{ fontSize: 12, color: r.fecha_limite ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{fmtFecha(r.fecha_limite)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.proveedor_ganador ? (provMap[r.proveedor_ganador] ?? `#${r.proveedor_ganador}`) : '—'}</td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(r)}><Eye size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== null && <RFQModal row={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />}
      {detail && <RFQDetail rfq={detail} onClose={() => { setDetail(null); fetchData() }} />}
    </div>
  )
}

// ── Modal nueva RFQ ─────────────────────────────────────────
function RFQModal({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const isNew = !row
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [requisiciones, setReqs] = useState<any[]>([])
  const [form, setForm] = useState({
    id_requisicion_fk: row?.id_requisicion_fk?.toString() ?? '',
    fecha_limite:      row?.fecha_limite ?? '',
    notas:             row?.notas ?? '',
  })

  useEffect(() => {
    dbComp.from('requisiciones').select('id, folio, area_solicitante')
      .eq('status', 'Aprobada').order('folio')
      .then(({ data }) => setReqs(data ?? []))
  }, [])

  const handleSave = async () => {
    setSaving(true); setError('')
    let folio: string
    try { folio = await nextFolio(dbComp, 'RFQ') } catch (e: any) { setError(e.message); setSaving(false); return }
    const { error: err } = await dbComp.from('rfq').insert({
      folio,
      id_requisicion_fk: form.id_requisicion_fk ? Number(form.id_requisicion_fk) : null,
      fecha_limite:      form.fecha_limite || null,
      notas:             form.notas.trim() || null,
      status:            'Abierta',
      created_by:        authUser?.nombre ?? null,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Nueva Solicitud de Cotización</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          <div>
            <label className="label">Requisición Asociada (opcional)</label>
            <select className="select" value={form.id_requisicion_fk}
              onChange={e => setForm(f => ({ ...f, id_requisicion_fk: e.target.value }))}>
              <option value="">— Sin requisición —</option>
              {requisiciones.map(r => <option key={r.id} value={r.id}>{r.folio} — {r.area_solicitante}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fecha Límite Cotizaciones</label>
            <input className="input" type="date" value={form.fecha_limite}
              onChange={e => setForm(f => ({ ...f, fecha_limite: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Crear RFQ
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detalle RFQ con cuadro comparativo de hasta 3 proveedores ──
function RFQDetail({ rfq, onClose }: { rfq: any; onClose: () => void }) {
  const [cotizaciones, setCots] = useState<any[]>([])
  const [proveedores, setProvs] = useState<Proveedor[]>([])
  const [reqDet, setReqDet]     = useState<any[]>([])
  const [addingCot, setAddingCot] = useState(false)
  const [saving, setSaving]     = useState(false)

  // Form nueva cotización
  const [cotForm, setCotForm] = useState({
    id_proveedor_fk:  '',
    numero_cotizacion:'',
    fecha_cotizacion: '',
    condiciones_pago: '',
    tiempo_entrega:   '',
    notas:            '',
  })
  const [cotDet, setCotDet] = useState<any[]>([])

  useEffect(() => {
    dbComp.from('rfq_cotizaciones').select('*, rfq_cotizaciones_det(*)')
      .eq('id_rfq_fk', rfq.id).order('id')
      .then(({ data }) => setCots(data ?? []))
    dbComp.from('proveedores').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setProvs(data as Proveedor[] ?? []))
    if (rfq.id_requisicion_fk) {
      dbComp.from('requisiciones_det').select('*').eq('id_requisicion_fk', rfq.id_requisicion_fk)
        .then(({ data }) => {
          setReqDet(data ?? [])
          setCotDet((data ?? []).map((d: any) => ({
            id_requisicion_det_fk: d.id,
            id_articulo_fk:        d.id_articulo_fk ?? null,
            descripcion:           d.descripcion,
            cantidad:              d.cantidad?.toString(),
            unidad:                d.unidad,
            precio_unitario:       '',
            tasa_iva:              '0',
          })))
        })
    } else {
      setCotDet([{ id_requisicion_det_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', precio_unitario: '', tasa_iva: '0' }])
    }
  }, [rfq.id, rfq.id_requisicion_fk])

  const subtotalCot = cotDet.reduce((a, d) => {
    const sub = Number(d.cantidad) * Number(d.precio_unitario || 0)
    return a + sub
  }, 0)
  const ivaCot = cotDet.reduce((a, d) => {
    const sub = Number(d.cantidad) * Number(d.precio_unitario || 0)
    return a + sub * Number(d.tasa_iva || 0)
  }, 0)

  const saveCotizacion = async () => {
    if (!cotForm.id_proveedor_fk) return
    if (cotizaciones.length >= 3) { alert('Máximo 3 cotizaciones por RFQ'); return }
    setSaving(true)
    const detValidos = cotDet.filter(d => d.descripcion && Number(d.precio_unitario) > 0)
    const { data: cot, error: err } = await dbComp.from('rfq_cotizaciones').insert({
      id_rfq_fk:        rfq.id,
      id_proveedor_fk:  Number(cotForm.id_proveedor_fk),
      numero_cotizacion: cotForm.numero_cotizacion || null,
      fecha_cotizacion:  cotForm.fecha_cotizacion || null,
      condiciones_pago:  cotForm.condiciones_pago || null,
      tiempo_entrega:    cotForm.tiempo_entrega || null,
      notas:             cotForm.notas || null,
      subtotal:          subtotalCot,
      iva:               ivaCot,
      total:             subtotalCot + ivaCot,
    }).select('id').single()
    if (!err && cot) {
      await dbComp.from('rfq_cotizaciones_det').insert(
        detValidos.map(d => ({
          id_cotizacion_fk:      cot.id,
          id_requisicion_det_fk: d.id_requisicion_det_fk || null,
          id_articulo_fk:        (d as any).id_articulo_fk ?? null,
          descripcion:           d.descripcion,
          cantidad:              Number(d.cantidad),
          unidad:                d.unidad,
          precio_unitario:       Number(d.precio_unitario),
          subtotal:              Number(d.cantidad) * Number(d.precio_unitario),
          tasa_iva:              Number(d.tasa_iva),
          iva:                   Number(d.cantidad) * Number(d.precio_unitario) * Number(d.tasa_iva),
          total:                 Number(d.cantidad) * Number(d.precio_unitario) * (1 + Number(d.tasa_iva)),
        }))
      )
    }
    setSaving(false); setAddingCot(false)
    dbComp.from('rfq_cotizaciones').select('*, rfq_cotizaciones_det(*)')
      .eq('id_rfq_fk', rfq.id).then(({ data }) => setCots(data ?? []))
  }

  const seleccionarGanador = async (cotId: number, provId: number) => {
    await dbComp.from('rfq_cotizaciones').update({ seleccionada: false }).eq('id_rfq_fk', rfq.id)
    await dbComp.from('rfq_cotizaciones').update({ seleccionada: true }).eq('id', cotId)
    await dbComp.from('rfq').update({ status: 'Cerrada', proveedor_ganador: provId }).eq('id', rfq.id)
    dbComp.from('rfq_cotizaciones').select('*, rfq_cotizaciones_det(*)')
      .eq('id_rfq_fk', rfq.id).then(({ data }) => setCots(data ?? []))
  }

  const setCD = (i: number, k: string, v: string) =>
    setCotDet(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x))

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>{rfq.folio}</span>
              <StatusBadge status={rfq.status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {rfq.id_requisicion_fk ? `Requisición #${rfq.id_requisicion_fk} · ` : ''}Fecha límite: {fmtFecha(rfq.fecha_limite)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {rfq.status === 'Abierta' && cotizaciones.length < 3 && (
              <button className="btn-primary" onClick={() => setAddingCot(true)}><Plus size={13} /> Agregar Cotización</button>
            )}
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 80px)' }}>

          {/* Cuadro comparativo */}
          {cotizaciones.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                Cuadro Comparativo ({cotizaciones.length}/3 cotizaciones)
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      {cotizaciones.map(c => {
                        const prov = proveedores.find(p => p.id === c.id_proveedor_fk)
                        return (
                          <th key={c.id} style={{ background: c.seleccionada ? '#f0fdf4' : undefined, color: c.seleccionada ? '#15803d' : undefined }}>
                            {prov?.nombre ?? `Prov #${c.id_proveedor_fk}`}
                            {c.seleccionada && <span style={{ fontSize: 10, marginLeft: 4 }}>✓ GANADOR</span>}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' }}>No. Cotización</td>
                      {cotizaciones.map(c => <td key={c.id} style={{ fontSize: 12 }}>{c.numero_cotizacion ?? '—'}</td>)}
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' }}>Condiciones Pago</td>
                      {cotizaciones.map(c => <td key={c.id} style={{ fontSize: 12 }}>{c.condiciones_pago ?? '—'}</td>)}
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)' }}>Tiempo Entrega</td>
                      {cotizaciones.map(c => <td key={c.id} style={{ fontSize: 12 }}>{c.tiempo_entrega ?? '—'}</td>)}
                    </tr>
                    {/* Detalle por producto */}
                    {(cotizaciones[0]?.rfq_cotizaciones_det ?? []).map((_: any, pi: number) => (
                      <tr key={pi}>
                        <td style={{ fontSize: 12 }}>{cotizaciones[0]?.rfq_cotizaciones_det?.[pi]?.descripcion}</td>
                        {cotizaciones.map(c => {
                          const d = c.rfq_cotizaciones_det?.[pi]
                          return <td key={c.id} style={{ fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d ? fmt(d.precio_unitario) : '—'}</td>
                        })}
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                      <td style={{ fontWeight: 700 }}>Subtotal</td>
                      {cotizaciones.map(c => <td key={c.id} style={{ fontWeight: 700, textAlign: 'right' }}>{fmt(c.subtotal)}</td>)}
                    </tr>
                    <tr>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>IVA</td>
                      {cotizaciones.map(c => <td key={c.id} style={{ fontSize: 12, textAlign: 'right' }}>{fmt(c.iva)}</td>)}
                    </tr>
                    <tr style={{ background: '#f8fafc' }}>
                      <td style={{ fontWeight: 700, color: 'var(--blue)' }}>TOTAL</td>
                      {cotizaciones.map(c => (
                        <td key={c.id} style={{ fontWeight: 700, color: 'var(--blue)', textAlign: 'right', fontSize: 15 }}>
                          {fmt(c.total)}
                        </td>
                      ))}
                    </tr>
                    {rfq.status === 'Abierta' && (
                      <tr>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>Seleccionar</td>
                        {cotizaciones.map(c => (
                          <td key={c.id} style={{ textAlign: 'center' }}>
                            <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}
                              onClick={() => seleccionarGanador(c.id, c.id_proveedor_fk)}>
                              <CheckCircle size={11} /> Seleccionar
                            </button>
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {cotizaciones.length === 0 && !addingCot && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Sin cotizaciones registradas. Agrega hasta 3 proveedores para comparar.
            </div>
          )}

          {/* Formulario nueva cotización */}
          {addingCot && (
            <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)', marginBottom: 12 }}>Nueva Cotización — Proveedor {cotizaciones.length + 1}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label className="label">Proveedor *</label>
                  <select className="select" value={cotForm.id_proveedor_fk}
                    onChange={e => setCotForm(f => ({ ...f, id_proveedor_fk: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {proveedores
                      .filter(p => !cotizaciones.some(c => c.id_proveedor_fk === p.id))
                      .map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">No. Cotización</label>
                  <input className="input" value={cotForm.numero_cotizacion}
                    onChange={e => setCotForm(f => ({ ...f, numero_cotizacion: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Fecha Cotización</label>
                  <input className="input" type="date" value={cotForm.fecha_cotizacion}
                    onChange={e => setCotForm(f => ({ ...f, fecha_cotizacion: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="label">Condiciones de Pago</label>
                  <select className="select" value={cotForm.condiciones_pago}
                    onChange={e => setCotForm(f => ({ ...f, condiciones_pago: e.target.value }))}>
                    <option value="">—</option>
                    {FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Tiempo de Entrega</label>
                  <input className="input" placeholder="ej. 3 días hábiles" value={cotForm.tiempo_entrega}
                    onChange={e => setCotForm(f => ({ ...f, tiempo_entrega: e.target.value }))} />
                </div>
              </div>

              {/* Detalle precios */}
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Precios por Producto</div>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 80px 80px', gap: 6, marginBottom: 4 }}>
                {['Descripción','Cantidad','Unidad','P. Unit.','IVA %'].map(h => (
                  <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
                ))}
              </div>
              {cotDet.map((d, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 80px 80px', gap: 6, marginBottom: 6 }}>
                  <input className="input" value={d.descripcion} onChange={e => setCD(i,'descripcion',e.target.value)} />
                  <input className="input" type="number" value={d.cantidad} onChange={e => setCD(i,'cantidad',e.target.value)} style={{ textAlign: 'right' }} />
                  <input className="input" value={d.unidad} onChange={e => setCD(i,'unidad',e.target.value)} />
                  <input className="input" type="number" step="0.01" value={d.precio_unitario} onChange={e => setCD(i,'precio_unitario',e.target.value)} style={{ textAlign: 'right' }} />
                  <select className="select" value={d.tasa_iva} onChange={e => setCD(i,'tasa_iva',e.target.value)}>
                    <option value="0">Exento</option>
                    <option value="0.16">16%</option>
                    <option value="0.08">8%</option>
                  </select>
                </div>
              ))}
              {!rfq.id_requisicion_fk && (
                <button className="btn-ghost" style={{ marginBottom: 10 }}
                  onClick={() => setCotDet(d => [...d, { id_requisicion_det_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', precio_unitario: '', tasa_iva: '0' }])}>
                  <Plus size={12} /> Agregar producto
                </button>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue)' }}>Total: {fmt(subtotalCot + ivaCot)}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={() => setAddingCot(false)}>Cancelar</button>
                  <button className="btn-primary" onClick={saveCotizacion} disabled={saving || !cotForm.id_proveedor_fk}>
                    {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar Cotización
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}