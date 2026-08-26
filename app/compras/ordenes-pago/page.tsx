'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useTiposGasto } from '@/lib/useTiposGasto'
import { useState, useCallback, useEffect, useRef } from 'react'
import { dbComp, dbCfg, dbCtrl, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  ArrowLeft, Printer, CheckCircle, Trash2, ChevronLeft, ChevronRight,
  Edit2, Upload, ExternalLink, FileText, AlertTriangle, MessageSquare, Send, Tag,
  RotateCcw, Copy, Unlock
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, nextFolio, StatusBadge, FORMAS_PAGO_COMP } from '../types'
import ModalShell from '@/components/ui/ModalShell'
import { OPDetail, Sec, DI, URGENCIA_COLOR } from '@/components/compras/OPDetailModal'

const PAGE_SIZES = [10, 25, 50, 100]

type RolTipoOp = { tipo_gasto: string; modo: string; solo_propios: boolean }

const URGENCIAS = ['Crítica', 'Alta', 'Media', 'Baja'] as const
const URGENCIA_BADGE: Record<string, { color: string; bg: string; border: string }> = {
  'Crítica': { color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  'Alta':    { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Media':   { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Baja':    { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
}

export default function OrdenesPagoPage() {
  const { canWrite } = useAuth()
  const router = useRouter()
  const { authUser } = useAuth()
  const tiposGasto = useTiposGasto()
  const [rows, setRows]         = useState<any[]>([])
  const [provMap, setProvMap]   = useState<Record<number, string>>({})
  const [almMap, setAlmMap]     = useState<Record<number, string>>({})
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch]     = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterStatus, setFilter] = useState('')
  const [filterCC, setFilterCC] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [filterProv, setFilterProv] = useState('')
  const [filterTipoGasto, setFilterTipoGasto] = useState('')
  const [filterFechaDesde, setFilterFechaDesde] = useState('')
  const [filterFechaHasta, setFilterFechaHasta] = useState('')
  const [rolRestricciones, setRolRestricciones] = useState<RolTipoOp[] | null>(null)
  const [centrosCosto, setCentros] = useState<{ id: number; nombre: string }[]>([])
  const [areaFiltros, setAreaFiltros] = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [editOp, setEditOp]     = useState<any | null>(null)
  const [detail, setDetail]     = useState<any | null>(null)

  const tiposPermitidos = rolRestricciones !== null && rolRestricciones.some(r => r.modo === 'ALLOW')
    ? rolRestricciones.filter(r => r.modo === 'ALLOW').map(r => r.tipo_gasto)
    : null
  const tiposExcluidos = rolRestricciones !== null && rolRestricciones.some(r => r.modo === 'DENY')
    ? rolRestricciones.filter(r => r.modo === 'DENY').map(r => r.tipo_gasto)
    : null
  const soloPropios = rolRestricciones?.some(r => r.modo === 'ALLOW' && r.solo_propios) ?? false

  const fetchData = useCallback(async () => {
    if (rolRestricciones === null) return
    setLoading(true)

    // OP con distribución por área (ordenes_pago_det) quedan con id_area_fk null
    // en el encabezado — sin esto el filtro de Área las excluye por completo.
    let idsDistribuidos: number[] = []
    if (filterArea) {
      const { data: detRows } = await dbComp.from('ordenes_pago_det')
        .select('id_op_fk').eq('id_area_fk', Number(filterArea))
      idsDistribuidos = Array.from(new Set((detRows ?? []).map((d: any) => d.id_op_fk)))
    }

    let q = dbComp.from('ordenes_pago').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterCC) q = q.eq('id_centro_costo_fk', Number(filterCC))
    if (filterArea) {
      q = idsDistribuidos.length > 0
        ? q.or(`id_area_fk.eq.${Number(filterArea)},id.in.(${idsDistribuidos.join(',')})`)
        : q.eq('id_area_fk', Number(filterArea))
    }
    if (filterProv) q = q.eq('id_proveedor_fk', Number(filterProv))
    if (filterTipoGasto) q = q.eq('tipo_gasto', filterTipoGasto)
    if (filterFechaDesde) q = q.gte('created_at', `${filterFechaDesde}T00:00:00`)
    if (filterFechaHasta) q = q.lte('created_at', `${filterFechaHasta}T23:59:59`)
    if (debouncedSearch) q = q.or(`folio.ilike.%${debouncedSearch}%,concepto.ilike.%${debouncedSearch}%`)

    // Restricciones por rol
    if (tiposPermitidos) {
      q = q.in('tipo_gasto', tiposPermitidos)
      if (soloPropios && authUser?.user.id) q = q.eq('created_by_id', authUser.user.id)
    }
    if (tiposExcluidos && tiposExcluidos.length === 1) {
      q = q.or(`tipo_gasto.is.null,tipo_gasto.neq.${tiposExcluidos[0]}`)
    } else if (tiposExcluidos && tiposExcluidos.length > 1) {
      // NOT (tipo_gasto IN (...)) es NULL (excluye la fila) cuando tipo_gasto es NULL en SQL —
      // hay que incluir tipo_gasto.is.null explícitamente o las OP sin tipo de gasto desaparecen.
      q = q.or(`tipo_gasto.is.null,tipo_gasto.not.in.(${tiposExcluidos.join(',')})`)
    }

    const { data, count } = await q
    setRows(data ?? [])
    setTotal(count ?? 0)

    const [{ data: provs }, { data: alms }] = await Promise.all([
      dbComp.from('proveedores').select('id, nombre'),
      dbComp.from('almacenes').select('id, nombre'),
    ])
    const pm: Record<number, string> = {}
    const am: Record<number, string> = {}
    ;(provs ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    ;(alms  ?? []).forEach((a: any) => { am[a.id] = a.nombre })
    setProvMap(pm)
    setAlmMap(am)
    setLoading(false)
  }, [page, pageSize, debouncedSearch, filterStatus, filterCC, filterArea, filterProv, filterTipoGasto, filterFechaDesde, filterFechaHasta, rolRestricciones, authUser?.user.id])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCentros((data ?? []) as { id: number; nombre: string }[]))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setAreaFiltros((data ?? []) as { id: number; nombre: string; id_centro_costo_fk: number }[]))
  }, [])

  useEffect(() => {
    if (!authUser) return
    dbCfg.from('rol_tipos_op').select('tipo_gasto, modo, solo_propios').eq('rol', authUser.rol)
      .then(({ data }) => setRolRestricciones(data ?? []))
  }, [authUser?.rol])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" onClick={() => router.push('/compras')}><ArrowLeft size={15} /></button>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Órdenes de Pago</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Con o sin OC relacionada · {total} registros</p>
          </div>
        </div>
        {canWrite('ordenes-pago') && (
          <button className="btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Nueva Orden de Pago</button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, concepto…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <select className="select" style={{ width: 175 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
          <option value="">Todas</option>
          <option value="Pendiente Auth">Pend. Autorización</option>
          <option value="Pendiente Auth Finanzas">Pend. Auth Finanzas</option>
          <option value="Pendiente">Pendientes (CXP)</option>
          <option value="Abonada">Abonadas</option>
          <option value="Pagada">Pagadas</option>
          <option value="Rechazada">Rechazadas</option>
          <option value="Cancelada">Canceladas</option>
        </select>
        <select className="select" style={{ width: 220 }} value={filterCC}
          onChange={e => { setFilterCC(e.target.value); setFilterArea(''); setPage(0) }}>
          <option value="">Todos los centros de costo</option>
          {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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
        {!tiposPermitidos && (
          <select className="select" style={{ width: 180 }} value={filterTipoGasto}
            onChange={e => { setFilterTipoGasto(e.target.value); setPage(0) }}>
            <option value="">Todos los tipos</option>
            {tiposGasto
              .filter(t => !tiposExcluidos || !tiposExcluidos.includes(t))
              .map(t => <option key={t}>{t}</option>)}
          </select>
        )}
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* Filtro de rango de fechas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Fecha creación:</span>
        <input className="input" type="date" style={{ width: 150 }}
          value={filterFechaDesde}
          onChange={e => { setFilterFechaDesde(e.target.value); setPage(0) }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
        <input className="input" type="date" style={{ width: 150 }}
          value={filterFechaHasta}
          onChange={e => { setFilterFechaHasta(e.target.value); setPage(0) }} />
        {(filterFechaDesde || filterFechaHasta) && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => { setFilterFechaDesde(''); setFilterFechaHasta(''); setPage(0) }}>
            Limpiar fechas
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 110 }}>Folio</th>
              <th>Proveedor</th>
              <th>Concepto / Tipo</th>
              <th style={{ width: 90 }}>Urgencia</th>
              <th style={{ textAlign: 'right', width: 110 }}>Monto</th>
              <th style={{ whiteSpace: 'nowrap' }}>Status</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                Sin órdenes de pago registradas
              </td></tr>
            ) : rows.map(r => (
              <tr key={r.id} style={{ opacity: (r.status === 'Cancelada' || r.status === 'Sustituida') ? 0.45 : 1 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>
                  {r.folio}
                  {(r.pdf_factura || r.xml_factura) && (
                    <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                      {r.pdf_factura && (
                        <span title="PDF Factura" style={{ fontSize: 9, padding: '1px 5px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, fontWeight: 600 }}>PDF</span>
                      )}
                      {r.xml_factura && (
                        <span title="XML Factura" style={{ fontSize: 9, padding: '1px 5px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 4, fontWeight: 600 }}>XML</span>
                      )}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 13 }}>{r.id_proveedor_fk ? (provMap[r.id_proveedor_fk] ?? `#${r.id_proveedor_fk}`) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                <td style={{ fontSize: 12, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.concepto ?? '—'}
                  {r.tipo_gasto && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)', background: '#f1f5f9', padding: '1px 6px', borderRadius: 10 }}>{r.tipo_gasto}</span>}
                  {r.id_centro_costo_fk && !r.id_area_fk && <span style={{ fontSize: 9, marginLeft: 6, color: '#7c3aed', background: '#f5f3ff', padding: '1px 5px', borderRadius: 10, fontWeight: 600 }}>distribuido</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.urgencia ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                      background: URGENCIA_BADGE[r.urgencia]?.bg, color: URGENCIA_BADGE[r.urgencia]?.color,
                      border: `1px solid ${URGENCIA_BADGE[r.urgencia]?.border}` }}>
                      {r.urgencia}
                    </span>
                  ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 14 }}>{fmt(r.monto)}</td>
                <td style={{ whiteSpace: 'nowrap' }}><StatusBadge status={r.status} /></td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px' }}
                    onClick={() => setDetail({ ...r, _provNombre: provMap[r.id_proveedor_fk], _almNombre: almMap[r.id_almacen_fk] })}>
                    <Eye size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {!loading && rows.length > 0 && (() => {
            // saldo/monto_pagado son NULL hasta el primer abono en /tesoreria/cxp:
            // usar (saldo ?? monto) para "por pagar" y monto_pagado directo para "pagado"
            // — (monto - saldo) con saldo NULL⇒0 inflaba "Pagado" al 100% de OP sin tocar.
            const sumaMontoPage  = rows.reduce((a, r) => a + (r.monto  ?? 0), 0)
            const sumaSaldoPage  = rows.reduce((a, r) => a + (r.saldo  ?? r.monto ?? 0), 0)
            const sumaPagadoPage = rows.reduce((a, r) => a + (r.monto_pagado ?? 0), 0)
            return (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={4} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Subtotal página ({rows.length} reg.)
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 14, color: 'var(--text-primary)' }}>
                    {fmt(sumaMontoPage)}
                    {sumaSaldoPage > 0 && sumaSaldoPage !== sumaMontoPage && (
                      <div style={{ fontSize: 10, fontWeight: 500, color: '#d97706', marginTop: 1 }}>
                        Saldo: {fmt(sumaSaldoPage)}
                      </div>
                    )}
                  </td>
                  <td colSpan={2} style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)' }}>
                    {sumaPagadoPage > 0 && <span>Pagado: {fmt(sumaPagadoPage)}</span>}
                  </td>
                </tr>
              </tfoot>
            )
          })()}
        </table>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mostrar</span>
            <select className="select" style={{ width: 72, padding: '4px 8px', fontSize: 12 }}
              value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }}>
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              · {total === 0 ? '0' : `${page * pageSize + 1}–${Math.min(page * pageSize + pageSize, total)}`} de {total} registros
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13}/></button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center', minWidth: 60, textAlign: 'center' }}>
              Pág. {page + 1} de {Math.max(totalPages, 1)}
            </span>
            <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13}/></button>
          </div>
        </div>
      </div>

      {modal  && <OPModal   op={editOp} onClose={() => { setModal(false); setEditOp(null) }} onSaved={() => { setModal(false); setEditOp(null); fetchData() }} />}
      {detail && <OPDetail  op={detail} onClose={() => { setDetail(null); fetchData() }} onCanceled={() => { setDetail(null); fetchData() }}
        onEdit={() => { setEditOp(detail); setDetail(null); setModal(true) }}
        onAuthorized={() => { setDetail(null); fetchData() }} />}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Modal Orden de Pago — incluye PDF Factura + XML Factura
// ════════════════════════════════════════════════════════════
function OPModal({ op: opEdit, onClose, onSaved }: { op?: any; onClose: () => void; onSaved: () => void }) {
  const { authUser } = useAuth()
  const tiposGasto = useTiposGasto()
  const isEdit = !!opEdit
  const [rolRestriccionesModal, setRolRestriccionesModal] = useState<RolTipoOp[] | null>(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [uploading, setUploading] = useState<string | null>(null)
  const [proveedores, setProvs]     = useState<any[]>([])
  const [almacenes, setAlms]        = useState<any[]>([])
  const [centrosCosto, setCentros]  = useState<any[]>([])
  const [ccAreas, setCcAreas]       = useState<any[]>([])
  const [frentes, setFrentes]       = useState<any[]>([])
  const [relAF,   setRelAF]         = useState<{id_area: number; id_frente: number}[]>([])
  const [formasPago, setFormasPago] = useState<any[]>([])
  const [areaId, setAreaId]         = useState<string>(opEdit?.id_area_fk?.toString() ?? '')
  const [ocsDisp, setOcsDisp]       = useState<any[]>([])
  const [ocsSelected, setOcsSel]    = useState<{ id: number; folio: string; total: number; monto: string }[]>([])
  const [valesCombDisp, setValesCombDisp] = useState<any[]>([])
  const [valesCombSel,  setValesCombSel]  = useState<number[]>([])
  const [vigLotesDisp, setVigLotesDisp]   = useState<any[]>([])
  const [vigLotesSel,  setVigLotesSel]    = useState<number[]>([])
  const [bitacorasDisp, setBitacorasDisp] = useState<any[]>([])
  const [bitacorasSel,  setBitacorasSel]  = useState<number[]>([])
  const [equiposMapModal, setEquiposMapModal] = useState<Record<number, string>>({})
  const [conOC, setConOC] = useState<boolean | null>(
    opEdit ? (opEdit.id_oc_fk != null) : null
  )
  const [ocCCPreview, setOcCCPreview] = useState<{ cc: string; sec: string; frente: string } | null>(null)
  const [ocCCId, setOcCCId]           = useState<number | null>(opEdit?.id_centro_costo_fk ?? null)
  type DetLine = { tempId: number; descripcion: string; id_area_fk: string; id_frente_fk: string; monto: string }
  const [detLines, setDetLines]       = useState<DetLine[]>([])
  const [nextTempId, setNextTempId]   = useState(0)

  const [serviciosCatalogo, setServiciosCatalogo] = useState<any[]>([])
  const [savedOpForConsumo, setSavedOpForConsumo] = useState<{ opId: number; servicioId: number; monto: number } | null>(null)

  const pdfRef     = useRef<HTMLInputElement>(null)
  const xmlRef     = useRef<HTMLInputElement>(null)
  const soporteRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    id_proveedor_fk:    opEdit?.id_proveedor_fk?.toString() ?? '',
    id_almacen_fk:      opEdit?.id_almacen_fk?.toString()   ?? '',
    id_centro_costo_fk: opEdit?.id_centro_costo_fk?.toString() ?? '',
    id_area_fk:         opEdit?.id_area_fk?.toString()       ?? '',
    id_frente_fk:       opEdit?.id_frente_fk?.toString()    ?? '',
    forma_pago:        opEdit?.forma_pago        ?? 'Transferencia',
    fecha_vencimiento: opEdit?.fecha_vencimiento ?? '',
    concepto:          opEdit?.concepto          ?? '',
    tipo_gasto:        opEdit?.tipo_gasto        ?? '',
    urgencia:          opEdit?.urgencia          ?? 'Media',
    banco_destino:     opEdit?.banco_destino     ?? '',
    cuenta_clabe:      opEdit?.cuenta_clabe      ?? '',
    notas:             opEdit?.notas             ?? '',
    monto_manual:      opEdit?.monto?.toString() ?? '',
    fecha_factura:     opEdit?.fecha_factura     ?? '',
    folio_factura:     opEdit?.folio_factura     ?? '',
    subtotal:          opEdit?.subtotal?.toString() ?? '',
    iva:               opEdit?.iva?.toString()      ?? '',
    pdf_factura:       opEdit?.pdf_factura       ?? '',
    xml_factura:       opEdit?.xml_factura       ?? '',
    soporte_url:       opEdit?.soporte_url       ?? '',
    id_servicio_fk:    opEdit?.id_servicio_fk?.toString() ?? '',
  })

  useEffect(() => {
    Promise.all([
      dbComp.from('proveedores').select('id, nombre, banco, cuenta_clabe, condiciones_pago').eq('activo', true).order('nombre'),
      dbComp.from('almacenes').select('id, nombre, tipo').eq('activo', true).order('nombre'),
      dbComp.from('ordenes_compra').select('id, folio, total, id_proveedor_fk, subtotal, iva, fecha_factura, folio_factura').eq('status', 'Autorizada').order('folio'),
    ]).then(([{ data: provs }, { data: alms }, { data: ocs }]) => {
      setProvs(provs ?? [])
      setAlms(alms ?? [])
      setOcsDisp(ocs ?? [])
    })
    // Catálogos cfg para opción sin OC
    import('@/lib/supabase').then(({ dbCfg }) => {
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
        .then(({ data }) => setCentros(data ?? []))
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
        .then(({ data }) => setCcAreas(data ?? []))
      dbCfg.from('frentes').select('id, nombre').eq('activo', true).order('nombre')
        .then(({ data }) => setFrentes(data ?? []))
      dbCfg.from('rel_area_frente').select('id_area, id_frente')
        .then(({ data }) => setRelAF(data ?? []))
      dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre')
        .then(({ data }) => setFormasPago(data ?? []))
      dbCfg.from('equipos').select('id, nombre, placa')
        .then(({ data }) => setEquiposMapModal(Object.fromEntries((data ?? []).map((e: any) => [e.id, e.placa ? `${e.nombre} (${e.placa})` : e.nombre]))))
    })
    // Catálogo de servicios (CFE/Agua) para cuando proveedor es id=75
    dbCtrl.from('servicios_catalogo').select('id, no_servicio, ubicacion, tipo_servicio')
      .eq('activo', true).order('tipo_servicio').order('ubicacion')
      .then(({ data }) => setServiciosCatalogo(data ?? []))

    // Cargar líneas de distribución al editar
    if (isEdit && opEdit?.id) {
      dbComp.from('ordenes_pago_det').select('*').eq('id_op_fk', opEdit.id).order('id')
        .then(({ data }) => {
          if (data && data.length > 0) {
            setDetLines(data.map((d: any, i: number) => ({
              tempId:       i,
              descripcion:  d.descripcion  ?? '',
              id_area_fk:   d.id_area_fk?.toString()   ?? '',
              id_frente_fk: d.id_frente_fk?.toString() ?? '',
              monto:        d.monto?.toString()         ?? '0',
            })))
            setNextTempId(data.length)
          }
        })
      // Cargar la(s) OC vinculada(s) al editar — la OC ya no está en status
      // 'Autorizada' (se movió a 'Enviada al Prov' al generar la OP), así que
      // no aparece en ocsDisp y nunca se restauraba en ocsSelected: el monto
      // quedaba en $0 apenas se abría el editor.
      if (opEdit.id_oc_fk != null) {
        dbComp.from('ordenes_pago_oc')
          .select('id_oc_fk, monto, ordenes_compra(folio, total, subtotal, iva, fecha_factura, folio_factura)')
          .eq('id_op_fk', opEdit.id)
          .then(({ data }) => {
            if (data && data.length > 0) {
              setOcsSel(data.map((r: any) => ({
                id:    r.id_oc_fk,
                folio: r.ordenes_compra?.folio ?? `#${r.id_oc_fk}`,
                total: r.ordenes_compra?.total ?? 0,
                monto: r.monto?.toString() ?? '0',
              })))
              // Si la OP no trae su propio desglose de factura (dato legacy previo
              // a esa columna), se rescata de la OC — ahí sí existía desde antes.
              if (opEdit.subtotal == null && opEdit.iva == null) {
                const oc0 = data[0].ordenes_compra as any
                setForm(f => ({
                  ...f,
                  subtotal:      oc0?.subtotal?.toString()      ?? f.subtotal,
                  iva:           oc0?.iva?.toString()            ?? f.iva,
                  fecha_factura: f.fecha_factura || oc0?.fecha_factura || '',
                  folio_factura: f.folio_factura || oc0?.folio_factura || '',
                }))
              }
            }
          })
        if (opEdit.id_centro_costo_fk || opEdit.id_area_fk || opEdit.id_frente_fk) {
          import('@/lib/supabase').then(async ({ dbCfg: cfg }) => {
            const [{ data: ccData }, { data: secData }, { data: frData }] = await Promise.all([
              opEdit.id_centro_costo_fk ? cfg.from('centros_costo').select('nombre').eq('id', opEdit.id_centro_costo_fk).single() : Promise.resolve({ data: null }),
              opEdit.id_area_fk         ? cfg.from('areas').select('nombre').eq('id', opEdit.id_area_fk).single()             : Promise.resolve({ data: null }),
              opEdit.id_frente_fk       ? cfg.from('frentes').select('nombre').eq('id', opEdit.id_frente_fk).single()        : Promise.resolve({ data: null }),
            ])
            setOcCCPreview({
              cc:     (ccData as any)?.nombre  ?? '—',
              sec:    (secData as any)?.nombre ?? '—',
              frente: (frData as any)?.nombre  ?? '—',
            })
          })
        }
      }
    }
  }, [])

  // OP manual (sin OC) con datos legacy: si nunca se capturó Subtotal/IVA
  // (columnas agregadas 2026-08-19) pero sí tiene Monto, se usa como punto de
  // partida editable en vez de dejar los campos en blanco — de lo contrario,
  // al guardar sin tocarlos, Monto se recalculaba como Subtotal(0)+IVA(0)=0.
  useEffect(() => {
    if (!isEdit || !opEdit) return
    if (opEdit.id_oc_fk != null) return
    if (opEdit.subtotal != null || opEdit.iva != null) return
    if (opEdit.monto == null || opEdit.monto <= 0) return
    setForm(f => (f.subtotal === '' && f.iva === '') ? { ...f, subtotal: opEdit.monto.toString(), iva: '0' } : f)
  }, [])

  useEffect(() => {
    if (!authUser) return
    dbCfg.from('rol_tipos_op').select('tipo_gasto, modo, solo_propios').eq('rol', authUser.rol)
      .then(({ data }) => {
        const rows = (data ?? []) as RolTipoOp[]
        setRolRestriccionesModal(rows)
        const permitidos = rows.filter(r => r.modo === 'ALLOW').map(r => r.tipo_gasto)
        if (!isEdit && permitidos.length === 1) {
          setForm(f => ({ ...f, tipo_gasto: permitidos[0] }))
        }
      })
  }, [authUser?.rol, isEdit])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // Vales de combustible en Solicitado disponibles para pagar con esta OP —
  // el proceso arranca aquí: la OP se genera con base en los vales pendientes de pago.
  // Nota: sin embed de `areas` — PostgREST no resuelve relaciones cross-schema
  // (ctrl -> cfg) por FK; el nombre del centro de costo se resuelve con centrosCosto (ya cargado).
  useEffect(() => {
    if (form.tipo_gasto !== 'Combustible') return
    let q = dbCtrl.from('vales_combustible')
      .select('id, folio, tipo_suministro, periodo, litros_autorizados, monto_autorizado, id_centro_costo_fk, id_op_fk')
      .eq('status', 'Solicitado').order('created_at', { ascending: false })
    q = isEdit ? q.or(`id_op_fk.is.null,id_op_fk.eq.${opEdit.id}`) : q.is('id_op_fk', null)
    q.then(({ data, error }) => {
      if (error) console.error('fetch vales combustible:', error.message)
      setValesCombDisp(data ?? [])
      if (isEdit) setValesCombSel((data ?? []).filter((v: any) => v.id_op_fk === opEdit.id).map((v: any) => v.id))
    })
  }, [form.tipo_gasto])

  const toggleValeComb = (id: number) =>
    setValesCombSel(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])

  // Sugiere el monto de la OP con la suma de los vales seleccionados (el usuario puede ajustarlo)
  useEffect(() => {
    if (form.tipo_gasto !== 'Combustible' || valesCombSel.length === 0) return
    const total = valesCombDisp.filter(v => valesCombSel.includes(v.id)).reduce((a, v) => a + (v.monto_autorizado ?? 0), 0)
    if (total > 0) setForm(f => ({ ...f, monto_manual: total.toFixed(2) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valesCombSel])

  // Lotes de Vigilancia Extras en status Autorizado disponibles para pagar con esta OP
  // (mismo patrón que vales de combustible: se capturan/autorizan en /vigilancia-extras
  // y aquí solo se vinculan cuando el tipo de gasto es Perimetrales).
  useEffect(() => {
    if (form.tipo_gasto !== 'Perimetrales') return
    let q = dbCtrl.from('vigilancia_extras_lotes')
      .select('id, folio, fecha_desde, fecha_hasta, id_area_fk, total, id_op_fk')
      .eq('status', 'Autorizado').order('fecha_desde', { ascending: false })
    q = isEdit ? q.or(`id_op_fk.is.null,id_op_fk.eq.${opEdit.id}`) : q.is('id_op_fk', null)
    q.then(({ data, error }) => {
      if (error) console.error('fetch vigilancia_extras_lotes:', error.message)
      setVigLotesDisp(data ?? [])
      if (isEdit) setVigLotesSel((data ?? []).filter((l: any) => l.id_op_fk === opEdit.id).map((l: any) => l.id))
    })
  }, [form.tipo_gasto])

  const toggleVigLote = (id: number) =>
    setVigLotesSel(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])

  // Sugiere el monto de la OP con la suma de los lotes seleccionados (el usuario puede ajustarlo)
  useEffect(() => {
    if (form.tipo_gasto !== 'Perimetrales' || vigLotesSel.length === 0) return
    const total = vigLotesDisp.filter(l => vigLotesSel.includes(l.id)).reduce((a, l) => a + (l.total ?? 0), 0)
    if (total > 0) setForm(f => ({ ...f, monto_manual: total.toFixed(2) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vigLotesSel])

  // Bitácoras de Servicio (Vehículos y Maquinaria) en status Cerrado, sin OP
  // vinculada aún. A diferencia de vales/perimetrales, ctrl.bitacora_equipo_ops
  // es tabla puente (una bitácora podría en teoría ligar a varias OP) — aquí
  // se trata igual de simple: disponible = sin ninguna liga todavía (o solo
  // ligada a esta misma OP, en edición).
  useEffect(() => {
    if (form.tipo_gasto !== 'Mantenimiento de Vehículos') return
    Promise.all([
      dbCtrl.from('bitacora_equipos')
        .select('id, folio, id_equipo_fk, tipo, descripcion, fecha_fin, costo_total')
        .eq('status', 'Cerrado').order('fecha_fin', { ascending: false }),
      dbCtrl.from('bitacora_equipo_ops').select('id_bitacora_fk, id_op_fk'),
    ]).then(([{ data: bits, error }, { data: links }]) => {
      if (error) console.error('fetch bitacora_equipos:', error.message)
      const ligadaOtra = new Set((links ?? [])
        .filter((l: any) => !isEdit || l.id_op_fk !== opEdit.id)
        .map((l: any) => l.id_bitacora_fk))
      setBitacorasDisp((bits ?? []).filter((b: any) => !ligadaOtra.has(b.id)))
      if (isEdit) setBitacorasSel((links ?? []).filter((l: any) => l.id_op_fk === opEdit.id).map((l: any) => l.id_bitacora_fk))
    })
  }, [form.tipo_gasto])

  const toggleBitacora = (id: number) =>
    setBitacorasSel(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])

  // Sugiere el monto de la OP con la suma de las bitácoras seleccionadas
  useEffect(() => {
    if (form.tipo_gasto !== 'Mantenimiento de Vehículos' || bitacorasSel.length === 0) return
    const total = bitacorasDisp.filter(b => bitacorasSel.includes(b.id)).reduce((a, b) => a + (b.costo_total ?? 0), 0)
    if (total > 0) setForm(f => ({ ...f, monto_manual: total.toFixed(2) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitacorasSel])

  const aplicarProveedor = (provId: string) => {
    const prov = proveedores.find(p => p.id === Number(provId))
    setForm(f => ({
      ...f,
      id_proveedor_fk: provId,
      banco_destino:   prov?.banco ?? f.banco_destino,
      cuenta_clabe:    prov?.cuenta_clabe ?? f.cuenta_clabe,
    }))
    setOcsSel([])
  }

  const addOC = async (ocId: string) => {
    const oc = ocsDisp.find(o => o.id === Number(ocId))
    if (!oc || ocsSelected.some(o => o.id === oc.id)) return
    setOcsSel(prev => {
      const next = [...prev, { id: oc.id, folio: oc.folio, total: oc.total, monto: oc.total?.toString() ?? '' }]
      // Precargar datos de factura de la primera OC (informativo, editable)
      if (next.length === 1) {
        setForm(f => ({
          ...f,
          subtotal:      oc.subtotal?.toString()      ?? f.subtotal,
          iva:           oc.iva?.toString()            ?? f.iva,
          fecha_factura: oc.fecha_factura              ?? f.fecha_factura,
          folio_factura: oc.folio_factura              ?? f.folio_factura,
        }))
      }
      // Cargar preview de CC/Área/Frente de la primera OC
      if (next.length === 1) {
        dbComp.from('ordenes_compra')
          .select('id_centro_costo_fk, id_area_fk, id_frente_fk')
          .eq('id', oc.id).single()
          .then(async ({ data: ocData }) => {
            if (!ocData) return
            const { dbCfg: cfg } = await import('@/lib/supabase')
            const [{ data: ccData }, { data: secData }, { data: frData }] = await Promise.all([
              ocData.id_centro_costo_fk ? cfg.from('centros_costo').select('nombre').eq('id', ocData.id_centro_costo_fk).single() : Promise.resolve({ data: null }),
              ocData.id_area_fk         ? cfg.from('areas').select('nombre').eq('id', ocData.id_area_fk).single()             : Promise.resolve({ data: null }),
              ocData.id_frente_fk       ? cfg.from('frentes').select('nombre').eq('id', ocData.id_frente_fk).single()        : Promise.resolve({ data: null }),
            ])
            setOcCCPreview({
              cc:     (ccData as any)?.nombre  ?? '—',
              sec:    (secData as any)?.nombre ?? '—',
              frente: (frData as any)?.nombre  ?? '—',
            })
            setOcCCId(ocData.id_centro_costo_fk ?? null)
          })
      }
      return next
    })
  }

  const removeOC = (id: number) => {
    setOcsSel(prev => {
      const next = prev.filter(o => o.id !== id)
      if (next.length === 0) setOcCCPreview(null)
      return next
    })
  }

  const setOCMonto = (id: number, v: string) =>
    setOcsSel(prev => prev.map(o => o.id === id ? { ...o, monto: v } : o))

  // ── Distribución por área ──────────────────────────────────
  const headerCCId = conOC ? ocCCId : (form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null)
  const addDetLine = () => {
    setDetLines(l => [...l, { tempId: nextTempId, descripcion: '', id_area_fk: '', id_frente_fk: '', monto: '' }])
    setNextTempId(n => n + 1)
  }
  const removeDetLine = (tid: number) => setDetLines(l => l.filter(x => x.tempId !== tid))
  const updateDetLine = (tid: number, field: string, value: string) =>
    setDetLines(l => l.map(x => x.tempId === tid
      ? { ...x, [field]: value, ...(field === 'id_area_fk' ? { id_frente_fk: '' } : {}) }
      : x))
  const detTotal   = detLines.reduce((a, l) => a + (Number(l.monto) || 0), 0)
  // Combustible/Perimetrales/Mantenimiento de Vehículos: el monto se sugiere
  // automáticamente de las selecciones (vales/lotes/bitácoras), sin desglose
  // de factura — ahí se sigue capturando un Monto único.
  const isVale = ['Combustible', 'Perimetrales', 'Mantenimiento de Vehículos'].includes(form.tipo_gasto)
  const subtotalNum = Number(form.subtotal) || 0
  const ivaNum      = Number(form.iva) || 0
  const montoManual = (!conOC && !isVale) ? subtotalNum + ivaNum : (Number(form.monto_manual) || 0)
  const montoTotal = detLines.length > 0
    ? detTotal
    : conOC
      ? ocsSelected.reduce((a, o) => a + (Number(o.monto) || 0), 0)
      : montoManual

  const ocsDelProv = form.id_proveedor_fk
    ? ocsDisp.filter(o => o.id_proveedor_fk === Number(form.id_proveedor_fk) && !ocsSelected.some(s => s.id === o.id))
    : ocsDisp.filter(o => !ocsSelected.some(s => s.id === o.id))

  // Upload archivo a Supabase Storage
  const uploadFile = async (file: File, campo: 'pdf_factura' | 'xml_factura' | 'soporte_url') => {
    setUploading(campo)
    const ext  = file.name.split('.').pop()
    const opId = opEdit?.id ?? 'new'
    const path = `op-${opId}/${campo}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('cxp-docs').upload(path, file, { upsert: true })
    if (upErr) { alert('Error al subir archivo: ' + upErr.message); setUploading(null); return }
    const { data: { publicUrl } } = supabase.storage.from('cxp-docs').getPublicUrl(path)
    setForm(f => ({ ...f, [campo]: publicUrl }))
    setUploading(null)
  }

  const FileDoc = ({ campo, label, accept, refEl }: {
    campo: 'pdf_factura' | 'xml_factura' | 'soporte_url'
    label: string
    accept: string
    refEl: React.RefObject<HTMLInputElement>
  }) => (
    <div>
      <label className="label">{label}</label>
      <input ref={refEl} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], campo) }} />
      {form[campo] ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <a href={form[campo]} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
            <ExternalLink size={11} /> Ver archivo
          </a>
          <button className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
            onClick={() => setForm(f => ({ ...f, [campo]: '' }))}>
            <Trash2 size={12} />
          </button>
        </div>
      ) : (
        <button className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
          onClick={() => refEl.current?.click()}
          disabled={uploading === campo}>
          {uploading === campo ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
          {uploading === campo ? 'Subiendo…' : 'Adjuntar'}
        </button>
      )}
    </div>
  )

  const handleSave = async () => {
    if (!form.id_proveedor_fk && !form.concepto.trim()) {
      setError('Ingresa proveedor o concepto'); return
    }
    if (montoTotal <= 0) { setError('El monto debe ser mayor a cero'); return }
    if (conOC && ocsSelected.length === 0) { setError('Selecciona al menos una OC'); return }
    if (!conOC && !form.id_centro_costo_fk) { setError('Centro de Costo es obligatorio'); return }
    if (!conOC && detLines.length === 0 && !form.id_area_fk) { setError('Área es obligatoria (o agrega líneas de distribución)'); return }
    if (detLines.length > 0 && detLines.some(l => !l.id_area_fk)) { setError('Todas las líneas de distribución deben tener Área asignada'); return }
    if (detLines.length > 0 && detTotal <= 0) { setError('El total de distribución debe ser mayor a cero'); return }
    if (form.tipo_gasto === 'Combustible' && valesCombSel.length === 0) {
      setError('Selecciona al menos un vale solicitado a pagar'); return
    }
    if (form.tipo_gasto === 'Perimetrales' && vigLotesSel.length === 0) {
      setError('Selecciona al menos un perimetral de Vigilancia autorizado'); return
    }
    if (form.tipo_gasto === 'Mantenimiento de Vehículos' && bitacorasSel.length === 0) {
      setError('Selecciona al menos una bitácora de servicio cerrada'); return
    }
    setSaving(true); setError('')

    // Obtener CC/Área/Frente de la OC cuando aplica
    let ocCampos = { id_centro_costo_fk: null as number|null, id_area_fk: null as number|null, id_frente_fk: null as number|null }
    if (conOC && ocsSelected.length > 0) {
      const { data: ocData } = await dbComp.from('ordenes_compra')
        .select('id_centro_costo_fk, id_area_fk, id_frente_fk')
        .eq('id', ocsSelected[0].id).single()
      if (ocData) ocCampos = ocData
    }

    const payload: any = {
      id_proveedor_fk:    form.id_proveedor_fk ? Number(form.id_proveedor_fk) : null,
      id_almacen_fk:      conOC && form.id_almacen_fk ? Number(form.id_almacen_fk) : null,
      id_centro_costo_fk: conOC ? ocCampos.id_centro_costo_fk : (form.id_centro_costo_fk ? Number(form.id_centro_costo_fk) : null),
      id_area_fk:         detLines.length > 0 ? null : (conOC ? ocCampos.id_area_fk   : (form.id_area_fk   ? Number(form.id_area_fk)   : null)),
      id_frente_fk:       detLines.length > 0 ? null : (conOC ? ocCampos.id_frente_fk : (form.id_frente_fk ? Number(form.id_frente_fk) : null)),
      id_oc_fk:           (!conOC || ocsSelected.length === 0) ? null : ocsSelected[0].id,
      forma_pago:        form.forma_pago,
      fecha_vencimiento: form.fecha_vencimiento || null,
      concepto:          form.concepto.trim() || null,
      tipo_gasto:        form.tipo_gasto || null,
      urgencia:          form.urgencia || null,
      banco_destino:     form.banco_destino.trim() || null,
      cuenta_clabe:      form.cuenta_clabe.trim() || null,
      notas:             form.notas.trim() || null,
      monto:             montoTotal,
      fecha_factura:     form.fecha_factura || null,
      folio_factura:     form.folio_factura.trim() || null,
      subtotal:          isVale ? null : (form.subtotal ? subtotalNum : null),
      iva:               isVale ? null : (form.iva ? ivaNum : null),
      pdf_factura:       form.pdf_factura || null,
      xml_factura:       form.xml_factura || null,
      soporte_url:       form.soporte_url || null,
      id_servicio_fk:    form.id_servicio_fk ? Number(form.id_servicio_fk) : null,
    }

    // EDITAR
    if (isEdit) {
      const { error: err } = await dbComp.from('ordenes_pago').update(payload).eq('id', opEdit.id)
      if (err) { setError(err.message); setSaving(false); return }
      // Sincronizar vales de combustible ligados a esta OP
      await dbCtrl.from('vales_combustible').update({ id_op_fk: null }).eq('id_op_fk', opEdit.id)
      if (form.tipo_gasto === 'Combustible' && valesCombSel.length > 0) {
        await dbCtrl.from('vales_combustible').update({ id_op_fk: opEdit.id }).in('id', valesCombSel)
      }
      // Sincronizar lotes de Vigilancia Extras ligados a esta OP
      await dbCtrl.from('vigilancia_extras_lotes').update({ id_op_fk: null }).eq('id_op_fk', opEdit.id)
      if (form.tipo_gasto === 'Perimetrales' && vigLotesSel.length > 0) {
        await dbCtrl.from('vigilancia_extras_lotes').update({ id_op_fk: opEdit.id }).in('id', vigLotesSel)
      }
      // Sincronizar bitácoras de servicio ligadas a esta OP (tabla puente)
      await dbCtrl.from('bitacora_equipo_ops').delete().eq('id_op_fk', opEdit.id)
      if (form.tipo_gasto === 'Mantenimiento de Vehículos' && bitacorasSel.length > 0) {
        await dbCtrl.from('bitacora_equipo_ops').insert(
          bitacorasSel.map(id => ({
            id_bitacora_fk: id, id_op_fk: opEdit.id,
            monto: bitacorasDisp.find(b => b.id === id)?.costo_total ?? 0,
          }))
        )
        // Si la bitácora aún no tenía costo (caso normal: se cierra antes de
        // pagarse) y es la única seleccionada, reflejar el monto final de la
        // OP en su costo_total — así Vehículos y Maquinaria deja de mostrarla
        // en $0 una vez pagada. Con selección múltiple y costo en $0 se deja
        // tal cual, para no inventar un reparto.
        if (bitacorasSel.length === 1) {
          const b = bitacorasDisp.find(x => x.id === bitacorasSel[0])
          if (b && !b.costo_total) {
            await dbCtrl.from('bitacora_equipos').update({ costo_total: Number(form.monto_manual) || 0 }).eq('id', bitacorasSel[0])
          }
        }
      }
      // Sincronizar líneas de distribución
      await dbComp.from('ordenes_pago_det').delete().eq('id_op_fk', opEdit.id)
      if (detLines.length > 0) {
        await dbComp.from('ordenes_pago_det').insert(
          detLines.map(l => ({
            id_op_fk:     opEdit.id,
            descripcion:  l.descripcion  || null,
            id_area_fk:   l.id_area_fk   ? Number(l.id_area_fk)   : null,
            id_frente_fk: l.id_frente_fk ? Number(l.id_frente_fk) : null,
            monto:        Number(l.monto) || 0,
          }))
        )
      }
      if (Number(form.id_proveedor_fk) === 75 && form.id_servicio_fk) {
        setSavedOpForConsumo({ opId: opEdit.id, servicioId: Number(form.id_servicio_fk), monto: montoTotal })
        setSaving(false)
        return
      }
      setSaving(false); onSaved()
      return
    }

    // NUEVO
    try {
      payload.folio = await nextFolio(dbComp, 'OP')
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
      return
    }
    // Toda OP (con o sin OC) pasa por el flujo de doble autorización antes de CXP:
    // Pendiente Auth → (1ra auth) → Pendiente Auth Finanzas → (2da auth) → Pendiente (CXP)
    payload.status         = 'Pendiente Auth'
    payload.created_by     = authUser?.nombre ?? null
    payload.created_by_id  = authUser?.user.id ?? null

    const { data: op, error: err } = await dbComp.from('ordenes_pago').insert(payload).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }

    if (form.tipo_gasto === 'Combustible' && valesCombSel.length > 0) {
      await dbCtrl.from('vales_combustible').update({ id_op_fk: op.id }).in('id', valesCombSel)
    }
    if (form.tipo_gasto === 'Perimetrales' && vigLotesSel.length > 0) {
      await dbCtrl.from('vigilancia_extras_lotes').update({ id_op_fk: op.id }).in('id', vigLotesSel)
    }
    if (form.tipo_gasto === 'Mantenimiento de Vehículos' && bitacorasSel.length > 0) {
      await dbCtrl.from('bitacora_equipo_ops').insert(
        bitacorasSel.map(id => ({
          id_bitacora_fk: id, id_op_fk: op.id,
          monto: bitacorasDisp.find(b => b.id === id)?.costo_total ?? 0,
        }))
      )
      if (bitacorasSel.length === 1) {
        const b = bitacorasDisp.find(x => x.id === bitacorasSel[0])
        if (b && !b.costo_total) {
          await dbCtrl.from('bitacora_equipos').update({ costo_total: montoTotal }).eq('id', bitacorasSel[0])
        }
      }
    }

    if (conOC && ocsSelected.length > 0) {
      await dbComp.from('ordenes_pago_oc').insert(
        ocsSelected.map(o => ({ id_op_fk: op.id, id_oc_fk: o.id, monto: Number(o.monto) }))
      )
      for (const o of ocsSelected) {
        await dbComp.from('ordenes_compra').update({ status: 'Enviada al Prov' }).eq('id', o.id)
      }
    }
    // Guardar líneas de distribución
    if (detLines.length > 0) {
      await dbComp.from('ordenes_pago_det').insert(
        detLines.map(l => ({
          id_op_fk:     op.id,
          descripcion:  l.descripcion  || null,
          id_area_fk:   l.id_area_fk   ? Number(l.id_area_fk)   : null,
          id_frente_fk: l.id_frente_fk ? Number(l.id_frente_fk) : null,
          monto:        Number(l.monto) || 0,
        }))
      )
    }

    if (Number(form.id_proveedor_fk) === 75 && form.id_servicio_fk) {
      setSavedOpForConsumo({ opId: op.id, servicioId: Number(form.id_servicio_fk), monto: montoTotal })
      setSaving(false)
      return
    }

    setSaving(false); onSaved()
  }

  // Paso consumo — aparece tras guardar OP con proveedor id=75
  if (savedOpForConsumo) {
    return (
      <ConsumoAfterOPModal
        servicioId={savedOpForConsumo.servicioId}
        opId={savedOpForConsumo.opId}
        montoSugerido={savedOpForConsumo.monto}
        onClose={onClose}
        onDone={onSaved}
      />
    )
  }

  // Paso 1: elegir si tiene OC o no — solo en nuevo
  if (conOC === null && !isEdit) {
    return (
      <ModalShell modulo="compras" titulo="Nueva Orden de Pago" onClose={onClose} maxWidth={440}>
        <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>¿Esta orden de pago está relacionada con una compra?</p>
          <button onClick={() => setConOC(true)}
            style={{ padding: '16px', border: '1px solid #bfdbfe', borderRadius: 10, background: '#eff6ff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#bfdbfe')}>
            <div style={{ fontWeight: 600, color: 'var(--blue)', marginBottom: 4 }}>✓ Con Orden de Compra</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Vincula una o varias OC autorizadas. El monto se calcula automáticamente.</div>
          </button>
          <button onClick={() => setConOC(false)}
            style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#94a3b8')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}>
            <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>◇ Sin Orden de Compra</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Servicios, honorarios, arrendamiento u otros gastos que no afectan inventario.</div>
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell modulo="compras" titulo={isEdit ? 'Editar Orden de Pago' : 'Nueva Orden de Pago'}
      subtitulo={!isEdit ? (conOC ? '📦 Con OC vinculada' : '◇ Sin OC — Servicio / Gasto directo') : undefined}
      onClose={onClose} maxWidth={640}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !!uploading}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          {isEdit ? 'Guardar Cambios' : 'Generar Orden de Pago'}
        </button>
      </>}
    >
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(90vh - 130px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <div style={{ padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 13 }}>{error}</div>}

          {/* OCs vinculadas */}
          {conOC && (
            <Sec label="Órdenes de Compra Vinculadas">
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <select className="select" style={{ flex: 1 }}
                  onChange={e => { if (e.target.value) { addOC(e.target.value); e.target.value = '' } }}>
                  <option value="">— Agregar OC —</option>
                  {ocsDelProv.map(o => (
                    <option key={o.id} value={o.id}>{o.folio} · {fmt(o.total)}</option>
                  ))}
                </select>
              </div>
              {ocsSelected.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px', background: '#f8fafc', borderRadius: 7 }}>
                  Sin OCs seleccionadas. Elige una o más OC autorizadas.
                </div>
              )}
              {ocsSelected.map(o => (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 28px', gap: 8, alignItems: 'center', padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>{o.folio}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>OC Total: {fmt(o.total)}</div>
                  </div>
                  <div>
                    <label className="label">Monto a pagar</label>
                    <input className="input" type="number" step="0.01" value={o.monto}
                      onChange={e => setOCMonto(o.id, e.target.value)} style={{ textAlign: 'right' }} />
                  </div>
                  <button className="btn-ghost" style={{ padding: '4px', marginTop: 18 }} onClick={() => removeOC(o.id)}><Trash2 size={12} /></button>
                </div>
              ))}
              {ocCCPreview && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, marginTop: 4 }}>
                  <div><div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: '#94a3b8', marginBottom: 2 }}>Centro de Costo</div><div style={{ fontSize: 12 }}>{ocCCPreview.cc}</div></div>
                  <div><div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: '#94a3b8', marginBottom: 2 }}>Sección</div><div style={{ fontSize: 12 }}>{ocCCPreview.sec}</div></div>
                  <div><div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: '#94a3b8', marginBottom: 2 }}>Frente</div><div style={{ fontSize: 12 }}>{ocCCPreview.frente}</div></div>
                </div>
              )}
            </Sec>
          )}

          {/* Datos generales */}
          <Sec label="Datos Generales">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Proveedor {!conOC ? '(opcional)' : '*'}</label>
                <select className="select" value={form.id_proveedor_fk} onChange={e => aplicarProveedor(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              {/* Con OC → Almacén (viene de la OC) */}
              {conOC && (
                <div>
                  <label className="label">Almacén</label>
                  <select className="select" value={form.id_almacen_fk} onChange={setF('id_almacen_fk')}>
                    <option value="">— Sin asignar —</option>
                    {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Servicio asociado — solo cuando proveedor = CFE/Agua (id 75) */}
            {Number(form.id_proveedor_fk) === 75 && (
              <div style={{ padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', display: 'flex', alignItems: 'center', gap: 5 }}>
                  ⚡ Servicio de suministro asociado
                </div>
                <select className="select" value={form.id_servicio_fk} onChange={setF('id_servicio_fk')}>
                  <option value="">— Seleccionar servicio —</option>
                  {serviciosCatalogo.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.tipo_servicio} · {s.no_servicio}{s.ubicacion ? ` · ${s.ubicacion}` : ''}
                    </option>
                  ))}
                </select>
                {form.id_servicio_fk && (
                  <div style={{ fontSize: 11, color: '#92400e' }}>
                    Al guardar la OP se abrirá un modal para registrar el consumo del servicio.
                  </div>
                )}
              </div>
            )}

            {/* Sin OC → Centro de Costo (siempre) + Área/Frente solo cuando sin detalle */}
            {!conOC && (
              <div style={{ display: 'grid', gridTemplateColumns: detLines.length > 0 ? '1fr' : '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Centro de Costo *</label>
                  <select className="select" value={form.id_centro_costo_fk}
                    onChange={e => { setForm(f => ({ ...f, id_centro_costo_fk: e.target.value, id_area_fk: '', id_frente_fk: '' })); setDetLines([]); }}>
                    <option value="">— Seleccionar —</option>
                    {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                {detLines.length === 0 && (<>
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
                    <select className="select" value={form.id_frente_fk} onChange={setF('id_frente_fk')} disabled={!areaId}>
                      <option value="">— {areaId ? 'Seleccionar' : 'Elige área primero'} —</option>
                      {frentes.filter(f => !areaId || relAF.some(r => r.id_area === Number(areaId) && r.id_frente === f.id))
                        .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                    </select>
                  </div>
                </>)}
              </div>
            )}

            {!conOC && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Tipo de Gasto *</label>
                  {(() => {
                    const permitidos = rolRestriccionesModal?.filter(r => r.modo === 'ALLOW').map(r => r.tipo_gasto) ?? null
                    const excluidos  = rolRestriccionesModal?.filter(r => r.modo === 'DENY').map(r => r.tipo_gasto) ?? null
                    if (permitidos && permitidos.length === 1) {
                      return <input className="input" value={permitidos[0]} readOnly
                        style={{ background: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }} />
                    }
                    return (
                      <select className="select" value={form.tipo_gasto} onChange={setF('tipo_gasto')}>
                        <option value="">— Seleccionar —</option>
                        {tiposGasto
                          .filter(t => !excluidos || !excluidos.includes(t))
                          .map(t => <option key={t}>{t}</option>)}
                      </select>
                    )
                  })()}
                </div>
                {detLines.length === 0 && isVale && (
                  <div>
                    <label className="label">Monto *</label>
                    <input className="input" type="number" step="0.01" value={form.monto_manual}
                      onChange={setF('monto_manual')} style={{ textAlign: 'right' }} />
                  </div>
                )}
              </div>
            )}

            {!conOC && detLines.length === 0 && !isVale && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">Subtotal *</label>
                  <input className="input" type="number" step="0.01" value={form.subtotal}
                    onChange={setF('subtotal')} style={{ textAlign: 'right' }} />
                </div>
                <div>
                  <label className="label">IVA</label>
                  <input className="input" type="number" step="0.01" value={form.iva}
                    onChange={setF('iva')} style={{ textAlign: 'right' }} />
                </div>
              </div>
            )}

            {!conOC && form.tipo_gasto === 'Combustible' && (
              <div>
                <label className="label">Vales solicitados a pagar *</label>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  {valesCombDisp.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                      Sin vales en status Solicitado disponibles
                    </div>
                  ) : (
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {valesCombDisp.map(v => (
                        <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                          borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: 12 }}>
                          <input type="checkbox" checked={valesCombSel.includes(v.id)} onChange={() => toggleValeComb(v.id)} />
                          <span style={{ fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600, flexShrink: 0 }}>{v.folio}</span>
                          <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
                            {v.tipo_suministro} · {centrosCosto.find(c => c.id === v.id_centro_costo_fk)?.nombre ?? ''}{v.periodo ? ` · ${v.periodo}` : ''} · {Number(v.litros_autorizados ?? 0).toLocaleString('es-MX')} L
                          </span>
                          <span style={{ fontWeight: 600, color: '#059669', flexShrink: 0 }}>
                            {v.monto_autorizado != null ? `$${Number(v.monto_autorizado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                  Al pagarse esta OP, los vales seleccionados pasan automáticamente a status Emitido.
                </div>
              </div>
            )}

            {!conOC && form.tipo_gasto === 'Perimetrales' && (
              <div>
                <label className="label">Perimetrales de Vigilancia autorizados a pagar *</label>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  {vigLotesDisp.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                      Sin perimetrales en status Autorizado disponibles — captúralos y autorízalos en Residencial › Vigilancia
                    </div>
                  ) : (
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {vigLotesDisp.map(l => (
                        <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                          borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: 12 }}>
                          <input type="checkbox" checked={vigLotesSel.includes(l.id)} onChange={() => toggleVigLote(l.id)} />
                          <span style={{ fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600, flexShrink: 0 }}>{l.folio}</span>
                          <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
                            {fmtFecha(l.fecha_desde)} – {fmtFecha(l.fecha_hasta)}
                          </span>
                          <span style={{ fontWeight: 600, color: '#059669', flexShrink: 0 }}>
                            {l.total != null ? `$${Number(l.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                  Cada perimetral es la nómina semanal de extras capturada y autorizada en el módulo de Vigilancia.
                </div>
              </div>
            )}

            {!conOC && form.tipo_gasto === 'Mantenimiento de Vehículos' && (
              <div>
                <label className="label">Bitácoras de Servicio cerradas a pagar *</label>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  {bitacorasDisp.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                      Sin bitácoras cerradas disponibles — ciérralas en Mantenimiento › Vehículos y Maquinaria › Bitácora de Servicios
                    </div>
                  ) : (
                    <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                      {bitacorasDisp.map(b => (
                        <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                          borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: 12 }}>
                          <input type="checkbox" checked={bitacorasSel.includes(b.id)} onChange={() => toggleBitacora(b.id)} />
                          <span style={{ fontFamily: 'monospace', color: 'var(--blue)', fontWeight: 600, flexShrink: 0 }}>{b.folio}</span>
                          <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
                            {b.tipo} · {equiposMapModal[b.id_equipo_fk] ?? `#${b.id_equipo_fk}`}{b.fecha_fin ? ` · ${fmtFecha(b.fecha_fin)}` : ''}
                          </span>
                          <span style={{ fontWeight: 600, color: '#059669', flexShrink: 0 }}>
                            {b.costo_total != null ? `$${Number(b.costo_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                  Cada bitácora es un servicio cerrado en Vehículos y Maquinaria › Bitácora de Servicios.
                </div>
              </div>
            )}

            <div>
              <label className="label">Concepto *</label>
              <input className="input" value={form.concepto} onChange={setF('concepto')}
                placeholder={conOC ? `ej. Pago OC ${ocsSelected.map(o=>o.folio).join(', ')}` : 'ej. Servicio de mantenimiento mensual'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Folio Factura</label>
                <input className="input" value={form.folio_factura} onChange={setF('folio_factura')} placeholder="ej. A-1024" />
              </div>
              <div>
                <label className="label">Fecha Factura</label>
                <input className="input" type="date" value={form.fecha_factura} onChange={setF('fecha_factura')} />
              </div>
            </div>

            {/* ── Distribución por Área ── */}
            {headerCCId && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Distribución por Área {detLines.length > 0 && <span style={{ color: 'var(--blue)', marginLeft: 4 }}>{detLines.length} línea{detLines.length > 1 ? 's' : ''}</span>}
                  </span>
                  <button type="button" className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={addDetLine}>
                    + Agregar línea
                  </button>
                </div>
                {detLines.length > 0 && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Descripción</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Área</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Frente</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Monto</th>
                          <th style={{ width: 28 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {detLines.map((line, idx) => (
                          <tr key={line.tempId} style={{ borderTop: idx > 0 ? '1px solid #f1f5f9' : undefined }}>
                            <td style={{ padding: '4px 6px' }}>
                              <input className="input" style={{ padding: '4px 6px', fontSize: 12 }}
                                placeholder="Descripción" value={line.descripcion}
                                onChange={e => updateDetLine(line.tempId, 'descripcion', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <select className="select" style={{ padding: '4px 6px', fontSize: 12 }}
                                value={line.id_area_fk}
                                onChange={e => updateDetLine(line.tempId, 'id_area_fk', e.target.value)}>
                                <option value="">— Área —</option>
                                {ccAreas.filter(a => a.id_centro_costo_fk === headerCCId)
                                  .map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <select className="select" style={{ padding: '4px 6px', fontSize: 12 }}
                                value={line.id_frente_fk} disabled={!line.id_area_fk}
                                onChange={e => updateDetLine(line.tempId, 'id_frente_fk', e.target.value)}>
                                <option value="">— Frente —</option>
                                {frentes.filter(f => !line.id_area_fk || relAF.some(r => r.id_area === Number(line.id_area_fk) && r.id_frente === f.id))
                                  .map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <input className="input" type="number" step="0.01" style={{ padding: '4px 6px', fontSize: 12, textAlign: 'right' }}
                                placeholder="0.00" value={line.monto}
                                onChange={e => updateDetLine(line.tempId, 'monto', e.target.value)} />
                            </td>
                            <td style={{ padding: '4px 6px' }}>
                              <button type="button" className="btn-ghost" style={{ padding: '3px', color: '#dc2626' }}
                                onClick={() => removeDetLine(line.tempId)}><Trash2 size={11} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                          <td colSpan={3} style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-muted)' }}>Total distribución</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--blue)' }}>{fmt(detTotal)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {detLines.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 10px', background: '#f8fafc', borderRadius: 6, border: '1px dashed #e2e8f0' }}>
                    Sin distribución por área. El pago se imputará al CC completo.
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label className="label">Forma de Pago</label>
                <select className="select" value={form.forma_pago} onChange={setF('forma_pago')}>
                  <option value="">— Seleccionar —</option>
                  {formasPago.length > 0
                    ? formasPago.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)
                    : FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)
                  }
                </select>
              </div>
              <div>
                <label className="label">Fecha Vencimiento</label>
                <input className="input" type="date" value={form.fecha_vencimiento} onChange={setF('fecha_vencimiento')} />
              </div>
            </div>

            <div>
              <label className="label">Urgencia</label>
              <select className="select" value={form.urgencia} onChange={setF('urgencia')}
                style={{ color: URGENCIA_COLOR[form.urgencia] ?? undefined, fontWeight: 600 }}>
                {URGENCIAS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </Sec>

          {/* Datos bancarios */}
          <Sec label="Datos Bancarios del Beneficiario">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <div><label className="label">Banco</label>
                <input className="input" value={form.banco_destino} onChange={setF('banco_destino')} placeholder="ej. BBVA" />
              </div>
              <div><label className="label">CLABE / Cuenta</label>
                <input className="input" value={form.cuenta_clabe} onChange={setF('cuenta_clabe')}
                  style={{ fontFamily: 'monospace' }} placeholder="18 dígitos" />
              </div>
            </div>
          </Sec>

          <div><label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notas} onChange={setF('notas')} style={{ resize: 'vertical' }} />
          </div>

          {/* ── Documentos de la Operación ── */}
          <Sec label="Documentos de la Operación">
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              Adjunta la factura del proveedor. Pueden subirse ahora o editando la OP después.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FileDoc campo="pdf_factura" label="PDF Factura" accept=".pdf" refEl={pdfRef} />
              <FileDoc campo="xml_factura" label="XML Factura (CFDI)" accept=".xml" refEl={xmlRef} />
            </div>
            <FileDoc campo="soporte_url" label="Soporte (cotización, contrato, correo, etc.)" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" refEl={soporteRef} />
          </Sec>

          {/* Resumen monto */}
          <div style={{ padding: '12px 16px', background: 'var(--blue-pale)', border: '1px solid #bfdbfe', borderRadius: 8 }}>
            {!conOC && detLines.length === 0 && !isVale && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>Subtotal {fmt(subtotalNum)}</span>
                <span>IVA {fmt(ivaNum)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {conOC ? `Total de ${ocsSelected.length} OC(s)` : 'Monto'}
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(montoTotal)}</span>
            </div>
          </div>
        </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════
// Modal de consumo — se abre tras guardar OP con proveedor id=75
// ════════════════════════════════════════════════════════════
function ConsumoAfterOPModal({ servicioId, opId, montoSugerido, onClose, onDone }: {
  servicioId: number
  opId:       number
  montoSugerido: number
  onClose:    () => void
  onDone:     () => void
}) {
  const hoy     = new Date()
  const iniDef  = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  const finDate = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  const finDef  = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, '0')}-${String(finDate.getDate()).padStart(2, '0')}`

  const [servicio, setServicio] = useState<any>(null)
  const [form, setForm] = useState({ fechaInicio: iniDef, fechaFin: finDef, consumo: '', monto: montoSugerido.toString() })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    dbCtrl.from('servicios_catalogo').select('*').eq('id', servicioId).single()
      .then(({ data }) => setServicio(data))
  }, [servicioId])

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.monto || Number(form.monto) <= 0) return
    setSaving(true)
    setSaveError('')
    // id_op_fk es trazabilidad opcional — omitirlo si la columna aún no existe
    const payload: any = {
      id_servicio_fk:  servicioId,
      fecha_inicio:    form.fechaInicio,
      fecha_fin:       form.fechaFin || null,
      consumo_periodo: form.consumo ? Number(form.consumo) : null,
      monto_periodo:   Number(form.monto),
    }
    // Intentar con id_op_fk; si falla por columna faltante, reintentar sin él
    let { error: err } = await dbCtrl.from('servicios_registros').insert({ ...payload, id_op_fk: opId })
    if (err && err.message?.includes('id_op_fk')) {
      const res = await dbCtrl.from('servicios_registros').insert(payload)
      err = res.error
    }
    if (err) { setSaveError(err.message); setSaving(false); return }
    setSaving(false)
    onDone()
  }

  const unidad    = servicio?.tipo_servicio === 'Agua' ? 'm³' : 'kWh'
  const servLabel = servicio
    ? `${servicio.tipo_servicio} · ${servicio.no_servicio}${servicio.ubicacion ? ` · ${servicio.ubicacion}` : ''}`
    : '…'

  return (
    <ModalShell modulo="compras"
      titulo="Registrar Consumo de Servicio"
      subtitulo={servLabel}
      onClose={onClose}
      maxWidth={480}
      footer={<>
        <button className="btn-secondary" onClick={onDone}>Omitir</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving || !form.monto || Number(form.monto) <= 0}>
          {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
          Guardar Consumo
        </button>
      </>}
    >
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {saveError && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{saveError}</div>
        )}
        <div style={{ padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
          La OP fue generada. Registra el consumo para mantener el historial del servicio actualizado, o usa <strong>Omitir</strong> si lo harás después.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="label">Inicio del periodo</label>
            <input className="input" type="date" value={form.fechaInicio} onChange={setF('fechaInicio')} />
          </div>
          <div>
            <label className="label">Fin del periodo</label>
            <input className="input" type="date" value={form.fechaFin} onChange={setF('fechaFin')} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="label">Consumo ({unidad})</label>
            <input className="input" type="number" step="0.01" placeholder="0"
              value={form.consumo} onChange={setF('consumo')} />
          </div>
          <div>
            <label className="label">Monto *</label>
            <input className="input" type="number" step="0.01" style={{ textAlign: 'right' }}
              value={form.monto} onChange={setF('monto')} />
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

