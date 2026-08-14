'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useCallback, useEffect, useRef } from 'react'
import { dbComp, dbCfg, dbCtrl, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Eye, X, Save, Loader,
  ArrowLeft, Printer, CheckCircle, Trash2, ChevronLeft, ChevronRight,
  Edit2, Upload, ExternalLink, FileText, AlertTriangle, MessageSquare, Send, Tag,
  RotateCcw, Copy
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, nextFolio, StatusBadge, FORMAS_PAGO_COMP } from '../types'
import ModalShell from '@/components/ui/ModalShell'

const PAGE_SIZES = [10, 25, 50, 100]

const TIPOS_GASTO = [
  'Agua', 'Arrendamiento', 'Asesoría', 'Capacitación', 'Comisiones Bancarias', 'Combustible',
  'Depósitos en Garantía (Fianzas)', 'Electricidad', 'Finiquitos y Liquidaciones', 'Fonacot',
  'Gasto Operativo Eventos', 'Honorarios',
  'Impuestos Estatales', 'Impuestos Federales', 'IMSS', 'Intercompañías BPCC', 'Intercompañías OOB', 'Intercompañías RBA', 'Licencias de Software', 'Mantenimiento',
  'Nómina Semanal', 'Nómina Quincenal', 'Otro', 'Perimetrales', 'PTU', 'Publicidad',
  'Recolección de Basura', 'Renta de Mobiliario', 'Reparación', 'Seguros', 'Servicios de Vigilancia',
  'Servicios Profesionales', 'Telefonía / Internet', 'Vales Despensa',
]

type RolTipoOp = { tipo_gasto: string; modo: string; solo_propios: boolean }

const URGENCIAS = ['Crítica', 'Alta', 'Media', 'Baja'] as const
const URGENCIA_COLOR: Record<string, string> = {
  'Crítica': '#dc2626',
  'Alta':    '#d97706',
  'Media':   '#2563eb',
  'Baja':    '#64748b',
}

