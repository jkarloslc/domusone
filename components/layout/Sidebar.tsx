'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, MapPin, Users, FileText, Receipt, ShoppingCart,
  Shield, AlertTriangle, Building2, Wrench, BarChart3,
  BookOpen, Settings, LogOut, User,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

// ── Etiquetas de rol para el sidebar ─────────────────────────────────────────
const ROL_LABEL: Record<string, string> = {
  admin:               'Administrador',
  atencion_residentes: 'Atención a Residentes',
  cobranza:            'Cobranza',
  vigilancia:          'Vigilancia',
  compras:             'Compras',
  almacen:             'Almacén',
  mantenimiento:       'Mantenimiento',
  fraccionamiento:     'Fraccionamiento',
}

// ── Nav con secciones ─────────────────────────────────────────────────────────
// modulo: clave que se evalúa con can(modulo) — sin cambios en la lógica
const SECTIONS = [
  {
    label: 'Residencial',
    items: [
      { label: 'Lotes',        href: '/lotes',        icon: MapPin,        modulo: 'lotes'        },
      { label: 'Propietarios', href: '/propietarios',  icon: Users,         modulo: 'propietarios' },
      { label: 'Cobranza',     href: '/cobranza',      icon: FileText,      modulo: 'cobranza'     },
      { label: 'Facturas',     href: '/facturas',      icon: Receipt,       modulo: 'facturas'     },
      { label: 'Accesos',      href: '/accesos',       icon: Shield,        modulo: 'accesos'      },
      { label: 'Incidencias',  href: '/incidencias',   icon: AlertTriangle, modulo: 'incidencias'  },
      { label: 'Contratos',    href: '/contratos',     icon: FileText,      modulo: 'contratos'    },
      { label: 'Escrituras',   href: '/escrituras',    icon: Building2,     modulo: 'escrituras'   },
      { label: 'Proyectos',    href: '/proyectos',     icon: Wrench,        modulo: 'proyectos'    },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { label: 'Mantenimiento', href: '/mantenimiento', icon: Wrench, modulo: 'mantenimiento' },
    ],
  },
  {
    label: 'Compras',
    items: [
      { label: 'Compras', href: '/compras', icon: ShoppingCart, modulo: 'compras' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Reportes',  href: '/reportes',      icon: BarChart3, modulo: 'reportes'      },
      { label: 'Catálogos', href: '/catalogos',      icon: BookOpen,  modulo: 'admin'         },
      { label: 'Usuarios',  href: '/usuarios',       icon: Users,     modulo: 'admin'         },
      { label: 'Config.',   href: '/configuracion',   icon: Settings,  modulo: 'configuracion' },
    ],
  },
]

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { authUser, signOut, can } = useAuth()

  return (
    <aside
      className={`sidebar ${open ? 'open' : ''}`}
      style={{
        width: 220, flexShrink: 0,
        background: 'var(--surface-900)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0,
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--blue)' }}>
          DomusOne
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          Balvanera Polo & CC
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Inicio siempre visible */}
        <NavLink href="/inicio" icon={Home} label="Inicio"
          active={pathname === '/inicio'} onClick={onClose} />

        {/* Secciones filtradas */}
        {SECTIONS.map(function(sec) {
          var visibles = sec.items.filter(function(item) { return can(item.modulo) })
          if (visibles.length === 0) return null
          return (
            <div key={sec.label}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
                padding: '10px 8px 4px',
              }}>
                {sec.label}
              </div>
              {visibles.map(function(item) {
                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={pathname.startsWith(item.href)}
                    onClick={onClose}
                  />
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)' }}>
        {authUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', marginBottom: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--blue-pale)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={13} style={{ color: 'var(--blue)' }} />
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {authUser.nombre}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {ROL_LABEL[authUser.rol] ?? authUser.rol}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={signOut}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 8px', borderRadius: 6, background: 'none',
            border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
            fontSize: 12, transition: 'all 0.15s',
          }}
        >
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

function NavLink({ href, icon: Icon, label, active, onClick }: {
  href: string; icon: any; label: string; active: boolean; onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 8px', borderRadius: 7, textDecoration: 'none',
        fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? 'var(--blue)' : 'var(--text-secondary)',
        background: active ? 'var(--blue-pale)' : 'transparent',
        transition: 'all 0.12s',
      }}
    >
      <Icon size={14} />
      {label}
    </Link>
  )
}
