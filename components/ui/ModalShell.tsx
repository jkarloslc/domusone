'use client'
import { X, Lock } from 'lucide-react'
import React from 'react'

// ── Paletas por módulo ────────────────────────────────────────
export type ModalModulo =
  | 'residencial' | 'lotes' | 'propietarios' | 'contratos' | 'escrituras'
  | 'cobranza' | 'facturas' | 'facturacion' | 'accesos' | 'incidencias' | 'comunicados'
  | 'mantenimiento' | 'afectaciones' | 'construcciones' | 'capex'
  | 'hr'
  | 'compras' | 'proveedores' | 'articulos' | 'almacenes'
  | 'tesoreria' | 'ingresos' | 'presupuestos'
  | 'golf' | 'golf-miembros' | 'golf-accesos' | 'golf-pos' | 'golf-carritos' | 'golf-tee-practica'
  | 'hipico'
  | 'locales'
  | 'usuarios' | 'configuracion'
  | 'default'

type Palette = { from: string; to: string; accent: string }

export const MODAL_PALETTES: Record<ModalModulo, Palette> = {
  // Residencial — azul
  residencial:  { from: '#26282D', to: '#1C1D21', accent: '#1C1D21' },
  lotes:        { from: '#26282D', to: '#1C1D21', accent: '#1C1D21' },
  propietarios: { from: '#26282D', to: '#1C1D21', accent: '#1C1D21' },
  contratos:    { from: '#26282D', to: '#1C1D21', accent: '#1C1D21' },
  escrituras:   { from: '#26282D', to: '#1C1D21', accent: '#1C1D21' },
  comunicados:  { from: '#26282D', to: '#33363C', accent: '#33363C' },

  // Accesos / Seguridad — azul pizarra
  accesos:      { from: '#26282D', to: '#33363C', accent: '#4A4D54' },
  incidencias:  { from: '#6F3314', to: '#C8642A', accent: '#C8642A' },

  // Cobranza / Facturas — índigo
  cobranza:     { from: '#1C1D21', to: '#1C1D21', accent: '#1C1D21' },
  facturas:     { from: '#1C1D21', to: '#33363C', accent: '#33363C' },
  facturacion:  { from: '#1C1D21', to: '#6B4E79', accent: '#6B4E79' },

  // Mantenimiento / Proyectos — violeta
  mantenimiento: { from: '#3D2A45', to: '#6B4E79', accent: '#6B4E79' },
  afectaciones:  { from: '#1F4E66', to: '#32789A', accent: '#32789A' },
  construcciones:{ from: '#7A4B0C', to: '#B5761A', accent: '#B5761A' },
  capex:         { from: '#26282D', to: '#26282D', accent: '#33363C' },

  // HR — ámbar/café (mano de obra)
  hr:            { from: '#7A4B0C', to: '#96600F', accent: '#96600F' },

  // Compras — verde esmeralda
  compras:      { from: '#17603F', to: '#267F56', accent: '#267F56' },
  proveedores:  { from: '#17603F', to: '#2E9E6B', accent: '#2E9E6B' },
  articulos:    { from: '#17603F', to: '#267F56', accent: '#267F56' },
  almacenes:    { from: '#17603F', to: '#2E9E6B', accent: '#2E9E6B' },

  // Tesorería — teal
  tesoreria:    { from: '#0E4F4A', to: '#126B63', accent: '#126B63' },
  ingresos:     { from: '#0E4F4A', to: '#2AA89C', accent: '#2AA89C' },
  presupuestos: { from: '#26282D', to: '#26282D', accent: '#33363C' },

  // Hípico — café cuero / marrón cálido
  hipico:        { from: '#7A4B0C', to: '#7A4B0C', accent: '#96600F' },

  // Locales y Propiedades — pizarra / teal (inmobiliario comercial)
  locales:       { from: '#0E4F4A', to: '#126B63', accent: '#178A80' },

  // Golf — dorado / verde campo
  golf:          { from: '#6B4A10', to: '#A8821A', accent: '#A8821A' },
  'golf-miembros': { from: '#6B4A10', to: '#A8821A', accent: '#A8821A' },
  'golf-accesos':  { from: '#17603F', to: '#267F56', accent: '#267F56' },
  'golf-pos':      { from: '#26282D', to: '#1C1D21', accent: '#1C1D21' },
  'golf-carritos': { from: '#6B4A10', to: '#B5761A', accent: '#B5761A' },
  'golf-tee-practica': { from: '#17603F', to: '#267F56', accent: '#267F56' },

  // Sistema
  usuarios:      { from: '#26282D', to: '#4A4D54', accent: '#4A4D54' },
  configuracion: { from: '#26282D', to: '#33363C', accent: '#33363C' },
  default:       { from: '#26282D', to: '#1C1D21', accent: '#1C1D21' },
}

// ── Props ─────────────────────────────────────────────────────
type Tab = {
  key: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>
  badge?: React.ReactNode
  disabled?: boolean
  disabledHint?: string
}

// Escala estándar de tamaños — usar `size` en código nuevo en vez de `maxWidth` a mano.
export const MODAL_SIZES = { sm: 440, md: 560, lg: 680, xl: 820, xxl: 1000 } as const
export type ModalSize = keyof typeof MODAL_SIZES

type Props = {
  modulo: ModalModulo
  titulo: string
  subtitulo?: React.ReactNode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icono?: React.ComponentType<any>
  /** Escala estándar (sm=440 · md=560 · lg=680 · xl=820 · xxl=1000). Preferir sobre `maxWidth`. */
  size?: ModalSize
  /** Ancho exacto en px — escape hatch para casos ya afinados; tiene prioridad sobre `size`. */
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
  size, maxWidth, onClose,
  children, tabs, activeTab, onTabChange, footer,
}: Props) {
  // Marca Carbón/Turquesa: un solo encabezado carbón para todos los módulos.
  // MODAL_PALETTES se conserva por si se quiere volver al color por módulo.
  void MODAL_PALETTES
  const pal = { from: '#26282D', to: '#1C1D21', accent: '#1C1D21' }
  const resolvedMaxWidth = maxWidth ?? MODAL_SIZES[size ?? 'lg']

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(28,29,33,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: resolvedMaxWidth,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
        animation: 'modalIn 0.18s ease-out',
      }}>
        {/* ── Header ── */}
        <div style={{
          background: pal.to,
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
                      boxShadow: active ? 'inset 0 2px 0 #19D3C5' : 'none',
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
                      <Lock size={10} style={{ opacity: 0.45 }} />
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
            padding: '14px 28px', borderTop: '1px solid #E6E8EB',
            background: '#F8F9FA', borderRadius: '0 0 20px 20px',
            display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap',
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
