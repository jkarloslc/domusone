'use client'
import { Wrench } from 'lucide-react'
import OrdenesTrabajoTab from '../gestion/OrdenesTrabajoTab'
import PageHeader from '@/components/layout/PageHeader'

export default function OTGeneralesPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        variant="xl"
        icon={Wrench}
        eyebrowLabel="Mantenimiento"
        title="OT's Generales"
        subtitle="Órdenes de trabajo de la cuadrilla general por centro de costo, área y frente"
      />

      <OrdenesTrabajoTab empresa="Cuadrilla" modulo="generales" />
    </div>
  )
}
