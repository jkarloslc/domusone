'use client'
import { Users, Wallet, ChevronRight, Briefcase } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

import PageHeader from '@/components/layout/PageHeader'
const MODULOS = [
  { key: 'rol-pagos',    permKey: 'hr',                label: 'Rol de Pagos',            icon: Wallet,      color: '#b45309', desc: 'Asistencia semanal de colaboradores y monto a pagar', href: '/hr/rol-de-pagos' },
  { key: 'colaboradores',permKey: 'hr',                label: 'Colaboradores',           icon: Users,       color: '#b45309', desc: 'Catálogo de personal operativo — sueldos y puesto',  href: '/hr/colaboradores' },
]

export default function HRPage() {
  const { can } = useAuth()
  const router  = useRouter()

  const visibles = MODULOS.filter(m => can(m.permKey))

  if (visibles.length === 0) {
    return (
      <div style={{ padding: '48px 36px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Sin acceso al módulo de HR.
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <PageHeader icon={Briefcase}
        color="var(--blue)"
        eyebrowLabel="Módulo"
        variant="xl"
        title="HR"
        subtitle="Catálogos de personal y rol de pagos"
      />

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {visibles.map(m => {
          const Icon = m.icon
          return (
            <button key={m.key}
              onClick={() => router.push(m.href)}
              className="card card-hover"
              style={{ padding: '18px 20px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: m.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
