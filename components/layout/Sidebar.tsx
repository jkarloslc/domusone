'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, MapPin, Users, FileText, Building2, Wrench,
  Shield, AlertTriangle, Receipt, ShoppingCart,
  BarChart3, BookOpen, Settings, LogOut, User, X, Calendar, Landmark, MessageSquare,
  LayoutDashboard, Truck, TrendingUp,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

type Rol =
  | 'superadmin'
  | 'admin'
  | 'usuarioadmin'
  | 'usuariomantto'
  | 'atencion_residentes'
  | 'cobranza'
  | 'vigilancia'
  | 'compras'
  | 'compras_supervisor'
  | 'almacen'
  | 'mantenimiento'
  | 'fraccionamiento'
  | 'tesoreria'
  | 'seguridad'
  | 'ingresos'
  | 'usuario_solicitante'

type NavItem = { label: string; href: string; icon: any }
type NavSection = { section: string; items: NavItem[] }

const ROL_LABEL: Record<Rol, string> = {
  superadmin:          'Super Administrador',
  admin:               'Administrador',
  usuarioadmin:        'Administrador (Op.)',
  usuariomantto:       'Administrador (Mant.)',
  atencion_residentes: 'Atención a Residentes',
  cobranza:            'Cobranza',
  vigilancia:          'Vigilancia',
  compras:             'Compras',
  compras_supervisor:  'Supervisor de Compras',
  almacen:             'Almacén',
  mantenimiento:       'Mantenimiento',
  fraccionamiento:     'Fraccionamiento',
  tesoreria:           'Tesorería',
  seguridad:           'Seguridad',
  ingresos:            'Captura de Ingresos',
  usuario_solicitante: 'Solicitante',
}

// Ítem de reportes con estilo diferenciado (pie de sección)
const RPT = (grupo: string): NavItem => ({
  label: 'Reportes',
  href:  `/reportes?grupo=${grupo}`,
  icon:  BarChart3,
})

