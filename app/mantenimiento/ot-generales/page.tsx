'use client'
import { Wrench } from 'lucide-react'
import OrdenesTrabajoTab from '../gestion/OrdenesTrabajoTab'

export default function OTGeneralesPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Wrench size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Mantenimiento</span>
          </div>
          <h1 className="page-title-xl">OT's Generales</h1>
          <p className="page-subtitle">Órdenes de trabajo de la cuadrilla general por centro de costo, área y frente</p>
        </div>
      </div>

      <OrdenesTrabajoTab empresa="Cuadrilla" modulo="generales" />
    </div>
  )
}
