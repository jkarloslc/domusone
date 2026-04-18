'use client'
import { useRouter } from 'next/navigation'
import {
  Users, Flag, MapPin, Calendar, Tag, ShoppingCart,
  Car, Lock, ArrowRight, BookOpen,
} from 'lucide-react'
import DashLayout from '@/components/layout/DashLayout'

const MODULOS = [
  {
    key: 'miembros',
    label: 'Miembros',
    desc: 'Socios, categorías, familiares y expediente del club',
    icon: Users,
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    href: '/golf/miembros',
    activo: true,
  },
  {
    key: 'accesos',
    label: 'Salidas al Campo',
    desc: 'Registro de entradas, hoyo de inicio y acompañantes',
    icon: MapPin,
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    href: '/golf/accesos',
    activo: true,
  },
  {
    key: 'reservaciones',
    label: 'Reservaciones',
    desc: 'Reservas de canchas, rangos y espacios deportivos',
    icon: Calendar,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    href: '/golf/reservaciones',
    activo: false,
  },
  {
    key: 'pases',
    label: 'Pases',
    desc: 'Asignación y consumo de pases por socio',
    icon: Tag,
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    href: '/golf/pases',
    activo: false,
  },
  {
    key: 'clinicas',
    label: 'Clínicas',
    desc: 'Programas de enseñanza, instructores e inscripciones',
    icon: Flag,
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    href: '/golf/clinicas',
    activo: false,
  },
  {
    key: 'pos',
    label: 'Ventas / POS',
    desc: 'Punto de venta, cortes de caja y cargos a cuenta',
    icon: ShoppingCart,
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    href: '/golf/pos',
    activo: false,
  },
  {
    key: 'carritos',
    label: 'Carritos',
    desc: 'Inventario, asignación y control de renta de carritos',
    icon: Car,
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    href: '/golf/carritos',
    activo: false,
  },
  {
    key: 'casilleros',
    label: 'Casilleros',
    desc: 'Asignación y seguimiento de casilleros por socio',
    icon: Lock,
    color: '#64748b',
    bg: '#f8fafc',
    border: '#e2e8f0',
    href: '/golf/casilleros',
    activo: false,
  },
  {
    key: 'catalogos',
    label: 'Catálogos',
    desc: 'Categorías, espacios deportivos, formas de juego y más',
    icon: BookOpen,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    href: '/golf/catalogos',
    activo: true,
  },
]

export default function GolfPage() {
  const router = useRouter()

  return (
    <DashLayout modulo="golf">
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Flag size={15} style={{ color: 'var(--gold)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, color: 'var(--gold-light)', letterSpacing: '-0.01em', marginBottom: 6 }}>
          Club
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Administración del club — socios, operaciones de campo y servicios deportivos
        </p>
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <div
              key={m.key}
              onClick={() => m.activo && router.push(m.href)}
              style={{
                background: m.activo ? m.bg : '#f8fafc',
                border: `1px solid ${m.activo ? m.border : '#e2e8f0'}`,
                borderRadius: 12,
                padding: '20px 22px',
                cursor: m.activo ? 'pointer' : 'default',
                opacity: m.activo ? 1 : 0.55,
                transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (m.activo) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { if (m.activo) (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: m.activo ? '#fff' : '#f1f5f9',
                  border: `1px solid ${m.activo ? m.border : '#e2e8f0'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={18} style={{ color: m.activo ? m.color : '#94a3b8' }} />
                </div>
                {m.activo && <ArrowRight size={14} style={{ color: m.color, marginTop: 4 }} />}
                {!m.activo && (
                  <span style={{ fontSize: 10, background: '#e2e8f0', color: '#64748b', padding: '2px 8px', borderRadius: 99, fontWeight: 600, letterSpacing: '0.05em' }}>
                    PRÓXIMO
                  </span>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: m.activo ? '#1e293b' : '#94a3b8', marginBottom: 4 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 12, color: m.activo ? '#64748b' : '#94a3b8', lineHeight: 1.4 }}>
                {m.desc}
              </div>
            </div>
          )
        })}
      </div>
    </div>
    </DashLayout>
  )
}
