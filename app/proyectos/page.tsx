'use client'
import { useState } from 'react'
import { Wrench } from 'lucide-react'
import ProyectosTab from './ProyectosTab'
import AfectacionesTab from './AfectacionesTab'

const TABS = [
  { id: 'proyectos',    label: 'Proyectos de Construcción' },
  { id: 'afectaciones', label: 'Servidumbres y Afectaciones' },
]

export default function ProyectosPage({ embedded }: { embedded?: boolean }) {
  const [tab, setTab] = useState('proyectos')

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      {!embedded && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Wrench size={16} style={{ color: 'var(--blue)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em' }}>Proyectos</h1>
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontFamily: 'var(--font-body)',
            color: tab === t.id ? 'var(--blue)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--blue)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.2s', fontWeight: tab === t.id ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'proyectos'    && <ProyectosTab />}
      {tab === 'afectaciones' && <AfectacionesTab />}
    </div>
  )
}
