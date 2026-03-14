import Sidebar from '@/components/layout/Sidebar'
import AuthGuard from '@/components/AuthGuard'

export default function DashLayout({ children, modulo }: { children: React.ReactNode; modulo?: string }) {
  return (
    <AuthGuard modulo={modulo}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--surface-950)' }}>
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
