'use client'
import { useDebounce } from '@/lib/useDebounce'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCat } from '@/lib/supabase'
import {
  FileText, Plus, Search, RefreshCw, Printer, Mail,
  XCircle, Eye, ChevronLeft, ChevronRight,
  CheckCircle, AlertTriangle, Loader, X, Download
} from 'lucide-react'
import FacturaModal from './FacturaModal'
import FacturaDetail from './FacturaDetail'

const PAGE_SIZE = 25

const fmt = (v: number | null | undefined) =>
  v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function FacturasPage() {
  const [facturas, setFacturas]     = useState<any[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(0)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilter]   = useState('')
  const [loading, setLoading]       = useState(true)
  const [modalOpen, setModalOpen]   = useState(false)
  const [detail, setDetail]         = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    let q = dbCtrl.from('facturas')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (filterStatus) q = q.eq('status', filterStatus)
    if (debouncedSearch) q = q.or(`folio_interno.ilike.%${debouncedSearch}%,rfc_receptor.ilike.%${debouncedSearch}%,razon_social_receptor.ilike.%${debouncedSearch}%,folio_fiscal.ilike.%${debouncedSearch}%`)
    const { data, count, error } = await q
    if (!error) { setFacturas(data ?? []); setTotal(count ?? 0) }
    setLoading(false)
  }, [page, debouncedSearch, filterStatus])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Stats de la página actual
  const vigentes   = facturas.filter(f => f.status === 'Vigente').length
  const canceladas = facturas.filter(f => f.status === 'Cancelada').length
  const totalMonto = facturas.filter(f => f.status === 'Vigente').reduce((a, f) => a + (f.total ?? 0), 0)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <FileText size={16} style={{ color: 'var(--blue)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Facturas</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>Comprobantes Fiscales Digitales (CFDI)</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={14} /> Nueva Factura
        </button>
      </div>

      {/* Banner PAC */}
      <div style={{ padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <AlertTriangle size={15} style={{ color: '#d97706', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: '#92400e' }}>
          <strong>Modo simulación activo.</strong> El módulo está listo — cuando contrates tu PAC, conecta las credenciales en <code style={{ fontSize: 12, background: '#fef3c7', padding: '1px 4px', borderRadius: 3 }}>lib/pacService.ts</code> y cambia <code style={{ fontSize: 12, background: '#fef3c7', padding: '1px 4px', borderRadius: 3 }}>PAC_CONFIGURADO = true</code>.
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Vigentes',   value: vigentes,           color: '#15803d', bg: '#f0fdf4' },
          { label: 'Canceladas', value: canceladas,         color: '#dc2626', bg: '#fef2f2' },
          { label: 'Total mes',  value: fmt(totalMonto),    color: 'var(--blue)', bg: 'var(--blue-pale)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '12px 18px', background: s.bg, minWidth: 130 }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 600, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 340 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: 30 }} placeholder="Folio, RFC, razón social…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        </div>
        <select className="select" style={{ width: 150 }} value={filterStatus} onChange={e => { setFilter(e.target.value); setPage(0) }}>
          <option value="">Todas</option>
          <option value="Vigente">Vigentes</option>
          <option value="Cancelada">Canceladas</option>
          <option value="Simulada">Simuladas</option>
        </select>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* Tabla */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>UUID / Folio Fiscal</th>
              <th>Fecha</th>
              <th>Receptor</th>
              <th>RFC Receptor</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Status</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : facturas.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                Sin facturas registradas
              </td></tr>
            ) : facturas.map(f => (
              <tr key={f.id} style={{ opacity: f.status === 'Cancelada' ? 0.5 : 1 }}>
                <td>
                  <div style={{ fontWeight: 600, color: 'var(--blue)', fontFamily: 'monospace', fontSize: 12 }}>
                    {f.serie}{f.folio_interno}
                  </div>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.folio_fiscal ?? '— pendiente —'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {fmtFecha(f.fecha_emision)}
                </td>
                <td style={{ fontSize: 13, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.razon_social_receptor ?? '—'}
                </td>
                <td style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                  {f.rfc_receptor ?? '—'}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {fmt(f.total)}
                </td>
                <td>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: f.status === 'Vigente' ? '#f0fdf4' : f.status === 'Cancelada' ? '#fef2f2' : '#fffbeb',
                    color:      f.status === 'Vigente' ? '#15803d' : f.status === 'Cancelada' ? '#dc2626' : '#d97706',
                    border:     `1px solid ${f.status === 'Vigente' ? '#bbf7d0' : f.status === 'Cancelada' ? '#fecaca' : '#fde68a'}`,
                  }}>
                    {f.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetail(f)} title="Ver detalle">
                      <Eye size={13} />
                    </button>
                    {f.pdf_url && (
                      <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ padding: '4px 6px' }} title="Descargar PDF">
                        <Download size={13} />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Página {page + 1} de {totalPages} · {total} registros</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
              <button className="btn-secondary" style={{ padding: '5px 10px' }} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && <FacturaModal onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); fetchData() }} />}
      {detail    && <FacturaDetail factura={detail} onClose={() => setDetail(null)} onCanceled={() => { setDetail(null); fetchData() }} />}
    </div>
  )
}