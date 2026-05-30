'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import {
  Wrench, ClipboardList, CheckCircle, Clock, AlertTriangle,
  Truck, RefreshCw, ChevronRight, LayoutDashboard, XCircle,
} from 'lucide-react'
import Link from 'next/link'

// ── Helpers ────────────────────────────────────────────────────
function KpiCard({ label, value, color, bg, icon: Icon, subtitle }: {
  label: string; value: string | number; color: string; bg: string
  icon: any; subtitle?: string
}) {
  return (
    <div className="card" style={{ padding: '14px 18px', background: bg,
      display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 150px', maxWidth: 230 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: color + '20',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
          color, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
        {subtitle && <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 2 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

function CumplimientoBar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 80 ? '#15803d' : pct >= 50 ? '#d97706' : '#dc2626'
  const bg    = pct >= 80 ? '#f0fdf4' : pct >= 50 ? '#fffbeb' : '#fef2f2'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 90 }}>{label}</span>
      <div style={{ flex: 1, height: 7, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color,
          borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36, textAlign: 'right',
        padding: '1px 6px', background: bg, borderRadius: 6 }}>
        {pct}%
      </span>
    </div>
  )
}

function BarChart({ data, color, unit, fmt }: {
  data: { label: string; value: number }[]
  color: string
  unit: string
  fmt?: (v: number) => string
}) {
  const max = Math.max(...data.map(d => d.value), 1)
  const fmtVal = fmt ?? ((v: number) => v.toLocaleString('es-MX', { maximumFractionDigits: 1 }))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, paddingBottom: 20, position: 'relative' }}>
      {data.map((d, i) => {
        const pct = Math.round((d.value / max) * 100)
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
            {d.value > 0 && (
              <div style={{ fontSize: 8, color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {fmtVal(d.value)}
              </div>
            )}
            <div style={{ width: '100%', height: `${pct}%`, minHeight: d.value > 0 ? 3 : 0,
              background: color, borderRadius: '3px 3px 0 0', opacity: 0.85,
              transition: 'height 0.4s ease' }} />
            <div style={{ fontSize: 9, color: 'var(--text-muted)', position: 'absolute', bottom: 0,
              left: `calc(${(i / data.length) * 100}% + ${100 / data.length / 2}%)`,
              transform: 'translateX(-50%)' }}>
              {d.label}
            </div>
          </div>
        )
      })}
      <div style={{ position: 'absolute', bottom: 18, right: 0, fontSize: 9,
        color: 'var(--text-muted)', fontWeight: 600 }}>{unit}</div>
    </div>
  )
}

