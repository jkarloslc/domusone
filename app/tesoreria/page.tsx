'use client'
import {
  Landmark, FileText, Building2, ChevronRight,
  Clock, TrendingDown, Wallet
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'

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
    key:   'flujo-caja',
    label: 'Flujo de Caja',
    icon:  Wallet,
    color: '#7c3aed',
    desc:  'Proyección de posición de caja día a día por centro de costo y periodo',
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

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader
        variant="xl"
        icon={Landmark}
        eyebrowLabel="Módulo"
        title="Tesorería"
        subtitle="Gestión de cuentas bancarias, cuentas por pagar y flujo de efectivo"
      />

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
