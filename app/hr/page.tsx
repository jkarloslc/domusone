'use client'
import { Users, Wallet, ChevronRight, Briefcase, Receipt } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useRouter } from 'next/navigation'

import PageHeader from '@/components/layout/PageHeader'
const MODULOS = [
  { key: 'rol-pagos',    permKey: 'hr',                label: 'Rol de Pagos',            icon: Wallet,      color: '#96600F', desc: 'Asistencia semanal de colaboradores y monto a pagar', href: '/hr/rol-de-pagos' },
  { key: 'nomina',       permKey: 'hr',                label: 'Nómina',                  icon: Receipt,     color: '#96600F', desc: 'Carga del Excel de nómina y OPs del mes por Área', href: '/hr/nomina' },
  { key: 'colaboradores',permKey: 'hr',                label: 'Colaboradores',           icon: Users,       color: '#96600F', desc: 'Catálogo de personal operativo — sueldos y puesto',  href: '/hr/colaboradores' },
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
              style={{ padding: '18px 20px', textAlign: 'left', background: '#fff', border: '1px solid #E6E8EB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="icon-chip" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
              </div>
              <ChevronRight size={14} style={{ color: '#C9CCD3', flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
