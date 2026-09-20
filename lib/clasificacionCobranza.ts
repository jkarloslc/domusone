// ── Clasificación de cobranza de cuotas — fuente única de verdad ──────────
//
// Antes de este archivo la regla vivía duplicada (y divergente) en dos
// reportes:
//   · ReporteCobranzaCorrienteVencida.tsx clasificaba a 3 bandas
//     (periodo == / < / > mes de pago) — correcto.
//   · ReporteProyeccionCobranza.tsx, en su bloque "Flujo de Cobranza", hacía
//     `periodo <= mes` y metía la recuperación de vencido DENTRO de corriente,
//     con lo que el panel no podía distinguir desempeño del mes de
//     recuperación de cartera.
// Cualquier reporte, dashboard o comparativo que necesite la clasificación
// debe importarla de aquí.
//
// ── Las cuatro bandas ────────────────────────────────────────────────────
// Se comparan SIEMPRE el periodo de la cuota contra el mes de la FECHA DE
// PAGO (nunca contra hoy): la pregunta es "¿a qué mes pertenecía lo que se
// cobró en este mes?", y eso no cambia con el paso del tiempo.
//
//   CORRIENTE  periodo == mes de pago → desempeño del mes
//   VENCIDA    periodo <  mes de pago → recuperación de cartera
//   ANTICIPADA periodo >  mes de pago → financiamiento (pago anualizado)
//   OTROS      sin periodo            → cargos sueltos, intereses, deslindes
//
// Las cuatro suman exactamente el cobro del mes, así que sirven para
// descomponer una cifra de ingreso sin alterarla.

export type BandaCobranza = 'CORRIENTE' | 'VENCIDA' | 'ANTICIPADA' | 'OTROS'

export const BANDAS: BandaCobranza[] = ['CORRIENTE', 'VENCIDA', 'ANTICIPADA', 'OTROS']

export const BANDA_META: Record<BandaCobranza, {
  label: string
  corto: string
  color: string
  bg: string
  ayuda: string
}> = {
  CORRIENTE: {
    label: 'Corriente', corto: 'Corr.',
    color: '#16a34a', bg: '#dcfce7',
    ayuda: 'Cuota del mismo mes en que se cobró — es el desempeño real del mes',
  },
  VENCIDA: {
    label: 'Vencida recuperada', corto: 'Venc.',
    color: '#dc2626', bg: '#fee2e2',
    ayuda: 'Cuota de un mes anterior cobrada en este mes — recuperación de cartera, no desempeño del mes',
  },
  ANTICIPADA: {
    label: 'Anticipada', corto: 'Antic.',
    color: '#2563eb', bg: '#dbeafe',
    ayuda: 'Cuota de un mes posterior cobrada en este mes (pago anualizado) — financiamiento, no desempeño del mes',
  },
  OTROS: {
    label: 'Sin periodo', corto: 'Otros',
    color: '#64748b', bg: '#f1f5f9',
    ayuda: 'Líneas sin periodo asignado: cargos adicionales, intereses, conceptos sueltos',
  },
}

/** Clasifica una aplicación de pago. `periodo` y `fechaPago` en formato YYYY-MM / YYYY-MM-DD. */
export function clasificarBanda(periodo: string | null, fechaPago: string): BandaCobranza {
  if (!periodo) return 'OTROS'
  const mesPago = fechaPago.slice(0, 7)
  if (periodo === mesPago) return 'CORRIENTE'
  return periodo < mesPago ? 'VENCIDA' : 'ANTICIPADA'
}

// ── Periodo ───────────────────────────────────────────────────────────────
// Fraccionamiento guarda el periodo como nombre de mes + año en dos columnas
// (ctrl.cargos.periodo_mes / periodo_anio, ctrl.recibos_detalle igual),
// mientras Golf / Hípico / Locales ya lo guardan como 'YYYY-MM' en una sola.

export const MESES_NOMBRE = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function periodoDesdeNombre(mes: string | null, anio: number | null): string | null {
  if (!mes || !anio) return null
  const idx = MESES_NOMBRE.findIndex(m => m.toLowerCase() === mes.trim().toLowerCase())
  if (idx < 0) return null
  return `${anio}-${String(idx + 1).padStart(2, '0')}`
}

