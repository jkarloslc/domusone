'use client'
import { useState, useEffect } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import {
  Landmark, FileText, Building2, ChevronRight,
  AlertTriangle, Clock, TrendingDown
} from 'lucide-react'
import { useRouter } from 'next/navigation'

const fmt = (n: number) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MODULOS = [
  {
    key:   'cxp',
    label: 'Cuentas por Pagar',
    icon:  FileText,
    color: '#dc2626',
    desc:  'Saldos por proveedor, antigüedad de documentos y registro de pagos',
  },
  {
    key:   'cuentas-bancarias',
    label: 'Cuentas Bancarias',
    icon:  Building2,
    color: '#0f766e',
    desc:  'Saldos, movimientos y administración de cuentas bancarias',
  },
  {
    key:   'panorama',
    label: 'Panorama Financiero',
    icon:  TrendingDown,
    color: '#2563eb',
    desc:  'Dashboard de ingresos vs egresos, balance neto y KPIs del período',
    href:  '/inicio',
  },
]

export default function TesoreriaPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalCXP:     0,
    totalVencido: 0,
    totalSaldo:   0,
    cuentas:      0,
  })

  useEffect(() => {
    Promise.all([
      dbComp.from('ordenes_pago').select('monto, saldo, fecha_vencimiento, status')
        .in('status', ['Pendiente', 'Abonada']),
      dbCfg.from('cuentas_bancarias').select('saldo').eq('activo', true),
    ]).then(([{ data: ops }, { data: cbs }]) => {
      const pendientes = ops ?? []
      const now = Date.now()
      const totalCXP     = pendientes.reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
      const totalVencido = pendientes
        .filter(o => o.fecha_vencimiento && Math.floor((now - new Date(o.fecha_vencimiento).getTime()) / 86400000) > 0)
        .reduce((a, o) => a + (o.saldo ?? o.monto ?? 0), 0)
      const totalSaldo = (cbs ?? []).reduce((a, c) => a + (c.saldo ?? 0), 0)
      setStats({
        totalCXP,
        totalVencido,
        totalSaldo,
        cuentas: (cbs ?? []).length,
      })
    })
  }, [])

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Landmark size={16} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600 }}>Tesorería</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
          Gestión de cuentas bancarias, cuentas por pagar y flujo de efectivo
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'CXP Total',           value: fmt(stats.totalCXP),     color: '#dc2626', bg: '#fef2f2',  icon: FileText     },
          { label: 'CXP Vencido',         value: fmt(stats.totalVencido), color: '#d97706', bg: '#fffbeb',  icon: AlertTriangle },
          { label: 'Saldo en Cuentas',    value: fmt(stats.totalSaldo),   color: '#0f766e', bg: '#f0fdf4',  icon: TrendingDown  },
          { label: 'Cuentas Bancarias',   value: stats.cuentas,           color: '#0891b2', bg: '#f0f9ff',  icon: Building2    },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="card" style={{
              padding: '14px 18px', minWidth: 175, background: s.bg,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 9,
                background: s.color + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} style={{ color: s.color }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700,
                  color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push((m as any).href ?? `/tesoreria/${m.key}`)}
              className="card card-hover"
              style={{ padding: '22px 24px', textAlign: 'left', background: 'none',
                border: '1px solid #e2e8f0', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12,
                background: m.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={22} style={{ color: m.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {m.desc}
                </div>
              </div>
              <ChevronRight size={15} style={{ color: '#cbd5e1', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>

      {/* Nota de acceso */}
      <div className="card" style={{ padding: '14px 20px', marginTop: 24, background: '#f8fafc',
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <Clock size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Los movimientos de <strong>Cargo</strong> se originan automáticamente al registrar pagos en Cuentas por Pagar.
          Los <strong>Abonos</strong> se registran directamente en cada cuenta bancaria.
        </p>
      </div>
    </div>
  )
}
