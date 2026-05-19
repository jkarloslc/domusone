'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function PresupuestosIndex() {
  const router = useRouter()
  useEffect(() => { router.replace('/presupuestos/dashboard') }, [router])
  return null
}
