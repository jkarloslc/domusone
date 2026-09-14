'use client'
import PageHeader from '@/components/layout/PageHeader'

export default function Page() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        variant="xl"
        title="Vehículos"
        subtitle="Módulo en construcción"
      />
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Este módulo se habilitará en la siguiente iteración.
      </div>
    </div>
  )
}
