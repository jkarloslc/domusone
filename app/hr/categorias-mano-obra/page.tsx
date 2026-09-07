'use client'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import CategoriasManoObraPanel from '@/components/catalogos/CategoriasManoObraPanel'

export default function HRCategoriasManoObraPage() {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={() => router.push('/hr')} title="Regresar"><ArrowLeft size={15} /></button>
          <div>
            <h1 className="page-title">Categorías Mano de Obra</h1>
            <p className="page-subtitle">Sueldo diario y costo por hora de referencia por categoría</p>
          </div>
        </div>
      </div>

      <CategoriasManoObraPanel />
    </div>
  )
}
