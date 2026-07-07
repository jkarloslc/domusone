'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Wrench, Truck, ShoppingCart,
  BarChart3, Settings, LogOut, User, Users, X, Landmark,
  Flag, Star, DollarSign, MessageCircle, LayoutDashboard, BookOpen, Store, Leaf,
  Hammer, Building2,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'

// Ícono caballo inline (no disponible en lucide)
const HorseIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
    <circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/>
  </svg>
)

type Rol =
  | 'superadmin'
  | 'admin'
  | 'admin_lector'
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
  | 'usuario_solicitante'
  | 'ingresos'
  | 'usuariogolf'
  | 'usuariohipico'
  | 'usuariohospitality'
  | 'usuario_nomina'
  | 'usuario_organismo'

type NavItem = { label: string; href: string; icon: any }
type NavSection = { section: string; items: NavItem[] }

const ROL_LABEL: Record<Rol, string> = {
  superadmin:          'Super Administrador',
  admin:               'Administrador',
  admin_lector:        'Admin Solo Lectura',
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
  usuario_solicitante: 'Solicitante',
  ingresos:            'Ingresos',
  usuariogolf:         'Operador Golf',
  usuariohipico:       'Operador Hípico',
  usuariohospitality:  'Operador Hospitality',
  usuario_nomina:      'Usuario Nómina',
  usuario_organismo:   'Organismo',
}

// Ítem de reportes con estilo diferenciado (pie de sección)
const RPT = (grupo: string): NavItem => ({
  label: 'Reportes',
  href:  `/reportes?grupo=${grupo}`,
  icon:  BarChart3,
})

