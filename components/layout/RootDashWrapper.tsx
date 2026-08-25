'use client'
import { usePathname } from 'next/navigation'
import DashLayout from '@/components/layout/DashLayout'

/**
 * Rutas públicas que NO deben ir envueltas en DashLayout.
 * Todo lo demás es una ruta autenticada con sidebar.
 */
const PUBLIC_PATHS = ['/', '/login']

/**
 * Deriva el nombre de módulo a partir del pathname para que AuthGuard
 * pueda verificar permisos, igual que lo hacía el `modulo` prop en
 * cada layout individual.
 */
function getModulo(pathname: string): string | undefined {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return undefined

  const first = parts[0]

  // Mapeos especiales
  const SPECIAL: Record<string, string> = {
    residencial:   'lotes',
    usuarios:      'admin',
  }
  if (SPECIAL[first]) return SPECIAL[first]

  // Sin control de módulo (acceso libre para cualquier usuario autenticado)
  const NO_CHECK = ['inicio', 'tablero', 'vehiculos', 'equipo-flota', 'mantenimiento', 'hipico', 'hospitality']
  if (NO_CHECK.includes(first)) return undefined

  // Golf: sub-rutas usan 'golf-{sub}'
  // Excepción: salidas-carritos comparte permiso con el módulo de carritos
  if (first === 'golf' && parts[1] === 'salidas-carritos') return 'golf-carritos'
  if (first === 'golf' && parts[1]) return `golf-${parts[1]}`

  // tesoreria/cxp usa su propio permiso 'cxp' para que roles de Compras
  // (sin acceso al resto de Tesorería) también puedan entrar
  if (first === 'tesoreria' && parts[1] === 'cxp') return 'cxp'

  // compras/**  → 'compras'  (sub-rutas como /compras/requisiciones usan el mismo módulo)
  // ingresos/** → 'ingresos'
  // tesoreria/**→ 'tesoreria'
  // lotes/**    → 'lotes'
  const PARENT_ONLY = ['compras', 'ingresos', 'tesoreria', 'lotes']
  if (PARENT_ONLY.includes(first)) return first

  // Por defecto: usar el primer segmento de la URL
  return first
}

export default function RootDashWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <DashLayout modulo={getModulo(pathname)}>
      {children}
    </DashLayout>
  )
}
