'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Wrench, Zap, Building2, ShoppingCart,
  BarChart3, Settings, LogOut, KeyRound, User, Users, X, Landmark,
  Flag, Truck, Hammer, DollarSign, CalendarDays, MessageCircle, LayoutDashboard, BookOpen, Store, Leaf, Briefcase,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useConfig } from '@/lib/ConfigContext'

const hexToRgba = (hex: string, alpha: number) => {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Ícono caballo inline (no disponible en lucide)
const HorseIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
    <circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/>
  </svg>
)

// Ícono taco de polo inline (no disponible en lucide)
const PoloIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3"/>
    <path d="M3 21c0-4 3-7 7-7h4c4 0 7 3 7 7"/>
    <path d="M17 12l3-3"/>
    <path d="M19 9l-1-1 1-1"/>
  </svg>
)

type Rol =
  | 'superadmin'
  | 'admin'
  | 'admin_lector'
  | 'admin_finanzas'
  | 'admin_low_level'
  | 'admin_tesoreria'
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
  | 'admin_organismo'
  | 'caja_organismo'
  | 'aux_organismo'

type NavItem = { label: string; href: string; icon: any; exact?: boolean }
type NavSection = { section: string; items: NavItem[] }

const ROL_LABEL: Record<string, string> = {
  superadmin:          'Super Administrador',
  admin:               'Administrador',
  admin_lector:        'Admin Solo Lectura',
  admin_finanzas:      'Administrador de Finanzas',
  admin_low_level:     'Administrador (Bajo Nivel)',
  admin_tesoreria:     'Administrador de Tesorería',
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
  admin_organismo:     'Administrador (Organismo)',
  caja_organismo:      'Caja (Organismo)',
  aux_organismo:       'Auxiliar (Organismo)',
  admin_golf:            'Admin Golf',
  admin_golf_lector:     'Admin Golf (Lectura)',
  admin_golf_finanzas:   'Admin Golf (Finanzas)',
  admin_golf_tesoreria:  'Admin Golf (Tesorería)',
  admin_golf_low_level:  'Admin Golf (Bajo Nivel)',
  admin_fracc:           'Admin Fraccionamiento',
  admin_fracc_lector:    'Admin Fracc. (Lectura)',
  admin_fracc_finanzas:  'Admin Fracc. (Finanzas)',
  admin_fracc_tesoreria: 'Admin Fracc. (Tesorería)',
  admin_fracc_low_level: 'Admin Fracc. (Bajo Nivel)',
}

// ── Filtro del menú para roles por lado (admin_golf_*, admin_fracc_*) ──────────
// Hubs/rutas exclusivos de cada lado; lo compartido (compras, finanzas, hr,
// mantenimiento, catálogos…) se queda en ambos.
const RUTAS_CLUB   = ['/golf', '/hipico', '/hospitality', '/eventos', '/polo', '/locales']
const RUTAS_FRACC  = ['/residencial', '/lotes', '/propietarios', '/cobranza', '/facturas', '/escrituras',
                      '/contratos', '/afectaciones', '/construcciones', '/accesos', '/incidencias',
                      '/comunicados', '/vigilancia-extras', '/vigilancia-novedades']
const empiezaEn = (href: string, bases: string[], exacto = false) =>
  bases.some(b => href === b || (!exacto && (href.startsWith(b + '/') || href.startsWith(b + '?'))))

function filtrarPorLado(sections: NavSection[], lado: 'golf' | 'fracc' | null): NavSection[] {
  if (!lado) return sections
  return sections
    .map(sec => {
      const items = sec.items
        .filter(it => {
          const h = it.href.split('?')[0]
          if (lado === 'fracc') return !empiezaEn(h, RUTAS_CLUB)
          // golf: quita el hub de Fraccionamiento (sus sub-rutas de mantenimiento se conservan)
          if (h === '/residencial') return false
          return !empiezaEn(h, RUTAS_FRACC.filter(r => r !== '/residencial'))
        })
        .map(it => {
          // Reporte combinado del bloque Fraccionamiento → solo la parte compartida
          if (lado === 'golf' && it.href === '/reportes?grupo=residencial,mantenimiento,vigilancia')
            return { ...it, href: '/reportes?grupo=mantenimiento' }
          return it
        })
      const seccion = lado === 'golf' && sec.section === 'Fraccionamiento' ? 'Mantenimiento' : sec.section
      return { ...sec, section: seccion, items }
    })
    .filter(sec => sec.items.length > 0)
}

// Ítem de reportes con estilo diferenciado (pie de sección)
const RPT = (grupo: string): NavItem => ({
  label: 'Reportes',
  href:  `/reportes?grupo=${grupo}`,
  icon:  BarChart3,
})

