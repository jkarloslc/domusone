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

/** Suma `n` meses a un periodo 'YYYY-MM'. */
export function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Devengo diferido ──────────────────────────────────────────────────────
// Una cuota anual (la INSCRIPCIÓN de Golf) se carga completa en un solo
// periodo pero absorbe 12 meses de resultado. Si se reconoce completa en su
// mes, enero 2026 devenga $5.05M contra ~$1.35M del resto del año — el mismo
// pico que la estrategia busca eliminar.
//
// `mesesDevengo` viene del catálogo (golf.cat_cuotas_config.meses_devengo,
// cfg.cuotas_estandar.meses_devengo), no de código: cambiar la política es
// cambiar un valor. 1 = se reconoce completo en su periodo.
//
// El reparto es de PRESENTACIÓN: no toca cargos, saldos ni cobranza. La
// diferencia entre lo cargado y lo reconocido es ingreso diferido, y el
// puente devengado→caja la muestra en columna propia para seguir cuadrando.

/**
 * Reparte el monto de una cuota en sus meses de devengo.
 * Devuelve una sola rebanada cuando `mesesDevengo <= 1` o no hay periodo.
 * El último mes absorbe el redondeo, así la suma de rebanadas es exacta.
 */
export function repartirDevengo(
  periodo: string | null,
  monto: number,
  mesesDevengo: number,
): { periodo: string | null; monto: number }[] {
  const n = Math.max(1, Math.floor(mesesDevengo || 1))
  if (!periodo || n === 1) return [{ periodo, monto }]

  const base = Math.round((monto / n) * 100) / 100
  const out: { periodo: string | null; monto: number }[] = []
  let acum = 0
  for (let i = 0; i < n; i++) {
    const esUltimo = i === n - 1
    const m = esUltimo ? Math.round((monto - acum) * 100) / 100 : base
    acum = Math.round((acum + m) * 100) / 100
    out.push({ periodo: sumarMeses(periodo, i), monto: m })
  }
  return out
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
  /** Meses de resultado que absorbe el cargo (1 = todo en su periodo). */
  mesesDevengo: number
  cargado: number
  cobrado: number
  /**
   * Parte del cargo liquidada vía descuento por pago anticipado. NO es efectivo:
   * el puente devengado→caja la lleva en columna propia, porque si se mezclara
   * con lo cobrado la cadena no cuadraría con el cargo.
   *
   * 0 en Golf/Hípico/Locales: ahí `monto_final` ya viene neto de descuento
   * (monto_original − descuento), así que el devengado es neto de origen. En
   * Fraccionamiento el cargo es BRUTO y el descuento se conoce al cobrar, así
   * que se lleva aparte (ctrl.cargos.descuento_aplicado).
   */
  descuento: number
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
