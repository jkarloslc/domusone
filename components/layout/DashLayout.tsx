import Sidebar from '@/components/layout/Sidebar'

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--surface-950)' }}>
        {children}
      </main>
    </div>
  )
}
