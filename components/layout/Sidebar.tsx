'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutGrid, Users, FileText, Wrench, Building2,
  Shield, BarChart3, Settings, MapPin, ChevronRight,
  AlertTriangle, LogOut, User, Home
} from 'lucide-react'
import { useConfig } from '@/lib/ConfigContext'
import { useAuth } from '@/lib/AuthContext'

const NAV = [
  { label: 'Inicio',       href: '/inicio',       icon: Home,           modulo: 'lotes' },
  { label: 'Lotes',        href: '/lotes',        icon: MapPin,         modulo: 'lotes' },
  { label: 'Propietarios', href: '/propietarios',  icon: Users,          modulo: 'propietarios' },
  { label: 'Cobranza',     href: '/cobranza',      icon: FileText,       modulo: 'cobranza' },
  { label: 'Accesos',      href: '/accesos',       icon: Shield,         modulo: 'accesos' },
  { label: 'Incidencias',  href: '/incidencias',   icon: AlertTriangle,  modulo: 'incidencias' },
  { label: 'Contratos',    href: '/contratos',     icon: FileText,       modulo: 'contratos' },
  { label: 'Escrituras',   href: '/escrituras',    icon: Building2,      modulo: 'escrituras' },
  { label: 'Proyectos',    href: '/proyectos',     icon: Wrench,         modulo: 'proyectos' },
  { label: 'Servicios',    href: '/servicios',     icon: LayoutGrid,     modulo: 'servicios' },
  { label: 'Reportes',     href: '/reportes',      icon: BarChart3,      modulo: 'reportes' },
  { label: 'Usuarios',     href: '/usuarios',     icon: Users,          modulo: 'admin' },
  { label: 'Config.',      href: '/configuracion', icon: Settings,       modulo: 'configuracion' },
]

const ROL_LABELS: Record<string, string> = {
  admin:     'Administrador',
  cobranza:  'Cobranza',
  accesos:   'Accesos',
  seguridad: 'Seguridad',
  residente: 'Residente',
}

export default function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const path    = usePathname()
  const router  = useRouter()
  const { config }   = useConfig()
  const { authUser, signOut, can } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  // Cerrar sidebar al navegar en móvil
  const handleNav = () => { if (onClose) onClose() }

  // Filtrar nav según permisos
  const navVisible = NAV.filter(n => can(n.modulo))

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} style={{
      width: 220, minHeight: '100vh',
      background: '#ffffff',
      borderRight: '1px solid #e2e8f0',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--blue)', lineHeight: 1.2 }}>
          {config.org_nombre}
        </div>
        {config.org_subtitulo && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.04em' }}>
            {config.org_subtitulo}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ padding: '12px 10px', flex: 1, overflowY: 'auto' }}>
        {navVisible.map(({ label, href, icon: Icon }) => {
          const active = path.startsWith(href)
          return (
            <Link key={href} href={href} onClick={handleNav} className={`nav-item ${active ? 'active' : ''}`} style={{ marginBottom: 2 }}>
              <Icon size={15} />
              {label}
              {active && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
            </Link>
          )
        })}
      </nav>

      {/* Usuario + logout */}
      {authUser && (
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={14} style={{ color: 'var(--blue)' }} />
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {authUser.nombre}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {ROL_LABELS[authUser.rol] ?? authUser.rol}
              </div>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12, color: '#dc2626', padding: '6px 8px' }}>
            <LogOut size={13} /> Cerrar Sesión
          </button>
        </div>
      )}
    </aside>
  )
}
