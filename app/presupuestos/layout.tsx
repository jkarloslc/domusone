'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Settings, Wallet } from 'lucide-react'

const NAV = [
  { href: '/presupuestos/captura-flujo', label: 'Captura Flujo',      icon: BookOpen        },
  { href: '/presupuestos/flujo',       label: 'Flujo de Efectivo',   icon: Wallet          },
  { href: '/presupuestos/partidas',    label: 'Partidas',            icon: Settings        },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  return (
    <>
      {/* Sub-navegación del módulo — patrón Riego/POS */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #E6E8EB',
        paddingLeft: 32, background: '#fff' }}>
        {NAV.map(item => {
          const active = path === item.href || path.startsWith(item.href + '/')
          const Icon   = item.icon
          return (
            <Link key={item.href} href={item.href}
              style={{
                padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active ? '#1C1D21' : '#62666E',
                borderBottom: active ? '2px solid #19D3C5' : '2px solid transparent',
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
