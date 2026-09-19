'use client'
import { LayoutDashboard, Construction } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

export default function DashboardsPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        variant="xl"
        icon={LayoutDashboard}
        eyebrowLabel="Módulo"
        title="Dashboard"
        subtitle="Vista ejecutiva de la operación"
      />

      <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <Construction size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          En construcción
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          El nuevo dashboard se está diseñando y estará disponible próximamente.
        </p>
      </div>
    </div>
  )
}
