'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { BarChart3, MapPin, Users, AlertTriangle, Eye, Car, ChevronRight, ShoppingCart, Package, Warehouse, FileText, TrendingDown, Wrench, ClipboardList, Building2, Wallet, Clock, Star } from 'lucide-react'
import ReporteLotes from './ReporteLotes'
import ReporteLotesPropietarios from './ReporteLotesPropietarios'
import ReportePropietarios from './ReportePropietarios'
import ReporteIncidencias from './ReporteIncidencias'
import ReporteIncidenciasAsignado from './ReporteIncidenciasAsignado'
import ReporteIncidenciasSeccion from './ReporteIncidenciasSeccion'
import ReporteVisitantes from './ReporteVisitantes'
import ReporteVehiculos from './ReporteVehiculos'
import ReporteConsumoCentroCosto from './ReporteConsumoCentroCosto'
import ReporteConsumoSeccion from './ReporteConsumoSeccion'
import ReporteConsumoFrente from './ReporteConsumoFrente'
import ReporteInventario from './ReporteInventario'
import ReporteOrdenesCompra from './ReporteOrdenesCompra'
import ReporteOrdenesPago from './ReporteOrdenesPago'
import ReporteAntiguedadOPporCC from './ReporteAntiguedadOPporCC'
import ReporteCXP from './ReporteCXP'
import ReporteKardex from './ReporteKardex'
import ReporteTransferencias from './ReporteTransferencias'
import ReporteOrdenesTrabajo from './ReporteOrdenesTrabajo'
import ReporteProgramasMantenimiento from './ReporteProgramasMantenimiento'
import ReporteEstadoCuenta from './ReporteEstadoCuenta'
import ReporteComprasPorProveedor from './ReporteComprasPorProveedor'
import ReporteIngresos from './ReporteIngresos'
import ReporteHipicoEstadoCuenta from './ReporteHipicoEstadoCuenta'
import ReporteHipicoServicios from './ReporteHipicoServicios'
import ReporteGolfEstadoCuenta from './ReporteGolfEstadoCuenta'
import ReporteGolfCobranza from './ReporteGolfCobranza'
import ReporteGolfAccesos from './ReporteGolfAccesos'
import ReporteHospitalityEventos from './ReporteHospitalityEventos'

