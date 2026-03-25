'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Search, RefreshCw, Eye, X, Save, Loader, ArrowLeft, Truck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge } from '../types'

export default function RecepcionesPage() {
  const router = useRouter()
  const [rows, setRows]       = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState<boolean>(false)
  const [detail, setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('recepciones').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (debouncedSearch) q = q.ilike('folio', `%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0); setLoading(false)
  }, [debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Recepción de Mercancías</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Entrada a almacén y actualización de inventario · {total} registros</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar folio…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
          <button className="btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Nueva Recepción</button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr><th>Folio</th><th>OC Referencia</th><th>Almacén</th><th>Fecha</th><th>Remisión</th><th>Recibió</th><th>Condición</th><th style={{ width: 60 }}></th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin recepciones registradas</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>OC #{r.id_oc_fk}</td>
                <td style={{ fontSize: 12 }}>Almacén #{r.id_almacen_fk}</td>
                <td style={{ fontSize: 12 }}>{fmtFecha(r.fecha_recepcion)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.remision ?? '—'}</td>
                <td style={{ fontSize: 12 }}>{r.recibio}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: r.condicion === 'Completa' ? '#f0fdf4' : r.condicion === 'Con Daños' ? '#fef2f2' : '#fffbeb',
                    color:      r.condicion === 'Completa' ? '#15803d' : r.condicion === 'Con Daños' ? '#dc2626' : '#d97706',
                    border:     `1px solid ${r.condicion === 'Completa' ? '#bbf7d0' : r.condicion === 'Con Daños' ? '#fecaca' : '#fde68a'}`,
                  }}>{r.condicion}</span>
                </td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(r)}><Eye size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <RecepcionModal onClose={() => setModal(false)} onSaved={() => { setModal(false); fetchData() }} />}
      {detail && <RecepcionDetail rec={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function RecepcionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [ocs, setOcs]           = useState<any[]>([])
  const [almacenes, setAlmacenes] = useState<any[]>([])
  const [ocDet, setOcDet]       = useState<any[]>([])
  const [form, setForm] = useState({
    id_oc_fk:       '',
    id_almacen_fk:  '',
    fecha_recepcion: new Date().toISOString().slice(0,10),
    remision:       '',
    recibio:        authUser?.nombre ?? '',
    condicion:      'Completa',
    notas:          '',
  })
  const [det, setDet] = useState<any[]>([])

  useEffect(() => {
    dbComp.from('ordenes_compra').select('id, folio, id_proveedor_fk')
      .in('status', ['Autorizada','Recibida Parcial']).order('folio')
      .then(({ data }) => setOcs(data ?? []))
    dbComp.from('almacenes').select('*').eq('activo', true).order('clave')
      .then(({ data }) => setAlmacenes(data ?? []))
  }, [])

  const loadOC = async (ocId: string) => {
    setForm(f => ({ ...f, id_oc_fk: ocId }))
    if (!ocId) { setOcDet([]); setDet([]); return }
    const { data } = await dbComp.from('ordenes_compra_det').select('*').eq('id_oc_fk', Number(ocId))
    const rows = data ?? []
    setOcDet(rows)
    setDet(rows.map((d: any) => ({
      id_oc_det_fk:     d.id,
      id_articulo_fk:   d.id_articulo_fk,
      descripcion:      d.descripcion,
      cantidad_pedida:  d.cant_pendiente ?? d.cantidad,
      cantidad_recibida: (d.cant_pendiente ?? d.cantidad).toString(),
      unidad:           d.unidad,
      precio_unitario:  d.precio_unitario,
    })))
  }

  const handleSave = async () => {
    if (!form.id_oc_fk || !form.id_almacen_fk || !form.recibio) {
      setError('OC, Almacén y Recibió son obligatorios'); return
    }
    const detValidos = det.filter(d => Number(d.cantidad_recibida) > 0)
    if (!detValidos.length) { setError('Ingresa al menos una cantidad recibida'); return }
    setSaving(true); setError('')

    const { count } = await dbComp.from('recepciones').select('id', { count: 'exact', head: true })
    const folio = folioGen('REC', (count ?? 0) + 1)

    const { data: rec, error: err } = await dbComp.from('recepciones').insert({
      folio, id_oc_fk: Number(form.id_oc_fk), id_almacen_fk: Number(form.id_almacen_fk),
      fecha_recepcion: form.fecha_recepcion, remision: form.remision || null,
      recibio: form.recibio, condicion: form.condicion, notas: form.notas || null,
    }).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }

    // Insertar detalle y actualizar inventario via función SQL
    for (const d of detValidos) {
      await dbComp.from('recepciones_det').insert({
        id_recepcion_fk: rec.id, id_oc_det_fk: d.id_oc_det_fk,
        id_articulo_fk:  d.id_articulo_fk || null,
        descripcion:     d.descripcion, cantidad_pedida: d.cantidad_pedida,
        cantidad_recibida: Number(d.cantidad_recibida), unidad: d.unidad,
        precio_unitario: d.precio_unitario,
      })

      // Actualizar cantidad recibida en OC det
      if (d.id_oc_det_fk) {
        const ocDetRow = ocDet.find((o: any) => o.id === d.id_oc_det_fk)
        if (ocDetRow) {
          await dbComp.from('ordenes_compra_det').update({
            cant_recibida: (ocDetRow.cant_recibida ?? 0) + Number(d.cantidad_recibida)
          }).eq('id', d.id_oc_det_fk)
        }
      }

      // Entrada a inventario si tiene artículo
      if (d.id_articulo_fk) {
        await dbComp.rpc('fn_entrada_inventario', {
          p_articulo_id: d.id_articulo_fk,
          p_almacen_id:  Number(form.id_almacen_fk),
          p_cantidad:    Number(d.cantidad_recibida),
          p_precio:      d.precio_unitario,
          p_ref_tipo:    'RECEPCION',
          p_ref_id:      rec.id,
          p_ref_folio:   folio,
          p_usuario:     authUser?.nombre ?? 'Sistema',
        } as any)
      }
    }

    // Actualizar status de la OC
    const totalPendiente = ocDet.reduce((a: number, d: any) => a + (d.cant_pendiente ?? 0), 0)
    const totalRecibido  = detValidos.reduce((a, d) => a + Number(d.cantidad_recibida), 0)
    const nuevoStatus = totalRecibido >= totalPendiente ? 'Cerrada' : 'Recibida Parcial'
    await dbComp.from('ordenes_compra').update({ status: nuevoStatus }).eq('id', Number(form.id_oc_fk))

    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>Nueva Recepción de Mercancías</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Orden de Compra *</label>
              <select className="select" value={form.id_oc_fk} onChange={e => loadOC(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {ocs.map(o => <option key={o.id} value={o.id}>{o.folio}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Almacén Destino *</label>
              <select className="select" value={form.id_almacen_fk}
                onChange={e => setForm(f => ({ ...f, id_almacen_fk: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label className="label">Fecha Recepción</label>
              <input className="input" type="date" value={form.fecha_recepcion}
                onChange={e => setForm(f => ({ ...f, fecha_recepcion: e.target.value }))} />
            </div>
            <div><label className="label">No. Remisión</label>
              <input className="input" value={form.remision}
                onChange={e => setForm(f => ({ ...f, remision: e.target.value }))} />
            </div>
            <div><label className="label">Recibió *</label>
              <input className="input" value={form.recibio}
                onChange={e => setForm(f => ({ ...f, recibio: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Condición de la Mercancía</label>
            <select className="select" value={form.condicion}
              onChange={e => setForm(f => ({ ...f, condicion: e.target.value }))}>
              <option>Completa</option>
              <option>Parcial</option>
              <option>Con Daños</option>
            </select>
          </div>

          {det.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Cantidades Recibidas</div>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 90px 90px 70px', gap: 6, marginBottom: 4 }}>
                {['Descripción','Pedido','Recibido','Unidad'].map(h => (
                  <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{h}</div>
                ))}
              </div>
              {det.map((d, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 90px 90px 70px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 13 }}>{d.descripcion}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{d.cantidad_pedida}</span>
                  <input className="input" type="number" min="0" step="0.001" max={d.cantidad_pedida}
                    value={d.cantidad_recibida}
                    onChange={e => setDet(prev => prev.map((x,j) => j===i ? {...x, cantidad_recibida: e.target.value} : x))}
                    style={{ textAlign: 'right' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</span>
                </div>
              ))}
            </div>
          )}

          <div><label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Truck size={13} />} Registrar Recepción
          </button>
        </div>
      </div>
    </div>
  )
}

function RecepcionDetail({ rec, onClose }: { rec: any; onClose: () => void }) {
  const [det, setDet] = useState<any[]>([])
  useEffect(() => {
    dbComp.from('recepciones_det').select('*').eq('id_recepcion_fk', rec.id)
      .then(({ data }) => setDet(data ?? []))
  }, [rec.id])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{rec.folio}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(rec.fecha_recepcion)} · Recibió: {rec.recibio}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '18px 24px' }}>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table>
              <thead><tr><th>Descripción</th><th style={{ textAlign: 'right' }}>Pedido</th><th style={{ textAlign: 'right' }}>Recibido</th><th>Unidad</th></tr></thead>
              <tbody>
                {det.map((d,i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 13 }}>{d.descripcion}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{d.cantidad_pedida}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: d.cantidad_recibida < d.cantidad_pedida ? '#d97706' : '#15803d' }}>{d.cantidad_recibida}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rec.notas && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>Notas: {rec.notas}</p>}
        </div>
      </div>
    </div>
  )
}