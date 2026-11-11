'use client'
import { useZonas, SelectZona } from '@/lib/zonas'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg, dbComp } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Plus, Search, RefreshCw, Receipt, ChevronLeft, ChevronRight,
  Save, Loader, Calendar, Eye, Ban, Layers, DollarSign, Printer, Pencil,
  TrendingUp,
} from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import FiltroAgrupadorCentro from '@/components/ui/FiltroAgrupadorCentro'
import { esCentroCuotas, colorAgrupador, cargarCentrosAgrupados, idsCentrosFiltro, AgrupadorIngreso } from '@/lib/centrosIngreso'

import Paginador from '@/components/ui/Paginador'
import PageHeader from '@/components/layout/PageHeader'
import ReciboModal, { type Centro, type Seccion, type Recibo, fmt, fmtFecha, STATUS_STYLE } from './ReciboModal'

export default function IngresosPage() {
  const { authUser, canWrite } = useAuth()
  const esCobranza = authUser?.rol === 'cobranza'
  const [rows, setRows]         = useState<Recibo[]>([])
  const [centros, setCentros]   = useState<Centro[]>([])
  const [secciones, setSecciones] = useState<Seccion[]>([])
  const [centrosMap, setCentrosMap] = useState<Record<number, Centro>>({})
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch]     = useState('')
  const [filterCentro, setFilterCentro] = useState('')
  const [filterAgr, setFilterAgr]       = useState('')
  const [agrupadores, setAgrupadores]   = useState<AgrupadorIngreso[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterZona, setFilterZona]     = useState('')
  const [filterSeccion, setFilterSeccion] = useState('')
  const zonasCat = useZonas()
  // CI de cuotas (Mantto. Fraccionamiento) → Zona → Sección
  const ciZona = zonasCat.ciUsaZonas(filterCentro)
  useEffect(() => { if (!ciZona) { setFilterZona(''); setFilterSeccion('') } }, [ciZona])
  const [filterFechaIni, setFilterFechaIni] = useState('')
  const [filterFechaFin, setFilterFechaFin] = useState('')
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [detalle, setDetalle]   = useState<Recibo | null>(null)

  // cobranza: solo centros del agrupador marcado como cuotas de fraccionamiento
  const centrosPermitidos = esCobranza ? centros.filter(esCentroCuotas) : centros
  const cuotasCentroIds   = centros.filter(esCentroCuotas).map(c => c.id)

  // Carga catálogos una sola vez
  useEffect(() => {
    Promise.all([
      cargarCentrosAgrupados('*', q => q.eq('activo', true)),
      dbCfg.from('secciones').select('id, nombre, clave_alfa').eq('activo', true).order('nombre'),
    ]).then(([{ centros: cs, agrupadores: ags }, { data: ss }]) => {
      const list = cs as unknown as Centro[]
      setCentros(list)
      setAgrupadores(ags)
      const map: Record<number, Centro> = {}
      list.forEach(c => { map[c.id] = c })
      setCentrosMap(map)
      setSecciones((ss ?? []) as Seccion[])
    }).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    // Zona → Sección: recibos con al menos una línea de esas secciones
    const secIds = filterSeccion ? new Set([Number(filterSeccion)]) : zonasCat.seccionesDeZona(filterZona)
    let q = dbCtrl.from('recibos_ingreso')
      .select(secIds ? '*, recibos_ingreso_secciones!inner(id_seccion_fk)' : '*', { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1)

    if (filterStatus)   q = q.eq('status', filterStatus)
    if (secIds)         q = q.in('recibos_ingreso_secciones.id_seccion_fk', secIds.size > 0 ? Array.from(secIds) : [-1])
    const idsC = idsCentrosFiltro(centrosPermitidos as any, filterAgr, filterCentro)
    if (idsC)           q = q.in('id_centro_ingreso_fk', idsC.size > 0 ? Array.from(idsC) : [-1])
    if (filterFechaIni) q = q.gte('fecha', filterFechaIni)
    if (filterFechaFin) q = q.lte('fecha', filterFechaFin)
    if (search)         q = q.ilike('folio', `%${search}%`)

    // cobranza: solo ve recibos de centros tipo 'cuotas' (Cuotas Residencial)
    if (esCobranza) q = q.in('id_centro_ingreso_fk', cuotasCentroIds.length > 0 ? cuotasCentroIds : [-1])

    const { data, count } = await q
    setRows((data ?? []) as unknown as Recibo[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, pageSize, filterStatus, filterZona, filterSeccion, zonasCat, filterAgr, filterCentro, centros, filterFechaIni, filterFechaFin, search, esCobranza, cuotasCentroIds.join(',')])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages        = Math.ceil(total / pageSize)
  const totalConfirmado   = rows.filter(r => r.status === 'Confirmado').reduce((a, r) => a + (r.monto_total ?? 0), 0)
  const totalBorrador     = rows.filter(r => r.status === 'Borrador').reduce((a, r) => a + (r.monto_total ?? 0), 0)
  const totalCancelado    = rows.filter(r => r.status === 'Cancelado').reduce((a, r) => a + (r.monto_total ?? 0), 0)
  const totalPagina       = rows.reduce((a, r) => a + (r.monto_total ?? 0), 0)
  const totalMes          = totalConfirmado

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <PageHeader icon={TrendingUp}
        color="#059669"
        eyebrowLabel="Módulo"
        variant="xl"
        title="Ingresos"
        subtitle={<>{total} recibos · {fmt(totalMes)} en los filtros actuales</>}
        actions={<>
          {canWrite('ingresos') && (
            <button className="btn-primary" onClick={() => setModal(true)}>
              <Plus size={14} /> Nuevo Recibo
            </button>
          )}
        </>}
      />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', maxWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar folio…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <FiltroAgrupadorCentro centros={centrosPermitidos as any} agrupadores={agrupadores} minWidth={200}
          filtroAgr={filterAgr} setFiltroAgr={v => { setFilterAgr(v); setPage(0) }}
          filtroCentro={filterCentro} setFiltroCentro={v => { setFilterCentro(v); setPage(0) }} />
        {ciZona && <>
          <SelectZona zonas={zonasCat.zonas} value={filterZona} onChange={v => { setFilterZona(v); setFilterSeccion(''); setPage(0) }} />
          <select className="select" style={{ width: 'auto', minWidth: 160 }} value={filterSeccion} onChange={e => { setFilterSeccion(e.target.value); setPage(0) }}>
            <option value="">Todas las secciones</option>
            {secciones.filter(x => zonasCat.seccionEnZona(filterZona, x.id)).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
        </>}
        <select className="select" style={{ width: 150 }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0) }}>
          <option value="">Todos los status</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Borrador">Borrador</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={13} style={{ color: 'var(--text-muted)' }} />
          <input className="input" type="date" style={{ width: 148 }} value={filterFechaIni}
            onChange={e => { setFilterFechaIni(e.target.value); setPage(0) }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" style={{ width: 148 }} value={filterFechaFin}
            onChange={e => { setFilterFechaFin(e.target.value); setPage(0) }} />
        </div>
        <button className="btn-ghost" onClick={fetchData} title="Actualizar">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Centro de Ingreso</th>
                <th>Descripción</th>
                <th>Origen</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                  <Receipt size={32} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
                  <div style={{ fontSize: 14 }}>Sin recibos de ingreso</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {total === 0 ? 'Crea el primer recibo con el botón "Nuevo Recibo"' : 'Sin resultados con los filtros actuales'}
                  </div>
                </td></tr>
              ) : rows.map(r => {
                const centro = centrosMap[r.id_centro_ingreso_fk ?? 0]
                const color  = colorAgrupador(centro?.id_agrupador_fk)
                const sc     = STATUS_STYLE[r.status] ?? { bg: '#f8fafc', color: '#94a3b8' }
                const esCancelado = r.status === 'Cancelado'
                return (
                  <tr key={r.id} style={{ opacity: esCancelado ? 0.55 : 1 }}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--blue)' }}>
                        {r.folio ?? `#${r.id}`}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtFecha(r.fecha)}</td>
                    <td>
                      {centro && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block' }} />
                          {centro.label ?? centro.nombre}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.descripcion ?? '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {r.origen === 'cobranza' ? 'Cobranza' : r.origen === 'externo' ? 'Externo' : 'Manual'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: esCancelado ? '#94a3b8' : '#059669' }}>
                      {fmt(r.monto_total ?? 0)}
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }}
                        onClick={() => setDetalle(r)} title="Ver detalle">
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f0f9ff', borderTop: '2px solid #bae6fd' }}>
                  <td colSpan={5} style={{ padding: '9px 12px', fontSize: 12, fontWeight: 600, color: '#0369a1' }}>
                    Total página · {rows.length} recibos
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 13, color: '#0369a1', fontVariantNumeric: 'tabular-nums', padding: '9px 12px' }}>
                    {fmt(totalPagina)}
                  </td>
                  <td colSpan={2} style={{ padding: '9px 12px', fontSize: 11, color: '#64748b' }}>
                    <span style={{ color: '#15803d', fontWeight: 600 }}>{fmt(totalConfirmado)}</span>
                    {totalBorrador > 0 && <span style={{ color: '#d97706', fontWeight: 600, marginLeft: 8 }}>{fmt(totalBorrador)}</span>}
                    {totalCancelado > 0 && <span style={{ color: '#94a3b8', marginLeft: 8 }}>{fmt(totalCancelado)}</span>}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Paginación */}
        <Paginador page={page} pageSize={pageSize} totalItems={total} onChange={setPage}
          onPageSizeChange={n => { setPageSize(n); setPage(0) }} />
      </div>

      {/* Modal nuevo */}
      {modal && (
        <ReciboModal
          recibo={null}
          centros={centrosPermitidos}
          secciones={secciones}
          onClose={() => setModal(false)}
          onSaved={() => { setModal(false); fetchData() }}
          authUser={authUser}
          canWrite={canWrite}
        />
      )}

      {/* Modal detalle/cancelar */}
      {detalle && (
        <ReciboModal
          recibo={detalle}
          centros={centrosPermitidos}
          secciones={secciones}
          onClose={() => setDetalle(null)}
          onSaved={() => { setDetalle(null); fetchData() }}
          authUser={authUser}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
