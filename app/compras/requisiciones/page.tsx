'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Edit2, Eye, X, Save, Loader,
  ArrowLeft, CheckCircle, XCircle, Trash2, ChevronLeft, ChevronRight, Printer
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type Articulo, fmt, fmtFecha, folioGen, StatusBadge, UNIDADES } from '../types'

const PAGE_SIZE = 20

type Det = { id?: number; id_articulo_fk: number | null; descripcion: string; cantidad: string; unidad: string; notas: string }

export default function RequisicionesPage() {
  const { authUser, canWrite, canDelete, canAuth: canAuthFn } = useAuth()
  const router  = useRouter()
  const [rows, setRows]       = useState<any[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(0)
  const [search, setSearch]   = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilter] = useState('')
  const [filterCC, setFilterCC] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [ccFiltros, setCcFiltros] = useState<{ id: number; nombre: string }[]>([])
  const [areaFiltros, setAreaFiltros] = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<any | null | 'new'>(null)
  const [detail, setDetail]   = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbComp.from('requisiciones').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterCC) q = q.eq('id_centro_costo_fk', Number(filterCC))
    if (filterArea) q = q.eq('id_area_fk', Number(filterArea))
    if (debouncedSearch) q = q.or(`folio.ilike.%${debouncedSearch}%,area_solicitante.ilike.%${debouncedSearch}%,solicitante.ilike.%${debouncedSearch}%`)
    const { data, count } = await q
    setRows(data ?? []); setTotal(count ?? 0); setLoading(false)
  }, [page, debouncedSearch, filterStatus, filterCC, filterArea])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCcFiltros((data ?? []) as { id: number; nombre: string }[]))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setAreaFiltros((data ?? []) as { id: number; nombre: string; id_centro_costo_fk: number }[]))
  }, [])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleAuth = async (id: number, aprobar: boolean, comentario = '') => {
    await dbComp.from('requisiciones').update({
      status:            aprobar ? 'Aprobada' : 'Rechazada',
      autorizado_por:    authUser?.nombre ?? 'Sistema',
      fecha_autorizacion: new Date().toISOString(),
      comentario_auth:   comentario || null,
    }).eq('id', id)
    setDetail(null); fetchData()
  }

  const canAuth = canAuthFn('requisiciones')

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Requisiciones</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Solicitudes de compra · {total} registros</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1 }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, área, solicitante…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="select" style={{ width: 160 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
            <option value="">Todos los status</option>
            {['Borrador','Enviada','Aprobada','Rechazada','En Proceso','Cerrada'].map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="select" style={{ width: 220 }} value={filterCC}
            onChange={e => { setFilterCC(e.target.value); setFilterSec(''); setPage(0) }}>
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
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        {canWrite('requisiciones') && <button className="btn-primary" onClick={() => setModal('new')}><Plus size={14} /> Nueva Requisición</button>}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th><th>Área</th><th>Solicitante</th><th>Fecha Solicitud</th>
              <th>Fecha Requerida</th><th>Prioridad</th><th>Status</th><th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin requisiciones</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td style={{ fontSize: 13 }}>{r.area_solicitante}</td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.solicitante}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fmtFecha(r.fecha_solicitud)}</td>
                <td style={{ fontSize: 12, color: r.fecha_requerida ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{fmtFecha(r.fecha_requerida)}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, color: r.prioridad === 'Crítica' ? '#dc2626' : r.prioridad === 'Urgente' ? '#d97706' : '#64748b' }}>
                    {r.prioridad}
                  </span>
                </td>
                <td><StatusBadge status={r.status} /></td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(r)} title="Ver"><Eye size={13} /></button>
                    {r.status === 'Borrador' && (
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setModal(r)} title="Editar"><Edit2 size={13} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pág. {page+1} de {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page===0} onClick={() => setPage(p=>p-1)}><ChevronLeft size={13}/></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page>=totalPages-1} onClick={() => setPage(p=>p+1)}><ChevronRight size={13}/></button>
            </div>
          </div>
        )}
      </div>

      {modal !== null && <RequisicionModal row={modal==='new'?null:modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchData() }} />}
      {detail && <RequisicionDetail key={detail.id} req={detail} canAuth={canAuth} onClose={() => setDetail(null)} onAuth={handleAuth} />}
    </div>
  )
}

