'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// El hub de Mantenimiento ahora vive dentro de Fraccionamiento (/residencial)
export default function MantenimientoRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/residencial') }, [router])
  return null
}
