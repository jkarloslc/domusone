'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  ArrowLeft, CheckCircle, XCircle, Printer, Trash2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge, type Proveedor, UNIDADES, FORMAS_PAGO_COMP } from '../types'

const PAGE_SIZE = 20

export default function OrdenesPage() {
  const router = useRouter()
  const { authUser } = useAuth()
  const [rows, setRows]       = useState<any[]>([])
  const [provMap, setProvMap] = useState<Record<number, string>>({})
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(0)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<any | null | 'new'>(null)
  const [detail, setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('ordenes_compra').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (debouncedSearch) q = q.ilike('folio', `%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0)

    // Cargar proveedores para mostrar nombre
    const { data: provs } = await dbComp.from('proveedores').select('id, nombre')
    const m: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { m[p.id] = p.nombre })
    setProvMap(m)
    setLoading(false)
  }, [page, debouncedSearch, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const canAuth = authUser?.rol === 'admin' || authUser?.rol === 'cobranza'

  const handleAuth = async (id: number, aprobar: boolean, comentario = '') => {
    await dbComp.from('ordenes_compra').update({
      status:             aprobar ? 'Autorizada' : 'Rechazada',
      autorizado_por:     authUser?.nombre ?? 'Sistema',
      fecha_autorizacion: new Date().toISOString(),
      comentario_auth:    comentario || null,
    }).eq('id', id)
    setDetail(null); fetchData()
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Órdenes de Compra</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>OC y órdenes de pago · {total} registros</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar folio…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="select" style={{ width: 170 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
            <option value="">Todos</option>
            {['Borrador','Pendiente Auth','Autorizada','Enviada al Prov','Recibida Parcial','Cerrada','Cancelada'].map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nueva OC</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th><th>Proveedor</th><th>Fecha OC</th>
              <th>Entrega Est.</th><th style={{ textAlign: 'right' }}>Total</th>
              <th>Status</th><th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin órdenes de compra</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td style={{ fontSize: 13 }}>{provMap[r.id_proveedor_fk] ?? `#${r.id_proveedor_fk}`}</td>
                <td style={{ fontSize: 12 }}>{fmtFecha(r.fecha_oc)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtFecha(r.fecha_entrega_est)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.total)}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail({ ...r, _provNombre: provMap[r.id_proveedor_fk] })}><Eye size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal !== null && <OCModal row={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />}
      {detail && <OCDetail oc={detail} canAuth={canAuth} onClose={() => { setDetail(null); fetchData() }} onAuth={handleAuth} />}
    </div>
  )
}

