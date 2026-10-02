'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MapPinned, List, Table2 } from 'lucide-react'

const TABS = [
  { href: '/lotes', label: 'Catálogo', icon: List },
  { href: '/lotes/listado', label: 'Lotes por Sección', icon: Table2 },
  { href: '/lotes/expediente', label: 'Expediente de Lote', icon: MapPinned },
]

export default function LotesTabs() {
  const pathname = usePathname()
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', marginBottom: 24 }}>
      {TABS.map(t => {
        const active = t.href === '/lotes' ? pathname === '/lotes' : pathname.startsWith(t.href)
        const Icon = t.icon
        return (
          <Link key={t.href} href={t.href}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 20px',
              fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? 'var(--blue)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -2, textDecoration: 'none', transition: 'all 0.15s',
            }}>
            <Icon size={14} />
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
