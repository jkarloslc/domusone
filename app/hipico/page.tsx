'use client'
import React, { type SVGProps } from 'react'
import Link from 'next/link'
import {
  Users, Home, DollarSign, ChevronRight, Flag, BarChart3,
  Star, CalendarDays, BookOpen,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

const HorseIcon = ({ size = 18, ...props }: { size?: number } & SVGProps<SVGSVGElement>) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
    <circle cx="7.5" cy="14.5" r="1.5"/>
    <circle cx="16.5" cy="14.5" r="1.5"/>
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
  {
    key: 'eventos-ecuestres',
    label: 'Torneos Ecuestres',
    desc: 'Organización de torneos y eventos ecuestres',
    icon: Flag,
    color: '#ca8a04',
    href: '/hipico/eventos-ecuestres',
  },
  {
    key: 'reportes',
    label: 'Reportes',
    desc: 'Estado de cuenta, cobranza y servicios por caballo',
    icon: BarChart3,
    color: '#1d4ed8',
    href: '/reportes?grupo=hipico',
  },
]

const EVENTOS_MODULOS = [
  {
    key: 'eventos',
    label: 'Eventos',
    desc: 'Gestión de eventos: bodas, sociales, corporativos y torneos',
    icon: Star,
    color: '#9333ea',
    href: '/hospitality/eventos',
  },
  {
    key: 'calendario',
    label: 'Calendario',
    desc: 'Vista mensual de eventos programados con acceso rápido al detalle',
    icon: CalendarDays,
    color: '#0369a1',
    href: '/hospitality/calendario',
  },
  {
    key: 'catalogos',
    label: 'Catálogos',
    desc: 'Lugares / salones y tipos de evento',
    icon: BookOpen,
    color: '#64748b',
    href: '/hospitality/catalogos',
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

function SectionSeparator({ label, color, icon: Icon }: { label: string; color: string; icon: (p: { size?: number }) => React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <Icon size={15} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ flex: 1, height: 1, background: color + '22' }} />
    </div>
  )
}

export default function HipicoPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader
        variant="xl"
        icon={HorseIcon}
        eyebrowLabel="Módulo"
        title="Hípico y Eventos"
        subtitle="Caballerizas, cobranza, torneos ecuestres y gestión de eventos"
      />

      {/* Sección Caballerizas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 32 }}>
        {CABALLERIZAS_MODULOS.map(m => <ModuloCard key={m.key} m={m} />)}
      </div>

      {/* Sección Eventos */}
      <SectionSeparator label="Eventos" color="#b45309" icon={Star} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {EVENTOS_MODULOS.map(m => <ModuloCard key={m.key} m={m} />)}
      </div>

    </div>
  )
}
