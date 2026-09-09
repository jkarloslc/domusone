'use client'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { dbComp, dbCfg, supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { emitirValesPorPagoOP } from '@/lib/combustible'
import {
  ArrowLeft, RefreshCw, Search, Eye, X, Loader,
  Plus, Printer, FileText, Upload, Trash2, ExternalLink,
  AlertTriangle, CheckCircle, Clock, Calendar, Layers, RotateCcw
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fmt, fmtFecha, FORMAS_PAGO_COMP, StatusBadge } from '../../compras/types'
import ModalShell from '@/components/ui/ModalShell'
import { cerrarOCsDeOP } from '@/lib/cxpCascade'
import { aplicarPagoRemesa, reversarPagoRemesa } from '@/lib/pagoRemesa'

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

// ── Ciclo semanal de pago ───────────────────────────────────
// Regla de Tesorería: toda OP que entra a CxP entre martes y el lunes
// siguiente se da por recibida esa semana y se paga el martes siguiente
// (día de pago establecido).
const toDateOnly = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

const cicloDePago = (fechaEntradaISO: string | null | undefined) => {
  if (!fechaEntradaISO) return null
  const entrada = toDateOnly(new Date(fechaEntradaISO))
  const dow = entrada.getDay() // 0=Dom … 2=Mar … 6=Sáb
  const offsetAMartes = (dow - 2 + 7) % 7
  const ventanaInicio = new Date(entrada); ventanaInicio.setDate(entrada.getDate() - offsetAMartes)
  const ventanaFin = new Date(ventanaInicio); ventanaFin.setDate(ventanaInicio.getDate() + 6)
  const fechaPago = new Date(ventanaInicio); fechaPago.setDate(ventanaInicio.getDate() + 7)
  return { ventanaInicio, ventanaFin, fechaPago }
}

const fmtCorta = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }).replace('.', '')
const fmtLarga = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

function PagoBadge({ fechaPago }: { fechaPago: Date }) {
  const diff = Math.round((fechaPago.getTime() - toDateOnly(new Date()).getTime()) / 86400000)
  let label: string, color: string, bg: string, border: string
  if (diff < 0)        { label = `Atrasado · ${fmtCorta(fechaPago)}`;      color = '#b91c1c'; bg = '#fef2f2'; border = '#fecaca' }
  else if (diff === 0) { label = 'Hoy — día de pago';                     color = '#15803d'; bg = '#eafaf0'; border = '#bbf7d0' }
  else if (diff <= 7)  { label = `Martes ${fmtCorta(fechaPago)} · ${diff}d`; color = '#b45309'; bg = '#fff8ea'; border = '#fde68a' }
  else                 { label = `Martes ${fmtCorta(fechaPago)}`;          color = '#64748b'; bg = '#f1f5f9'; border = '#e2e8f0' }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
      background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>{label}</span>
  )
}

