'use client'
import { ClipboardList } from 'lucide-react'
import OrdenesTrabajoTab from '../gestion/OrdenesTrabajoTab'
import PageHeader from '@/components/layout/PageHeader'

export default function OTResidencialPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        variant="xl"
        icon={ClipboardList}
        eyebrowLabel="Mantenimiento"
        title="OT Mantto. Fraccionamiento"
        subtitle="Órdenes de trabajo del mantenimiento residencial por cuadrante y área"
      />

      <OrdenesTrabajoTab empresa="Balvanera" modulo="mantenimiento" />
    </div>
  )
}
