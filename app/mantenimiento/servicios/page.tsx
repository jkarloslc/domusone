'use client'
import { Zap } from 'lucide-react'
import ServiciosTab from '../gestion/ServiciosTab'

export default function ServiciosPage() {
  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Zap size={16} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Mantenimiento</span>
          </div>
          <h1 className="page-title-xl">Servicios</h1>
          <p className="page-subtitle">Medidores de CFE y Agua: consumo y facturación por periodo</p>
        </div>
      </div>

      <ServiciosTab />
    </div>
  )
}
