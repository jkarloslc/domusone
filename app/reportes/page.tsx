'use client'
import { useState, useEffect, useMemo, useRef, Suspense, type ComponentType } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/AuthContext'
import { BarChart3, MapPin, Users, AlertTriangle, Eye, Car, ChevronRight, ShoppingCart, Package, Warehouse, FileText, TrendingDown, Wrench, ClipboardList, Building2, Wallet, Clock, Star, Droplets, CloudRain, Tag, Zap, Search, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ReporteColaboradores from './ReporteColaboradores'
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
import ReportePreOrdenes from './ReportePreOrdenes'
import ReporteAntiguedadOPporCC from './ReporteAntiguedadOPporCC'
import ReporteCXPporCC from './ReporteCXPporCC'
import ReporteCXP from './ReporteCXP'
import ReporteCXPTesoreria from './ReporteCXPTesoreria'
import ReporteKardex from './ReporteKardex'
import ReporteTransferencias from './ReporteTransferencias'
import ReporteOrdenesTrabajo from './ReporteOrdenesTrabajo'
import ReporteProgramasMantenimiento from './ReporteProgramasMantenimiento'
import ReporteOTFinanciero from './ReporteOTFinanciero'
import ReporteOTCumplimiento from './ReporteOTCumplimiento'
import ReporteEstadoCuenta from './ReporteEstadoCuenta'
import ReporteComprasPorProveedor from './ReporteComprasPorProveedor'
import ReporteComprasPorProducto from './ReporteComprasPorProducto'
import ReporteIngresos from './ReporteIngresos'
import ReporteIngresosPorFormaPago from './ReporteIngresosPorFormaPago'
import ReporteIngresosCuotas from './ReporteIngresosCuotas'
import ReporteIngresosConceptoCentro from './ReporteIngresosConceptoCentro'
import ReporteRecibosIngreso from './ReporteRecibosIngreso'
import ReporteHipicoEstadoCuenta from './ReporteHipicoEstadoCuenta'
import ReporteHipicoServicios from './ReporteHipicoServicios'
import ReporteHipicoArrendatarios from './ReporteHipicoArrendatarios'
import ReporteOcupacionInstalaciones from './ReporteOcupacionInstalaciones'
import ReporteGolfEstadoCuenta from './ReporteGolfEstadoCuenta'
import ReporteGolfCobranza from './ReporteGolfCobranza'
import ReporteGolfAccesos from './ReporteGolfAccesos'
import ReporteGolfAcompanantes from './ReporteGolfAcompanantes'
import ReporteGolfPasesInvitados from './ReporteGolfPasesInvitados'
import ReporteGolfMiembrosCategoria from './ReporteGolfMiembrosCategoria'
import ReporteGolfFormaPagoMembresia from './ReporteGolfFormaPagoMembresia'
import ReporteGolfSociosCuotas from './ReporteGolfSociosCuotas'
import ReporteHospitalityEventos from './ReporteHospitalityEventos'
import ReporteOPsPorProveedor from './ReporteOPsPorProveedor'
import ReporteEstadoCuentaProveedor from './ReporteEstadoCuentaProveedor'
import ReportePagosAplicados from './ReportePagosAplicados'
import ReporteGolfVentasHistoricas from './ReporteGolfVentasHistoricas'
import ReporteGolfCuadreFormasPago from './ReporteGolfCuadreFormasPago'
import ReporteVentasPOS from './ReporteVentasPOS'
import ReporteGolfAuditoriaSlots from './ReporteGolfAuditoriaSlots'
import ReporteGolfSlotsOcupacion from './ReporteGolfSlotsOcupacion'
import ReporteRiegoConsumo from './ReporteRiegoConsumo'
import ReporteEstatusCampo from './ReporteEstatusCampo'
import ReporteProyeccionCobranza from './ReporteProyeccionCobranza'
import ReporteLotesPorSeccionClasif from './ReporteLotesPorSeccionClasif'
import ReporteLotesResumenClasif from './ReporteLotesResumenClasif'
import ReportePropietariosDesgloseLotes from './ReportePropietariosDesgloseLotes'
import ReporteLotesPorStatus from './ReporteLotesPorStatus'
import ReporteSeccionesLotes from './ReporteSeccionesLotes'
import ReporteCobranzaCorrienteVencida from './ReporteCobranzaCorrienteVencida'
import ReporteLotesAsociacion from './ReporteLotesAsociacion'
import ReporteManoDeObra from './ReporteManoDeObra'
import ReporteRolPagos from './ReporteRolPagos'
import ReporteOPsPorTipoGasto from './ReporteOPsPorTipoGasto'
import ReporteOPsPorClasificacionArticulos from './ReporteOPsPorClasificacionArticulos'
import ReporteCancelaciones from './ReporteCancelaciones'
import ReporteComposicionIngresoCuotas from './ReporteComposicionIngresoCuotas'
import ReporteVigilanciaNovedades from './ReporteVigilanciaNovedades'
import ReporteValesCombustible from './ReporteValesCombustible'
import ReporteServiciosCCArea from './ReporteServiciosCCArea'

// ─── Catálogo de reportes ─────────────────────────────────────────────────────
// Cada reporte se define una sola vez; los módulos lo referencian por id
// dentro de secciones temáticas (un reporte puede aparecer en varios módulos).
type Reporte = { label: string; icon: ComponentType<any>; desc: string }

const REPORTES: Record<string, Reporte> = {
  // Fraccionamiento
  'cobranza-corriente-vencida': { label: 'Cobranza Corriente vs Vencida', icon: Wallet, desc: 'Cuotas cobradas clasificadas por fecha de pago: corriente (del mes en curso) vs vencida (de meses anteriores), con resumen mensual y detalle' },
  'secciones-lotes':        { label: 'Secciones con Cantidad de Lotes', icon: MapPin, desc: 'Resumen por sección: total de lotes y desglose por status (Vendido / Libre / Bloqueado)' },
  'lotes':                  { label: 'Lotes por Sección', icon: MapPin, desc: 'Catálogo de lotes filtrable por sección' },
  'lotes-seccion-clasif':   { label: 'Lotes por Sección y Clasificación', icon: MapPin, desc: 'Lotes agrupados por sección y clasificación, con subtotales de superficie y valor' },
  'lotes-resumen-clasif':   { label: 'Resumen por Sección y Clasificación', icon: MapPin, desc: 'Una fila por clasificación dentro de cada sección, con subtotales y total general' },
  'propietarios-desglose':  { label: 'Propietarios — Desglose de Lotes', icon: Users, desc: 'Propietario → Sección → Clasificación → Lote, con superficie, status y valor' },
  'lotes-por-status':       { label: 'Lotes por Status', icon: MapPin, desc: 'Lotes agrupados por status (Vendido / Libre / Bloqueado) con conteo, % y totales de superficie y valor' },
  'lotes-asociacion':       { label: 'Lotes por Asociación de Condóminos', icon: MapPin, desc: 'Lotes filtrables por si pertenecen o no a la Asociación de Condóminos (AC)' },
  'cancelaciones':          { label: 'Bitácora de Cancelaciones', icon: AlertTriangle, desc: 'Recibos cancelados (Golf, Hípico, Locales, Fraccionamiento): folio, cuotas liberadas, monto, motivo y usuario' },
  'lotes-propietarios':     { label: 'Lotes y Propietarios', icon: Users, desc: 'Relación de lotes con su propietario asignado' },
  'propietarios':           { label: 'Directorio de Propietarios', icon: Users, desc: 'Datos completos de todos los propietarios' },
  'incidencias':            { label: 'Incidencias por Lote', icon: AlertTriangle, desc: 'Historial de incidencias filtrado por lote' },
  'incidencias-asignado':   { label: 'Incidencias por Asignado', icon: AlertTriangle, desc: 'Incidencias agrupadas por responsable' },
  'incidencias-seccion':    { label: 'Incidencias por Sección', icon: AlertTriangle, desc: 'Incidencias agrupadas por sección con conteo y status' },
  'visitantes':             { label: 'Visitantes por Lote', icon: Eye, desc: 'Visitantes autorizados por lote' },
  'vehiculos':              { label: 'Vehículos por Lote', icon: Car, desc: 'Vehículos autorizados por lote' },
  // Vigilancia
  'vigilancia-novedades-estadisticas': { label: 'Estadísticas de Novedades de Vigilancia', icon: ClipboardList, desc: 'Novedades por clase, tipo, criticidad, turno, hora, ubicación y lote; tendencia mensual, pendientes y cumplimiento de partes' },
  // Mantenimiento
  'ordenes-trabajo':        { label: 'Órdenes de Trabajo', icon: Wrench, desc: 'OT filtrable por status, tipo, área, prioridad y fecha' },
  'ot-financiero':          { label: 'OT Financiero CC / Área', icon: Wallet, desc: 'Costo de mano de obra y recursos por Centro de Costo, Área y Frente' },
  'ot-cumplimiento':        { label: 'OT Cumplimiento', icon: BarChart3, desc: 'Tasa de completado, cumplimiento de fecha límite y desglose por CC / Área / Tipo' },
  'programas-mantenimiento': { label: 'Programas de Mantenimiento', icon: ClipboardList, desc: 'Costo y cumplimiento por zona, con desglose por programa y criticidad' },
  'colaboradores':          { label: 'Colaboradores', icon: Users, desc: 'Personal operativo filtrable por zona, centro de costo y rol (asignado / supervisor)' },
  'mano-obra-real':         { label: 'Mano de Obra Real', icon: Wrench, desc: 'Jornales y costo por trabajador, agrupado por OT / Zona / Área o por trabajador' },
  'vales-combustible-cc':   { label: 'Vales de Combustible por Centro de Costo', icon: Droplets, desc: 'Litros y monto autorizado por centro de costo, con detalle por vale y su OP' },
  // HR
  'rol-pagos':              { label: 'Rol de Pagos', icon: Wallet, desc: 'Roles de pago por periodo con detalle de colaboradores, filtrable por centro de costo' },
  // Tesorería
  'estado-cuenta':          { label: 'Estado de Cuenta Bancario', icon: Building2, desc: 'Movimientos por cuenta bancaria con saldo inicial, cargos, abonos y saldo final del periodo' },
  'cxp':                    { label: 'Antigüedad de Saldos CXP', icon: FileText, desc: 'Cuentas por pagar con bandas de vencimiento' },
  'cxp-tesoreria':          { label: 'Cuentas por Pagar (CXP)', icon: Wallet, desc: 'Programación de pago por martes, saldos por proveedor, antigüedad y remesas; filtrable por CC, área, frente y proveedor' },
  'ordenes-pago-cc':        { label: 'Órdenes de Pago por CC / Área', icon: Wallet, desc: 'OPs agrupadas por centro de costo y área, con filtros por status y rango de fechas' },
  'pre-ordenes-pago':       { label: 'Pre-órdenes de Pago por Mes / CC', icon: Clock, desc: 'Compromisos futuros cotizados (no afectan flujo ni presupuesto), por mes estimado de pago y centro de costo' },
  'antiguedad-op-cc':       { label: 'Antigüedad de OPs por CC / Área', icon: Clock, desc: 'Saldos pendientes por banda de vencimiento (0-30, 31-60, 61-90, +90), agrupados por CC y Área' },
  'cxp-cc':                 { label: 'CXP por CC / Área / Frente', icon: Wallet, desc: 'Cuentas por pagar agrupadas por centro de costo, área y frente, con filtro de fechas' },
  'pagos-aplicados':        { label: 'Pagos Aplicados', icon: Wallet, desc: 'Abonos registrados por proveedor, cuenta bancaria y rango de fechas' },
  // Ingresos
  'composicion-ingreso-cuotas': { label: 'Composición del Ingreso por Cuotas', icon: BarChart3, desc: 'Cobro de cuotas de cada mes en corriente, vencida recuperada y anticipada, conciliado contra lo generado del periodo' },
  'ingresos-tipo':          { label: 'Ingresos por Tipo', icon: TrendingDown, desc: 'Recibos agrupados por tipo de ingreso (Golf, Cuotas, Rentas, Caballerizas)' },
  'ingresos-centro':        { label: 'Ingresos por Centro', icon: Building2, desc: 'Recibos agrupados por centro de ingreso con desglose de forma de pago' },
  'recibos-ingreso':        { label: 'Recibos de Ingreso', icon: Wallet, desc: 'Recibos por agrupador y centro de ingreso con subtotal, IVA y total' },
  'ingresos-concepto-centro': { label: 'Ingresos por Concepto y Centro', icon: BarChart3, desc: 'Ingresos por concepto de cobro dentro de cada centro de ingreso, en vista jerárquica y pivote' },
  'ingresos-formas-pago':   { label: 'Ingresos por Forma de Pago', icon: Wallet, desc: 'Matriz de ingresos por centro de ingreso con columnas por forma de pago' },
  'ingresos-cuotas':        { label: 'Cuotas por Sección y Concepto', icon: Building2, desc: 'Cuotas de fraccionamiento desglosadas por sección y concepto' },
  // Compras e inventarios
  'consumo-cc':             { label: 'Consumo por Centro de Costo', icon: TrendingDown, desc: 'Materiales transferidos a cada centro de costo' },
  'consumo-seccion':        { label: 'Consumo por Sección', icon: MapPin, desc: 'Órdenes de pago agrupadas por sección del fraccionamiento' },
  'consumo-frente':         { label: 'Consumo por Frente', icon: MapPin, desc: 'Órdenes de pago agrupadas por frente de obra' },
  'inventario':             { label: 'Inventario Actual', icon: Package, desc: 'Existencias por almacén con alertas de stock mínimo' },
  'ordenes-compra':         { label: 'Órdenes de Compra', icon: ShoppingCart, desc: 'OC por proveedor, status y periodo' },
  'compras-por-proveedor':  { label: 'Compras por Proveedor', icon: ShoppingCart, desc: 'OCs agrupadas por proveedor con totales, filtrable por CC, status y fecha' },
  'compras-por-producto':   { label: 'Compras por Producto', icon: Package, desc: 'Compras por artículo con desglose por proveedor: cantidad, precio promedio / mín / máx / último e importe' },
  'ops-tipo-gasto':         { label: 'OPs por Tipo de Gasto', icon: Wallet, desc: 'Órdenes de pago sin OC vinculada, agrupadas por tipo de gasto' },
  'ops-clasificacion-articulos': { label: 'OPs por Clasificación de Artículos', icon: Tag, desc: 'Órdenes de pago con OC, repartidas por la categoría de los artículos comprados' },
  'kardex':                 { label: 'Kardex de Movimientos', icon: Warehouse, desc: 'Historial de entradas y salidas de inventario' },
  'transferencias':         { label: 'Transferencias', icon: Package, desc: 'Movimientos entre almacenes por origen, destino y fecha' },
  'ops-por-proveedor':      { label: 'OPs por Proveedor', icon: FileText, desc: 'Órdenes de pago agrupadas por proveedor con totales y saldos pendientes' },
  'estado-cuenta-proveedor': { label: 'Estado de Cuenta de Proveedor', icon: Building2, desc: 'Movimientos, saldo acumulado y datos bancarios de un proveedor' },
  // Golf
  'golf-estado-cuenta':     { label: 'Estado de Cuenta de Socio', icon: FileText, desc: 'Cuotas y recibos por socio en un periodo' },
  'golf-miembros-categoria': { label: 'Miembros por Categoría', icon: Users, desc: 'Socios por categoría con desglose de status (activo / vencido / inactivo)' },
  'golf-forma-pago-membresia': { label: 'Socios: Pago Anual vs Mensual', icon: Users, desc: 'Socios con membresía anual (12 mensualidades en un recibo) o mensual, con mapa de meses pagados' },
  'golf-socios-cuotas':     { label: 'Socios: Cuotas e Inscripción', icon: Users, desc: 'Cuotas pagadas y por pagar por mes, y control de quién no pagó inscripción' },
  'golf-cobranza':          { label: 'Cobranza / CXC', icon: Wallet, desc: 'Cuotas por categoría, tipo y status con resumen y detalle' },
  'golf-cobranza-corriente-vencida': { label: 'Cobranza Corriente vs Vencida', icon: Wallet, desc: 'Cuotas de socios cobradas: corriente (del mes en curso) vs vencida (de meses anteriores)' },
  'golf-pensiones-corriente-vencida': { label: 'Pensiones — Corriente vs Vencida', icon: Wallet, desc: 'Pensiones de carritos cobradas: corriente vs vencida, con resumen mensual y detalle' },
  'golf-proyeccion-cobranza': { label: 'Proyección de Cobranza', icon: TrendingDown, desc: 'Membresías y pensiones por mes: cargo total, cobrado y por cobrar' },
  'golf-pensiones-proyeccion-cobranza': { label: 'Pensiones — Proyección de Cobranza', icon: TrendingDown, desc: 'Pensiones de carritos por mes: cargo, cobrado y por cobrar, con flujo de cobranza' },
  'golf-accesos':           { label: 'Salidas al Campo', icon: MapPin, desc: 'Rondas por socio, espacio y forma de juego' },
  'golf-acompanantes':      { label: 'Salidas al Campo por Acompañante', icon: Users, desc: 'Acompañantes por tipo (familiar, pase, green fee, intercambio), categoría y socio' },
  'golf-pases-invitados':   { label: 'Pases para Invitados', icon: Users, desc: 'Pases por socio: asignados, usados, saldo vigente, vencidos y detalle por invitado' },
  'golf-caballos-servicios': { label: 'Caballos y Servicios', icon: BarChart3, desc: 'Desglose por caballo y tipo de servicio, con filtros por fechas, caballo y tipo' },
  'golf-ventas-historicas': { label: 'Ventas Históricas POS', icon: Wallet, desc: 'Ventas de cortes realizados por centro de venta, artículo y rango de fechas' },
  'ventas-pos':             { label: 'Ventas POS por Centro', icon: Wallet, desc: 'Ventas de todos los centros (o uno) con formas de pago, operaciones y productos' },
  'golf-cuadre-formas-pago': { label: 'Cuadre de Formas de Pago (Pre-Corte)', icon: Wallet, desc: 'Ventas por forma de pago, cortadas o no, para cuadrar contra TPV / caja antes del corte' },
  'golf-auditoria-slots':   { label: 'Auditoría de Slots', icon: ClipboardList, desc: 'Sistema vs. físico de cajones asignados, vacantes y diferencias por categoría' },
  'golf-slots-ocupacion':   { label: 'Ocupación de Slots / Cajones', icon: BarChart3, desc: 'Ocupación y disponibilidad de cajones por categoría y periodo' },
  'golf-servicios-cc-area': { label: 'Servicios del Club por CC / Área', icon: Zap, desc: 'CFE, Agua y Gas LP de Mantto. Campo por centro de costo y área: consumo, monto y OP' },
  'golf-riego-consumo':     { label: 'Consumo de Agua — Riego', icon: Droplets, desc: 'Consumo real vs. programado por origen de agua, semana y periodo' },
  'golf-estatus-campo':     { label: 'Estatus del Campo', icon: CloudRain, desc: 'Días de apertura, cierre y cierre parcial del campo y de los caminos' },
  // Hípico
  'hipico-arrendatarios':   { label: 'Arrendatarios', icon: Users, desc: 'Caballerizas asignadas, pagos del periodo y pendiente vencido por arrendatario' },
  'hipico-estado-cuenta':   { label: 'Estado de Cuenta de Arrendatario', icon: FileText, desc: 'Cargos y pagos por arrendatario en un periodo' },
  'hipico-cobranza-corriente-vencida': { label: 'Cobranza Corriente vs Vencida', icon: Wallet, desc: 'Rentas de caballerizas cobradas: corriente (del mes en curso) vs vencida (de meses anteriores)' },
  'hipico-proyeccion-cobranza': { label: 'Proyección de Cobranza', icon: TrendingDown, desc: 'Rentas de caballerizas por mes: cargo, cobrado y por cobrar, con flujo de cobranza' },
  'hipico-servicios':       { label: 'Servicios por Caballo', icon: BarChart3, desc: 'Desglose por caballo y tipo de servicio, con filtros por fechas, caballo y tipo' },
  // Locales
  'locales-cobranza-corriente-vencida': { label: 'Cobranza Corriente vs Vencida', icon: Wallet, desc: 'Rentas de locales y propiedades cobradas: corriente vs vencida' },
  'locales-proyeccion-cobranza': { label: 'Proyección de Cobranza', icon: TrendingDown, desc: 'Rentas de locales y mantenimiento por mes: cargo, cobrado y por cobrar' },
  'hipico-ocupacion-instalaciones': { label: 'Ocupación de Instalaciones', icon: MapPin, desc: 'Días ocupados y % de ocupación por pista, paddock o salón, con eventos, bloqueos y empalmes' },
  // Eventos
  'hospitality-eventos':    { label: 'Eventos — Ingresos vs Gastos', icon: Star, desc: 'Resumen financiero por evento (Hospitality, Golf Torneos, Hípico): ingresos, gastos y balance neto' },
}

type Seccion = { titulo: string; ids: string[] }
type Grupo = { slug: string; modulo: string; label: string; secciones: Seccion[] }

const GRUPOS: Grupo[] = [
  {
    slug: 'residencial', modulo: 'lotes', label: 'Fraccionamiento',
    secciones: [
      { titulo: 'Cobranza', ids: ['cobranza-corriente-vencida', 'cancelaciones'] },
      { titulo: 'Lotes y secciones', ids: ['secciones-lotes', 'lotes', 'lotes-seccion-clasif', 'lotes-resumen-clasif', 'lotes-por-status', 'lotes-asociacion'] },
      { titulo: 'Propietarios', ids: ['propietarios', 'lotes-propietarios', 'propietarios-desglose'] },
      { titulo: 'Incidencias y accesos', ids: ['incidencias', 'incidencias-asignado', 'incidencias-seccion', 'visitantes', 'vehiculos'] },
    ],
  },
  {
    slug: 'vigilancia', modulo: 'vigilancia-novedades', label: 'Vigilancia',
    secciones: [{ titulo: 'Novedades', ids: ['vigilancia-novedades-estadisticas'] }],
  },
  {
    slug: 'mantenimiento', modulo: 'mantenimiento', label: 'Mantenimiento',
    secciones: [
      { titulo: 'Órdenes de trabajo', ids: ['ordenes-trabajo', 'ot-cumplimiento', 'ot-financiero', 'programas-mantenimiento'] },
      { titulo: 'Personal', ids: ['colaboradores', 'mano-obra-real'] },
      { titulo: 'Combustible', ids: ['vales-combustible-cc'] },
    ],
  },
  {
    slug: 'hr', modulo: 'hr', label: 'HR',
    secciones: [{ titulo: 'Nómina', ids: ['rol-pagos'] }],
  },
  {
    slug: 'tesoreria', modulo: 'tesoreria', label: 'Tesorería',
    secciones: [
      { titulo: 'Bancos', ids: ['estado-cuenta', 'pagos-aplicados'] },
      { titulo: 'Cuentas por pagar', ids: ['cxp-tesoreria', 'cxp', 'cxp-cc', 'antiguedad-op-cc'] },
      { titulo: 'Órdenes de pago', ids: ['ordenes-pago-cc', 'pre-ordenes-pago'] },
    ],
  },
  {
    slug: 'ingresos', modulo: 'ingresos', label: 'Ingresos',
    secciones: [
      { titulo: 'Recibos e ingresos', ids: ['recibos-ingreso', 'ingresos-tipo', 'ingresos-centro', 'ingresos-concepto-centro', 'ingresos-formas-pago'] },
      { titulo: 'Cuotas', ids: ['composicion-ingreso-cuotas', 'ingresos-cuotas'] },
    ],
  },
  {
    slug: 'compras', modulo: 'compras', label: 'Compras e Inventarios',
    secciones: [
      { titulo: 'Compras', ids: ['ordenes-compra', 'compras-por-proveedor', 'compras-por-producto'] },
      { titulo: 'Órdenes de pago', ids: ['ordenes-pago-cc', 'ops-por-proveedor', 'ops-tipo-gasto', 'ops-clasificacion-articulos', 'pre-ordenes-pago'] },
      { titulo: 'Cuentas por pagar', ids: ['cxp-cc', 'antiguedad-op-cc', 'estado-cuenta-proveedor'] },
      { titulo: 'Inventario', ids: ['inventario', 'kardex', 'transferencias'] },
      { titulo: 'Consumo', ids: ['consumo-cc', 'consumo-seccion', 'consumo-frente', 'vales-combustible-cc'] },
    ],
  },
  {
    slug: 'golf', modulo: 'golf', label: 'Club Golf',
    secciones: [
      { titulo: 'Socios', ids: ['golf-miembros-categoria', 'golf-socios-cuotas', 'golf-forma-pago-membresia', 'golf-estado-cuenta'] },
      { titulo: 'Cobranza', ids: ['golf-cobranza', 'golf-cobranza-corriente-vencida', 'golf-proyeccion-cobranza', 'golf-pensiones-corriente-vencida', 'golf-pensiones-proyeccion-cobranza', 'cancelaciones'] },
      { titulo: 'Punto de venta', ids: ['ventas-pos', 'golf-ventas-historicas', 'golf-cuadre-formas-pago'] },
      { titulo: 'Campo', ids: ['golf-accesos', 'golf-acompanantes', 'golf-pases-invitados', 'golf-estatus-campo'] },
      { titulo: 'Carritos y cajones', ids: ['golf-slots-ocupacion', 'golf-auditoria-slots'] },
      { titulo: 'Servicios', ids: ['golf-servicios-cc-area'] },
    ],
  },
  {
    slug: 'hipico', modulo: 'hipico', label: 'Hípico',
    secciones: [
      { titulo: 'Arrendatarios', ids: ['hipico-arrendatarios', 'hipico-estado-cuenta'] },
      { titulo: 'Cobranza', ids: ['hipico-cobranza-corriente-vencida', 'hipico-proyeccion-cobranza', 'cancelaciones'] },
    ],
  },
  {
    slug: 'locales', modulo: 'locales', label: 'Locales Comerciales',
    secciones: [
      { titulo: 'Cobranza', ids: ['locales-cobranza-corriente-vencida', 'locales-proyeccion-cobranza', 'cancelaciones'] },
      { titulo: 'Instalaciones', ids: ['hipico-ocupacion-instalaciones'] },
    ],
  },
  {
    slug: 'hospitality', modulo: 'hospitality', label: 'Eventos',
    secciones: [{ titulo: 'Eventos', ids: ['hospitality-eventos'] }],
  },
]

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const LS_KEY = 'reportes.modulo'

const CSS = `
.rep-layout { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 24px; align-items: start; }
.rep-layout.rep-solo { grid-template-columns: minmax(0, 1fr); }
.rep-nav { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 2px; background: #fff; border: 1px solid #E6E8EB; border-radius: 10px; padding: 8px; }
.rep-nav-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 9px 12px; border: none; border-radius: 7px; background: transparent; cursor: pointer; text-align: left; font-family: inherit; font-size: 13px; font-weight: 500; color: #4A4D54; border-left: 2px solid transparent; }
.rep-nav-item:hover { background: #F4F5F7; color: #1C1D21; }
.rep-nav-item.activo { background: #E6E8EB; color: #1C1D21; font-weight: 600; border-left-color: #19D3C5; border-radius: 0 7px 7px 0; }
.rep-nav-count { font-size: 11px; font-weight: 600; color: #7A7E87; font-variant-numeric: tabular-nums; }
.rep-row { display: flex; align-items: center; gap: 14px; width: 100%; padding: 12px 16px; background: #fff; border: none; border-top: 1px solid #E6E8EB; cursor: pointer; text-align: left; font-family: inherit; }
.rep-row:first-child { border-top: none; }
.rep-row:hover { background: #F4F5F7; }
.rep-row:hover .rep-chev { color: #1C1D21; transform: translateX(2px); }
.rep-chev { color: #9A9EA7; flex-shrink: 0; transition: transform .15s, color .15s; }
.rep-search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #C9CCD3; border-radius: 8px; padding: 0 12px; height: 40px; }
.rep-search:focus-within { border-color: #1C1D21; }
.rep-search input { flex: 1; border: none; outline: none; font-family: inherit; font-size: 14px; color: #1C1D21; background: transparent; min-width: 0; }
@media (max-width: 860px) {
  .rep-layout { grid-template-columns: minmax(0, 1fr); }
  .rep-nav { position: static; flex-direction: row; overflow-x: auto; padding: 6px; }
  .rep-nav-item { width: auto; white-space: nowrap; flex-shrink: 0; border-left: none; border-bottom: 2px solid transparent; border-radius: 7px; }
  .rep-nav-item.activo { border-bottom-color: #19D3C5; border-radius: 7px 7px 0 0; }
}
`

function FilaReporte({ id, onOpen, modulos }: { id: string; onOpen: (id: string) => void; modulos?: string[] }) {
  const r = REPORTES[id]
  if (!r) return null
  const Icon = r.icon
  return (
    <button className="rep-row" onClick={() => onOpen(id)}>
      <Icon size={16} style={{ color: '#62666E', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1C1D21' }}>{r.label}</span>
          {modulos?.map(m => (
            <span key={m} style={{ fontSize: 10.5, fontWeight: 600, color: '#4A4D54', background: '#F4F5F7', border: '1px solid #E6E8EB', borderRadius: 4, padding: '1px 6px' }}>{m}</span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#7A7E87', lineHeight: 1.45, marginTop: 2 }}>{r.desc}</div>
      </div>
      <ChevronRight size={16} className="rep-chev" />
    </button>
  )
}

function ReportesContent() {
  const searchParams = useSearchParams()
  const grupoParam   = searchParams.get('grupo')
  const idParam      = searchParams.get('id')
  const { can, canReporte } = useAuth()

  // Grupos que el usuario puede ver (por módulo y por reporte), filtrados por ?grupo=
  const gruposVisibles = useMemo(() => {
    const slugs = grupoParam ? grupoParam.split(',') : null
    return GRUPOS
      .filter(g => can(g.modulo) && (!slugs || slugs.includes(g.slug)))
      .map(g => ({
        ...g,
        secciones: g.secciones
          .map(s => ({ ...s, ids: s.ids.filter(id => REPORTES[id] && canReporte(id)) }))
          .filter(s => s.ids.length > 0),
      }))
      .filter(g => g.secciones.length > 0)
  }, [grupoParam, can, canReporte])

  const [active, setActive]   = useState<string | null>(null)
  const [origen, setOrigen]   = useState<string | null>(null)   // módulo desde el que se abrió
  const [moduloSel, setModuloSel] = useState<string | null>(null)
  const [q, setQ] = useState('')

  // Deep-link ?id= (acepta el id con o sin prefijo de grupo, ej. riego-consumo → golf-riego-consumo)
  const deepLinkHecho = useRef(false)
  useEffect(() => {
    if (!idParam || deepLinkHecho.current) return
    const cand = [idParam, grupoParam ? `${grupoParam.split(',')[0]}-${idParam}` : ''].find(c => c && REPORTES[c] && canReporte(c))
    if (cand) { setActive(cand); deepLinkHecho.current = true }
  }, [idParam, grupoParam, canReporte])

  // Módulo seleccionado: el recordado si sigue disponible, si no el primero
  useEffect(() => {
    if (gruposVisibles.length === 0) return
    if (moduloSel && gruposVisibles.some(g => g.slug === moduloSel)) return
    let guardado: string | null = null
    try { guardado = localStorage.getItem(LS_KEY) } catch {}
    setModuloSel(gruposVisibles.some(g => g.slug === guardado) ? guardado : gruposVisibles[0].slug)
  }, [gruposVisibles, moduloSel])

  const elegirModulo = (slug: string) => {
    setModuloSel(slug); setQ('')
    try { localStorage.setItem(LS_KEY, slug) } catch {}
  }

  const grupoActual = gruposVisibles.find(g => g.slug === moduloSel) ?? gruposVisibles[0]
  const soloUno     = gruposVisibles.length === 1
  const current     = active ? REPORTES[active] : null

  const abrir = (id: string) => {
    setActive(id)
    setOrigen(q.trim() ? null : (grupoActual?.label ?? null))
    window.scrollTo({ top: 0 })
  }
  const handleBack = () => setActive(null)

  // Búsqueda global: un resultado por reporte, con los módulos donde aparece
  const resultados = useMemo(() => {
    const t = norm(q.trim())
    if (!t) return []
    const mapa = new Map<string, string[]>()
    for (const g of gruposVisibles)
      for (const s of g.secciones)
        for (const id of s.ids) {
          const r = REPORTES[id]
          if (!norm(`${r.label} ${r.desc} ${s.titulo} ${g.label}`).includes(t)) continue
          const mods = mapa.get(id) ?? []
          if (!mods.includes(g.label)) mods.push(g.label)
          mapa.set(id, mods)
        }
    return Array.from(mapa.entries())
  }, [q, gruposVisibles])

  const totalGrupo = (g: Grupo) => g.secciones.reduce((a, s) => a + s.ids.length, 0)

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <style>{CSS}</style>
      <PageHeader
        variant="xl"
        icon={BarChart3}
        color="var(--blue)"
        eyebrowLabel={soloUno ? grupoActual?.label ?? 'Módulo' : 'Módulo'}
        title={current ? current.label : 'Reportes'}
        onBack={current ? handleBack : undefined}
        subtitle={current ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A4D54', fontSize: 13, padding: 0, fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              Reportes
            </button>
            {origen && <>
              <ChevronRight size={12} style={{ color: '#9A9EA7' }} />
              <span style={{ color: '#4A4D54' }}>{origen}</span>
            </>}
          </span>
        ) : 'Elige un módulo y abre el reporte que necesitas, o búscalo por nombre.'}
      />

      {!active && gruposVisibles.length === 0 && (
        <div style={{ background: '#F4F5F7', border: '1px solid #E6E8EB', borderLeft: '3px solid #B5761A', color: '#B5761A', padding: '12px 16px', borderRadius: 8, fontSize: 13 }}>
          No tienes reportes disponibles con tu rol actual.
        </div>
      )}

      {!active && gruposVisibles.length > 0 && (
        <div className={`rep-layout${soloUno ? ' rep-solo' : ''}`}>
          {!soloUno && (
            <nav className="rep-nav" aria-label="Módulos">
              {gruposVisibles.map(g => (
                <button key={g.slug}
                  className={`rep-nav-item${!q.trim() && g.slug === grupoActual?.slug ? ' activo' : ''}`}
                  onClick={() => elegirModulo(g.slug)}>
                  <span>{g.label}</span>
                  <span className="rep-nav-count">{totalGrupo(g)}</span>
                </button>
              ))}
            </nav>
          )}

          <div style={{ minWidth: 0 }}>
            <div className="rep-search" style={{ marginBottom: 20 }}>
              <Search size={16} style={{ color: '#7A7E87' }} />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder={soloUno ? `Buscar en ${grupoActual?.label ?? 'reportes'}…` : 'Buscar en todos los reportes…'} />
              {q && (
                <button onClick={() => setQ('')} aria-label="Limpiar búsqueda"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: '#62666E' }}>
                  <X size={15} />
                </button>
              )}
            </div>

            {q.trim() ? (
              <>
                <div style={{ fontSize: 12, color: '#62666E', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#1C1D21' }}>{resultados.length}</span>
                  {resultados.length === 1 ? ' reporte encontrado' : ' reportes encontrados'}
                </div>
                {resultados.length > 0 ? (
                  <div style={{ border: '1px solid #E6E8EB', borderRadius: 10, overflow: 'hidden' }}>
                    {resultados.map(([id, mods]) => (
                      <FilaReporte key={id} id={id} onOpen={abrir} modulos={soloUno ? undefined : mods} />
                    ))}
                  </div>
                ) : (
                  <div style={{ background: '#F4F5F7', border: '1px solid #E6E8EB', borderRadius: 10, padding: '28px 16px', textAlign: 'center', fontSize: 13, color: '#62666E' }}>
                    Ningún reporte coincide con “{q.trim()}”.
                  </div>
                )}
              </>
            ) : grupoActual && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1C1D21', margin: 0 }}>{grupoActual.label}</h2>
                  <span style={{ fontSize: 12, color: '#7A7E87', fontVariantNumeric: 'tabular-nums' }}>
                    {totalGrupo(grupoActual)} {totalGrupo(grupoActual) === 1 ? 'reporte' : 'reportes'}
                  </span>
                </div>
                {grupoActual.secciones.map(s => (
                  <section key={s.titulo} style={{ marginBottom: 22 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#62666E', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                      {s.titulo}
                    </div>
                    <div style={{ border: '1px solid #E6E8EB', borderRadius: 10, overflow: 'hidden' }}>
                      {s.ids.map(id => <FilaReporte key={id} id={id} onOpen={abrir} />)}
                    </div>
                  </section>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Reportes residencial */}
      {active === 'cobranza-corriente-vencida' && <ReporteCobranzaCorrienteVencida fuente="residencial" />}
      {active === 'secciones-lotes'       && <ReporteSeccionesLotes />}
      {active === 'lotes'                && <ReporteLotes />}
      {active === 'lotes-seccion-clasif' && <ReporteLotesPorSeccionClasif />}
      {active === 'lotes-resumen-clasif'  && <ReporteLotesResumenClasif />}
      {active === 'propietarios-desglose' && <ReportePropietariosDesgloseLotes />}
      {active === 'lotes-por-status'      && <ReporteLotesPorStatus />}
      {active === 'lotes-asociacion'      && <ReporteLotesAsociacion />}
      {active === 'lotes-propietarios'   && <ReporteLotesPropietarios />}
      {active === 'propietarios'         && <ReportePropietarios />}
      {active === 'incidencias'          && <ReporteIncidencias />}
      {active === 'incidencias-asignado' && <ReporteIncidenciasAsignado />}
      {active === 'incidencias-seccion'  && <ReporteIncidenciasSeccion />}
      {active === 'visitantes'           && <ReporteVisitantes />}
      {active === 'vehiculos'            && <ReporteVehiculos />}

      {/* Reportes vigilancia */}
      {active === 'vigilancia-novedades-estadisticas' && <ReporteVigilanciaNovedades />}

      {/* Reportes mantenimiento */}
      {active === 'ordenes-trabajo'         && <ReporteOrdenesTrabajo />}
      {active === 'ot-financiero'           && <ReporteOTFinanciero />}
      {active === 'ot-cumplimiento'         && <ReporteOTCumplimiento />}
      {active === 'programas-mantenimiento' && <ReporteProgramasMantenimiento />}
      {active === 'colaboradores'           && <ReporteColaboradores />}
      {active === 'mano-obra-real'          && <ReporteManoDeObra />}
      {active === 'vales-combustible-cc'    && <ReporteValesCombustible />}

      {/* Reportes HR */}
      {active === 'rol-pagos' && <ReporteRolPagos />}

      {/* Reportes tesorería */}
      {active === 'estado-cuenta'    && <ReporteEstadoCuenta />}
      {active === 'pagos-aplicados'  && <ReportePagosAplicados />}

      {/* Reportes compras */}
      {/* Reportes ingresos */}
      {active === 'ingresos-tipo'            && <ReporteIngresos />}
      {active === 'ingresos-centro'          && <ReporteIngresos />}
      {active === 'recibos-ingreso'          && <ReporteRecibosIngreso />}
      {active === 'ingresos-concepto-centro' && <ReporteIngresosConceptoCentro />}
      {active === 'ingresos-formas-pago'     && <ReporteIngresosPorFormaPago />}
      {active === 'ingresos-cuotas'          && <ReporteIngresosCuotas />}

      {/* Reportes compras */}
      {active === 'composicion-ingreso-cuotas' && <ReporteComposicionIngresoCuotas />}
      {active === 'consumo-cc'       && <ReporteConsumoCentroCosto />}
      {active === 'consumo-seccion'  && <ReporteConsumoSeccion />}
      {active === 'consumo-frente'   && <ReporteConsumoFrente />}
      {active === 'inventario'       && <ReporteInventario />}
      {active === 'ordenes-compra'   && <ReporteOrdenesCompra />}
      {active === 'ordenes-pago-cc'  && <ReporteOrdenesPago />}
      {active === 'antiguedad-op-cc' && <ReporteAntiguedadOPporCC />}
      {active === 'pre-ordenes-pago' && <ReportePreOrdenes />}
      {active === 'cxp-cc'           && <ReporteCXPporCC />}
      {active === 'ops-tipo-gasto'   && <ReporteOPsPorTipoGasto />}
      {active === 'ops-clasificacion-articulos' && <ReporteOPsPorClasificacionArticulos />}
      {active === 'cxp'              && <ReporteCXP />}
      {active === 'cxp-tesoreria'    && <ReporteCXPTesoreria />}
      {active === 'kardex'           && <ReporteKardex />}
      {active === 'transferencias'        && <ReporteTransferencias />}
      {active === 'compras-por-proveedor'       && <ReporteComprasPorProveedor />}
      {active === 'compras-por-producto'        && <ReporteComprasPorProducto />}
      {active === 'ops-por-proveedor'           && <ReporteOPsPorProveedor />}
      {active === 'estado-cuenta-proveedor'     && <ReporteEstadoCuentaProveedor />}

      {/* Reportes golf */}
      {active === 'golf-estado-cuenta' && <ReporteGolfEstadoCuenta />}
      {active === 'golf-miembros-categoria' && <ReporteGolfMiembrosCategoria />}
      {active === 'golf-forma-pago-membresia' && <ReporteGolfFormaPagoMembresia />}
      {active === 'golf-socios-cuotas' && <ReporteGolfSociosCuotas />}
      {active === 'golf-cobranza'               && <ReporteGolfCobranza />}
      {active === 'golf-cobranza-corriente-vencida'  && <ReporteCobranzaCorrienteVencida fuente="golf" />}
      {active === 'golf-pensiones-corriente-vencida' && <ReporteCobranzaCorrienteVencida fuente="pensiones" />}
      {active === 'golf-proyeccion-cobranza'    && <ReporteProyeccionCobranza fuente="golf" />}
      {active === 'golf-pensiones-proyeccion-cobranza' && <ReporteProyeccionCobranza fuente="pensiones" />}
      {active === 'golf-accesos'       && <ReporteGolfAccesos />}
      {active === 'golf-acompanantes'  && <ReporteGolfAcompanantes />}
      {active === 'golf-pases-invitados' && <ReporteGolfPasesInvitados />}
      {active === 'golf-caballos-servicios'  && <ReporteHipicoServicios />}
      {active === 'golf-ventas-historicas'   && <ReporteGolfVentasHistoricas />}
      {active === 'ventas-pos'               && <ReporteVentasPOS />}
      {active === 'golf-cuadre-formas-pago'  && <ReporteGolfCuadreFormasPago />}
      {active === 'golf-auditoria-slots'     && <ReporteGolfAuditoriaSlots />}
      {active === 'golf-slots-ocupacion'     && <ReporteGolfSlotsOcupacion />}
      {active === 'golf-servicios-cc-area' && <ReporteServiciosCCArea />}
      {active === 'golf-riego-consumo'       && <ReporteRiegoConsumo />}
      {active === 'golf-estatus-campo'       && <ReporteEstatusCampo />}

      {/* Reportes hípico */}
      {active === 'hipico-arrendatarios' && <ReporteHipicoArrendatarios />}
      {active === 'hipico-estado-cuenta' && <ReporteHipicoEstadoCuenta />}
      {active === 'hipico-cobranza-corriente-vencida' && <ReporteCobranzaCorrienteVencida fuente="hipico" />}
      {active === 'hipico-proyeccion-cobranza' && <ReporteProyeccionCobranza fuente="hipico" />}
      {active === 'hipico-servicios'     && <ReporteHipicoServicios />}
      {active === 'hipico-ocupacion-instalaciones' && <ReporteOcupacionInstalaciones />}

      {/* Reportes locales comerciales */}
      {active === 'locales-cobranza-corriente-vencida' && <ReporteCobranzaCorrienteVencida fuente="locales" />}
      {active === 'locales-proyeccion-cobranza' && <ReporteProyeccionCobranza fuente="locales" />}

      {/* Reportes hospitality */}
      {active === 'hospitality-eventos' && <ReporteHospitalityEventos />}
      {active === 'cancelaciones' && <ReporteCancelaciones />}
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
