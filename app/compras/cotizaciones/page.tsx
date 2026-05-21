'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, Pencil, X, Save, Loader,
  ArrowLeft, ChevronRight, CheckCircle, Trash2
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, folioGen, StatusBadge, type Proveedor, FORMAS_PAGO_COMP, nextFolio } from '../types'
import ModalShell from '@/components/ui/ModalShell'

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
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => router.push('/compras')} title="Regresar"><ArrowLeft size={15} /></button>
          <div>
            <h1 className="page-title">Cotizaciones (RFQ)</h1>
            <p className="page-subtitle">Solicitudes de cotización y cuadro comparativo · {total} registros</p>
          </div>
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
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {r.status === 'Cerrada' && !r.proveedor_ganador
                    ? <span style={{ color: '#15803d', fontWeight: 600 }}>Múltiples proveedores</span>
                    : r.proveedor_ganador
                      ? (provMap[r.proveedor_ganador] ?? `#${r.proveedor_ganador}`)
                      : '—'}
                </td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(r)}
                    title={r.status === 'Abierta' ? 'Editar / Seleccionar ganador' : 'Ver detalle'}>
                    {r.status === 'Abierta' ? <Pencil size={13} /> : <Eye size={13} />}
                  </button>
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
    ;(async () => {
      // IDs de requisiciones ya vinculadas a alguna RFQ (excepto la propia si se edita)
      const { data: rfqsConReq } = await dbComp.from('rfq')
        .select('id_requisicion_fk').not('id_requisicion_fk', 'is', null)
      const yaUsadas = new Set(
        (rfqsConReq ?? [])
          .map((r: any) => r.id_requisicion_fk)
          .filter((id: any) => id !== (row?.id_requisicion_fk ?? null))
      )
      const { data } = await dbComp.from('requisiciones')
        .select('id, folio, area_solicitante')
        .eq('status', 'Aprobada').order('folio')
      // Mostrar solo Aprobadas que aún no tienen RFQ asignada
      setReqs((data ?? []).filter((r: any) => !yaUsadas.has(r.id)))
    })()
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
    <ModalShell modulo="compras" titulo="Nueva Solicitud de Cotización" onClose={onClose} maxWidth={580}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Crear RFQ
          </button>
        </>
      }
    >
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
    </ModalShell>
  )
}

