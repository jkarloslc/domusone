import React from 'react'
import Link from 'next/link'
import {
  Users, Building2, DollarSign, ChevronRight, ChevronLeft,
} from 'lucide-react'

const MODULOS = [
  {
    key: 'arrendatarios',
    label: 'Arrendatarios',
    desc: 'Padrón de arrendatarios, datos fiscales y de contacto',
    icon: Users,
    color: '#7c3aed',
    href: '/locales/arrendatarios',
  },
  {
    key: 'propiedades',
    label: 'Locales / Propiedades',
    desc: 'Catálogo de locales comerciales y propiedades, disponibilidad y estatus',
    icon: Building2,
    color: '#0f766e',
    href: '/locales/propiedades',
  },
  {
    key: 'cobranza',
    label: 'Cobranza',
    desc: 'Asignaciones, rentas mensuales, cobros y recibos',
    icon: DollarSign,
    color: '#dc2626',
    href: '/locales/cobranza',
  },
]

function ModuloCard({ m }: { m: typeof MODULOS[number] }) {
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

export default function LocalesPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/golf/administracion" className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }}>
              <ChevronLeft size={14} /> Administración
            </Link>
          </div>
          <div className="page-eyebrow">
            <Building2 size={16} style={{ color: '#0f766e' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Renta de Locales Comerciales y Propiedades</h1>
          <p className="page-subtitle">Arrendatarios, catálogo de propiedades y cobranza de rentas</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map(m => <ModuloCard key={m.key} m={m} />)}
      </div>

    </div>
  )
}
