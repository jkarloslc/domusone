'use client'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Truck } from 'lucide-react'
import EquipoFlotaTab from './EquipoFlotaTab'
import PageHeader from '@/components/layout/PageHeader'

const ROLES_PERMITIDOS = ['superadmin', 'admin', 'admin_lector', 'usuariomantto', 'mantenimiento', 'compras']

export default function EquipoFlotaPage() {
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
        title="Equipo & Vehículos"
        subtitle="Catálogo de equipos, bitácora de mantenimiento y control de combustible"
      />
      <EquipoFlotaTab />
    </div>
  )
}
