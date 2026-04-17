'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import {
  TrendingUp, TrendingDown, DollarSign, Scale,
  Receipt, FileText, Calendar, RefreshCw, Building2,
  ChevronRight, AlertTriangle
} from 'lucide-react'
import { useRouter } from 'next/navigation'

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K'
  return fmt(n)
}
const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

type Periodo = 'hoy' | 'semana' | 'mes' | 'anio'
const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoy',    label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes',    label: 'Este mes' },
  { key: 'anio',   label: 'Este año' },
]

function getRango(p: Periodo): { ini: string; fin: string } {
  const now  = new Date()
  const hoy  = now.toISOString().slice(0, 10)
  if (p === 'hoy')    return { ini: hoy, fin: hoy }
  if (p === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - d.getDay())
    return { ini: d.toISOString().slice(0, 10), fin: hoy }
  }
  if (p === 'mes') {
    const ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    return { ini, fin: hoy }
  }
  return { ini: `${now.getFullYear()}-01-01`, fin: hoy }
}

// Últimos 6 meses para la gráfica
function getUltimosMeses(): { label: string; key: string; ini: string; fin: string }[] {
  const result = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    result.push({
      label: d.toLocaleDateString('es-MX', { month: 'short' }),
      key:   d.toISOString().slice(0, 7),
      ini:   d.toISOString().slice(0, 10),
      fin:   fin.toISOString().slice(0, 10),
    })
  }
  return result
}

// ── Mini gráfica de barras ─────────────────────────────────────
function BarChart({ datos }: { datos: { label: string; ing: number; egr: number }[] }) {
  const max = Math.max(...datos.map(d => Math.max(d.ing, d.egr)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110, padding: '0 4px' }}>
      {datos.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {/* Barras */}
          <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 88 }}>
            <div style={{
              flex: 1, background: '#059669', borderRadius: '3px 3px 0 0',
              height: `${(d.ing / max) * 100}%`, minHeight: d.ing > 0 ? 3 : 0,
              transition: 'height 0.3s ease',
            }} title={`Ingresos: ${fmt(d.ing)}`} />
            <div style={{
              flex: 1, background: '#dc2626', borderRadius: '3px 3px 0 0',
              height: `${(d.egr / max) * 100}%`, minHeight: d.egr > 0 ? 3 : 0,
              transition: 'height 0.3s ease',
            }} title={`Egresos: ${fmt(d.egr)}`} />
          </div>
          <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────