// ── Modal nueva OC ──────────────────────────────────────────
function OCModal({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [proveedores, setProvs] = useState<Proveedor[]>([])
  const [rfqs, setRFQs]         = useState<any[]>([])
  const [form, setForm] = useState({
    id_proveedor_fk:  row?.id_proveedor_fk?.toString() ?? '',
    id_rfq_fk:        row?.id_rfq_fk?.toString() ?? '',
    fecha_entrega_est: row?.fecha_entrega_est ?? '',
    condiciones_pago:  row?.condiciones_pago ?? '',
    lugar_entrega:     row?.lugar_entrega ?? 'Almacén General',
    notas:             row?.notas ?? '',
  })
  const [det, setDet] = useState<any[]>([{ id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', precio_unitario: '', tasa_iva: '0' }])

  useEffect(() => {
    dbComp.from('proveedores').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setProvs(data as Proveedor[] ?? []))
    dbComp.from('rfq').select('id, folio, proveedor_ganador').eq('status', 'Cerrada')
      .then(({ data }) => setRFQs(data ?? []))
  }, [])

  // Auto-llenar desde RFQ seleccionada
  const aplicarRFQ = async (rfqId: string) => {
    setForm(f => ({ ...f, id_rfq_fk: rfqId }))
    if (!rfqId) return
    const rfq = rfqs.find(r => r.id === Number(rfqId))
    if (rfq?.proveedor_ganador) setForm(f => ({ ...f, id_proveedor_fk: rfq.proveedor_ganador.toString() }))
    const { data: cot } = await dbComp.from('rfq_cotizaciones')
      .select('*, rfq_cotizaciones_det(*)')
      .eq('id_rfq_fk', Number(rfqId)).eq('seleccionada', true).single()
    if (cot?.rfq_cotizaciones_det?.length) {
      setDet(cot.rfq_cotizaciones_det.map((d: any) => ({
        id_articulo_fk: null, descripcion: d.descripcion,
        cantidad: d.cantidad?.toString(), unidad: d.unidad,
        precio_unitario: d.precio_unitario?.toString(), tasa_iva: d.tasa_iva?.toString() ?? '0',
      })))
      setForm(f => ({ ...f, condiciones_pago: cot.condiciones_pago ?? f.condiciones_pago }))
    }
  }

  const setD = (i: number, k: string, v: string) =>
    setDet(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const subtotal = det.reduce((a, d) => a + Number(d.cantidad||0) * Number(d.precio_unitario||0), 0)
  const iva      = det.reduce((a, d) => a + Number(d.cantidad||0) * Number(d.precio_unitario||0) * Number(d.tasa_iva||0), 0)

  const handleSave = async (enviar = false) => {
    if (!form.id_proveedor_fk) { setError('Selecciona un proveedor'); return }
    const detValidos = det.filter(d => d.descripcion && Number(d.precio_unitario) > 0)
    if (!detValidos.length) { setError('Agrega al menos un producto con precio'); return }
    setSaving(true); setError('')

    const { count } = await dbComp.from('ordenes_compra').select('id', { count: 'exact', head: true })
    const folio = folioGen('OC', (count ?? 0) + 1)
    const { data: oc, error: err } = await dbComp.from('ordenes_compra').insert({
      folio,
      id_proveedor_fk:   Number(form.id_proveedor_fk),
      id_rfq_fk:         form.id_rfq_fk ? Number(form.id_rfq_fk) : null,
      fecha_entrega_est: form.fecha_entrega_est || null,
      condiciones_pago:  form.condiciones_pago || null,
      lugar_entrega:     form.lugar_entrega || null,
      notas:             form.notas.trim() || null,
      subtotal, iva, total: subtotal + iva,
      status:            enviar ? 'Pendiente Auth' : 'Borrador',
      created_by:        authUser?.nombre ?? null,
    }).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }

    await dbComp.from('ordenes_compra_det').insert(
      detValidos.map(d => ({
        id_oc_fk:        oc.id,
        descripcion:     d.descripcion.trim(),
        cantidad:        Number(d.cantidad),
        unidad:          d.unidad,
        precio_unitario: Number(d.precio_unitario),
        tasa_iva:        Number(d.tasa_iva),
      }))
    )
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Nueva Orden de Compra</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <Sec label="Origen">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Desde RFQ (opcional)</label>
                <select className="select" value={form.id_rfq_fk} onChange={e => aplicarRFQ(e.target.value)}>
                  <option value="">— Sin RFQ —</option>
                  {rfqs.map(r => <option key={r.id} value={r.id}>{r.folio}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Proveedor *</label>
                <select className="select" value={form.id_proveedor_fk}
                  onChange={e => setForm(f => ({ ...f, id_proveedor_fk: e.target.value }))}>
                  <option value="">— Seleccionar —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Fecha Entrega Est.</label>
                <input className="input" type="date" value={form.fecha_entrega_est}
                  onChange={e => setForm(f => ({ ...f, fecha_entrega_est: e.target.value }))} />
              </div>
              <div>
                <label className="label">Condiciones de Pago</label>
                <select className="select" value={form.condiciones_pago}
                  onChange={e => setForm(f => ({ ...f, condiciones_pago: e.target.value }))}>
                  <option value="">—</option>
                  {FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Lugar de Entrega</label>
                <input className="input" value={form.lugar_entrega}
                  onChange={e => setForm(f => ({ ...f, lugar_entrega: e.target.value }))} />
              </div>
            </div>
          </Sec>

          <Sec label="Productos">
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 90px 80px 28px', gap: 6, marginBottom: 4 }}>
              {['Descripción','Cant.','Unidad','P. Unit.','IVA %',''].map(h => (
                <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {det.map((d, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 70px 70px 90px 80px 28px', gap: 6, marginBottom: 6 }}>
                <input className="input" value={d.descripcion} onChange={e => setD(i,'descripcion',e.target.value)} placeholder="Descripción" />
                <input className="input" type="number" value={d.cantidad} onChange={e => setD(i,'cantidad',e.target.value)} style={{ textAlign: 'right' }} />
                <select className="select" value={d.unidad} onChange={e => setD(i,'unidad',e.target.value)}>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}
                </select>
                <input className="input" type="number" step="0.01" value={d.precio_unitario} onChange={e => setD(i,'precio_unitario',e.target.value)} style={{ textAlign: 'right' }} />
                <select className="select" value={d.tasa_iva} onChange={e => setD(i,'tasa_iva',e.target.value)}>
                  <option value="0">Exento</option>
                  <option value="0.16">16%</option>
                  <option value="0.08">8%</option>
                </select>
                <button className="btn-ghost" style={{ padding: '4px' }} onClick={() => setDet(d => d.filter((_,j)=>j!==i))}><Trash2 size={12} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button className="btn-ghost" onClick={() => setDet(d => [...d, { id_articulo_fk:null, descripcion:'', cantidad:'1', unidad:'PZA', precio_unitario:'', tasa_iva:'0' }])}>
                <Plus size={12} /> Agregar
              </button>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>
                Total: {fmt(subtotal + iva)}
              </div>
            </div>
          </Sec>

          <div>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={saving}><Save size={13} /> Borrador</button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />} Enviar para Autorización
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detalle OC con autorización y orden de pago ─────────────
function OCDetail({ oc, canAuth, onClose, onAuth }: { oc: any; canAuth: boolean; onClose: () => void; onAuth: (id: number, ap: boolean, c: string) => void }) {
  const [det, setDet]     = useState<any[]>([])
  const [op, setOP]       = useState<any | null>(null)
  const [comentario, setCom] = useState('')
  const [creandoOP, setCreandoOP] = useState(false)
  const [savingOP, setSavingOP]   = useState(false)
  const [opForm, setOpForm] = useState({
    forma_pago: 'Transferencia', fecha_vencimiento: '', concepto: `OC ${oc.folio}`, notas: ''
  })

  useEffect(() => {
    dbComp.from('ordenes_compra_det').select('*').eq('id_oc_fk', oc.id)
      .then(({ data }) => setDet(data ?? []))
    dbComp.from('ordenes_pago').select('*').eq('id_oc_fk', oc.id).maybeSingle()
      .then(({ data }) => setOP(data))
  }, [oc.id])

  const crearOrdenPago = async () => {
    setSavingOP(true)
    const { count } = await dbComp.from('ordenes_pago').select('id', { count: 'exact', head: true })
    const folio = folioGen('OP', (count ?? 0) + 1)
    await dbComp.from('ordenes_pago').insert({
      folio, id_oc_fk: oc.id, id_proveedor_fk: oc.id_proveedor_fk,
      monto: oc.total, forma_pago: opForm.forma_pago,
      fecha_vencimiento: opForm.fecha_vencimiento || null,
      concepto: opForm.concepto, notas: opForm.notas || null, status: 'Pendiente',
    })
    setSavingOP(false); setCreandoOP(false)
    dbComp.from('ordenes_pago').select('*').eq('id_oc_fk', oc.id).maybeSingle()
      .then(({ data }) => setOP(data))
  }

  const imprimirOP = () => {
    if (!op) return
    const win = window.open('', '_blank')
    win?.document.write(`
      <html><head><title>Orden de Pago ${op.folio}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;font-size:13px}h1{color:#0D4F80;font-size:22px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #e2e8f0;padding:8px 12px}th{background:#f1f5f9;font-size:11px;text-transform:uppercase}</style>
      </head><body>
      <h1>Orden de Pago</h1>
      <table><tr><td><b>Folio</b></td><td>${op.folio}</td><td><b>Fecha</b></td><td>${fmtFecha(op.fecha_op)}</td></tr>
      <tr><td><b>OC Referencia</b></td><td>${oc.folio}</td><td><b>Proveedor</b></td><td>${oc._provNombre ?? ''}</td></tr>
      <tr><td><b>Monto</b></td><td><b>${fmt(op.monto)}</b></td><td><b>Forma de Pago</b></td><td>${op.forma_pago}</td></tr>
      <tr><td><b>Vencimiento</b></td><td>${fmtFecha(op.fecha_vencimiento)}</td><td><b>CLABE</b></td><td>${oc.cuenta_clabe ?? '—'}</td></tr>
      <tr><td colspan="4"><b>Concepto:</b> ${op.concepto ?? '—'}</td></tr></table>
      <br><br>
      <div style="display:flex;gap:80px;margin-top:40px">
        <div style="text-align:center;border-top:1px solid #000;padding-top:8px;width:200px">Elaboró</div>
        <div style="text-align:center;border-top:1px solid #000;padding-top:8px;width:200px">Autorizó</div>
        <div style="text-align:center;border-top:1px solid #000;padding-top:8px;width:200px">Recibió</div>
      </div>
      </body></html>
    `)
    win?.print()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 660 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{oc.folio}</span>
              <StatusBadge status={oc.status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{oc._provNombre ?? ''} · {fmtFecha(oc.fecha_oc)}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ padding: '18px 24px', overflowY: 'auto', maxHeight: 'calc(88vh - 120px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Detalle productos */}
          <Sec label="Productos">
            <div className="card" style={{ overflow: 'hidden' }}>
              <table>
                <thead><tr><th>Descripción</th><th style={{ textAlign: 'right' }}>Cant.</th><th>Unidad</th><th style={{ textAlign: 'right' }}>P. Unit.</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Recibido</th></tr></thead>
                <tbody>
                  {det.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 13 }}>{d.descripcion}</td>
                      <td style={{ textAlign: 'right' }}>{d.cantidad}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(d.precio_unitario)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.total)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: d.cant_recibida > 0 ? '#15803d' : 'var(--text-muted)' }}>{d.cant_recibida ?? 0}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={3}></td>
                    <td style={{ fontWeight: 600, textAlign: 'right' }}>Subtotal</td>
                    <td style={{ fontWeight: 600, textAlign: 'right' }}>{fmt(oc.subtotal)}</td>
                    <td></td>
                  </tr>
                  <tr style={{ background: 'var(--blue-pale)' }}>
                    <td colSpan={3}></td>
                    <td style={{ fontWeight: 700, color: 'var(--blue)', textAlign: 'right' }}>TOTAL</td>
                    <td style={{ fontWeight: 700, color: 'var(--blue)', textAlign: 'right', fontSize: 15 }}>{fmt(oc.total)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Sec>

          {/* Info entrega */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            <DI label="Condiciones de Pago"   value={oc.condiciones_pago} />
            <DI label="Entrega Estimada"       value={fmtFecha(oc.fecha_entrega_est)} />
            <DI label="Lugar de Entrega"       value={oc.lugar_entrega} />
            {oc.autorizado_por && <DI label="Autorizado por" value={`${oc.autorizado_por} — ${fmtFecha(oc.fecha_autorizacion)}`} />}
            {oc.comentario_auth && <DI label="Comentario" value={oc.comentario_auth} />}
          </div>

          {/* Autorización */}
          {canAuth && oc.status === 'Pendiente Auth' && (
            <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Autorización de Orden de Compra</div>
              <textarea className="input" rows={2} value={comentario} onChange={e => setCom(e.target.value)}
                placeholder="Comentario (opcional)" style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => onAuth(oc.id, true, comentario)} style={{ flex: 1 }}>
                  <CheckCircle size={13} /> Autorizar OC
                </button>
                <button onClick={() => onAuth(oc.id, false, comentario)}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 7, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  <XCircle size={13} /> Rechazar
                </button>
              </div>
            </div>
          )}

          {/* Orden de Pago */}
          {oc.status === 'Autorizada' && !op && !creandoOP && (
            <div style={{ textAlign: 'center' }}>
              <button className="btn-primary" onClick={() => setCreandoOP(true)}>
                <Plus size={13} /> Generar Orden de Pago
              </button>
            </div>
          )}

          {creandoOP && (
            <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', marginBottom: 10 }}>Nueva Orden de Pago — {fmt(oc.total)}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label className="label">Forma de Pago</label>
                  <select className="select" value={opForm.forma_pago} onChange={e => setOpForm(f => ({ ...f, forma_pago: e.target.value }))}>
                    {FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div><label className="label">Fecha Vencimiento</label>
                  <input className="input" type="date" value={opForm.fecha_vencimiento} onChange={e => setOpForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}><label className="label">Concepto</label>
                <input className="input" value={opForm.concepto} onChange={e => setOpForm(f => ({ ...f, concepto: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn-secondary" onClick={() => setCreandoOP(false)}>Cancelar</button>
                <button className="btn-primary" onClick={crearOrdenPago} disabled={savingOP}>
                  {savingOP ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Crear Orden de Pago
                </button>
              </div>
            </div>
          )}

          {op && (
            <div style={{ padding: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>Orden de Pago: {op.folio}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <StatusBadge status={op.status} />
                  <button className="btn-secondary" style={{ fontSize: 11 }} onClick={imprimirOP}><Printer size={12} /> Imprimir</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 20px' }}>
                <DI label="Monto"          value={fmt(op.monto)} />
                <DI label="Forma de Pago"  value={op.forma_pago} />
                <DI label="Vencimiento"    value={fmtFecha(op.fecha_vencimiento)} />
                <DI label="Concepto"       value={op.concepto} />
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
  <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 13 }}>{value}</div></div>
) : null