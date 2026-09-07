'use client'
import { useRouter } from 'next/navigation'
import ColaboradoresPanel from '@/components/catalogos/ColaboradoresPanel'

export default function HRColaboradoresPage() {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <ColaboradoresPanel onBack={() => router.push('/hr')} />
    </div>
  )
}
