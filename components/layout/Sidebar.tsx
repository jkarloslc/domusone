'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, Users, FileText, Wrench, Building2,
  Shield, BarChart3, Settings, MapPin, ChevronRight, AlertTriangle
} from 'lucide-react'
import { useConfig } from '@/lib/ConfigContext'

const nav = [
  { label: 'Lotes',        href: '/lotes',        icon: MapPin },
  { label: 'Propietarios', href: '/propietarios',  icon: Users },
  { label: 'Cobranza',     href: '/cobranza',      icon: FileText },
  { label: 'Accesos',      href: '/accesos',       icon: Shield },
  { label: 'Incidencias',  href: '/incidencias',   icon: AlertTriangle },
  { label: 'Contratos',    href: '/contratos',     icon: FileText },
  { label: 'Escrituras',   href: '/escrituras',    icon: Building2 },
  { label: 'Proyectos',    href: '/proyectos',     icon: Wrench },
  { label: 'Servicios',    href: '/servicios',     icon: LayoutGrid },
  { label: 'Reportes',     href: '/reportes',      icon: BarChart3 },
  { label: 'Config.',      href: '/configuracion', icon: Settings },
]

export default function Sidebar() {
  const path = usePathname()
  const { config } = useConfig()

  return (
    <aside style={{
      width: 220,
      minHeight: '100vh',
      background: 'var(--surface-900)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo / Org */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500,
          color: 'var(--gold-light)', letterSpacing: '0.01em', lineHeight: 1.2,
        }}>
          {config.org_nombre}
        </div>
        {config.org_subtitulo && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.04em' }}>
            {config.org_subtitulo}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 10px', flex: 1 }}>
        {nav.map(({ label, href, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link key={href} href={href} className={`nav-item ${active ? 'active' : ''}`} style={{ marginBottom: 2 }}>
              <Icon size={15} />
              {label}
              {active && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
        v{config.app_version} · {new Date().getFullYear()}
      </div>
    </aside>
  )
}
