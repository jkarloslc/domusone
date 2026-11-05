'use client'
import Link from 'next/link'
import { Leaf, Droplets, CloudRain, ChevronRight, Truck, Hammer, Zap } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/AuthContext'

const MODULOS = [
  {
    key: 'riego',
    label: 'Riego',
    desc: 'Programa de riego, ejecución semanal y consumo de agua',
    icon: Droplets,
    color: '#0ea5e9',
    href: '/golf/riego',
  },
  {
    key: 'mantenimiento-campo',
    label: 'Mantenimiento de Campo',
    desc: 'Aplicaciones, agroquímicos y bitácora de mantenimiento del campo',
    icon: Leaf,
    color: '#16a34a',
    href: '/golf/mantenimiento-campo',
  },
  {
    key: 'estatus-campo',
    label: 'Estatus del Campo',
    desc: 'Bitácora de apertura / cierre del campo y de los caminos',
    icon: CloudRain,
    color: '#7c3aed',
    href: '/golf/estatus-campo',
  },
  {
    key: 'equipo-flota',
    label: 'Vehículos y Maquinaria',
    desc: 'Flotilla, mantenimientos, bitácora de uso y combustible',
    icon: Truck,
    color: '#b45309',
    href: '/equipo-flota',
    perm: 'equipo-flota',
  },
  {
    key: 'herramientas',
    label: 'Equipo y Herramienta',
    desc: 'Catálogo, préstamos y mantenimiento de herramienta',
    icon: Hammer,
    color: '#475569',
    href: '/herramientas',
    perm: 'herramientas',
  },
  {
    key: 'servicios',
    label: 'Servicios',
    desc: 'Medidores de CFE, Agua y Gas LP: consumo y facturación',
    icon: Zap,
    color: '#d97706',
    href: '/golf/servicios',
  },
] as { key: string; label: string; desc: string; icon: any; color: string; href: string; perm?: string }[]

export default function GolfManttoCampoPage() {
  const { can } = useAuth()
  const modulos = MODULOS.filter(m => !m.perm || can(m.perm))
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader backHref="/golf"
        variant="xl"
        icon={Leaf}
        eyebrowLabel="Módulo"
        title="Mantto. Campo"
        subtitle="Riego, mantenimiento del campo, vehículos, herramienta y servicios"
      />

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {modulos.map(m => {
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
                flexShrink: 0,
              }}>
                <Icon size={18} style={{ color: m.color }} />
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
