'use client'
import { useState } from 'react'
import { Waves } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/AuthContext'
import TabVersiones from './TabVersiones'
import TabBanco from './TabBanco'
import TabCatalogo from './TabCatalogo'

const TABS = [
  { id: 'versiones', label: 'Flujo proyectado' },
  { id: 'banco',     label: 'Movimientos bancarios' },
  { id: 'catalogo',  label: 'Conceptos, reglas y layouts' },
] as const

// Acceso restringido a superadmin y admin (decisión del módulo)
const ROLES_FLUJO = ['superadmin', 'admin']

export default function FlujoEfectivoPage() {
  const { authUser } = useAuth()
  const [tab, setTab] = useState<typeof TABS[number]['id']>('versiones')

  if (!authUser) return <div style={{ padding: '32px 36px' }}>Cargando…</div>
  if (!ROLES_FLUJO.includes(authUser.rol)) {
    return <div style={{ padding: '32px 36px', color: 'var(--text-muted)' }}>Este módulo es solo para Administradores.</div>
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        icon={Waves}
        eyebrowLabel="Tesorería"
        title="Flujo de Efectivo"
        subtitle="Flujo proyectado desde Presupuestos (CC/Área e Ingreso/Sección) contra el flujo real clasificado del banco"
        backHref="/tesoreria"
      />

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #e2e8f0' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              font: 'inherit', fontSize: 13, fontWeight: 600, padding: '9px 16px', background: 'none', cursor: 'pointer',
              border: 'none', borderBottom: tab === t.id ? '2px solid #0f766e' : '2px solid transparent',
              color: tab === t.id ? '#0f766e' : 'var(--text-muted)', marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'versiones' && <TabVersiones />}
      {tab === 'banco' && <TabBanco />}
      {tab === 'catalogo' && <TabCatalogo />}
    </div>
  )
}
