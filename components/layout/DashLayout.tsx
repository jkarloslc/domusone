'use client'
import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import AuthGuard from '@/components/AuthGuard'

export default function DashLayout({ children, modulo }: { children: React.ReactNode; modulo?: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <AuthGuard modulo={modulo}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>

        {/* Overlay oscuro en móvil */}
        <div
          className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Sidebar */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Contenido principal */}
        <main className="dash-main" style={{ flex: 1, overflow: 'auto', background: 'var(--surface-950)', minWidth: 0 }}>

          {/* Topbar móvil */}
          <div className="mobile-topbar">
            <button className="menu-btn" onClick={() => setSidebarOpen(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--blue)' }}>
              DomusOne
            </span>
          </div>

          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
