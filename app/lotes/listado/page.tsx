'use client'
import { Table2 } from 'lucide-react'
import LotesTabs from '../LotesTabs'
import PageHeader from '@/components/layout/PageHeader'
import ReporteLotes from '@/app/reportes/ReporteLotes'
import { useAuth } from '@/lib/AuthContext'

export default function LotesListadoPage() {
  const { canWrite } = useAuth()
  return (
    <div className="page-pad" style={{ padding: '28px 32px', animation: 'fadeIn 0.3s ease-out' }}>
      <LotesTabs />
      <PageHeader
        variant="xl"
        icon={Table2}
        color="var(--gold)"
        eyebrowLabel="Módulo"
        title="Lotes por Sección"
        subtitle="Vista agrupada por sección con subtotales y edición rápida"
      />
      <ReporteLotes editable={canWrite('lotes')} />
    </div>
  )
}
