'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp, dbGolf, dbHip, dbCfg } from '@/lib/supabase'
import {
  TrendingUp, TrendingDown, Scale, AlertTriangle,
  ShoppingCart, Clock, Flag, Activity, RefreshCw,
  ChevronRight, LayoutDashboard, Star, CalendarDays,
} from 'lucide-react'
import Link from 'next/link'
import { fechaLocal, inicioDelDia, finDelDia } from '@/lib/dateUtils'

const fmt = (n: number) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K'
  return fmt(n)
}

function getRangoSemana() {
  const hoy = new Date()
  const ini = new Date(hoy)
  ini.setDate(hoy.getDate() - hoy.getDay())
  const iniAnt = new Date(ini)
  iniAnt.setDate(ini.getDate() - 7)
  const finAnt = new Date(ini)
  finAnt.setDate(ini.getDate() - 1)
  const toCA = (d: Date) => d.toLocaleDateString('en-CA')
  return { semActIni: toCA(ini), semActFin: fechaLocal(), semAntIni: toCA(iniAnt), semAntFin: toCA(finAnt) }
}

export default function VistaEjecutivaPage() {
  const hoy = fechaLocal()

  // Bloque 1 — Hoy
  const [ingHoy,       setIngHoy]       = useState<{ nombre: string; total: number }[]>([])
  const [ingHoyTotal,  setIngHoyTotal]  = useState(0)
  const [salidaGolf,   setSalidaGolf]   = useState(0)
  const [caballerizas, setCaballerizas] = useState({ ocupadas: 0, total: 0 })
  const [opsAlerta,    setOpsAlerta]    = useState(0)
  const [ingExpandido, setIngExpandido] = useState(false)

  // Bloque 2 — Esta semana
  const [ingSemana,       setIngSemana]       = useState<{ nombre: string; actual: number; anterior: number }[]>([])
  const [ingSemanaTotal,  setIngSemanaTotal]  = useState(0)
  const [ingSemanaAntTotal, setIngSemanaAntTotal] = useState(0)
  const [ocAbiertas,     setOcAbiertas]     = useState({ monto: 0, count: 0 })
  const [opAging,        setOpAging]        = useState({ a7: 0, a15: 0, mas15: 0, totalMonto: 0 })

  // Bloque 3 — Este mes
  const [mesStats, setMesStats] = useState({ ingresos: 0, egresos: 0, cxp: 0 })

  // Hospitality
  const [hosp, setHosp] = useState<{
    eventosRealizados: number
    eventosPorAtender: number
    proximoEvento: string | null
    ingresosMes: number
  }>({ eventosRealizados: 0, eventosPorAtender: 0, proximoEvento: null, ingresosMes: 0 })

  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadAll = useCallback(async () => {
    setRefreshing(true)
    const { semActIni, semActFin, semAntIni, semAntFin } = getRangoSemana()
    const now    = new Date()
    const mesIni = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const mesFin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA')

    const [
      centrosR, recHoyR,
      recSemActR, recSemAntR,
      golfR, golfAcompR, caballR,
      opsAlertaR, ocCntR, ocMontoR, opsPendR,
      recMesR, egrMesR, cxpR,
      hospEventosR, hospIngresosR,
    ] = await Promise.allSettled([
      dbCfg.from('centros_ingreso').select('id, nombre').eq('activo', true),
      dbCtrl.from('recibos_ingreso').select('monto_total, id_centro_ingreso_fk')
        .eq('status', 'Confirmado').eq('fecha', hoy),
      dbCtrl.from('recibos_ingreso').select('monto_total, id_centro_ingreso_fk')
        .eq('status', 'Confirmado').gte('fecha', semActIni).lte('fecha', semActFin),
      dbCtrl.from('recibos_ingreso').select('monto_total, id_centro_ingreso_fk')
        .eq('status', 'Confirmado').gte('fecha', semAntIni).lte('fecha', semAntFin),
      // Accesos hoy (socios principales)
      dbGolf.from('ctrl_accesos').select('id', { count: 'exact', head: true })
        .gte('fecha_entrada', inicioDelDia(hoy))
        .lte('fecha_entrada', finDelDia(hoy)),
      // Acompañantes de accesos hoy (inner join vía FK)
      (dbGolf.from('ctrl_acceso_acomp') as any)
        .select('id, ctrl_accesos!inner(fecha_entrada)', { count: 'exact', head: true })
        .gte('ctrl_accesos.fecha_entrada', inicioDelDia(hoy))
        .lte('ctrl_accesos.fecha_entrada', finDelDia(hoy)),
      dbHip.from('cat_caballerizas').select('status'),
      dbComp.from('ordenes_pago').select('id', { count: 'exact', head: true })
        .in('status', ['Pendiente', 'Pendiente Auth', 'Pendiente Auth Finanzas']).lt('fecha_vencimiento', hoy),
      dbComp.from('ordenes_compra').select('id', { count: 'exact', head: true })
        .in('status', ['Autorizada', 'Recibida Parcial']),
      dbComp.from('ordenes_compra').select('total')
        .in('status', ['Autorizada', 'Recibida Parcial']),
      dbComp.from('ordenes_pago').select('saldo, monto, fecha_vencimiento')
        .in('status', ['Pendiente', 'Pendiente Auth', 'Pendiente Auth Finanzas', 'Autorizada'])
        .not('fecha_vencimiento', 'is', null),
      dbCtrl.from('recibos_ingreso').select('monto_total')
        .eq('status', 'Confirmado').gte('fecha', mesIni).lte('fecha', hoy),
      dbComp.from('ordenes_pago').select('monto')
        .neq('status', 'Cancelada').gte('created_at', `${mesIni}T00:00:00`),
      dbComp.from('ordenes_pago').select('saldo, monto')
        .neq('status', 'Cancelada').neq('status', 'Pagada'),
      // Hospitality
      dbCtrl.from('eventos').select('id, nombre, fecha_inicio, status')
        .in('status', ['Realizado', 'Confirmado', 'En curso'])
        .gte('fecha_inicio', mesIni)
        .lte('fecha_inicio', mesFin)
        .order('fecha_inicio')
        .limit(50),
      dbCtrl.from('eventos_ingresos').select('monto')
        .gte('fecha_pago', mesIni)
        .lte('fecha_pago', mesFin),
    ])

    // Mapa centros
    const cmap: Record<number, string> = {}
    if (centrosR.status === 'fulfilled') {
      ;(centrosR.value.data ?? []).forEach((c: any) => { cmap[c.id] = c.nombre })
    }

    // Ingresos hoy por centro
    const rawHoy = recHoyR.status === 'fulfilled' ? recHoyR.value.data ?? [] : []
    const byCentro: Record<number, number> = {}
    rawHoy.forEach((r: any) => {
      if (r.id_centro_ingreso_fk)
        byCentro[r.id_centro_ingreso_fk] = (byCentro[r.id_centro_ingreso_fk] ?? 0) + (r.monto_total ?? 0)
    })
    const ingHoyArr = Object.entries(byCentro)
      .map(([id, total]) => ({ nombre: cmap[Number(id)] ?? `Centro ${id}`, total }))
      .sort((a, b) => b.total - a.total)
    setIngHoy(ingHoyArr)
    setIngHoyTotal(ingHoyArr.reduce((s, c) => s + c.total, 0))

    // Golf accesos hoy: socios principales + acompañantes
    const golfPrincipales = golfR.status     === 'fulfilled' ? (golfR.value.count     ?? 0) : 0
    const golfAcomps      = golfAcompR.status === 'fulfilled' ? (golfAcompR.value.count ?? 0) : 0
    setSalidaGolf(golfPrincipales + golfAcomps)

    // Caballerizas
    const caballAll = caballR.status === 'fulfilled' ? caballR.value.data ?? [] : []
    const ocupadas  = caballAll.filter((c: any) => ['Rentada', 'Ocupada'].includes(c.status)).length
    setCaballerizas({ ocupadas, total: caballAll.length })

    // OPs con alerta
    setOpsAlerta(opsAlertaR.status === 'fulfilled' ? (opsAlertaR.value.count ?? 0) : 0)

    // OC abiertas
    const ocCnt   = ocCntR.status   === 'fulfilled' ? (ocCntR.value.count ?? 0) : 0
    const ocMonto = ocMontoR.status === 'fulfilled'
      ? (ocMontoR.value.data ?? []).reduce((a: number, r: any) => a + (r.total ?? 0), 0)
      : 0
    setOcAbiertas({ count: ocCnt, monto: ocMonto })

    // Ingresos semana por centro
    const rawSA: any[] = recSemActR.status === 'fulfilled' ? recSemActR.value.data ?? [] : []
    const rawSB: any[] = recSemAntR.status === 'fulfilled' ? recSemAntR.value.data ?? [] : []
    const mSA: Record<number, number> = {}
    const mSB: Record<number, number> = {}
    rawSA.forEach((r: any) => { if (r.id_centro_ingreso_fk) mSA[r.id_centro_ingreso_fk] = (mSA[r.id_centro_ingreso_fk] ?? 0) + (r.monto_total ?? 0) })
    rawSB.forEach((r: any) => { if (r.id_centro_ingreso_fk) mSB[r.id_centro_ingreso_fk] = (mSB[r.id_centro_ingreso_fk] ?? 0) + (r.monto_total ?? 0) })
    const allIds = Array.from(new Set([...Object.keys(mSA), ...Object.keys(mSB)].map(Number)))
    setIngSemana(allIds.map(id => ({ nombre: cmap[id] ?? `Centro ${id}`, actual: mSA[id] ?? 0, anterior: mSB[id] ?? 0 })).sort((a, b) => b.actual - a.actual))
    setIngSemanaTotal(rawSA.reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0))
    setIngSemanaAntTotal(rawSB.reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0))

    // OP Aging
    const todayMs = new Date(); todayMs.setHours(0, 0, 0, 0)
    const opsPend = opsPendR.status === 'fulfilled' ? opsPendR.value.data ?? [] : []
    let a7 = 0, a15 = 0, mas15 = 0, totalMonto = 0
    opsPend.forEach((op: any) => {
      const saldo = op.saldo ?? op.monto ?? 0
      totalMonto += saldo
      const venc = new Date(op.fecha_vencimiento); venc.setHours(0, 0, 0, 0)
      const dias = Math.floor((todayMs.getTime() - venc.getTime()) / 86400000)
      if (dias <= 7) a7 += saldo
      else if (dias <= 15) a15 += saldo
      else mas15 += saldo
    })
    setOpAging({ a7, a15, mas15, totalMonto })

    // Mes stats
    const ingMes = recMesR.status  === 'fulfilled' ? (recMesR.value.data ?? []).reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0) : 0
    const egrMes = egrMesR.status === 'fulfilled' ? (egrMesR.value.data ?? []).reduce((a: number, r: any) => a + (r.monto ?? 0), 0) : 0
    const cxp    = cxpR.status    === 'fulfilled' ? (cxpR.value.data ?? []).reduce((a: number, r: any) => a + (r.saldo ?? r.monto ?? 0), 0) : 0
    setMesStats({ ingresos: ingMes, egresos: egrMes, cxp })

    // Hospitality
    const hospEventos   = hospEventosR.status === 'fulfilled' ? (hospEventosR.value.data ?? []) as any[] : []
    const hospIngs      = hospIngresosR.status === 'fulfilled' ? (hospIngresosR.value.data ?? []) as any[] : []
    const realizados    = hospEventos.filter((e: any) => e.status === 'Realizado').length
    const porAtender    = hospEventos.filter((e: any) => e.status === 'Confirmado' && e.fecha_inicio >= hoy).length
    const proxEvento    = hospEventos.find((e: any) => e.status === 'Confirmado' && e.fecha_inicio >= hoy) ?? null
    setHosp({
      eventosRealizados: realizados,
      eventosPorAtender: porAtender,
      proximoEvento:     proxEvento ? proxEvento.nombre : null,
      ingresosMes:       hospIngs.reduce((a: number, r: any) => a + (r.monto ?? 0), 0),
    })

    setLoading(false)
    setRefreshing(false)
  }, [hoy])

  useEffect(() => { loadAll() }, [loadAll])

  const semBalance = ingSemanaTotal - ingSemanaAntTotal
  const semPct     = ingSemanaAntTotal > 0 ? ((semBalance / ingSemanaAntTotal) * 100).toFixed(1) : null
  const mesBalance = mesStats.ingresos - mesStats.egresos

  return (
    <div style={{ padding: '28px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <LayoutDashboard size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Dashboards</span>
          </div>
          <h1 className="page-title-xl" style={{ fontSize: 30 }}>Vista Ejecutiva</h1>
          <p className="page-subtitle">Resumen operativo del club · Balvanera</p>
        </div>
        <button className="btn-ghost" onClick={loadAll} title="Actualizar" style={{ alignSelf: 'flex-end' }}>
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ─── Bloque 1: HOY ───────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Hoy
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>

          {/* Ingresos del día */}
          <div className="card"
            style={{ padding: '16px 18px', background: '#f0fdf4', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setIngExpandido(v => !v)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: '#05966920',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={13} style={{ color: '#059669' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ingresos del día</span>
              </div>
              <ChevronRight size={13} style={{ color: '#059669',
                transform: ingExpandido ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>
            <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700,
              color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? '—' : fmtK(ingHoyTotal)}
            </div>
            {ingExpandido && !loading && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #bbf7d0' }}>
                {ingHoy.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sin ingresos hoy</div>
                ) : ingHoy.map(c => (
                  <div key={c.nombre} style={{ display: 'flex', justifyContent: 'space-between',
                    fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{c.nombre}</span>
                    <span style={{ fontWeight: 600, color: '#059669' }}>{fmtK(c.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Salidas al campo — Golf */}
          <Link href="/golf/accesos" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#16a34a20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Flag size={13} style={{ color: '#16a34a' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Salidas al campo</span>
                </div>
                <ChevronRight size={13} style={{ color: '#94a3b8' }} />
              </div>
              <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {loading ? '—' : salidaGolf}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>rondas de golf hoy</div>
            </div>
          </Link>

          {/* Caballerizas */}
          <Link href="/hipico/caballerizas" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#7c3aed20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Activity size={13} style={{ color: '#7c3aed' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Caballerizas</span>
                </div>
                <ChevronRight size={13} style={{ color: '#94a3b8' }} />
              </div>
              <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-primary)' }}>
                {loading ? '—' : `${caballerizas.ocupadas} / ${caballerizas.total}`}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>rentadas u ocupadas</div>
              {!loading && caballerizas.total > 0 && (
                <div style={{ marginTop: 8, height: 4, background: '#e2e8f0', borderRadius: 2 }}>
                  <div style={{ height: '100%', background: '#7c3aed', borderRadius: 2,
                    width: `${(caballerizas.ocupadas / caballerizas.total) * 100}%`,
                    transition: 'width 0.5s ease' }} />
                </div>
              )}
            </div>
          </Link>

          {/* OPs con alerta */}
          <Link href="/compras/ordenes-pago" style={{ textDecoration: 'none' }}>
            <div className="card"
              style={{ padding: '16px 18px', background: opsAlerta > 0 ? '#fef2f2' : undefined,
                cursor: 'pointer', transition: 'transform 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8,
                    background: opsAlerta > 0 ? '#dc262620' : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AlertTriangle size={13} style={{ color: opsAlerta > 0 ? '#dc2626' : '#94a3b8' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>OPs vencidas</span>
                </div>
                <ChevronRight size={13} style={{ color: '#94a3b8' }} />
              </div>
              <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700,
                color: opsAlerta > 0 ? '#dc2626' : '#15803d' }}>
                {loading ? '—' : opsAlerta > 0 ? opsAlerta : '✓'}
              </div>
              <div style={{ fontSize: 11, color: opsAlerta > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: 2 }}>
                {opsAlerta > 0 ? 'con alerta · ver en Compras' : 'Sin vencidos'}
              </div>
            </div>
          </Link>

          {/* Hospitality */}
          <Link href="/hospitality" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fdf4ff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Star size={13} style={{ color: '#a855f7' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hospitality</span>
                </div>
                <ChevronRight size={13} style={{ color: '#94a3b8' }} />
              </div>
              {loading ? (
                <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700 }}>—</div>
              ) : (
                <>
                  <div style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 700,
                    color: '#a855f7', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtK(hosp.ingresosMes)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    ingresos del mes
                  </div>
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3e8ff',
                    display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CalendarDays size={10} />
                        Realizados este mes
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>
                        {hosp.eventosRealizados}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <CalendarDays size={10} />
                        Por atender
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700,
                        color: hosp.eventosPorAtender > 0 ? '#a855f7' : 'var(--text-muted)' }}>
                        {hosp.eventosPorAtender}
                      </span>
                    </div>
                    {hosp.proximoEvento && (
                      <div style={{ fontSize: 10, color: '#a855f7', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={hosp.proximoEvento}>
                        ↳ {hosp.proximoEvento}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </Link>

        </div>
      </div>

      {/* ─── Bloque 2: ESTA SEMANA ───────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Esta semana
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>

          {/* Ingresos por área vs semana anterior */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                Ingresos por área
              </div>
              {semPct && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                  background: Number(semPct) >= 0 ? '#f0fdf4' : '#fef2f2',
                  color: Number(semPct) >= 0 ? '#15803d' : '#dc2626',
                  border: `1px solid ${Number(semPct) >= 0 ? '#bbf7d0' : '#fecaca'}` }}>
                  {Number(semPct) >= 0 ? '+' : ''}{semPct}% vs semana ant.
                </span>
              )}
            </div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                <RefreshCw size={16} className="animate-spin" style={{ margin: '0 auto' }} />
              </div>
            ) : ingSemana.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>
                Sin ingresos esta semana
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {ingSemana.map(row => {
                  const delta = row.actual - row.anterior
                  const pct   = row.anterior > 0 ? Math.round((delta / row.anterior) * 100) : null
                  return (
                    <div key={row.nombre} style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', padding: '6px 10px', background: '#f8fafc', borderRadius: 6 }}>
                      <span style={{ fontSize: 12 }}>{row.nombre}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {pct !== null && (
                          <span style={{ fontSize: 10, color: pct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                            {pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}%
                          </span>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#059669',
                          fontVariantNumeric: 'tabular-nums' }}>
                          {fmtK(row.actual)}
                        </span>
                      </div>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700 }}>
                  <span>Total semana</span>
                  <span style={{ color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtK(ingSemanaTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* OC abiertas — gasto comprometido */}
          <Link href="/compras/ordenes" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '18px 20px', height: '100%',
              cursor: 'pointer', transition: 'transform 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#dbeafe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShoppingCart size={13} style={{ color: '#1d4ed8' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>OC abiertas</span>
                </div>
                <ChevronRight size={13} style={{ color: '#94a3b8' }} />
              </div>
              <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
                color: '#1d4ed8', fontVariantNumeric: 'tabular-nums' }}>
                {loading ? '—' : fmtK(ocAbiertas.monto)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Gasto comprometido
              </div>
              {!loading && (
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', marginTop: 8 }}>
                  {ocAbiertas.count} OC abiertas
                </div>
              )}
            </div>
          </Link>

          {/* OP aging */}
          <Link href="/compras/ordenes-pago" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '18px 20px', height: '100%',
              cursor: 'pointer', transition: 'transform 0.1s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fffbeb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={13} style={{ color: '#d97706' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>OP's pendientes</span>
                </div>
                <ChevronRight size={13} style={{ color: '#94a3b8' }} />
              </div>
              {loading ? (
                <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { label: '0 – 7 días',    value: opAging.a7,    color: '#d97706' },
                    { label: '8 – 15 días',   value: opAging.a15,   color: '#ea580c' },
                    { label: '+ 15 días',     value: opAging.mas15, color: '#dc2626' },
                  ].map(t => (
                    <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: t.color, fontWeight: 500 }}>{t.label}</span>
                      <span style={{ fontWeight: 700, color: t.color, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtK(t.value)}
                      </span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 7,
                    display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700 }}>
                    <span>Total</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtK(opAging.totalMonto)}</span>
                  </div>
                </div>
              )}
            </div>
          </Link>

        </div>
      </div>

      {/* ─── Bloque 3: ESTE MES ──────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Este mes
        </div>
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Resumen financiero del mes
            </div>
            <Link href="/dashboards/financiero" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                Dashboard completo <ChevronRight size={11} />
              </button>
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { label: 'Ingresos',      value: mesStats.ingresos,    color: '#059669', bg: '#f0fdf4', icon: TrendingUp },
              { label: 'Egresos',       value: mesStats.egresos,     color: '#dc2626', bg: '#fef2f2', icon: TrendingDown },
              { label: 'Balance neto',  value: mesBalance,           color: mesBalance >= 0 ? '#059669' : '#dc2626', bg: mesBalance >= 0 ? '#f0fdf4' : '#fef2f2', icon: Scale },
              { label: 'CXP pendiente', value: mesStats.cxp,         color: '#d97706', bg: '#fffbeb', icon: AlertTriangle },
            ].map(k => {
              const Icon = k.icon
              return (
                <div key={k.label} style={{ flex: '1 1 160px', maxWidth: 230,
                  padding: '14px 18px', background: k.bg, borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: k.color + '20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} style={{ color: k.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700,
                      color: k.color, fontVariantNumeric: 'tabular-nums' }}>
                      {loading ? '—' : (k.label === 'Balance neto' && mesBalance < 0 ? '-' : '') + fmtK(Math.abs(k.value))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{k.label}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

    </div>
  )
}
