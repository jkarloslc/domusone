'use client'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ColaboradoresPanel from '@/components/catalogos/ColaboradoresPanel'

export default function HRColaboradoresPage() {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => router.push('/hr')} title="Regresar"><ArrowLeft size={15} /></button>
          <div>
            <h1 className="page-title">Colaboradores</h1>
            <p className="page-subtitle">Catálogo de personal operativo — usado en OT y Rol de Pagos</p>
          </div>
        </div>
      </div>

      <ColaboradoresPanel />
    </div>
  )
}
