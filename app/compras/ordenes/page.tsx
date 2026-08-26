'use client'
import ModalShell from '@/components/ui/ModalShell'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, Save, Loader, Pencil,
  ArrowLeft, CheckCircle, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, nextFolio, StatusBadge, type Proveedor, UNIDADES, FORMAS_PAGO_COMP } from '../types'
import { OCDetail } from '@/components/compras/OCDetailModal'

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
  const [filterProv, setFilterProv] = useState('')
  const [filterFechaDesde, setFilterFechaDesde] = useState('')
  const [filterFechaHasta, setFilterFechaHasta] = useState('')
  const [ccFiltros, setCcFiltros] = useState<{ id: number; nombre: string }[]>([])
  const [areaFiltros, setAreaFiltros] = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
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
    if (filterProv) q = q.eq('id_proveedor_fk', Number(filterProv))
    if (filterFechaDesde) q = q.gte('created_at', `${filterFechaDesde}T00:00:00`)
    if (filterFechaHasta) q = q.lte('created_at', `${filterFechaHasta}T23:59:59`)
    if (debouncedSearch) q = q.ilike('folio', `%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0)
    const { data: provs } = await dbComp.from('proveedores').select('id, nombre')
    const m: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { m[p.id] = p.nombre })
    setProvMap(m)
    setLoading(false)
  }, [page, debouncedSearch, filterStatus, filterCC, filterArea, filterProv, filterFechaDesde, filterFechaHasta])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCcFiltros((data ?? []) as { id: number; nombre: string }[]))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setAreaFiltros((data ?? []) as { id: number; nombre: string; id_centro_costo_fk: number }[]))
  }, [])

  const canAuth = canAuthFn('ordenes')
  const totalPages = Math.ceil(total / PAGE_SIZE)

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
            {areaFiltros
              .filter(s => !filterCC || s.id_centro_costo_fk === Number(filterCC))
              .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <select className="select" style={{ width: 220 }} value={filterProv}
            onChange={e => { setFilterProv(e.target.value); setPage(0) }}>
            <option value="">Todos los proveedores</option>
            {Object.entries(provMap).sort((a, b) => a[1].localeCompare(b[1])).map(([id, nombre]) => (
              <option key={id} value={id}>{nombre}</option>
            ))}
          </select>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {canWrite('ordenes') && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nueva OC</button>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fecha creación:</span>
        <input className="input" type="date" style={{ width: 150 }} value={filterFechaDesde}
          onChange={e => { setFilterFechaDesde(e.target.value); setPage(0) }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
        <input className="input" type="date" style={{ width: 150 }} value={filterFechaHasta}
          onChange={e => { setFilterFechaHasta(e.target.value); setPage(0) }} />
        {(filterFechaDesde || filterFechaHasta) && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => { setFilterFechaDesde(''); setFilterFechaHasta(''); setPage(0) }}>
            Limpiar fechas
          </button>
        )}
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
                <td style={{ display: 'flex', gap: 2 }}>
                  {canWrite('ordenes') && r.status === 'Borrador' && (
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal({ ...r, _provNombre: provMap[r.id_proveedor_fk] })}><Pencil size={13} /></button>
                  )}
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail({ ...r, _provNombre: provMap[r.id_proveedor_fk] })}><Eye size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pág. {page + 1} de {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {modal !== null && <OCModal row={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />}
      {detail && <OCDetail oc={detail} canAuth={canAuth} onClose={() => { setDetail(null); fetchData() }} onAuth={handleAuth}
        onEdit={canWrite('ordenes') && detail.status === 'Borrador' ? () => { const d = detail; setDetail(null); setModal(d) } : undefined} />}
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
  const [ccAreas, setCcAreas]      = useState<any[]>([])
  const [frentes, setFrentes]      = useState<any[]>([])
  const [relAF,   setRelAF]        = useState<{id_area: number; id_frente: number}[]>([])
  const [areaId, setAreaId]        = useState<string>(row?.id_area_fk?.toString() ?? '')
  const [rfqs, setRFQs]         = useState<any[]>([])
  // Opciones de proveedor cuando la RFQ tiene múltiples ganadores
  const [rfqMultiProvs, setRfqMultiProvs] = useState<{cotId: number; provId: number; nombre: string; items: any[]; yaCreada?: boolean}[]>([])
  const [form, setForm] = useState({
    id_proveedor_fk:       row?.id_proveedor_fk?.toString() ?? '',
    id_rfq_fk:             row?.id_rfq_fk?.toString() ?? '',
    fecha_entrega_est:     row?.fecha_entrega_est ?? '',
    condiciones_pago:      row?.condiciones_pago ?? '',
    id_almacen_entrega_fk: row?.id_almacen_entrega_fk?.toString() ?? '',
    id_centro_costo_fk:    row?.id_centro_costo_fk?.toString() ?? '',
    id_area_fk:            row?.id_area_fk?.toString() ?? '',
    id_frente_fk:          row?.id_frente_fk?.toString() ?? '',
    notas:                 row?.notas ?? '',
    fecha_factura:         row?.fecha_factura ?? '',
    folio_factura:         row?.folio_factura ?? '',
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
      .then(({ data }) => setCcAreas(data ?? []))
    dbCfg.from('frentes').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setFrentes(data ?? []))
    dbCfg.from('rel_area_frente').select('id_area, id_frente')
      .then(({ data }) => setRelAF(data ?? []))
    ;(async () => {
      const { data: rfqsConOC } = await dbComp.from('ordenes_compra').select('id_rfq_fk').not('id_rfq_fk', 'is', null)
      // Al editar, excluir el RFQ de la propia OC del filtro de "ya usadas"
      const propioRFQ = row?.id_rfq_fk
      const rfqsUsadas = new Set((rfqsConOC ?? []).map((r: any) => r.id_rfq_fk).filter((id: any) => id !== propioRFQ))
      const { data } = await dbComp.from('rfq').select('id, folio, proveedor_ganador').eq('status', 'Cerrada')
      setRFQs((data ?? []).filter((r: any) => {
        // RFQ multi-ganador (proveedor_ganador = null): siempre visible para crear OC por proveedor
        if (!r.proveedor_ganador) return true
        // RFQ ganador único: ocultar si ya tiene OC
        return !rfqsUsadas.has(r.id)
      }))
    })()
    if (!isNew) {
      dbComp.from('ordenes_compra_det').select('*').eq('id_oc_fk', row.id).then(({ data }) => {
        if (data?.length) {
          setDet(data.map((d: any) => ({
            id_articulo_fk:  d.id_articulo_fk ?? null,
            descripcion:     d.descripcion,
            cantidad:        d.cantidad.toString(),
            unidad:          d.unidad,
            precio_unitario: d.precio_unitario.toString(),
            tasa_iva:        d.tasa_iva?.toString() ?? '0',
          })))
          setArtSearches(new Array(data.length).fill(''))
          setArtOptions(new Array(data.length).fill([]))
        }
      })
    }
  }, [])

  const aplicarRFQ = async (rfqId: string) => {
    setForm(f => ({ ...f, id_rfq_fk: rfqId, id_proveedor_fk: f.id_proveedor_fk }))
    setRfqMultiProvs([])
    if (!rfqId) {
      setDet([{ id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', precio_unitario: '', tasa_iva: '0' }])
      setArtSearches(['']); setArtOptions([[]])
      return
    }

    // 1. Cotizaciones ganadoras — dos queries separadas (join Supabase falla con FK hint)
    const { data: cotsRaw } = await dbComp.from('rfq_cotizaciones')
      .select('*').eq('id_rfq_fk', Number(rfqId)).eq('seleccionada', true)

    const cotIds = (cotsRaw ?? []).map((c: any) => c.id)
    const { data: detRaw } = cotIds.length > 0
      ? await dbComp.from('rfq_cotizaciones_det').select('*').in('id_cotizacion_fk', cotIds)
      : { data: [] }

    // Combinar: cada cotización recibe su array de det
    const cots = (cotsRaw ?? []).map((c: any) => ({
      ...c,
      rfq_cotizaciones_det: (detRaw ?? []).filter((d: any) => d.id_cotizacion_fk === c.id),
    }))

    if (cots.length > 1) {
      // ── Multi-ganador: mostrar picker de proveedor ──────────
      const { data: ocsExistentes } = await dbComp.from('ordenes_compra')
        .select('id_proveedor_fk').eq('id_rfq_fk', Number(rfqId))
        .not('id', 'eq', row?.id ?? 0)
      const provsConOC = new Set((ocsExistentes ?? []).map((o: any) => o.id_proveedor_fk))

      const opts = cots.map(c => {
        // Ítems ganadores con precio real para este proveedor
        const ganadorItems = (c.rfq_cotizaciones_det ?? []).filter(
          (d: any) => d.ganador && d.precio_unitario != null && Number(d.precio_unitario) > 0
        )
        const prov = proveedores.find(p => p.id === c.id_proveedor_fk)
        return { cotId: c.id, provId: c.id_proveedor_fk, nombre: prov?.nombre ?? `Proveedor #${c.id_proveedor_fk}`, items: ganadorItems, yaCreada: provsConOC.has(c.id_proveedor_fk) }
      }).filter(op => op.items.length > 0)
      setRfqMultiProvs(opts)

    } else if (cots.length === 1) {
      // ── Ganador único ────────────────────────────────────────
      setForm(f => ({ ...f, id_proveedor_fk: cots[0].id_proveedor_fk.toString() }))
      const detItems = cots[0].rfq_cotizaciones_det ?? []
      // Preferir ítems marcados como ganadores con precio > 0; fallback a todos con precio
      const ganadorItems = detItems.filter((d: any) => d.ganador && Number(d.precio_unitario) > 0)
      const src = ganadorItems.length > 0
        ? ganadorItems
        : detItems.filter((d: any) => d.precio_unitario != null && Number(d.precio_unitario) > 0)
      _cargarItems(src, cots[0].condiciones_pago)
    }

    // 2. CC / Área / Frente desde la requisición vinculada
    const { data: rfqData } = await dbComp.from('rfq')
      .select('id_requisicion_fk, requisiciones(id_centro_costo_fk, id_area_fk, id_frente_fk)')
      .eq('id', Number(rfqId)).maybeSingle()
    const req = (rfqData as any)?.requisiciones
    if (req) {
      const aId = req.id_area_fk?.toString() ?? ''
      setAreaId(aId)
      setForm(f => ({
        ...f,
        id_centro_costo_fk: req.id_centro_costo_fk?.toString() ?? f.id_centro_costo_fk,
        id_area_fk:         aId || f.id_area_fk,
        id_frente_fk:       req.id_frente_fk?.toString() ?? f.id_frente_fk,
      }))
    }
  }

  // Carga los ítems de un proveedor específico (elegido en el picker multi-ganador)
  const elegirProveedorRFQ = (op: {cotId: number; provId: number; nombre: string; items: any[]}, condPago?: string) => {
    setForm(f => ({ ...f, id_proveedor_fk: op.provId.toString(), condiciones_pago: condPago ?? f.condiciones_pago }))
    _cargarItems(op.items, condPago)
    setRfqMultiProvs([])
  }

  // Helper: convierte ítems de rfq_cotizaciones_det al formato det de OC
  // Solo incluye ítems con precio real (excluye no cotizados con precio null)
  const _cargarItems = (src: any[], condPago?: string) => {
    const items = src
      .filter((d: any) => d.descripcion && d.precio_unitario != null && Number(d.precio_unitario) > 0)
      .map((d: any) => ({
        id_articulo_fk:  d.id_articulo_fk ?? null,
        descripcion:     d.descripcion ?? '',
        cantidad:        d.cantidad?.toString() ?? '1',
        unidad:          d.unidad ?? 'PZA',
        precio_unitario: d.precio_unitario.toString(),
        tasa_iva:        d.tasa_iva?.toString() ?? '0',
      }))
    if (items.length > 0) {
      setDet(items)
      setArtSearches(new Array(items.length).fill(''))
      setArtOptions(new Array(items.length).fill([]))
      if (condPago) setForm(f => ({ ...f, condiciones_pago: condPago }))
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

    const campos = {
      id_proveedor_fk:       Number(form.id_proveedor_fk),
      id_rfq_fk:             form.id_rfq_fk ? Number(form.id_rfq_fk) : null,
      fecha_entrega_est:     form.fecha_entrega_est || null,
      condiciones_pago:      form.condiciones_pago || null,
      id_almacen_entrega_fk: form.id_almacen_entrega_fk ? Number(form.id_almacen_entrega_fk) : null,
      id_centro_costo_fk:    form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
      id_area_fk:            form.id_area_fk ? Number(form.id_area_fk) : null,
      id_frente_fk:          form.id_frente_fk ? Number(form.id_frente_fk) : null,
      notas:                 form.notas.trim() || null,
      fecha_factura:         form.fecha_factura || null,
      folio_factura:         form.folio_factura.trim() || null,
      subtotal, iva, total: subtotal + iva,
      status:                enviar ? 'Pendiente Auth' : 'Borrador',
    }

    if (!isNew) {
      const { error: err } = await dbComp.from('ordenes_compra').update(campos).eq('id', row.id)
      if (err) { setError(err.message); setSaving(false); return }
      await dbComp.from('ordenes_compra_det').delete().eq('id_oc_fk', row.id)
      await dbComp.from('ordenes_compra_det').insert(
        detValidos.map(d => ({
          id_oc_fk: row.id, descripcion: d.descripcion.trim(),
          cantidad: Number(d.cantidad), unidad: d.unidad,
          precio_unitario: Number(d.precio_unitario), tasa_iva: Number(d.tasa_iva),
          id_articulo_fk: d.id_articulo_fk ?? null,
        }))
      )
      setSaving(false); onSaved()
      return
    }

    const { count } = await dbComp.from('ordenes_compra').select('id', { count: 'exact', head: true })
    const folio = folioGen('OC', (count ?? 0) + 1)
    const { data: oc, error: err } = await dbComp.from('ordenes_compra').insert({
      folio, ...campos, created_by: authUser?.nombre ?? null,
    }).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }
    await dbComp.from('ordenes_compra_det').insert(
      detValidos.map(d => ({
        id_oc_fk: oc.id, descripcion: d.descripcion.trim(),
        cantidad: Number(d.cantidad), unidad: d.unidad,
        precio_unitario: Number(d.precio_unitario), tasa_iva: Number(d.tasa_iva),
        id_articulo_fk: d.id_articulo_fk ?? null,
      }))
    )
    setSaving(false); onSaved()
  }

  return (
    <ModalShell modulo="compras" titulo={isNew ? 'Nueva Orden de Compra' : `Editar OC ${row.folio}`} onClose={onClose} maxWidth={720}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-secondary" onClick={() => handleSave(false)} disabled={saving}><Save size={13} /> Borrador</button>
        <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>
          {saving ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />} Enviar para Autorización
        </button>
      </>}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <Sec label="Origen">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Desde RFQ (opcional)</label>
                <select className="select" value={form.id_rfq_fk} onChange={e => aplicarRFQ(e.target.value)}>
                  <option value="">— Sin RFQ —</option>
                  {rfqs.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.folio}{!r.proveedor_ganador ? ' · múltiples proveedores' : ''}
                    </option>
                  ))}
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
            {/* Picker multi-ganador: aparece cuando la RFQ tiene varios proveedores ganadores */}
            {rfqMultiProvs.length > 0 && (
              <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>
                  Esta RFQ tiene productos de múltiples proveedores ganadores.<br />
                  <span style={{ fontWeight: 400 }}>Elige el proveedor para <em>esta</em> OC — crea una OC separada por cada proveedor.</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {rfqMultiProvs.map(op => (
                    <button key={op.cotId} className={op.yaCreada ? 'btn-ghost' : 'btn-secondary'}
                      style={{ fontSize: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 14px', gap: 2, opacity: op.yaCreada ? 0.6 : 1 }}
                      onClick={() => elegirProveedorRFQ(op)}>
                      <span style={{ fontWeight: 600 }}>{op.nombre}</span>
                      <span style={{ fontSize: 11, color: op.yaCreada ? '#15803d' : 'var(--text-muted)' }}>
                        {op.yaCreada ? '✓ OC ya creada' : `${op.items.length} producto${op.items.length !== 1 ? 's' : ''} ganador${op.items.length !== 1 ? 'es' : ''}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                <label className="label">Área *</label>
                <select className="select" value={areaId}
                  onChange={e => { setAreaId(e.target.value); setForm(f => ({ ...f, id_area_fk: e.target.value, id_frente_fk: '' })) }}
                  disabled={!form.id_centro_costo_fk}>
                  <option value="">— {form.id_centro_costo_fk ? 'Seleccionar' : 'Elige CC primero'} —</option>
                  {ccAreas
                    .filter(s => !form.id_centro_costo_fk || s.id_centro_costo_fk === Number(form.id_centro_costo_fk))
                    .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Frente</label>
                <select className="select" value={form.id_frente_fk}
                  onChange={e => setForm(f => ({ ...f, id_frente_fk: e.target.value }))}
                  disabled={!areaId}>
                  <option value="">— {areaId ? 'Seleccionar' : 'Elige área primero'} —</option>
                  {frentes.filter(f => !areaId || relAF.some(r => r.id_area === Number(areaId) && r.id_frente === f.id))
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="label">Folio Factura</label>
              <input className="input" value={form.folio_factura}
                onChange={e => setForm(f => ({ ...f, folio_factura: e.target.value }))} placeholder="ej. A-1024" />
            </div>
            <div>
              <label className="label">Fecha Factura</label>
              <input className="input" type="date" value={form.fecha_factura}
                onChange={e => setForm(f => ({ ...f, fecha_factura: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
        </div>
    </ModalShell>
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