// Los hubs de Fraccionamiento comparten prefijo de URL: cada ítem se activa solo en sus rutas
const MANTTO_BASE = '/residencial/mantenimiento'
const CAPEX_RUTAS = [`${MANTTO_BASE}/capex`, `${MANTTO_BASE}/conceptos`, `${MANTTO_BASE}/categorias-mano-obra`, '/capex']
function isActiveNav(pathname: string, href: string): boolean {
  if (href === '/residencial') return pathname === '/residencial'
  if (href === `${MANTTO_BASE}/servicios`) return pathname.startsWith(href)
  if (href === `${MANTTO_BASE}/capex`) return CAPEX_RUTAS.some(r => pathname.startsWith(r))
  if (href === MANTTO_BASE) {
    return pathname.startsWith(MANTTO_BASE)
      && !pathname.startsWith(`${MANTTO_BASE}/servicios`)
      && !CAPEX_RUTAS.some(r => pathname.startsWith(r))
  }
  return pathname.startsWith(href)
}

const NAV_POR_ROL: Record<Rol, NavSection[]> = {

  superadmin: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
    { section: 'HR', items: [
      { label: 'HR',             href: '/hr',              icon: Briefcase     },
      RPT('hr'),
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Locales Comerciales', href: '/locales', icon: Building2 },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck },
      { label: 'Equipo y Herramienta', href: '/herramientas', icon: Hammer },
      { label: 'Servicios Club', href: '/golf/servicios', icon: Zap },
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',             href: '/polo',                icon: PoloIcon  },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
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
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
    { section: 'HR', items: [
      { label: 'HR',             href: '/hr',              icon: Briefcase     },
      RPT('hr'),
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Locales Comerciales', href: '/locales', icon: Building2 },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck },
      { label: 'Equipo y Herramienta', href: '/herramientas', icon: Hammer },
      { label: 'Servicios Club', href: '/golf/servicios', icon: Zap },
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',             href: '/polo',                icon: PoloIcon  },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  // ── Admin (Bajo Nivel): mismo menú que admin, se le irán quitando
  // permisos puntuales (p.ej. no puede editar el Catálogo de Productos POS) ──
  admin_low_level: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
    { section: 'HR', items: [
      { label: 'HR',             href: '/hr',              icon: Briefcase     },
      RPT('hr'),
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Locales Comerciales', href: '/locales', icon: Building2 },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck },
      { label: 'Equipo y Herramienta', href: '/herramientas', icon: Hammer },
      { label: 'Servicios Club', href: '/golf/servicios', icon: Zap },
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',             href: '/polo',                icon: PoloIcon  },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  // ── Admin de Tesorería: mismo menú que admin ───────────────
  admin_tesoreria: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
    { section: 'HR', items: [
      { label: 'HR',             href: '/hr',              icon: Briefcase     },
      RPT('hr'),
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Locales Comerciales', href: '/locales', icon: Building2 },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck },
      { label: 'Equipo y Herramienta', href: '/herramientas', icon: Hammer },
      { label: 'Servicios Club', href: '/golf/servicios', icon: Zap },
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',             href: '/polo',                icon: PoloIcon  },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  // ── Admin de Finanzas: mismo menú que admin ───────────────
  admin_finanzas: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Locales Comerciales', href: '/locales', icon: Building2 },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck },
      { label: 'Equipo y Herramienta', href: '/herramientas', icon: Hammer },
      { label: 'Servicios Club', href: '/golf/servicios', icon: Zap },
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',             href: '/polo',                icon: PoloIcon  },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  // ── Admin Solo Lectura: mismo menú que admin ──────────────
  admin_lector: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Locales Comerciales', href: '/locales', icon: Building2 },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck },
      { label: 'Equipo y Herramienta', href: '/herramientas', icon: Hammer },
      { label: 'Servicios Club', href: '/golf/servicios', icon: Zap },
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',             href: '/polo',                icon: PoloIcon  },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  usuarioadmin: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      RPT('residencial,vigilancia'),
    ]},
    { section: 'Club', items: [
      { label: 'Punto de Venta',  href: '/golf/pos',            icon: Store     },
      { label: 'Golf',            href: '/golf',                icon: Flag      },
      { label: 'Administración',  href: '/golf/administracion', icon: Users     },
      { label: 'Locales Comerciales', href: '/locales', icon: Building2 },
      { label: 'Mantto. Campo',   href: '/golf/mantto-campo',   icon: Leaf      },
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck },
      { label: 'Equipo y Herramienta', href: '/herramientas', icon: Hammer },
      { label: 'Servicios Club', href: '/golf/servicios', icon: Zap },
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',             href: '/polo',                icon: PoloIcon  },
      RPT('golf'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  usuariomantto: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      RPT('ingresos'),
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  atencion_residentes: [
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
  ],

  cobranza: [
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      RPT('residencial,vigilancia'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
    ]},
  ],

  vigilancia: [
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
    ]},
  ],

  compras: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Mantto. Campo', items: [
      { label: 'Vehículos y Maquinaria', href: '/equipo-flota', icon: Truck },
      { label: 'Equipo y Herramienta', href: '/herramientas', icon: Hammer },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
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
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
  ],

  fraccionamiento: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
      RPT('residencial,mantenimiento,vigilancia'),
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
  ],

  tesoreria: [
    { section: 'Dashboards', items: [
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
      { label: 'Reportes', href: '/reportes', icon: BarChart3 },
    ]},
  ],

  seguridad: [
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
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
      { label: 'Dashboard', href: '/dashboards', icon: LayoutDashboard },
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
      { label: 'Locales Comerciales', href: '/locales', icon: Building2 },
      { label: 'Mantto. Campo',  href: '/golf/mantto-campo',   icon: Leaf  },
      { label: 'Servicios Club', href: '/golf/servicios', icon: Zap },
      RPT('golf'),
    ]},
    { section: 'Hípico', items: [
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',              href: '/polo',                     icon: PoloIcon  },
      RPT('hipico'),
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
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',              href: '/polo',                     icon: PoloIcon  },
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
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      RPT('residencial,vigilancia'),
    ]},
  ],

  admin_organismo: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
    ]},
    { section: 'Finanzas', items: [
      { label: 'Tesorería',      href: '/tesoreria',      icon: Landmark      },
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
      { label: 'Flujo de Efectivo', href: '/presupuestos',   icon: BookOpen      },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: Settings      },
    ]},
  ],

  caja_organismo: [
    { section: 'Finanzas', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: DollarSign    },
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
  ],

  aux_organismo: [
    { section: 'Fraccionamiento', items: [
      { label: 'Fraccionamiento',    href: '/residencial',    icon: Home          },
      { label: 'Mantenimiento',      href: '/residencial/mantenimiento',        icon: Wrench        },
      { label: 'Servicios',           href: '/residencial/mantenimiento/servicios', icon: Zap           },
      { label: 'Capex',               href: '/residencial/mantenimiento/capex',     icon: Building2     },
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
  ],

  usuariohospitality: [
    { section: 'Club', items: [
      { label: 'Torneos Golf',      href: '/golf/torneos',            icon: Flag      },
    ]},
    { section: 'Hípico', items: [
      { label: 'Hípico', href: '/hipico', icon: HorseIcon },
      { label: 'Eventos', href: '/eventos', icon: CalendarDays },
      { label: 'Polo',              href: '/polo',                     icon: PoloIcon  },
      { label: 'Reportes Hípico',   href: '/reportes?grupo=hipico',       icon: BarChart3 },
      { label: 'Reportes Eventos',  href: '/reportes?grupo=hospitality',  icon: BarChart3 },
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
  const { config } = useConfig()

  const rol      = (authUser?.rol ?? 'vigilancia') as Rol
  const sections = filtrarPorLado(NAV_POR_ROL[rol] ?? [], authUser?.lado ?? null)
  const label    = authUser?.rolReal ? (ROL_LABEL[authUser.rolReal] ?? authUser.rolReal) : '—'

  const bg          = config.color_sidebar_bg
  const acento      = config.color_sidebar_acento
  const acentoClaro = config.color_sidebar_acento_claro
  const acentoBg    = hexToRgba(acento, 0.15)

  return (
    <aside
      className={`sidebar ${open ? 'open' : ''}`}
      style={{
        width: 220, flexShrink: 0,
        background: bg,
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
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: acentoClaro, lineHeight: 1.2 }}>
            {config.org_nombre_corto}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2, letterSpacing: '0.05em' }}>
            {config.org_subtitulo}
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
            fontSize: 13, color: pathname === '/inicio' ? acentoClaro : 'rgba(255,255,255,0.7)',
            background: pathname === '/inicio' ? acentoBg : 'transparent',
            borderLeft: pathname === '/inicio' ? `2px solid ${acento}` : '2px solid transparent',
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
                : isActiveNav(pathname, item.href)
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
                    color: active ? acentoClaro : 'rgba(255,255,255,0.7)',
                    background: active ? acentoBg : 'transparent',
                    borderLeft: active ? `2px solid ${acento}` : '2px solid transparent',
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
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: acento, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={14} style={{ color: '#1a1f3e' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {authUser?.nombre ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: acentoClaro, fontWeight: 500 }}>
              {label}
            </div>
          </div>
        </div>
        <a
          href="/cambiar-password"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', color: 'rgba(255,255,255,0.45)', fontSize: 12, borderRadius: 6,
            textDecoration: 'none', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          <KeyRound size={13} />
          Cambiar contraseña
        </a>
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
