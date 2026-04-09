'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { Loader } from 'lucide-react'

export default function Home() {
  const { authUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!authUser) { router.replace('/login'); return }
    switch (authUser.rol) {
      case 'compras':
      case 'compras_supervisor':
      case 'almacen':       router.replace('/compras');       break
      case 'mantenimiento': router.replace('/mantenimiento'); break
      case 'cobranza':      router.replace('/cobranza');      break
      case 'vigilancia':
      case 'seguridad':     router.replace('/accesos');       break
      case 'tesoreria':     router.replace('/tesoreria');    break
      default:              router.replace('/lotes');         break
    }
  }, [authUser, loading, router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader size={24} className="animate-spin" style={{ color: 'var(--blue)' }} />
    </div>
  )
}
