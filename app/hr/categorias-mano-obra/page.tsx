'use client'
import { useRouter } from 'next/navigation'
import CategoriasManoObraPanel from '@/components/catalogos/CategoriasManoObraPanel'

export default function HRCategoriasManoObraPage() {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <CategoriasManoObraPanel onBack={() => router.push('/hr')} />
    </div>
  )
}
