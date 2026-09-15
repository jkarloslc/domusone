'use client'
import { Zap } from 'lucide-react'
import ServiciosTab from '../gestion/ServiciosTab'
import PageHeader from '@/components/layout/PageHeader'

export default function ServiciosPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        variant="xl"
        icon={Zap}
        eyebrowLabel="Mantenimiento"
        title="Servicios"
        subtitle="Medidores de CFE, Agua y Gas LP: consumo y facturación por periodo"
      />

      <ServiciosTab />
    </div>
  )
}