// ════════════════════════════════════════════════════════════
// Página principal CXP
// ════════════════════════════════════════════════════════════
export default function CXPPage() {
  const router = useRouter()
  const [tab, setTab]               = useState<'programacion'|'resumen'|'antigüedad'|'remesas'>('programacion')
  const [proveedores, setProvs]     = useState<any[]>([])
  const [almMap, setAlmMap]         = useState<Record<number,string>>({})
  const [ops, setOps]               = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [detailProv, setDetailProv] = useState<any | null>(null)
  const [detailOP, setDetailOP]     = useState<any | null>(null)
  const [provRefresh, setProvRefresh] = useState(0)
  const [remesas, setRemesas]           = useState<any[]>([])
  const [loadingRemesas, setLoadingRemesas] = useState(false)
  const [detailRemesa, setDetailRemesa] = useState<any | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: provs }, { data: allOps }, { data: alms }] = await Promise.all([
      dbComp.from('proveedores').select('id, nombre, rfc, condiciones_pago').eq('activo', true).order('nombre'),
      dbComp.from('ordenes_pago').select('*')
        .neq('status', 'Cancelada')
        .neq('status', 'Pendiente Auth')
        .neq('status', 'Pendiente Auth Finanzas')
        .neq('status', 'Rechazada')
        .neq('status', 'Sustituida')
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

  const fetchRemesas = useCallback(async () => {
    setLoadingRemesas(true)
    const { data: remRows } = await dbComp.from('cxp_pagos_remesa')
      .select('*, proveedores(nombre)')
      .order('created_at', { ascending: false })
    const ids = (remRows ?? []).map((r: any) => r.id)
    const countMap: Record<number, number> = {}
    if (ids.length > 0) {
      const { data: abonoRows } = await dbComp.from('cxp_abonos')
        .select('id_remesa_fk').in('id_remesa_fk', ids).eq('status', 'Aplicado')
      ;(abonoRows ?? []).forEach((a: any) => { countMap[a.id_remesa_fk] = (countMap[a.id_remesa_fk] ?? 0) + 1 })
    }
    setRemesas((remRows ?? []).map((r: any) => ({ ...r, _numOps: countMap[r.id] ?? 0 })))
    setLoadingRemesas(false)
  }, [])

  useEffect(() => { if (tab === 'remesas') fetchRemesas() }, [tab, fetchRemesas])

  const opsPendientes  = ops.filter(o => o.status !== 'Pagada' && o.status !== 'Pendiente Auth' && o.status !== 'Pendiente Auth Finanzas' && o.status !== 'Rechazada' && o.status !== 'Sustituida')
  const totalPorPagar  = opsPendientes.reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
  const totalVencido   = opsPendientes.filter(o => diasVencido(o.fecha_vencimiento) > 0)
                          .reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
  const totalPorVencer = opsPendientes.filter(o => diasVencido(o.fecha_vencimiento) <= 0)
                          .reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)

  // OPs Pendiente/Abonada agrupadas por su martes de pago programado
  const gruposPago = useMemo(() => {
    const map = new Map<string, { fechaPago: Date; ops: any[]; total: number }>()
    opsPendientes.forEach(o => {
      const ciclo = cicloDePago(o.fecha_autorizacion || o.created_at)
      if (!ciclo) return
      const key = ciclo.fechaPago.toISOString().slice(0, 10)
      if (!map.has(key)) map.set(key, { fechaPago: ciclo.fechaPago, ops: [], total: 0 })
      const g = map.get(key)!
      g.ops.push(o)
      g.total += (o.saldo ?? o.monto ?? 0)
    })
    return Array.from(map.values()).sort((a, b) => a.fechaPago.getTime() - b.fechaPago.getTime())
  }, [opsPendientes])
  const proximoPago = gruposPago[0] ?? null
  const proximoDiff  = proximoPago ? Math.round((proximoPago.fechaPago.getTime() - toDateOnly(new Date()).getTime()) / 86400000) : null
  const proximoColor = proximoDiff === null ? 'var(--text-muted)' : proximoDiff < 0 ? '#dc2626' : proximoDiff === 0 ? '#15803d' : 'var(--blue)'
  const proximoBg    = proximoDiff === null ? '#f8fafc'           : proximoDiff < 0 ? '#fef2f2' : proximoDiff === 0 ? '#f0fdf4' : 'var(--blue-pale)'

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
    { key: 'programacion', label: 'Programación de Pago' },
    { key: 'resumen',      label: 'Por Proveedor' },
    { key: 'antigüedad',   label: 'Antigüedad de Saldos' },
    { key: 'remesas',      label: 'Remesas de Pago' },
  ]

  return (
    <div style={{ padding: '32px 36px' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => router.push('/tesoreria')} title="Regresar"><ArrowLeft size={15} /></button>
          <div>
            <h1 className="page-title">Cuentas por Pagar</h1>
            <p className="page-subtitle">CXP — Saldos, antigüedad y registro de pagos</p>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={fetchData}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total por Pagar', value: fmt(totalPorPagar),  color: 'var(--blue)', bg: 'var(--blue-pale)', icon: FileText },
          { label: 'Vencido',         value: fmt(totalVencido),   color: '#dc2626',     bg: '#fef2f2',          icon: AlertTriangle },
          { label: 'Por Vencer',      value: fmt(totalPorVencer), color: '#d97706',     bg: '#fffbeb',          icon: Clock },
          { label: proximoPago ? `Próx. Pago · Martes ${fmtCorta(proximoPago.fechaPago)}` : 'Próx. Pago',
            value: proximoPago ? fmt(proximoPago.total) : '—', color: proximoColor, bg: proximoBg, icon: Calendar },
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

      {/* ── TAB: Programación de Pago (ciclo martes-lunes → martes siguiente) ── */}
      {tab === 'programacion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: '12px 18px', background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12.5, color: '#78350f' }}>
            Toda OP autorizada y enviada a CxP entre el martes y el lunes siguiente se da por recibida esa semana y se paga el martes siguiente. Los grupos de abajo se calculan automáticamente a partir de la fecha en que cada OP quedó autorizada / entró a CxP.
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 48 }}><RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></div>
          ) : gruposPago.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Sin OPs pendientes de pago</div>
          ) : gruposPago.map(g => {
            const diff = Math.round((g.fechaPago.getTime() - toDateOnly(new Date()).getTime()) / 86400000)
            const estado = diff < 0
              ? { label: `Atrasado — debió pagarse el martes ${fmtCorta(g.fechaPago)}`, color: '#b91c1c' }
              : diff === 0
                ? { label: 'Se paga HOY', color: '#15803d' }
                : { label: `En ${diff} día${diff === 1 ? '' : 's'}`, color: '#b45309' }
            return (
              <div key={g.fechaPago.toISOString()} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Martes {fmtLarga(g.fechaPago)}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: estado.color }}>{estado.label}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums' }}>{fmt(g.total)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.ops.length} OP{g.ops.length === 1 ? '' : "'s"}</div>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Folio</th><th>Proveedor</th><th>Concepto</th><th>Entró a CxP</th>
                      <th style={{ textAlign: 'right' }}>Saldo</th><th>Status</th><th style={{ width: 50 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.ops.map(op => {
                      const prov = proveedores.find(p => p.id === op.id_proveedor_fk)
                      return (
                        <tr key={op.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{op.folio}</td>
                          <td style={{ fontSize: 13 }}>{prov?.nombre ?? '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(op.fecha_autorizacion || op.created_at)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--blue)' }}>{fmt(op.saldo ?? op.monto)}</td>
                          <td><StatusBadge status={op.status} /></td>
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
            )
          })}
        </div>
      )}

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
                        <th>Vencimiento</th><th style={{ textAlign: 'right' }}>Saldo</th><th>Día de Pago</th><th style={{ width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.ops.map(op => {
                        const prov = proveedores.find(p => p.id === op.id_proveedor_fk)
                        const ciclo = cicloDePago(op.fecha_autorizacion || op.created_at)
                        return (
                          <tr key={op.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{op.folio}</td>
                            <td style={{ fontSize: 13 }}>{prov?.nombre ?? '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
                            <td style={{ fontSize: 12, color: banda.color, fontWeight: 600 }}>{fmtFecha(op.fecha_vencimiento)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: banda.color }}>{fmt(op.saldo ?? op.monto)}</td>
                            <td>{ciclo ? <PagoBadge fechaPago={ciclo.fechaPago} /> : '—'}</td>
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

      {/* ── TAB: Remesas de Pago (pagos agrupados por proveedor) ── */}
      {tab === 'remesas' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {loadingRemesas ? (
            <div style={{ textAlign: 'center', padding: 48 }}><RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></div>
          ) : remesas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
              Sin remesas de pago registradas. Se crean desde "Por Proveedor" al seleccionar varias OPs y pagarlas juntas.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Folio</th><th>Proveedor</th><th># OPs</th><th>Fecha de Pago</th>
                  <th style={{ textAlign: 'right' }}>Monto Total</th><th>Status</th><th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {remesas.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{r.folio}</td>
                    <td style={{ fontSize: 13 }}>{r.proveedores?.nombre ?? '—'}</td>
                    <td style={{ fontSize: 13, textAlign: 'center' }}>{r._numOps}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFecha(r.fecha_pago)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.status === 'Cancelada' ? 'var(--text-muted)' : 'var(--blue)' }}>{fmt(r.monto_total)}</td>
                    <td><RemesaStatusBadge status={r.status} /></td>
                    <td>
                      <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => setDetailRemesa(r)}>
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modales */}
      {detailProv && (
        <ProveedorCXP
          prov={detailProv}
          almMap={almMap}
          refreshKey={provRefresh}
          onClose={() => { setDetailProv(null); fetchData() }}
          onOpenOP={op => setDetailOP(op)}
        />
      )}
      {detailOP && (
        <OPCXPDetail
          op={detailOP}
          onClose={() => { setDetailOP(null); fetchData(); setProvRefresh(v => v + 1) }}
        />
      )}
      {detailRemesa && (
        <RemesaDetail
          remesa={detailRemesa}
          onClose={() => { setDetailRemesa(null); fetchData(); fetchRemesas(); setProvRefresh(v => v + 1) }}
        />
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// Badge de status para remesas de pago (Aplicado / Cancelada)
// ════════════════════════════════════════════════════════════
function RemesaStatusBadge({ status }: { status: string }) {
  const ok = status === 'Aplicado'
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
      background: ok ? '#f0fdf4' : '#f1f5f9', color: ok ? '#15803d' : '#64748b',
      border: `1px solid ${ok ? '#bbf7d0' : '#e2e8f0'}` }}>
      {status}
    </span>
  )
}

// ════════════════════════════════════════════════════════════
// Vista de OPs por proveedor + estado de cuenta imprimible
// ════════════════════════════════════════════════════════════
function ProveedorCXP({ prov, almMap, refreshKey, onClose, onOpenOP }: { prov: any; almMap: Record<number,string>; refreshKey: number; onClose: () => void; onOpenOP: (op: any) => void }) {
  const { canWrite } = useAuth()
  const [ops, setOps]         = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected]     = useState<Set<number>>(new Set())
  const [localRefresh, setLocalRefresh] = useState(0)
  const [showPagoRemesa, setShowPagoRemesa] = useState(false)

  useEffect(() => {
    dbComp.from('ordenes_pago').select('*')
      .eq('id_proveedor_fk', prov.id)
      .neq('status', 'Cancelada')
      .order('folio', { ascending: true })
      .then(({ data }) => { setOps(data ?? []); setLoading(false) })
  }, [prov.id, refreshKey, localRefresh])

  useEffect(() => { setSelected(new Set()) }, [prov.id, filterStatus])

  const statusDisponibles = Array.from(new Set(ops.map(o => o.status).filter(Boolean))) as string[]
  const opsFiltradas = filterStatus ? ops.filter(o => o.status === filterStatus) : ops
  const elegibles = opsFiltradas.filter(o => o.status === 'Pendiente' || o.status === 'Abonada')

  const saldoTotal  = opsFiltradas.filter(o => o.status !== 'Pagada').reduce((a,o) => a + (o.saldo ?? o.monto ?? 0), 0)
  const pagadoTotal = opsFiltradas.filter(o => o.status === 'Pagada').reduce((a,o) => a + (o.monto ?? 0), 0)

  const toggleOne = (id: number) => setSelected(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allSelected = elegibles.length > 0 && elegibles.every(o => selected.has(o.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(elegibles.map(o => o.id)))

  const opsSeleccionadas = ops.filter(o => selected.has(o.id))
  const totalSeleccionado = opsSeleccionadas.reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)

  const imprimirEC = async () => {
    let orgNombre = 'Organización', orgSubtitulo = '', orgLogo = ''
    try {
      const { data: cfgRows } = await dbCfg.from('configuracion')
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
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(`<!DOCTYPE html><html><head><title>Estado de Cuenta — ${prov.nombre}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 12px; color: #1e293b; }
        .org-header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #0D4F80; margin-bottom: 18px; }
        .org-nombre { font-size: 18px; font-weight: 700; color: #0D4F80; margin: 0 0 2px; }
        .org-sub { font-size: 11px; color: #64748b; }
        .doc-title { font-size: 14px; font-weight: 600; color: #0D4F80; margin-bottom: 2px; }
        .sub { color: #64748b; font-size: 11px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 7px 10px; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
        .total { background: #eff6ff; font-weight: 700; color: #0D4F80; }
        .venc { color: #dc2626; font-weight: 600; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="org-header">
        ${logoHtml}
        <div>
          <div class="org-nombre">${orgNombre}</div>
          ${orgSubtitulo ? `<div class="org-sub">${orgSubtitulo}</div>` : ''}
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="doc-title">Estado de Cuenta — CXP</div>
          <div class="sub" style="margin:0">Proveedor: <strong>${prov.nombre}</strong> &nbsp;·&nbsp; RFC: ${prov.rfc ?? '—'} &nbsp;·&nbsp; Fecha: ${new Date().toLocaleDateString('es-MX')}</div>
        </div>
      </div>
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
      </body></html>`)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  return (
    <>
    <ModalShell modulo="tesoreria" titulo={prov.nombre} onClose={onClose} maxWidth={1100}
    >

        <div style={{ display: 'flex', gap: 10, padding: '14px 24px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
          {[
            { label: 'Saldo Pendiente', value: fmt(saldoTotal),           color: 'var(--blue)' },
            { label: 'Pagado',          value: fmt(pagadoTotal),          color: '#15803d' },
            { label: 'Documentos',      value: String(opsFiltradas.length), color: 'var(--text-secondary)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', flex: 1, minWidth: 100 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <label className="label" style={{ margin: 0 }}>Status</label>
          <select className="select" style={{ maxWidth: 220 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Todos</option>
            {statusDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {canWrite('tesoreria') && selected.size > 0 && (
          <div style={{ padding: '10px 24px', borderBottom: '1px solid #bbf7d0', background: '#f0fdf4',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 12.5, color: '#15803d' }}>
              <strong>{selected.size}</strong> OP{selected.size === 1 ? '' : "'s"} seleccionada{selected.size === 1 ? '' : 's'} · Total <strong>{fmt(totalSeleccionado)}</strong>
              {selected.size === 1 && <span style={{ color: '#78350f', marginLeft: 8 }}>— selecciona 2 o más para pagarlas juntas en una remesa</span>}
            </div>
            <button className="btn-primary" style={{ fontSize: 12 }} disabled={selected.size < 2}
              onClick={() => setShowPagoRemesa(true)}>
              <Layers size={13} /> Pagar seleccionadas ({selected.size})
            </button>
          </div>
        )}

        <div style={{ overflowY: 'auto', maxHeight: 'calc(88vh - 200px)' }}>
          <table>
            <thead>
              <tr>
                {canWrite('tesoreria') && (
                  <th style={{ width: 30 }}>
                    <input type="checkbox" checked={allSelected} disabled={elegibles.length === 0}
                      onChange={toggleAll} title="Seleccionar todas las elegibles" />
                  </th>
                )}
                <th>Folio</th><th>Folio Factura</th><th>Concepto</th>
                <th>Vencimiento</th><th style={{ textAlign: 'right' }}>Monto</th>
                <th style={{ textAlign: 'right' }}>Pagado</th>
                <th style={{ textAlign: 'right' }}>Saldo</th>
                <th>Docs</th><th>Status</th><th>Día de Pago</th><th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 32 }}><RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
              ) : opsFiltradas.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Sin OPs con este status</td></tr>
              ) : opsFiltradas.map(op => {
                const dias = diasVencido(op.fecha_vencimiento)
                const vencido = dias > 0 && op.status !== 'Pagada'
                const esElegible = op.status === 'Pendiente' || op.status === 'Abonada'
                return (
                  <tr key={op.id}>
                    {canWrite('tesoreria') && (
                      <td>
                        {esElegible && (
                          <input type="checkbox" checked={selected.has(op.id)} onChange={() => toggleOne(op.id)} />
                        )}
                      </td>
                    )}
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{op.folio}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>{op.folio_factura ?? '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</td>
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
                      {(op.status === 'Pendiente' || op.status === 'Abonada') ? (() => {
                        const ciclo = cicloDePago(op.fecha_autorizacion || op.created_at)
                        return ciclo ? <PagoBadge fechaPago={ciclo.fechaPago} /> : '—'
                      })() : op.status === 'Pagada' ? (
                        <span style={{ fontSize: 11, color: '#15803d' }}>Pagada {fmtFecha(op.fecha_pago)}</span>
                      ) : '—'}
                    </td>
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
    </ModalShell>
    {showPagoRemesa && (
      <PagoRemesaModal
        prov={prov}
        ops={opsSeleccionadas}
        onClose={() => setShowPagoRemesa(false)}
        onSuccess={() => { setShowPagoRemesa(false); setSelected(new Set()); setLocalRefresh(v => v + 1) }}
      />
    )}
    </>
  )
}

// ════════════════════════════════════════════════════════════
// Pago agrupado (remesa): salda al 100% varias OPs del mismo
// proveedor en un solo movimiento bancario
// ════════════════════════════════════════════════════════════
function PagoRemesaModal({ prov, ops, onClose, onSuccess }: { prov: any; ops: any[]; onClose: () => void; onSuccess: () => void }) {
  const { authUser } = useAuth()
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [uploading, setUploading]     = useState<string | null>(null)
  const [formasPago, setFormasPago]   = useState<any[]>([])
  const [cuentasBanc, setCuentasBanc] = useState<any[]>([])

  const [form, setForm] = useState({
    fecha_pago:            new Date().toISOString().slice(0, 10),
    forma_pago:             'Transferencia',
    id_cuenta_bancaria_fk:  '',
    referencia:              '',
    notas:                   '',
    comprobante:             '',
    complemento_pago:        '',
  })

  const comprobanteRef     = useRef<HTMLInputElement>(null)
  const complementoPagoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('cuentas_bancarias').select('id, banco, numero_cuenta, clabe, saldo').eq('activo', true).order('banco'),
    ]).then(([{ data: fps }, { data: cbs }]) => {
      setFormasPago(fps ?? [])
      setCuentasBanc(cbs ?? [])
      if (fps && fps.length > 0) setForm(f => ({ ...f, forma_pago: f.forma_pago || fps[0].nombre }))
    })
  }, [])

  const montoTotal = ops.reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const uploadFile = async (file: File, campo: 'comprobante' | 'complemento_pago') => {
    setUploading(campo)
    const ext  = file.name.split('.').pop()
    const path = `remesa-prov${prov.id}/${campo}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('cxp-docs').upload(path, file, { upsert: true })
    if (upErr) { alert('Error al subir archivo: ' + upErr.message); setUploading(null); return }
    const { data: { publicUrl } } = supabase.storage.from('cxp-docs').getPublicUrl(path)
    setForm(f => ({ ...f, [campo]: publicUrl }))
    setUploading(null)
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await aplicarPagoRemesa({
        opIds:             ops.map(o => o.id),
        idCuentaBancaria:  form.id_cuenta_bancaria_fk ? Number(form.id_cuenta_bancaria_fk) : null,
        formaPago:         form.forma_pago,
        referencia:        form.referencia,
        comprobante:       form.comprobante || null,
        complementoPago:   form.complemento_pago || null,
        notas:             form.notas,
        fechaPago:         form.fecha_pago,
        createdBy:         authUser?.nombre ?? null,
      })
      onSuccess()
    } catch (e: any) {
      setError(e.message ?? 'No se pudo aplicar el pago')
    } finally {
      setSaving(false)
    }
  }

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
    <ModalShell modulo="tesoreria" titulo="Pago Agrupado (Remesa)" subtitulo={`${prov.nombre} · ${ops.length} OPs`}
      onClose={onClose} maxWidth={640}>
      <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 'calc(90vh - 140px)' }}>
        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr><th>Folio</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Saldo</th></tr></thead>
            <tbody>
              {ops.map(o => (
                <tr key={o.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{o.folio}</td>
                  <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.concepto ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(o.saldo ?? o.monto)}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={2} style={{ color: 'var(--blue)' }}>TOTAL A PAGAR</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 15, color: 'var(--blue)' }}>{fmt(montoTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label className="label">Fecha de Pago *</label>
            <input className="input" type="date" value={form.fecha_pago} onChange={setF('fecha_pago')} />
          </div>
          <div><label className="label">Forma de Pago</label>
            <select className="select" value={form.forma_pago} onChange={setF('forma_pago')}>
              <option value="">— Seleccionar —</option>
              {formasPago.length > 0
                ? formasPago.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)
                : FORMAS_PAGO_COMP.map(p => <option key={p}>{p}</option>)
              }
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
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
                  {montoTotal > (cb.saldo ?? 0) && <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠ Saldo insuficiente</span>}
                </div>
              ) : null
            })()}
          </div>
        </div>

        <div><label className="label">No. Referencia / Transferencia</label>
          <input className="input" value={form.referencia} onChange={setF('referencia')}
            style={{ fontFamily: 'monospace' }} placeholder="ej. 202503240001" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FileBtn campo="comprobante" label="Comprobante de Pago" accept=".pdf,.jpg,.jpeg,.png" refEl={comprobanteRef} />
          <FileBtn campo="complemento_pago" label="Complemento de Pago (SAT — REP)" accept=".xml,.pdf" refEl={complementoPagoRef} />
        </div>

        <div><label className="label">Notas</label>
          <textarea className="input" rows={2} value={form.notas} onChange={setF('notas')} style={{ resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !!uploading}>
            {saving ? <Loader size={13} className="animate-spin" /> : <Layers size={13} />}
            Aplicar Pago ({fmt(montoTotal)})
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════
// Detalle de remesa — OPs incluidas, comprobantes y reversión
// ════════════════════════════════════════════════════════════
function RemesaDetail({ remesa, onClose }: { remesa: any; onClose: () => void }) {
  const { authUser, canDelete } = useAuth()
  const [abonos, setAbonos]       = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [showReversar, setShowReversar] = useState(false)
  const [motivo, setMotivo]       = useState('')
  const [reversando, setReversando] = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    dbComp.from('cxp_abonos')
      .select('id, monto, status, ordenes_pago(id, folio, concepto, monto)')
      .eq('id_remesa_fk', remesa.id)
      .order('id', { ascending: true })
      .then(({ data }) => { setAbonos(data ?? []); setLoading(false) })
  }, [remesa.id])

  const totalActivo = abonos.filter(a => a.status === 'Aplicado').reduce((a, x) => a + (x.monto ?? 0), 0)

  const handleReversar = async () => {
    if (!motivo.trim()) { setError('Indica el motivo de la reversión'); return }
    if (!confirm(`¿Reversar la remesa ${remesa.folio}? Las OPs incluidas regresan a su status anterior y se devuelve ${fmt(remesa.monto_total)} a la cuenta bancaria. Esta acción queda registrada y no se puede deshacer.`)) return
    setReversando(true); setError('')
    try {
      await reversarPagoRemesa({ idRemesa: remesa.id, motivo, createdBy: authUser?.nombre ?? null })
      onClose()
    } catch (e: any) {
      setError(e.message ?? 'No se pudo reversar la remesa')
      setReversando(false)
    }
  }

  const imprimir = () => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;'
    document.body.appendChild(iframe)
    iframe.contentDocument!.open()
    iframe.contentDocument!.write(`<!DOCTYPE html><html><head><title>Comprobante ${remesa.folio}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; font-size: 12px; color: #1e293b; }
        .doc-title { font-size: 16px; font-weight: 700; color: #0D4F80; margin-bottom: 2px; }
        .sub { color: #64748b; font-size: 11px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        td, th { border: 1px solid #e2e8f0; padding: 7px 10px; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
        .total { background: #eff6ff; font-weight: 700; color: #0D4F80; }
        @page { margin: 1.2cm; }
      </style></head><body>
      <div class="doc-title">Comprobante de Pago Agrupado — ${remesa.folio}</div>
      <div class="sub">Proveedor: <strong>${remesa.proveedores?.nombre ?? '—'}</strong> &nbsp;·&nbsp; Fecha de pago: ${fmtFecha(remesa.fecha_pago)} &nbsp;·&nbsp; Forma de pago: ${remesa.forma_pago}${remesa.referencia ? ` &nbsp;·&nbsp; Ref: ${remesa.referencia}` : ''}</div>
      <table>
        <thead><tr><th>Folio OP</th><th>Concepto</th><th>Monto</th></tr></thead>
        <tbody>
          ${abonos.map(a => `<tr>
            <td style="font-family:monospace">${a.ordenes_pago?.folio ?? '—'}</td>
            <td>${a.ordenes_pago?.concepto ?? '—'}</td>
            <td style="text-align:right">${fmt(a.monto)}</td>
          </tr>`).join('')}
          <tr class="total"><td colspan="2">TOTAL PAGADO</td><td style="text-align:right">${fmt(remesa.monto_total)}</td></tr>
        </tbody>
      </table>
      <p style="font-size:11px;color:#64748b;margin-top:24px">Documento generado por DomusOne · ${new Date().toLocaleString('es-MX')}</p>
      </body></html>`)
    iframe.contentDocument!.close()
    setTimeout(() => {
      iframe.contentWindow!.focus()
      iframe.contentWindow!.print()
      setTimeout(() => document.body.removeChild(iframe), 2000)
    }, 300)
  }

  return (
    <ModalShell modulo="tesoreria" titulo={remesa.folio} subtitulo={remesa.proveedores?.nombre ?? '—'} onClose={onClose} maxWidth={640}>
      <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', alignItems: 'center' }}>
          <RemesaStatusBadge status={remesa.status} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Fecha de pago: {fmtFecha(remesa.fecha_pago)}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Forma: {remesa.forma_pago}</span>
          {remesa.referencia && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>Ref: {remesa.referencia}</span>}
        </div>

        {remesa.status === 'Cancelada' && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
            Reversada por <strong>{remesa.cancelado_by ?? '—'}</strong> el {fmtFecha(remesa.cancelado_at)}.
            {remesa.cancelado_motivo && <div style={{ marginTop: 4 }}>Motivo: {remesa.cancelado_motivo}</div>}
          </div>
        )}

        {error && <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#dc2626', fontSize: 12 }}>{error}</div>}

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr><th>Folio OP</th><th>Concepto</th><th style={{ textAlign: 'right' }}>Monto</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }}><RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} /></td></tr>
              ) : abonos.map(a => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--blue)', fontWeight: 600 }}>{a.ordenes_pago?.folio ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{a.ordenes_pago?.concepto ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', textDecoration: a.status === 'Cancelada' ? 'line-through' : 'none', color: a.status === 'Cancelada' ? 'var(--text-muted)' : 'inherit' }}>{fmt(a.monto)}</td>
                  <td><RemesaStatusBadge status={a.status} /></td>
                </tr>
              ))}
              <tr style={{ background: 'var(--blue-pale)', fontWeight: 700 }}>
                <td colSpan={2} style={{ color: 'var(--blue)' }}>TOTAL {remesa.status === 'Cancelada' ? 'REVERSADO' : 'PAGADO'}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 15, color: 'var(--blue)' }}>{fmt(remesa.status === 'Cancelada' ? remesa.monto_total : totalActivo)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {(remesa.comprobante) && (
            <a href={remesa.comprobante} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#eff6ff', color: 'var(--blue)', border: '1px solid #bfdbfe', borderRadius: 6, textDecoration: 'none' }}>
              <CheckCircle size={11} /> Comprobante
            </a>
          )}
          {(remesa.complemento_pago) && (
            <a href={remesa.complemento_pago} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#fdf4ff', color: '#7c3aed', border: '1px solid #e9d5ff', borderRadius: 6, textDecoration: 'none' }}>
              <FileText size={11} /> Complemento SAT
            </a>
          )}
        </div>

        {showReversar && remesa.status === 'Aplicado' && (
          <div style={{ padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Motivo de la reversión *</div>
            <textarea className="input" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
              style={{ resize: 'vertical', marginBottom: 10 }} placeholder="ej. Referencia bancaria equivocada, transferencia rechazada, etc." />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => { setShowReversar(false); setMotivo(''); setError('') }}>Cancelar</button>
              <button className="btn-primary" style={{ background: '#dc2626' }} onClick={handleReversar} disabled={reversando}>
                {reversando ? <Loader size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Confirmar Reversión
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={imprimir}><Printer size={13} /> Imprimir Comprobante</button>
          {remesa.status === 'Aplicado' && canDelete() && !showReversar && (
            <button className="btn-secondary" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={() => setShowReversar(true)}>
              <RotateCcw size={13} /> Reversar Remesa
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

// ════════════════════════════════════════════════════════════
// Detalle de OP — abonos + comprobante + complemento de pago
// ════════════════════════════════════════════════════════════
function OPCXPDetail({ op, onClose }: { op: any; onClose: () => void }) {
  const { authUser, canWrite } = useAuth()
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

    // Releer la OP desde BD: el grid puede estar desactualizado y la OP ya pagada (evita abonos duplicados)
    const { data: opBD, error: errOp } = await dbComp.from('ordenes_pago')
      .select('monto, monto_pagado, saldo, status').eq('id', op.id).single()
    if (errOp || !opBD) { setError('No se pudo verificar el estado actual de la OP: ' + (errOp?.message ?? 'sin datos')); setSaving(false); return }
    if (opBD.status === 'Pagada') { setError('Esta OP ya está pagada; no se registró el abono. Cierra y vuelve a abrir para ver los datos actualizados.'); setSaving(false); return }
    const saldoBD = opBD.saldo ?? opBD.monto ?? 0
    if (Number(form.monto) > saldoBD + 0.01) { setError(`El pago excede el saldo real de la OP (${fmt(saldoBD)}). Cierra y vuelve a abrir para ver los datos actualizados.`); setSaving(false); return }

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

    // Actualizar monto_pagado, saldo y status en ordenes_pago (con los valores releídos de BD, no los del prop)
    const nuevoMontoPagado = (opBD.monto_pagado ?? 0) + montoAbono
    const nuevoSaldo       = (opBD.monto ?? 0) - nuevoMontoPagado
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

    // OP de Combustible pagada: los vales ligados pasan de Solicitado a Emitido solos.
    if (nuevoStatus === 'Pagada') {
      await emitirValesPorPagoOP(op.id, authUser?.nombre ?? null)
      await cerrarOCsDeOP(op.id, op.id_oc_fk ?? null)
    }

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
    <ModalShell modulo="tesoreria" titulo="Modal" onClose={onClose} maxWidth={640}
    >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--blue)' }}>{op.folio}</span>
              <StatusBadge status={op.status} />
              {(op.status === 'Pendiente' || op.status === 'Abonada') && (() => {
                const ciclo = cicloDePago(op.fecha_autorizacion || op.created_at)
                return ciclo ? <PagoBadge fechaPago={ciclo.fechaPago} /> : null
              })()}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{op._provNombre ?? '—'}</div>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Concepto / datos de factura */}
        <div style={{ padding: '10px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Concepto</div>
            <div style={{ fontSize: 13 }}>{op.concepto ?? '—'}</div>
          </div>
          {op.folio_factura && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Folio Factura</div>
              <div style={{ fontSize: 13, fontFamily: 'monospace' }}>{op.folio_factura}</div>
            </div>
          )}
          {op.fecha_factura && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha Factura</div>
              <div style={{ fontSize: 13 }}>{fmtFecha(op.fecha_factura)}</div>
            </div>
          )}
          {op.subtotal != null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal</div>
              <div style={{ fontSize: 13 }}>{fmt(op.subtotal)}</div>
            </div>
          )}
          {op.iva != null && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IVA</div>
              <div style={{ fontSize: 13 }}>{fmt(op.iva)}</div>
            </div>
          )}
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
              {op.status !== 'Pagada' && canWrite('tesoreria') && (
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
    </ModalShell>
  )
}
