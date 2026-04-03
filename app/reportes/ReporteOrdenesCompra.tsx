'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbComp } from '@/lib/supabase'
import { PrintBar } from './utils'
import { RefreshCw } from 'lucide-react'

export default function ReporteOrdenesCompra() {
  const [rows, setRows]       = useState<any[]>([])
  const [provMap, setProvMap] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroProv, setFiltroProv]     = useState('')
  const [filtroDe, setFiltroDe]         = useState('')
  const [filtroA,  setFiltroA]          = useState('')
  const [provs, setProvs]     = useState<any[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: ocs }, { data: ps }] = await Promise.all([
      dbComp.from('ordenes_compra').select('*').order('created_at', { ascending: false }),
      dbComp.from('proveedores').select('id, nombre').order('nombre'),
    ])
    setProvs(ps ?? [])
    const pm: Record<number, string> = {}
    ;(ps ?? []).forEach((p: any) => { pm[p.id] = p.nombre })
    setProvMap(pm)

    let result = ocs ?? []
    if (filtroStatus) result = result.filter((r: any) => r.status === filtroStatus)
    if (filtroProv)   result = result.filter((r: any) => r.id_proveedor_fk === Number(filtroProv))
    if (filtroDe)     result = result.filter((r: any) => r.fecha_oc >= filtroDe)
    if (filtroA)      result = result.filter((r: any) => r.fecha_oc <= filtroA)

    setRows(result)
    setLoading(false)
  }, [filtroStatus, filtroProv, filtroDe, filtroA])

  useEffect(() => { fetchData() }, [fetchData])

  const fmt  = (n: number | null) => n != null ? '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—'
  const fmtF = (s: string | null) => s ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX') : '—'
  const total = rows.reduce((a, r) => a + Number(r.total || 0), 0)

  const statusColor = (s: string) =>
    s === 'Autorizada' ? '#15803d' : s === 'Borrador' ? '#d97706' :
    s === 'Cerrada'    ? '#2563eb' : s === 'Cancelada' ? '#dc2626' : '#64748b'

  const STATUS = ['Borrador','Autorizada','Enviada al Prov','Cerrada','Cancelada']

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select" style={{ minWidth: 150 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos los status</option>
          {STATUS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ minWidth: 200 }} value={filtroProv} onChange={e => setFiltroProv(e.target.value)}>
          <option value="">Todos los proveedores</option>
          {provs.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} style={{ width: 145 }} placeholder="Desde" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>–</span>
          <input className="input" type="date" value={filtroA} onChange={e => setFiltroA(e.target.value)} style={{ width: 145 }} placeholder="Hasta" />
        </div>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <PrintBar title="Ordenes-de-Compra" count={rows.length} reportTitle="Órdenes de Compra" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {STATUS.map(s => {
          const n = rows.filter(r => r.status === s)
          const tot = n.reduce((a, r) => a + Number(r.total || 0), 0)
          return (
            <div key={s} className="card" style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: statusColor(s), fontVariantNumeric: 'tabular-nums' }}>{fmt(tot)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n.length} OC</div>
            </div>
          )
        })}
      </div>

      <div id="reporte-print-area">
      <div className="card" style={{ overflow: 'hidden' }}>
        <table id="reporte-table">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Proveedor</th>
              <th>Fecha OC</th>
              <th>Entrega Est.</th>
              <th>Cond. Pago</th>
              <th style={{ textAlign: 'right' }}>Subtotal</th>
              <th style={{ textAlign: 'right' }}>IVA</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Status</th>
              <th>Autorizado por</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40 }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Sin registros</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                <td style={{ fontSize: 13 }}>{provMap[r.id_proveedor_fk] ?? '—'}</td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtF(r.fecha_oc)}</td>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{fmtF(r.fecha_entrega_est)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.condiciones_pago ?? '—'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{fmt(r.subtotal)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--text-muted)' }}>{fmt(r.iva)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--blue)' }}>{fmt(r.total)}</td>
                <td>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    color: statusColor(r.status), background: statusColor(r.status) + '15',
                    border: `1px solid ${statusColor(r.status)}40` }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.autorizado_por ?? '—'}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={7} style={{ color: 'var(--blue)' }}>TOTAL ({rows.length} OC)</td>
                <td style={{ textAlign: 'right', color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', fontSize: 15 }}>{fmt(total)}</td>
                <td colSpan={2}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}