const GRUPOS = [
  {
    slug:  'residencial',
    label: 'Residencial',
    color: 'var(--blue)',
    reportes: [
      { id: 'lotes',                label: 'Lotes por Sección',          icon: MapPin,        desc: 'Catálogo de lotes filtrable por sección' },
      { id: 'lotes-propietarios',   label: 'Lotes y Propietarios',       icon: Users,         desc: 'Relación de lotes con su propietario asignado' },
      { id: 'propietarios',         label: 'Directorio de Propietarios', icon: Users,         desc: 'Datos completos de todos los propietarios' },
      { id: 'incidencias',          label: 'Incidencias por Lote',       icon: AlertTriangle, desc: 'Historial de incidencias filtrado por lote' },
      { id: 'incidencias-asignado', label: 'Incidencias por Asignado',   icon: AlertTriangle, desc: 'Incidencias agrupadas por responsable' },
      { id: 'incidencias-seccion',  label: 'Incidencias por Sección',    icon: AlertTriangle, desc: 'Incidencias agrupadas por sección residencial con conteo y status' },
      { id: 'visitantes',           label: 'Visitantes por Lote',        icon: Eye,           desc: 'Visitantes autorizados por lote' },
      { id: 'vehiculos',            label: 'Vehículos por Lote',         icon: Car,           desc: 'Vehículos autorizados por lote' },
    ],
  },
  {
    slug:  'mantenimiento',
    label: 'Mantenimiento',
    color: '#7c3aed',
    reportes: [
      { id: 'ordenes-trabajo',        label: 'Órdenes de Trabajo',          icon: Wrench,        desc: 'OT filtrable por status, tipo, sección, prioridad y fecha' },
      { id: 'programas-mantenimiento', label: 'Programas de Mantenimiento', icon: ClipboardList, desc: 'Programas con sus tareas, responsable y semanas asignadas' },
    ],
  },
  {
    slug:  'tesoreria',
    label: 'Tesorería',
    color: '#0f766e',
    reportes: [
      { id: 'estado-cuenta',        label: 'Estado de Cuenta',           icon: Building2, desc: 'Movimientos por cuenta bancaria con saldo inicial, cargos, abonos y saldo final del período' },
      { id: 'cxp',                  label: 'Antigüedad de Saldos CXP',  icon: FileText,  desc: 'Cuentas por pagar con bandas de vencimiento' },
      { id: 'ordenes-pago-cc',      label: 'Órdenes de Pago por CC / Área', icon: Wallet, desc: 'OPs agrupadas por centro de costo y área, con filtros por status y rango de fechas' },
      { id: 'antiguedad-op-cc',     label: 'Antigüedad de OPs por CC / Área', icon: Clock, desc: 'Saldos pendientes por banda de vencimiento (0-30, 31-60, 61-90, +90), agrupados por CC y Área' },
    ],
  },
  {
    slug:  'ingresos',
    label: 'Ingresos',
    color: '#059669',
    reportes: [
      { id: 'ingresos-tipo',   label: 'Ingresos por Tipo',           icon: TrendingDown, desc: 'Recibos agrupados por tipo de ingreso (Golf, Cuotas, Rentas, Caballerizas)' },
      { id: 'ingresos-centro', label: 'Ingresos por Centro',         icon: Building2,    desc: 'Recibos agrupados por centro de ingreso con desglose de forma de pago' },
    ],
  },
  {
    slug:  'compras',
    label: 'Compras e Inventarios',
    color: '#059669',
    reportes: [
      { id: 'consumo-cc',      label: 'Consumo por Centro de Costo', icon: TrendingDown, desc: 'Materiales transferidos a cada centro de costo' },
      { id: 'consumo-seccion', label: 'Consumo por Sección',         icon: MapPin,       desc: 'Órdenes de pago agrupadas por sección del residencial' },
      { id: 'consumo-frente',  label: 'Consumo por Frente',          icon: MapPin,       desc: 'Órdenes de pago agrupadas por frente de obra' },
      { id: 'inventario',      label: 'Inventario Actual',           icon: Package,      desc: 'Existencias por almacén con alertas de stock mínimo' },
      { id: 'ordenes-compra',         label: 'Órdenes de Compra',               icon: ShoppingCart, desc: 'OC por proveedor, status y período' },
      { id: 'compras-por-proveedor',  label: 'Compras por Proveedor',           icon: ShoppingCart, desc: 'OCs agrupadas por proveedor con totales, filtrable por CC, status y fecha' },
      { id: 'ordenes-pago-cc',   label: 'Órdenes de Pago por CC / Área', icon: Wallet,    desc: 'OPs agrupadas por centro de costo y área, con filtros por status y rango de fechas' },
      { id: 'antiguedad-op-cc',  label: 'Antigüedad de OPs por CC / Área', icon: Clock,  desc: 'Saldos pendientes por banda de vencimiento (0-30, 31-60, 61-90, +90), agrupados por CC y Área' },
      { id: 'kardex',            label: 'Kardex de Movimientos',      icon: Warehouse,    desc: 'Historial de entradas y salidas de inventario' },
      { id: 'transferencias',  label: 'Transferencias',             icon: Package,      desc: 'Movimientos entre almacenes con filtros por origen, destino y fecha' },
    ],
  },
  {
    slug:  'golf',
    label: 'Club Golf',
    color: '#b8952a',
    reportes: [
      { id: 'golf-estado-cuenta', label: 'Estado de Cuenta',    icon: FileText,  desc: 'Cuotas y recibos por socio en un período' },
      { id: 'golf-cobranza',      label: 'Cobranza / CXC',      icon: Wallet,    desc: 'Cuotas por categoría, tipo y status con resumen y detalle' },
      { id: 'golf-accesos',       label: 'Salidas al Campo',     icon: MapPin,    desc: 'Registro de rondas por socio, espacio y forma de juego' },
    ],
  },
  {
    slug:  'hipico',
    label: 'Hípico',
    color: '#92400e',
    reportes: [
      { id: 'hipico-estado-cuenta', label: 'Estado de Cuenta', icon: FileText,  desc: 'Cargos y pagos por arrendatario en un período' },
      { id: 'hipico-servicios',     label: 'Servicios por Caballo', icon: BarChart3, desc: 'Bitácora de veterinario, herrajes y alimentos por caballo, arrendatario y tipo' },
    ],
  },
  {
    slug:  'hospitality',
    label: 'Hospitality',
    color: '#9333ea',
    reportes: [
      { id: 'hospitality-eventos', label: 'Eventos — Ingresos vs Gastos', icon: Star, desc: 'Resumen financiero por evento: ingresos cobrados, OPs vinculadas y balance neto' },
    ],
  },
]

