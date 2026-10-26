'use client'
import {
  MapPin, MapPinned, Users, FileText, Receipt, Shield,
  AlertTriangle, Building2, Home, ChevronRight, MessageSquare, ShieldCheck, HardHat, Scale,
  Wrench, Truck, Hammer, ClipboardList, ClipboardCheck, ListChecks, Zap,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/layout/PageHeader'

const MODULOS = [
  { key: 'lotes',        permKey: 'lotes',        label: 'Lotes',        icon: MapPin,        color: '#3F4A75', desc: 'Padrón de lotes y estatus de venta',          href: '/lotes'        },
  { key: 'propietarios', permKey: 'propietarios', label: 'Propietarios', icon: Users,         color: '#15803d', desc: 'Titulares, contactos y familiares',             href: '/propietarios' },
  { key: 'cobranza',     permKey: 'cobranza',     label: 'Cobranza',     icon: FileText,      color: '#C4A048', desc: 'Cargos, estados de cuenta y recibos',           href: '/cobranza'     },
  { key: 'facturas',     permKey: 'facturas',     label: 'Facturas',     icon: Receipt,       color: '#dc2626', desc: 'CFDI y facturación electrónica',                href: '/facturas'     },
  { key: 'accesos',      permKey: 'accesos',      label: 'Accesos',      icon: Shield,        color: '#0891b2', desc: 'Bitácora de accesos y vehículos registrados',   href: '/accesos'      },
  { key: 'incidencias',  permKey: 'incidencias',  label: 'Incidencias',  icon: AlertTriangle, color: '#dc2626', desc: 'Reportes de incidencias y seguimiento',         href: '/incidencias'  },
  { key: 'vigilancia-extras', permKey: 'vigilancia-extras', label: 'Vigilancia', icon: ShieldCheck, color: '#334155', desc: 'Extras de vigilancia: captura, autorización y OP', href: '/vigilancia-extras' },
  { key: 'vigilancia-novedades', permKey: 'vigilancia-novedades', label: 'Parte de Novedades', icon: ClipboardList, color: '#475569', desc: 'Parte diario de vigilancia: novedades por lote y ubicación', href: '/vigilancia-novedades' },
  { key: 'contratos',    permKey: 'contratos',    label: 'Contratos',    icon: FileText,      color: '#7c3aed', desc: 'Gestión de contratos de compraventa',           href: '/contratos'    },
  { key: 'escrituras',   permKey: 'escrituras',   label: 'Escrituras',   icon: Building2,     color: '#d97706', desc: 'Documentos notariales y escrituración',         href: '/escrituras'   },
  { key: 'construcciones', permKey: 'construcciones', label: 'Construcciones', icon: HardHat, color: '#d97706', desc: 'Expedientes de obra: checklist, avances e incidencias', href: '/construcciones' },
  { key: 'afectaciones', permKey: 'afectaciones', label: 'Servidumbres y Afectaciones', icon: Scale, color: '#0284c7', desc: 'Servidumbres, pasos y afectaciones sobre lotes', href: '/afectaciones' },
  { key: 'comunicados',  permKey: 'comunicados',  label: 'Comunicados',  icon: MessageSquare, color: '#0d9488', desc: 'Avisos y comunicados a residentes',             href: '/comunicados'  },
]

const GRUPOS_MANTTO = [
  {
    label: 'Mantenimiento',
    color: '#b45309',
    items: [
      { key: 'mantenimiento',  permKey: 'mantenimiento', label: 'Mantenimiento',           icon: Wrench,        desc: 'Programa anual de mantenimiento preventivo',          href: '/residencial/mantenimiento/gestion' },
      { key: 'ot-residencial', permKey: 'mantenimiento', label: 'OT Mantto. Fraccionamiento',  icon: ClipboardList, desc: 'Órdenes de trabajo del mantenimiento del fraccionamiento',    href: '/residencial/mantenimiento/ot-residencial' },
      { key: 'ot-generales',   permKey: 'mantenimiento', label: "OT's Generales",          icon: ClipboardCheck, desc: 'Órdenes de trabajo de la cuadrilla general',          href: '/residencial/mantenimiento/ot-generales' },
      { key: 'equipo-flota',   permKey: 'equipo-flota',  label: 'Vehículos y Maquinaria',  icon: Truck,         desc: 'Flotilla, mantenimientos y bitácora de uso',           href: '/equipo-flota' },
      { key: 'herramientas',   permKey: 'herramientas',  label: 'Equipo y Herramienta',    icon: Hammer,        desc: 'Catálogo, préstamos y mantenimiento de herramienta',   href: '/herramientas' },
    ],
  },
  {
    label: 'Capex',
    color: '#059669',
    items: [
      { key: 'conceptos', permKey: 'mantenimiento', label: 'Catálogo de Conceptos', icon: ListChecks, desc: 'Conceptos de obra/mantenimiento y matriz de PU',   href: '/residencial/mantenimiento/conceptos' },
      { key: 'capex',     permKey: 'capex',         label: 'Proyectos CAPEX',       icon: Building2,  desc: 'Avance y presupuesto de proyectos de inversión',    href: '/capex' },
      { key: 'cat_mano_obra',  permKey: 'mantenimiento', label: 'Categorías Mano de Obra', icon: HardHat,       desc: 'Sueldo diario de referencia por categoría',            href: '/residencial/mantenimiento/categorias-mano-obra' },
    ],
  },
  {
    label: 'Servicios',
    color: '#0891b2',
    items: [
      { key: 'servicios', permKey: 'mantenimiento', label: 'Servicios', icon: Zap, desc: 'Medidores de CFE, Agua y Gas LP: consumo y facturación', href: '/residencial/mantenimiento/servicios' },
    ],
  },
]

export default function ResidencialPage() {
  const { can } = useAuth()
  const router  = useRouter()

  const visibles = MODULOS.filter(m => can(m.permKey))
  const gruposManto = GRUPOS_MANTTO
    .map(g => ({ ...g, items: g.items.filter(m => can(m.permKey)) }))
    .filter(g => g.items.length > 0)

  if (visibles.length === 0 && gruposManto.length === 0) {
    return (
      <div style={{ padding: '48px 36px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Sin acceso a módulos del fraccionamiento.
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader
        variant="xl"
        icon={Home}
        eyebrowLabel="Módulo"
        title="Fraccionamiento"
        subtitle="Gestión de lotes, propietarios y servicios del fraccionamiento"
      />

      {/* Grid de módulos */}
      {visibles.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 24 }}>
        {visibles.map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push(m.href)}
              className="card card-hover"
              style={{ padding: '18px 20px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} style={{ color: m.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>}

      {/* Mantenimiento (trasladado desde el módulo Operaciones) */}
      {gruposManto.map(grupo => (
        <div key={grupo.label} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 4, height: 16, borderRadius: 2, background: grupo.color }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: grupo.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {grupo.label}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {grupo.items.map(m => {
              const Icon = m.icon
              return (
                <button key={m.key}
                  onClick={() => router.push(m.href)}
                  className="card card-hover"
                  style={{ padding: '18px 20px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: grupo.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} style={{ color: grupo.color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
                  </div>
                  <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Expediente — acceso rápido separado */}
      {can('lotes') && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Acceso Rápido
          </div>
          <button
            onClick={() => router.push('/lotes/expediente')}
            className="card card-hover"
            style={{ width: '100%', padding: '16px 20px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eef0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MapPinned size={18} style={{ color: '#3F4A75' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Expedientes</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#eef0f8', color: '#3F4A75', border: '1px solid #dde0f2' }}>
                  Vista unificada por lote
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Documentos, propietario, cobranza e historial de un lote en una sola vista
              </div>
            </div>
            <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
          </button>
        </>
      )}
    </div>
  )
}