// ── Detalle RFQ con cuadro comparativo de hasta 3 proveedores ──
function RFQDetail({ rfq, onClose }: { rfq: any; onClose: () => void }) {
  const [cotizaciones, setCots] = useState<any[]>([])
  const [proveedores, setProvs] = useState<Proveedor[]>([])
  const [reqDet, setReqDet]     = useState<any[]>([])
  const [addingCot, setAddingCot] = useState(false)
  const [editingCot, setEditingCot] = useState<any | null>(null) // cotización existente en edición
  const [saving, setSaving]     = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  // itemWinners: índice de producto → id de cotización ganadora
  const [itemWinners, setItemWinners] = useState<Record<number, number>>({})

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

  const initWinners = (cots: any[]): Record<number, number> => {
    const winners: Record<number, number> = {}
    let hasAnyGanador = false
    cots.forEach(c => {
      ;(c.rfq_cotizaciones_det ?? []).forEach((d: any, pi: number) => {
        if (d.ganador) { winners[pi] = c.id; hasAnyGanador = true }
      })
    })
    // Compatibilidad con RFQs cerradas antes del multi-ganador
    if (!hasAnyGanador) {
      const sel = cots.find(c => c.seleccionada)
      if (sel) {
        ;(sel.rfq_cotizaciones_det ?? []).forEach((_: any, pi: number) => {
          winners[pi] = sel.id
        })
      }
    }
    return winners
  }

  const [debugMsg, setDebugMsg] = useState('')

  // Fetch cotizaciones + det en dos pasos
  const fetchCots = async () => {
    const { data: cotsData, error: e1 } = await dbComp.from('rfq_cotizaciones')
      .select('*').eq('id_rfq_fk', rfq.id).order('id')
    if (e1) { setDebugMsg(`Error cots: ${e1.message}`); return [] }

    const ids = (cotsData ?? []).map((c: any) => c.id)
    const { data: detData, error: e2 } = ids.length > 0
      ? await dbComp.from('rfq_cotizaciones_det').select('*').in('id_cotizacion_fk', ids).order('id')
      : { data: [], error: null }
    if (e2) { setDebugMsg(`Error det: ${e2.message}`); return [] }

    setDebugMsg(`cots=${cotsData?.length ?? 0} ids=[${ids}] det=${detData?.length ?? 0}`)

    const cots = (cotsData ?? []).map((c: any) => ({
      ...c,
      rfq_cotizaciones_det: (detData ?? []).filter((d: any) => d.id_cotizacion_fk === c.id),
    }))
    setCots(cots)
    setItemWinners(initWinners(cots))
    return cots
  }

  useEffect(() => {
    fetchCots()
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
    // Guardamos TODOS los ítems (incluidos los no cotizados con precio null)
    // para mantener alineación de índice en el cuadro comparativo
    const detTodos = cotDet.filter(d => d.descripcion)
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
      const precio = (d: any) => d.precio_unitario !== '' && Number(d.precio_unitario) > 0
        ? Number(d.precio_unitario) : null
      await dbComp.from('rfq_cotizaciones_det').insert(
        detTodos.map(d => {
          const pu = precio(d)
          const sub = pu !== null ? Number(d.cantidad) * pu : 0
          const tiva = Number(d.tasa_iva || 0)
          return {
            id_cotizacion_fk:      cot.id,
            id_requisicion_det_fk: d.id_requisicion_det_fk || null,
            id_articulo_fk:        (d as any).id_articulo_fk ?? null,
            descripcion:           d.descripcion,
            cantidad:              Number(d.cantidad),
            unidad:                d.unidad,
            precio_unitario:       pu,           // null si no cotizó
            subtotal:              sub,
            tasa_iva:              tiva,
            iva:                   sub * tiva,
            total:                 sub * (1 + tiva),
          }
        })
      )
    }
    setSaving(false); setAddingCot(false)
    await fetchCots()
  }

  // Abre el form de edición para una cotización existente (sin det guardado)
  const abrirEdicionCot = (cot: any) => {
    setCotForm({
      id_proveedor_fk:   cot.id_proveedor_fk?.toString() ?? '',
      numero_cotizacion: cot.numero_cotizacion ?? '',
      fecha_cotizacion:  cot.fecha_cotizacion ?? '',
      condiciones_pago:  cot.condiciones_pago ?? '',
      tiempo_entrega:    cot.tiempo_entrega ?? '',
      notas:             cot.notas ?? '',
    })
    // Pre-llenar ítems: si hay det guardados úsalos, si no usar reqDet
    const src = (cot.rfq_cotizaciones_det ?? []).length > 0
      ? cot.rfq_cotizaciones_det.map((d: any) => ({
          id_requisicion_det_fk: d.id_requisicion_det_fk,
          id_articulo_fk:        d.id_articulo_fk ?? null,
          descripcion:           d.descripcion,
          cantidad:              d.cantidad?.toString() ?? '1',
          unidad:                d.unidad,
          precio_unitario:       d.precio_unitario != null ? d.precio_unitario.toString() : '',
          tasa_iva:              d.tasa_iva?.toString() ?? '0',
        }))
      : reqDet.map((d: any) => ({
          id_requisicion_det_fk: d.id,
          id_articulo_fk:        d.id_articulo_fk ?? null,
          descripcion:           d.descripcion,
          cantidad:              d.cantidad?.toString() ?? '1',
          unidad:                d.unidad,
          precio_unitario:       '',
          tasa_iva:              '0',
        }))
    setCotDet(src.length > 0 ? src : [{ id_requisicion_det_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', precio_unitario: '', tasa_iva: '0' }])
    setEditingCot(cot)
    setAddingCot(false)
  }

  // Guarda los det de una cotización existente (upsert)
  const saveEdicionCot = async () => {
    if (!editingCot) return
    setSaving(true)
    const detTodos = cotDet.filter(d => d.descripcion)
    setDebugMsg(`Guardando ${detTodos.length} ítems para cot id=${editingCot.id}…`)
    // Borrar det anteriores y reemplazar
    const { error: delErr } = await dbComp.from('rfq_cotizaciones_det').delete().eq('id_cotizacion_fk', editingCot.id)
    if (delErr) { setDebugMsg(`Error DELETE: ${delErr.message}`); setSaving(false); return }
    const precio = (d: any) => d.precio_unitario !== '' && Number(d.precio_unitario) > 0
      ? Number(d.precio_unitario) : null
    if (detTodos.length > 0) {
      const { error: insErr } = await dbComp.from('rfq_cotizaciones_det').insert(
        detTodos.map(d => {
          const pu = precio(d)
          const sub = pu !== null ? Number(d.cantidad) * pu : 0
          const tiva = Number(d.tasa_iva || 0)
          return {
            id_cotizacion_fk:      editingCot.id,
            id_requisicion_det_fk: d.id_requisicion_det_fk || null,
            id_articulo_fk:        d.id_articulo_fk ?? null,
            descripcion:           d.descripcion,
            cantidad:              Number(d.cantidad),
            unidad:                d.unidad,
            precio_unitario:       pu,
            subtotal:              sub,
            tasa_iva:              tiva,
            iva:                   sub * tiva,
            total:                 sub * (1 + tiva),
          }
        })
      )
      if (insErr) { setDebugMsg(`Error INSERT: ${insErr.message}`); setSaving(false); return }
    }
    // Recalcular totales en la cabecera
    const newSubtotal = detTodos.reduce((a, d) => {
      const pu = precio(d); return a + (pu !== null ? Number(d.cantidad) * pu : 0)
    }, 0)
    const newIva = detTodos.reduce((a, d) => {
      const pu = precio(d); const sub = pu !== null ? Number(d.cantidad) * pu : 0
      return a + sub * Number(d.tasa_iva || 0)
    }, 0)
    await dbComp.from('rfq_cotizaciones').update({
      numero_cotizacion: cotForm.numero_cotizacion || null,
      fecha_cotizacion:  cotForm.fecha_cotizacion || null,
      condiciones_pago:  cotForm.condiciones_pago || null,
      tiempo_entrega:    cotForm.tiempo_entrega || null,
      notas:             cotForm.notas || null,
      subtotal: newSubtotal, iva: newIva, total: newSubtotal + newIva,
    }).eq('id', editingCot.id)
    setSaving(false); setEditingCot(null)
    await fetchCots()
  }

  // Asigna como ganadores solo los productos donde este proveedor cotizó precio > 0
  const seleccionarTodoProveedor = (cotId: number) => {
    const cot = cotizaciones.find(c => c.id === cotId)
    if (!cot) return
    const newWinners: Record<number, number> = { ...itemWinners }
    ;(cot.rfq_cotizaciones_det ?? []).forEach((d: any, pi: number) => {
      if (Number(d?.precio_unitario) > 0) newWinners[pi] = cotId
    })
    setItemWinners(newWinners)
  }

  // Guarda la selección por ítem y cierra la RFQ
  const confirmarSeleccion = async () => {
    if (Object.keys(itemWinners).length === 0) return
    setConfirmando(true)

    for (const c of cotizaciones) {
      for (let pi = 0; pi < (c.rfq_cotizaciones_det ?? []).length; pi++) {
        const d = c.rfq_cotizaciones_det[pi]
        if (!d) continue
        await dbComp.from('rfq_cotizaciones_det').update({ ganador: itemWinners[pi] === c.id }).eq('id', d.id)
      }
      const cotHasWinner = (c.rfq_cotizaciones_det ?? []).some((_: any, pi: number) => itemWinners[pi] === c.id)
      await dbComp.from('rfq_cotizaciones').update({ seleccionada: cotHasWinner }).eq('id', c.id)
    }

    const winningCotIds = new Set(Object.values(itemWinners))
    const winningProvIds = cotizaciones.filter(c => winningCotIds.has(c.id)).map(c => c.id_proveedor_fk)
    // proveedor_ganador = ID único si hay un solo ganador, null si hay múltiples
    const provGanador = winningProvIds.length === 1 ? winningProvIds[0] : null
    await dbComp.from('rfq').update({ status: 'Cerrada', proveedor_ganador: provGanador }).eq('id', rfq.id)

    setConfirmando(false)
    await fetchCots()
  }

  const setCD = (i: number, k: string, v: string) =>
    setCotDet(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const totalItems = cotizaciones[0]?.rfq_cotizaciones_det?.length ?? 0
  // Ítems donde al menos un proveedor cotizó precio > 0 (los demás no bloquean la confirmación)
  const requiredItems = (cotizaciones[0]?.rfq_cotizaciones_det ?? []).filter((_: any, pi: number) =>
    cotizaciones.some(c => Number(c.rfq_cotizaciones_det?.[pi]?.precio_unitario) > 0)
  ).length
  const assignedCount = Object.keys(itemWinners).filter(pi =>
    cotizaciones.some(c => Number(c.rfq_cotizaciones_det?.[Number(pi)]?.precio_unitario) > 0)
  ).length

  return (
    <ModalShell modulo="compras" titulo={rfq.folio}
      subtitulo={`${rfq.id_requisicion_fk ? `Requisición #${rfq.id_requisicion_fk} · ` : ''}Fecha límite: ${fmtFecha(rfq.fecha_limite)}`}
      onClose={onClose} maxWidth={920}
      footer={rfq.status === 'Abierta' && !addingCot && !editingCot ? (
        <>
          {cotizaciones.length < 3 && (
            <button className="btn-secondary" onClick={() => setAddingCot(true)}><Plus size={13} /> Agregar Cotización</button>
          )}
          {cotizaciones.length > 0 && (
            <button className="btn-primary" onClick={confirmarSeleccion}
              disabled={confirmando || assignedCount < requiredItems}
              title={assignedCount < requiredItems ? `Faltan ${requiredItems - assignedCount} producto${requiredItems - assignedCount !== 1 ? 's' : ''} sin ganador` : 'Confirmar y cerrar RFQ'}>
              {confirmando ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              {assignedCount < requiredItems
                ? `Confirmar (${assignedCount}/${requiredItems} asignados)`
                : 'Confirmar y Cerrar RFQ'}
            </button>
          )}
        </>
      ) : undefined}
    >

          {/* Debug temporal */}
          {debugMsg && (
            <div style={{ padding: '6px 10px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 6, fontSize: 11, fontFamily: 'monospace', marginBottom: 10 }}>
              {debugMsg}
            </div>
          )}

          {/* Cuadro comparativo */}
          {cotizaciones.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
                Cuadro Comparativo ({cotizaciones.length}/3 cotizaciones)
                {rfq.status === 'Abierta' && totalItems > 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11, marginLeft: 10, textTransform: 'none', letterSpacing: 0 }}>
                    — Clic en el precio para seleccionar proveedor ganador por producto
                  </span>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      {cotizaciones.map(c => {
                        const prov = proveedores.find(p => p.id === c.id_proveedor_fk)
                        const winnerCount = (c.rfq_cotizaciones_det ?? []).filter((d: any, pi: number) =>
                          itemWinners[pi] === c.id && d?.precio_unitario != null && Number(d.precio_unitario) > 0
                        ).length
                        const hasWinners = winnerCount > 0
                        return (
                          <th key={c.id} style={{ background: hasWinners ? '#f0fdf4' : undefined, color: hasWinners ? '#15803d' : undefined, minWidth: 140 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                              <span>{prov?.nombre ?? `Prov #${c.id_proveedor_fk}`}</span>
                              {rfq.status === 'Abierta' && (
                                <button className="btn-ghost"
                                  style={{ padding: '2px 5px', fontSize: 10, fontWeight: 500, color: 'var(--blue)', flexShrink: 0 }}
                                  onClick={e => { e.stopPropagation(); abrirEdicionCot(c) }}
                                  title="Editar precios de esta cotización">
                                  <Pencil size={10} style={{ display: 'inline', marginRight: 2 }} />Editar
                                </button>
                              )}
                            </div>
                            {hasWinners && (
                              <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2 }}>
                                ✓ {winnerCount}/{requiredItems} producto{winnerCount !== 1 ? 's' : ''} ganador{winnerCount !== 1 ? 'es' : ''}
                              </div>
                            )}
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
                    {/* Detalle por producto — clic en precio selecciona ganador */}
                    {(cotizaciones[0]?.rfq_cotizaciones_det ?? []).map((_: any, pi: number) => (
                      <tr key={pi}>
                        <td style={{ fontSize: 12, fontWeight: itemWinners[pi] !== undefined ? 600 : 400 }}>
                          {cotizaciones[0]?.rfq_cotizaciones_det?.[pi]?.descripcion}
                        </td>
                        {cotizaciones.map(c => {
                          const d = c.rfq_cotizaciones_det?.[pi]
                          const isWinner = itemWinners[pi] === c.id
                          const clickable = rfq.status === 'Abierta' && !!d && Number(d.precio_unitario) > 0
                          return (
                            <td key={c.id}
                              onClick={() => clickable && setItemWinners(w => ({ ...w, [pi]: c.id }))}
                              title={clickable ? 'Clic para seleccionar como ganador' : undefined}
                              style={{
                                fontSize: 12,
                                textAlign: 'right',
                                fontVariantNumeric: 'tabular-nums',
                                background: isWinner ? '#dcfce7' : undefined,
                                outline: isWinner ? '2px solid #16a34a' : undefined,
                                outlineOffset: -2,
                                cursor: clickable ? 'pointer' : 'default',
                                transition: 'background 0.12s',
                                fontWeight: isWinner ? 700 : 400,
                              }}
                            >
                              {d?.precio_unitario != null && Number(d.precio_unitario) > 0 ? (
                                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                  {isWinner && <CheckCircle size={11} color="#16a34a" />}
                                  {fmt(d.precio_unitario)}
                                </span>
                              ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                            </td>
                          )
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
                    {rfq.status === 'Abierta' && totalItems > 0 && (
                      <tr>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Seleccionar todo</td>
                        {cotizaciones.map(c => {
                          const quotedItems = (c.rfq_cotizaciones_det ?? []).filter((d: any) => Number(d?.precio_unitario) > 0)
                          const allWinner = quotedItems.length > 0 &&
                            quotedItems.every((d: any, _: number) => {
                              const pi = (c.rfq_cotizaciones_det ?? []).indexOf(d)
                              return itemWinners[pi] === c.id
                            })
                          return (
                            <td key={c.id} style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 8 }}>
                              <button
                                className={allWinner ? 'btn-primary' : 'btn-secondary'}
                                style={{ fontSize: 11, padding: '4px 10px' }}
                                onClick={() => seleccionarTodoProveedor(c.id)}
                              >
                                {allWinner ? <><CheckCircle size={11} /> Todo seleccionado</> : 'Sel. todo'}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Barra de confirmación */}
              {rfq.status === 'Abierta' && assignedCount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: '10px 16px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 12, color: '#15803d' }}>
                    <strong>{assignedCount}</strong> de {requiredItems} producto{requiredItems !== 1 ? 's' : ''} con ganador asignado
                    {(() => {
                      const winningCotIds = new Set(Object.values(itemWinners))
                      const provNames = cotizaciones
                        .filter(c => winningCotIds.has(c.id))
                        .map(c => proveedores.find(p => p.id === c.id_proveedor_fk)?.nombre ?? `Prov #${c.id_proveedor_fk}`)
                      return provNames.length > 0 ? <span style={{ color: '#166534', marginLeft: 6 }}>· {provNames.join(', ')}</span> : null
                    })()}
                  </div>
                  <button className="btn-primary" onClick={confirmarSeleccion} disabled={confirmando || assignedCount < requiredItems}>
                    {confirmando ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                    {assignedCount < requiredItems ? `Faltan ${requiredItems - assignedCount} producto${requiredItems - assignedCount !== 1 ? 's' : ''}` : 'Confirmar y Cerrar RFQ'}
                  </button>
                </div>
              )}
            </div>
          )}

          {cotizaciones.length === 0 && !addingCot && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              Sin cotizaciones registradas. Agrega hasta 3 proveedores para comparar.
            </div>
          )}

          {/* Formulario edición cotización existente */}
          {editingCot && (
            <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 12 }}>
                Editar precios — {proveedores.find(p => p.id === editingCot.id_proveedor_fk)?.nombre ?? `Proveedor #${editingCot.id_proveedor_fk}`}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label className="label">No. Cotización</label>
                  <input className="input" value={cotForm.numero_cotizacion}
                    onChange={e => setCotForm(f => ({ ...f, numero_cotizacion: e.target.value }))} />
                </div>
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
                  <input className="input" value={cotForm.tiempo_entrega}
                    onChange={e => setCotForm(f => ({ ...f, tiempo_entrega: e.target.value }))} />
                </div>
              </div>
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
                  <input className="input" type="number" step="0.01" value={d.precio_unitario} onChange={e => setCD(i,'precio_unitario',e.target.value)} style={{ textAlign: 'right' }} placeholder="0.00" autoFocus={i === 0} />
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
                  <button className="btn-secondary" onClick={() => setEditingCot(null)}>Cancelar</button>
                  <button className="btn-primary" onClick={saveEdicionCot} disabled={saving}>
                    {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar Precios
                  </button>
                </div>
              </div>
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
    </ModalShell>
  )
}