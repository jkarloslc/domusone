'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { BarChart3, MapPin, Users, AlertTriangle, Eye, Car, ChevronRight, ShoppingCart, Package, Warehouse, FileText, TrendingDown, Wrench, ClipboardList, Building2, Wallet, Clock, Star, Droplets } from 'lucide-react'
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
import ReporteOTFinanciero from './ReporteOTFinanciero'
import ReporteOTCumplimiento from './ReporteOTCumplimiento'
import ReporteEstadoCuenta from './ReporteEstadoCuenta'
import ReporteComprasPorProveedor from './ReporteComprasPorProveedor'
import ReporteIngresos from './ReporteIngresos'
import ReporteIngresosPorFormaPago from './ReporteIngresosPorFormaPago'
import ReporteIngresosCuotas from './ReporteIngresosCuotas'
import ReporteIngresosConceptoCentro from './ReporteIngresosConceptoCentro'
import ReporteHipicoEstadoCuenta from './ReporteHipicoEstadoCuenta'
import ReporteHipicoServicios from './ReporteHipicoServicios'
import ReporteGolfEstadoCuenta from './ReporteGolfEstadoCuenta'
import ReporteGolfCobranza from './ReporteGolfCobranza'
import ReporteGolfAccesos from './ReporteGolfAccesos'
import ReporteHospitalityEventos from './ReporteHospitalityEventos'
import ReporteOPsPorProveedor from './ReporteOPsPorProveedor'
import ReporteEstadoCuentaProveedor from './ReporteEstadoCuentaProveedor'
import ReportePagosAplicados from './ReportePagosAplicados'
import ReporteGolfVentasHistoricas from './ReporteGolfVentasHistoricas'
import ReporteGolfAuditoriaSlots from './ReporteGolfAuditoriaSlots'
import ReporteGolfSlotsOcupacion from './ReporteGolfSlotsOcupacion'
import ReporteRiegoConsumo from './ReporteRiegoConsumo'
import ReporteLotesPorSeccionClasif from './ReporteLotesPorSeccionClasif'
import ReporteLotesResumenClasif from './ReporteLotesResumenClasif'
import ReportePropietariosDesgloseLotes from './ReportePropietariosDesgloseLotes'
import ReporteLotesPorStatus from './ReporteLotesPorStatus'
import ReporteSeccionesLotes from './ReporteSeccionesLotes'

