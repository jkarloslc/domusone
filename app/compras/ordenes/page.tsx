'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  ArrowLeft, CheckCircle, XCircle, Printer, Trash2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge, type Proveedor, UNIDADES, FORMAS_PAGO_COMP, nextFolio } from '../types'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZE = 20

export default function OrdenesPage() {
  const { authUser, canWrite, canAuth: canAuthFn } = useAuth()
  const router = useRouter()
  const [rows, setRows]       = useState<any[]>([])
  const [provMap, setProvMap] = useState<Record<number, string>>({})
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(0)
  const [search, setSearch]   = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilter] = useState('')
  const [filterCC, setFilterCC] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [ccFiltros, setCcFiltros] = useState<{ id: number; nombre: string }[]>([])
  const [secFiltros, setSecFiltros] = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<any | null | 'new'>(null)
  const [detail, setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('ordenes_compra').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterCC) q = q.eq('id_centro_costo_fk', Number(filterCC))
    if (filterArea) q = q.eq('id_area_fk', Number(filterArea))
    if (debouncedSearch) q = q.ilike('folio', `%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0)
    const { data: provs } = await dbComp.from('proveedores').select('id, nombre')
    const m: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { m[p.id] = p.nombre })
    setProvMap(m)
    setLoading(false)
  }, [page, debouncedSearch, filterStatus, filterCC, filterArea])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCcFiltros((data ?? []) as { id: number; nombre: string }[]))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setSecFiltros((data ?? []) as { id: number; nombre: string; id_centro_costo_fk: number }[]))
  }, [])

  const canAuth = canAuthFn('ordenes')

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
          <select className="select" style={{ width: 220 }} value={filterCC}
            onChange={e => { setFilterCC(e.target.value); setFilterArea(''); setPage(0) }}>
            <option value="">Todos los centros de costo</option>
            {ccFiltros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="select" style={{ width: 200 }} value={filterArea}
            onChange={e => { setFilterArea(e.target.value); setPage(0) }}>
            <option value="">Todas las áreas</option>
            {secFiltros
              .filter(s => !filterCC || s.id_centro_costo_fk === Number(filterCC))
              .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {canWrite('ordenes') && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nueva OC</button>}
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

function OCModal({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const isNew = !row
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [proveedores, setProvs] = useState<Proveedor[]>([])
  const [almacenes, setAlms]    = useState<any[]>([])
  const [centrosCosto, setCentros] = useState<any[]>([])
  const [areas, setAreas]  = useState<any[]>([])
  const [frentes, setFrentes]      = useState<any[]>([])
  const [areaId, setAreaId]  = useState<string>(row?.id_area_fk?.toString() ?? '')
  const [rfqs, setRFQs]         = useState<any[]>([])
  const [form, setForm] = useState({
    id_proveedor_fk:       row?.id_proveedor_fk?.toString() ?? '',
    id_rfq_fk:             row?.id_rfq_fk?.toString() ?? '',
    fecha_entrega_est:     row?.fecha_entrega_est ?? '',
    condiciones_pago:      row?.condiciones_pago ?? '',
    id_almacen_entrega_fk: row?.id_almacen_entrega_fk?.toString() ?? '',
    id_centro_costo_fk:    row?.id_centro_costo_fk?.toString() ?? '',
    id_area_fk:         row?.id_area_fk?.toString() ?? '',
    id_frente_fk:          row?.id_frente_fk?.toString() ?? '',
    notas:                 row?.notas ?? '',
  })
  const [det, setDet] = useState<any[]>([{ id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', precio_unitario: '', tasa_iva: '0' }])
  const [artSearches, setArtSearches] = useState<string[]>([''])
  const [artOptions,  setArtOptions]  = useState<any[][]>([[]])

  useEffect(() => {
    dbComp.from('proveedores').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => setProvs(data as Proveedor[] ?? []))
    dbComp.from('almacenes').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setAlms(data ?? []))
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCentros(data ?? []))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setAreas(data ?? []))
    dbCfg.from('frentes').select('id, nombre, id_area_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setFrentes(data ?? []))
    ;(async () => {
      const { data: rfqsConOC } = await dbComp.from('ordenes_compra').select('id_rfq_fk').not('id_rfq_fk', 'is', null)
      const rfqsUsadas = new Set((rfqsConOC ?? []).map((r: any) => r.id_rfq_fk))
      const { data } = await dbComp.from('rfq').select('id, folio, proveedor_ganador').eq('status', 'Cerrada')
      setRFQs((data ?? []).filter((r: any) => !rfqsUsadas.has(r.id)))
    })()
  }, [])

  const aplicarRFQ = async (rfqId: string) => {
    setForm(f => ({ ...f, id_rfq_fk: rfqId }))
    if (!rfqId) {
      // Limpiar precarga si el usuario deselecciona el RFQ
      setDet([{ id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', precio_unitario: '', tasa_iva: '0' }])
      setArtSearches(['']); setArtOptions([[]])
      return
    }

    // 1. Proveedor ganador desde el state local (ya cargado)
    const rfq = rfqs.find(r => r.id === Number(rfqId))
    if (rfq?.proveedor_ganador) setForm(f => ({ ...f, id_proveedor_fk: rfq.proveedor_ganador.toString() }))

    // 2. Cotización seleccionada + detalle de artículos
    const { data: cot } = await dbComp.from('rfq_cotizaciones')
      .select('*, rfq_cotizaciones_det!id_cotizacion_fk(*)')
      .eq('id_rfq_fk', Number(rfqId)).eq('seleccionada', true).maybeSingle()

    if (cot?.rfq_cotizaciones_det?.length) {
      // Recuperar id_articulo_fk desde requisiciones_det usando id_requisicion_det_fk
      // ya que rfq_cotizaciones_det no almacena el vínculo al catálogo directamente
      const reqDetIds = (cot.rfq_cotizaciones_det as any[])
        .map((d: any) => d.id_requisicion_det_fk).filter(Boolean) as number[]

      // Mapa: req_det_id → { id_articulo_fk, clave, nombre }
      const artMap: Record<number, { id: number | null; clave: string; nombre: string }> = {}
      if (reqDetIds.length) {
        const { data: reqDets } = await dbComp.from('requisiciones_det')
          .select('id, id_articulo_fk').in('id', reqDetIds)
        const artIds = ((reqDets ?? []) as any[]).map((r: any) => r.id_articulo_fk).filter(Boolean) as number[]
        const artNombres: Record<number, { clave: string; nombre: string }> = {}
        if (artIds.length) {
          const { data: arts } = await dbComp.from('articulos').select('id, clave, nombre').in('id', artIds)
          ;(arts ?? []).forEach((a: any) => { artNombres[a.id] = { clave: a.clave, nombre: a.nombre } })
        }
        ;(reqDets ?? []).forEach((rd: any) => {
          artMap[rd.id] = {
            id:     rd.id_articulo_fk,
            clave:  artNombres[rd.id_articulo_fk]?.clave  ?? '',
            nombre: artNombres[rd.id_articulo_fk]?.nombre ?? '',
          }
        })
      }

      const items = (cot.rfq_cotizaciones_det as any[]).map((d: any) => {
        const art = d.id_requisicion_det_fk ? artMap[d.id_requisicion_det_fk] : null
        return {
          id_articulo_fk:  art?.id ?? null,
          descripcion:     d.descripcion   ?? '',
          cantidad:        d.cantidad?.toString()       ?? '1',
          unidad:          d.unidad        ?? 'PZA',
          precio_unitario: d.precio_unitario?.toString() ?? '',
          tasa_iva:        d.tasa_iva?.toString()        ?? '0',
        }
      })
      setDet(items)
      // Poblar artSearches con el nombre del artículo para que se vea en la UI
      setArtSearches(items.map((item: any) => {
        const art = item.id_articulo_fk
          ? Object.values(artMap).find(a => a.id === item.id_articulo_fk)
          : null
        return art?.clave && art?.nombre ? `${art.clave} — ${art.nombre}` : ''
      }))
      setArtOptions(new Array(items.length).fill([]))
      setForm(f => ({ ...f, condiciones_pago: cot.condiciones_pago ?? f.condiciones_pago }))
    }

    // 3. CC / Sección / Frente desde la requisición vinculada al RFQ
    // Consolidamos en un solo query trayendo rfq + requisición en una sola consulta
    const { data: rfqData } = await dbComp.from('rfq')
      .select('id_requisicion_fk, requisiciones(id_centro_costo_fk, id_area_fk, id_frente_fk)')
      .eq('id', Number(rfqId)).maybeSingle()

    const req = (rfqData as any)?.requisiciones
    if (req) {
      const secId = req.id_area_fk?.toString() ?? ''
      setAreaId(secId)
      setForm(f => ({
        ...f,
        id_centro_costo_fk: req.id_centro_costo_fk?.toString() ?? f.id_centro_costo_fk,
        id_area_fk:         secId                              || f.id_area_fk,
        id_frente_fk:       req.id_frente_fk?.toString()       ?? f.id_frente_fk,
      }))
    }
  }

  const setD = (i: number, k: string, v: string) =>
    setDet(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const buscarArticulos = async (i: number, q: string) => {
    setArtSearches(p => { const n = [...p]; n[i] = q; return n })
    if (q.trim().length < 2) { setArtOptions(p => { const n = [...p]; n[i] = []; return n }); return }
    const { data } = await dbComp.from('articulos')
      .select('id, clave, nombre, unidad, precio_ref').eq('activo', true)
      .or(`clave.ilike.%${q}%,nombre.ilike.%${q}%`).order('nombre').limit(20)
    setArtOptions(p => { const n = [...p]; n[i] = data ?? []; return n })
  }

  const seleccionarArticulo = (i: number, art: any) => {
    setDet(d => d.map((x, j) => j === i ? {
      ...x, id_articulo_fk: art.id, descripcion: art.nombre,
      unidad: art.unidad ?? x.unidad,
      precio_unitario: art.precio_ref ? art.precio_ref.toString() : x.precio_unitario,
    } : x))
    setArtSearches(p => { const n = [...p]; n[i] = `${art.clave} — ${art.nombre}`; return n })
    setArtOptions(p => { const n = [...p]; n[i] = []; return n })
  }

  const addDetLine = () => {
    setDet(d => [...d, { id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', precio_unitario: '', tasa_iva: '0' }])
    setArtSearches(p => [...p, '']); setArtOptions(p => [...p, []])
  }

  const subtotal = det.reduce((a, d) => a + Number(d.cantidad||0) * Number(d.precio_unitario||0), 0)
  const iva      = det.reduce((a, d) => a + Number(d.cantidad||0) * Number(d.precio_unitario||0) * Number(d.tasa_iva||0), 0)

  const handleSave = async (enviar = false) => {
    if (!form.id_proveedor_fk) { setError('Selecciona un proveedor'); return }
    if (!form.id_centro_costo_fk) { setError('Centro de Costo es obligatorio'); return }
    if (!form.id_area_fk) { setError('Área es obligatoria'); return }
    const detValidos = det.filter(d => d.descripcion && Number(d.precio_unitario) > 0)
    if (!detValidos.length) { setError('Agrega al menos un producto con precio'); return }
    setSaving(true); setError('')
    let folio: string
    try { folio = await nextFolio(dbComp, 'OC') } catch (e: any) { setError(e.message); setSaving(false); return }
    const { data: oc, error: err } = await dbComp.from('ordenes_compra').insert({
      folio,
      id_proveedor_fk:       Number(form.id_proveedor_fk),
      id_rfq_fk:             form.id_rfq_fk ? Number(form.id_rfq_fk) : null,
      fecha_entrega_est:     form.fecha_entrega_est || null,
      condiciones_pago:      form.condiciones_pago || null,
      id_almacen_entrega_fk: form.id_almacen_entrega_fk ? Number(form.id_almacen_entrega_fk) : null,
      id_centro_costo_fk:    form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
      id_area_fk:            form.id_area_fk ? Number(form.id_area_fk) : null,
      id_frente_fk:          form.id_frente_fk ? Number(form.id_frente_fk) : null,
      notas:                 form.notas.trim() || null,
      subtotal, iva, total: subtotal + iva,
      status:     enviar ? 'Pendiente Auth' : 'Borrador',
      created_by: authUser?.nombre ?? null,
    }).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }
    await dbComp.from('ordenes_compra_det').insert(
      detValidos.map(d => ({
        id_oc_fk: oc.id, descripcion: d.descripcion.trim(),
        id_articulo_fk: d.id_articulo_fk ?? null,
        cantidad: Number(d.cantidad), unidad: d.unidad,
        precio_unitario: Number(d.precio_unitario), tasa_iva: Number(d.tasa_iva),
      }))
    )
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="compras" titulo="Nueva Orden de Compra" onClose={onClose} maxWidth={720}
      footer={<>          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-secondary" onClick={() => handleSave(false)} disabled={saving}><Save size={13} /> Borrador</button>
          <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />} Enviar para Autorización
          </button></>}
    >
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
                <label className="label">Almacén de Entrega</label>
                <select className="select" value={form.id_almacen_entrega_fk}
                  onChange={e => setForm(f => ({ ...f, id_almacen_entrega_fk: e.target.value }))}>
                  <option value="">— Sin asignar —</option>
                  {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Centro de Costo *</label>
                <select className="select" value={form.id_centro_costo_fk}
                  onChange={e => { setAreaId(''); setForm(f => ({ ...f, id_centro_costo_fk: e.target.value, id_area_fk: '', id_frente_fk: '' })) }}>
                  <option value="">— Seleccionar —</option>
                  {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Sección *</label>
                <select className="select" value={areaId}
                  onChange={e => { setAreaId(e.target.value); setForm(f => ({ ...f, id_area_fk: e.target.value, id_frente_fk: '' })) }}
                  disabled={!form.id_centro_costo_fk}>
                  <option value="">— {form.id_centro_costo_fk ? 'Seleccionar' : 'Elige CC primero'} —</option>
                  {areas
                    .filter(s => !form.id_centro_costo_fk || (s as any).id_centro_costo_fk === Number(form.id_centro_costo_fk))
                    .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Frente</label>
                <select className="select" value={form.id_frente_fk}
                  onChange={e => setForm(f => ({ ...f, id_frente_fk: e.target.value }))}
                  disabled={!areaId}>
                  <option value="">— {areaId ? 'Seleccionar' : 'Elige área primero'} —</option>
                  {frentes.filter(f => !areaId || f.id_area_fk === Number(areaId))
                    .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
              </div>
            </div>
          </Sec>

          <Sec label="Productos">
            {det.map((d, i) => (
              <div key={i} style={{ padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <label className="label">Artículo</label>
                  <input className="input" placeholder="Escribe clave o nombre…"
                    value={artSearches[i] ?? ''} onChange={e => buscarArticulos(i, e.target.value)} />
                  {(artOptions[i]?.length ?? 0) > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                      boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                      {artOptions[i].map((a: any) => (
                        <button key={a.id} onMouseDown={e => { e.preventDefault(); seleccionarArticulo(i, a) }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--blue)' }}>{a.clave}</span>
                          <span style={{ fontSize: 13, marginLeft: 8 }}>{a.nombre}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{a.unidad}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label className="label">Descripción / Especificaciones</label>
                  <input className="input" value={d.descripcion} onChange={e => setD(i, 'descripcion', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 80px 100px 90px 28px', gap: 8, alignItems: 'end' }}>
                  <div><label className="label">Cantidad</label>
                    <input className="input" type="number" value={d.cantidad} onChange={e => setD(i, 'cantidad', e.target.value)} style={{ textAlign: 'right' }} />
                  </div>
                  <div><label className="label">Unidad</label>
                    <select className="select" value={d.unidad} onChange={e => setD(i, 'unidad', e.target.value)}>
                      {UNIDADES.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Precio Unit.</label>
                    <input className="input" type="number" step="0.01" value={d.precio_unitario} onChange={e => setD(i, 'precio_unitario', e.target.value)} style={{ textAlign: 'right' }} />
                  </div>
                  <div><label className="label">IVA</label>
                    <select className="select" value={d.tasa_iva} onChange={e => setD(i, 'tasa_iva', e.target.value)}>
                      <option value="0">Exento</option><option value="0.16">16%</option><option value="0.08">8%</option>
                    </select>
                  </div>
                  <button className="btn-ghost" style={{ padding: '6px 4px' }}
                    onClick={() => { setDet(d => d.filter((_, j) => j !== i)); setArtSearches(p => p.filter((_, j) => j !== i)); setArtOptions(p => p.filter((_, j) => j !== i)) }}>
                    <Trash2 size={12} />
                  </button>
                </div>
                {d.cantidad && d.precio_unitario && (
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    Subtotal: <strong style={{ color: 'var(--blue)' }}>{fmt(Number(d.cantidad) * Number(d.precio_unitario) * (1 + Number(d.tasa_iva || 0)))}</strong>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button className="btn-ghost" onClick={addDetLine}><Plus size={12} /> Agregar producto</button>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--blue)' }}>Total: {fmt(subtotal + iva)}</div>
            </div>
          </Sec>

          <div>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
    </ModalShell>
    </div>
  )
}

function OCDetail({ oc, canAuth, onClose, onAuth }: { oc: any; canAuth: boolean; onClose: () => void; onAuth: (id: number, ap: boolean, c: string) => void }) {
  const [det, setDet]       = useState<any[]>([])
  const [op, setOP]         = useState<any | null>(null)
  const [almMap, setAlmMap] = useState<Record<number, string>>({})
  const [ccMap,  setCcMap]  = useState<Record<number, string>>({})
  const [areaMap,setAreaMap]= useState<Record<number, string>>({})
  const [frMap,  setFrMap]  = useState<Record<number, string>>({})
  const [comentario, setCom]    = useState('')
  const [creandoOP, setCreandoOP] = useState(false)
  const [savingOP, setSavingOP]   = useState(false)
  const [opForm, setOpForm] = useState({ forma_pago: 'Transferencia', fecha_vencimiento: '', concepto: `OC ${oc.folio}`, notas: '' })

  useEffect(() => {
    dbComp.from('ordenes_compra_det').select('*').eq('id_oc_fk', oc.id).then(({ data }) => setDet(data ?? []))
    dbComp.from('ordenes_pago').select('*').eq('id_oc_fk', oc.id).maybeSingle().then(({ data }) => setOP(data))
    dbComp.from('almacenes').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}
      ;(data ?? []).forEach((a: any) => { m[a.id] = a.nombre })
      setAlmMap(m)
    })
    dbCfg.from('centros_costo').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}
      ;(data ?? []).forEach((a: any) => { m[a.id] = a.nombre })
      setCcMap(m)
    })
    dbCfg.from('areas').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}
      ;(data ?? []).forEach((a: any) => { m[a.id] = a.nombre })
      setAreaMap(m)
    })
    dbCfg.from('frentes').select('id, nombre').then(({ data }) => {
      const m: Record<number, string> = {}
      ;(data ?? []).forEach((a: any) => { m[a.id] = a.nombre })
      setFrMap(m)
    })
  }, [oc.id])

  const crearOrdenPago = async () => {
    setSavingOP(true)
    let folioOP: string
    try { folioOP = await nextFolio(dbComp, 'OP') } catch (e: any) { setSavingOP(false); alert(e.message); return }
    await dbComp.from('ordenes_pago').insert({
      folio: folioOP, id_oc_fk: oc.id, id_proveedor_fk: oc.id_proveedor_fk,
      id_almacen_fk: oc.id_almacen_entrega_fk ?? null,
      monto: oc.total, forma_pago: opForm.forma_pago,
      fecha_vencimiento: opForm.fecha_vencimiento || null,
      concepto: opForm.concepto, notas: opForm.notas || null, status: 'Pendiente',
    })
    setSavingOP(false); setCreandoOP(false)
    dbComp.from('ordenes_pago').select('*').eq('id_oc_fk', oc.id).maybeSingle().then(({ data }) => setOP(data))
  }

  const imprimirOP = async () => {
    if (!op) return
    // Fresh fetch del OP para asegurar campos actualizados (created_by, autorizado_por, referencia_pago, etc.)
    const { data: freshOP } = await dbComp.from('ordenes_pago').select('*').eq('id', op.id).single()
    const opData = freshOP ? { ...op, ...freshOP } : op

    // Cargar CC/Área/Frente y config org en paralelo
    let orgNombre = 'Organización'
    let orgSubtitulo = ''
    let orgLogo = ''
    const ccMap2: Record<number, string> = {}
    const areaMap2: Record<number, string> = {}
    const frMap2: Record<number, string> = {}
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const sbCfg = sb.schema('cfg' as any)
      const [cfgRows, ccRows, areaRows, frRows] = await Promise.all([
        sbCfg.from('configuracion').select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url']),
        sbCfg.from('centros_costo').select('id, nombre'),
        sbCfg.from('areas').select('id, nombre'),
        sbCfg.from('frentes').select('id, nombre'),
      ])
      ;(cfgRows.data ?? []).forEach((r: any) => {
        if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
      })
      ;(ccRows.data ?? []).forEach((r: any) => { ccMap2[r.id] = r.nombre })
      ;(areaRows.data ?? []).forEach((r: any) => { areaMap2[r.id] = r.nombre })
      ;(frRows.data ?? []).forEach((r: any) => { frMap2[r.id] = r.nombre })
    } catch {}

    const provNombre = opData._provNombre ?? oc._provNombre ?? '—'
    const almNombre  = opData._almNombre ?? almMap[oc.id_almacen_entrega_fk] ?? '—'

    const logoHtml = orgLogo
      ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
      : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`
    const html = `<!DOCTYPE html><html><head><title>Orden de Pago ${opData.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 18px; }
        .org-nombre { font-size: 18px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 14px; font-weight: 600; color: #0D4F80; margin-bottom: 2px; }
        .sub { color: #64748b; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 8px 12px; }
        th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
        .total { background: #eff6ff; font-size: 16px; font-weight: 700; color: #0D4F80; }
        .firmas { display: flex; gap: 60px; margin-top: 60px; }
        .firma { text-align: center; border-top: 1px solid #000; padding-top: 8px; width: 180px; font-size: 11px; color: #64748b; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="doc-title">Orden de Pago</div>
          <div class="sub" style="margin:0">Folio: <strong>${opData.folio}</strong> &nbsp;·&nbsp; Fecha: ${fmtFecha(opData.fecha_op)}</div>
        </div>
      </div>
      <table>
        <tr><th>Beneficiario</th><td>${provNombre}</td><th>Banco</th><td>${opData.banco_destino ?? '—'}</td></tr>
        <tr><th>CLABE / Cuenta</th><td style="font-family:monospace">${opData.cuenta_clabe ?? '—'}</td><th>Forma de Pago</th><td>${opData.forma_pago}</td></tr>
        <tr><th>Concepto</th><td colspan="3">${opData.concepto ?? '—'}</td></tr>
        <tr><th>Almacén</th><td>${almNombre}</td><th>Vencimiento</th><td>${fmtFecha(opData.fecha_vencimiento)}</td></tr>
        ${opData.tipo_gasto ? `<tr><th>Tipo de Gasto</th><td colspan="3">${opData.tipo_gasto}</td></tr>` : ''}
        ${opData.id_centro_costo_fk ? `<tr><th>Centro de Costo</th><td>${ccMap2[opData.id_centro_costo_fk] ?? `#${opData.id_centro_costo_fk}`}</td><th>Área</th><td>${opData.id_area_fk ? (areaMap2[opData.id_area_fk] ?? `#${opData.id_area_fk}`) : '—'}</td></tr>` : ''}
        ${opData.id_frente_fk ? `<tr><th>Frente</th><td colspan="3">${frMap2[opData.id_frente_fk] ?? `#${opData.id_frente_fk}`}</td></tr>` : ''}
        <tr><th>OC Relacionada</th><td colspan="3">${oc.folio}</td></tr>
        <tr><th class="total">TOTAL A PAGAR</th><td colspan="3" class="total">${fmt(opData.monto)}</td></tr>
      </table>
      ${opData.notas ? `<p style="font-size:12px;color:#64748b"><em>Notas: ${opData.notas}</em></p>` : ''}

      ${(opData.autorizado_por || opData.fecha_autorizacion || opData.instrucciones_pago || opData.referencia_pago) ? `
      <div style="margin-top:18px;border:1px solid #bfdbfe;border-radius:8px;overflow:hidden">
        <div style="background:#eff6ff;padding:8px 14px;font-size:11px;font-weight:700;color:#1e40af;letter-spacing:.06em;text-transform:uppercase">
          Autorización y Control de Pago
        </div>
        <table style="margin:0">
          ${opData.autorizado_por     ? `<tr><th>Autorizado por</th><td>${opData.autorizado_por}</td></tr>` : ''}
          ${opData.fecha_autorizacion ? `<tr><th>Fecha autorización</th><td>${new Date(opData.fecha_autorizacion).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})}</td></tr>` : ''}
          ${opData.referencia_pago    ? `<tr><th>Ref. de Pago</th><td style="font-family:monospace">${opData.referencia_pago}</td></tr>` : ''}
          ${opData.instrucciones_pago ? `<tr><th>Instrucciones</th><td style="white-space:pre-wrap;color:#92400e;background:#fffbeb">${opData.instrucciones_pago}</td></tr>` : ''}
        </table>
      </div>` : ''}

      <div class="firmas">
        <div class="firma">
          ${opData.created_by ? `<div style="margin-bottom:2px;font-weight:600;color:#1e293b">${opData.created_by}</div>` : ''}
          Elaboró
        </div>
        <div class="firma">
          ${opData.autorizado_por ? `<div style="margin-bottom:2px;font-weight:600;color:#1e293b">${opData.autorizado_por}</div>` : ''}
          Autorizó
          ${opData.fecha_autorizacion ? `<div style="font-size:10px;color:#64748b;margin-top:2px">${new Date(opData.fecha_autorizacion).toLocaleDateString('es-MX',{dateStyle:'short'})}</div>` : ''}
        </div>
        <div class="firma">Recibió</div>
      </div>
      </body></html>`
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(html)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  return (
    <ModalShell modulo="compras" titulo="Compras" onClose={onClose} maxWidth={660}
    >
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
                  <tr style={{ background: '#f8fafc' }}><td colSpan={3}></td><td style={{ fontWeight: 600, textAlign: 'right' }}>Subtotal</td><td style={{ fontWeight: 600, textAlign: 'right' }}>{fmt(oc.subtotal)}</td><td></td></tr>
                  <tr style={{ background: 'var(--blue-pale)' }}><td colSpan={3}></td><td style={{ fontWeight: 700, color: 'var(--blue)', textAlign: 'right' }}>TOTAL</td><td style={{ fontWeight: 700, color: 'var(--blue)', textAlign: 'right', fontSize: 15 }}>{fmt(oc.total)}</td><td></td></tr>
                </tbody>
              </table>
            </div>
          </Sec>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            <DI label="Condiciones de Pago" value={oc.condiciones_pago} />
            <DI label="Entrega Estimada"    value={fmtFecha(oc.fecha_entrega_est)} />
            <DI label="Almacén de Entrega"  value={oc.id_almacen_entrega_fk ? (almMap[oc.id_almacen_entrega_fk] ?? `#${oc.id_almacen_entrega_fk}`) : null} />
            {oc.autorizado_por    && <DI label="Autorizado por" value={`${oc.autorizado_por} — ${fmtFecha(oc.fecha_autorizacion)}`} />}
            {oc.comentario_auth   && <DI label="Comentario"     value={oc.comentario_auth} />}
            {oc.id_centro_costo_fk && <DI label="Centro de Costo" value={ccMap[oc.id_centro_costo_fk] ?? `#${oc.id_centro_costo_fk}`} />}
            {oc.id_area_fk         && <DI label="Área"            value={areaMap[oc.id_area_fk]        ?? `#${oc.id_area_fk}`}        />}
            {oc.id_frente_fk       && <DI label="Frente"          value={frMap[oc.id_frente_fk]        ?? `#${oc.id_frente_fk}`}        />}
          </div>

          {canAuth && oc.status === 'Pendiente Auth' && (
            <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Autorización de Orden de Compra</div>
              <textarea className="input" rows={2} value={comentario} onChange={e => setCom(e.target.value)}
                placeholder="Comentario (opcional)" style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => onAuth(oc.id, true, comentario)} style={{ flex: 1 }}><CheckCircle size={13} /> Autorizar OC</button>
                <button onClick={() => onAuth(oc.id, false, comentario)}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 7, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  <XCircle size={13} /> Rechazar
                </button>
              </div>
            </div>
          )}

          {oc.status === 'Autorizada' && !op && !creandoOP && (
            <div style={{ textAlign: 'center' }}>
              <button className="btn-primary" onClick={() => setCreandoOP(true)}><Plus size={13} /> Generar Orden de Pago</button>
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
                <DI label="Monto"         value={fmt(op.monto)} />
                <DI label="Forma de Pago" value={op.forma_pago} />
                <DI label="Vencimiento"   value={fmtFecha(op.fecha_vencimiento)} />
                <DI label="Concepto"      value={op.concepto} />
              </div>
            </div>
          )}
    </ModalShell>
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
