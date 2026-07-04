'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { dbGolf } from '@/lib/supabase'
import { fechaLocal, inicioDelDia, finDelDia } from '@/lib/dateUtils'
import {
  Users, Flag, MapPin, Calendar,
  Car,
  ChevronRight, ArrowRightLeft, RefreshCw, AlertTriangle,
  TrendingUp, Activity, Target,
} from 'lucide-react'

// ── Formatters ────────────────────────────────────────────────
const fmt$ = (n: number) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K'
  return fmt$(n)
}

// ── KPI state ─────────────────────────────────────────────────
type KPIs = {
  sociosActivos: number
  salidasHoy:    number
  salidasMes:    number
  cuotasVencidas: number
  montoCuotasVencidas: number
  ingresosMes:   number
  cortesPendientes: number
}

type IngresoPorCentro = { nombre: string; monto: number; id: number }

// ── Módulos del club ──────────────────────────────────────────
const MODULOS = [
  {
    key: 'reservaciones',
    label: 'Reservaciones',
    desc: 'Reservas de canchas, rangos y espacios deportivos',
    icon: Calendar,
    color: '#7c3aed',
    href: '/golf/reservaciones',
    activo: true,
  },
  {
    key: 'accesos',
    label: 'Salidas al Campo',
    desc: 'Registro de entradas, hoyo de inicio y acompañantes',
    icon: MapPin,
    color: '#16a34a',
    href: '/golf/accesos',
    activo: true,
  },
  {
    key: 'tee-practica',
    label: 'Tee de Práctica',
    desc: 'Registro de entradas y emisión de tickets — área concesionada',
    icon: Target,
    color: '#d97706',
    href: '/golf/tee-practica',
    activo: true,
  },
  {
    key: 'intercambios',
    label: 'Intercambios',
    desc: 'Cartas de intercambio para socios y catálogo de clubes convenio',
    icon: ArrowRightLeft,
    color: '#2563eb',
    href: '/golf/intercambios',
    activo: true,
  },
  {
    key: 'salidas-carritos',
    label: 'Entrada / Salida y Bitácora de Carritos',
    desc: 'Salidas a ronda de juego, regresos y bitácora del carrito',
    icon: Car,
    color: '#0d9488',
    href: '/golf/salidas-carritos',
    activo: true,
  },
  {
    key: 'torneos',
    label: 'Torneos de Golf',
    desc: 'Organización de torneos, inscripciones y resultados',
    icon: Flag,
    color: '#ca8a04',
    href: '/golf/torneos',
    activo: true,
  },
]

// ── Helpers de fecha ──────────────────────────────────────────
function getIniMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')
}

