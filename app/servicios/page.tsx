'use client'
import { LayoutGrid } from 'lucide-react'

export default function ServiciosPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <LayoutGrid size={16} style={{ color: 'var(--blue)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 8 }}>
        Servicios
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Módulo en construcción — en espera de plantilla de uso.</p>
    </div>
  )
}