const NAV_POR_ROL: Record<Rol, NavSection[]> = {

  superadmin: [
    { section: 'Dashboards', items: [
      { label: 'Vista Ejecutiva',        href: '/dashboards/ejecutivo',   icon: LayoutDashboard },
      { label: 'Dashboard Financiero',   href: '/dashboards/financiero',  icon: LayoutDashboard },
      { label: 'Dashboard Mantenimiento',href: '/dashboards/mantenimiento',icon: LayoutDashboard },
    ]},
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Wrench        },
      RPT('mantenimiento'),
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck   },
      { label: 'Equipo y Herramienta',     href: '/herramientas',  icon: Hammer  },
      { label: 'Proyectos CAPEX',  href: '/capex',          icon: Building2     },
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Hípico',          href: '/hipico',              icon: HorseIcon },
      { label: 'Hospitality',     href: '/hospitality',         icon: Star      },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Presupuestos',   href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
      { label: 'Configuración',  href: '/configuracion',  icon: Settings      },
      { label: 'Usuarios',       href: '/usuarios',       icon: Users         },
    ]},
  ],

  admin: [
    { section: 'Dashboards', items: [
      { label: 'Vista Ejecutiva',        href: '/dashboards/ejecutivo',    icon: LayoutDashboard },
      { label: 'Dashboard Financiero',   href: '/dashboards/financiero',   icon: LayoutDashboard },
      { label: 'Dashboard Mantenimiento',href: '/dashboards/mantenimiento', icon: LayoutDashboard },
    ]},
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Wrench        },
      RPT('mantenimiento'),
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck   },
      { label: 'Equipo y Herramienta',     href: '/herramientas',  icon: Hammer  },
      { label: 'Proyectos CAPEX',  href: '/capex',          icon: Building2     },
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Hípico',          href: '/hipico',              icon: HorseIcon },
      { label: 'Hospitality',     href: '/hospitality',         icon: Star      },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Presupuestos',   href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  // ── Admin Solo Lectura: mismo menú que admin ──────────────
  admin_lector: [
    { section: 'Dashboards', items: [
      { label: 'Vista Ejecutiva',        href: '/dashboards/ejecutivo',    icon: LayoutDashboard },
      { label: 'Dashboard Financiero',   href: '/dashboards/financiero',   icon: LayoutDashboard },
      { label: 'Dashboard Mantenimiento',href: '/dashboards/mantenimiento', icon: LayoutDashboard },
    ]},
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Wrench        },
      RPT('mantenimiento'),
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck   },
      { label: 'Equipo y Herramienta',     href: '/herramientas',  icon: Hammer  },
      { label: 'Proyectos CAPEX',  href: '/capex',          icon: Building2     },
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Hípico',          href: '/hipico',              icon: HorseIcon },
      { label: 'Hospitality',     href: '/hospitality',         icon: Star      },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Presupuestos',   href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  usuarioadmin: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard Financiero', href: '/dashboards/financiero', icon: LayoutDashboard },
    ]},
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Hípico',          href: '/hipico',              icon: HorseIcon },
      { label: 'Hospitality',     href: '/hospitality',         icon: Star      },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Presupuestos',   href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  usuariomantto: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard Financiero',   href: '/dashboards/financiero',   icon: LayoutDashboard },
      { label: 'Dashboard Mantenimiento',href: '/dashboards/mantenimiento', icon: LayoutDashboard },
    ]},
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Wrench        },
      RPT('mantenimiento'),
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck   },
      { label: 'Equipo y Herramienta',     href: '/herramientas',  icon: Hammer  },
      { label: 'Proyectos CAPEX',  href: '/capex',          icon: Building2     },
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      RPT('ingresos'),
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  atencion_residentes: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Wrench        },
      RPT('mantenimiento'),
    ]},
  ],

  cobranza: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
  ],

  vigilancia: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
    ]},
  ],

  compras: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
  ],

  compras_supervisor: [
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
    { section: 'Dashboards', items: [
      { label: 'Dashboard Mantenimiento',href: '/dashboards/mantenimiento', icon: LayoutDashboard },
    ]},
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Wrench        },
      RPT('mantenimiento'),
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck   },
      { label: 'Equipo y Herramienta',     href: '/herramientas',  icon: Hammer  },
      { label: 'Proyectos CAPEX',  href: '/capex',          icon: Building2     },
    ]},
  ],

  fraccionamiento: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard Financiero', href: '/dashboards/financiero', icon: LayoutDashboard },
    ]},
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Wrench        },
      RPT('mantenimiento'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Presupuestos',   href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
  ],

  tesoreria: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard Financiero', href: '/dashboards/financiero', icon: LayoutDashboard },
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Presupuestos',   href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
  ],

  seguridad: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
  ],

  usuario_solicitante: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  ingresos: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard Financiero', href: '/dashboards/financiero', icon: LayoutDashboard },
    ]},
    { section: 'Finanzas', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      RPT('ingresos'),
    ]},
  ],

  usuariogolf: [
    { section: 'Club', items: [
      { label: 'Punto de Venta', href: '/golf/pos',            icon: Store },
      { label: 'Golf',           href: '/golf',                icon: Flag  },
      { label: 'Administración', href: '/golf/administracion', icon: Users },
      { label: 'Mantto. Campo',  href: '/golf/mantto-campo',   icon: Leaf  },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  usuariohipico: [
    { section: 'Hípico', items: [
      { label: 'Hípico',            href: '/hipico',                   icon: HorseIcon },
      { label: 'Eventos Ecuestres', href: '/hipico/eventos-ecuestres', icon: HorseIcon },
      RPT('hipico'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  usuario_nomina: [
    { section: 'Compras', items: [
      { label: 'Órdenes de Pago', href: '/compras/ordenes-pago', icon: Landmark },
    ]},
  ],

  usuario_organismo: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
  ],

  usuariohospitality: [
    { section: 'Hospitality', items: [
      { label: 'Hospitality',       href: '/hospitality',             icon: Star      },
      RPT('hospitality'),
    ]},
    { section: 'Club', items: [
      { label: 'Torneos Golf',      href: '/golf/torneos',            icon: Flag      },
      { label: 'Eventos Ecuestres', href: '/hipico/eventos-ecuestres',icon: HorseIcon },
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',           href: '/compras',                 icon: ShoppingCart },
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',              href: '/tablero',                 icon: MessageCircle },
    ]},
  ],
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { authUser, signOut } = useAuth()

  const rol      = (authUser?.rol ?? 'vigilancia') as Rol
  const sections = NAV_POR_ROL[rol] ?? []
  const label    = authUser?.rol ? (ROL_LABEL[authUser.rol as Rol] ?? authUser.rol) : '—'

  return (
    <aside
      className={`sidebar ${open ? 'open' : ''}`}
      style={{
        width: 220, flexShrink: 0,
        background: '#2d3660',
        borderRight: 'none',
        display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 16px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#E8CA75', lineHeight: 1.2 }}>
            Balvanera
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2, letterSpacing: '0.05em' }}>
            Polo &amp; Country Club
          </div>
        </div>
        <button onClick={onClose} className="sidebar-close-btn"
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4, borderRadius: 6 }}>
          <X size={16} />
        </button>
      </div>

      {/* Nav con secciones */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>

        {/* Inicio — portal universal para todos los roles */}
        <Link
          href="/inicio"
          onClick={onClose}
          className="nav-item"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 6, marginBottom: 2,
            fontSize: 13, color: pathname === '/inicio' ? '#E8CA75' : 'rgba(255,255,255,0.7)',
            background: pathname === '/inicio' ? 'rgba(196,160,72,0.15)' : 'transparent',
            borderLeft: pathname === '/inicio' ? '2px solid #C4A048' : '2px solid transparent',
            textDecoration: 'none', transition: 'all 0.15s',
          }}
        >
          <Home size={15} />
          <span>Inicio</span>
        </Link>

        {/* Secciones por rol */}
        {sections.map(sec => (
          <div key={sec.section}>
            <div style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
              padding: '12px 10px 4px',
            }}>
              {sec.section}
            </div>
            {sec.items.map(item => {
              const Icon   = item.icon
              const isRpt  = item.label === 'Reportes'
              const active = isRpt
                ? pathname.startsWith('/reportes')
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: isRpt ? '5px 10px' : '7px 10px',
                    borderRadius: 6, marginBottom: 2,
                    fontSize: isRpt ? 11 : 13,
                    color: active ? '#E8CA75' : 'rgba(255,255,255,0.7)',
                    background: active ? 'rgba(196,160,72,0.15)' : 'transparent',
                    borderLeft: active ? '2px solid #C4A048' : '2px solid transparent',
                    textDecoration: 'none', transition: 'all 0.15s',
                    opacity: isRpt ? 0.75 : 1,
                    borderTop: isRpt ? '1px dashed rgba(255,255,255,0.1)' : undefined,
                    marginTop: isRpt ? 4 : 0,
                  }}
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
      <div style={{ padding: '10px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          padding: '8px 10px', background: 'rgba(255,255,255,0.07)', borderRadius: 8,
        }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#C4A048', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={14} style={{ color: '#1a1f3e' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {authUser?.nombre ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: '#E8CA75', fontWeight: 500 }}>
              {label}
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.45)', fontSize: 12, borderRadius: 6, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#f87171' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
