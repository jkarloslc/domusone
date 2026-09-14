'use client'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Hammer } from 'lucide-react'
import HerramientasTab from './HerramientasTab'
import PageHeader from '@/components/layout/PageHeader'

const ROLES_PERMITIDOS = ['superadmin', 'admin', 'admin_lector', 'usuariomantto', 'mantenimiento']

export default function HerramientasPage() {
  const { authUser } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (authUser && !ROLES_PERMITIDOS.includes(authUser.rol)) {
      router.replace('/inicio')
    }
  }, [authUser, router])

  if (!authUser || !ROLES_PERMITIDOS.includes(authUser.rol)) return null

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
      <PageHeader
        backHref="/mantenimiento"
        title="Equipo & Herramienta"
        subtitle="Catálogo de herramienta menor, bitácora de préstamos y servicios de mantenimiento"
      />
      <HerramientasTab />
    </div>
  )
}
