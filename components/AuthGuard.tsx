'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getHomeRouteByRole, useAuth } from '@/lib/AuthContext'
import { Loader } from 'lucide-react'

export default function AuthGuard({ children, modulo }: { children: React.ReactNode; modulo?: string }) {
  const { authUser, loading, can } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!authUser) {
      router.replace('/login')
      return
    }
    // Si el usuario no tiene permiso para este módulo, redirigir a su home
    if (modulo && !can(modulo)) {
      router.replace(getHomeRouteByRole(authUser.rol))
    }
  }, [authUser, loading, modulo, router, can])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <Loader size={20} className="animate-spin" style={{ color: 'var(--blue)' }} />
    </div>
  )

  if (!authUser) return null

  // Mientras se procesa la redirección por módulo sin permiso, mostrar loader
  if (modulo && !can(modulo)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <Loader size={20} className="animate-spin" style={{ color: 'var(--blue)' }} />
      </div>
    )
  }

  return <>{children}</>
}