export function labelPeriodo(periodo: string | null): string {
  if (!periodo) return 'Sin periodo'
  return new Date(periodo + '-01T12:00:00')
    .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
}

// ── Carga inicial de cartera ──────────────────────────────────────────────
// Al arrancar un módulo se carga la cartera del año (cargos + pagos ya
// recibidos) para que los estados de cuenta queden correctos desde el primer
// día. Esos pagos son reales pero NO generaron recibo de ingreso: no son
// cobranza operada por el sistema y no están en el Estado de Resultados.
//
// Tratarlos como cobranza del mes produce picos fantasma (en Golf: $15.2M en
// enero 2026 contra $3.5M realmente reconocidos como ingreso). Por eso:
//   · el DEVENGADO los conserva  → la cuota del periodo sí se devengó
//   · el COBRADO / FLUJO los excluye → ese efectivo no pasó por el sistema
//
// La fecha de corte por módulo vive en cfg.configuracion, clave
// `arranque_cobranza_<modulo>` (ver migración 20260920140000). Vacía o
// ausente = el módulo no declara carga inicial.

export type ModuloCuotas = 'residencial' | 'golf' | 'hipico' | 'locales'

export const MODULOS_CUOTAS: ModuloCuotas[] = ['residencial', 'golf', 'hipico', 'locales']

export const MODULO_META: Record<ModuloCuotas, { label: string; color: string }> = {
  residencial: { label: 'Fraccionamiento',   color: '#2563eb' },
  golf:        { label: 'Club Golf',         color: '#b8952a' },
  hipico:      { label: 'Hípico',            color: '#7c3aed' },
  locales:     { label: 'Locales Comerciales', color: '#0f766e' },
}

export const claveArranque = (m: ModuloCuotas) => `arranque_cobranza_${m}`

export type ArranqueOperativo = Partial<Record<ModuloCuotas, string>>

/** true si el cobro es anterior al arranque operativo del módulo (carga inicial). */
export function esCargaInicial(
  modulo: ModuloCuotas,
  fechaPago: string,
  arranque: ArranqueOperativo,
): boolean {
  const corte = arranque[modulo]
  if (!corte) return false
  return fechaPago < corte
}

// ── Filas normalizadas ────────────────────────────────────────────────────
// Dos formas distintas porque son dos medidas distintas, y colapsarlas en una
// sola tabla fue justamente lo que hizo que una cifra mensual no respondiera
// ninguna pregunta con claridad:
//
//   CuotaDevengada  una fila por cuota cargada   → medida del periodo (M1)
//   CobroAplicado   una fila por pago aplicado   → medida de caja    (M2)

export type CuotaDevengada = {
  key: string
  modulo: ModuloCuotas
  linea: string                    // Membresías, Pensión Carrito, sección del lote…
  periodo: string | null
  cargado: number
  cobrado: number
  saldo: number
  status: string
  fechaVencimiento: string | null
  cliente: string
  concepto: string
  idConceptoFk: number | null
  idSeccionFk: number | null
}

export type CobroAplicado = {
  key: string
  modulo: ModuloCuotas
  linea: string
  periodo: string | null
  fechaPago: string
  monto: number
  banda: BandaCobranza
  esCargaInicial: boolean
  cliente: string
  concepto: string
  folio: string | null
  idConceptoFk: number | null
  idSeccionFk: number | null
}

// Dinero cobrado que NO se puede ubicar en ningún mes porque la cuota tiene
// abono registrado pero `fecha_pago` vacía. Existe de verdad: al 2026-09-20
// hay 8 cuotas así en golf.cxc_golf ($18,519.44 cobrados sin fecha), todas
// PAGO_PARCIAL. No se descarta ni se reparte a un mes arbitrario — se reporta
// aparte, porque si se omite el puente devengado→caja deja de cuadrar y la
// diferencia aparece como un error del reporte en vez de un dato a corregir.
export type CobroSinFecha = {
  key: string
  modulo: ModuloCuotas
  linea: string
  periodo: string | null
  monto: number
  cliente: string
  concepto: string
}
