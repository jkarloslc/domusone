'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getHomeRouteByRole, useAuth } from '@/lib/AuthContext'
import { Loader } from 'lucide-react'

export default function Home() {
  const { authUser, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!authUser) { router.replace('/login'); return }
    router.replace(getHomeRouteByRole(authUser.rol))
  }, [authUser, loading, router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader size={24} className="animate-spin" style={{ color: 'var(--blue)' }} />
    </div>
  )
}
