'use client'
import { Flag } from 'lucide-react'

export default function GolfPage() {
  return (
    <div style={{ padding: '48px 36px', textAlign: 'center' }}>
      <Flag size={40} style={{ color: 'var(--gold)', margin: '0 auto 16px', display: 'block' }} />
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400,
        color: 'var(--gold-light)', marginBottom: 8,
      }}>
        Módulo Golf
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>
        En construcción. Próximamente: Miembros, Salidas al Campo, Reservaciones, Clínicas, POS Golf, Pases, Carritos y Casilleros.
      </p>
    </div>
  )
}
