'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { dbComp, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  ArrowLeft, RefreshCw, Search, Eye, X, Loader,
  Plus, Printer, FileText, Upload, Trash2, ExternalLink,
  AlertTriangle, CheckCircle, Clock
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, FORMAS_PAGO_COMP, StatusBadge } from '../../compras/types'
import ModalShell from '@/components/ui/ModalShell'

// ── Antigüedad de saldo ────────────────────────────────────
const diasVencido = (fecha: string | null) => {
  if (!fecha) return 0
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}

const bandaAntigüedad = (dias: number) => {
  if (dias <= 0)  return { label: 'Por vencer',  color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' }
  if (dias <= 30) return { label: '1-30 días',   color: '#d97706', bg: '#fffbeb', border: '#fde68a' }
  if (dias <= 60) return { label: '31-60 días',  color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' }
  if (dias <= 90) return { label: '61-90 días',  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
  return             { label: '+90 días',        color: '#7f1d1d', bg: '#fef2f2', border: '#fca5a5' }
}

// ════════════════════════════════════════════════════════════
// Página principal CXP
// ════════════════════════════════════════════════════════════
export default function CXPPage() {
  const router = useRouter()
  const [tab, setTab]               = useState<'resumen'|'antigüedad'>('resumen')
  const [proveedores, setProvs]     = useState<any[]>([])
  const [almMap, setAlmMap]         = useState<Record<number,string>>({})
  const [ops, setOps]               = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [detailProv, setDetailProv] = useState<any | null>(null)
  const [detailOP, setDetailOP]     = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: provs }, { data: allOps }, { data: alms }] = await Promise.all([
      dbComp.from('proveedores').select('id, nombre, rfc, condiciones_pago').eq('activo', true).order('nombre'),
      dbComp.from('ordenes_pago').select('*')
        .neq('status', 'Cancelada')
        .neq('status', 'Pendiente Auth')
        .neq('status', 'Rechazada')
        .order('fecha_vencimiento'),
      dbComp.from('almacenes').select('id, nombre'),
    ])
    setProvs(provs ?? [])
    setOps(allOps ?? [])
    const am: Record<number,string> = {}
    ;(alms ?? []).forEach((a:any) => { am[a.id] = a.nombre })
    setAlmMap(am)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const opsPendientes  = ops.filter(o => o.status !== 'Pagada' && o.status !== 'Pendiente Auth' && o.status !== 'Rechazada')
  const totalPorPagar  = opsPendientes.reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
  const totalVencido   = opsPendientes.filter(o => diasVencido(o.fecha_vencimiento) > 0)
                          .reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
  const totalPorVencer = opsPendientes.filter(o => diasVencido(o.fecha_vencimiento) <= 0)
                          .reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)

  const porProveedor = proveedores.map(prov => {
    const misOps = opsPendientes.filter(o => o.id_proveedor_fk === prov.id)
    const saldo  = misOps.reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
    const vencido = misOps.filter(o => diasVencido(o.fecha_vencimiento) > 0)
                     .reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
    return { ...prov, ops: misOps, saldo, vencido, count: misOps.length }
  }).filter(p => p.count > 0)

  const filteredProvs = search
    ? porProveedor.filter(p => p.nombre.toLowerCase().includes(search.toLowerCase()))
    : porProveedor

  const bandas = [
    { key: 'por_vencer', label: 'Por vencer',  dias: [null, 0]  },
    { key: '1_30',       label: '1-30 días',   dias: [1, 30]    },
    { key: '31_60',      label: '31-60 días',  dias: [31, 60]   },
    { key: '61_90',      label: '61-90 días',  dias: [61, 90]   },
    { key: '+90',        label: '+90 días',    dias: [91, null]  },
  ]
  const antiguedad = bandas.map(b => {
    const [min, max] = b.dias
    const filtradas = opsPendientes.filter(o => {
      const d = diasVencido(o.fecha_vencimiento)
      if (min === null) return d <= 0
      if (max === null) return d >= min
      return d >= min && d <= max
    })
    return { ...b, total: filtradas.reduce((a,o) => a + (o.saldo ?? o.monto ?? 0), 0), count: filtradas.length, ops: filtradas }
  })

  const tabs = [
    { key: 'resumen',    label: 'Por Proveedor' },
    { key: 'antigüedad', label: 'Antigüedad de Saldos' },
  ]

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-ghost" onClick={() => router.push('/tesoreria')}><ArrowLeft size={15} /></button>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600 }}>Cuentas por Pagar</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>CXP — Saldos, antigüedad y registro de pagos</p>
          </div>
        </div>
        <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total por Pagar', value: fmt(totalPorPagar),  color: 'var(--blue)', bg: 'var(--blue-pale)', icon: FileText },
          { label: 'Vencido',         value: fmt(totalVencido),   color: '#dc2626',     bg: '#fef2f2',          icon: AlertTriangle },
          { label: 'Por Vencer',      value: fmt(totalPorVencer), color: '#d97706',     bg: '#fffbeb',          icon: Clock },
        ].map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="card" style={{ padding: '16px 20px', background: k.bg, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: k.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} style={{ color: k.color }} />
              </div>
              <div>
                <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, color: k.color, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            style={{ padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
              fontFamily: 'var(--font-body)', fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Por Proveedor ── */}
      {tab === 'resumen' && (
        <>
          <div style={{ position: 'relative', maxWidth: 340, marginBottom: 16 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="input" style={{ paddingLeft: 30 }} placeholder="Buscar proveedor…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 48 }}><RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></div>
          ) : filteredProvs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin saldos pendientes por proveedor</div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>RFC</th>
                    <th style={{ textAlign: 'right' }}>OPs</th>
                    <th style={{ textAlign: 'right' }}>Saldo Pendiente</th>
                    <th style={{ textAlign: 'right' }}>Vencido</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProvs.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{p.rfc ?? '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 13 }}>{p.count}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: 15, color: 'var(--blue)' }}>{fmt(p.saldo)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: p.vencido > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: p.vencido > 0 ? 600 : 400 }}>
                        {p.vencido > 0 ? fmt(p.vencido) : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" style={{ padding: '4px 6px', fontSize: 11 }} onClick={() => setDetailProv(p)}>
                            <Eye size={13} /> Ver
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                    <td colSpan={3} style={{ color: 'var(--blue)' }}>TOTAL</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 16, color: 'var(--blue)' }}>{fmt(totalPorPagar)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: totalVencido > 0 ? '#dc2626' : 'var(--text-muted)' }}>{totalVencido > 0 ? fmt(totalVencido) : '—'}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── TAB: Antigüedad ── */}
      {tab === 'antigüedad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Distribución de Saldos</div>
            {antiguedad.map(b => {
              const pct = totalPorPagar > 0 ? (b.total / totalPorPagar) * 100 : 0
              const banda = bandaAntigüedad(b.key === 'por_vencer' ? -1 : b.key === '1_30' ? 15 : b.key === '31_60' ? 45 : b.key === '61_90' ? 75 : 100)
              return (
                <div key={b.key} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: banda.color }}>{b.label}</span>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.count} OPs</span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: banda.color }}>{fmt(b.total)}</span>
                    </div>
                  </div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: banda.color, borderRadius: 4, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>

          {antiguedad.filter(b => b.count > 0).map(b => {
            const banda = bandaAntigüedad(b.key === 'por_vencer' ? -1 : b.key === '1_30' ? 15 : b.key === '31_60' ? 45 : b.key === '61_90' ? 75 : 100)
            return (
              <div key={b.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: banda.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: banda.color }}>{b.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {b.count} documentos · {fmt(b.total)}</span>
                </div>
                <div className="card" style={{ overflow: 'hidden', marginBottom: 4 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Folio OP</th><th>Proveedor</th><th>Concepto</th>
                        <th>Vencimiento</th><th style={{ textAlign: 'right' }}>Saldo</th><th style={{ width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.ops.map(op => {
                        const prov = proveedores.find(p => p.id === op.id_proveedor_fk)
                        return (
                          <tr key={op.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{op.folio}</td>
                            <td style={{ fontSize: 13 }}>{prov?.nombre ?? '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                            <td style={{ fontSize: 12, color: banda.color, fontWeight: 600 }}>{fmtFecha(op.fecha_vencimiento)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: banda.color }}>{fmt(op.saldo ?? op.monto)}</td>
                            <td>
                              <button className="btn-ghost" style={{ padding: '4px 6px' }}
                                onClick={() => setDetailOP({ ...op, _provNombre: prov?.nombre, _almNombre: almMap[op.id_almacen_fk] })}>
                                <Eye size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modales */}
      {detailProv && (
        <ProveedorCXP
          prov={detailProv}
          almMap={almMap}
          onClose={() => { setDetailProv(null); fetchData() }}
          onOpenOP={op => setDetailOP(op)}
        />
      )}
      {detailOP && (
        <OPCXPDetail
          op={detailOP}
          onClose={() => { setDetailOP(null); fetchData() }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Vista de OPs por proveedor + estado de cuenta imprimible
// ════════════════════════════════════════════════════════════
function ProveedorCXP({ prov, almMap, onClose, onOpenOP }: { prov: any; almMap: Record<number,string>; onClose: () => void; onOpenOP: (op: any) => void }) {
  const [ops, setOps]         = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    dbComp.from('ordenes_pago').select('*')
      .eq('id_proveedor_fk', prov.id)
      .neq('status', 'Cancelada')
      .order('fecha_vencimiento')
      .then(({ data }) => { setOps(data ?? []); setLoading(false) })
  }, [prov.id])

  const saldoTotal  = ops.filter(o => o.status !== 'Pagada').reduce((a,o) => a + (o.saldo ?? o.monto ?? 0), 0)
  const pagadoTotal = ops.filter(o => o.status === 'Pagada').reduce((a,o) => a + (o.monto ?? 0), 0)

  const imprimirEC = () => {
    const win = window.open('', '_blank')
    win?.document.write(`
      <html><head><title>Estado de Cuenta — ${prov.nombre}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;font-size:12px}h1{color:#0D4F80;font-size:20px;margin:0}
      .sub{color:#64748b;font-size:11px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      td,th{border:1px solid #e2e8f0;padding:7px 10px}
      th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
      .total{background:#eff6ff;font-weight:700;color:#0D4F80}
      .venc{color:#dc2626;font-weight:600}</style></head><body>
      <h1>Estado de Cuenta — Cuentas por Pagar</h1>
      <div class="sub">Proveedor: <strong>${prov.nombre}</strong> &nbsp;·&nbsp; RFC: ${prov.rfc ?? '—'} &nbsp;·&nbsp; Fecha: ${new Date().toLocaleDateString('es-MX')}</div>
      <table>
        <thead><tr><th>Folio</th><th>Concepto</th><th>Fecha OP</th><th>Vencimiento</th><th>Monto</th><th>Pagado</th><th>Saldo</th><th>Status</th></tr></thead>
        <tbody>
          ${ops.map(o => `<tr>
            <td style="font-family:monospace">${o.folio}</td>
            <td>${o.concepto ?? '—'}</td>
            <td>${fmtFecha(o.fecha_op)}</td>
            <td class="${diasVencido(o.fecha_vencimiento)>0&&o.status!=='Pagada'?'venc':''}">${fmtFecha(o.fecha_vencimiento)}</td>
            <td style="text-align:right">${fmt(o.monto)}</td>
            <td style="text-align:right">${fmt(o.monto_pagado ?? 0)}</td>
            <td style="text-align:right;font-weight:600">${fmt(o.saldo ?? o.monto)}</td>
            <td>${o.status}</td>
          </tr>`).join('')}
          <tr class="total"><td colspan="5">TOTALES</td>
            <td style="text-align:right">${fmt(pagadoTotal)}</td>
            <td style="text-align:right;font-size:14px">${fmt(saldoTotal)}</td>
            <td></td></tr>
        </tbody>
      </table>
      <p style="font-size:11px;color:#64748b;margin-top:24px">Documento generado por DomusOne · ${new Date().toLocaleString('es-MX')}</p>
      </body></html>
    `)
    win?.print()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 780 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{prov.nombre}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>RFC: {prov.rfc ?? '—'} · Condiciones: {prov.condiciones_pago ?? '—'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={imprimirEC}><Printer size={13} /> Estado de Cuenta</button>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '14px 24px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
          {[
            { label: 'Saldo Pendiente', value: fmt(saldoTotal),    color: 'var(--blue)' },
            { label: 'Pagado',          value: fmt(pagadoTotal),   color: '#15803d' },
            { label: 'Documentos',      value: String(ops.length), color: 'var(--text-secondary)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(88vh - 170px)' }}>
          <table>
            <thead>
              <tr>
                <th>Folio</th><th>Concepto</th><th>Almacén</th>
                <th>Vencimiento</th><th style={{ textAlign: 'right' }}>Monto</th>
                <th style={{ textAlign: 'right' }}>Pagado</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th>Docs</th><th>Status</th><th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32 }}><RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
              ) : ops.map(op => {
                const dias = diasVencido(op.fecha_vencimiento)
                const vencido = dias > 0 && op.status !== 'Pagada'
                return (
                  <tr key={op.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{op.folio}</td>
                    <td style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{op.id_almacen_fk ? (almMap[op.id_almacen_fk] ?? '—') : '—'}</td>
                    <td style={{ fontSize: 12, color: vencido ? '#dc2626' : 'var(--text-secondary)', fontWeight: vencido ? 600 : 400 }}>
                      {fmtFecha(op.fecha_vencimiento)}
                      {vencido && <span style={{ fontSize: 10, marginLeft: 4 }}>({dias}d)</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(op.monto)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803d' }}>{fmt(op.monto_pagado ?? 0)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: op.status === 'Pagada' ? '#15803d' : 'var(--blue)' }}>
                      {fmt(op.saldo ?? op.monto)}
                    </td>
                    {/* Indicadores PDF/XML de la OP */}
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {op.pdf_factura && <span style={{ fontSize: 9, padding: '1px 4px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 3, fontWeight: 600 }}>PDF</span>}
                        {op.xml_factura && <span style={{ fontSize: 9, padding: '1px 4px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 3, fontWeight: 600 }}>XML</span>}
                      </div>
                    </td>
                    <td><StatusBadge status={op.status} /></td>
                    <td>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }}
                        onClick={() => onOpenOP({ ...op, _provNombre: prov.nombre, _almNombre: almMap[op.id_almacen_fk] })}>
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Detalle de OP — abonos + comprobante + complemento de pago
// ════════════════════════════════════════════════════════════
function OPCXPDetail({ op, onClose }: { op: any; onClose: () => void }) {
  const { authUser } = useAuth()
  const [abonos, setAbonos]             = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [uploading, setUploading]       = useState<string | null>(null)
  const [pagoTotal, setPagoTotal]       = useState(true)
  const [formasPago, setFormasPago]     = useState<any[]>([])
  const [cuentasBanc, setCuentasBanc]   = useState<any[]>([])

  const [form, setForm] = useState({
    fecha_abono:          new Date().toISOString().slice(0, 10),
    monto:                (op.saldo ?? op.monto)?.toString() ?? '',
    forma_pago:           'Transferencia',
    id_cuenta_bancaria_fk: '',
    referencia:           '',
    notas:                '',
    comprobante:          '',     // comprobante de pago (transferencia/depósito)
    complemento_pago:     '',     // complemento de pago SAT (XML)
  })

  const comprobanteRef     = useRef<HTMLInputElement>(null)
  const complementoPagoRef = useRef<HTMLInputElement>(null)

  const fetchAbonos = useCallback(() => {
    setLoading(true)
    dbComp.from('cxp_abonos').select('*').eq('id_op_fk', op.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setAbonos(data ?? []); setLoading(false) })
  }, [op.id])

  useEffect(() => { fetchAbonos() }, [fetchAbonos])

  useEffect(() => {
    import('@/lib/supabase').then(({ dbCfg }) => {
      Promise.all([
        dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre'),
        dbCfg.from('cuentas_bancarias').select('id, banco, numero_cuenta, clabe, saldo').eq('activo', true).order('banco'),
      ]).then(([{ data: fps }, { data: cbs }]) => {
        setFormasPago(fps ?? [])
        setCuentasBanc(cbs ?? [])
        // Preseleccionar primera forma de pago disponible
        if (fps && fps.length > 0) setForm(f => ({ ...f, forma_pago: f.forma_pago || fps[0].nombre }))
      })
    })
  }, [])

  const saldoActual = op.saldo ?? op.monto ?? 0
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const uploadFile = async (file: File, campo: 'comprobante' | 'complemento_pago') => {
    setUploading(campo)
    const ext  = file.name.split('.').pop()
    const path = `op-${op.id}/${campo}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('cxp-docs').upload(path, file, { upsert: true })
    if (upErr) { alert('Error al subir archivo: ' + upErr.message); setUploading(null); return }
    const { data: { publicUrl } } = supabase.storage.from('cxp-docs').getPublicUrl(path)
    setForm(f => ({ ...f, [campo]: publicUrl }))
    setUploading(null)
  }

  const handleSave = async () => {
    if (!form.monto || Number(form.monto) <= 0) { setError('El monto del pago es obligatorio'); return }
    if (Number(form.monto) > saldoActual + 0.01) { setError(`El pago no puede exceder el saldo (${fmt(saldoActual)})`); return }
    setSaving(true); setError('')

    const montoAbono     = Number(form.monto)
    const cuentaId       = form.id_cuenta_bancaria_fk ? Number(form.id_cuenta_bancaria_fk) : null

    const { data: abonoData, error: err } = await dbComp.from('cxp_abonos').insert({
      id_op_fk:              op.id,
      fecha_abono:           form.fecha_abono,
      monto:                 montoAbono,
      forma_pago:            form.forma_pago,
      id_cuenta_bancaria_fk: cuentaId,
      referencia:            form.referencia.trim() || null,
      notas:                 form.notas.trim() || null,
      comprobante:           form.comprobante || null,
      complemento_pago:      form.complemento_pago || null,
      created_by:            authUser?.nombre ?? null,
    }).select('id').single()
    if (err) { setError(err.message); setSaving(false); return }

    // Actualizar monto_pagado, saldo y status en ordenes_pago
    const nuevoMontoPagado = (op.monto_pagado ?? 0) + montoAbono
    const nuevoSaldo       = (op.monto ?? 0) - nuevoMontoPagado
    const nuevoStatus      = nuevoSaldo <= 0.01 ? 'Pagada' : 'Abonada'

    await dbComp.from('ordenes_pago').update({
      monto_pagado: nuevoMontoPagado,
      saldo:        Math.max(nuevoSaldo, 0),
      status:       nuevoStatus,
      ...(nuevoStatus === 'Pagada' ? {
        fecha_pago:      form.fecha_abono,
        referencia_pago: form.referencia.trim() || null,
      } : {}),
    }).eq('id', op.id)

    // Movimiento bancario: actualizar saldo de cuenta origen
    if (cuentaId) {
      try {
        const { dbCfg } = await import('@/lib/supabase')
        const { data: cuentaRow } = await dbCfg.from('cuentas_bancarias')
          .select('saldo').eq('id', cuentaId).single()
        const saldoAntes   = (cuentaRow as any)?.saldo ?? 0
        const saldoDespues = saldoAntes - montoAbono   // puede ser negativo
        await Promise.all([
          dbComp.from('movimientos_bancarios').insert({
            id_cuenta_fk:     cuentaId,
            id_op_fk:         op.id,
            id_abono_fk:      abonoData?.id ?? null,
            tipo:             'Cargo',
            monto:            montoAbono,
            saldo_antes:      saldoAntes,
            saldo_despues:    saldoDespues,
            concepto:         `Pago OP ${op.folio}`,
            referencia:       form.referencia.trim() || null,
            fecha_movimiento: form.fecha_abono,
            created_by:       authUser?.nombre ?? null,
          }),
          dbCfg.from('cuentas_bancarias').update({
            saldo:      saldoDespues,
            updated_at: new Date().toISOString(),
          }).eq('id', cuentaId),
        ])
      } catch (_) { /* no bloquear si falla el movimiento */ }
    }

    setSaving(false)
    setShowForm(false)
    setForm(f => ({ ...f, monto: '', referencia: '', notas: '', comprobante: '', complemento_pago: '', id_cuenta_bancaria_fk: '' }))
    fetchAbonos()
    onClose()
  }

  // Botón de adjunto genérico
  const FileBtn = ({ campo, label, accept, refEl }: {
    campo: 'comprobante' | 'complemento_pago'
    label: string
    accept: string
    refEl: React.RefObject<HTMLInputElement>
  }) => (
    <div>
      <label className="label">{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input ref={refEl} type="file" accept={accept} style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) uploadFile(e.target.files[0], campo) }} />
        {form[campo] ? (
          <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center' }}>
            <a href={form[campo]} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={11} /> Ver archivo
            </a>
            <button className="btn-ghost" style={{ padding: '2px 6px', fontSize: 11, color: '#dc2626' }}
              onClick={() => setForm(f => ({ ...f, [campo]: '' }))}>
              <Trash2 size={11} />
            </button>
          </div>
        ) : (
          <button className="btn-secondary" style={{ fontSize: 11, flex: 1 }}
            onClick={() => refEl.current?.click()}
            disabled={uploading === campo}>
            {uploading === campo ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
            {uploading === campo ? 'Subiendo…' : 'Adjuntar'}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{op.folio}</span>
              <StatusBadge status={op.status} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{op._provNombre ?? '—'} · {op.concepto ?? '—'}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Saldo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
          {[
            { label: 'Total OP',  value: fmt(op.monto),             color: 'var(--text-primary)' },
            { label: 'Pagado',    value: fmt(op.monto_pagado ?? 0), color: '#15803d' },
            { label: 'Saldo',     value: fmt(saldoActual),          color: 'var(--blue)' },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: '12px 20px', textAlign: 'center', borderRight: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Documentos de la OP (PDF + XML vienen de la Orden de Pago) */}
        {(op.pdf_factura || op.xml_factura) && (
          <div style={{ padding: '10px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, background: '#fafafa' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Factura:</span>
            {op.pdf_factura && (
              <a href={op.pdf_factura} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                  background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, textDecoration: 'none' }}>
                <FileText size={11} /> PDF Factura
              </a>
            )}
            {op.xml_factura && (
              <a href={op.xml_factura} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                  background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, textDecoration: 'none' }}>
                <FileText size={11} /> XML Factura
              </a>
            )}
            {!op.pdf_factura && !op.xml_factura && (
              <span style={{ fontSize: 11, color: '#d97706' }}>Sin documentos adjuntos — edita la OP para subirlos</span>
            )}
          </div>
        )}

        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 220px)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Historial de abonos */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Historial de Pagos ({abonos.length})
              </div>
              {op.status !== 'Pagada' && (
                <button className="btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(f => !f)}>
                  <Plus size={12} /> Registrar Pago
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 24 }}><RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></div>
            ) : abonos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>Sin pagos registrados</div>
            ) : abonos.map(a => (
              <div key={a.id} className="card" style={{ padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>{fmt(a.monto)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {fmtFecha(a.fecha_abono)} · {a.forma_pago}
                      {a.referencia && <span style={{ marginLeft: 6, fontFamily: 'monospace' }}>Ref: {a.referencia}</span>}
                      {a.id_cuenta_bancaria_fk && cuentasBanc.length > 0 && (() => {
                        const cb = cuentasBanc.find(c => c.id === a.id_cuenta_bancaria_fk)
                        return cb ? <span style={{ marginLeft: 6, color: '#0f766e' }}>🏦 {cb.banco}{cb.numero_cuenta ? ` ···${cb.numero_cuenta.slice(-4)}` : ''}</span> : null
                      })()}
                    </div>
                  </div>
                  {/* Archivos del abono */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {/* Compat. con registros anteriores que tenían pdf/xml en el abono */}
                    {a.pdf_factura && (
                      <a href={a.pdf_factura} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, textDecoration: 'none' }}>
                        <FileText size={10} /> PDF Factura
                      </a>
                    )}
                    {a.xml_factura && (
                      <a href={a.xml_factura} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 6, textDecoration: 'none' }}>
                        <FileText size={10} /> XML
                      </a>
                    )}
                    {a.comprobante && (
                      <a href={a.comprobante} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: '#eff6ff', color: 'var(--blue)', border: '1px solid #bfdbfe', borderRadius: 6, textDecoration: 'none' }}>
                        <CheckCircle size={10} /> Comprobante
                      </a>
                    )}
                    {a.complemento_pago && (
                      <a href={a.complemento_pago} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: '#fdf4ff', color: '#7c3aed', border: '1px solid #e9d5ff', borderRadius: 6, textDecoration: 'none' }}>
                        <FileText size={10} /> Complemento SAT
                      </a>
                    )}
                  </div>
                </div>
                {a.notas && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{a.notas}</div>}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Registrado por: {a.created_by ?? '—'}</div>
              </div>
            ))}
          </div>

          {/* Formulario nuevo pago */}
          {showForm && (
            <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>
                  Registrar Pago · Saldo: {fmt(saldoActual)}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600, color: 'var(--blue)' }}>
                  <input type="checkbox" checked={pagoTotal}
                    onChange={e => {
                      setPagoTotal(e.target.checked)
                      setForm(f => ({ ...f, monto: e.target.checked ? saldoActual.toString() : '' }))
                    }} />
                  Pago total
                </label>
              </div>
              {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div><label className="label">Fecha *</label>
                  <input className="input" type="date" value={form.fecha_abono} onChange={setF('fecha_abono')} />
                </div>
                <div><label className="label">Monto *</label>
                  <input className="input" type="number" step="0.01" value={form.monto}
                    disabled={pagoTotal}
                    onChange={e => { setPagoTotal(false); setForm(f => ({ ...f, monto: e.target.value })) }}
                    style={{ textAlign: 'right', background: pagoTotal ? '#f8fafc' : undefined }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div><label className="label">Forma de Pago</label>
                  <select className="select" value={form.forma_pago} onChange={setF('forma_pago')}>
                    <option value="">— Seleccionar —</option>
                    {formasPago.length > 0
                      ? formasPago.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)
                      : FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)
                    }
                  </select>
                </div>
                <div><label className="label">No. Referencia / Transferencia</label>
                  <input className="input" value={form.referencia} onChange={setF('referencia')}
                    style={{ fontFamily: 'monospace' }} placeholder="ej. 202503240001" />
                </div>
              </div>

              {/* Cuenta bancaria origen */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label className="label">Cuenta Bancaria Origen</label>
                  <select className="select" value={form.id_cuenta_bancaria_fk} onChange={setF('id_cuenta_bancaria_fk')}>
                    <option value="">— Sin especificar —</option>
                    {cuentasBanc.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.banco}{c.numero_cuenta ? ` · ${c.numero_cuenta}` : ''}{c.clabe ? ` · CLABE: ${c.clabe.slice(-4)}` : ''} · Saldo: {fmt(c.saldo ?? 0)}
                      </option>
                    ))}
                  </select>
                  {form.id_cuenta_bancaria_fk && (() => {
                    const cb = cuentasBanc.find(c => c.id === Number(form.id_cuenta_bancaria_fk))
                    return cb ? (
                      <div style={{ marginTop: 6, padding: '6px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#15803d' }}>Saldo disponible: <strong>{fmt(cb.saldo ?? 0)}</strong></span>
                        {Number(form.monto) > (cb.saldo ?? 0) && (
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠ Saldo insuficiente</span>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
              </div>

              {/* ── Documentos del pago ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <FileBtn
                  campo="comprobante"
                  label="Comprobante de Pago"
                  accept=".pdf,.jpg,.jpeg,.png"
                  refEl={comprobanteRef}
                />
                <FileBtn
                  campo="complemento_pago"
                  label="Complemento de Pago (SAT)"
                  accept=".xml,.pdf"
                  refEl={complementoPagoRef}
                />
              </div>

              <div style={{ marginBottom: 12 }}><label className="label">Notas</label>
                <textarea className="input" rows={2} value={form.notas} onChange={setF('notas')} style={{ resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving || !!uploading}>
                  {saving ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  {pagoTotal ? 'Registrar Pago Total' : 'Registrar Pago Parcial'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
