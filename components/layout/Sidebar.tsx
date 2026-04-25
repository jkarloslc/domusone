'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, Users, ShoppingCart,
  BarChart3, BookOpen, Settings, LogOut, User, X, Calendar, Landmark, MessageSquare,
  MessageCircle, Truck, TrendingUp, Flag, Star,
} from 'lucide-react'
import HorseIcon from '@/components/ui/HorseIcon'
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
  | 'usuariogolf'
  | 'usuariohipico'
  | 'usuariohospitality'

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
  usuariogolf:          'Operador Golf',
  usuariohipico:        'Operador Hípico',
  usuariohospitality:   'Operador Hospitality',
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
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Club', items: [
      { label: 'Club',           href: '/golf',           icon: Flag          },
      RPT('golf'),
    ]},
    { section: 'Hípico', items: [
      { label: 'Hípico',         href: '/hipico',         icon: HorseIcon     },
      RPT('hipico'),
    ]},
    { section: 'Hospitality', items: [
      { label: 'Hospitality',    href: '/hospitality',    icon: Star          },
      RPT('hospitality'),
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
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: BookOpen      },
      { label: 'Usuarios',       href: '/usuarios',       icon: Users         },
      { label: 'Config.',        href: '/configuracion',  icon: Settings      },
    ]},
  ],

  admin: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Club', items: [
      { label: 'Club',           href: '/golf',           icon: Flag          },
      RPT('golf'),
    ]},
    { section: 'Hípico', items: [
      { label: 'Hípico',         href: '/hipico',         icon: HorseIcon     },
      RPT('hipico'),
    ]},
    { section: 'Hospitality', items: [
      { label: 'Hospitality',    href: '/hospitality',    icon: Star          },
      RPT('hospitality'),
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
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: BookOpen      },
    ]},
  ],

  // Admin sin Mantenimiento
  usuarioadmin: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Club', items: [
      { label: 'Club',           href: '/golf',           icon: Flag          },
      RPT('golf'),
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
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: BookOpen      },
    ]},
  ],

  // Admin sin Tesorería
  usuariomantto: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Club', items: [
      { label: 'Club',           href: '/golf',           icon: Flag          },
      RPT('golf'),
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
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
    { section: 'Sistema', items: [
      { label: 'Catálogos',      href: '/catalogos',      icon: BookOpen      },
    ]},
  ],

  atencion_residentes: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Calendar      },
      RPT('mantenimiento'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Comunicados',    href: '/comunicados',    icon: MessageSquare },
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  cobranza: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
      RPT('residencial'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  vigilancia: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  compras: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  almacen: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  mantenimiento: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
    ]},
    { section: 'Operaciones', items: [
      { label: 'Mantenimiento',  href: '/mantenimiento',  icon: Calendar      },
      { label: 'Equipo & Vehículos', href: '/equipo-flota',   icon: Truck         },
      RPT('mantenimiento'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  fraccionamiento: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
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
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
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
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  ingresos: [
    { section: 'Ingresos', items: [
      { label: 'Ingresos',       href: '/ingresos',       icon: TrendingUp    },
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  compras_supervisor: [
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
      RPT('compras'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
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

  seguridad: [
    { section: 'Residencial', items: [
      { label: 'Residencial',    href: '/residencial',    icon: Home          },
    ]},
    { section: 'Compras', items: [
      { label: 'Compras',        href: '/compras',        icon: ShoppingCart  },
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  usuariogolf: [
    { section: 'Club', items: [
      { label: 'Club',           href: '/golf',           icon: Flag          },
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
      { label: 'Hípico',         href: '/hipico',         icon: HorseIcon     },
      RPT('hipico'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
    ]},
  ],

  usuariohospitality: [
    { section: 'Hospitality', items: [
      { label: 'Hospitality',    href: '/hospitality',    icon: Star          },
      RPT('hospitality'),
    ]},
    { section: 'Comunicación', items: [
      { label: 'Chat',           href: '/tablero',        icon: MessageCircle },
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
        background: '#2d3660',
        borderRight: 'none',
        display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0,
        overflowY: 'auto',
      }}
    >
      {/* Header / Logo */}
      <div style={{
        padding: '20px 16px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            {/* Gold mark */}
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'rgba(196,160,72,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#C4A048' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: '#f0ead6', lineHeight: 1.2 }}>
              Balvanera
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', paddingLeft: 34 }}>
            Golf & Residencial
          </div>
        </div>
        <button onClick={onClose} className="sidebar-close-btn"
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 4, borderRadius: 6 }}>
          <X size={16} />
        </button>
      </div>

      {/* Nav con secciones */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>

        {/* Inicio — visible para todos excepto roles de acceso restringido */}
        {rol !== 'usuario_solicitante' && rol !== 'usuariogolf' && rol !== 'usuariohipico' && (
          <Link
            href="/inicio"
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', paddingLeft: pathname === '/inicio' ? 8 : 10,
              margin: '1px 0', borderRadius: 7,
              fontSize: 13, textDecoration: 'none', transition: 'all 0.15s',
              borderLeft: pathname === '/inicio' ? '2px solid #C4A048' : '2px solid transparent',
              ...(pathname === '/inicio'
                ? { background: 'rgba(196,160,72,0.15)', color: '#E8CA75', fontWeight: 500 }
                : { color: 'rgba(255,255,255,0.6)' }
              ),
            }}
          >
            <Home size={15} style={{ flexShrink: 0 }} />
            <span>Inicio</span>
          </Link>
        )}

        {/* Secciones por rol */}
        {sections.map(sec => (
          <div key={sec.section}>
            <div style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
              padding: '12px 10px 4px',
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
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: isRpt ? '5px 10px 7px' : '7px 10px',
                    paddingLeft: active ? 8 : 10,
                    margin: isRpt ? '4px 0 1px' : '1px 0',
                    borderRadius: 7,
                    fontSize: isRpt ? 11 : 13,
                    textDecoration: 'none', transition: 'all 0.15s',
                    borderLeft: active ? '2px solid #C4A048' : '2px solid transparent',
                    borderTop: isRpt ? '1px dashed rgba(255,255,255,0.1)' : 'none',
                    ...(active
                      ? { background: 'rgba(196,160,72,0.15)', color: '#E8CA75', fontWeight: 500 }
                      : { color: isRpt ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.58)' }
                    ),
                  }}
                >
                  <Icon size={isRpt ? 13 : 15} style={{ flexShrink: 0 }} />
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
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(196,160,72,0.25)',
            border: '1px solid rgba(196,160,72,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <User size={14} style={{ color: '#E8CA75' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {authUser?.nombre ?? '—'}
            </div>
            <div style={{ fontSize: 10, color: '#C4A048', fontWeight: 500 }}>
              {label}
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.35)', fontSize: 12, borderRadius: 6, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.15)'; e.currentTarget.style.color = '#f87171' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
        >
          <LogOut size={13} />
          Cerrar sesión
        </button>
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
            Powered by <strong style={{ color: '#C4A048', opacity: 0.8, letterSpacing: '0.02em' }}>JK</strong>
          </span>
        </div>
      </div>
    </aside>
  )
}
