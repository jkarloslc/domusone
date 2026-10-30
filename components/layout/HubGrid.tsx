'use client'
import { ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import PageHeader from '@/components/layout/PageHeader'

export type HubItem = { key: string; permKey: string; label: string; icon: any; desc: string; href: string }

export default function HubGrid({ icon, title, subtitle, color, items }: {
  icon: any; title: string; subtitle: string; color: string; items: HubItem[]
}) {
  const { can } = useAuth()
  const router  = useRouter()
  const visibles = items.filter(m => can(m.permKey))

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader variant="xl" icon={icon} eyebrowLabel="Módulo" title={title} subtitle={subtitle} />
      {visibles.length === 0 ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Sin acceso a este módulo.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {visibles.map(m => {
            const Icon = m.icon
            return (
              <button key={m.key}
                onClick={() => router.push(m.href)}
                className="card card-hover"
                style={{ padding: '18px 20px', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} style={{ color }} />
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
      )}
    </div>
  )
}
