'use client'
import Link from 'next/link'
import {
  Users, Tag, Car, Receipt, CreditCard, ChevronRight, UserPlus, FileText,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

const MODULOS = [
  {
    key: 'miembros',
    label: 'Miembros',
    desc: 'Socios, categorías, familiares y expediente del club',
    icon: Users,
    color: '#1C1D21',
    href: '/golf/miembros',
  },
  {
    key: 'pases',
    label: 'Pases',
    desc: 'Asignación y consumo de pases por socio',
    icon: Tag,
    color: '#B5761A',
    href: '/golf/pases',
  },
  {
    key: 'invitados',
    label: 'Invitados',
    desc: 'Catálogo de invitados, historial de visitas y tope anual',
    icon: UserPlus,
    color: '#A83232',
    href: '/golf/invitados',
  },
  {
    key: 'carritos',
    label: 'Pensiones',
    desc: 'Pensiones, slots y cobros mensuales o anuales',
    icon: Car,
    color: '#267F56',
    href: '/golf/carritos',
  },
  {
    key: 'cuotas',
    label: 'Cuotas',
    desc: 'Asignación de cuotas por socio — individual o masivo',
    icon: Receipt,
    color: '#6B4E79',
    href: '/golf/cuotas',
  },
  {
    key: 'cxc',
    label: 'Cobro / CXC',
    desc: 'Cobro de cuotas agrupado por socio y emisión de recibos',
    icon: CreditCard,
    color: '#32789A',
    href: '/golf/cxc',
  },
  {
    key: 'recibos',
    label: 'Recibos',
    desc: 'Consulta, reimpresión y cancelación de recibos de cobro',
    icon: FileText,
    color: '#178A80',
    href: '/golf/recibos',
  },
]

export default function GolfAdministracionPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader backHref="/golf"
        variant="xl"
        icon={Users}
        eyebrowLabel="Módulo"
        title="Administración"
        subtitle="Socios, pases, pensiones, cuotas y cobranza del club"
      />

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
                border: '1px solid #E6E8EB',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                textDecoration: 'none',
              }}
            >
              <div className="icon-chip" style={{
                width: 40, height: 40, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={18} style={{ color: '#1C1D21' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <ChevronRight size={14} style={{ color: '#C9CCD3', flexShrink: 0 }} />
            </Link>
          )
        })}
      </div>

    </div>
  )
}