export default function GolfPage() {
  const router  = useRouter()
  const hoy     = fechaLocal()
  const iniMes  = getIniMes()

  const [kpis,     setKpis]     = useState<KPIs>({
    sociosActivos: 0, salidasHoy: 0, salidasMes: 0,
    cuotasVencidas: 0, montoCuotasVencidas: 0,
    ingresosMes: 0, cortesPendientes: 0,
  })
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadKpis = useCallback(async () => {
    setRefreshing(true)
    try {
      const [
        sociosR, salidasHoyR, salidasHoyAcompR,
        salidasMesR, salidasMesAcompR,
        cuotasR, cortesR, centrosR,
      ] = await Promise.allSettled([
        // 1. Socios activos
        dbGolf.from('cat_socios').select('id', { count: 'exact', head: true }).eq('activo', true),
        // 2. Salidas hoy — socios principales
        dbGolf.from('ctrl_accesos')
          .select('id', { count: 'exact', head: true })
          .gte('fecha_entrada', inicioDelDia(hoy))
          .lte('fecha_entrada', finDelDia(hoy)),
        // 3. Salidas hoy — acompañantes
        (dbGolf.from('ctrl_acceso_acomp') as any)
          .select('id, ctrl_accesos!inner(fecha_entrada)', { count: 'exact', head: true })
          .gte('ctrl_accesos.fecha_entrada', inicioDelDia(hoy))
          .lte('ctrl_accesos.fecha_entrada', finDelDia(hoy)),
        // 4. Salidas este mes — socios principales
        dbGolf.from('ctrl_accesos')
          .select('id', { count: 'exact', head: true })
          .gte('fecha_entrada', inicioDelDia(iniMes))
          .lte('fecha_entrada', finDelDia(hoy)),
        // 5. Salidas este mes — acompañantes
        (dbGolf.from('ctrl_acceso_acomp') as any)
          .select('id, ctrl_accesos!inner(fecha_entrada)', { count: 'exact', head: true })
          .gte('ctrl_accesos.fecha_entrada', inicioDelDia(iniMes))
          .lte('ctrl_accesos.fecha_entrada', finDelDia(hoy)),
        // 4. Cuotas vencidas (PENDIENTE + fecha_vencimiento < hoy)
        dbGolf.from('cat_cuotas')
          .select('monto_final')
          .eq('status', 'PENDIENTE')
          .lt('fecha_vencimiento', hoy),
        // 5. Cortes del mes con ingresos (agrupados por centro)
        dbGolf.from('ctrl_cortes_caja')
          .select('id_centro_fk, centro_nombre, total_ventas')
          .gte('fecha_corte', inicioDelDia(iniMes))
          .lte('fecha_corte', finDelDia(hoy)),
        // 6. Centros de venta (para orden y nombres)
        dbGolf.from('cat_centros_venta').select('id, nombre').eq('activo', true).order('orden'),
      ])

      // Socios activos
      const sociosActivos = sociosR.status === 'fulfilled' ? (sociosR.value.count ?? 0) : 0

      // Salidas (socios principales + acompañantes)
      const salidasHoy = (salidasHoyR.status === 'fulfilled' ? (salidasHoyR.value.count ?? 0) : 0)
                       + (salidasHoyAcompR.status === 'fulfilled' ? (salidasHoyAcompR.value.count ?? 0) : 0)
      const salidasMes = (salidasMesR.status === 'fulfilled' ? (salidasMesR.value.count ?? 0) : 0)
                       + (salidasMesAcompR.status === 'fulfilled' ? (salidasMesAcompR.value.count ?? 0) : 0)

      // Cuotas vencidas
      const cuotasData = cuotasR.status === 'fulfilled' ? (cuotasR.value.data ?? []) : []
      const cuotasVencidas = cuotasData.length
      const montoCuotasVencidas = cuotasData.reduce((a: number, c: any) => a + (c.monto_final ?? 0), 0)

      // Ingresos por centro de venta del mes
      const cortesData  = cortesR.status === 'fulfilled' ? (cortesR.value.data ?? []) : []
      const centrosData = centrosR.status === 'fulfilled' ? (centrosR.value.data ?? []) : []

      // Agrupar por centro_nombre
      const porCentro: Record<string, { monto: number; id: number }> = {}
      cortesData.forEach((c: any) => {
        const key = c.centro_nombre ?? `Centro #${c.id_centro_fk}`
        if (!porCentro[key]) porCentro[key] = { monto: 0, id: c.id_centro_fk }
        porCentro[key].monto += (c.total_ventas ?? 0)
      })

      // Ordenar según cat_centros_venta orden
      const centrosOrden: Record<number, number> = {}
      centrosData.forEach((cv: any, i: number) => { centrosOrden[cv.id] = i })
      const ingresosPorCentroArr: IngresoPorCentro[] = Object.entries(porCentro)
        .map(([nombre, { monto, id }]) => ({ nombre, monto, id }))
        .sort((a, b) => (centrosOrden[a.id] ?? 99) - (centrosOrden[b.id] ?? 99))

      const ingresosMes = ingresosPorCentroArr.reduce((a, c) => a + c.monto, 0)

      setKpis({
        sociosActivos, salidasHoy, salidasMes,
        cuotasVencidas, montoCuotasVencidas,
        ingresosMes, cortesPendientes: 0,
      })
    } catch {
      // silencioso — KPIs son opcionales
    }
    setLoading(false)
    setRefreshing(false)
  }, [hoy, iniMes])

  useEffect(() => { loadKpis() }, [loadKpis])

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Flag size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Club Golf</h1>
          <p className="page-subtitle">Administración del club — socios, operaciones de campo y servicios deportivos</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={loadKpis} title="Actualizar">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPIs ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>

        {/* Socios activos */}
        <div className="card" onClick={() => router.push('/golf/miembros')}
          style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
            flex: '1 1 160px', maxWidth: 220, cursor: 'pointer', background: '#f0f9ff',
            transition: 'transform 0.1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#3F4A7520',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={16} style={{ color: '#3F4A75' }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
              color: '#3F4A75', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? '—' : kpis.sociosActivos}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Socios activos</div>
          </div>
        </div>

        {/* Salidas hoy */}
        <div className="card" onClick={() => router.push('/golf/accesos')}
          style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
            flex: '1 1 160px', maxWidth: 220, cursor: 'pointer', background: '#f0fdf4',
            transition: 'transform 0.1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#16a34a20',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Activity size={16} style={{ color: '#16a34a' }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
              color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? '—' : kpis.salidasHoy}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Salidas hoy · <span style={{ fontWeight: 600 }}>{loading ? '—' : kpis.salidasMes}</span> en el mes
            </div>
          </div>
        </div>

        {/* Ingresos del mes */}
        <div className="card" onClick={() => router.push('/golf/pos')}
          style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
            flex: '1 1 180px', maxWidth: 240, cursor: 'pointer', background: '#f0fdf4',
            transition: 'transform 0.1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#05966920',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingUp size={16} style={{ color: '#059669' }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
              color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
              {loading ? '—' : fmtK(kpis.ingresosMes)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ingresos POS este mes</div>
          </div>
        </div>

        {/* Cuotas vencidas */}
        <div className="card" onClick={() => router.push('/golf/cxc')}
          style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
            flex: '1 1 180px', maxWidth: 240, cursor: 'pointer',
            background: kpis.cuotasVencidas > 0 ? '#fef2f2' : '#f8fafc',
            transition: 'transform 0.1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9,
            background: kpis.cuotasVencidas > 0 ? '#dc262620' : '#64748b20',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={16} style={{ color: kpis.cuotasVencidas > 0 ? '#dc2626' : '#64748b' }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700,
              color: kpis.cuotasVencidas > 0 ? '#dc2626' : '#64748b',
              fontVariantNumeric: 'tabular-nums' }}>
              {loading ? '—' : kpis.cuotasVencidas}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Cuotas vencidas
              {!loading && kpis.montoCuotasVencidas > 0 && (
                <span style={{ marginLeft: 4, fontWeight: 600,
                  color: kpis.cuotasVencidas > 0 ? '#dc2626' : 'inherit' }}>
                  · {fmtK(kpis.montoCuotasVencidas)}
                </span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Grid de módulos ─────────────────────────────────── */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
        Módulos
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => m.activo && router.push(m.href)}
              className={m.activo ? 'card card-hover' : 'card'}
              style={{
                padding: '18px 20px',
                textAlign: 'left',
                background: '#fff',
                border: '1px solid #e2e8f0',
                cursor: m.activo ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                opacity: m.activo ? 1 : 0.5,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: m.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={18} style={{ color: m.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              {m.activo
                ? <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
                : <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                    background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0',
                    flexShrink: 0, whiteSpace: 'nowrap' }}>PRÓXIMO</span>
              }
            </button>
          )
        })}
      </div>

    </div>
  )
}
