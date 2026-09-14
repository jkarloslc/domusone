'use client'
import { useState } from 'react'
import { Shield } from 'lucide-react'
import BitacoraTab from './BitacoraTab'
import VisitantesTab from './VisitantesTab'
import VehiculosTab from './VehiculosTab'
import PageHeader from '@/components/layout/PageHeader'

const TABS = [
  { id: 'bitacora',    label: 'Bitácora de Accesos' },
  { id: 'visitantes',  label: 'Visitantes Autorizados' },
  { id: 'vehiculos',   label: 'Vehículos Autorizados' },
]

function AccesosContent({ embedded }: { embedded?: boolean }) {
  const [tab, setTab] = useState('bitacora')

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header — oculto cuando está dentro de /residencial */}
      {!embedded && (
        <PageHeader
          variant="xl"
          icon={Shield}
          color="var(--gold)"
          eyebrowLabel="Módulo"
          title="Control de Accesos"
        />
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontFamily: 'var(--font-body)',
            color: tab === t.id ? 'var(--gold-light)' : 'var(--text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'bitacora'   && <BitacoraTab />}
      {tab === 'visitantes' && <VisitantesTab />}
      {tab === 'vehiculos'  && <VehiculosTab />}
    </div>
  )
}

export default function AccesosPage() { return <AccesosContent /> }