const GRUPOS = [
  {
    slug:   'residencial',
    modulo: 'lotes',
    label: 'Residencial',
    color: 'var(--blue)',
    reportes: [
      { id: 'secciones-lotes',        label: 'Secciones con Cantidad de Lotes', icon: MapPin, desc: 'Resumen por sección: total de lotes y desglose por status (Vendido / Libre / Bloqueado)' },
      { id: 'lotes',                label: 'Lotes por Sección',          icon: MapPin,        desc: 'Catálogo de lotes filtrable por sección' },
      { id: 'lotes-seccion-clasif',   label: 'Lotes por Sección y Clasificación', icon: MapPin, desc: 'Lotes agrupados jerárquicamente por sección y clasificación, con subtotales de superficie y valor' },
      { id: 'lotes-resumen-clasif',   label: 'Resumen por Sección y Clasificación', icon: MapPin, desc: 'Tabla resumen sin desglose: una fila por clasificación dentro de cada sección, con subtotales y total general' },
      { id: 'propietarios-desglose',  label: 'Propietarios — Desglose de Lotes',   icon: Users, desc: 'Informe jerárquico: Propietario → Sección → Clasificación → Lote, con superficie, status y valor' },
      { id: 'lotes-por-status',       label: 'Lotes por Status',                   icon: MapPin, desc: 'Lotes agrupados por status (Vendido / Libre / Bloqueado) con conteo, % y totales de superficie y valor' },
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
    slug:   'mantenimiento',
    modulo: 'mantenimiento',
    label: 'Mantenimiento',
    color: '#7c3aed',
    reportes: [
      { id: 'ordenes-trabajo',        label: 'Órdenes de Trabajo',          icon: Wrench,        desc: 'OT filtrable por status, tipo, área, prioridad y fecha' },
      { id: 'ot-financiero',          label: 'OT Financiero CC/Área',       icon: Wallet,        desc: 'Costo de MO y recursos por Centro de Costo, Área y Frente' },
      { id: 'ot-cumplimiento',        label: 'OT Cumplimiento',             icon: BarChart3,     desc: 'Tasa de completado, cumplimiento de fecha límite y desglose por CC/Área/Tipo' },
      { id: 'programas-mantenimiento', label: 'Programas de Mantenimiento', icon: ClipboardList, desc: 'Programas con sus tareas, responsable y semanas asignadas' },
    ],
  },
  {
    slug:   'tesoreria',
    modulo: 'tesoreria',
    label: 'Tesorería',
    color: '#0f766e',
    reportes: [
      { id: 'estado-cuenta',        label: 'Estado de Cuenta',           icon: Building2, desc: 'Movimientos por cuenta bancaria con saldo inicial, cargos, abonos y saldo final del período' },
      { id: 'cxp',                  label: 'Antigüedad de Saldos CXP',  icon: FileText,  desc: 'Cuentas por pagar con bandas de vencimiento' },
      { id: 'ordenes-pago-cc',      label: 'Órdenes de Pago por CC / Área', icon: Wallet, desc: 'OPs agrupadas por centro de costo y área, con filtros por status y rango de fechas' },
      { id: 'antiguedad-op-cc',     label: 'Antigüedad de OPs por CC / Área', icon: Clock, desc: 'Saldos pendientes por banda de vencimiento (0-30, 31-60, 61-90, +90), agrupados por CC y Área' },
      { id: 'pagos-aplicados',      label: 'Pagos Aplicados',                 icon: Wallet, desc: 'Abonos registrados por proveedor, cuenta bancaria y rango de fechas' },
    ],
  },
  {
    slug:   'ingresos',
    modulo: 'ingresos',
    label: 'Ingresos',
    color: '#059669',
    reportes: [
      { id: 'ingresos-tipo',            label: 'Ingresos por Tipo',                       icon: TrendingDown, desc: 'Recibos agrupados por tipo de ingreso (Golf, Cuotas, Rentas, Caballerizas)' },
      { id: 'ingresos-centro',          label: 'Ingresos por Centro',                     icon: Building2,    desc: 'Recibos agrupados por centro de ingreso con desglose de forma de pago' },
      { id: 'ingresos-concepto-centro', label: 'Ingresos por Concepto y Centro',          icon: BarChart3,    desc: 'Ingresos desglosados por concepto de cobro dentro de cada centro de ingreso — vista jerárquica y pivot' },
      { id: 'ingresos-formas-pago',     label: 'Ingresos por Forma de Pago',             icon: Wallet,       desc: 'Matriz de ingresos por centro de ingreso con columnas por forma de pago — filtrable por centro y forma' },
      { id: 'ingresos-cuotas',          label: 'Cuotas por Sección y Concepto',          icon: Building2,    desc: 'Cuotas residenciales desglosadas por sección y concepto — solo centros de tipo Cuotas con desglose por sección' },
    ],
  },
  {
    slug:   'compras',
    modulo: 'compras',
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
      { id: 'ops-por-proveedor',        label: 'OPs por Proveedor',              icon: FileText,     desc: 'Órdenes de pago agrupadas por proveedor con totales y saldos pendientes' },
      { id: 'estado-cuenta-proveedor',  label: 'Estado de Cuenta — Proveedor',   icon: Building2,    desc: 'Movimientos individuales, saldo acumulado y datos bancarios de un proveedor' },
    ],
  },
  {
    slug:   'golf',
    modulo: 'golf',
    label: 'Club Golf',
    color: '#b8952a',
    reportes: [
      { id: 'golf-estado-cuenta', label: 'Estado de Cuenta',    icon: FileText,  desc: 'Cuotas y recibos por socio en un período' },
      { id: 'golf-cobranza',      label: 'Cobranza / CXC',      icon: Wallet,    desc: 'Cuotas por categoría, tipo y status con resumen y detalle' },
      { id: 'golf-accesos',       label: 'Salidas al Campo',     icon: MapPin,    desc: 'Registro de rondas por socio, espacio y forma de juego' },
      { id: 'golf-caballos-servicios',  label: 'Caballos y Servicios',        icon: BarChart3, desc: 'Desglose por caballo y tipo de servicio, con filtros por fechas, caballo y tipo' },
      { id: 'golf-ventas-historicas',   label: 'Ventas Históricas POS',       icon: Wallet,    desc: 'Ventas de cortes realizados por centro de venta, artículo/servicio y rango de fechas' },
      { id: 'golf-auditoria-slots',     label: 'Auditoría de Slots',          icon: ClipboardList, desc: 'Comparativo sistema vs. físico de cajones asignados, vacantes y diferencias por categoría' },
      { id: 'golf-slots-ocupacion',     label: 'Ocupación de Slots / Cajones', icon: BarChart3, desc: 'Porcentaje de ocupación y disponibilidad de cajones por categoría y período' },
      { id: 'golf-riego-consumo',       label: 'Consumo de Agua — Riego',     icon: Droplets,  desc: 'Consumo real vs. programado por origen de agua, semana y período con análisis de gap' },
    ],
  },
  {
    slug:   'hipico',
    modulo: 'hipico',
    label: 'Hípico',
    color: '#92400e',
    reportes: [
      { id: 'hipico-estado-cuenta', label: 'Estado de Cuenta', icon: FileText,  desc: 'Cargos y pagos por arrendatario en un período' },
      { id: 'hipico-servicios',     label: 'Servicios por Caballo', icon: BarChart3, desc: 'Desglose jerárquico por caballo y tipo de servicio, con filtros por fechas, caballo y tipo' },
    ],
  },
  {
    slug:   'hospitality',
    modulo: 'hospitality',
    label: 'Hospitality',
    color: '#9333ea',
    reportes: [
      { id: 'hospitality-eventos', label: 'Eventos — Ingresos vs Gastos', icon: Star, desc: 'Resumen financiero por evento (Hospitality, Golf Torneos, Hípico): ingresos cobrados, OPs + gastos manuales y balance neto. Filtrable por módulo.' },
    ],
  },
]

