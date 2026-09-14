'use client'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import React from 'react'

type Props = {
  title: string
  subtitle?: React.ReactNode
  /** Ícono del chip "eyebrow" arriba del título (patrón de hub de módulo). */
  icon?: React.ComponentType<any>
  /** Color del ícono del eyebrow — el color siempre va en el ícono, nunca solo en el label. */
  color?: string
  /** Texto UPPERCASE del chip (ej. "Módulo"). Solo se renderiza si también hay `icon`. */
  eyebrowLabel?: string
  /** 'xl' = título de módulo principal (32px, hub pages). 'default' = subpágina (26px). */
  variant?: 'xl' | 'default'
  /** Si se pasa, renderiza el botón "regresar" a la izquierda del título (navegación imperativa, ej. router.push). */
  onBack?: () => void
  /** Alternativa a `onBack` — renderiza el botón "regresar" como <Link>. Ignorado si también se pasa `onBack`. */
  backHref?: string
  /** Botones/acciones a la derecha (ej. "Nuevo X") — usa .page-header-actions. */
  actions?: React.ReactNode
}

export default function PageHeader({
  title, subtitle, icon: Icon, color = 'var(--blue)', eyebrowLabel,
  variant = 'default', onBack, backHref, actions,
}: Props) {
  return (
    <div className="page-header">
      <div className="page-header-left">
        {onBack ? (
          <button className="btn-back" onClick={onBack} aria-label="Regresar">
            <ArrowLeft size={16} />
          </button>
        ) : backHref ? (
          <Link href={backHref} className="btn-back" aria-label="Regresar">
            <ArrowLeft size={16} />
          </Link>
        ) : null}
        <div style={{ minWidth: 0 }}>
          {Icon && eyebrowLabel && (
            <div className="page-eyebrow">
              <Icon size={16} style={{ color }} />
              <span className="page-eyebrow-label">{eyebrowLabel}</span>
            </div>
          )}
          <h1 className={variant === 'xl' ? 'page-title-xl' : 'page-title'}>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  )
}
