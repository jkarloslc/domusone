'use client'
import { Zap } from 'lucide-react'
import ServiciosTab from '@/app/residencial/mantenimiento/gestion/ServiciosTab'
import PageHeader from '@/components/layout/PageHeader'
import { AmbitoProvider } from '@/lib/AmbitoContext'

// Tablas originales (servicios_catalogo / registros): ligadas a Órdenes de Pago.
export default function ServiciosGolfPage() {
  return (
    <AmbitoProvider ambito="campo">
      <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
        <PageHeader backHref="/golf/mantto-campo"
          variant="xl"
          icon={Zap}
          eyebrowLabel="Mantto. Campo"
          title="Servicios"
          subtitle="Medidores de CFE, Agua y Gas LP: consumo y facturación por periodo"
        />
        <ServiciosTab />
      </div>
    </AmbitoProvider>
  )
}
