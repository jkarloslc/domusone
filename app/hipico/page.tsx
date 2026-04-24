'use client'
import { useRouter } from 'next/navigation'
import {
  Users, Home, FileText, DollarSign, Stethoscope, ChevronRight,
} from 'lucide-react'

const MODULOS = [
  {
    key: 'arrendatarios',
    label: 'Arrendatarios',
    desc: 'Propietarios de caballos, datos de contacto y expediente',
    icon: Users,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    href: '/hipico/arrendatarios',
    activo: true,
  },
  {
    key: 'caballerizas',
    label: 'Caballerizas',
    desc: 'Catálogo de boxes, secciones y disponibilidad',
    icon: Home,
    color: '#b45309',
    bg: '#fffbeb',
    border: '#fde68a',
    href: '/hipico/caballerizas',
    activo: true,
  },
  {
    key: 'caballos',
    label: 'Caballos',
    desc: 'Registro de caballos, raza, propietario y caballeriza asignada',
    icon: ({ size }: { size?: number }) => (
      <svg width={size ?? 20} height={size ?? 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
        <circle cx="7.5" cy="14.5" r="1.5"/>
        <circle cx="16.5" cy="14.5" r="1.5"/>
      </svg>
    ),
    color: '#065f46',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    href: '/hipico/caballos',
    activo: true,
  },
  {
    key: 'contratos',
    label: 'Contratos',
    desc: 'Contratos de arrendamiento de caballerizas, renta y vencimientos',
    icon: FileText,
    color: '#0369a1',
    bg: '#eff6ff',
    border: '#bfdbfe',
    href: '/hipico/contratos',
    activo: true,
  },
  {
    key: 'cobranza',
    label: 'Cobranza',
    desc: 'Cargos, pagos y estado de cuenta por arrendatario',
    icon: DollarSign,
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    href: '/hipico/cobranza',
    activo: true,
  },
  {
    key: 'servicios',
    label: 'Servicios',
    desc: 'Bitácora veterinaria, herrajes y alimentación por caballo',
    icon: Stethoscope,
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    href: '/hipico/servicios',
    activo: true,
  },
]

export default function HipicoPage() {
  const router = useRouter()

  return (
    <div style={{ padding: '28px 28px 40px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 28 }}>🐴</span>
          Módulo Hípico
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Administración de caballerizas, arrendatarios, caballos y cobranza
        </p>
      </div>

      {/* Grid de módulos */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16,
      }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => m.activo && router.push(m.href)}
              style={{
                background: m.activo ? 'var(--surface-800)' : 'var(--surface-700)',
                border: `1px solid var(--border)`,
                borderRadius: 12,
                padding: '20px 20px 16px',
                textAlign: 'left',
                cursor: m.activo ? 'pointer' : 'not-allowed',
                opacity: m.activo ? 1 : 0.55,
                transition: 'all 0.15s',
                position: 'relative',
                overflow: 'hidden',
              }}
              onMouseEnter={e => { if (m.activo) e.currentTarget.style.borderColor = m.color }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              {/* Ícono */}
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: m.bg, border: `1px solid ${m.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: m.color, marginBottom: 12,
              }}>
                <Icon size={20} />
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {m.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {m.desc}
              </div>

              {m.activo && (
                <ChevronRight
                  size={14}
                  style={{ position: 'absolute', top: 20, right: 16, color: 'var(--text-muted)' }}
                />
              )}
              {!m.activo && (
                <span style={{
                  position: 'absolute', top: 12, right: 12,
                  fontSize: 10, background: 'var(--surface-600)', color: 'var(--text-muted)',
                  borderRadius: 4, padding: '2px 6px',
                }}>Próximo</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
