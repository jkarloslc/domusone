import Link from 'next/link'
import {
  Users, Tag, Car, Receipt, CreditCard, ChevronRight, Building2, UserPlus,
} from 'lucide-react'

const MODULOS = [
  {
    key: 'miembros',
    label: 'Miembros',
    desc: 'Socios, categorías, familiares y expediente del club',
    icon: Users,
    color: '#3F4A75',
    href: '/golf/miembros',
  },
  {
    key: 'pases',
    label: 'Pases',
    desc: 'Asignación y consumo de pases por socio',
    icon: Tag,
    color: '#d97706',
    href: '/golf/pases',
  },
  {
    key: 'invitados',
    label: 'Invitados',
    desc: 'Catálogo de invitados, historial de visitas y tope anual',
    icon: UserPlus,
    color: '#b91c1c',
    href: '/golf/invitados',
  },
  {
    key: 'carritos',
    label: 'Pensiones',
    desc: 'Pensiones, slots y cobros mensuales o anuales',
    icon: Car,
    color: '#059669',
    href: '/golf/carritos',
  },
  {
    key: 'cuotas',
    label: 'Cuotas',
    desc: 'Asignación de cuotas por socio — individual o masivo',
    icon: Receipt,
    color: '#7c3aed',
    href: '/golf/cuotas',
  },
  {
    key: 'cxc',
    label: 'Cobro / CXC',
    desc: 'Cobro de cuotas agrupado por socio y emisión de recibos',
    icon: CreditCard,
    color: '#0891b2',
    href: '/golf/cxc',
  },
  {
    key: 'locales',
    label: 'Locales y Propiedades',
    desc: 'Renta de locales comerciales y propiedades — arrendatarios, catálogo y cobranza',
    icon: Building2,
    color: '#0f766e',
    href: '/locales',
  },
]

export default function GolfAdministracionPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Users size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Administración</h1>
          <p className="page-subtitle">Socios, pases, pensiones, cuotas y cobranza del club</p>
        </div>
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <Link
              key={m.key}
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
                flexShrink: 0,
              }}>
                <Icon size={18} style={{ color: m.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
            </Link>
          )
        })}
      </div>

    </div>
  )
}
