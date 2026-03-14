'use client'
import { useState } from 'react'
import { FileText } from 'lucide-react'
import RecibosTab from './RecibosTab'
import CargosTab from './CargosTab'
import CuotasTab from './CuotasTab'

const TABS = [
  { id: 'cargos',   label: 'Cargos y Adeudos' },
  { id: 'recibos',  label: 'Recibos / Pagos' },
  { id: 'cuotas',   label: 'Cuotas por Lote' },
]

export default function CobranzaPage() {
  const [tab, setTab] = useState('cargos')

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <FileText size={16} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em' }}>Cobranza</h1>
      </div>

      {/* Tabs */}
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

      {tab === 'cargos'  && <CargosTab />}
      {tab === 'recibos' && <RecibosTab />}
      {tab === 'cuotas'  && <CuotasTab />}
    </div>
  )
}
