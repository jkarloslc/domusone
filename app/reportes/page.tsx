'use client'
import { useState } from 'react'
import { BarChart3, MapPin, Users, AlertTriangle, Eye, Car, ChevronRight, ShoppingCart, Package, Warehouse, FileText, TrendingDown } from 'lucide-react'
import ReporteLotes from './ReporteLotes'
import ReporteLotesPropietarios from './ReporteLotesPropietarios'
import ReportePropietarios from './ReportePropietarios'
import ReporteIncidencias from './ReporteIncidencias'
import ReporteIncidenciasAsignado from './ReporteIncidenciasAsignado'
import ReporteVisitantes from './ReporteVisitantes'
import ReporteVehiculos from './ReporteVehiculos'
import ReporteConsumoCentroCosto from './ReporteConsumoCentroCosto'
import ReporteInventario from './ReporteInventario'
import ReporteOrdenesCompra from './ReporteOrdenesCompra'
import ReporteCXP from './ReporteCXP'
import ReporteKardex from './ReporteKardex'

const GRUPOS = [
  {
    label: 'Residencial',
    color: 'var(--blue)',
    reportes: [
      { id: 'lotes',                label: 'Lotes por Sección',         icon: MapPin,        desc: 'Catálogo de lotes filtrable por sección' },
      { id: 'lotes-propietarios',   label: 'Lotes y Propietarios',      icon: Users,         desc: 'Relación de lotes con su propietario asignado' },
      { id: 'propietarios',         label: 'Directorio de Propietarios', icon: Users,         desc: 'Datos completos de todos los propietarios' },
      { id: 'incidencias',          label: 'Incidencias por Lote',      icon: AlertTriangle, desc: 'Historial de incidencias filtrado por lote' },
      { id: 'incidencias-asignado', label: 'Incidencias por Asignado',  icon: AlertTriangle, desc: 'Incidencias agrupadas por responsable' },
      { id: 'visitantes',           label: 'Visitantes por Lote',       icon: Eye,           desc: 'Visitantes autorizados por lote' },
      { id: 'vehiculos',            label: 'Vehículos por Lote',        icon: Car,           desc: 'Vehículos autorizados por lote' },
    ],
  },
  {
    label: 'Compras e Inventarios',
    color: '#059669',
    reportes: [
      { id: 'consumo-cc',     label: 'Consumo por Centro de Costo', icon: TrendingDown,  desc: 'Materiales transferidos a cada centro de costo' },
      { id: 'inventario',     label: 'Inventario Actual',           icon: Package,       desc: 'Existencias por almacén con alertas de stock mínimo' },
      { id: 'ordenes-compra', label: 'Órdenes de Compra',          icon: ShoppingCart,  desc: 'OC por proveedor, status y período' },
      { id: 'cxp',            label: 'Antigüedad de Saldos CXP',   icon: FileText,      desc: 'Cuentas por pagar con bandas de vencimiento' },
      { id: 'kardex',         label: 'Kardex de Movimientos',      icon: Warehouse,     desc: 'Historial de entradas y salidas de inventario' },
    ],
  },
]

const ALL_REPORTES = GRUPOS.flatMap(g => g.reportes)

export default function ReportesPage() {
  const [active, setActive] = useState<string | null>(null)
  const current = ALL_REPORTES.find(r => r.id === active)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <BarChart3 size={16} style={{ color: 'var(--blue)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Módulo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em' }}>Reportes</h1>
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

      {/* Grid de reportes por grupo */}
      {!active && GRUPOS.map(grupo => (
        <div key={grupo.label} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 4, height: 16, borderRadius: 2, background: grupo.color }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: grupo.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {grupo.label}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {grupo.reportes.map(r => (
              <button key={r.id} onClick={() => setActive(r.id)}
                className="card card-hover"
                style={{ padding: '18px 20px', cursor: 'pointer', textAlign: 'left', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: grupo.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <r.icon size={16} style={{ color: grupo.color }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{r.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Reportes residencial */}
      {active === 'lotes'                && <ReporteLotes />}
      {active === 'lotes-propietarios'   && <ReporteLotesPropietarios />}
      {active === 'propietarios'         && <ReportePropietarios />}
      {active === 'incidencias'          && <ReporteIncidencias />}
      {active === 'incidencias-asignado' && <ReporteIncidenciasAsignado />}
      {active === 'visitantes'           && <ReporteVisitantes />}
      {active === 'vehiculos'            && <ReporteVehiculos />}
      {/* Reportes compras */}
      {active === 'consumo-cc'     && <ReporteConsumoCentroCosto />}
      {active === 'inventario'     && <ReporteInventario />}
      {active === 'ordenes-compra' && <ReporteOrdenesCompra />}
      {active === 'cxp'            && <ReporteCXP />}
      {active === 'kardex'         && <ReporteKardex />}
    </div>
  )
}

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