function OtBloque({ titulo, empresa, color, data, loading, href }: {
  titulo: string; empresa: string; color: string
  data: { abiertas: number; completadas: number; canceladas: number; total: number }
  loading: boolean; href: string
}) {
  const activas      = data.abiertas
  const resueltas    = data.completadas
  const denominador  = data.total - data.canceladas
  const pctCumplimiento = denominador > 0 ? Math.round((resueltas / denominador) * 100) : 0
  const cumColor = pctCumplimiento >= 80 ? '#15803d' : pctCumplimiento >= 50 ? '#d97706' : '#dc2626'
  const cumBg    = pctCumplimiento >= 80 ? '#f0fdf4' : pctCumplimiento >= 50 ? '#fffbeb' : '#fef2f2'

  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: color + '20',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={13} style={{ color }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{titulo}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Órdenes de trabajo · {empresa}</div>
          </div>
        </div>
        <Link href={href} style={{ textDecoration: 'none' }}>
          <button className="btn-ghost" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            Ver todas <ChevronRight size={11} />
          </button>
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { label: 'Abiertas',    value: activas,          color: '#d97706', bg: '#fffbeb' },
              { label: 'Completadas', value: data.completadas, color: '#15803d', bg: '#f0fdf4' },
              { label: 'Canceladas',  value: data.canceladas,  color: '#94a3b8', bg: '#f8fafc' },
              { label: 'Total',       value: data.total,       color: '#1d4ed8', bg: '#eff6ff' },
            ].map(s => (
              <div key={s.label} style={{ flex: '1 1 80px', padding: '10px 12px',
                background: s.bg, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
                  color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
            background: cumBg, borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              KPI Cumplimiento
            </div>
            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pctCumplimiento}%`, background: cumColor,
                borderRadius: 3, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: cumColor, minWidth: 44, textAlign: 'right',
              fontVariantNumeric: 'tabular-nums' }}>
              {pctCumplimiento}%
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function DashboardMantenimientoPage() {
  const anio = new Date().getFullYear()
  const now  = new Date()
  const mesIni = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // Programa anual
  const [progStats, setProgStats] = useState({
    programas: 0, pendientes: 0, enProceso: 0,
    completadas: 0, omitidas: 0, cumplimiento: 0,
  })
  const [progPorMes, setProgPorMes] = useState<{ mes: string; pct: number }[]>([])

  // OTs
  const [otBalv,      setOtBalv]      = useState({ abiertas: 0, completadas: 0, canceladas: 0, total: 0 })
  const [otCuadrilla, setOtCuadrilla] = useState({ abiertas: 0, completadas: 0, canceladas: 0, total: 0 })

  // Vehículos
  const [vehiculos, setVehiculos] = useState({ total: 0, bitacorasMes: 0 })

  // Servicios
  type MesServicio = { mes: string; kwh: number; agua: number; monto: number; montoCfe: number; montoAgua: number }
  const [serviciosMes, setServiciosMes] = useState<MesServicio[]>([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  const loadAll = useCallback(async () => {
    setRefreshing(true)

    const [progR, otAllR, equiposR, bitacoraR, svcCatR, svcRegR] = await Promise.allSettled([
      // Programas del año activos
      dbCtrl.from('programas_mantenimiento').select('id').eq('anio', anio).eq('activo', true),
      // Todas las OTs (ambas empresas)
      dbCtrl.from('ordenes_trabajo').select('empresa, status'),
      // Equipos activos
      dbCfg.from('equipos').select('id', { count: 'exact', head: true }).eq('activo', true),
      // Bitácoras del mes actual
      dbCtrl.from('bitacora_equipos').select('id', { count: 'exact', head: true })
        .eq('activo', true).gte('fecha_inicio', mesIni),
      // Catálogo de servicios
      dbCtrl.from('servicios_catalogo').select('id, tipo_servicio').eq('activo', true),
      // Registros del año
      dbCtrl.from('servicios_registros')
        .select('id_servicio_fk, fecha_inicio, consumo_periodo, monto_periodo')
        .gte('fecha_inicio', `${anio}-01-01`)
        .lt('fecha_inicio',  `${anio + 1}-01-01`),
    ])

    // ── Programas y tareas (2 queries encadenadas) ──────────
    const progIds: number[] = progR.status === 'fulfilled'
      ? (progR.value.data ?? []).map((p: any) => p.id)
      : []

    let tareas: any[] = []
    if (progIds.length > 0) {
      const { data: t } = await dbCtrl.from('programa_tareas')
        .select('status, mes, id_programa_fk')
        .in('id_programa_fk', progIds)
      tareas = t ?? []
    }

    const pendientes   = tareas.filter(t => t.status === 'Pendiente').length
    const enProceso    = tareas.filter(t => t.status === 'En Proceso').length
    const completadas  = tareas.filter(t => t.status === 'Completada').length
    const omitidas     = tareas.filter(t => t.status === 'Omitida').length
    const totalTareas  = tareas.length
    const cumplimiento = totalTareas > 0 ? Math.round((completadas / totalTareas) * 100) : 0

    setProgStats({ programas: progIds.length, pendientes, enProceso, completadas, omitidas, cumplimiento })

    // Progreso por mes (meses con al menos 1 tarea)
    const mesPorPct: { mes: string; pct: number }[] = []
    for (let m = 1; m <= 12; m++) {
      const del = tareas.filter(t => t.mes === m)
      if (!del.length) continue
      const comp = del.filter(t => t.status === 'Completada').length
      mesPorPct.push({ mes: MESES_CORTO[m - 1], pct: Math.round((comp / del.length) * 100) })
    }
    setProgPorMes(mesPorPct)

    // ── OTs ────────────────────────────────────────────────
    const allOts: any[] = otAllR.status === 'fulfilled' ? otAllR.value.data ?? [] : []
    const ABIERTAS_STATUS = ['Pendiente', 'En Proceso', 'En Pausa']

    const calcOt = (empresa: string) => {
      const ots = allOts.filter(o => o.empresa === empresa)
      return {
        total:       ots.length,
        abiertas:    ots.filter(o => ABIERTAS_STATUS.includes(o.status)).length,
        completadas: ots.filter(o => o.status === 'Completada').length,
        canceladas:  ots.filter(o => o.status === 'Cancelada').length,
      }
    }
    setOtBalv(calcOt('Balvanera'))
    setOtCuadrilla(calcOt('Cuadrilla'))

    // ── Vehículos ──────────────────────────────────────────
    const total = equiposR.status === 'fulfilled' ? (equiposR.value.count ?? 0) : 0
    const bMes  = bitacoraR.status === 'fulfilled' ? (bitacoraR.value.count ?? 0) : 0
    setVehiculos({ total, bitacorasMes: bMes })

    // ── Servicios por mes ──────────────────────────────────
    const svcCat: any[]  = svcCatR.status === 'fulfilled'  ? (svcCatR.value.data  ?? []) : []
    const svcReg: any[]  = svcRegR.status === 'fulfilled'  ? (svcRegR.value.data  ?? []) : []
    const tipoMap: Record<number, string> = {}
    svcCat.forEach((c: any) => { tipoMap[c.id] = c.tipo_servicio })

    const porMes: Record<number, MesServicio> = {}
    for (let m = 1; m <= 12; m++) {
      porMes[m] = { mes: MESES_CORTO[m - 1], kwh: 0, agua: 0, monto: 0, montoCfe: 0, montoAgua: 0 }
    }
    svcReg.forEach((r: any) => {
      const m = new Date(r.fecha_inicio + 'T12:00:00').getMonth() + 1
      if (!porMes[m]) return
      const tipo = tipoMap[r.id_servicio_fk]
      const monto = Number(r.monto_periodo ?? 0)
      if (tipo === 'CFE')  { porMes[m].kwh      += Number(r.consumo_periodo ?? 0); porMes[m].montoCfe  += monto }
      if (tipo === 'Agua') { porMes[m].agua     += Number(r.consumo_periodo ?? 0); porMes[m].montoAgua += monto }
      porMes[m].monto += monto
    })
    setServiciosMes(Object.values(porMes))

    setLoading(false)
    setRefreshing(false)
  }, [anio, mesIni])

  useEffect(() => { loadAll() }, [loadAll])

  const cumColor = progStats.cumplimiento >= 80 ? '#15803d' : progStats.cumplimiento >= 50 ? '#d97706' : '#dc2626'
  const cumBg    = progStats.cumplimiento >= 80 ? '#f0fdf4' : progStats.cumplimiento >= 50 ? '#fffbeb' : '#fef2f2'

  return (
    <div style={{ padding: '28px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <LayoutDashboard size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Dashboards</span>
          </div>
          <h1 className="page-title-xl" style={{ fontSize: 30 }}>Dashboard Mantenimiento</h1>
          <p className="page-subtitle">Programas · Órdenes de trabajo · Vehículos · {anio}</p>
        </div>
        <button className="btn-ghost" onClick={loadAll} title="Actualizar" style={{ alignSelf: 'flex-end' }}>
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ─── Programa Anual ──────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Programa anual · {anio}
        </div>

        {/* KPIs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          {loading ? (
            <div style={{ padding: 20, color: 'var(--text-muted)' }}>
              <RefreshCw size={14} className="animate-spin" />
            </div>
          ) : (
            <>
              <KpiCard label="Programas activos" value={progStats.programas}
                color="#1d4ed8" bg="#eff6ff" icon={ClipboardList} />
              <KpiCard label="Pendientes" value={progStats.pendientes}
                color="#d97706" bg="#fffbeb" icon={Clock} />
              <KpiCard label="En Proceso" value={progStats.enProceso}
                color="#2563eb" bg="#eff6ff" icon={Wrench} />
              <KpiCard label="Completadas" value={progStats.completadas}
                color="#15803d" bg="#f0fdf4" icon={CheckCircle} />
              <KpiCard label="Omitidas" value={progStats.omitidas}
                color="#94a3b8" bg="#f8fafc" icon={XCircle} />

              {/* KPI Cumplimiento */}
              <div className="card" style={{ padding: '14px 18px', background: cumBg,
                display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 150px', maxWidth: 230 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: cumColor + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle size={15} style={{ color: cumColor }} />
                </div>
                <div>
                  <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
                    color: cumColor }}>{progStats.cumplimiento}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Cumplimiento</div>
                  <div style={{ fontSize: 10, color: cumColor, fontWeight: 600, marginTop: 2 }}>
                    {progStats.cumplimiento >= 80 ? 'En objetivo' : progStats.cumplimiento >= 50 ? 'En seguimiento' : 'Requiere atención'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Progreso por mes */}
        {!loading && progPorMes.length > 0 && (
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
              Cumplimiento por mes
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {progPorMes.map(m => (
                <CumplimientoBar key={m.mes} pct={m.pct} label={m.mes} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── OTs Balvanera + Oitydisa ────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Órdenes de trabajo
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <OtBloque
            titulo="OT Mantto. Res" empresa="Balvanera" color="#2563eb"
            data={otBalv} loading={loading} href="/mantenimiento" />
          <OtBloque
            titulo="OT Cuadrilla" empresa="Cuadrilla" color="#7c3aed"
            data={otCuadrilla} loading={loading} href="/mantenimiento" />
        </div>
      </div>

      {/* ─── Servicios CFE / Agua ────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Servicios · {anio}
        </div>

        {/* KPIs resumen */}
        {!loading && (() => {
          const totalKwh   = serviciosMes.reduce((a, m) => a + m.kwh,   0)
          const totalAgua  = serviciosMes.reduce((a, m) => a + m.agua,  0)
          const totalMonto = serviciosMes.reduce((a, m) => a + m.monto, 0)
          return (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              {[
                { label: 'Consumo KWH acum.', value: totalKwh.toLocaleString('es-MX', { maximumFractionDigits: 0 }), unit: 'kWh', color: '#d97706', bg: '#fffbeb', icon: '⚡' },
                { label: 'Consumo Agua acum.', value: totalAgua.toLocaleString('es-MX', { maximumFractionDigits: 1 }), unit: 'm³', color: '#0891b2', bg: '#ecfeff', icon: '💧' },
                { label: 'Monto total',         value: '$' + totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 }), unit: '', color: '#059669', bg: '#f0fdf4', icon: '💰' },
              ].map(k => (
                <div key={k.label} className="card" style={{ padding: '14px 18px', background: k.bg,
                  display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 160px', maxWidth: 260 }}>
                  <div style={{ fontSize: 22 }}>{k.icon}</div>
                  <div>
                    <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700,
                      color: k.color, fontVariantNumeric: 'tabular-nums' }}>
                      {k.value} <span style={{ fontSize: 11, fontWeight: 400 }}>{k.unit}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{k.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Gráficas por mes */}
        {!loading && serviciosMes.some(m => m.kwh > 0 || m.agua > 0 || m.monto > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* KWH */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚡ Consumo KWH por mes
              </div>
              <BarChart
                data={serviciosMes.map(m => ({ label: m.mes, value: m.kwh }))}
                color="#d97706" unit="kWh"
              />
            </div>
            {/* Monto CFE */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚡ Monto CFE por mes
              </div>
              <BarChart
                data={serviciosMes.map(m => ({ label: m.mes, value: m.montoCfe }))}
                color="#f59e0b" unit="$"
                fmt={v => '$' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : v.toLocaleString('es-MX', { maximumFractionDigits: 0 }))}
              />
            </div>
            {/* Agua */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0891b2', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                💧 Consumo Agua por mes
              </div>
              <BarChart
                data={serviciosMes.map(m => ({ label: m.mes, value: m.agua }))}
                color="#0891b2" unit="m³"
              />
            </div>
            {/* Monto Agua */}
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0891b2', marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                💧 Monto Agua por mes
              </div>
              <BarChart
                data={serviciosMes.map(m => ({ label: m.mes, value: m.montoAgua }))}
                color="#0369a1" unit="$"
                fmt={v => '$' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : v.toLocaleString('es-MX', { maximumFractionDigits: 0 }))}
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── Vehículos y Maquinaria ─────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Vehículos y Maquinaria
        </div>
        <Link href="/equipo-flota" style={{ textDecoration: 'none' }}>
          <div className="card" style={{ padding: '18px 20px', cursor: 'pointer', transition: 'transform 0.1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                Flota y equipo activo
              </div>
              <ChevronRight size={14} style={{ color: '#94a3b8' }} />
            </div>
            {loading ? (
              <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: '12px 18px', background: '#f0f9ff', borderRadius: 10,
                  flex: '1 1 140px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0284c720',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Truck size={14} style={{ color: '#0284c7' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700,
                      color: '#0284c7', fontVariantNumeric: 'tabular-nums' }}>
                      {vehiculos.total}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Equipos registrados</div>
                  </div>
                </div>
                <div style={{ padding: '12px 18px', background: '#fafaf9', borderRadius: 10,
                  flex: '1 1 140px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#78716c20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Wrench size={14} style={{ color: '#78716c' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700,
                      color: '#78716c', fontVariantNumeric: 'tabular-nums' }}>
                      {vehiculos.bitacorasMes}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Servicios registrados este mes
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Link>
      </div>

    </div>
  )
}