// Mismos colores que app/equipo-flota/CombustibleTab.tsx (VALE_STATUS_STYLE)
const VALE_STATUS_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  'Solicitado': { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  'Emitido':    { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  'Parcial':    { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  'Completado': { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  'Cancelado':  { color: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
}

export default function OrdenesPagoPage() {
  const { canWrite } = useAuth()
  const router = useRouter()
  const { authUser } = useAuth()
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
    let q = dbComp.from('ordenes_pago').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterCC) q = q.eq('id_centro_costo_fk', Number(filterCC))
    if (filterArea) q = q.eq('id_area_fk', Number(filterArea))
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
      q = q.not('tipo_gasto', 'in', `(${tiposExcluidos.join(',')})`)
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
            {TIPOS_GASTO
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
        <table>
          <thead>
            <tr>
              <th style={{ width: 110 }}>Folio</th>
              <th>Proveedor</th>
              <th>Concepto / Tipo</th>
              <th style={{ width: 100 }}>Vencimiento</th>
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
                <td style={{ fontSize: 12, whiteSpace: 'nowrap',
                  color: r.fecha_vencimiento && new Date(r.fecha_vencimiento) < new Date() && r.status === 'Pendiente' ? '#dc2626' : 'var(--text-secondary)',
                  fontWeight: r.fecha_vencimiento && new Date(r.fecha_vencimiento) < new Date() && r.status === 'Pendiente' ? 600 : 400 }}>
                  {fmtFecha(r.fecha_vencimiento)}
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
    pdf_factura:       opEdit?.pdf_factura       ?? '',
    xml_factura:       opEdit?.xml_factura       ?? '',
    soporte_url:       opEdit?.soporte_url       ?? '',
    id_servicio_fk:    opEdit?.id_servicio_fk?.toString() ?? '',
  })

  useEffect(() => {
    Promise.all([
      dbComp.from('proveedores').select('id, nombre, banco, cuenta_clabe, condiciones_pago').eq('activo', true).order('nombre'),
      dbComp.from('almacenes').select('id, nombre, tipo').eq('activo', true).order('nombre'),
      dbComp.from('ordenes_compra').select('id, folio, total, id_proveedor_fk').eq('status', 'Autorizada').order('folio'),
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
    }
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
  // (ctrl -> cfg) por FK; el nombre del área se resuelve con ccAreas (ya cargado).
  useEffect(() => {
    if (form.tipo_gasto !== 'Combustible') return
    let q = dbCtrl.from('vales_combustible')
      .select('id, folio, tipo_suministro, periodo, litros_autorizados, monto_autorizado, id_area_fk, id_op_fk')
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
  const montoTotal = detLines.length > 0
    ? detTotal
    : conOC
      ? ocsSelected.reduce((a, o) => a + (Number(o.monto) || 0), 0)
      : Number(form.monto_manual) || 0

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
                        {TIPOS_GASTO
                          .filter(t => !excluidos || !excluidos.includes(t))
                          .map(t => <option key={t}>{t}</option>)}
                      </select>
                    )
                  })()}
                </div>
                {detLines.length === 0 && (
                  <div>
                    <label className="label">Monto *</label>
                    <input className="input" type="number" step="0.01" value={form.monto_manual}
                      onChange={setF('monto_manual')} style={{ textAlign: 'right' }} />
                  </div>
                )}
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
                            {v.tipo_suministro} · {ccAreas.find(a => a.id === v.id_area_fk)?.nombre ?? ''}{v.periodo ? ` · ${v.periodo}` : ''} · {Number(v.litros_autorizados ?? 0).toLocaleString('es-MX')} L
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

            <div>
              <label className="label">Concepto *</label>
              <input className="input" value={form.concepto} onChange={setF('concepto')}
                placeholder={conOC ? `ej. Pago OC ${ocsSelected.map(o=>o.folio).join(', ')}` : 'ej. Servicio de mantenimiento mensual'} />
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
          <div style={{ padding: '12px 16px', background: 'var(--blue-pale)', border: '1px solid #bfdbfe', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {conOC ? `Total de ${ocsSelected.length} OC(s)` : 'Monto'}
            </span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(montoTotal)}</span>
          </div>
        </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════
// Detalle OP
// ════════════════════════════════════════════════════════════
function OPDetail({ op, onClose, onCanceled, onEdit, onAuthorized }: {
  op: any; onClose: () => void; onCanceled: () => void; onEdit: () => void; onAuthorized: () => void
}) {
  const { authUser, canWrite, canAuth, canAuthFinanzas } = useAuth()
  const puedePublicarInstruccion = Boolean(
    authUser && (canWrite('ordenes-pago') || authUser.rol === 'tesoreria')
  )
  const puedeSubirFacturaPagada = op.status === 'Pagada' && canWrite('ordenes-pago')
  const [localOp, setLocalOp]   = useState(op)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const pdfDetailRef     = useRef<HTMLInputElement>(null)
  const xmlDetailRef     = useRef<HTMLInputElement>(null)
  const soporteDetailRef = useRef<HTMLInputElement>(null)

  const [ocsRel, setOcsRel]       = useState<any[]>([])
  const [detLinesView, setDetLinesView] = useState<any[]>([])
  const [ccMap,  setCcMap]        = useState<Record<number, string>>({})
  const [areaMap, setAreaMap]     = useState<Record<number, string>>({})
  const [areaCcMap, setAreaCcMap] = useState<Record<number, number>>({})
  const [frMap,  setFrMap]        = useState<Record<number, string>>({})
  const [equiposMap, setEquiposMap] = useState<Record<number, string>>({})
  const [valesComb, setValesComb] = useState<any[]>([])
  const [eventosRel, setEventosRel] = useState<any[]>([])
  const [bitacorasRel, setBitacorasRel] = useState<any[]>([])
  const [vigilanciaRel, setVigilanciaRel] = useState<any[]>([])
  const [reembolsoRel, setReembolsoRel] = useState<any | null>(null)
  const [servicioCat, setServicioCat] = useState<any | null>(null)
  const [servicioRegistros, setServicioRegistros] = useState<any[]>([])
  const [abonos, setAbonos]       = useState<any[]>([])
  const [loadingAbonos, setLoadingAbonos] = useState(true)
  const [authComment, setAuthCom] = useState('')
  const [authLoading, setAuthLd]  = useState(false)
  const [instrMsgs, setInstrMsgs] = useState<any[]>([])
  const [loadingInstr, setLoadingInstr] = useState(true)
  const [instrText, setInstrText] = useState('')
  const [sendingInstr, setSendingInstr] = useState(false)
  const [instrErr, setInstrErr] = useState('')

  // Reclasificar (superadmin) — corrige CC/Área/Frente/Tipo de Gasto de un
  // documento ya capturado, sin importar status, sin tocar monto/pagos.
  const [reclasOpen, setReclasOpen]   = useState(false)
  const [ccList, setCcList]           = useState<{ id: number; nombre: string }[]>([])
  const [areaList, setAreaList]       = useState<{ id: number; nombre: string; id_centro_costo_fk: number }[]>([])
  const [frenteList, setFrenteList]   = useState<{ id: number; nombre: string }[]>([])
  const [relAF, setRelAF]             = useState<{ id_area: number; id_frente: number }[]>([])
  const [reclasCC, setReclasCC]       = useState('')
  const [reclasArea, setReclasArea]   = useState('')
  const [reclasFrente, setReclasFrente] = useState('')
  const [reclasTipoGasto, setReclasTipoGasto] = useState('')
  const [reclasSaving, setReclasSaving] = useState(false)
  const [reclasError, setReclasError] = useState('')

  // Reabrir / Duplicar (superadmin) — solo para OP Rechazada.
  const [reabrirLoading, setReabrirLoading] = useState(false)
  const [duplicarLoading, setDuplicarLoading] = useState(false)
  const [reabrirDuplicarError, setReabrirDuplicarError] = useState('')
  const [folioSustituta, setFolioSustituta] = useState<string | null>(null)
  const [folioOriginal, setFolioOriginal]   = useState<string | null>(null)

  useEffect(() => {
    if (op.id_op_sustituta_fk) {
      dbComp.from('ordenes_pago').select('folio').eq('id', op.id_op_sustituta_fk).maybeSingle()
        .then(({ data }) => setFolioSustituta(data?.folio ?? null))
    } else setFolioSustituta(null)
    if (op.id_op_original_fk) {
      dbComp.from('ordenes_pago').select('folio').eq('id', op.id_op_original_fk).maybeSingle()
        .then(({ data }) => setFolioOriginal(data?.folio ?? null))
    } else setFolioOriginal(null)
  }, [op.id, op.id_op_sustituta_fk, op.id_op_original_fk])

  const puedeAutorizar         = canAuth()
  const puedeAutorizarFinanzas = canAuthFinanzas()

  useEffect(() => { setLocalOp(op) }, [op])

  const uploadFacturaPagada = async (file: File, campo: 'pdf_factura' | 'xml_factura' | 'soporte_url') => {
    setUploadingDoc(campo)
    const ext = file.name.split('.').pop()
    const path = `op-${op.id}/${campo}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('cxp-docs').upload(path, file, { upsert: true })
    if (upErr) {
      alert('Error al subir archivo: ' + upErr.message)
      setUploadingDoc(null)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('cxp-docs').getPublicUrl(path)
    const { error: dbErr } = await dbComp.from('ordenes_pago').update({ [campo]: publicUrl }).eq('id', op.id)
    if (dbErr) {
      alert(dbErr.message)
      setUploadingDoc(null)
      return
    }
    setLocalOp((p: any) => ({ ...p, [campo]: publicUrl }))
    setUploadingDoc(null)
  }

  const clearFacturaPagada = async (campo: 'pdf_factura' | 'xml_factura' | 'soporte_url') => {
    if (!confirm('¿Quitar este archivo de la orden de pago?')) return
    const { error: dbErr } = await dbComp.from('ordenes_pago').update({ [campo]: null }).eq('id', op.id)
    if (dbErr) { alert(dbErr.message); return }
    setLocalOp((p: any) => ({ ...p, [campo]: null }))
  }

  const enviarInstruccion = async () => {
    const t = instrText.trim()
    if (!t || !authUser || !puedePublicarInstruccion) return
    setSendingInstr(true)
    setInstrErr('')
    const { data, error } = await dbComp.from('ordenes_pago_instrucciones').insert({
      id_op_fk: op.id,
      autor_nombre: authUser.nombre,
      autor_rol: authUser.rol,
      cuerpo: t,
    }).select('id, autor_nombre, autor_rol, cuerpo, created_at').single()
    if (error) {
      setInstrErr(error.message)
      setSendingInstr(false)
      return
    }
    if (data) setInstrMsgs(m => [...m, data])
    setInstrText('')
    setSendingInstr(false)
  }

  useEffect(() => {
    setLoadingInstr(true)
    setInstrErr('')
    dbComp.from('ordenes_pago_instrucciones')
      .select('id, autor_nombre, autor_rol, cuerpo, created_at')
      .eq('id_op_fk', op.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) setInstrErr(error.message)
        setInstrMsgs(data ?? [])
        setLoadingInstr(false)
      })
  }, [op.id])

  useEffect(() => {
    dbComp.from('ordenes_pago_oc').select('*, ordenes_compra(folio, total)')
      .eq('id_op_fk', op.id)
      .then(({ data }) => setOcsRel(data ?? []))
    dbComp.from('ordenes_pago_det').select('*').eq('id_op_fk', op.id).order('id')
      .then(({ data }) => setDetLinesView(data ?? []))
    // Cargar catálogos para CC/Área/Frente/Equipos
    import('@/lib/supabase').then(({ dbCfg }) => {
      Promise.all([
        dbCfg.from('centros_costo').select('id, nombre'),
        dbCfg.from('areas').select('id, nombre, id_centro_costo_fk'),
        dbCfg.from('frentes').select('id, nombre'),
        dbCfg.from('equipos').select('id, nombre, placa'),
        dbCfg.from('rel_area_frente').select('id_area, id_frente'),
      ]).then(([{ data: cc }, { data: ar }, { data: fr }, { data: eq }, { data: raf }]) => {
        const cm: Record<number, string> = {}; (cc ?? []).forEach((r: any) => { cm[r.id] = r.nombre })
        const am: Record<number, string> = {}; (ar ?? []).forEach((r: any) => { am[r.id] = r.nombre })
        const acm: Record<number, number> = {}; (ar ?? []).forEach((r: any) => { if (r.id_centro_costo_fk) acm[r.id] = r.id_centro_costo_fk })
        const fm: Record<number, string> = {}; (fr ?? []).forEach((r: any) => { fm[r.id] = r.nombre })
        const em: Record<number, string> = {}; (eq ?? []).forEach((r: any) => { em[r.id] = r.placa ? `${r.nombre} (${r.placa})` : r.nombre })
        setCcMap(cm); setAreaMap(am); setAreaCcMap(acm); setFrMap(fm); setEquiposMap(em)
        setCcList((cc ?? []) as any); setAreaList((ar ?? []) as any); setFrenteList((fr ?? []) as any); setRelAF((raf ?? []) as any)
      })
    })

    setLoadingAbonos(true)
    dbComp.from('cxp_abonos').select('*').eq('id_op_fk', op.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setAbonos(data ?? []); setLoadingAbonos(false) })

    // Vales de combustible pagados con esta OP
    dbCtrl.from('vales_combustible').select('*').eq('id_op_fk', op.id).order('id')
      .then(({ data }) => setValesComb(data ?? []))

    // Eventos (Hospitality / Torneos Golf / Eventos Ecuestres) vinculados a esta OP
    dbCtrl.from('eventos_ops').select('id_evento_fk').eq('id_op_fk', op.id)
      .then(async ({ data }) => {
        const ids = Array.from(new Set((data ?? []).map((r: any) => r.id_evento_fk)))
        if (!ids.length) { setEventosRel([]); return }
        const { data: evs } = await dbCtrl.from('eventos').select('id, folio, nombre, modulo').in('id', ids)
        setEventosRel(evs ?? [])
      })

    // Bitácora de Equipo & Flota (mantenimiento vehicular) vinculada a esta OP
    dbCtrl.from('bitacora_equipo_ops').select('id_bitacora_fk, monto').eq('id_op_fk', op.id)
      .then(async ({ data }) => {
        const rows = data ?? []
        if (!rows.length) { setBitacorasRel([]); return }
        const ids = Array.from(new Set(rows.map((r: any) => r.id_bitacora_fk)))
        const { data: bits } = await dbCtrl.from('bitacora_equipos').select('id, folio, tipo, descripcion, id_equipo_fk').in('id', ids)
        const bm: Record<number, any> = {}; (bits ?? []).forEach((b: any) => { bm[b.id] = b })
        setBitacorasRel(rows.map((r: any) => ({ ...r, bitacora: bm[r.id_bitacora_fk] })))
      })

    // Lote de Vigilancia Extras (Perimetrales) pagado con esta OP
    dbCtrl.from('vigilancia_extras_lotes').select('*').eq('id_op_fk', op.id)
      .then(({ data }) => setVigilanciaRel(data ?? []))

    // Reembolso de Caja Chica que originó esta OP
    dbComp.from('reembolsos').select('id, folio, total, status, usuario_nombre, fecha').eq('id_op_fk', op.id).maybeSingle()
      .then(({ data }) => setReembolsoRel(data ?? null))

    // Servicio de suministro (CFE/Agua) al que está ligada esta OP + consumos registrados desde ella
    if (op.id_servicio_fk) {
      dbCtrl.from('servicios_catalogo').select('id, no_servicio, tipo_servicio, ubicacion').eq('id', op.id_servicio_fk).maybeSingle()
        .then(({ data }) => setServicioCat(data ?? null))
    } else {
      setServicioCat(null)
    }
    dbCtrl.from('servicios_registros').select('*').eq('id_op_fk', op.id)
      .then(({ data }) => setServicioRegistros(data ?? []))
  }, [op.id])

  const cancelar = async () => {
    if (!confirm('¿Cancelar esta orden de pago?')) return
    await dbComp.from('ordenes_pago').update({ status: 'Cancelada' }).eq('id', op.id)
    onCanceled()
  }

  // 1ra autorización: Pendiente Auth → Pendiente Auth Finanzas (o Rechazada)
  const handleAuth = async (aprobado: boolean) => {
    if (!aprobado && !confirm('¿Rechazar esta Orden de Pago? Esta acción no entrará a CXP.')) return
    setAuthLd(true)
    const updatePayload: any = {
      status: aprobado ? 'Pendiente Auth Finanzas' : 'Rechazada',
      notas:  authComment.trim()
        ? `[${aprobado ? 'Autorizado' : 'Rechazado'} por ${authUser?.nombre ?? ''}]: ${authComment.trim()}${op.notas ? '\n' + op.notas : ''}`
        : op.notas ?? null,
    }
    if (aprobado) {
      updatePayload.autorizado_por     = authUser?.nombre ?? null
      updatePayload.fecha_autorizacion = new Date().toISOString()
    }
    await dbComp.from('ordenes_pago').update(updatePayload).eq('id', op.id)
    setAuthLd(false)
    onAuthorized()
  }

  // 2da autorización (Finanzas): Pendiente Auth Finanzas → Pendiente (CXP) (o Rechazada)
  const handleAuthFinanzas = async (aprobado: boolean) => {
    if (!aprobado && !confirm('¿Rechazar esta Orden de Pago? Esta acción no entrará a CXP.')) return
    setAuthLd(true)
    const updatePayload: any = {
      status: aprobado ? 'Pendiente' : 'Rechazada',
      notas:  authComment.trim()
        ? `[${aprobado ? 'Autorizado (Finanzas)' : 'Rechazado (Finanzas)'} por ${authUser?.nombre ?? ''}]: ${authComment.trim()}${op.notas ? '\n' + op.notas : ''}`
        : op.notas ?? null,
    }
    if (aprobado) {
      updatePayload.autorizado_finanzas_por     = authUser?.nombre ?? null
      updatePayload.fecha_autorizacion_finanzas = new Date().toISOString()
    }
    await dbComp.from('ordenes_pago').update(updatePayload).eq('id', op.id)
    setAuthLd(false)
    onAuthorized()
  }

  // Reclasificar (superadmin): abre el panel precargado con los valores
  // actuales, sin importar el status de la OP.
  const abrirReclasificar = () => {
    setReclasCC(op.id_centro_costo_fk?.toString() ?? '')
    setReclasArea(op.id_area_fk?.toString() ?? '')
    setReclasFrente(op.id_frente_fk?.toString() ?? '')
    setReclasTipoGasto(op.tipo_gasto ?? '')
    setReclasError('')
    setReclasOpen(true)
  }

  // Update mínimo y explícito: SOLO estos 4 campos + auditoría. Nunca
  // monto, saldo, status, ni ningún campo de pago.
  const handleReclasificar = async () => {
    setReclasSaving(true); setReclasError('')
    const { error: err } = await dbComp.from('ordenes_pago').update({
      id_centro_costo_fk: reclasCC ? Number(reclasCC) : null,
      id_area_fk:         reclasArea ? Number(reclasArea) : null,
      id_frente_fk:        reclasFrente ? Number(reclasFrente) : null,
      tipo_gasto:          reclasTipoGasto || null,
      reclasificado_por:      authUser?.nombre ?? null,
      fecha_reclasificacion:  new Date().toISOString(),
    }).eq('id', op.id)
    setReclasSaving(false)
    if (err) { setReclasError(err.message); return }
    setReclasOpen(false)
    onAuthorized()
  }

  // Reabrir (superadmin, solo Rechazada): regresa la MISMA OP al punto de
  // autorización donde fue rechazada — a 'Pendiente Auth Finanzas' si ya
  // tenía la 1ra autorización hecha (autorizado_por), o a 'Pendiente Auth'
  // si fue rechazada desde el inicio. No toca monto/saldo ni el historial
  // de quién ya autorizó.
  const handleReabrir = async () => {
    if (!confirm(`¿Reabrir ${op.folio}? Regresará al flujo de autorización para corregirla y volver a someterla.`)) return
    setReabrirLoading(true); setReabrirDuplicarError('')
    const destino = op.autorizado_por ? 'Pendiente Auth Finanzas' : 'Pendiente Auth'
    const { error: err } = await dbComp.from('ordenes_pago').update({
      status: destino,
      reabierta_por:     authUser?.nombre ?? null,
      fecha_reapertura:  new Date().toISOString(),
      notas: `[Reabierta por ${authUser?.nombre ?? ''}]${op.notas ? '\n' + op.notas : ''}`,
    }).eq('id', op.id)
    setReabrirLoading(false)
    if (err) { setReabrirDuplicarError(err.message); return }
    onAuthorized()
  }

  // Duplicar (superadmin, solo Rechazada): crea una OP nueva (folio propio)
  // copiando los datos de clasificación/pago de la rechazada — nunca copia
  // el status ni nada de autorización — y dobla la original a 'Sustituida'.
  const handleDuplicar = async () => {
    if (!confirm(`¿Duplicar ${op.folio}? Se creará una OP nueva y ${op.folio} quedará como Sustituida.`)) return
    setDuplicarLoading(true); setReabrirDuplicarError('')
    let folio: string
    try {
      folio = await nextFolio(dbComp, 'OP')
    } catch (e: any) {
      setReabrirDuplicarError(e.message); setDuplicarLoading(false); return
    }
    const { data: nuevaOp, error: errIns } = await dbComp.from('ordenes_pago').insert({
      folio,
      id_proveedor_fk:     op.id_proveedor_fk,
      id_almacen_fk:       op.id_almacen_fk,
      id_centro_costo_fk:  op.id_centro_costo_fk,
      id_area_fk:          op.id_area_fk,
      id_frente_fk:         op.id_frente_fk,
      id_oc_fk:             op.id_oc_fk,
      forma_pago:           op.forma_pago,
      fecha_vencimiento:    op.fecha_vencimiento,
      concepto:             op.concepto,
      tipo_gasto:           op.tipo_gasto,
      urgencia:             op.urgencia,
      banco_destino:        op.banco_destino,
      cuenta_clabe:         op.cuenta_clabe,
      monto:                op.monto,
      id_servicio_fk:       op.id_servicio_fk,
      pdf_factura:          op.pdf_factura,
      xml_factura:          op.xml_factura,
      soporte_url:          op.soporte_url,
      status:               'Pendiente Auth',
      created_by:           authUser?.nombre ?? null,
      id_op_original_fk:    op.id,
      notas: `Sustituye a ${op.folio} (rechazada).${op.notas ? '\n' + op.notas : ''}`,
    }).select('id').single()
    if (errIns || !nuevaOp) { setReabrirDuplicarError(errIns?.message ?? 'No se pudo crear la OP nueva'); setDuplicarLoading(false); return }

    const { data: ocsRelData } = await dbComp.from('ordenes_pago_oc').select('id_oc_fk, monto').eq('id_op_fk', op.id)
    if (ocsRelData && ocsRelData.length > 0) {
      await dbComp.from('ordenes_pago_oc').insert(
        ocsRelData.map((o: any) => ({ id_op_fk: nuevaOp.id, id_oc_fk: o.id_oc_fk, monto: o.monto }))
      )
    }
    const { data: detData } = await dbComp.from('ordenes_pago_det').select('descripcion, id_area_fk, id_frente_fk, monto').eq('id_op_fk', op.id)
    if (detData && detData.length > 0) {
      await dbComp.from('ordenes_pago_det').insert(
        detData.map((d: any) => ({ ...d, id_op_fk: nuevaOp.id }))
      )
    }

    await dbComp.from('ordenes_pago').update({
      status: 'Sustituida',
      id_op_sustituta_fk: nuevaOp.id,
    }).eq('id', op.id)

    setDuplicarLoading(false)
    onAuthorized()
  }

  const imprimir = async () => {
    // Fresh fetch para asegurar campos actualizados (autorizado_por, referencia_pago, etc.)
    const { data: freshOP } = await dbComp.from('ordenes_pago').select('*').eq('id', op.id).single()
    const opData = freshOP ? { ...op, ...freshOP } : op
    const areaIdCabecera = opData.id_area_fk ?? null
    const areaIdDet = detLinesView.find((l: any) => !!l.id_area_fk)?.id_area_fk ?? null
    const areaForCC = areaIdCabecera ?? areaIdDet
    const centroCostoId = opData.id_centro_costo_fk ?? (areaForCC ? areaCcMap[areaForCC] : null)
    const centroCostoNombre = centroCostoId ? (ccMap[centroCostoId] ?? `#${centroCostoId}`) : 'Sin asignar'
    const areaNombre = opData.id_area_fk ? (areaMap[opData.id_area_fk] ?? `#${opData.id_area_fk}`) : '—'
    const frenteNombre = opData.id_frente_fk ? (frMap[opData.id_frente_fk] ?? `#${opData.id_frente_fk}`) : '—'
    const estadoAut = opData.status === 'Pendiente Auth'
      ? 'Pendiente de autorización'
      : opData.status === 'Pendiente Auth Finanzas'
        ? 'Pendiente de segunda autorización (Finanzas)'
        : opData.status === 'Rechazada'
          ? 'Rechazada'
          : opData.status === 'Sustituida'
            ? 'Sustituida'
            : opData.autorizado_finanzas_por
              ? 'Autorizada'
              : opData.autorizado_por
                ? 'Autorizada (1ra autorización)'
                : 'En proceso'
    const nombreElaboro = opData.created_by ?? opData.usuario_crea ?? 'Sin registro'
    const nombreAutorizo = opData.autorizado_finanzas_por ?? opData.autorizado_por
      ?? (opData.status === 'Pendiente Auth' ? 'Pendiente de autorización'
        : opData.status === 'Pendiente Auth Finanzas' ? 'Pendiente de segunda autorización'
        : opData.status === 'Rechazada' ? 'Rechazada'
        : opData.status === 'Sustituida' ? 'Sustituida' : 'Sin registro')
    // Cargar config de organización
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
        if (r.clave === 'org_nombre')     orgNombre    = r.valor ?? orgNombre
        if (r.clave === 'org_subtitulo')  orgSubtitulo = r.valor ?? ''
        if (r.clave === 'org_logo_url')   orgLogo      = r.valor ?? ''
      })
    } catch {}
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
        <tr><th>Beneficiario</th><td>${opData._provNombre ?? '—'}</td><th>Banco</th><td>${opData.banco_destino ?? '—'}</td></tr>
        <tr><th>CLABE / Cuenta</th><td style="font-family:monospace">${opData.cuenta_clabe ?? '—'}</td><th>Forma de Pago</th><td>${opData.forma_pago}</td></tr>
        <tr><th>Concepto</th><td colspan="3">${opData.concepto ?? '—'}</td></tr>
        <tr><th>Almacén</th><td>${opData._almNombre ?? '—'}</td><th>Vencimiento</th><td>${fmtFecha(opData.fecha_vencimiento)}</td></tr>
        ${opData.tipo_gasto ? `<tr><th>Tipo de Gasto</th><td colspan="3">${opData.tipo_gasto}</td></tr>` : ''}
        ${opData.urgencia ? `<tr><th>Urgencia</th><td colspan="3" style="font-weight:700">${opData.urgencia}</td></tr>` : ''}
        <tr><th>Centro de Costo</th><td colspan="3">${centroCostoNombre}</td></tr>
        ${detLinesView.length === 0 ? `<tr><th>Área</th><td>${areaNombre}</td><th>Frente</th><td>${frenteNombre}</td></tr>` : ''}
        ${ocsRel.length ? `<tr><th>OC(s) Relacionadas</th><td colspan="3">${ocsRel.map(r => r.ordenes_compra?.folio ?? `#${r.id_oc_fk}`).join(', ')}</td></tr>` : ''}
        <tr><th class="total">TOTAL A PAGAR</th><td colspan="3" class="total">${fmt(opData.monto)}</td></tr>
      </table>
      ${detLinesView.length > 0 ? `
      <h3 style="font-size:13px;font-weight:700;color:#0D4F80;margin:18px 0 8px">Distribución por Área</h3>
      <table>
        <thead><tr><th>Descripción</th><th>Área</th><th>Frente</th><th style="text-align:right">Monto</th></tr></thead>
        <tbody>
          ${detLinesView.map((l: any) => `<tr>
            <td>${l.descripcion ?? '—'}</td>
            <td>${l.id_area_fk   ? (areaMap[l.id_area_fk]  ?? `#${l.id_area_fk}`)  : '—'}</td>
            <td>${l.id_frente_fk ? (frMap[l.id_frente_fk]  ?? `#${l.id_frente_fk}`) : '—'}</td>
            <td style="text-align:right;font-weight:600">${fmt(l.monto)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><th colspan="3">Total distribución</th><th style="text-align:right">${fmt(detLinesView.reduce((a: number, l: any) => a + (l.monto ?? 0), 0))}</th></tr></tfoot>
      </table>` : ''}
      ${valesComb.length > 0 ? `
      <h3 style="font-size:13px;font-weight:700;color:#0D4F80;margin:18px 0 8px">Vales de Combustible Asociados</h3>
      <table>
        <thead><tr><th>Folio</th><th>Suministro</th><th>Equipo / Área</th><th style="text-align:right">Litros Aut.</th><th style="text-align:right">Litros Cons.</th><th style="text-align:right">Monto Aut.</th><th>Status</th></tr></thead>
        <tbody>
          ${valesComb.map((v: any) => `<tr>
            <td style="font-family:monospace">${v.folio ?? `#${v.id}`}</td>
            <td>${v.tipo_suministro ?? '—'}</td>
            <td>${v.id_equipo_fk ? (equiposMap[v.id_equipo_fk] ?? `#${v.id_equipo_fk}`) : (v.id_area_fk ? (areaMap[v.id_area_fk] ?? `#${v.id_area_fk}`) : '—')}</td>
            <td style="text-align:right">${v.litros_autorizados ?? '—'}</td>
            <td style="text-align:right">${v.litros_consumidos ?? 0}</td>
            <td style="text-align:right;font-weight:600">${fmt(v.monto_autorizado)}</td>
            <td>${v.status}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : ''}
      ${eventosRel.length > 0 ? `<p style="font-size:12px;margin:10px 0 0"><strong>Evento(s) relacionado(s):</strong> ${eventosRel.map((e: any) => `${e.folio} — ${e.nombre}`).join(', ')}</p>` : ''}
      ${bitacorasRel.length > 0 ? `<p style="font-size:12px;margin:6px 0 0"><strong>Bitácora Equipo &amp; Flota:</strong> ${bitacorasRel.map((r: any) => r.bitacora?.folio ?? `#${r.id_bitacora_fk}`).join(', ')}</p>` : ''}
      ${vigilanciaRel.length > 0 ? `<p style="font-size:12px;margin:6px 0 0"><strong>Lote(s) Vigilancia Extras:</strong> ${vigilanciaRel.map((r: any) => r.folio ?? `#${r.id}`).join(', ')}</p>` : ''}
      ${reembolsoRel ? `<p style="font-size:12px;margin:6px 0 0"><strong>Reembolso Caja Chica de origen:</strong> ${reembolsoRel.folio ?? `#${reembolsoRel.id}`}</p>` : ''}
      ${servicioCat ? `<p style="font-size:12px;margin:6px 0 0"><strong>Servicio de Suministro:</strong> ${servicioCat.no_servicio} — ${servicioCat.tipo_servicio}${servicioCat.ubicacion ? ` · ${servicioCat.ubicacion}` : ''}</p>` : ''}
      ${opData.notas ? `<p style="font-size:12px;color:#64748b"><em>Notas: ${opData.notas}</em></p>` : ''}
      <div style="margin-top:18px;border:1px solid #bfdbfe;border-radius:8px;overflow:hidden">
        <div style="background:#eff6ff;padding:8px 14px;font-size:11px;font-weight:700;color:#1e40af;letter-spacing:.06em;text-transform:uppercase">
          Autorización y Control de Pago
        </div>
        <table style="margin:0">
          <tr><th>Estatus</th><td>${estadoAut}</td></tr>
          ${opData.autorizado_por     ? `<tr><th>1ra Autorización</th><td>${opData.autorizado_por}${opData.fecha_autorizacion ? ' · ' + new Date(opData.fecha_autorizacion).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : ''}</td></tr>` : ''}
          ${opData.autorizado_finanzas_por ? `<tr><th>2da Autorización (Finanzas)</th><td>${opData.autorizado_finanzas_por}${opData.fecha_autorizacion_finanzas ? ' · ' + new Date(opData.fecha_autorizacion_finanzas).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : ''}</td></tr>` : ''}
          ${opData.referencia_pago    ? `<tr><th>Ref. de Pago</th><td style="font-family:monospace">${opData.referencia_pago}</td></tr>` : ''}
          ${opData.instrucciones_pago ? `<tr><th>Instrucciones</th><td style="white-space:pre-wrap;color:#92400e;background:#fffbeb">${opData.instrucciones_pago}</td></tr>` : ''}
          ${!opData.autorizado_por && !opData.autorizado_finanzas_por && !opData.referencia_pago && !opData.instrucciones_pago ? `<tr><th>Detalle</th><td>Sin datos adicionales de autorización/pago.</td></tr>` : ''}
        </table>
      </div>
      <div class="firmas">
        <div class="firma">
          <div style="margin-bottom:2px;font-weight:600;color:#1e293b">${nombreElaboro}</div>
          Elaboró
        </div>
        <div class="firma">
          <div style="margin-bottom:2px;font-weight:600;color:#1e293b">${nombreAutorizo}</div>
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
    <ModalShell
      modulo="compras"
      titulo={op.folio}
      subtitulo={`${op._provNombre ?? 'Sin proveedor'} · ${fmtFecha(op.fecha_op)}`}
      onClose={onClose}
      maxWidth={580}
      footer={
        <>
          <div>
            {op.status === 'Pendiente' && (
              <button onClick={cancelar} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 7,
                background: 'none', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancelar OP
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={imprimir}>
              <Printer size={13} /> Imprimir
            </button>
            {['Pendiente Auth', 'Pendiente Auth Finanzas', 'Pendiente', 'Rechazada'].includes(op.status) && (
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>
                <Edit2 size={13} /> Editar
              </button>
            )}
          </div>
        </>
      }
    >
        {/* Status badge inline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <StatusBadge status={op.status} />
        </div>

        {/* Cuerpo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <Sec label="Beneficiario">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              <DI label="Proveedor"      value={op._provNombre} />
              <DI label="Banco"          value={op.banco_destino} />
              <DI label="CLABE / Cuenta" value={op.cuenta_clabe} mono />
              <DI label="Forma de Pago"  value={op.forma_pago} />
            </div>
          </Sec>

          <Sec label="Detalle del Pago">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
              <DI label="Concepto"        value={op.concepto} />
              <DI label="Tipo de Gasto"   value={op.tipo_gasto} />
              <DI label="Almacén"         value={op._almNombre} />
              <DI label="Vencimiento"     value={fmtFecha(op.fecha_vencimiento)} />
              {op.urgencia && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Urgencia</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: URGENCIA_COLOR[op.urgencia] ?? 'var(--text-primary)' }}>{op.urgencia}</div>
                </div>
              )}
              {op.id_centro_costo_fk && <DI label="Centro de Costo" value={ccMap[op.id_centro_costo_fk] ?? `#${op.id_centro_costo_fk}`} />}
              {op.id_area_fk && detLinesView.length === 0 && <DI label="Área"   value={areaMap[op.id_area_fk] ?? `#${op.id_area_fk}`} />}
              {op.id_frente_fk && detLinesView.length === 0 && <DI label="Frente" value={frMap[op.id_frente_fk] ?? `#${op.id_frente_fk}`} />}
              {op.referencia_pago && <DI label="Ref. Pago"  value={op.referencia_pago} mono />}
              {op.fecha_pago      && <DI label="Fecha Pago" value={fmtFecha(op.fecha_pago)} />}
              {op.reclasificado_por && <DI label="Reclasificado por" value={`${op.reclasificado_por} — ${fmtFecha(op.fecha_reclasificacion)}`} />}
              {op.reabierta_por && <DI label="Reabierta por" value={`${op.reabierta_por} — ${fmtFecha(op.fecha_reapertura)}`} />}
            </div>
            {detLinesView.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                  Distribución por Área ({detLinesView.length} línea{detLinesView.length > 1 ? 's' : ''})
                </div>
                <div className="card" style={{ overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Descripción</th>
                        <th>Área</th>
                        <th>Frente</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detLinesView.map((l: any) => (
                        <tr key={l.id}>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{l.descripcion ?? '—'}</td>
                          <td style={{ fontSize: 12 }}>{l.id_area_fk   ? (areaMap[l.id_area_fk] ?? `#${l.id_area_fk}`)   : '—'}</td>
                          <td style={{ fontSize: 12 }}>{l.id_frente_fk ? (frMap[l.id_frente_fk]  ?? `#${l.id_frente_fk}`) : '—'}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(l.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                        <td colSpan={3} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 12px' }}>Total distribución</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', padding: '6px 12px' }}>
                          {fmt(detLinesView.reduce((a: number, l: any) => a + (l.monto ?? 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </Sec>

          <Sec label="Instrucciones y respuestas (CXP)">
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Conversación asociada a esta orden de pago (p. ej. pago anticipado, aclaraciones). Queda registrada por usuario y fecha.
            </p>
            {instrErr && (
              <div style={{ padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>
                {instrErr}
              </div>
            )}
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {loadingInstr ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}><Loader size={14} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} /> Cargando…</div>
              ) : instrMsgs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  {puedePublicarInstruccion ? 'Aún no hay mensajes. Escribe una instrucción o respuesta.' : 'Sin mensajes registrados.'}
                </div>
              ) : (
                instrMsgs.map(m => {
                  const esTeso = m.autor_rol === 'tesoreria'
                  return (
                    <div key={m.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        borderLeft: `3px solid ${esTeso ? '#0891b2' : '#2563eb'}`,
                        background: esTeso ? '#f0fdfa' : '#f8fafc',
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{m.autor_nombre ?? '—'}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {m.created_at
                            ? new Date(m.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
                            : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, textTransform: 'capitalize' }}>{m.autor_rol ?? ''}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{m.cuerpo}</div>
                    </div>
                  )
                })
              )}
            </div>
            {puedePublicarInstruccion ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Escribe una instrucción o respuesta…"
                  value={instrText}
                  onChange={e => setInstrText(e.target.value)}
                  style={{ resize: 'vertical', fontSize: 13 }}
                  disabled={sendingInstr}
                />
                <button
                  type="button"
                  className="btn-primary"
                  style={{ alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  disabled={sendingInstr || !instrText.trim()}
                  onClick={enviarInstruccion}
                >
                  {sendingInstr ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
                  Enviar
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <MessageSquare size={14} /> Solo lectura: tu rol no puede agregar mensajes en este hilo.
              </div>
            )}
          </Sec>

          {/* Documentos: solo OP Pagada + permiso → carga PDF/XML; Pendiente u otros → solo lectura si ya hay archivos */}
          {puedeSubirFacturaPagada ? (
            <Sec label="Documentos de la Operación">
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                Orden pagada: adjunta el PDF y el XML (CFDI) de la factura. Puedes reemplazar o quitar archivos cuando lo necesites.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="label">PDF Factura</label>
                  <input ref={pdfDetailRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFacturaPagada(f, 'pdf_factura'); e.target.value = '' }} />
                  {localOp.pdf_factura ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <a href={localOp.pdf_factura} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                        <ExternalLink size={11} /> Ver PDF
                      </a>
                      <button type="button" className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
                        onClick={() => clearFacturaPagada('pdf_factura')} disabled={!!uploadingDoc}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
                      onClick={() => pdfDetailRef.current?.click()} disabled={uploadingDoc === 'pdf_factura'}>
                      {uploadingDoc === 'pdf_factura' ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                      {uploadingDoc === 'pdf_factura' ? 'Subiendo…' : 'Adjuntar PDF'}
                    </button>
                  )}
                </div>
                <div>
                  <label className="label">XML Factura (CFDI)</label>
                  <input ref={xmlDetailRef} type="file" accept=".xml,text/xml,application/xml" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFacturaPagada(f, 'xml_factura'); e.target.value = '' }} />
                  {localOp.xml_factura ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <a href={localOp.xml_factura} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4,
                          padding: '5px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                        <ExternalLink size={11} /> Ver XML
                      </a>
                      <button type="button" className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
                        onClick={() => clearFacturaPagada('xml_factura')} disabled={!!uploadingDoc}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
                      onClick={() => xmlDetailRef.current?.click()} disabled={uploadingDoc === 'xml_factura'}>
                      {uploadingDoc === 'xml_factura' ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                      {uploadingDoc === 'xml_factura' ? 'Subiendo…' : 'Adjuntar XML'}
                    </button>
                  )}
                </div>
              </div>
              {/* Soporte — disponible en cualquier estado */}
              <div>
                <label className="label">Soporte (cotización, contrato, correo, etc.)</label>
                <input ref={soporteDetailRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFacturaPagada(f, 'soporte_url'); e.target.value = '' }} />
                {localOp.soporte_url ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <a href={localOp.soporte_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                      <ExternalLink size={11} /> Ver Soporte
                    </a>
                    <button type="button" className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
                      onClick={() => clearFacturaPagada('soporte_url')} disabled={!!uploadingDoc}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
                    onClick={() => soporteDetailRef.current?.click()} disabled={uploadingDoc === 'soporte_url'}>
                    {uploadingDoc === 'soporte_url' ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                    {uploadingDoc === 'soporte_url' ? 'Subiendo…' : 'Adjuntar Soporte'}
                  </button>
                )}
              </div>
            </Sec>
          ) : (op.pdf_factura || op.xml_factura || localOp.soporte_url || canWrite('ordenes-pago')) ? (
            <Sec label="Documentos de la Operación">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {op.pdf_factura && (
                  <a href={op.pdf_factura} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                      background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 7, textDecoration: 'none' }}>
                    <FileText size={13} /> PDF Factura
                  </a>
                )}
                {op.xml_factura && (
                  <a href={op.xml_factura} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                      background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 7, textDecoration: 'none' }}>
                    <FileText size={13} /> XML Factura
                  </a>
                )}
              </div>
              {/* Soporte — siempre editable si tiene permiso de escritura */}
              <div>
                <label className="label">Soporte (cotización, contrato, correo, etc.)</label>
                <input ref={soporteDetailRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFacturaPagada(f, 'soporte_url'); e.target.value = '' }} />
                {localOp.soporte_url ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <a href={localOp.soporte_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 6, textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                      <ExternalLink size={11} /> Ver Soporte
                    </a>
                    {canWrite('ordenes-pago') && (
                      <button type="button" className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }}
                        onClick={() => clearFacturaPagada('soporte_url')} disabled={!!uploadingDoc}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ) : canWrite('ordenes-pago') ? (
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, width: '100%' }}
                    onClick={() => soporteDetailRef.current?.click()} disabled={uploadingDoc === 'soporte_url'}>
                    {uploadingDoc === 'soporte_url' ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
                    {uploadingDoc === 'soporte_url' ? 'Subiendo…' : 'Adjuntar Soporte'}
                  </button>
                ) : (
                  <div style={{ padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                    Sin soporte registrado.
                  </div>
                )}
              </div>
            </Sec>
          ) : null}

          {ocsRel.length > 0 && (
            <Sec label="Órdenes de Compra Relacionadas">
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead><tr><th>Folio OC</th><th style={{ textAlign: 'right' }}>Total OC</th><th style={{ textAlign: 'right' }}>Monto OP</th></tr></thead>
                  <tbody>
                    {ocsRel.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.ordenes_compra?.folio ?? `#${r.id_oc_fk}`}</td>
                        <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt(r.ordenes_compra?.total)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Sec>
          )}

          {valesComb.length > 0 && (
            <Sec label="Vales de Combustible Asociados">
              <div className="card" style={{ overflow: 'hidden' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Folio</th><th>Suministro</th><th>Equipo / Área</th>
                      <th style={{ textAlign: 'right' }}>Litros Aut.</th>
                      <th style={{ textAlign: 'right' }}>Litros Cons.</th>
                      <th style={{ textAlign: 'right' }}>Monto Aut.</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valesComb.map((v: any) => {
                      const s = VALE_STATUS_COLOR[v.status] ?? VALE_STATUS_COLOR['Solicitado']
                      return (
                        <tr key={v.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{v.folio ?? `#${v.id}`}</td>
                          <td style={{ fontSize: 12 }}>{v.tipo_suministro ?? '—'}</td>
                          <td style={{ fontSize: 12 }}>{v.id_equipo_fk ? (equiposMap[v.id_equipo_fk] ?? `#${v.id_equipo_fk}`) : (v.id_area_fk ? (areaMap[v.id_area_fk] ?? `#${v.id_area_fk}`) : '—')}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{v.litros_autorizados ?? '—'}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{v.litros_consumidos ?? 0}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(v.monto_autorizado)}</td>
                          <td>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                              color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
                              {v.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Sec>
          )}

          {eventosRel.length > 0 && (
            <Sec label="Eventos Relacionados">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {eventosRel.map((e: any) => (
                  <div key={e.id} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{e.folio}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{e.nombre}</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{e.modulo}</span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {bitacorasRel.length > 0 && (
            <Sec label="Bitácora de Equipo & Flota Relacionada">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bitacorasRel.map((r: any, i: number) => (
                  <div key={i} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.bitacora?.folio ?? `#${r.id_bitacora_fk}`}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
                        {r.bitacora?.tipo ?? '—'} · {r.bitacora?.id_equipo_fk ? (equiposMap[r.bitacora.id_equipo_fk] ?? `#${r.bitacora.id_equipo_fk}`) : '—'}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(r.monto)}</span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {vigilanciaRel.length > 0 && (
            <Sec label="Vigilancia Extras (Perimetrales) Relacionada">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {vigilanciaRel.map((r: any) => (
                  <div key={r.id} style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio ?? `#${r.id}`}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{fmtFecha(r.fecha_desde)} – {fmtFecha(r.fecha_hasta)}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(r.total)}</span>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          {reembolsoRel && (
            <Sec label="Reembolso de Caja Chica de Origen">
              <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{reembolsoRel.folio ?? `#${reembolsoRel.id}`}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{reembolsoRel.usuario_nombre ?? '—'} · {fmtFecha(reembolsoRel.fecha)}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{fmt(reembolsoRel.total)}</span>
              </div>
            </Sec>
          )}

          {(servicioCat || servicioRegistros.length > 0) && (
            <Sec label="Servicio de Suministro (CFE / Agua) Relacionado">
              {servicioCat && (
                <div style={{ marginBottom: servicioRegistros.length > 0 ? 8 : 0, fontSize: 13 }}>
                  <strong>{servicioCat.no_servicio}</strong> — {servicioCat.tipo_servicio}{servicioCat.ubicacion ? ` · ${servicioCat.ubicacion}` : ''}
                </div>
              )}
              {servicioRegistros.length > 0 && (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <table>
                    <thead><tr><th>Periodo</th><th style={{ textAlign: 'right' }}>Consumo</th><th style={{ textAlign: 'right' }}>Monto</th></tr></thead>
                    <tbody>
                      {servicioRegistros.map((r: any) => (
                        <tr key={r.id}>
                          <td style={{ fontSize: 12 }}>{fmtFecha(r.fecha_periodo)}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>{r.consumo_periodo ?? '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto_periodo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Sec>
          )}

          {abonos.length > 0 && (
            <Sec label="Pagos Asociados">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {loadingAbonos ? (
                  <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>Cargando pagos...</div>
                ) : abonos.map(a => (
                  <div key={a.id} style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>
                        {fmt(a.monto)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {fmtFecha(a.fecha_abono)} · {a.forma_pago}
                        {a.referencia && <span style={{ marginLeft: 6, fontFamily: 'monospace' }}>Ref: {a.referencia}</span>}
                      </div>
                      {a.notas && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 4 }}>{a.notas}</div>}
                    </div>
                    
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {a.comprobante && (
                        <a href={a.comprobante} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', background: '#eff6ff', color: 'var(--blue)', border: '1px solid #bfdbfe', borderRadius: 6, textDecoration: 'none' }}>
                          <CheckCircle size={11} /> Comprobante de Pago
                        </a>
                      )}
                      {a.complemento_pago && (
                        <a href={a.complemento_pago} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', background: '#fdf4ff', color: '#7c3aed', border: '1px solid #e9d5ff', borderRadius: 6, textDecoration: 'none' }}>
                          <FileText size={11} /> Complemento SAT
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Sec>
          )}

          <div style={{ padding: '14px 18px', background: 'var(--blue-pale)', border: '1px solid #bfdbfe', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>TOTAL A PAGAR</span>
            <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(op.monto)}</span>
          </div>

          {op.notas && <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Notas: {op.notas}</p>}

          {/* ── Bloque de Autorización ── solo cuando status = Pendiente Auth ── */}
          {op.status === 'Pendiente Auth' && (
            <div style={{ padding: '16px 18px', background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={15} style={{ color: '#d97706', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                  Pendiente de Autorización
                </span>
                <span style={{ fontSize: 11, color: '#a16207', marginLeft: 'auto' }}>
                  {(op.id_oc_fk != null || ocsRel.length > 0) ? 'Con OC vinculada — requiere aprobación' : 'Gasto directo sin OC — requiere aprobación'}
                </span>
              </div>
              {puedeAutorizar ? (
                <>
                  <textarea
                    className="input" rows={2}
                    placeholder="Comentario u observación (opcional)…"
                    value={authComment} onChange={e => setAuthCom(e.target.value)}
                    style={{ marginBottom: 10, resize: 'vertical', fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAuth(true)} disabled={authLoading}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #bbf7d0',
                        background: '#f0fdf4', color: '#15803d', fontWeight: 700, cursor: 'pointer',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {authLoading ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                      Autorizar — Operaciones
                    </button>
                    <button
                      onClick={() => handleAuth(false)} disabled={authLoading}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #fecaca',
                        background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: 'pointer',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Trash2 size={14} /> Rechazar
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: '#a16207', margin: 0 }}>
                  En espera de aprobación por Administración, Administrador (Organismo), Supervisor de Compras, Tesorería o Fraccionamiento.
                </p>
              )}
            </div>
          )}

          {/* ── Bloque de 2da Autorización (Finanzas) ── solo cuando status = Pendiente Auth Finanzas ── */}
          {op.status === 'Pendiente Auth Finanzas' && (
            <div style={{ padding: '16px 18px', background: '#f5f3ff', border: '2px solid #ddd6fe', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={15} style={{ color: '#7c3aed', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#5b21b6' }}>
                  Segunda Autorización (Finanzas)
                </span>
                <span style={{ fontSize: 11, color: '#7c3aed', marginLeft: 'auto' }}>
                  Ya autorizada{op.autorizado_por ? ` por ${op.autorizado_por}` : ''} — falta envío a CXP
                </span>
              </div>
              {puedeAutorizarFinanzas ? (
                <>
                  <textarea
                    className="input" rows={2}
                    placeholder="Comentario u observación (opcional)…"
                    value={authComment} onChange={e => setAuthCom(e.target.value)}
                    style={{ marginBottom: 10, resize: 'vertical', fontSize: 12 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAuthFinanzas(true)} disabled={authLoading}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #bbf7d0',
                        background: '#f0fdf4', color: '#15803d', fontWeight: 700, cursor: 'pointer',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {authLoading ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={14} />}
                      Autorizar — enviar a CXP
                    </button>
                    <button
                      onClick={() => handleAuthFinanzas(false)} disabled={authLoading}
                      style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #fecaca',
                        background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: 'pointer',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Trash2 size={14} /> Rechazar
                    </button>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 12, color: '#5b21b6', margin: 0 }}>
                  En espera de la segunda autorización por Administrador de Finanzas.
                </p>
              )}
            </div>
          )}

          {/* Confirmación de rechazo */}
          {op.status === 'Rechazada' && (
            <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              Esta Orden de Pago fue rechazada y no ingresará a Cuentas por Pagar.
            </div>
          )}

          {/* Confirmación de sustitución */}
          {op.status === 'Sustituida' && (
            <div style={{ padding: '12px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8,
              fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              Esta Orden de Pago fue sustituida{folioSustituta ? ` por ${folioSustituta}` : ''} y no ingresará a Cuentas por Pagar.
            </div>
          )}
          {op.id_op_original_fk && folioOriginal && (
            <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
              fontSize: 12, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              Esta Orden de Pago sustituye a {folioOriginal} (rechazada).
            </div>
          )}

          {/* Reabrir / Duplicar (solo superadmin, solo Rechazada) */}
          {authUser?.rol === 'superadmin' && op.status === 'Rechazada' && (
            <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                Esta OP fue rechazada — puedes reabrirla para corregirla, o duplicarla con folio nuevo
              </div>
              {reabrirDuplicarError && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{reabrirDuplicarError}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleReabrir} disabled={reabrirLoading || duplicarLoading}>
                  {reabrirLoading ? <Loader size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reabrir esta OP
                </button>
                <button className="btn-secondary" style={{ fontSize: 12 }} onClick={handleDuplicar} disabled={reabrirLoading || duplicarLoading}>
                  {duplicarLoading ? <Loader size={13} className="animate-spin" /> : <Copy size={13} />} Duplicar con folio nuevo
                </button>
              </div>
            </div>
          )}

          {/* Reclasificar (solo superadmin) — corrige CC/Área/Frente/Tipo de
              Gasto sin importar status, nunca monto/saldo/pagos. */}
          {authUser?.rol === 'superadmin' && (
            <div style={{ padding: '14px 16px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
              {!reclasOpen ? (
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={abrirReclasificar}>
                  <Tag size={13} /> Reclasificar CC/Área/Frente/Tipo de Gasto
                </button>
              ) : (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                    Reclasificar — solo corrige clasificación, no toca monto ni pagos
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div><label className="label">Centro de Costo</label>
                      <select className="select" value={reclasCC}
                        onChange={e => { setReclasCC(e.target.value); setReclasArea(''); setReclasFrente('') }}>
                        <option value="">— Sin asignar —</option>
                        {ccList.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Área</label>
                      <select className="select" value={reclasArea}
                        onChange={e => { setReclasArea(e.target.value); setReclasFrente('') }}
                        disabled={!reclasCC}>
                        <option value="">— Sin asignar —</option>
                        {areaList.filter(a => a.id_centro_costo_fk === Number(reclasCC)).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Frente</label>
                      <select className="select" value={reclasFrente} onChange={e => setReclasFrente(e.target.value)} disabled={!reclasArea}>
                        <option value="">— Sin asignar —</option>
                        {frenteList.filter(f => relAF.some(r => r.id_area === Number(reclasArea) && r.id_frente === f.id)).map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Tipo de Gasto</label>
                      <select className="select" value={reclasTipoGasto} onChange={e => setReclasTipoGasto(e.target.value)}>
                        <option value="">— Sin asignar —</option>
                        {TIPOS_GASTO.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  {reclasError && <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 10 }}>{reclasError}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" style={{ fontSize: 12 }} onClick={handleReclasificar} disabled={reclasSaving}>
                      {reclasSaving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Guardar reclasificación
                    </button>
                    <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setReclasOpen(false)}>Cancelar</button>
                  </div>
                </>
              )}
              {op.reclasificado_por && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: reclasOpen ? 12 : 8, marginBottom: 0 }}>
                  Última reclasificación: {op.reclasificado_por} — {new Date(op.fecha_reclasificacion).toLocaleString('es-MX')}
                </p>
              )}
            </div>
          )}
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

// ── Helpers UI ─────────────────────────────────────────────
const Sec = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>{label}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  </div>
)
const DI = ({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) => value ? (
  <div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13, fontFamily: mono ? 'monospace' : undefined }}>{value}</div>
  </div>
) : null