// ── Centro de costo / sección / frente (texto o catálogo por FK) ─
async function resolveRequisicionUbicacion(req: any): Promise<{ centroCosto: string; seccion: string; frente: string }> {
  let centroCosto = String(req.centro_costo ?? '').trim()
  let seccion = String(req.seccion ?? '').trim()
  let frente = String(req.frente ?? '').trim()
  if (!centroCosto && req.id_centro_costo_fk) {
    const { data } = await dbCfg.from('centros_costo').select('nombre').eq('id', req.id_centro_costo_fk).maybeSingle()
    centroCosto = (data as { nombre?: string } | null)?.nombre ?? ''
  }
  if (!seccion && req.id_area_fk) {
    const { data } = await dbCfg.from('areas').select('nombre').eq('id', req.id_area_fk).maybeSingle()
    seccion = (data as { nombre?: string } | null)?.nombre ?? ''
  }
  if (!frente && req.id_frente_fk) {
    const { data } = await dbCfg.from('frentes').select('nombre').eq('id', req.id_frente_fk).maybeSingle()
    frente = (data as { nombre?: string } | null)?.nombre ?? ''
  }
  return { centroCosto, seccion, frente }
}

// ── Imprimir requisición (compartido por ambos modales) ─────
async function imprimirRequisicion(req: any, det: any[]) {
  const { centroCosto, seccion, frente } = await resolveRequisicionUbicacion(req)

  let orgNombre = 'Organización'
  let orgSubtitulo = ''
  let orgLogo = ''
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: cfgRows } = await sb.schema('cfg' as any).from('configuracion')
      .select('clave, valor').in('clave', ['org_nombre', 'org_subtitulo', 'org_logo_url'])
    ;(cfgRows ?? []).forEach((r: any) => {
      if (r.clave === 'org_nombre')    orgNombre    = r.valor ?? orgNombre
      if (r.clave === 'org_subtitulo') orgSubtitulo = r.valor ?? ''
      if (r.clave === 'org_logo_url')  orgLogo      = r.valor ?? ''
    })
  } catch {}
  const logoHtml = orgLogo
    ? `<img src="${orgLogo}" style="height:52px;max-width:160px;object-fit:contain;" />`
    : `<div style="width:52px;height:52px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#94a3b8;">🏢</div>`

  const prioridadColor = req.prioridad === 'Crítica' ? '#dc2626' : req.prioridad === 'Urgente' ? '#d97706' : '#64748b'
  const filasDet = det.map(d =>
    `<tr>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:13px">${d.descripcion ?? '—'}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;text-align:right;font-size:13px;font-weight:600">${d.cantidad ?? ''}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px;color:#64748b">${d.unidad ?? ''}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:11px;color:#94a3b8">${d.notas ?? ''}</td>
    </tr>`
  ).join('')

  const html = `<!DOCTYPE html><html><head><title>Requisición ${req.folio ?? 'Nueva'}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 40px; font-size: 13px; color: #1e293b; }
      .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 18px; }
      .org-nombre { font-size: 18px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
      .org-sub { font-size: 11px; color: #64748b; }
      .doc-title { font-size: 14px; font-weight: 600; color: #0D4F80; margin-bottom: 2px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 18px; }
      .info-item label { font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; display: block; margin-bottom: 2px; }
      .info-item span { font-size: 13px; color: #1e293b; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; }
      thead th { background: #f1f5f9; padding: 8px 10px; font-size: 10px; text-transform: uppercase;
        letter-spacing: 0.05em; text-align: left; border: 1px solid #e2e8f0; color: #64748b; }
      thead th.right { text-align: right; }
      .firmas { display: flex; gap: 40px; margin-top: 64px; justify-content: space-around; }
      .firma { text-align: center; min-width: 160px; }
      .firma-linea { border-top: 1px solid #1e293b; padding-top: 8px; margin-top: 48px; font-size: 11px; color: #64748b; }
      .firma-nombre { font-size: 12px; font-weight: 600; color: #1e293b; margin-bottom: 2px; }
      .nota { font-size: 11px; color: #94a3b8; font-style: italic; margin-top: 20px; border-top: 1px solid #f1f5f9; padding-top: 8px; }
      @page { margin: 1.2cm; }
    </style></head><body>
    <div class="org-header">
      ${logoHtml}
      <div>
        <div class="org-nombre">${orgNombre}</div>
        ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
      </div>
      <div style="margin-left:auto;text-align:right">
        <div class="doc-title">Requisición de Compra</div>
        <div style="font-size:16px;font-weight:700;color:#0D4F80;font-family:monospace">${req.folio ?? 'Borrador'}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Status: <strong>${req.status ?? 'Borrador'}</strong>
          &nbsp;·&nbsp; Prioridad: <span style="color:${prioridadColor};font-weight:600">${req.prioridad ?? 'Normal'}</span>
        </div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-item"><label>Área Solicitante</label><span>${req.area_solicitante ?? '—'}</span></div>
      <div class="info-item"><label>Solicitante</label><span>${req.solicitante ?? '—'}</span></div>
      <div class="info-item"><label>Fecha Solicitud</label><span>${req.fecha_solicitud ? fmtFecha(req.fecha_solicitud) : fmtFecha(new Date().toISOString())}</span></div>
      <div class="info-item"><label>Fecha Requerida</label><span>${req.fecha_requerida ? fmtFecha(req.fecha_requerida) : '—'}</span></div>
      <div class="info-item"><label>Centro de Costo</label><span>${centroCosto || '—'}</span></div>
      <div class="info-item"><label>Sección</label><span>${seccion || '—'}</span></div>
      <div class="info-item"><label>Frente</label><span>${frente || '—'}</span></div>
      ${req.justificacion ? `<div class="info-item" style="grid-column:span 2"><label>Justificación</label><span>${req.justificacion}</span></div>` : ''}
      ${req.autorizado_por ? `<div class="info-item"><label>Autorizado por</label><span>${req.autorizado_por} — ${fmtFecha(req.fecha_autorizacion)}</span></div>` : ''}
      ${req.comentario_auth ? `<div class="info-item"><label>Comentario Autorización</label><span>${req.comentario_auth}</span></div>` : ''}
    </div>

    <table>
      <thead>
        <tr><th>Descripción</th><th class="right">Cantidad</th><th>Unidad</th><th>Notas</th></tr>
      </thead>
      <tbody>${filasDet}</tbody>
    </table>

    <div class="firmas">
      <div class="firma">
        <div class="firma-nombre">${req.solicitante ?? ''}</div>
        <div class="firma-linea">Solicitó</div>
      </div>
      <div class="firma">
        <div class="firma-nombre">${req.autorizado_por ?? ''}</div>
        <div class="firma-linea">Autorizó</div>
      </div>
      <div class="firma">
        <div class="firma-nombre"></div>
        <div class="firma-linea">Recibió</div>
      </div>
    </div>
    <div class="nota">Este documento es un formato de control interno de requisición de compra.</div>
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

// ── Modal crear/editar requisición ──────────────────────────
function RequisicionModal({ row, onClose, onSaved }: { row: any | null; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const isNew = !row
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [articulos, setArticulos] = useState<Articulo[]>([])
  const [artSearches, setArtSearches] = useState<string[]>([''])  // search per row
  const [artOptions, setArtOptions]   = useState<Articulo[][]>([[]])  // options per row
  const [areas, setAreas]           = useState<{id: number; nombre: string}[]>([])
  const [centrosCosto, setCentros]  = useState<{id: number; nombre: string}[]>([])
  const [ccAreas, setCcAreas]       = useState<{id: number; nombre: string; id_centro_costo_fk: number}[]>([])
  const [frentes, setFrentes]       = useState<{id: number; nombre: string}[]>([])
  const [relAF,   setRelAF]         = useState<{id_area: number; id_frente: number}[]>([])
  const [form, setForm] = useState({
    area_solicitante:   row?.area_solicitante ?? '',
    solicitante:        row?.solicitante ?? (authUser?.nombre ?? ''),
    fecha_requerida:    row?.fecha_requerida ?? '',
    id_centro_costo_fk: row?.id_centro_costo_fk?.toString() ?? '',
    id_area_fk:         row?.id_area_fk?.toString() ?? '',
    id_frente_fk:       row?.id_frente_fk?.toString() ?? '',
    prioridad:          row?.prioridad ?? 'Normal',
    justificacion:      row?.justificacion ?? '',
  })
  const [det, setDet] = useState<Det[]>([{ id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', notas: '' }])

  useEffect(() => {
    dbComp.from('areas_solicitantes').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setAreas(data ?? []))
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCentros(data ?? []))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setCcAreas(data ?? []))
    dbCfg.from('frentes').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setFrentes(data ?? []))
    dbCfg.from('rel_area_frente').select('id_area, id_frente')
      .then(({ data }) => setRelAF(data ?? []))
    if (!isNew && row?.id) {
      dbComp.from('requisiciones_det').select('*').eq('id_requisicion_fk', row.id)
        .then(({ data }) => {
          if (data?.length) setDet(data.map((d: any) => ({ id: d.id, id_articulo_fk: d.id_articulo_fk, descripcion: d.descripcion, cantidad: d.cantidad?.toString(), unidad: d.unidad, notas: d.notas ?? '' })))
        })
    }
  }, [])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const setDL = (i: number, k: string, v: any) =>
    setDet(d => d.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const buscarArticulos = async (i: number, q: string) => {
    // Update search text for this row
    setArtSearches(prev => { const n = [...prev]; n[i] = q; return n })
    if (q.trim().length < 2) {
      setArtOptions(prev => { const n = [...prev]; n[i] = []; return n })
      return
    }
    const { data } = await dbComp.from('articulos')
      .select('id, clave, nombre, unidad')
      .eq('activo', true)
      .or(`clave.ilike.%${q}%,nombre.ilike.%${q}%`)
      .order('nombre').limit(20)
    setArtOptions(prev => { const n = [...prev]; n[i] = data as Articulo[] ?? []; return n })
  }

  const seleccionarArticulo = (i: number, art: Articulo) => {
    setDet(d => d.map((x, j) => j === i
      ? { ...x, id_articulo_fk: art.id, descripcion: art.nombre, unidad: art.unidad ?? x.unidad }
      : x
    ))
    setArtSearches(prev => { const n = [...prev]; n[i] = `${art.clave} — ${art.nombre}`; return n })
    setArtOptions(prev => { const n = [...prev]; n[i] = []; return n })
  }

  const addDetLine = () => {
    setDet(d => [...d, { id_articulo_fk: null, descripcion: '', cantidad: '1', unidad: 'PZA', notas: '' }])
    setArtSearches(p => [...p, ''])
    setArtOptions(p => [...p, []])
  }

  const handleSave = async (enviar = false) => {
    if (!form.area_solicitante.trim() || !form.solicitante.trim()) { setError('Área y Solicitante son obligatorios'); return }
    if (!form.id_centro_costo_fk) { setError('Centro de Costo es obligatorio'); return }
    if (!form.id_area_fk) { setError('Área es obligatoria'); return }
    const detValidos = det.filter(d => d.descripcion.trim() && Number(d.cantidad) > 0)
    if (!detValidos.length) { setError('Agrega al menos un producto'); return }
    setSaving(true); setError('')

    let reqId = row?.id
    if (isNew) {
      const { count } = await dbComp.from('requisiciones').select('id', { count: 'exact', head: true })
      const folio = folioGen('REQ', (count ?? 0) + 1)
      const { data, error: err } = await dbComp.from('requisiciones').insert({
        folio,
        area_solicitante:   form.area_solicitante.trim(),
        solicitante:        form.solicitante.trim(),
        fecha_requerida:    form.fecha_requerida || null,
        id_centro_costo_fk: Number(form.id_centro_costo_fk),
        id_area_fk:         form.id_area_fk ? Number(form.id_area_fk) : null,
        id_frente_fk:       form.id_frente_fk ? Number(form.id_frente_fk) : null,
        prioridad:          form.prioridad,
        justificacion:      form.justificacion.trim() || null,
        status: enviar ? 'Enviada' : 'Borrador',
        created_by: authUser?.nombre ?? null,
      }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      reqId = data.id
    } else {
      await dbComp.from('requisiciones').update({
        area_solicitante:   form.area_solicitante.trim(),
        solicitante:        form.solicitante.trim(),
        fecha_requerida:    form.fecha_requerida || null,
        id_centro_costo_fk: Number(form.id_centro_costo_fk),
        id_area_fk:         form.id_area_fk ? Number(form.id_area_fk) : null,
        id_frente_fk:       form.id_frente_fk ? Number(form.id_frente_fk) : null,
        prioridad:          form.prioridad,
        justificacion:      form.justificacion.trim() || null,
        status: enviar ? 'Enviada' : row.status,
      }).eq('id', reqId)
      await dbComp.from('requisiciones_det').delete().eq('id_requisicion_fk', reqId)
    }

    await dbComp.from('requisiciones_det').insert(
      detValidos.map(d => ({
        id_requisicion_fk: reqId, id_articulo_fk: d.id_articulo_fk || null,
        descripcion: d.descripcion.trim(), cantidad: Number(d.cantidad),
        unidad: d.unidad, notas: d.notas.trim() || null,
      }))
    )
    setSaving(false); onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600 }}>{isNew ? 'Nueva Requisición' : `Editar ${row.folio}`}</h2>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          <Sec label="Datos de la Solicitud">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Área Solicitante *</label>
                <select className="select" value={form.area_solicitante} onChange={setF('area_solicitante')}>
                  <option value="">— Seleccionar —</option>
                  {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                </select>
              </div>
              <div><label className="label">Solicitante *</label><input className="input" value={form.solicitante} onChange={setF('solicitante')} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 10 }}>
              <div><label className="label">Fecha Requerida</label><input className="input" type="date" value={form.fecha_requerida} onChange={setF('fecha_requerida')} /></div>
              <div>
                <label className="label">Centro Costo*</label>
                <select className="select" value={form.id_centro_costo_fk}
                  onChange={e => setForm(f => ({ ...f, id_centro_costo_fk: e.target.value, id_area_fk: '', id_frente_fk: '' }))}>
                  <option value="">— Seleccionar —</option>
                  {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Área *</label>
                <select className="select" value={form.id_area_fk}
                  onChange={e => setForm(f => ({ ...f, id_area_fk: e.target.value, id_frente_fk: '' }))}
                  disabled={!form.id_centro_costo_fk}>
                  <option value="">— {form.id_centro_costo_fk ? 'Seleccionar' : 'Elige CC primero'} —</option>
                  {ccAreas
                    .filter(s => !form.id_centro_costo_fk || s.id_centro_costo_fk === Number(form.id_centro_costo_fk))
                    .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Frente</label>
                <select className="select" value={form.id_frente_fk} onChange={setF('id_frente_fk')}
                  disabled={!form.id_area_fk}>
                  <option value="">— {form.id_area_fk ? 'Seleccionar' : 'Elige área primero'} —</option>
                  {frentes
                    .filter(f => !form.id_area_fk || relAF.some(r => r.id_area === Number(form.id_area_fk) && r.id_frente === f.id))
                    .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)
                  }
                </select>
              </div>
              <div><label className="label">Prioridad</label>
                <select className="select" value={form.prioridad} onChange={setF('prioridad')}>
                  {['Normal','Urgente','Crítica'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div><label className="label">Justificación</label><textarea className="input" rows={2} value={form.justificacion} onChange={setF('justificacion')} style={{ resize: 'vertical' }} /></div>
          </Sec>

          <Sec label="Productos Solicitados">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 80px 80px 1fr 28px', gap: 6, marginBottom: 4 }}>
              {['Artículo','Descripción','Cantidad','Unidad','Notas',''].map(h => (
                <div key={h} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
              ))}
            </div>
            {det.map((d, i) => (
              <div key={i} style={{ marginBottom: 8, padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: 8, marginBottom: 8 }}>
                  {/* Buscador de artículo */}
                  <div style={{ position: 'relative' }}>
                    <label className="label">Artículo</label>
                    <input
                      className="input"
                      placeholder="Escribe clave o nombre…"
                      value={artSearches[i] ?? ''}
                      onChange={e => buscarArticulos(i, e.target.value)}
                    />
                    {(artOptions[i]?.length ?? 0) > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                        {artOptions[i].map(a => (
                          <button key={a.id}
                            onMouseDown={e => { e.preventDefault(); seleccionarArticulo(i, a) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left',
                              padding: '8px 12px', background: 'none', border: 'none',
                              cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
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
                  <div>
                    <label className="label">Cantidad</label>
                    <input className="input" type="number" min="0.001" step="0.001" value={d.cantidad}
                      onChange={e => setDL(i,'cantidad',e.target.value)} style={{ textAlign: 'right' }} />
                  </div>
                  <div>
                    <label className="label">Unidad</label>
                    <select className="select" value={d.unidad} onChange={e => setDL(i,'unidad',e.target.value)}>
                      {UNIDADES.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px', gap: 8 }}>
                  <input className="input" value={d.descripcion} onChange={e => setDL(i,'descripcion',e.target.value)} placeholder="Descripción / especificaciones adicionales" />
                  <button className="btn-ghost" style={{ padding: '4px' }}
                    onClick={() => {
                      setDet(d => d.filter((_, j) => j !== i))
                      setArtSearches(p => p.filter((_, j) => j !== i))
                      setArtOptions(p => p.filter((_, j) => j !== i))
                    }}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
            <button className="btn-ghost" onClick={addDetLine}>
              <Plus size={12} /> Agregar producto
            </button>
          </Sec>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', padding: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <div>
            {row && (
              <button className="btn-secondary" onClick={() => imprimirRequisicion({
                ...row,
                id_centro_costo_fk: form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null,
                id_area_fk:         form.id_area_fk ? Number(form.id_area_fk) : null,
                id_frente_fk:       form.id_frente_fk ? Number(form.id_frente_fk) : null,
                centro_costo: null,
                seccion: null,
                frente: null,
              }, det.filter(d => d.descripcion.trim() && Number(d.cantidad) > 0))}>
                <Printer size={13} /> Imprimir
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn-secondary" onClick={() => handleSave(false)} disabled={saving}>
              {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar Borrador
            </button>
            <button className="btn-primary" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />} Enviar para Autorización
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Vista de detalle + autorización ────────────────────────
function RequisicionDetail({ req, canAuth, onClose, onAuth }: { req: any; canAuth: boolean; onClose: () => void; onAuth: (id: number, ap: boolean, c: string) => void }) {
  const [det, setDet]           = useState<any[]>([])
  const [comentario, setComent] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [ubic, setUbic] = useState(() => ({
    cc: String(req.centro_costo ?? '').trim() || '—',
    seccion: String(req.seccion ?? '').trim() || '—',
    frente: String(req.frente ?? '').trim() || '—',
  }))

  useEffect(() => {
    dbComp.from('requisiciones_det').select('*').eq('id_requisicion_fk', req.id)
      .then(({ data }) => setDet(data ?? []))
  }, [req.id])

  useEffect(() => {
    let cancelled = false
    resolveRequisicionUbicacion(req).then(u => {
      if (cancelled) return
      setUbic({
        cc: u.centroCosto || '—',
        seccion: u.seccion || '—',
        frente: u.frente || '—',
      })
    })
    return () => { cancelled = true }
  }, [req.id, req.centro_costo, req.seccion, req.frente, req.id_centro_costo_fk, req.id_area_fk, req.id_frente_fk])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{req.folio}</span>
              <StatusBadge status={req.status} />
              <span style={{ fontSize: 11, fontWeight: 600, color: req.prioridad === 'Crítica' ? '#dc2626' : req.prioridad === 'Urgente' ? '#d97706' : '#64748b' }}>● {req.prioridad}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{req.area_solicitante} · {req.solicitante} · {fmtFecha(req.fecha_solicitud)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => imprimirRequisicion(req, det)}>
              <Printer size={13} /> Imprimir
            </button>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '18px 24px', overflowY: 'auto', maxHeight: 'calc(88vh - 120px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
            <DI label="Fecha Requerida"  value={fmtFecha(req.fecha_requerida)} />
            <DI label="Centro de Costo"  value={ubic.cc} />
            <DI label="Sección"         value={ubic.seccion} />
            <DI label="Frente"           value={ubic.frente} />
            {req.justificacion && <DI label="Justificación" value={req.justificacion} />}
            {req.autorizado_por && <DI label="Autorizado por" value={`${req.autorizado_por} — ${fmtFecha(req.fecha_autorizacion)}`} />}
            {req.comentario_auth && <DI label="Comentario" value={req.comentario_auth} />}
          </div>

          {/* Detalle */}
          <Sec label={`Productos (${det.length})`}>
            <div className="card" style={{ overflow: 'hidden' }}>
              <table>
                <thead><tr><th>Descripción</th><th style={{ textAlign: 'right' }}>Cantidad</th><th>Unidad</th><th>Notas</th></tr></thead>
                <tbody>
                  {det.map((d, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{d.descripcion}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.cantidad}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.unidad}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.notas ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Sec>

          {/* Panel autorización */}
          {canAuth && req.status === 'Enviada' && (
            <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Autorización de Requisición</div>
              <textarea className="input" rows={2} value={comentario} onChange={e => setComent(e.target.value)}
                placeholder="Comentario (opcional)" style={{ resize: 'vertical', marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => onAuth(req.id, true, comentario)} style={{ flex: 1 }}>
                  <CheckCircle size={13} /> Aprobar
                </button>
                <button onClick={() => onAuth(req.id, false, comentario)}
                  style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 7, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)' }}>
                  <XCircle size={13} /> Rechazar
                </button>
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
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{value}</div>
  </div>
) : null
