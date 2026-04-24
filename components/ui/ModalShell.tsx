'use client'
import { X } from 'lucide-react'
import React from 'react'

// ── Paletas por módulo ────────────────────────────────────────
export type ModalModulo =
  | 'residencial' | 'lotes' | 'propietarios' | 'contratos' | 'escrituras'
  | 'cobranza' | 'facturas' | 'accesos' | 'incidencias' | 'comunicados'
  | 'mantenimiento' | 'proyectos'
  | 'compras' | 'proveedores' | 'articulos' | 'almacenes'
  | 'tesoreria' | 'ingresos'
  | 'golf' | 'golf-miembros' | 'golf-accesos' | 'golf-pos' | 'golf-carritos'
  | 'hipico'
  | 'usuarios' | 'configuracion'
  | 'default'

type Palette = { from: string; to: string; accent: string }

export const MODAL_PALETTES: Record<ModalModulo, Palette> = {
  // Residencial — azul
  residencial:  { from: '#1e3a5f', to: '#2563eb', accent: '#2563eb' },
  lotes:        { from: '#1e3a5f', to: '#2563eb', accent: '#2563eb' },
  propietarios: { from: '#1e3a5f', to: '#2563eb', accent: '#2563eb' },
  contratos:    { from: '#1e3a5f', to: '#2563eb', accent: '#2563eb' },
  escrituras:   { from: '#1e3a5f', to: '#2563eb', accent: '#2563eb' },
  comunicados:  { from: '#1e3a5f', to: '#3b82f6', accent: '#3b82f6' },

  // Accesos / Seguridad — azul pizarra
  accesos:      { from: '#1e293b', to: '#334155', accent: '#475569' },
  incidencias:  { from: '#7c2d12', to: '#ea580c', accent: '#ea580c' },

  // Cobranza / Facturas — índigo
  cobranza:     { from: '#312e81', to: '#4f46e5', accent: '#4f46e5' },
  facturas:     { from: '#312e81', to: '#6366f1', accent: '#6366f1' },

  // Mantenimiento / Proyectos — violeta
  mantenimiento: { from: '#4c1d95', to: '#7c3aed', accent: '#7c3aed' },
  proyectos:     { from: '#4c1d95', to: '#8b5cf6', accent: '#8b5cf6' },

  // Compras — verde esmeralda
  compras:      { from: '#064e3b', to: '#059669', accent: '#059669' },
  proveedores:  { from: '#064e3b', to: '#10b981', accent: '#10b981' },
  articulos:    { from: '#064e3b', to: '#059669', accent: '#059669' },
  almacenes:    { from: '#065f46', to: '#10b981', accent: '#10b981' },

  // Tesorería — teal
  tesoreria:    { from: '#134e4a', to: '#0f766e', accent: '#0f766e' },
  ingresos:     { from: '#134e4a', to: '#14b8a6', accent: '#14b8a6' },

  // Hípico — café cuero / marrón cálido
  hipico:        { from: '#44200d', to: '#92400e', accent: '#b45309' },

  // Golf — dorado / verde campo
  golf:          { from: '#713f12', to: '#b8952a', accent: '#b8952a' },
  'golf-miembros': { from: '#713f12', to: '#b8952a', accent: '#b8952a' },
  'golf-accesos':  { from: '#14532d', to: '#16a34a', accent: '#16a34a' },
  'golf-pos':      { from: '#1e3a5f', to: '#2563eb', accent: '#2563eb' },
  'golf-carritos': { from: '#713f12', to: '#d97706', accent: '#d97706' },

  // Sistema
  usuarios:      { from: '#1e293b', to: '#475569', accent: '#475569' },
  configuracion: { from: '#1e293b', to: '#334155', accent: '#334155' },
  default:       { from: '#1e3a5f', to: '#2563eb', accent: '#2563eb' },
}

// ── Props ─────────────────────────────────────────────────────
type Tab = {
  key: string
  label: string
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  badge?: React.ReactNode
  disabled?: boolean
  disabledHint?: string
}

type Props = {
  modulo: ModalModulo
  titulo: string
  subtitulo?: string
  icono?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>
  maxWidth?: number
  onClose: () => void
  children: React.ReactNode
  // Tabs opcionales
  tabs?: Tab[]
  activeTab?: string
  onTabChange?: (key: string) => void
  // Footer
  footer?: React.ReactNode
}

export default function ModalShell({
  modulo, titulo, subtitulo, icono: Icono,
  maxWidth = 680, onClose,
  children, tabs, activeTab, onTabChange, footer,
}: Props) {
  const pal = MODAL_PALETTES[modulo] ?? MODAL_PALETTES.default

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
        animation: 'modalIn 0.18s ease-out',
      }}>
        {/* ── Header ── */}
        <div style={{
          background: `linear-gradient(135deg, ${pal.from} 0%, ${pal.to} 100%)`,
          borderRadius: tabs ? '20px 20px 0 0' : '20px 20px 0 0',
          padding: tabs ? '20px 24px 0' : '20px 24px',
          flexShrink: 0,
        }}>
          {/* Título + botón cerrar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tabs ? 18 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {Icono && (
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icono size={18} style={{ color: '#fff' }} />
                </div>
              )}
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                  {titulo}
                </div>
                {subtitulo && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>
                    {subtitulo}
                  </div>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
              cursor: 'pointer', color: 'rgba(255,255,255,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <X size={15} />
            </button>
          </div>

          {/* Tabs (opcionales) */}
          {tabs && (
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
              {tabs.map(t => {
                const active = activeTab === t.key
                const Icon   = t.icon
                return (
                  <button key={t.key}
                    onClick={() => !t.disabled && onTabChange?.(t.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                      borderRadius: '8px 8px 0 0',
                      cursor: t.disabled ? 'not-allowed' : 'pointer',
                      background: active ? '#fff' : 'transparent',
                      color: t.disabled
                        ? 'rgba(255,255,255,0.25)'
                        : active ? pal.accent : 'rgba(255,255,255,0.75)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {Icon && <Icon size={13} style={{ opacity: active ? 1 : 0.8 }} />}
                    {t.label}
                    {t.badge && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                        background: active ? pal.accent + '22' : 'rgba(255,255,255,0.2)',
                        color: active ? pal.accent : '#fff',
                      }}>
                        {t.badge}
                      </span>
                    )}
                    {t.disabled && t.disabledHint && (
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>🔒</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          {children}
        </div>

        {/* ── Footer ── */}
        {footer && (
          <div style={{
            padding: '14px 28px', borderTop: '1px solid #e2e8f0',
            background: '#f8fafc', borderRadius: '0 0 20px 20px',
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
