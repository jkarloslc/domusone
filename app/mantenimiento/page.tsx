'use client'
import {
  Wrench, Truck, Hammer, Building2, ChevronRight, ClipboardList,
  ClipboardCheck, ListChecks, Zap,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

const GRUPOS = [
  {
    label: 'Mantenimiento',
    color: '#b45309',
    items: [
      { key: 'mantenimiento',  permKey: 'mantenimiento', label: 'Mantenimiento',           icon: Wrench,        desc: 'Programa anual de mantenimiento preventivo',          href: '/mantenimiento/gestion' },
      { key: 'ot-residencial', permKey: 'mantenimiento', label: 'OT Mantto. Residencial',  icon: ClipboardList, desc: 'Órdenes de trabajo del mantenimiento residencial',    href: '/mantenimiento/ot-residencial' },
      { key: 'ot-generales',   permKey: 'mantenimiento', label: "OT's Generales",          icon: ClipboardCheck, desc: 'Órdenes de trabajo de la cuadrilla general',          href: '/mantenimiento/ot-generales' },
      { key: 'equipo-flota',   permKey: 'equipo-flota',  label: 'Vehículos y Maquinaria',  icon: Truck,         desc: 'Flotilla, mantenimientos y bitácora de uso',           href: '/equipo-flota' },
      { key: 'herramientas',   permKey: 'herramientas',  label: 'Equipo y Herramienta',    icon: Hammer,        desc: 'Catálogo, préstamos y mantenimiento de herramienta',   href: '/herramientas' },
    ],
  },
  {
    label: 'Capex',
    color: '#059669',
    items: [
      { key: 'conceptos', permKey: 'mantenimiento', label: 'Catálogo de Conceptos', icon: ListChecks, desc: 'Conceptos de obra/mantenimiento y matriz de PU',   href: '/mantenimiento/conceptos' },
      { key: 'capex',     permKey: 'capex',         label: 'Proyectos CAPEX',       icon: Building2,  desc: 'Avance y presupuesto de proyectos de inversión',    href: '/capex' },
    ],
  },
  {
    label: 'Servicios',
    color: '#0891b2',
    items: [
      { key: 'servicios', permKey: 'mantenimiento', label: 'Servicios', icon: Zap, desc: 'Medidores de CFE y Agua: consumo y facturación', href: '/mantenimiento/servicios' },
    ],
  },
]

export default function OperacionesPage() {
  const { can } = useAuth()
  const router  = useRouter()

  const gruposVisibles = GRUPOS
    .map(g => ({ ...g, items: g.items.filter(m => can(m.permKey)) }))
    .filter(g => g.items.length > 0)

  if (gruposVisibles.length === 0) {
    return (
      <div style={{ padding: '48px 36px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Sin acceso a módulos de operaciones.
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Wrench size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Mantenimiento</h1>
          <p className="page-subtitle">Mantenimiento, vehículos, herramienta y proyectos de inversión</p>
        </div>
      </div>

      {/* Grupos */}
      {gruposVisibles.map(grupo => (
        <div key={grupo.label} style={{ marginBottom: 32 }}>
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
    </div>
  )
}
