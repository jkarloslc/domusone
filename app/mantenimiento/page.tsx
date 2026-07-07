'use client'
import {
  Wrench, Truck, Hammer, Building2, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

const MODULOS = [
  { key: 'mantenimiento', permKey: 'mantenimiento', label: 'Mantenimiento',          icon: Wrench,    color: '#b45309', desc: 'Programa anual, órdenes de trabajo y servicios',    href: '/mantenimiento/gestion' },
  { key: 'equipo-flota',  permKey: 'equipo-flota',  label: 'Vehículos y Maquinaria', icon: Truck,     color: '#0891b2', desc: 'Flotilla, mantenimientos y bitácora de uso',         href: '/equipo-flota'  },
  { key: 'herramientas',  permKey: 'herramientas',  label: 'Equipo y Herramienta',   icon: Hammer,    color: '#7c3aed', desc: 'Catálogo, préstamos y mantenimiento de herramienta', href: '/herramientas'  },
  { key: 'capex',         permKey: 'capex',         label: 'Proyectos CAPEX',        icon: Building2, color: '#059669', desc: 'Avance y presupuesto de proyectos de inversión',     href: '/capex'         },
]

export default function OperacionesPage() {
  const { can } = useAuth()
  const router  = useRouter()

  const visibles = MODULOS.filter(m => can(m.permKey))

  if (visibles.length === 0) {
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

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
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
      </div>
    </div>
  )
}
