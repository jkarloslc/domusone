'use client'
import { useRouter } from 'next/navigation'
import {
  Users, Flag, MapPin, Calendar, Tag, ShoppingCart,
  Car, Lock, BookOpen, CreditCard, Receipt, FileText, ChevronRight,
} from 'lucide-react'
import DashLayout from '@/components/layout/DashLayout'

const MODULOS = [
  {
    key: 'miembros',
    label: 'Miembros',
    desc: 'Socios, categorías, familiares y expediente del club',
    icon: Users,
    color: '#3F4A75',
    href: '/golf/miembros',
    activo: true,
  },
  {
    key: 'accesos',
    label: 'Salidas al Campo',
    desc: 'Registro de entradas, hoyo de inicio y acompañantes',
    icon: MapPin,
    color: '#16a34a',
    href: '/golf/accesos',
    activo: true,
  },
  {
    key: 'reservaciones',
    label: 'Reservaciones',
    desc: 'Reservas de canchas, rangos y espacios deportivos',
    icon: Calendar,
    color: '#7c3aed',
    href: '/golf/reservaciones',
    activo: true,
  },
  {
    key: 'pases',
    label: 'Pases',
    desc: 'Asignación y consumo de pases por socio',
    icon: Tag,
    color: '#d97706',
    href: '/golf/pases',
    activo: true,
  },
  {
    key: 'clinicas',
    label: 'Clínicas',
    desc: 'Programas de enseñanza, instructores e inscripciones',
    icon: Flag,
    color: '#0891b2',
    href: '/golf/clinicas',
    activo: false,
  },
  {
    key: 'pos',
    label: 'Ventas / POS',
    desc: 'Punto de venta, cortes de caja y historial por socio',
    icon: ShoppingCart,
    color: '#dc2626',
    href: '/golf/pos',
    activo: true,
  },
  {
    key: 'carritos',
    label: 'Carritos',
    desc: 'Pensiones, slots y cobros mensuales o anuales',
    icon: Car,
    color: '#059669',
    href: '/golf/carritos',
    activo: true,
  },
  {
    key: 'cuotas',
    label: 'Cuotas',
    desc: 'Asignación de cuotas por socio — individual o masivo',
    icon: Receipt,
    color: '#7c3aed',
    href: '/golf/cuotas',
    activo: true,
  },
  {
    key: 'cxc',
    label: 'Cobro / CXC',
    desc: 'Cobro de cuotas agrupado por socio y emisión de recibos',
    icon: CreditCard,
    color: '#0891b2',
    href: '/golf/cxc',
    activo: true,
  },
  {
    key: 'recibos',
    label: 'Recibos',
    desc: 'Consulta, reimpresión y facturación de cobros emitidos',
    icon: FileText,
    color: '#0891b2',
    href: '/golf/recibos',
    activo: true,
  },
  {
    key: 'casilleros',
    label: 'Casilleros',
    desc: 'Asignación y seguimiento de casilleros por socio',
    icon: Lock,
    color: '#64748b',
    href: '/golf/casilleros',
    activo: false,
  },
  {
    key: 'catalogos',
    label: 'Catálogos',
    desc: 'Categorías, espacios deportivos, formas de juego y más',
    icon: BookOpen,
    color: '#7c3aed',
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
        <div className="page-header">
          <div className="page-header-left" style={{ display: 'block' }}>
            <div className="page-eyebrow">
              <Flag size={16} style={{ color: 'var(--blue)' }} />
              <span className="page-eyebrow-label">Módulo</span>
            </div>
            <h1 className="page-title-xl">Club</h1>
            <p className="page-subtitle">Administración del club — socios, operaciones de campo y servicios deportivos</p>
          </div>
        </div>

        {/* Grid de módulos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {MODULOS.map(m => {
            const Icon = m.icon
            return (
              <button
                key={m.key}
                onClick={() => m.activo && router.push(m.href)}
                className={m.activo ? 'card card-hover' : 'card'}
                style={{
                  padding: '18px 20px',
                  textAlign: 'left',
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  cursor: m.activo ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  opacity: m.activo ? 1 : 0.5,
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
                {m.activo
                  ? <ChevronRight size={14} style={{ color: '#cbd5e1', flexShrink: 0 }} />
                  : <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#f1f5f9', color: '#94a3b8', border: '1px solid #e2e8f0', flexShrink: 0, whiteSpace: 'nowrap' }}>PRÓXIMO</span>
                }
              </button>
            )
          })}
        </div>

      </div>
    </DashLayout>
  )
}
