import Link from 'next/link'
import { Leaf, Droplets, CloudRain, ChevronRight } from 'lucide-react'

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
]

export default function GolfManttoCampoPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Leaf size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Módulo</span>
          </div>
          <h1 className="page-title-xl">Mantto. Campo</h1>
          <p className="page-subtitle">Riego y mantenimiento del campo de golf</p>
        </div>
      </div>

      {/* Grid de módulos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {MODULOS.map(m => {
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
