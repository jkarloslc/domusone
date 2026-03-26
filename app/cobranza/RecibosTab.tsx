'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useEffect, useState, useCallback } from 'react'
import { dbCtrl } from '@/lib/supabase'
import { Plus, Search, RefreshCw, Eye, X, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { fmt } from './types'
import ReciboModal from './ReciboModal'
import EstadoCuenta from './EstadoCuenta'
import FacturaModal from '../facturas/FacturaModal'

const PAGE_SIZE = 25

export default function RecibosTab() {
  const [recibos, setRecibos]       = useState<any[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [search, setSearch]         = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [filterActivo, setFilter]   = useState('true')
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [edoCuenta, setEdoCuenta]   = useState(false)
  const [facturarRecibo, setFacturarRecibo] = useState<any>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('recibos').select('*, lotes(cve_lote, lote)', { count: 'exact' })
      .order('fecha_recibo', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filterActivo !== '') q = q.eq('activo', filterActivo === 'true')
    if (debouncedSearch) q = q.or(`folio.ilike.%${debouncedSearch}%,propietario.ilike.%${debouncedSearch}%`)
    const { data, count, error } = await q
    if (!error) { setRecibos(data ?? []); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, debouncedSearch, filterActivo])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const sumActivos = recibos.filter(r => r.activo).reduce((a: number, r: any) => a + (r.monto ?? 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar folio, propietario…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="select" style={{ width: 160 }} value={filterActivo} onChange={e => { setFilter(e.target.value); setPage(0) }}>
            <option value="true">Activos</option>
            <option value="false">Cancelados</option>
            <option value="">Todos</option>
          </select>
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setEdoCuenta(true)}>
            <Eye size={14} /> Estado de Cuenta
          </button>
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={14} /> Nuevo Recibo
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: '10px 18px' }}>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 600 }}>{total}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Recibos en pantalla</div>
        </div>
        <div className="card" style={{ padding: '10px 18px' }}>
          <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 600, color: '#15803d' }}>{fmt(sumActivos)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total activos</div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Lote</th>
              <th>Propietario</th>
              <th>Fecha Recibo</th>
              <th>Fecha Pago</th>
              <th style={{ textAlign: 'right' }}>Monto</th>
              <th>Status</th>
              <th style={{ width: 90 }}>Factura</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}><RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} /></td></tr>
            : recibos.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin recibos</td></tr>
            : recibos.map((r: any) => (
              <tr key={r.id} style={{ opacity: r.activo ? 1 : 0.5 }}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio ?? `#${r.id}`}</td>
                <td style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-secondary)' }}>{r.lotes?.cve_lote ?? `#${r.id_lote_fk}`}</td>
                <td style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.propietario ?? '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{r.fecha_recibo ? new Date(r.fecha_recibo + 'T12:00:00').toLocaleDateString('es-MX') : '—'}</td>
                <td style={{ fontSize: 12, color: r.fecha_pago ? '#15803d' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.fecha_pago ? new Date(r.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX') : 'Pendiente'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(r.monto)}</td>
                <td><span className={`badge ${r.activo ? 'badge-vendido' : 'badge-bloqueado'}`}>{r.activo ? 'Activo' : 'Cancelado'}</span></td>
                <td>
                  {r.activo && !r.folio_fiscal && (
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px', color: 'var(--blue)' }}
                      onClick={() => setFacturarRecibo(r)} title="Facturar este recibo">
                      <FileText size={12} /> Facturar
                    </button>
                  )}
                  {r.folio_fiscal && (
                    <span style={{ fontSize: 10, color: '#15803d', display: 'flex', alignItems: 'center', gap: 3 }}>
                      ✓ Facturado
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page + 1} de {totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {modalOpen  && <ReciboModal onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
      {edoCuenta  && <EstadoCuenta onClose={() => setEdoCuenta(false)} />}
      {facturarRecibo && <FacturaModal reciboInicial={facturarRecibo} onClose={() => setFacturarRecibo(null)} onSaved={() => { setFacturarRecibo(null); fetchData() }} />}
    </div>
  )
}