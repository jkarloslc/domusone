'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { Loader } from 'lucide-react'

export default function AuthGuard({ children, modulo }: { children: React.ReactNode; modulo?: string }) {
  const { authUser, loading, can } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !authUser) {
      router.replace('/login')
    }
  }, [authUser, loading, router])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <Loader size={20} className="animate-spin" style={{ color: 'var(--blue)' }} />
    </div>
  )

  if (!authUser) return null

  // Verificar permiso de módulo
  if (modulo && !can(modulo)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>Acceso restringido</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No tienes permiso para ver este módulo</div>
      </div>
    )
  }

  return <>{children}</>
}
