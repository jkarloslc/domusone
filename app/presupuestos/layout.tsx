'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, BarChart3, Settings } from 'lucide-react'

const NAV = [
  { href: '/presupuestos/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/presupuestos/captura',     label: 'Captura',     icon: BookOpen        },
  { href: '/presupuestos/comparativo', label: 'Comparativo', icon: BarChart3       },
  { href: '/presupuestos/partidas',    label: 'Partidas',    icon: Settings        },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  return (
    <>
      {/* Sub-navegación del módulo */}
      <div style={{
        borderBottom: '1px solid #e2e8f0',
        background: '#fff',
        paddingLeft: 24,
        display: 'flex',
        gap: 2,
      }}>
        {NAV.map(item => {
          const active = path.startsWith(item.href)
          const Icon   = item.icon
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? '#1d4ed8' : '#64748b',
              textDecoration: 'none',
              borderBottom: active ? '2px solid #1d4ed8' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color .15s',
            }}>
              <Icon size={14} />
              {item.label}
            </Link>
          )
        })}
      </div>
      {children}
    </>
  )
}
