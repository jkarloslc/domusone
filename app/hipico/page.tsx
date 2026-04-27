'use client'
import { useRouter } from 'next/navigation'
import {
  Users, Home, FileText, DollarSign, Stethoscope, ChevronRight,
} from 'lucide-react'

// Ícono caballo inline
const HorseIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
    <circle cx="7.5" cy="14.5" r="1.5"/>
    <circle cx="16.5" cy="14.5" r="1.5"/>
  </svg>
)

const MODULOS = [
  {
    key: 'arrendatarios',
    label: 'Arrendatarios',
    desc: 'Propietarios de caballos, datos de contacto y expediente',
    icon: Users,
    color: '#7c3aed',
    href: '/hipico/arrendatarios',
  },
  {
    key: 'caballerizas',
    label: 'Caballerizas',
    desc: 'Catálogo de boxes, secciones y disponibilidad',
    icon: Home,
    color: '#b45309',
    href: '/hipico/caballerizas',
  },
  {
    key: 'caballos',
    label: 'Caballos',
    desc: 'Registro de caballos, raza, propietario y caballeriza asignada',
    icon: HorseIcon,
    color: '#065f46',
    href: '/hipico/caballos',
  },
  {
    key: 'contratos',
    label: 'Contratos',
    desc: 'Contratos de arrendamiento de caballerizas, renta y vencimientos',
    icon: FileText,
    color: '#0369a1',
    href: '/hipico/contratos',
  },
  {
    key: 'cobranza',
    label: 'Cobranza',
    desc: 'Cargos, pagos y estado de cuenta por arrendatario',
    icon: DollarSign,
    color: '#dc2626',
    href: '/hipico/cobranza',
  },
  {
    key: 'servicios',
    label: 'Servicios',
    desc: 'Bitácora veterinaria, herrajes y alimentación por caballo',
    icon: Stethoscope,
    color: '#0891b2',
    href: '/hipico/servicios',
  },
]

export default function HipicoPage() {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <HorseIcon size={16} />
            <span className="page-eyebrow-label" style={{ color: 'var(--blue)' }}>Módulo</span>
          </div>
          <h1 className="page-title-xl">Hípico</h1>
          <p className="page-subtitle">Administración de caballerizas, arrendatarios, caballos y cobranza</p>
        </div>
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => router.push(m.href)}
              className="card card-hover"
              style={{
                padding: '18px 20px',
                textAlign: 'left',
                background: '#fff',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: m.color + '15',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
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