const ALL = GRUPOS.flatMap(g => g.reportes)

function ReportesContent() {
  const searchParams  = useSearchParams()
  const grupoParam    = searchParams.get('grupo')
  const [active, setActive] = useState<string | null>(null)
  const current  = ALL.find(r => r.id === active)
  const { can, canReporte } = useAuth()

  // Solo grupos cuyo módulo el usuario puede ver
  const gruposPermitidos = GRUPOS.filter(g => can(g.modulo))

  // Si viene ?grupo= filtramos además por slug
  const gruposVisibles = grupoParam
    ? gruposPermitidos.filter(g => g.slug === grupoParam)
    : gruposPermitidos
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
      {!active && gruposVisibles.map(grupo => {
        const reportesVisibles = grupo.reportes.filter(r => canReporte(r.id))
        if (reportesVisibles.length === 0) return null
        return (
        <div key={grupo.label} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 4, height: 16, borderRadius: 2, background: grupo.color }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: grupo.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {grupo.label}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {reportesVisibles.map(r => (
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
        )
      })}

      {/* Reportes residencial */}
      {active === 'secciones-lotes'       && <ReporteSeccionesLotes />}
      {active === 'lotes'                && <ReporteLotes />}
      {active === 'lotes-seccion-clasif' && <ReporteLotesPorSeccionClasif />}
      {active === 'lotes-resumen-clasif'  && <ReporteLotesResumenClasif />}
      {active === 'propietarios-desglose' && <ReportePropietariosDesgloseLotes />}
      {active === 'lotes-por-status'      && <ReporteLotesPorStatus />}
      {active === 'lotes-propietarios'   && <ReporteLotesPropietarios />}
      {active === 'propietarios'         && <ReportePropietarios />}
      {active === 'incidencias'          && <ReporteIncidencias />}
      {active === 'incidencias-asignado' && <ReporteIncidenciasAsignado />}
      {active === 'incidencias-seccion'  && <ReporteIncidenciasSeccion />}
      {active === 'visitantes'           && <ReporteVisitantes />}
      {active === 'vehiculos'            && <ReporteVehiculos />}

      {/* Reportes mantenimiento */}
      {active === 'ordenes-trabajo'         && <ReporteOrdenesTrabajo />}
      {active === 'ot-financiero'           && <ReporteOTFinanciero />}
      {active === 'ot-cumplimiento'         && <ReporteOTCumplimiento />}
      {active === 'programas-mantenimiento' && <ReporteProgramasMantenimiento />}

      {/* Reportes tesorería */}
      {active === 'estado-cuenta'    && <ReporteEstadoCuenta />}
      {active === 'pagos-aplicados'  && <ReportePagosAplicados />}

      {/* Reportes compras */}
      {/* Reportes ingresos */}
      {active === 'ingresos-tipo'            && <ReporteIngresos />}
      {active === 'ingresos-centro'          && <ReporteIngresos />}
      {active === 'ingresos-concepto-centro' && <ReporteIngresosConceptoCentro />}
      {active === 'ingresos-formas-pago'     && <ReporteIngresosPorFormaPago />}
      {active === 'ingresos-cuotas'          && <ReporteIngresosCuotas />}

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
      {active === 'compras-por-proveedor'       && <ReporteComprasPorProveedor />}
      {active === 'ops-por-proveedor'           && <ReporteOPsPorProveedor />}
      {active === 'estado-cuenta-proveedor'     && <ReporteEstadoCuentaProveedor />}

      {/* Reportes golf */}
      {active === 'golf-estado-cuenta' && <ReporteGolfEstadoCuenta />}
      {active === 'golf-cobranza'      && <ReporteGolfCobranza />}
      {active === 'golf-accesos'       && <ReporteGolfAccesos />}
      {active === 'golf-caballos-servicios'  && <ReporteHipicoServicios />}
      {active === 'golf-ventas-historicas'   && <ReporteGolfVentasHistoricas />}
      {active === 'golf-auditoria-slots'     && <ReporteGolfAuditoriaSlots />}
      {active === 'golf-slots-ocupacion'     && <ReporteGolfSlotsOcupacion />}
      {active === 'golf-riego-consumo'       && <ReporteRiegoConsumo />}

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