const ALL = GRUPOS.flatMap(g => g.reportes)

function ReportesContent() {
  const searchParams  = useSearchParams()
  const grupoParam    = searchParams.get('grupo')
  const [active, setActive] = useState<string | null>(null)
  const current  = ALL.find(r => r.id === active)

  // Si viene ?grupo= filtramos; si no, mostramos todos
  const gruposVisibles = grupoParam
    ? GRUPOS.filter(g => g.slug === grupoParam)
    : GRUPOS
  const grupoActivo = gruposVisibles[0]

  const handleBack = () => setActive(null)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <BarChart3 size={16} style={{ color: grupoActivo?.color ?? 'var(--blue)' }} />
            <span className="page-eyebrow-label">
              {grupoParam ? grupoActivo?.label : 'Módulo'}
            </span>
          </div>
          <h1 className="page-title-xl">Reportes</h1>
        {/* Breadcrumb cuando hay reporte activo */}
        {active && current && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 13, padding: 0 }}>
              {grupoParam ? (grupoActivo?.label ?? 'Reportes') : 'Todos los reportes'}
            </button>
            <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
            <span>{current.label}</span>
          </div>
        )}
        </div>
      </div>

      {/* Grid agrupado */}
      {!active && gruposVisibles.map(grupo => (
        <div key={grupo.label} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 4, height: 16, borderRadius: 2, background: grupo.color }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: grupo.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
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
      {active === 'incidencias-seccion'  && <ReporteIncidenciasSeccion />}
      {active === 'visitantes'           && <ReporteVisitantes />}
      {active === 'vehiculos'            && <ReporteVehiculos />}

      {/* Reportes mantenimiento */}
      {active === 'ordenes-trabajo'         && <ReporteOrdenesTrabajo />}
      {active === 'programas-mantenimiento' && <ReporteProgramasMantenimiento />}

      {/* Reportes tesorería */}
      {active === 'estado-cuenta' && <ReporteEstadoCuenta />}

      {/* Reportes compras */}
      {/* Reportes ingresos */}
      {active === 'ingresos-tipo'   && <ReporteIngresos />}
      {active === 'ingresos-centro' && <ReporteIngresos />}

      {/* Reportes compras */}
      {active === 'consumo-cc'       && <ReporteConsumoCentroCosto />}
      {active === 'consumo-seccion'  && <ReporteConsumoSeccion />}
      {active === 'consumo-frente'   && <ReporteConsumoFrente />}
      {active === 'inventario'       && <ReporteInventario />}
      {active === 'ordenes-compra'   && <ReporteOrdenesCompra />}
      {active === 'ordenes-pago-cc'  && <ReporteOrdenesPago />}
      {active === 'antiguedad-op-cc' && <ReporteAntiguedadOPporCC />}
      {active === 'cxp'              && <ReporteCXP />}
      {active === 'kardex'           && <ReporteKardex />}
      {active === 'transferencias'        && <ReporteTransferencias />}
      {active === 'compras-por-proveedor' && <ReporteComprasPorProveedor />}

      {/* Reportes golf */}
      {active === 'golf-estado-cuenta' && <ReporteGolfEstadoCuenta />}
      {active === 'golf-cobranza'      && <ReporteGolfCobranza />}
      {active === 'golf-accesos'       && <ReporteGolfAccesos />}

      {/* Reportes hípico */}
      {active === 'hipico-estado-cuenta' && <ReporteHipicoEstadoCuenta />}
      {active === 'hipico-servicios'     && <ReporteHipicoServicios />}

      {/* Reportes hospitality */}
      {active === 'hospitality-eventos' && <ReporteHospitalityEventos />}
    </div>
  )
}

export default function ReportesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Cargando reportes…</div>}>
      <ReportesContent />
    </Suspense>
  )
}