const NAV_POR_ROL: Record<Rol, NavSection[]> = {

  superadmin: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Cobranza',       href: '/cobranza',       icon: FileText      },
      { label: 'Facturas',       href: '/facturas',       icon: Receipt       },
      { label: 'Accesos',        href: '/accesos',        icon: Shield        },
      { label: 'Incidencias',    href: '/incidencias',    icon: AlertTriangle },
      { label: 'Contratos',      href: '/contratos',      icon: FileText      },
      { label: 'Escrituras',     href: '/escrituras',     icon: Building2     },
      { label: 'Proyectos',      href: '/proyectos',      icon: Wrench        },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Calendar      },
      { label: 'Equipo & Vehículos', href: '/equipo-flota',   icon: Truck         },
      RPT('mantenimiento'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Ingresos', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: TrendingUp    },
      RPT('ingresos'),
    ]},
    { section: 'Tesorería', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      RPT('tesoreria'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Comunicados',    href: '/comunicados',    icon: MessageSquare },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: BookOpen      },
      { label: 'Usuarios',       href: '/usuarios',       icon: Users         },
      { label: 'Config.',        href: '/configuracion',  icon: Settings      },
    ]},
  ],

  admin: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Cobranza',       href: '/cobranza',       icon: FileText      },
      { label: 'Facturas',       href: '/facturas',       icon: Receipt       },
      { label: 'Accesos',        href: '/accesos',        icon: Shield        },
      { label: 'Incidencias',    href: '/incidencias',    icon: AlertTriangle },
      { label: 'Contratos',      href: '/contratos',      icon: FileText      },
      { label: 'Escrituras',     href: '/escrituras',     icon: Building2     },
      { label: 'Proyectos',      href: '/proyectos',      icon: Wrench        },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Calendar      },
      { label: 'Equipo & Vehículos', href: '/equipo-flota',   icon: Truck         },
      RPT('mantenimiento'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Ingresos', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: TrendingUp    },
      RPT('ingresos'),
    ]},
    { section: 'Tesorería', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      RPT('tesoreria'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Comunicados',    href: '/comunicados',    icon: MessageSquare },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: BookOpen      },
    ]},
  ],

  // Admin sin Mantenimiento
  usuarioadmin: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Cobranza',       href: '/cobranza',       icon: FileText      },
      { label: 'Facturas',       href: '/facturas',       icon: Receipt       },
      { label: 'Accesos',        href: '/accesos',        icon: Shield        },
      { label: 'Incidencias',    href: '/incidencias',    icon: AlertTriangle },
      { label: 'Contratos',      href: '/contratos',      icon: FileText      },
      { label: 'Escrituras',     href: '/escrituras',     icon: Building2     },
      { label: 'Proyectos',      href: '/proyectos',      icon: Wrench        },
      RPT('residencial'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Tesorería', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      RPT('tesoreria'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Comunicados',    href: '/comunicados',    icon: MessageSquare },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: BookOpen      },
    ]},
  ],

  // Admin sin Tesorería
  usuariomantto: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Cobranza',       href: '/cobranza',       icon: FileText      },
      { label: 'Facturas',       href: '/facturas',       icon: Receipt       },
      { label: 'Accesos',        href: '/accesos',        icon: Shield        },
      { label: 'Incidencias',    href: '/incidencias',    icon: AlertTriangle },
      { label: 'Contratos',      href: '/contratos',      icon: FileText      },
      { label: 'Escrituras',     href: '/escrituras',     icon: Building2     },
      { label: 'Proyectos',      href: '/proyectos',      icon: Wrench        },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Calendar      },
      { label: 'Equipo & Vehículos', href: '/equipo-flota',   icon: Truck         },
      RPT('mantenimiento'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Comunicados',    href: '/comunicados',    icon: MessageSquare },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: BookOpen      },
    ]},
  ],

  atencion_residentes: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Contratos',      href: '/contratos',      icon: FileText      },
      { label: 'Escrituras',     href: '/escrituras',     icon: Building2     },
      { label: 'Incidencias',    href: '/incidencias',    icon: AlertTriangle },
      { label: 'Proyectos',      href: '/proyectos',      icon: Wrench        },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Calendar      },
      RPT('mantenimiento'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Comunicados',    href: '/comunicados',    icon: MessageSquare },
    ]},
  ],

  cobranza: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Cobranza',       href: '/cobranza',       icon: FileText      },
      { label: 'Facturas',       href: '/facturas',       icon: Receipt       },
      RPT('residencial'),
    ]},
  ],

  vigilancia: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Accesos',        href: '/accesos',        icon: Shield        },
      { label: 'Incidencias',    href: '/incidencias',    icon: AlertTriangle },
    ]},
  ],

  compras: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
  ],

  almacen: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
  ],

  mantenimiento: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Calendar      },
      { label: 'Equipo & Vehículos', href: '/equipo-flota',   icon: Truck         },
      RPT('mantenimiento'),
    ]},
  ],

  fraccionamiento: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Contratos',      href: '/contratos',      icon: FileText      },
      { label: 'Escrituras',     href: '/escrituras',     icon: Building2     },
      { label: 'Accesos',        href: '/accesos',        icon: Shield        },
      { label: 'Incidencias',    href: '/incidencias',    icon: AlertTriangle },
      { label: 'Proyectos',      href: '/proyectos',      icon: Wrench        },
      { label: 'Cobranza',       href: '/cobranza',       icon: FileText      },
      { label: 'Facturas',       href: '/facturas',       icon: Receipt       },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Calendar      },
      RPT('mantenimiento'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Tesorería', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      RPT('tesoreria'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Comunicados',    href: '/comunicados',    icon: MessageSquare },
    ]},
  ],

  tesoreria: [
    { section: 'Ingresos', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: TrendingUp    },
      RPT('ingresos'),
    ]},
    { section: 'Tesorería', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      RPT('tesoreria'),
    ]},
  ],

  ingresos: [
    { section: 'Ingresos', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: TrendingUp    },
    ]},
  ],

  compras_supervisor: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
  ],

  usuario_solicitante: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
  ],

  seguridad: [
    { section: 'Residencial', items: [
      { label: 'Lotes',          href: '/lotes',          icon: MapPin        },
      { label: 'Propietarios',   href: '/propietarios',   icon: Users         },
      { label: 'Accesos',        href: '/accesos',        icon: Shield        },
      { label: 'Incidencias',    href: '/incidencias',    icon: AlertTriangle },
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
  ],
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { authUser, signOut } = useAuth()

  const rol     = (authUser?.rol ?? 'vigilancia') as Rol
  const sections = NAV_POR_ROL[rol] ?? []
  const label   = authUser?.rol ? (ROL_LABEL[authUser.rol as Rol] ?? authUser.rol) : '—'

  return (
    <aside
      className={`sidebar ${open ? 'open' : ''}`}
      style={{
        width: 220, flexShrink: 0,
        background: 'var(--surface-900)',
        borderRight: '1px solid var(--surface-800)',
        display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 16px 12px',
        borderBottom: '1px solid var(--surface-800)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--blue)', lineHeight: 1.2 }}>
            DomusOne
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Administración Residencial
          </div>
        </div>
        <button onClick={onClose} className="sidebar-close-btn"
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
          <X size={16} />
        </button>
      </div>

      {/* Nav con secciones */}
      <nav style={{ flex: 1, padding: '10px 10px', overflowY: 'auto' }}>

        {/* Inicio — siempre visible */}
        <Link
          href="/inicio"
          onClick={onClose}
          className={`nav-item ${pathname === '/inicio' ? 'active' : ''}`}
        >
          <Home size={15} />
          <span>Inicio</span>
        </Link>
        <Link
          href="/tablero"
          onClick={onClose}
          className={`nav-item ${pathname.startsWith('/tablero') ? 'active' : ''}`}
        >
          <LayoutDashboard size={15} />
          <span>Mi Tablero</span>
        </Link>

        {/* Secciones por rol */}
        {sections.map(sec => (
          <div key={sec.section}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--text-muted)',
              padding: '12px 8px 4px',
            }}>
              {sec.section}
            </div>
            {sec.items.map(item => {
              const Icon    = item.icon
              const isRpt   = item.label === 'Reportes'
              const active  = isRpt
                ? pathname.startsWith('/reportes')
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`nav-item ${active ? 'active' : ''}`}
                  style={isRpt ? {
                    marginTop: 4,
                    opacity: 0.7,
                    fontSize: 11,
                    borderTop: '1px dashed var(--surface-700)',
                    paddingTop: 6,
                  } : undefined}
                >
                  <Icon size={isRpt ? 13 : 15} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer usuario */}
      <div style={{ padding: '10px 12px 16px', borderTop: '1px solid var(--surface-800)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '8px 10px', background: '#f8fafc', borderRadius: 8,
        }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={14} style={{ color: '#fff' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {authUser?.nombre ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--blue)', fontWeight: 500 }}>
              {label}
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 12, borderRadius: 6, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          <LogOut size={13} />
          Cerrar sesión
        </button>
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', opacity: 0.6 }}>
            Powered by <strong style={{ color: 'var(--blue)', opacity: 1, letterSpacing: '0.02em' }}>JK</strong>
          </span>
        </div>
      </div>
    </aside>
  )
}
