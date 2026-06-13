import React from 'react'
import Link from 'next/link'
import {
  Users, Home, DollarSign, Stethoscope, ChevronRight,
} from 'lucide-react'

const HorseIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
    <circle cx="7.5" cy="14.5" r="1.5"/>
    <circle cx="16.5" cy="14.5" r="1.5"/>
  </svg>
)

const PoloIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3"/>
    <path d="M3 21c0-4 3-7 7-7h4c4 0 7 3 7 7"/>
    <path d="M17 12l3-3"/>
    <path d="M19 9l-1-1 1-1"/>
  </svg>
)

const CABALLERIZAS_MODULOS = [
  {
    key: 'socios',
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
    key: 'cobranza',
    label: 'Cobranza',
    desc: 'Cargos, pagos y estado de cuenta por socio',
    icon: DollarSign,
    color: '#dc2626',
    href: '/hipico/cobranza',
  },
]

const POLO_MODULOS = [
  {
    key: 'caballos',
    label: 'Caballos',
    desc: 'Registro de caballos, raza, propietario y caballeriza asignada',
    icon: HorseIcon,
    color: '#065f46',
    href: '/hipico/caballos',
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

type Modulo = { key: string; label: string; desc: string; icon: (p: { size?: number }) => React.ReactNode; color: string; href: string }

function ModuloCard({ m }: { m: Modulo }) {
  const Icon = m.icon
  return (
    <Link
      href={m.href}
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
        textDecoration: 'none',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: m.color + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: m.color,
      }}>
        <Icon size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
      </div>
      <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
    </Link>
  )
}

export default function HipicoPage() {
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
          <p className="page-subtitle">Administración de caballerizas, socios y cobranza</p>
        </div>
      </div>

      {/* Sección Caballerizas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 32 }}>
        {CABALLERIZAS_MODULOS.map(m => <ModuloCard key={m.key} m={m} />)}
      </div>

      {/* Separador Polo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#065f46' + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#065f46' }}>
            <HorseIcon size={15} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#065f46', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Polo</span>
        </div>
        <div style={{ flex: 1, height: 1, background: '#065f4622' }} />
      </div>

      {/* Grid Polo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {POLO_MODULOS.map(m => <ModuloCard key={m.key} m={m} />)}
      </div>

    </div>
  )
}
