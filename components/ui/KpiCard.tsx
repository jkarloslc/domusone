'use client'
import React from 'react'

export type KpiTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

// Deben coincidir con --success/--danger/--warning/--info en app/globals.css.
// Se hardcodean aquí (en vez de var(--x)) porque se necesita el hex crudo para
// derivar el tinte de fondo del chip (color + alpha hex).
const TONE_HEX: Record<KpiTone, string> = {
  success: '#1F7A50',
  danger:  '#C23B3B',
  warning: '#B5761A',
  info:    '#126B63',
  neutral: '#1C1D21',
}

type Props = {
  label: string
  value: React.ReactNode
  icon: React.ComponentType<any>
  tone?: KpiTone
  /** Escape hatch — color exacto si el tono semántico no aplica. */
  color?: string
  onClick?: () => void
}

export default function KpiCard({ label, value, icon: Icon, tone = 'neutral', color, onClick }: Props) {
  const c = color ?? TONE_HEX[tone]
  return (
    <div
      className={onClick ? 'card card-hover' : 'card'}
      onClick={onClick}
      style={{
        padding: '14px 18px', minWidth: 160, background: '#fff',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 9, background: '#F4F5F7',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} style={{ color: c }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  )
}
