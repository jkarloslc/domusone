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
      {/* Sub-navegación del módulo — patrón Riego/POS */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0',
        paddingLeft: 32, background: '#fff' }}>
        {NAV.map(item => {
          const active = path.startsWith(item.href)
          const Icon   = item.icon
          return (
            <Link key={item.href} href={item.href}
              style={{
                padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? '#2563eb' : '#64748b',
                borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
                marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s', textDecoration: 'none', whiteSpace: 'nowrap',
              }}>
              <Icon size={14} /> {item.label}
            </Link>
          )
        })}
      </div>
      {children}
    </>
  )
}
