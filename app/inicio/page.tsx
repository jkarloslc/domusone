'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import {
  TrendingUp, TrendingDown, Scale,
  Receipt, FileText, RefreshCw, Building2,
  ChevronRight, AlertTriangle
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { fechaLocal, inicioDelDia, finDelDia } from '@/lib/dateUtils'

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
  const now = new Date()
  const hoy = fechaLocal()
  if (p === 'hoy')    return { ini: hoy, fin: hoy }
  if (p === 'semana') {
    const d = new Date(now); d.setDate(d.getDate() - d.getDay())
    return { ini: d.toLocaleDateString('en-CA'), fin: hoy }
  }
  if (p === 'mes') {
    return { ini: new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA'), fin: hoy }
  }
  return { ini: `${now.getFullYear()}-01-01`, fin: hoy }
}

function getUltimosMeses(): { label: string; ini: string; fin: string }[] {
  const result = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    result.push({
      label: d.toLocaleDateString('es-MX', { month: 'short' }),
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
          <div style={{ width: '100%', display: 'flex', gap: 2, alignItems: 'flex-end', height: 88 }}>
            <div style={{ flex: 1, background: '#059669', borderRadius: '3px 3px 0 0',
              height: `${(d.ing / max) * 100}%`, minHeight: d.ing > 0 ? 3 : 0, transition: 'height 0.3s ease' }}
              title={`Ingresos: ${fmt(d.ing)}`} />
            <div style={{ flex: 1, background: '#dc2626', borderRadius: '3px 3px 0 0',
              height: `${(d.egr / max) * 100}%`, minHeight: d.egr > 0 ? 3 : 0, transition: 'height 0.3s ease' }}
              title={`Egresos: ${fmt(d.egr)}`} />
          </div>
          <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'capitalize' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Tipos catálogo ──────────────────────────────────────────────
type CentroIng  = { id: number; nombre: string; tipo: string | null; tipo_desglose: string }
type Seccion    = { id: number; nombre: string }
type CentroCosto = { id: number; nombre: string }
type Area       = { id: number; nombre: string; id_centro_costo_fk: number }

// ── Página ─────────────────────────────────────────────────────
export default function InicioPage() {
  const router = useRouter()

  // período
  const [periodo, setPeriodo] = useState<Periodo>('mes')

  // loading
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // datos
  const [stats, setStats] = useState({
    ingresos: 0, egresos: 0, balance: 0, cxp: 0, saldoBancos: 0, cuentas: 0,
  })
  const [grafica,    setGrafica]    = useState<{ label: string; ing: number; egr: number }[]>([])
  const [ultRecibos, setUltRecibos] = useState<any[]>([])
  const [ultOps,     setUltOps]     = useState<any[]>([])

  // catálogos
  const [centrosMap,   setCentrosMap]   = useState<Record<number, string>>({})
  const [centrosIng,   setCentrosIng]   = useState<CentroIng[]>([])
  const [secciones,    setSecciones]    = useState<Seccion[]>([])
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([])
  const [areas,        setAreas]        = useState<Area[]>([])

  // filtros INGRESOS
  const [filtroCentroIng, setFiltroCentroIng] = useState('')
  const [filtroSeccion,   setFiltroSeccion]   = useState('')

  // filtros EGRESOS
  const [filtroCC,   setFiltroCC]   = useState('')
  const [filtroArea, setFiltroArea] = useState('')

  // ── derivados ─────────────────────────────────────────────
  const centroIngSel = centrosIng.find(c => String(c.id) === filtroCentroIng)
  const esSecciones  = centroIngSel?.tipo_desglose === 'secciones'
  const areasFiltradas = filtroCC
    ? areas.filter(a => a.id_centro_costo_fk === Number(filtroCC))
    : areas
  const hayFiltroIng = !!(filtroCentroIng || filtroSeccion)
  const hayFiltroEgr = !!(filtroCC || filtroArea)

  // badges descriptivos para el subtitle
  const badgeIng = filtroSeccion
    ? `${centroIngSel?.nombre ?? ''} › ${secciones.find(s => String(s.id) === filtroSeccion)?.nombre ?? ''}`
    : centroIngSel?.nombre ?? ''
  const ccSel    = centrosCosto.find(c => String(c.id) === filtroCC)
  const arSel    = areas.find(a => String(a.id) === filtroArea)
  const badgeEgr = arSel ? `${ccSel?.nombre ?? ''} › ${arSel.nombre}` : ccSel?.nombre ?? ''

  // ── Carga catálogos UNA VEZ ───────────────────────────────
  useEffect(() => {
    Promise.all([
      dbCfg.from('centros_ingreso').select('id, nombre, tipo, tipo_desglose').eq('activo', true).order('nombre'),
      dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre'),
    ]).then(([ci, sec, cc, ar]) => {
      const csArr = (ci.data as any[]) ?? []
      const cmap: Record<number, string> = {}
      csArr.forEach((c: any) => { cmap[c.id] = c.nombre })
      setCentrosMap(cmap)
      setCentrosIng(csArr)
      setSecciones((sec.data as any[]) ?? [])
      setCentrosCosto((cc.data as any[]) ?? [])
      setAreas((ar.data as any[]) ?? [])
    })
  }, [])

  // ── Query helpers (memoizados por filtros activos) ────────
  const applyIngQ = useCallback((q: any) => {
    if (filtroCentroIng) return q.eq('id_centro_ingreso_fk', Number(filtroCentroIng))
    return q
  }, [filtroCentroIng])

  const applyEgrQ = useCallback((q: any) => {
    if (filtroCC)   q = q.eq('id_centro_costo_fk', Number(filtroCC))
    if (filtroArea) q = q.eq('id_area_fk', Number(filtroArea))
    return q
  }, [filtroCC, filtroArea])

  // ── Carga de datos (reactiva a filtros + período) ─────────
  const loadAll = useCallback(async () => {
    setRefreshing(true)
    const { ini, fin } = getRango(periodo)

    // ── INGRESOS ─────────────────────────────────────────────
    // Cuando hay filtro de sección, se consulta la tabla hija con monto parcial por sección
    let ingPromise: Promise<any>
    let ultIngPromise: Promise<any>

    if (filtroSeccion) {
      ingPromise = (dbCtrl.from('recibos_ingreso_secciones') as any)
        .select('monto, recibos_ingreso!inner(status, fecha)')
        .eq('id_seccion_fk', Number(filtroSeccion))
        .eq('recibos_ingreso.status', 'Confirmado')
        .gte('recibos_ingreso.fecha', ini)
        .lte('recibos_ingreso.fecha', fin)
      ultIngPromise = (dbCtrl.from('recibos_ingreso_secciones') as any)
        .select('monto, recibos_ingreso!inner(id, folio, fecha, status, id_centro_ingreso_fk)')
        .eq('id_seccion_fk', Number(filtroSeccion))
        .eq('recibos_ingreso.status', 'Confirmado')
        .order('id', { ascending: false })
        .limit(8)
    } else {
      const iq = applyIngQ(
        dbCtrl.from('recibos_ingreso')
          .select('monto_total').eq('status', 'Confirmado')
          .gte('fecha', ini).lte('fecha', fin)
      )
      ingPromise = iq
      const uiq = applyIngQ(
        dbCtrl.from('recibos_ingreso')
          .select('id, folio, fecha, monto_total, status, id_centro_ingreso_fk')
          .eq('status', 'Confirmado')
          .order('created_at', { ascending: false }).limit(8)
      )
      ultIngPromise = uiq
    }

    // ── EGRESOS ──────────────────────────────────────────────
    const egrQ = applyEgrQ(
      dbComp.from('ordenes_pago')
        .select('monto').neq('status', 'Cancelada')
        .gte('created_at', inicioDelDia(ini)).lte('created_at', finDelDia(fin))
    )
    const cxpQ = applyEgrQ(
      dbComp.from('ordenes_pago')
        .select('saldo, monto').neq('status', 'Cancelada').neq('status', 'Pagada')
    )
    const ultOpQ = applyEgrQ(
      dbComp.from('ordenes_pago')
        .select('id, folio, concepto, monto, saldo, status, fecha_vencimiento')
        .in('status', ['Pendiente', 'Pendiente Auth', 'Autorizada'])
    ).order('created_at', { ascending: false }).limit(5)

    const banQ = dbCfg.from('cuentas_bancarias').select('saldo').eq('activo', true)

    const [ingR, egrR, cxpR, banR, ultIngR, ultOpR] = await Promise.allSettled([
      ingPromise, egrQ, cxpQ, banQ, ultIngPromise, ultOpQ,
    ])

    // calcular ingresos según tipo de query usada
    const ingData = ingR.status === 'fulfilled' ? ingR.value.data ?? [] : []
    const ingresos = filtroSeccion
      ? ingData.reduce((a: number, r: any) => a + (r.monto ?? 0), 0)
      : ingData.reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0)

    const egresos     = (egrR.status === 'fulfilled' ? egrR.value.data ?? [] : []).reduce((a: number, r: any) => a + (r.monto ?? 0), 0)
    const cxp         = (cxpR.status === 'fulfilled' ? cxpR.value.data ?? [] : []).reduce((a: number, r: any) => a + (r.saldo ?? r.monto ?? 0), 0)
    const saldos      = banR.status === 'fulfilled' ? banR.value.data ?? [] : []
    const saldoBancos = saldos.reduce((a: number, c: any) => a + (c.saldo ?? 0), 0)

    setStats({ ingresos, egresos, balance: ingresos - egresos, cxp, saldoBancos, cuentas: saldos.length })

    // normalizar últimos recibos (shape distinto cuando viene de secciones)
    if (ultIngR.status === 'fulfilled') {
      const raw = ultIngR.value.data ?? []
      setUltRecibos(filtroSeccion
        ? raw.map((s: any) => ({
            id:                  s.recibos_ingreso?.id,
            folio:               s.recibos_ingreso?.folio,
            fecha:               s.recibos_ingreso?.fecha,
            monto_total:         s.monto,
            id_centro_ingreso_fk: s.recibos_ingreso?.id_centro_ingreso_fk,
          }))
        : raw
      )
    }
    setUltOps(ultOpR.status === 'fulfilled' ? (ultOpR.value.data ?? []) : [])

    // ── GRÁFICA últimos 6 meses ───────────────────────────────
    const meses = getUltimosMeses()
    const grafData = await Promise.all(meses.map(async m => {
      let igP: Promise<any>
      if (filtroSeccion) {
        igP = (dbCtrl.from('recibos_ingreso_secciones') as any)
          .select('monto, recibos_ingreso!inner(status, fecha)')
          .eq('id_seccion_fk', Number(filtroSeccion))
          .eq('recibos_ingreso.status', 'Confirmado')
          .gte('recibos_ingreso.fecha', m.ini)
          .lte('recibos_ingreso.fecha', m.fin)
      } else {
        igP = applyIngQ(
          dbCtrl.from('recibos_ingreso').select('monto_total')
            .eq('status', 'Confirmado').gte('fecha', m.ini).lte('fecha', m.fin)
        )
      }
      const egP = applyEgrQ(
        dbComp.from('ordenes_pago').select('monto').neq('status', 'Cancelada')
          .gte('created_at', inicioDelDia(m.ini)).lte('created_at', finDelDia(m.fin))
      )
      const [ig, eg] = await Promise.allSettled([igP, egP])
      const iData = ig.status === 'fulfilled' ? ig.value.data ?? [] : []
      const ing   = filtroSeccion
        ? iData.reduce((a: number, r: any) => a + (r.monto ?? 0), 0)
        : iData.reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0)
      const egr   = (eg.status === 'fulfilled' ? eg.value.data ?? [] : []).reduce((a: number, r: any) => a + (r.monto ?? 0), 0)
      return { label: m.label, ing, egr }
    }))
    setGrafica(grafData)
    setLoading(false)
    setRefreshing(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, filtroCentroIng, filtroSeccion, filtroCC, filtroArea])

  useEffect(() => { setLoading(true); loadAll() }, [loadAll])

  const isPositive = stats.balance >= 0

  // ── Estilos compartidos para selects de filtro ────────────
  const selStyle = (active: boolean, color: { border: string; bg: string; text: string }) => ({
    fontSize: 11, padding: '4px 8px', borderRadius: 6,
    border: `1px solid ${color.border}`,
    background: active ? color.bg : '#f8fafc',
    color: active ? color.text : 'var(--text-secondary)',
    cursor: 'pointer' as const,
  })
  const ING = { border: '#bbf7d0', bg: '#f0fdf4', text: '#15803d' }
  const EGR = { border: '#fecaca', bg: '#fef2f2', text: '#dc2626' }

  return (
    <div style={{ padding: '28px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Scale size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Panorama</span>
          </div>
          <h1 className="page-title-xl" style={{ fontSize: 30 }}>Dashboard Financiero</h1>
          <p className="page-subtitle" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            Ingresos y egresos · Balvanera
            {hayFiltroIng && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#f0fdf4',
                padding: '2px 8px', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                ⬆ {badgeIng}
              </span>
            )}
            {hayFiltroEgr && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2',
                padding: '2px 8px', borderRadius: 10, border: '1px solid #fecaca' }}>
                ⬇ {badgeEgr}
              </span>
            )}
          </p>
        </div>

        <div className="page-header-actions" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>

          {/* ── Filtro INGRESOS ─────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#059669', paddingLeft: 2 }}>
              Ingresos
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select value={filtroCentroIng}
                onChange={e => { setFiltroCentroIng(e.target.value); setFiltroSeccion('') }}
                style={{ ...selStyle(!!filtroCentroIng, ING), minWidth: 148 }}>
                <option value="">Todos los centros</option>
                {centrosIng.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              {esSecciones && (
                <select value={filtroSeccion}
                  onChange={e => setFiltroSeccion(e.target.value)}
                  style={{ ...selStyle(!!filtroSeccion, ING), minWidth: 130 }}>
                  <option value="">Todas las secciones</option>
                  {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              )}
              {hayFiltroIng && (
                <button onClick={() => { setFiltroCentroIng(''); setFiltroSeccion('') }}
                  title="Limpiar filtro ingresos"
                  style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #bbf7d0',
                    background: '#f0fdf4', color: '#16a34a', cursor: 'pointer', fontSize: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* ── Filtro EGRESOS ──────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#dc2626', paddingLeft: 2 }}>
              Egresos
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <select value={filtroCC}
                onChange={e => { setFiltroCC(e.target.value); setFiltroArea('') }}
                style={{ ...selStyle(!!filtroCC, EGR), minWidth: 148 }}>
                <option value="">Todos los CC</option>
                {centrosCosto.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              {filtroCC && (
                <select value={filtroArea}
                  onChange={e => setFiltroArea(e.target.value)}
                  style={{ ...selStyle(!!filtroArea, EGR), minWidth: 130 }}>
                  <option value="">Todas las áreas</option>
                  {areasFiltradas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              )}
              {hayFiltroEgr && (
                <button onClick={() => { setFiltroCC(''); setFiltroArea('') }}
                  title="Limpiar filtro egresos"
                  style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #fecaca',
                    background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* ── Período ─────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--text-muted)', paddingLeft: 2 }}>
              Período
            </span>
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 9, padding: 3, gap: 2 }}>
              {PERIODOS.map(p => (
                <button key={p.key} onClick={() => setPeriodo(p.key)}
                  style={{ padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 500,
                    background: periodo === p.key ? '#fff' : 'transparent',
                    color: periodo === p.key ? 'var(--blue)' : 'var(--text-muted)',
                    boxShadow: periodo === p.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-ghost" onClick={loadAll} title="Actualizar" style={{ alignSelf: 'flex-end', marginBottom: 2 }}>
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── KPIs principales ───────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Ingresos',      value: fmtK(stats.ingresos),  color: '#059669', bg: '#f0fdf4', icon: TrendingUp,   onClick: () => router.push('/ingresos/recibos') },
          { label: 'Egresos',       value: fmtK(stats.egresos),   color: '#dc2626', bg: '#fef2f2', icon: TrendingDown, onClick: () => router.push('/compras/ordenes-pago') },
          { label: 'Balance neto',  value: fmtK(Math.abs(stats.balance)), color: isPositive ? '#059669' : '#dc2626', bg: isPositive ? '#f0fdf4' : '#fef2f2', icon: Scale, onClick: undefined },
          { label: 'CXP pendiente', value: fmtK(stats.cxp),       color: '#d97706', bg: '#fffbeb', icon: FileText,     onClick: () => router.push('/tesoreria/cxp') },
          { label: 'Saldo bancos',  value: fmtK(stats.saldoBancos), color: '#0f766e', bg: '#f0fdf4', icon: Building2,  onClick: () => router.push('/tesoreria/cuentas-bancarias') },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} onClick={s.onClick} className="card"
              style={{ padding: '14px 18px', background: s.bg, display: 'flex', alignItems: 'center', gap: 12,
                cursor: s.onClick ? 'pointer' : 'default', transition: 'transform 0.1s',
                flex: '1 1 180px', maxWidth: 260 }}
              onMouseEnter={e => { if (s.onClick) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 9, background: s.color + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700,
                  color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '—' : (s.label === 'Balance neto' && !isPositive ? '-' : '') + s.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Gráfica + Resumen período ───────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 20 }}>

        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
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

        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>
              Período seleccionado
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: '#f0fdf4', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>⬆ Ingresos</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '—' : fmt(stats.ingresos)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: '#fef2f2', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>⬇ Egresos</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                  {loading ? '—' : fmt(stats.egresos)}
                </span>
              </div>
              <div style={{ height: 1, background: '#e2e8f0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', borderRadius: 8,
                background: isPositive ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${isPositive ? '#bbf7d0' : '#fecaca'}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: isPositive ? '#15803d' : '#dc2626' }}>= Balance</span>
                <span style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  color: isPositive ? '#059669' : '#dc2626' }}>
                  {loading ? '—' : (isPositive ? '' : '-') + fmt(Math.abs(stats.balance))}
                </span>
              </div>
            </div>
          </div>
          <button onClick={() => router.push('/ingresos/recibos')} className="btn-primary"
            style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}>
            <Receipt size={13} /> Nuevo Recibo
          </button>
        </div>
      </div>

      {/* ── Últimos movimientos ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Últimos recibos */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
              Últimos Recibos{filtroSeccion ? ` — ${secciones.find(s => String(s.id) === filtroSeccion)?.nombre ?? ''}` : ''}
            </div>
            <button onClick={() => router.push('/ingresos/recibos')}
              style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              Ver todos <ChevronRight size={11} />
            </button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
              <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto' }} />
            </div>
          ) : ultRecibos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
              Sin recibos en el período
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ultRecibos.map((r: any) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', padding: '7px 10px', background: '#f8fafc', borderRadius: 6 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{r.folio ?? `#${r.id}`}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {centrosMap[r.id_centro_ingreso_fk] ?? '—'} · {r.fecha ? fmtFecha(r.fecha) : '—'}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(r.monto_total ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OPs pendientes */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>OP's Pendientes</div>
              {ultOps.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px',
                  borderRadius: 20, background: '#fef2f2', color: '#dc2626' }}>
                  {ultOps.length}
                </span>
              )}
            </div>
            <button onClick={() => router.push('/compras/ordenes-pago')}
              style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              Ver todas <ChevronRight size={11} />
            </button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
              <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto' }} />
            </div>
          ) : ultOps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#15803d', fontSize: 12,
              background: '#f0fdf4', borderRadius: 8 }}>
              ✓ Sin órdenes de pago pendientes
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ultOps.map((op: any) => {
                const vencida = op.fecha_vencimiento && new Date(op.fecha_vencimiento) < new Date()
                return (
                  <div key={op.id}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 10px', borderRadius: 6,
                      background: vencida ? '#fef2f2' : '#f8fafc',
                      border: vencida ? '1px solid #fecaca' : 'none' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{op.folio ?? `#${op.id}`}</span>
                        {vencida && <AlertTriangle size={11} style={{ color: '#dc2626' }} />}
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 160,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.concepto ?? '—'}
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(op.saldo ?? op.monto ?? 0)}
                    </span>
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
