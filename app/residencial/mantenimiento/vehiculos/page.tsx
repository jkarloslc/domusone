'use client'
import { useAuth } from '@/lib/AuthContext'
import { AmbitoProvider } from '@/lib/AmbitoContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import EquipoFlotaTab from '@/app/equipo-flota/EquipoFlotaTab'
import PageHeader from '@/components/layout/PageHeader'

// Mismos roles que la versión de Golf (/equipo-flota). Datos: tablas *_mantto.
const ROLES_PERMITIDOS = ['superadmin', 'admin', 'admin_lector', 'usuariomantto', 'mantenimiento', 'compras']

export default function VehiculosManttoPage() {
  const { authUser } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (authUser && !ROLES_PERMITIDOS.includes(authUser.rol)) router.replace('/inicio')
  }, [authUser, router])

  if (!authUser || !ROLES_PERMITIDOS.includes(authUser.rol)) return null

  return (
    <AmbitoProvider ambito="mantto">
      <div style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>
        <PageHeader
          backHref="/residencial/mantenimiento"
          title="Vehículos y Maquinaria"
          subtitle="Mantenimiento del Fraccionamiento: catálogo de equipos, bitácora de mantenimiento y control de combustible"
        />
        <EquipoFlotaTab />
      </div>
    </AmbitoProvider>
  )
}
