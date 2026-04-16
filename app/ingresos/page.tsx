'use client'
import { useState, useEffect } from 'react'
import { dbCtrl, dbCfg } from '@/lib/supabase'
import {
  TrendingUp, Receipt, Tag, ChevronRight,
  CheckCircle, Clock, Calendar, DollarSign
} from 'lucide-react'
import { useRouter } from 'next/navigation'

const fmt = (n: number) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })

const MODULOS = [
  {
    key:   'recibos',
    label: 'Recibos de Ingreso',
    icon:  Receipt,
    color: '#059669',
    desc:  'Captura diaria de ingresos por centro — Golf, Cuotas, Espacios, Caballerizas',
  },
  {
    key:   'centros',
    label: 'Centros de Ingreso',
    icon:  Tag,
    color: '#7c3aed',
    desc:  'Catálogo de centros y configuración de desglose por sección',
  },
]

export default function IngresosPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    hoy: 0, mes: 0, confirmados: 0, ultimos: [] as any[],
  })

  useEffect(() => {
    const hoy   = new Date().toISOString().slice(0, 10)
    const ini   = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

    Promise.all([
      dbCtrl.from('recibos_ingreso').select('monto_total').eq('status', 'Confirmado').eq('fecha', hoy),
      dbCtrl.from('recibos_ingreso').select('monto_total').eq('status', 'Confirmado').gte('fecha', ini),
      dbCtrl.from('recibos_ingreso').select('id', { count: 'exact', head: true }).eq('status', 'Confirmado'),
      dbCtrl.from('recibos_ingreso')
        .select('id, folio, fecha, monto_total, status, id_centro_ingreso_fk')
        .order('created_at', { ascending: false }).limit(5),
    ]).then(async ([hoyR, mesR, cntR, ultR]) => {
      const sumHoy = (hoyR.data ?? []).reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0)
      const sumMes = (mesR.data ?? []).reduce((a: number, r: any) => a + (r.monto_total ?? 0), 0)

      // Enriquecer con nombre del centro
      const centrosIds = Array.from(new Set((ultR.data ?? []).map((r: any) => r.id_centro_ingreso_fk).filter(Boolean)))
      let centrosMap: Record<number, string> = {}
      if (centrosIds.length) {
        const { data: cs } = await dbCfg.from('centros_ingreso').select('id, nombre').in('id', centrosIds)
        ;(cs ?? []).forEach((c: any) => { centrosMap[c.id] = c.nombre })
      }

      setStats({
        hoy:         sumHoy,
        mes:         sumMes,
        confirmados: cntR.count ?? 0,
        ultimos:     (ultR.data ?? []).map((r: any) => ({ ...r, centro: centrosMap[r.id_centro_ingreso_fk] ?? '—' })),
      })
    }).catch(() => {})
  }, [])

  const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
    Confirmado: { bg: '#f0fdf4', color: '#15803d' },
    Borrador:   { bg: '#fffbeb', color: '#d97706' },
    Cancelado:  { bg: '#f8fafc', color: '#94a3b8' },
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <TrendingUp size={16} style={{ color: '#059669' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Ingresos</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
          Captura de ventas diarias por centro de ingreso — Golf, Cuotas, Espacios, Caballerizas
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'Ingresos de Hoy',     value: fmt(stats.hoy),  color: '#059669', bg: '#f0fdf4', icon: Calendar },
          { label: 'Ingresos del Mes',    value: fmt(stats.mes),  color: '#2563eb', bg: '#eff6ff', icon: DollarSign },
          { label: 'Recibos Confirmados', value: stats.confirmados, color: '#7c3aed', bg: '#f5f3ff', icon: CheckCircle },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="card" style={{ padding: '14px 18px', minWidth: 180, background: s.bg, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push(`/ingresos/${m.key}`)}
              className="card card-hover"
              style={{ padding: '22px 24px', textAlign: 'left', background: 'none', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={22} style={{ color: m.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.desc}</div>
              </div>
              <ChevronRight size={15} style={{ color: '#cbd5e1', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>

      {/* Últimos recibos */}
      {stats.ultimos.length > 0 && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Últimos Recibos
            </div>
            <button onClick={() => router.push('/ingresos/recibos')} style={{ fontSize: 11, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Ver todos →
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats.ultimos.map((r: any) => {
              const sc = STATUS_COLOR[r.status] ?? { bg: '#f8fafc', color: '#64748b' }
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: '#059669' + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Receipt size={13} style={{ color: '#059669' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{r.folio ?? `#${r.id}`}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.centro} · {fmtFecha(r.fecha)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.monto_total ?? 0)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: sc.bg, color: sc.color }}>{r.status}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Nota */}
      <div className="card" style={{ padding: '14px 20px', marginTop: 16, background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Clock size={14} style={{ color: '#059669', flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: '#15803d', margin: 0 }}>
          Los recibos de ingreso se capturan manualmente por centro. Cuando Cobranza esté activa,
          los cortes de cuotas podrán alimentar este módulo automáticamente.
        </p>
      </div>

    </div>
  )
}
