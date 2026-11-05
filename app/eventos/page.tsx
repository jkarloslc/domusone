'use client'
import Link from 'next/link'
import { Star, CalendarDays, BookOpen, BarChart3, ChevronRight } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

const MODULOS = [
  { key: 'eventos', label: 'Eventos', desc: 'Gestión de eventos: bodas, sociales y corporativos, con ingresos, gastos y checklist', icon: Star, color: '#9333ea', href: '/eventos/gestion' },
  { key: 'calendario', label: 'Calendario', desc: 'Vista mensual de eventos programados con acceso rápido al detalle', icon: CalendarDays, color: '#0369a1', href: '/eventos/calendario' },
  { key: 'catalogos', label: 'Catálogos', desc: 'Tipos de evento (los lugares se administran en Hípico → Instalaciones)', icon: BookOpen, color: '#64748b', href: '/eventos/catalogos' },
  { key: 'reportes', label: 'Reportes', desc: 'Ingresos vs gastos por evento', icon: BarChart3, color: '#1d4ed8', href: '/reportes?grupo=hospitality' },
]

export default function EventosPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader variant="xl" icon={Star} eyebrowLabel="Módulo" title="Eventos" subtitle="Gestión de eventos, calendario y catálogos" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map(m => {
          const Icon = m.icon
          return (
            <Link key={m.key} href={m.href} className="card card-hover"
              style={{ padding: '18px 20px', background: '#fff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: m.color }}>
                <Icon size={18} />
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
