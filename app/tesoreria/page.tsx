'use client'
import {
  Landmark, FileText, Building2, ChevronRight,
  Clock
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/AuthContext'

const MODULOS = [
  {
    key:   'cxp',
    label: 'Cuentas por Pagar',
    icon:  FileText,
    color: '#C23B3B',
    desc:  'Saldos por proveedor, antigüedad de documentos y registro de pagos',
  },
  {
    key:   'cuentas-bancarias',
    label: 'Cuentas Bancarias',
    icon:  Building2,
    color: '#126B63',
    desc:  'Saldos, movimientos y administración de cuentas bancarias',
  },
  // Flujo de Caja oculto del hub (se trabaja por fuera); la ruta /tesoreria/flujo-caja sigue existiendo.
]

export default function TesoreriaPage() {
  const router = useRouter()
  const { authUser } = useAuth()
  const esAdmin = authUser?.rol === 'superadmin' || authUser?.rol === 'admin'

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader
        variant="xl"
        icon={Landmark}
        eyebrowLabel="Módulo"
        title="Tesorería"
        subtitle="Gestión de cuentas bancarias, y cuentas por pagar"
      />

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {MODULOS.filter(m => !(m as any).soloAdmin || esAdmin).map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push(`/tesoreria/${m.key}`)}
              className="card card-hover"
              style={{ padding: '22px 24px', textAlign: 'left', background: '#fff',
                border: '1px solid #E6E8EB', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 16 }}>
              <div className="icon-chip" style={{ width: 48, height: 48, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={22} style={{ color: '#1C1D21' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {m.desc}
                </div>
              </div>
              <ChevronRight size={15} style={{ color: '#C9CCD3', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>

      {/* Nota de acceso */}
      <div className="card" style={{ padding: '14px 20px', marginTop: 24, background: '#F8F9FA',
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
