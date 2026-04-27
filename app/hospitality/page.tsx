'use client'
import { useRouter } from 'next/navigation'
import { CalendarDays, BookOpen, ChevronRight, Star } from 'lucide-react'

const MODULOS = [
  {
    key:   'eventos',
    label: 'Eventos',
    desc:  'Gestión de eventos: bodas, sociales, corporativos y torneos',
    icon:  Star,
    color: '#9333ea',
    href:  '/hospitality/eventos',
  },
  {
    key:   'calendario',
    label: 'Calendario',
    desc:  'Vista mensual de eventos programados con acceso rápido al detalle',
    icon:  CalendarDays,
    color: '#0369a1',
    href:  '/hospitality/calendario',
  },
  {
    key:   'catalogos',
    label: 'Catálogos',
    desc:  'Lugares / salones y tipos de evento',
    icon:  BookOpen,
    color: '#64748b',
    href:  '/hospitality/catalogos',
  },
]

export default function HospitalityHub() {
  const router = useRouter()

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Star size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Hospitality</h1>
          <p className="page-subtitle">Gestión de eventos, ingresos y gastos asociados</p>
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
