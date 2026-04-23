'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Plus, Search, RefreshCw, Eye, X, Save, Loader, ArrowLeft, Truck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge, nextFolio } from '../types'
import ModalShell from '@/components/ui/ModalShell'

export default function RecepcionesPage() {
  const router = useRouter()
  const [rows, setRows]       = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const debouncedSearch = useDebounce(search, 300)
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
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [ocs, setOcs]             = useState<any[]>([])
  const [almacenes, setAlmacenes] = useState<any[]>([])
  const [ocDet, setOcDet]         = useState<any[]>([])
  const [tipoRecepcion, setTipoRecepcion] = useState<'completa' | 'parcial' | null>(null)
  const [cierraOC, setCierraOC]   = useState<boolean | null>(null)
  const [form, setForm] = useState({
    id_oc_fk:        '',
    id_almacen_fk:   '',
    fecha_recepcion: new Date().toISOString().slice(0, 10),
    remision:        '',
    recibio:         authUser?.nombre ?? '',
    notas:           '',
  })
  const [det, setDet] = useState<any[]>([])

  useEffect(() => {
    dbComp.from('ordenes_compra').select('id, folio, id_proveedor_fk')
      .in('status', ['Autorizada', 'Enviada al Prov', 'Recibida Parcial']).order('folio')
      .then(({ data }) => setOcs(data ?? []))
    dbComp.from('almacenes').select('*').eq('activo', true).eq('tipo', 'General').order('nombre')
      .then(({ data }) => setAlmacenes(data ?? []))
  }, [])

  const loadOC = async (ocId: string) => {
    setForm(f => ({ ...f, id_oc_fk: ocId }))
    setTipoRecepcion(null); setCierraOC(null); setDet([]); setOcDet([])
    if (!ocId) return
    const { data } = await dbComp.from('ordenes_compra_det').select('*').eq('id_oc_fk', Number(ocId))
    setOcDet(data ?? [])
  }

  const aplicarTipo = (tipo: 'completa' | 'parcial') => {
    setTipoRecepcion(tipo)
    setCierraOC(tipo === 'completa' ? true : null)
    setDet(ocDet.map((d: any) => ({
      id_oc_det_fk:      d.id,
      id_articulo_fk:    d.id_articulo_fk,
      descripcion:       d.descripcion,
      cantidad_pedida:   Number(d.cant_pendiente ?? d.cantidad),
      cantidad_recibida: tipo === 'completa'
        ? String(d.cant_pendiente ?? d.cantidad)
        : '0',
      unidad:            d.unidad,
      precio_unitario:   d.precio_unitario,
      cant_recibida_ant: d.cant_recibida ?? 0,
    })))
  }

  const handleSave = async () => {
    if (!form.id_oc_fk || !form.id_almacen_fk || !form.recibio) {
      setError('OC, Almacén y Recibió son obligatorios'); return
    }
    if (!tipoRecepcion) { setError('Selecciona el tipo de recepción'); return }
    const detValidos = det.filter(d => Number(d.cantidad_recibida) > 0)
    if (!detValidos.length) { setError('Ingresa al menos una cantidad recibida'); return }
    if (tipoRecepcion === 'parcial' && cierraOC === null) {
      setError('Indica si la OC quedará cerrada o pendiente'); return
    }
    setSaving(true); setError('')

    let folio: string
    try { folio = await nextFolio(dbComp, 'REC') } catch (e: any) { setError(e.message); setSaving(false); return }
    const condicion = tipoRecepcion === 'completa' ? 'Completa' : 'Parcial'

    const { data: rec, error: err } = await dbComp.from('recepciones').insert({
      folio, id_oc_fk: Number(form.id_oc_fk), id_almacen_fk: Number(form.id_almacen_fk),
      fecha_recepcion: form.fecha_recepcion, remision: form.remision || null,
      recibio: form.recibio, condicion, notas: form.notas || null,
    }).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }

    for (const d of detValidos) {
      await dbComp.from('recepciones_det').insert({
        id_recepcion_fk: rec.id, id_oc_det_fk: d.id_oc_det_fk,
        id_articulo_fk: d.id_articulo_fk || null,
        descripcion: d.descripcion, cantidad_pedida: d.cantidad_pedida,
        cantidad_recibida: Number(d.cantidad_recibida),
        unidad: d.unidad, precio_unitario: d.precio_unitario,
      })
      if (d.id_oc_det_fk) {
        await dbComp.from('ordenes_compra_det').update({
          cant_recibida: d.cant_recibida_ant + Number(d.cantidad_recibida)
        }).eq('id', d.id_oc_det_fk)
      }
      if (d.id_articulo_fk) {
        const almId   = Number(form.id_almacen_fk)
        const artId   = d.id_articulo_fk
        const cantRec = Number(d.cantidad_recibida)
        const precio  = Number(d.precio_unitario) || 0

        // Leer stock actual
        const { data: stockActual } = await dbComp
          .from('inventario')
          .select('id, cantidad, costo_promedio')
          .eq('id_articulo_fk', artId)
          .eq('id_almacen_fk', almId)
          .maybeSingle()

        const cantAntes   = Number(stockActual?.cantidad ?? 0)
        const cantDespues = cantAntes + cantRec
        // Método: costo última compra — se actualiza siempre con el precio de la recepción
        const nuevoCosto  = precio

        // Upsert inventario
        let invError: any = null
        if (stockActual) {
          const { error: upErr } = await dbComp.from('inventario').update({
            cantidad:        cantDespues,
            costo_promedio:  nuevoCosto,
          }).eq('id', stockActual.id)
          invError = upErr
        } else {
          const { error: insErr } = await dbComp.from('inventario').insert({
            id_articulo_fk: artId,
            id_almacen_fk:  almId,
            cantidad:        cantDespues,
            costo_promedio:  nuevoCosto,
          })
          invError = insErr
        }
        if (invError) { setError(`Error al actualizar inventario: ${invError.message}`); setSaving(false); return }

        // Registrar movimiento en kardex
        const { error: movErr } = await dbComp.from('movimientos_inv').insert({
          id_articulo_fk:  artId,
          id_almacen_fk:   almId,
          tipo_mov:         'ENTRADA',
          cantidad:         cantRec,
          cantidad_antes:   cantAntes,
          cantidad_despues: cantDespues,
          referencia_tipo:  'RECEPCION',
          referencia_folio: folio,
          usuario:          authUser?.nombre ?? 'Sistema',
        })
        if (movErr) { setError(`Error al registrar kardex: ${movErr.message}`); setSaving(false); return }
      }
    }

    const nuevoStatus = (tipoRecepcion === 'completa' || cierraOC === true) ? 'Cerrada' : 'Recibida Parcial'
    await dbComp.from('ordenes_compra').update({ status: nuevoStatus }).eq('id', Number(form.id_oc_fk))

    // Al cerrar la OC, cerrar también la requisición origen
    if (nuevoStatus === 'Cerrada') {
      const { data: oc } = await dbComp.from('ordenes_compra')
        .select('id_requisicion_fk').eq('id', Number(form.id_oc_fk)).single()
      if (oc?.id_requisicion_fk) {
        await dbComp.from('requisiciones')
          .update({ status: 'Completada' })
          .eq('id', oc.id_requisicion_fk)
      }
    }

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
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Orden de Compra *</label>
              <select className="select" value={form.id_oc_fk} onChange={e => loadOC(e.target.value)}>
                <option value="">— Seleccionar —</option>
                {ocs.map(o => <option key={o.id} value={o.id}>{o.folio}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Almacén General Destino *</label>
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
            <div><label className="label">No. Remisión / Factura</label>
              <input className="input" value={form.remision}
                onChange={e => setForm(f => ({ ...f, remision: e.target.value }))} />
            </div>
            <div><label className="label">Recibió *</label>
              <input className="input" value={form.recibio}
                onChange={e => setForm(f => ({ ...f, recibio: e.target.value }))} />
            </div>
          </div>

          {/* Selector tipo recepción */}
          {ocDet.length > 0 && !tipoRecepcion && (
            <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>¿Cómo llega la mercancía?</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={() => aplicarTipo('completa')}
                  style={{ padding: '14px 16px', borderRadius: 10, border: '2px solid #bbf7d0',
                    background: '#f0fdf4', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d', marginBottom: 4 }}>✓ Recepción Completa</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Se recibe todo lo pendiente. La OC se cierra.</div>
                </button>
                <button onClick={() => aplicarTipo('parcial')}
                  style={{ padding: '14px 16px', borderRadius: 10, border: '2px solid #fde68a',
                    background: '#fffbeb', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>⚡ Recepción Parcial</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Solo parte de la mercancía. Define cantidad por artículo.</div>
                </button>
              </div>
            </div>
          )}

          {/* Tabla artículos */}
          {tipoRecepcion && det.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Artículos — {tipoRecepcion === 'completa' ? 'Recepción Completa' : 'Recepción Parcial'}
                </div>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setTipoRecepcion(null); setCierraOC(null) }}>
                  Cambiar tipo
                </button>
              </div>
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Artículo / Descripción</th>
                      <th style={{ textAlign: 'right' }}>Pendiente</th>
                      <th style={{ textAlign: 'right', width: 120 }}>Recibido</th>
                      <th>Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {det.map((d, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 13 }}>{d.descripcion}</td>
                        <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{d.cantidad_pedida}</td>
                        <td style={{ textAlign: 'right' }}>
                          {tipoRecepcion === 'completa' ? (
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>{d.cantidad_recibida}</span>
                          ) : (
                            <input className="input" type="number" min="0" step="0.001" max={d.cantidad_pedida}
                              value={d.cantidad_recibida}
                              onChange={e => setDet(prev => prev.map((x, j) => j === i ? { ...x, cantidad_recibida: e.target.value } : x))}
                              style={{ textAlign: 'right', width: 100 }} />
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pregunta cierre OC — solo parcial */}
          {tipoRecepcion === 'parcial' && det.length > 0 && (
            <div style={{ padding: '14px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#d97706', marginBottom: 10 }}>
                ¿Qué ocurre con la OC después de esta recepción?
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setCierraOC(false)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${cierraOC === false ? '#d97706' : '#e2e8f0'}`,
                    background: cierraOC === false ? '#fffbeb' : '#fff', textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>⏳ Queda pendiente</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>La OC pasa a "Recibida Parcial" — habrá más entregas.</div>
                </button>
                <button onClick={() => setCierraOC(true)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${cierraOC === true ? '#2563eb' : '#e2e8f0'}`,
                    background: cierraOC === true ? '#eff6ff' : '#fff', textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--blue)' }}>✓ Cerrar OC</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>La OC se cierra con lo recibido hasta ahora.</div>
                </button>
              </div>
            </div>
          )}

          <div><label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !tipoRecepcion}>
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