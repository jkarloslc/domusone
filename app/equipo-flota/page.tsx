'use client'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Truck } from 'lucide-react'
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
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Truck size={18} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>
            Equipo & Flota
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
            Catálogo de equipos, bitácora de mantenimiento y control de combustible
          </p>
        </div>
      </div>
      <EquipoFlotaTab />
    </div>
  )
}
