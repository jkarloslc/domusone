'use client'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import EquipoFlotaTab from './EquipoFlotaTab'

const ROLES_PERMITIDOS = ['superadmin', 'admin', 'usuariomantto', 'mantenimiento']

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
      <EquipoFlotaTab />
    </div>
  )
}
