'use client'
import { useRouter } from 'next/navigation'
import { CalendarDays, List, BookOpen, ChevronRight, Star } from 'lucide-react'

const MODULOS = [
  {
    key:   'eventos',
    label: 'Eventos',
    desc:  'Gestión de eventos: bodas, sociales, corporativos y torneos',
    icon:  Star,
    color: '#9333ea',
    bg:    '#faf5ff',
    border:'#e9d5ff',
    href:  '/hospitality/eventos',
    activo: true,
  },
  {
    key:   'calendario',
    label: 'Calendario',
    desc:  'Vista mensual de eventos programados con acceso rápido al detalle',
    icon:  CalendarDays,
    color: '#0369a1',
    bg:    '#eff6ff',
    border:'#bfdbfe',
    href:  '/hospitality/calendario',
    activo: true,
  },
  {
    key:   'catalogos',
    label: 'Catálogos',
    desc:  'Lugares / salones y tipos de evento',
    icon:  BookOpen,
    color: '#64748b',
    bg:    '#f8fafc',
    border:'#e2e8f0',
    href:  '/hospitality/catalogos',
    activo: true,
  },
]

export default function HospitalityHub() {
  const router = useRouter()

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #7e22ce, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Star size={22} style={{ color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Hospitality
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              Gestión de eventos, ingresos y gastos asociados
            </p>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => m.activo && router.push(m.href)}
              disabled={!m.activo}
              style={{
                background: m.activo ? m.bg : '#f8fafc',
                border: `1.5px solid ${m.activo ? m.border : '#e2e8f0'}`,
                borderRadius: 16, padding: '20px 20px',
                cursor: m.activo ? 'pointer' : 'default',
                textAlign: 'left', transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', gap: 10,
                opacity: m.activo ? 1 : 0.5,
              }}
              onMouseEnter={e => {
                if (m.activo) {
                  e.currentTarget.style.borderColor = m.color
                  e.currentTarget.style.boxShadow = `0 4px 20px ${m.color}22`
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = m.border
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: m.activo ? `${m.color}18` : '#e2e8f0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={20} style={{ color: m.activo ? m.color : '#94a3b8' }} />
                </div>
                {m.activo && <ChevronRight size={16} style={{ color: m.color, opacity: 0.6, marginTop: 4 }} />}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: m.activo ? 'var(--text-primary)' : 'var(--text-muted)', marginBottom: 4 }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {m.desc}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
