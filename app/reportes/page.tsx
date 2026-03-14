'use client'
import { useState } from 'react'
import { BarChart3, MapPin, Users, AlertTriangle, Eye, Car, ChevronRight } from 'lucide-react'
import ReporteLotes from './ReporteLotes'
import ReporteLotesPropietarios from './ReporteLotesPropietarios'
import ReportePropietarios from './ReportePropietarios'
import ReporteIncidencias from './ReporteIncidencias'
import ReporteIncidenciasAsignado from './ReporteIncidenciasAsignado'
import ReporteVisitantes from './ReporteVisitantes'
import ReporteVehiculos from './ReporteVehiculos'

const REPORTES = [
  { id: 'lotes',                 icon: MapPin,         label: 'Lotes por Sección',         desc: 'Catálogo de lotes filtrable por sección' },
  { id: 'lotes-propietarios',    icon: Users,          label: 'Lotes y Propietarios',       desc: 'Relación de lotes con su propietario asignado' },
  { id: 'propietarios',          icon: Users,          label: 'Directorio de Propietarios', desc: 'Datos completos de todos los propietarios' },
  { id: 'incidencias',           icon: AlertTriangle,  label: 'Incidencias por Lote',       desc: 'Historial de incidencias filtrado por lote' },
  { id: 'incidencias-asignado',  icon: AlertTriangle,  label: 'Incidencias por Asignado',   desc: 'Incidencias agrupadas por responsable' },
  { id: 'visitantes',            icon: Eye,            label: 'Visitantes por Lote',        desc: 'Visitantes autorizados por lote' },
  { id: 'vehiculos',             icon: Car,            label: 'Vehículos por Lote',         desc: 'Vehículos autorizados por lote' },
]

export default function ReportesPage() {
  const [active, setActive] = useState<string | null>(null)

  const current = REPORTES.find(r => r.id === active)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <BarChart3 size={16} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em' }}>
          Reportes
        </h1>
        {active && current && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            <button onClick={() => setActive(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 13, padding: 0 }}>
              Todos los reportes
            </button>
            <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
            <span>{current.label}</span>
          </div>
        )}
      </div>

      {/* Grid de reportes */}
      {!active && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {REPORTES.map(r => (
            <button key={r.id} onClick={() => setActive(r.id)}
              className="card card-hover"
              style={{
                padding: '20px 22px', cursor: 'pointer', textAlign: 'left',
                border: '1px solid #e2e8f0', background: '#fff',
                display: 'flex', alignItems: 'flex-start', gap: 14,
                transition: 'all 0.18s',
              }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--blue-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <r.icon size={17} style={{ color: 'var(--blue)' }} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{r.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Contenido del reporte activo */}
      {active === 'lotes'               && <ReporteLotes />}
      {active === 'lotes-propietarios'  && <ReporteLotesPropietarios />}
      {active === 'propietarios'        && <ReportePropietarios />}
      {active === 'incidencias'         && <ReporteIncidencias />}
      {active === 'incidencias-asignado' && <ReporteIncidenciasAsignado />}
      {active === 'visitantes'          && <ReporteVisitantes />}
      {active === 'vehiculos'           && <ReporteVehiculos />}
    </div>
  )
}
