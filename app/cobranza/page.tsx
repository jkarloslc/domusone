'use client'
import { useState } from 'react'
import CargosTab  from './CargosTab'
import RecibosTab from './RecibosTab'
import CuotasTab  from './CuotasTab'
import { FileText, Receipt, Settings2 } from 'lucide-react'

type Tab = 'cargos' | 'recibos' | 'cuotas'

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'cargos',  label: 'Cargos',        icon: <FileText  size={14} /> },
  { key: 'recibos', label: 'Recibos',        icon: <Receipt   size={14} /> },
  { key: 'cuotas',  label: 'Cuotas / Tarifas', icon: <Settings2 size={14} /> },
]

export default function CobranzaPage() {
  const [tab, setTab] = useState<Tab>('cargos')

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: 'var(--gold-light)', marginBottom: 4 }}>
          Cobranza
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Cargos, recibos de pago y cuotas asignadas por lote
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px',
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--blue)' : 'var(--text-muted)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? '2px solid var(--blue)' : '2px solid transparent',
              marginBottom: -1,
              transition: 'all 0.15s',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'cargos'  && <CargosTab />}
      {tab === 'recibos' && <RecibosTab />}
      {tab === 'cuotas'  && <CuotasTab />}
    </div>
  )
}