export default function InicioPage() {
  const router  = useRouter()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    ingresos: 0, egresos: 0, balance: 0,
    cxp: 0, saldoBancos: 0, cuentas: 0,
  })
  const [grafica, setGrafica] = useState<{ label: string; ing: number; egr: number }[]>([])
  const [ultRecibos, setUltRecibos]   = useState<any[]>([])
  const [ultOps, setUltOps]           = useState<any[]>([])
  const [centrosMap, setCentrosMap]   = useState<Record<number, string>>({})
  const [refreshing, setRefreshing]   = useState(false)

  const loadAll = useCallback(async () => {
    setRefreshing(true)
    const { ini, fin } = getRango(periodo)

    // Centros de ingreso
    const { data: cs } = await dbCfg.from('centros_ingreso').select('id, nombre')
    const cmap: Record<number, string> = {}
    ;((cs as any[]) ?? []).forEach((c: any) => { cmap[c.id] = c.nombre })
    setCentrosMap(cmap)

    // Ingresos del período
    const ingQ = dbCtrl.from('recibos_ingreso')
      .select('monto_total').eq('status', 'Confirmado')
      .gte('fecha', ini).lte('fecha', fin)
    // Egresos del período (OPs pagadas + en proceso)
    const egrQ = dbComp.from('ordenes_pago')
      .select('monto').neq('status', 'Cancelada')
      .gte('created_at', ini + 'T00:00:00').lte('created_at', fin + 'T23:59:59')
    // CXP pendiente
    const cxpQ = dbComp.from('ordenes_pago')
      .select('saldo, monto').neq('status', 'Cancelada').neq('status', 'Pagada')
    // Saldo bancos
    const banQ = dbCfg.from('cuentas_bancarias').select('saldo').eq('activo', true)
    // Últimos recibos
    const ultIngQ = dbCtrl.from('recibos_ingreso')
      .select('id, folio, fecha, monto_total, status, id_centro_ingreso_fk')
      .order('created_at', { ascending: false }).limit(5)
    // Últimas OPs pendientes
    const ultOpQ = dbComp.from('ordenes_pago')
      .select('id, folio, concepto, monto, saldo, status, fecha_vencimiento')
      .in('status', ['Pendiente', 'Pendiente Auth', 'Autorizada'])
      .order('created_at', { ascending: false }).limit(5)

    const [ingR, egrR, cxpR, banR, ultIngR, ultOpR] = await Promise.allSettled([
      ingQ, egrQ, cxpQ, banQ, ultIngQ, ultOpQ
    ])

    const ingresos = (ingR.status === 'fulfilled' ? ingR.value.data ?? [] : [])
      .reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0)
    const egresos  = (egrR.status === 'fulfilled' ? egrR.value.data ?? [] : [])
      .reduce((a: number, r: any) => a + (r.monto ?? 0), 0)
    const cxp      = (cxpR.status === 'fulfilled' ? cxpR.value.data ?? [] : [])
      .reduce((a: number, r: any) => a + (r.saldo ?? r.monto ?? 0), 0)
    const saldos   = (banR.status === 'fulfilled' ? banR.value.data ?? [] : [])
    const saldoBancos = saldos.reduce((a: number, c: any) => a + (c.saldo ?? 0), 0)

    setStats({ ingresos, egresos, balance: ingresos - egresos, cxp, saldoBancos, cuentas: saldos.length })
    setUltRecibos(ultIngR.status === 'fulfilled' ? (ultIngR.value.data ?? []) : [])
    setUltOps(ultOpR.status   === 'fulfilled' ? (ultOpR.value.data  ?? []) : [])

    // Gráfica últimos 6 meses
    const meses = getUltimosMeses()
    const grafData = await Promise.all(meses.map(async m => {
      const [ig, eg] = await Promise.allSettled([
        dbCtrl.from('recibos_ingreso').select('monto_total').eq('status', 'Confirmado').gte('fecha', m.ini).lte('fecha', m.fin),
        dbComp.from('ordenes_pago').select('monto').neq('status', 'Cancelada').gte('created_at', m.ini + 'T00:00:00').lte('created_at', m.fin + 'T23:59:59'),
      ])
      const ing = (ig.status === 'fulfilled' ? ig.value.data ?? [] : []).reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0)
      const egr = (eg.status === 'fulfilled' ? eg.value.data ?? [] : []).reduce((a: number, r: any) => a + (r.monto ?? 0), 0)
      return { label: m.label, ing, egr }
    }))
    setGrafica(grafData)
    setLoading(false)
    setRefreshing(false)
  }, [periodo])

  useEffect(() => { setLoading(true); loadAll() }, [loadAll])

  const isPositive = stats.balance >= 0

  const CENTRO_COLOR: Record<string, string> = {
    golf: '#059669', cuotas: '#2563eb', rentas_espacios: '#7c3aed', caballerizas: '#d97706', otro: '#64748b',
  }

  return (
    <div style={{ padding: '28px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Scale size={16} style={{ color: 'var(--blue)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Panorama</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em' }}>Dashboard Financiero</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Ingresos y egresos de la operación de Balvanera</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Selector de período */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 9, padding: 3, gap: 2 }}>
            {PERIODOS.map(p => (
              <button key={p.key} onClick={() => setPeriodo(p.key)}
                style={{
                  padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  background: periodo === p.key ? '#fff' : 'transparent',
                  color: periodo === p.key ? 'var(--blue)' : 'var(--text-muted)',
                  boxShadow: periodo === p.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s',
                }}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn-ghost" onClick={loadAll} title="Actualizar">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPIs principales */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Ingresos',      value: fmtK(stats.ingresos), color: '#059669', bg: '#f0fdf4', icon: TrendingUp,   onClick: () => router.push('/ingresos/recibos') },
          { label: 'Egresos',       value: fmtK(stats.egresos),  color: '#dc2626', bg: '#fef2f2', icon: TrendingDown, onClick: () => router.push('/compras/ordenes-pago') },
          { label: 'Balance neto',  value: fmtK(Math.abs(stats.balance)), color: isPositive ? '#059669' : '#dc2626', bg: isPositive ? '#f0fdf4' : '#fef2f2', icon: Scale, onClick: undefined },
          { label: 'CXP pendiente', value: fmtK(stats.cxp),      color: '#d97706', bg: '#fffbeb', icon: FileText,     onClick: () => router.push('/tesoreria/cxp') },
          { label: 'Saldo bancos',  value: fmtK(stats.saldoBancos), color: '#0f766e', bg: '#f0fdf4', icon: Building2, onClick: () => router.push('/tesoreria/cuentas-bancarias') },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label}
              onClick={s.onClick}
              className="card"
              style={{
                padding: '14px 18px', background: s.bg,
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: s.onClick ? 'pointer' : 'default',
                transition: 'transform 0.1s',
                flex: '1 1 180px', maxWidth: 260,
              }}
              onMouseEnter={e => { if (s.onClick) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 9, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '—' : (s.label === 'Balance neto' && !isPositive ? '-' : '') + s.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Gráfica + Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 20 }}>

        {/* Gráfica últimos 6 meses */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                Últimos 6 meses
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Ingresos vs Egresos</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#059669', display: 'inline-block' }} /> Ingresos
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#dc2626', display: 'inline-block' }} /> Egresos
              </span>
            </div>
          </div>
          {loading ? (
            <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={18} className="animate-spin" />
            </div>
          ) : (
            <BarChart datos={grafica} />
          )}
        </div>

        {/* Balance del período */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>
              Período seleccionado
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f0fdf4', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>⬆ Ingresos</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '—' : fmt(stats.ingresos)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fef2f2', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>⬇ Egresos</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '—' : fmt(stats.egresos)}
                </span>
              </div>
              <div style={{ height: 1, background: '#e2e8f0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8,
                background: isPositive ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${isPositive ? '#bbf7d0' : '#fecaca'}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isPositive ? '#15803d' : '#dc2626' }}>= Balance</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: isPositive ? '#059669' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '—' : (isPositive ? '' : '-') + fmt(Math.abs(stats.balance))}
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => router.push('/ingresos/recibos')} className="btn-primary" style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}>
            <Receipt size={13} /> Nuevo Recibo
          </button>
        </div>
      </div>

      {/* Últimos movimientos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Últimos ingresos */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>Últimos Recibos de Ingreso</div>
            <button onClick={() => router.push('/ingresos/recibos')} style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              Ver todos <ChevronRight size={11} />
            </button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}><RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto' }} /></div>
          ) : ultRecibos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>Sin recibos capturados aún</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ultRecibos.map((r: any) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: '#f8fafc', borderRadius: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{r.folio ?? `#${r.id}`}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{centrosMap[r.id_centro_ingreso_fk] ?? '—'} · {fmtFecha(r.fecha)}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.monto_total ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OPs pendientes */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>OP's Pendientes de Pago</div>
              {ultOps.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: '#fef2f2', color: '#dc2626' }}>{ultOps.length}</span>
              )}
            </div>
            <button onClick={() => router.push('/compras/ordenes-pago')} style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              Ver todas <ChevronRight size={11} />
            </button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}><RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto' }} /></div>
          ) : ultOps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#15803d', fontSize: 12, background: '#f0fdf4', borderRadius: 8 }}>
              ✓ Sin órdenes de pago pendientes
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ultOps.map((op: any) => {
                const vencida = op.fecha_vencimiento && new Date(op.fecha_vencimiento) < new Date()
                return (
                  <div key={op.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: vencida ? '#fef2f2' : '#f8fafc', borderRadius: 6, border: vencida ? '1px solid #fecaca' : 'none' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{op.folio ?? `#${op.id}`}</span>
                        {vencida && <AlertTriangle size={11} style={{ color: '#dc2626' }} />}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.concepto ?? '—'}</div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt(op.saldo ?? op.monto ?? 0)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
