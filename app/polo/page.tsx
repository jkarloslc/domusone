'use client'
import { useState } from 'react'
import { Stethoscope } from 'lucide-react'
import CaballosTab from './CaballosTab'
import ServiciosTab from './ServiciosTab'

const PoloIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3"/>
    <path d="M3 21c0-4 3-7 7-7h4c4 0 7 3 7 7"/>
    <path d="M17 12l3-3"/>
    <path d="M19 9l-1-1 1-1"/>
  </svg>
)

const HorseIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 7c0-1.1-.9-2-2-2h-3L9 9H5a2 2 0 0 0-2 2v3h2a3 3 0 0 0 6 0h4a3 3 0 0 0 6 0h2v-5h-4z"/>
    <circle cx="7.5" cy="14.5" r="1.5"/>
    <circle cx="16.5" cy="14.5" r="1.5"/>
  </svg>
)

const TABS = [
  { key: 'caballos',  label: 'Caballos',  icon: HorseIcon },
  { key: 'servicios', label: 'Servicios', icon: Stethoscope },
] as const

export default function PoloPage() {
  const [tab, setTab] = useState<typeof TABS[number]['key']>('caballos')

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <PoloIcon size={16} />
            <span className="page-eyebrow-label" style={{ color: 'var(--blue)' }}>Módulo</span>
          </div>
          <h1 className="page-title-xl">Polo</h1>
          <p className="page-subtitle">Caballos de polo y bitácora de servicios veterinarios</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 20, gap: 0, overflowX: 'auto' }}>
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', fontSize: 13, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#065f46' : '#94a3b8',
              borderBottom: tab === t.key ? '2px solid #065f46' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s',
            }}>
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenido */}
      {tab === 'caballos' ? <CaballosTab /> : <ServiciosTab />}

    </div>
  )
}
