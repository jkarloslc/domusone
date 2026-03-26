'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, MapPin, Users, FileText, Building2, Wrench,
  LayoutGrid, Shield, AlertTriangle, Receipt, ShoppingCart,
  BarChart3, BookOpen, Settings, LogOut, User, X
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import type { Rol } from '@/lib/AuthContext'

// ── Nav items por rol ────────────────────────────────────────
type NavItem = { label: string; href: string; icon: any; modulo: string }

const NAV_ADMIN: NavItem[] = [
  { label: 'Inicio',       href: '/inicio',        icon: Home,          modulo: 'lotes' },
  { label: 'Lotes',        href: '/lotes',          icon: MapPin,        modulo: 'lotes' },
  { label: 'Propietarios', href: '/propietarios',   icon: Users,         modulo: 'lotes' },
  { label: 'Contratos',    href: '/contratos',      icon: FileText,      modulo: 'lotes' },
  { label: 'Escrituras',   href: '/escrituras',     icon: Building2,     modulo: 'lotes' },
  { label: 'Proyectos',    href: '/proyectos',      icon: Wrench,        modulo: 'lotes' },
  { label: 'Servicios',    href: '/servicios',      icon: LayoutGrid,    modulo: 'lotes' },
  { label: 'Accesos',      href: '/accesos',        icon: Shield,        modulo: 'lotes' },
  { label: 'Incidencias',  href: '/incidencias',    icon: AlertTriangle, modulo: 'lotes' },
  { label: 'Cobranza',     href: '/cobranza',       icon: FileText,      modulo: 'lotes' },
  { label: 'Facturas',     href: '/facturas',       icon: Receipt,       modulo: 'lotes' },
  { label: 'Compras',      href: '/compras',        icon: ShoppingCart,  modulo: 'lotes' },
  { label: 'Reportes',     href: '/reportes',       icon: BarChart3,     modulo: 'lotes' },
  { label: 'Catálogos',    href: '/catalogos',      icon: BookOpen,      modulo: 'admin' },
  { label: 'Usuarios',     href: '/usuarios',       icon: Users,         modulo: 'admin' },
  { label: 'Config.',      href: '/configuracion',  icon: Settings,      modulo: 'lotes' },
]

const NAV_POR_ROL: Record<Rol, NavItem[]> = {
  admin: NAV_ADMIN,

  atencion: [
    { label: 'Inicio',       href: '/inicio',       icon: Home,          modulo: 'lotes' },
    { label: 'Lotes',        href: '/lotes',         icon: MapPin,        modulo: 'lotes' },
    { label: 'Propietarios', href: '/propietarios',  icon: Users,         modulo: 'lotes' },
    { label: 'Contratos',    href: '/contratos',     icon: FileText,      modulo: 'lotes' },
    { label: 'Escrituras',   href: '/escrituras',    icon: Building2,     modulo: 'lotes' },
    { label: 'Servicios',    href: '/servicios',     icon: LayoutGrid,    modulo: 'lotes' },
    { label: 'Incidencias',  href: '/incidencias',   icon: AlertTriangle, modulo: 'lotes' },
    { label: 'Reportes',     href: '/reportes',      icon: BarChart3,     modulo: 'lotes' },
  ],

  cobranza: [
    { label: 'Inicio',       href: '/inicio',       icon: Home,          modulo: 'lotes' },
    { label: 'Lotes',        href: '/lotes',         icon: MapPin,        modulo: 'lotes' },
    { label: 'Propietarios', href: '/propietarios',  icon: Users,         modulo: 'lotes' },
    { label: 'Cobranza',     href: '/cobranza',      icon: FileText,      modulo: 'lotes' },
    { label: 'Facturas',     href: '/facturas',      icon: Receipt,       modulo: 'lotes' },
    { label: 'Reportes',     href: '/reportes',      icon: BarChart3,     modulo: 'lotes' },
  ],

  vigilancia: [
    { label: 'Inicio',       href: '/inicio',       icon: Home,          modulo: 'lotes' },
    { label: 'Lotes',        href: '/lotes',         icon: MapPin,        modulo: 'lotes' },
    { label: 'Propietarios', href: '/propietarios',  icon: Users,         modulo: 'lotes' },
    { label: 'Accesos',      href: '/accesos',       icon: Shield,        modulo: 'lotes' },
    { label: 'Incidencias',  href: '/incidencias',   icon: AlertTriangle, modulo: 'lotes' },
  ],

  compras: [
    { label: 'Compras',      href: '/compras',       icon: ShoppingCart,  modulo: 'lotes' },
  ],

  almacenista: [
    { label: 'Compras',      href: '/compras',       icon: ShoppingCart,  modulo: 'lotes' },
  ],

  compras_supervisor: [
    { label: 'Compras',      href: '/compras',       icon: ShoppingCart,  modulo: 'lotes' },
  ],
}

// ────────────────────────────────────────────────────────────
export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname  = usePathname()
  const { authUser, signOut } = useAuth()

  const rol  = authUser?.rol ?? 'vigilancia'
  const nav  = NAV_POR_ROL[rol] ?? []

  const orgNombre    = 'DomusOne'
  const orgSubtitulo = 'Administración Residencial'

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
              color: 'var(--blue)', lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {orgNombre}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {orgSubtitulo}
            </div>
          </div>
          <button className="close-btn mobile-only" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {nav.map(item => {
            const Icon    = item.icon
            const active  = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href} onClick={onClose}
                className={`nav-item ${active ? 'active' : ''}`}>
                <Icon size={15} />
                <span>{item.label}</span>
                {item.href === '/compras' && active && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>›</span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Footer usuario */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            padding: '8px 10px', background: 'var(--surface-900)', borderRadius: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={14} style={{ color: '#fff' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {authUser?.nombre ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 500 }}>
                {authUser?.rol ? (authUser.rol === 'admin' ? 'Administrador' :
                  authUser.rol === 'atencion' ? 'Atención a Residentes' :
                  authUser.rol === 'cobranza' ? 'Cobranza' :
                  authUser.rol === 'vigilancia' ? 'Vigilancia' :
                  authUser.rol === 'compras' ? 'Compras' :
                  authUser.rol === 'almacenista' ? 'Almacenista' :
                  authUser.rol === 'compras_supervisor' ? 'Compras Supervisor' : authUser.rol
                ) : '—'}
              </div>
            </div>
          </div>
          <button onClick={signOut}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 12, borderRadius: 6,
              transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}>
            <LogOut size={13} />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  )
}
