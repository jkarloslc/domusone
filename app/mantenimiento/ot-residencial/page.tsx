'use client'
import { ClipboardList } from 'lucide-react'
import OrdenesTrabajoTab from '../gestion/OrdenesTrabajoTab'

export default function OTResidencialPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <ClipboardList size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Mantenimiento</span>
          </div>
          <h1 className="page-title-xl">OT Mantto. Residencial</h1>
          <p className="page-subtitle">Órdenes de trabajo del mantenimiento residencial por cuadrante y área</p>
        </div>
      </div>

      <OrdenesTrabajoTab empresa="Balvanera" modulo="mantenimiento" />
    </div>
  )
}
