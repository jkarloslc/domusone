'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, MapPin, Users, FileText, Building2, Wrench,
  LayoutGrid, Shield, AlertTriangle, Receipt, ShoppingCart, Calendar,
  BarChart3, BookOpen, Settings, LogOut, User, X
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import type { Rol } from '@/lib/AuthContext'

type NavItem = { label: string; href: string; icon: any }

const NAV_POR_ROL: Record<Rol, NavItem[]> = {
  admin: [
    { label: 'Inicio',       href: '/inicio',        icon: Home },
    { label: 'Lotes',        href: '/lotes',          icon: MapPin },
    { label: 'Propietarios', href: '/propietarios',   icon: Users },
    { label: 'Contratos',    href: '/contratos',      icon: FileText },
    { label: 'Escrituras',   href: '/escrituras',     icon: Building2 },
    { label: 'Proyectos',    href: '/proyectos',      icon: Wrench },
    { label: 'Prog. Mantenimiento', href: '/mantenimiento', icon: Calendar },
    { label: 'Accesos',      href: '/accesos',        icon: Shield },
    { label: 'Incidencias',  href: '/incidencias',    icon: AlertTriangle },
    { label: 'Cobranza',     href: '/cobranza',       icon: FileText },
    { label: 'Facturas',     href: '/facturas',       icon: Receipt },
    { label: 'Compras',      href: '/compras',        icon: ShoppingCart },
    { label: 'Reportes',     href: '/reportes',       icon: BarChart3 },
    { label: 'Catálogos',    href: '/catalogos',      icon: BookOpen },
    { label: 'Usuarios',     href: '/usuarios',       icon: Users },
    { label: 'Config.',      href: '/configuracion',  icon: Settings },
  ],
  atencion: [
    { label: 'Inicio',       href: '/inicio',        icon: Home },
    { label: 'Lotes',        href: '/lotes',          icon: MapPin },
    { label: 'Propietarios', href: '/propietarios',   icon: Users },
    { label: 'Contratos',    href: '/contratos',      icon: FileText },
    { label: 'Escrituras',   href: '/escrituras',     icon: Building2 },
    { label: 'Prog. Mantenimiento', href: '/mantenimiento', icon: Calendar },
    { label: 'Incidencias',  href: '/incidencias',    icon: AlertTriangle },
    { label: 'Reportes',     href: '/reportes',       icon: BarChart3 },
  ],
  cobranza: [
    { label: 'Inicio',       href: '/inicio',        icon: Home },
    { label: 'Lotes',        href: '/lotes',          icon: MapPin },
    { label: 'Propietarios', href: '/propietarios',   icon: Users },
    { label: 'Cobranza',     href: '/cobranza',       icon: FileText },
    { label: 'Facturas',     href: '/facturas',       icon: Receipt },
    { label: 'Reportes',     href: '/reportes',       icon: BarChart3 },
  ],
  vigilancia: [
    { label: 'Inicio',       href: '/inicio',        icon: Home },
    { label: 'Lotes',        href: '/lotes',          icon: MapPin },
    { label: 'Propietarios', href: '/propietarios',   icon: Users },
    { label: 'Accesos',      href: '/accesos',        icon: Shield },
    { label: 'Incidencias',  href: '/incidencias',    icon: AlertTriangle },
  ],
  compras: [
    { label: 'Compras',      href: '/compras',        icon: ShoppingCart },
  ],
  almacenista: [
    { label: 'Compras',      href: '/compras',        icon: ShoppingCart },
  ],
  compras_supervisor: [
    { label: 'Compras',      href: '/compras',        icon: ShoppingCart },
  ],
}

const ROL_LABEL: Record<Rol, string> = {
  admin:             'Administrador',
  atencion:          'Atención a Residentes',
  cobranza:          'Cobranza',
  vigilancia:        'Vigilancia',
  compras:           'Compras',
  almacenista:       'Almacenista',
  compras_supervisor:'Compras Supervisor',
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { authUser, signOut } = useAuth()
  const rol = (authUser?.rol ?? 'vigilancia') as Rol
  const nav = NAV_POR_ROL[rol] ?? []

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} style={{
      width: 220, flexShrink: 0,
      background: 'var(--surface-900)',
      borderRight: '1px solid var(--surface-800)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 16px 12px',
        borderBottom: '1px solid var(--surface-800)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between'
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
            color: 'var(--blue)', lineHeight: 1.2
          }}>
            {authUser ? 'DomusOne' : 'DomusOne'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Administración Residencial
          </div>
        </div>
        {/* Botón X solo en móvil */}
        <button onClick={onClose} style={{
          display: 'none',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', padding: 4, borderRadius: 6
        }} className="sidebar-close-btn">
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>
        {nav.map(item => {
          const Icon = item.icon
          const active = pathname === item.href ||
            (item.href !== '/inicio' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} onClick={onClose}
              className={`nav-item ${active ? 'active' : ''}`}>
              <Icon size={15} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer usuario */}
      <div style={{
        padding: '10px 12px 16px',
        borderTop: '1px solid var(--surface-800)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '8px 10px', background: '#f8fafc', borderRadius: 8
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: 'var(--blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <User size={14} style={{ color: '#fff' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {authUser?.nombre ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 500 }}>
              {authUser?.rol ? ROL_LABEL[authUser.rol] : '—'}
            </div>
          </div>
        </div>
        <button onClick={signOut} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 12, borderRadius: 6, transition: 'all 0.15s'
        }}
          onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
