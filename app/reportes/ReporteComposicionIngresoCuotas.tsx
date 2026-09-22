'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { PrintBar } from './utils'
import { AlertTriangle, CalendarClock, CheckCircle, Clock, Info, Scissors, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { fetchCobranzaCuotas, fetchIngresoClasificado, type ResultadoCobranza, type ResultadoIngresoClasificado } from '@/lib/cobranzaCuotas'
import {
  BANDAS, BANDA_META, MODULOS_CUOTAS, MODULO_META, labelPeriodo, repartirDevengo,
  type BandaCobranza, type ModuloCuotas,
} from '@/lib/clasificacionCobranza'

// ── Composición del Ingreso por Cuotas ────────────────────────────────────
//
// Responde la pregunta que una sola cifra mensual no puede responder: cuando
// el Estado de Resultados o el Comparativo muestran un ingreso de cuotas del
// mes, ¿cuánto de eso es desempeño del mes (corriente), cuánto es recuperación
// de cartera (vencido) y cuánto es dinero de meses futuros (anticipado)?
//
// Tres tabs, tres medidas distintas — a propósito separadas:
//
//   Composición del cobro   caja del mes, descompuesta en las 4 bandas.
//                           Las bandas SUMAN el cobro del mes: descomponen
//                           una cifra sin alterarla.
//
//   Puente devengado→caja   por periodo: cuánto se devengó y cómo se cobró
//                           (en su mes / antes / después / sigue pendiente).
//                           Es la cédula que hace auditable la diferencia
//                           entre "cómo le fue al área" y "cuánto entró".
//
//   Detalle                 fila por aplicación de pago.
//
// El devengado es la única base con la que medir un área mes a mes: es la
// cuota del periodo, cobrada o no, y no la mueve el momento del cobro.

const fmt$ = (v: number) => '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })
const fmt0 = (v: number) => '$' + Number(v).toLocaleString('es-MX', { maximumFractionDigits: 0 })
const pctStr = (parte: number, total: number) => total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : '—'
const fmtFecha = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MM = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

type Tab = 'composicion' | 'puente' | 'ingreso' | 'cartera' | 'detalle'

const cellNum: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

// ── Condonación: presentación en pausa ────────────────────────────────────
//
// Las condonaciones que hay en la cartera NO son una política de cobranza:
// salieron de ajustes manuales hechos durante la carga masiva inicial y en
// algunos registros sueltos. Presentarlas como una dimensión propia del
// reporte diría algo que el dato no dice.
//
// Lo que se apaga es solo la PRESENTACIÓN: la card «Condonado», las columnas
// Condonado / Caja de pantalla y de Excel, y el párrafo de condonación
// indeterminada. Poner esto en `true` las devuelve sin tocar nada más.
//
// El NETEO no depende de este flag: el KPI «Cobrado (caja)» resta la
// condonación siempre, porque es la cifra comparable contra el libro de
// ingresos y contra el Estado de Resultados. Con las columnas ocultas ese KPI
// no empata con el «Total cobrado» de la tabla, así que su subtítulo dice que
// va neto — es lo único que hace auditable la diferencia (ver `hayNeteo`).
//
// El cálculo también se queda completo: lib/cobranzaCuotas.ts sigue
// repartiendo la parte condonada de forma exacta vía golf.recibos_golf_pagos.
const MOSTRAR_CONDONACION = false

export default function ReporteComposicionIngresoCuotas() {
  const anioActual = new Date().getFullYear()

  // La exportación a Excel queda reservada a superadmin. Mismo patrón que
  // ReporteOPsPorTipoGasto.tsx:54 — check directo de rol, no `canWrite()`:
  // esto no es escritura, es sacar datos del sistema.
  const { authUser } = useAuth()
  const esSuperadmin = authUser?.rol === 'superadmin'

  const [anio, setAnio]               = useState(anioActual)
  const [modulosSel, setModulosSel]   = useState<ModuloCuotas[]>([...MODULOS_CUOTAS])
  const [lineaSel, setLineaSel]       = useState('')
  const [incluirCargaInicial, setIncluirCargaInicial] = useState(false)
  const [prorratear, setProrratear] = useState(true)
  const [tab, setTab]                 = useState<Tab>('composicion')
  const [bandaFiltro, setBandaFiltro] = useState<'' | BandaCobranza>('')

  const [data, setData]       = useState<ResultadoCobranza | null>(null)
  const [loading, setLoading] = useState(false)
  const [ingreso, setIngreso] = useState<ResultadoIngresoClasificado | null>(null)

  // Cada carga lleva número: solo la última pedida puede escribir el estado.
  //
  // Sin esto, prender y apagar módulos dejaba líneas de módulos ya
  // deseleccionados pegadas en el selector. No era un problema de filtrado sino
  // una carrera: `fetchCobranzaCuotas` tarda en proporción a los módulos que
  // consulta, así que al DESELECCIONAR uno la petición nueva es más rápida que
  // la anterior, contesta primero, y la respuesta vieja —con más módulos—
  // aterriza después y sobreescribe `data`. Quien gana es la última en
  // contestar, no la última en pedirse.
  const peticion = useRef(0)

  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setLoading(true)
    const r = await fetchCobranzaCuotas(modulosSel)
    if (mia !== peticion.current) return   // llegó tarde: ya hay otra en vuelo
    setData(r)
    setLoading(false)
  }, [modulosSel])

  useEffect(() => { cargar() }, [cargar])

  // Libro de ingresos — fuente independiente de las subcuentas (ver
  // fetchIngresoClasificado). Se recarga solo al cambiar de año.
  useEffect(() => { fetchIngresoClasificado(anio).then(setIngreso) }, [anio])

  // ── Conjuntos filtrados ────────────────────────────────────────────────
  // La carga inicial de cartera se excluye del COBRO (ese efectivo no pasó por
  // el sistema ni está en el Estado de Resultados) pero nunca del DEVENGADO
  // (la cuota del periodo sí se devengó). Ver lib/clasificacionCobranza.ts.
  // ── Filtro de línea, identificada por módulo ───────────────────────────
  // El valor del selector es `modulo|linea`, no el nombre suelto. Dos módulos
  // pueden llamar igual a una línea (una sección «Mantenimiento» de
  // Fraccionamiento y el «Mantenimiento» de Locales) y con el nombre a secas
  // `new Set` las colapsaba en una sola opción que filtraba las dos a la vez,
  // mezclando módulos sin decirlo.
  const lineaFiltro = useMemo(() => {
    const i = lineaSel.indexOf('|')
    if (i < 0) return null
    return { modulo: lineaSel.slice(0, i) as ModuloCuotas, linea: lineaSel.slice(i + 1) }
  }, [lineaSel])

  const coincideLinea = useCallback(
    (r: { modulo: ModuloCuotas; linea: string }) =>
      !lineaFiltro || (r.modulo === lineaFiltro.modulo && r.linea === lineaFiltro.linea),
    [lineaFiltro])

  // Solo se limpia si el módulo de la línea elegida dejó de estar seleccionado.
  // Antes se borraba con cualquier cambio de módulos: tener Golf + Hípico con
  // la línea «Membresías» y apagar Hípico perdía el filtro sin motivo.
  useEffect(() => {
    if (lineaFiltro && !modulosSel.includes(lineaFiltro.modulo)) setLineaSel('')
  }, [modulosSel, lineaFiltro])

  const cobros = useMemo(() => {
    if (!data) return []
    return data.cobrado.filter(c =>
      (incluirCargaInicial || !c.esCargaInicial) && coincideLinea(c))
  }, [data, incluirCargaInicial, coincideLinea])

  const devengado = useMemo(() => {
    if (!data) return []
    return data.devengado.filter(coincideLinea)
  }, [data, coincideLinea])

  // Las opciones se acotan a `modulosSel` y no solo a lo que trajo `data`: así
  // el selector queda correcto en el mismo render en que se toca un módulo, sin
  // esperar a que vuelva la consulta.
  const lineasPorModulo = useMemo(() => {
    const out: { modulo: ModuloCuotas; lineas: string[] }[] = []
    for (const m of MODULOS_CUOTAS) {
      if (!modulosSel.includes(m)) continue
      const set = new Set<string>()
      for (const d of data?.devengado ?? []) if (d.modulo === m) set.add(d.linea)
      if (set.size) out.push({ modulo: m, lineas: Array.from(set).sort((a, b) => a.localeCompare(b, 'es')) })
    }
    return out
  }, [data, modulosSel])

  // ── Puente módulo → centro de ingreso ──────────────────────────────────
  // El libro de ingresos no sabe de módulos: sabe de centros. Sin este puente
  // la pestaña «Ingreso reconocido» ignoraba el selector de módulos y mostraba
  // los seis centros aunque solo estuviera Golf seleccionado — $33.7M contra
  // los $12.9M del módulo, que es justo la cifra que se quería conciliar.
  // El mapa sale del catálogo (ver `centrosPorModulo` en lib/cobranzaCuotas).
  const centrosSel = useMemo(() => {
    const s = new Set<number>()
    for (const m of modulosSel) (data?.centrosPorModulo?.[m] ?? []).forEach(c => s.add(c))
    return s
  }, [data, modulosSel])

  // ── Puente línea del subledger → dimensión del libro ───────────────────
  // «Membresías» (tipo de cuota) y «Membresias» (concepto del recibo) son dos
  // vocabularios distintos que solo empataban de casualidad: el filtro de línea
  // dejaba la pestaña del libro en blanco para Golf, Hípico y Locales. Se
  // traduce por lo único que las dos puntas comparten de verdad — el id de
  // concepto o de sección.
  const dimsLinea = useMemo(() => {
    if (!lineaFiltro || !data) return null
    const conceptos = new Set<number>()
    const secciones = new Set<number>()
    for (const d of data.devengado) {
      if (!coincideLinea(d)) continue
      if (d.idConceptoFk != null) conceptos.add(d.idConceptoFk)
      if (d.idSeccionFk  != null) secciones.add(d.idSeccionFk)
    }
    return { conceptos, secciones, vacia: !conceptos.size && !secciones.size }
  }, [data, coincideLinea])

  const anios = useMemo(() => {
    const s = new Set<number>()
    ;(data?.cobrado ?? []).forEach(c => s.add(Number(c.fechaPago.slice(0, 4))))
    ;(data?.devengado ?? []).forEach(d => { if (d.periodo) s.add(Number(d.periodo.slice(0, 4))) })
    s.add(anioActual)
    return Array.from(s).sort((a, b) => b - a)
  }, [data, anioActual])

  // ── Matriz mes × banda (caja del año seleccionado) ─────────────────────
  //
  // Las cuatro bandas siguen sumando el cobro completo: son la descomposición
  // por PERIODO y no se tocan. La condonación es una dimensión ortogonal —
  // cómo se extinguió el saldo, no a qué mes pertenecía— así que va en columnas
  // memo al final. `caja` es lo único comparable contra el libro de ingresos:
  // la condonación liquida cartera pero no entra al banco ni genera recibo.
  const matriz = useMemo(() => {
    const filas = MM.map((m, i) => {
      const delMes = cobros.filter(c => c.fechaPago.slice(0, 7) === `${anio}-${m}`)
      const porBanda = {} as Record<BandaCobranza, number>
      BANDAS.forEach(b => { porBanda[b] = delMes.filter(c => c.banda === b).reduce((a, c) => a + c.monto, 0) })
      const total = BANDAS.reduce((a, b) => a + porBanda[b], 0)
      // Se calcula siempre, apagada o no la presentación: el KPI de caja resta
      // la condonación en los dos casos. Ver `MOSTRAR_CONDONACION`.
      const condonado = delMes.reduce((a, c) => a + c.condonado, 0)
      return { mes: m, label: MESES_CORTO[i], porBanda, total, condonado, caja: total - condonado, n: delMes.length }
    })
    const totales = {} as Record<BandaCobranza, number>
    BANDAS.forEach(b => { totales[b] = filas.reduce((a, f) => a + f.porBanda[b], 0) })
    const granTotal     = BANDAS.reduce((a, b) => a + totales[b], 0)
    const granCondonado = filas.reduce((a, f) => a + f.condonado, 0)
    return { filas, totales, granTotal, granCondonado, granCaja: granTotal - granCondonado }
  }, [cobros, anio])

  // `hayCondonacion` gobierna solo lo que se DIBUJA (card, columnas, Excel).
  // `hayNeteo` dice si el KPI de caja está restando algo, para poder decirlo
  // en su subtítulo: son dos preguntas distintas desde que el KPI netea
  // aunque la presentación esté apagada.
  const hayNeteo       = matriz.granCondonado > 0.005
  const hayCondonacion = MOSTRAR_CONDONACION && hayNeteo

  // ── Devengo reconocido (cuotas anuales prorrateadas) ───────────────────
  // Reparte cada cuota en sus meses de devengo (`mesesDevengo`, del catálogo).
  // Una cuota mensual tiene una sola rebanada, así que sin cuotas anuales esto
  // es idéntico al devengado por cargo.
  const reconocidoPorPeriodo = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of devengado) {
      const slices = prorratear
        ? repartirDevengo(d.periodo, d.cargado, d.mesesDevengo)
        : [{ periodo: d.periodo, monto: d.cargado }]
      for (const sl of slices) {
        if (!sl.periodo) continue
        map.set(sl.periodo, (map.get(sl.periodo) ?? 0) + sl.monto)
      }
    }
    return map
  }, [devengado, prorratear])

  const hayDescuento = useMemo(() => devengado.some(d => d.descuento > 0), [devengado])

  const hayDiferido = useMemo(
    () => prorratear && devengado.some(d => d.mesesDevengo > 1),
    [devengado, prorratear])

  // ── Puente devengado → caja, por periodo ───────────────────────────────
  // Dos identidades encadenadas:
  //   1) Devengado reconocido + diferido = devengado por cargo
  //   2) Devengado por cargo = cobrado en su mes + antes + después
  //                            + cobrado sin fecha + pendiente
  //
  // `pendiente` se DERIVA como cargado − cobrado en vez de sumar la columna
  // `saldo`: así la identidad (2) cuadra por construcción. Con `saldo` no
  // cuadraba — las 8 cuotas de Golf con abono sin fecha_pago dejaban un hueco
  // de $18,519.44 que parecía un error del reporte y en realidad es un dato a
  // corregir en la cobranza. Esas aparecen en su propia columna.
  const puente = useMemo(() => {
    const sinFechaTodas = (data?.cobrosSinFecha ?? []).filter(coincideLinea)
    const filas = MM.map((m, i) => {
      const per = `${anio}-${m}`
      const dev = devengado.filter(d => d.periodo === per)
      const cargado = dev.reduce((a, d) => a + d.cargado, 0)
      const cobradoTotal = dev.reduce((a, d) => a + d.cobrado, 0)
      const pendiente = cargado - cobradoTotal
      // El descuento liquida cargo pero no es efectivo, así que va en columna
      // propia: si se mezclara con lo cobrado, la cadena no cuadraría.
      const descuento = dev.reduce((a, d) => a + d.descuento, 0)

      // Aquí SIEMPRE se mira el universo completo de cobros del periodo,
      // incluida la carga inicial: el puente explica de dónde salió el
      // devengado, y omitir la carga inicial lo descuadraría.
      const cobPeriodo = (data?.cobrado ?? []).filter(c => c.periodo === per && coincideLinea(c))
      const enSuMes   = cobPeriodo.filter(c => c.fechaPago.slice(0, 7) === per).reduce((a, c) => a + c.monto, 0)
      const antes     = cobPeriodo.filter(c => c.fechaPago.slice(0, 7) <  per).reduce((a, c) => a + c.monto, 0)
      const despues   = cobPeriodo.filter(c => c.fechaPago.slice(0, 7) >  per).reduce((a, c) => a + c.monto, 0)
      const sinFecha  = sinFechaTodas.filter(c => c.periodo === per).reduce((a, c) => a + c.monto, 0)

      const dif = cargado - (enSuMes + antes + despues + sinFecha + descuento + pendiente)

      // Devengado reconocido + diferido = devengado por cargo (identidad exacta
      // por construcción). Y devengado por cargo = la cadena de cobro de la
      // derecha. Dos identidades encadenadas, las dos comprobables.
      const reconocido = reconocidoPorPeriodo.get(per) ?? 0
      const diferido = cargado - reconocido

      return {
        mes: m, label: MESES_CORTO[i], periodo: per,
        reconocido, diferido,
        cargado, enSuMes, antes, despues, sinFecha, descuento, pendiente,
        dif, cuadra: Math.abs(dif) < 1, n: dev.length,
      }
    }).filter(f => f.cargado !== 0 || f.reconocido !== 0 || f.enSuMes !== 0 || f.antes !== 0 || f.despues !== 0)

    const tot = filas.reduce((a, f) => ({
      reconocido: a.reconocido + f.reconocido, diferido: a.diferido + f.diferido,
      cargado: a.cargado + f.cargado, enSuMes: a.enSuMes + f.enSuMes,
      antes: a.antes + f.antes, despues: a.despues + f.despues,
      sinFecha: a.sinFecha + f.sinFecha, descuento: a.descuento + f.descuento,
      pendiente: a.pendiente + f.pendiente,
    }), { reconocido: 0, diferido: 0, cargado: 0, enSuMes: 0, antes: 0, despues: 0, sinFecha: 0, descuento: 0, pendiente: 0 })

    return { filas, tot }
  }, [devengado, data, anio, coincideLinea, reconocidoPorPeriodo])

  // ── Matriz del libro de ingresos (mes × banda capturada) ───────────────
  // Se construye sobre ctrl.recibos_ingreso, la misma fuente del Comparativo,
  // así que sus totales SÍ coinciden con el Estado de Resultados.
  const matrizIngreso = useMemo(() => {
    const filas = (ingreso?.filas ?? []).filter(f => {
      // Sin centros resueltos no se acota: mostrar el libro completo y decirlo
      // es mejor que devolver una pantalla vacía sin explicación.
      if (centrosSel.size && !(f.idCentroFk != null && centrosSel.has(f.idCentroFk))) return false
      if (dimsLinea && !dimsLinea.vacia) {
        const okConcepto = f.idConceptoFk != null && dimsLinea.conceptos.has(f.idConceptoFk)
        const okSeccion  = f.idSeccionFk  != null && dimsLinea.secciones.has(f.idSeccionFk)
        if (!okConcepto && !okSeccion) return false
      }
      return true
    })
    const porMes = MM.map((m, i) => {
      const delMes = filas.filter(f => f.fecha.slice(5, 7) === m)
      const vencido    = delMes.reduce((a, f) => a + f.vencido, 0)
      const corriente  = delMes.reduce((a, f) => a + f.corriente, 0)
      const anticipado = delMes.reduce((a, f) => a + f.anticipado, 0)
      const sinClas    = delMes.reduce((a, f) => a + f.sinClasificar, 0)
      const total      = delMes.reduce((a, f) => a + f.monto, 0)
      return { mes: m, label: MESES_CORTO[i], vencido, corriente, anticipado, sinClas, total, n: delMes.length }
    })
    const tot = porMes.reduce((a, f) => ({
      vencido: a.vencido + f.vencido, corriente: a.corriente + f.corriente,
      anticipado: a.anticipado + f.anticipado, sinClas: a.sinClas + f.sinClas, total: a.total + f.total,
    }), { vencido: 0, corriente: 0, anticipado: 0, sinClas: 0, total: 0 })
    const centros = Array.from(new Set(filas.map(f => f.centro))).sort()
    return {
      porMes, tot, centros, nFilas: filas.length,
      acotado: centrosSel.size > 0,
      lineaSinDimension: !!dimsLinea?.vacia,
    }
  }, [ingreso, centrosSel, dimsLinea])

  // ── Cartera por antigüedad ─────────────────────────────────────────────
  // Mismas bandas que ReporteAntiguedadOPporCC (Por vencer / 0-30 / 31-60 /
  // 61-90 / +90) para que los dos reportes se lean igual.
  //
  // El pendiente se DERIVA como cargado − cobrado, no se lee de `saldo`: en
  // Fraccionamiento el descuento por pago anticipado ya cierra el cargo vía
  // descuento_aplicado, y con `saldo` a secas reaparecerían los adeudos
  // fantasma que la migración 20260920230000 vino a eliminar.
  //
  // Una cuota sin fecha_vencimiento no entra en ninguna banda: se cuenta aparte
  // en vez de asumirle un vencimiento.
  const cartera = useMemo(() => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const BANDAS_ANT = [
      { key: 'porVencer', label: 'Por vencer', color: '#2563eb', test: (d: number) => d <= 0 },
      { key: 'b30',       label: '1 a 30',     color: '#ca8a04', test: (d: number) => d >= 1 && d <= 30 },
      { key: 'b60',       label: '31 a 60',    color: '#ea580c', test: (d: number) => d >= 31 && d <= 60 },
      { key: 'b90',       label: '61 a 90',    color: '#dc2626', test: (d: number) => d >= 61 && d <= 90 },
      { key: 'mas90',     label: 'Más de 90',  color: '#7f1d1d', test: (d: number) => d > 90 },
    ] as const

    const porLinea = new Map<string, Record<string, number> & { total: number; n: number }>()
    const totales: Record<string, number> = { porVencer: 0, b30: 0, b60: 0, b90: 0, mas90: 0 }
    let total = 0, sinVencimiento = 0, nSinVenc = 0, nCuotas = 0

    for (const d of devengado) {
      const pendiente = Math.round((d.cargado - d.cobrado) * 100) / 100
      if (pendiente <= 0.005) continue
      nCuotas++
      if (!d.fechaVencimiento) { sinVencimiento += pendiente; nSinVenc++; continue }
      const venc = new Date(d.fechaVencimiento + 'T00:00:00')
      const dias = Math.floor((hoy.getTime() - venc.getTime()) / 86400000)
      const banda = BANDAS_ANT.find(b => b.test(dias))
      if (!banda) continue

      const clave = `${d.modulo}|${d.linea}`
      if (!porLinea.has(clave)) {
        porLinea.set(clave, { porVencer: 0, b30: 0, b60: 0, b90: 0, mas90: 0, total: 0, n: 0 } as any)
      }
      const fila = porLinea.get(clave)!
      fila[banda.key] = (fila[banda.key] ?? 0) + pendiente
      fila.total += pendiente
      fila.n += 1
      totales[banda.key] += pendiente
      total += pendiente
    }

    const filas = Array.from(porLinea.entries())
      .map(([clave, v]) => {
        const [modulo, linea] = clave.split('|')
        return { modulo: modulo as ModuloCuotas, linea, ...v }
      })
      .sort((a, b) => b.total - a.total)

    return { BANDAS_ANT, filas, totales, total, sinVencimiento, nSinVenc, nCuotas }
  }, [devengado])

  // ── Detalle ────────────────────────────────────────────────────────────
  const detalle = useMemo(() => cobros
    .filter(c => c.fechaPago.slice(0, 4) === String(anio))
    .filter(c => !bandaFiltro || c.banda === bandaFiltro)
    .sort((a, b) => a.fechaPago.localeCompare(b.fechaPago) || a.cliente.localeCompare(b.cliente)),
    [cobros, anio, bandaFiltro])

  // ── KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const devAnio = devengado.filter(d => d.periodo?.startsWith(String(anio)))
    const porCargo = devAnio.reduce((a, d) => a + d.cargado, 0)
    const cobradoDev = devAnio.reduce((a, d) => a + d.cobrado, 0)
    const reconocido = MM.reduce((a, m) => a + (reconocidoPorPeriodo.get(`${anio}-${m}`) ?? 0), 0)
    return {
      // El KPI muestra lo RECONOCIDO (la medida del área); pendiente y avance
      // se quedan en base cargo, que es la realidad de la cartera.
      devengado: prorratear ? reconocido : porCargo,
      porCargo,
      pendiente: porCargo - cobradoDev,
      avance: porCargo > 0 ? (cobradoDev / porCargo) * 100 : 0,
      // Caja = lo cobrado MENOS lo condonado. La condonación extingue saldo
      // igual que un pago, pero no entró al banco: incluirla aquí era lo que
      // hacía que este KPI no se pudiera conciliar con el libro de ingresos.
      caja: matriz.granCaja,
      condonado: matriz.granCondonado,
      liquidado: matriz.granTotal,
    }
  }, [devengado, anio, matriz, reconocidoPorPeriodo, prorratear])

  const toggleModulo = (m: ModuloCuotas) =>
    setModulosSel(prev => prev.includes(m)
      ? (prev.length === 1 ? prev : prev.filter(x => x !== m))
      : [...prev, m])

  // ── Export Excel ───────────────────────────────────────────────────────
  const exportar = () => {
    const wb = XLSX.utils.book_new()

    const hoja1: any[][] = [
      // El Excel lleva las mismas columnas que la pantalla: si la condonación
      // está apagada, tampoco sale en el archivo.
      ['Mes', ...BANDAS.map(b => BANDA_META[b].label), 'Total cobrado',
        ...(hayCondonacion ? ['Condonado', 'Caja (efectivo)'] : []), '% Corriente'],
      ...matriz.filas.filter(f => f.total !== 0).map(f => [
        `${f.label} ${anio}`, ...BANDAS.map(b => f.porBanda[b]), f.total,
        ...(hayCondonacion ? [f.condonado, f.caja] : []),
        f.total > 0 ? f.porBanda.CORRIENTE / f.total : 0,
      ]),
      ['TOTAL', ...BANDAS.map(b => matriz.totales[b]), matriz.granTotal,
        ...(hayCondonacion ? [matriz.granCondonado, matriz.granCaja] : []),
        matriz.granTotal > 0 ? matriz.totales.CORRIENTE / matriz.granTotal : 0],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hoja1), 'Composicion del cobro')

    const hoja2: any[][] = [
      ['Periodo', 'Devengado reconocido', 'Diferido', 'Devengado por cargo', 'Cobrado en su mes',
       'Cobrado antes (anticipo)', 'Cobrado después (vencido)', 'Cobrado sin fecha', 'Descuento', 'Pendiente', 'Diferencia'],
      ...puente.filas.map(f => [
        labelPeriodo(f.periodo), f.reconocido, f.diferido, f.cargado,
        f.enSuMes, f.antes, f.despues, f.sinFecha, f.descuento, f.pendiente, f.dif,
      ]),
      ['TOTAL', puente.tot.reconocido, puente.tot.diferido, puente.tot.cargado, puente.tot.enSuMes,
       puente.tot.antes, puente.tot.despues, puente.tot.sinFecha, puente.tot.descuento, puente.tot.pendiente, ''],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hoja2), 'Puente devengado-caja')

    const hoja3: any[][] = [
      ['Mes', 'Corriente', 'Vencida', 'Anticipada', 'Sin clasificar', 'Ingreso del mes'],
      ...matrizIngreso.porMes.filter(f => f.total !== 0).map(f => [
        `${f.label} ${anio}`, f.corriente, f.vencido, f.anticipado, f.sinClas, f.total,
      ]),
      ['TOTAL', matrizIngreso.tot.corriente, matrizIngreso.tot.vencido,
       matrizIngreso.tot.anticipado, matrizIngreso.tot.sinClas, matrizIngreso.tot.total],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hoja3), 'Ingreso reconocido')

    const hoja4: any[][] = [
      ['Módulo', 'Línea', ...cartera.BANDAS_ANT.map(b => b.label), 'Saldo total', 'Cuotas'],
      ...cartera.filas.map(f => [
        MODULO_META[f.modulo].label, f.linea,
        ...cartera.BANDAS_ANT.map(b => (f as any)[b.key] ?? 0), f.total, f.n,
      ]),
      ['TOTAL', '', ...cartera.BANDAS_ANT.map(b => cartera.totales[b.key] ?? 0), cartera.total, cartera.nCuotas],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hoja4), 'Cartera por antiguedad')

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.map(c => ({
      'Fecha de pago': c.fechaPago,
      'Módulo': MODULO_META[c.modulo].label,
      'Línea': c.linea,
      'Cliente': c.cliente,
      'Concepto': c.concepto,
      'Periodo de la cuota': c.periodo ?? '(sin periodo)',
      'Clasificación': BANDA_META[c.banda].label,
      'Monto': c.monto,
      ...(hayCondonacion ? { 'Condonado': c.condonado, 'Caja (efectivo)': c.monto - c.condonado } : {}),
      'Carga inicial': c.esCargaInicial ? 'Sí' : 'No',
      'Folio': c.folio ?? '',
    }))), 'Detalle')

    if ((data?.cobrosSinFecha ?? []).length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data!.cobrosSinFecha.map(c => ({
        'Módulo': MODULO_META[c.modulo].label, 'Línea': c.linea, 'Cliente': c.cliente,
        'Concepto': c.concepto, 'Periodo': c.periodo ?? '', 'Monto cobrado sin fecha': c.monto,
      }))), 'Cobros sin fecha')
    }

    XLSX.writeFile(wb, `Composicion-Ingreso-Cuotas_${anio}_${new Date().toLocaleDateString('en-CA')}.xlsx`)
  }

  const countPrint = tab === 'composicion' ? matriz.filas.filter(f => f.total !== 0).length
                   : tab === 'puente'      ? puente.filas.length
                   : tab === 'ingreso'     ? matrizIngreso.porMes.filter(f => f.total !== 0).length
                   : tab === 'cartera'     ? cartera.filas.length
                   : detalle.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Año</label>
          <select className="select" value={anio} onChange={e => setAnio(Number(e.target.value))}
            style={{ minWidth: 100 }}>
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Módulos</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {MODULOS_CUOTAS.map(m => {
              const on = modulosSel.includes(m)
              return (
                <button key={m} onClick={() => toggleModulo(m)}
                  style={{ padding: '7px 12px', fontSize: 12, fontWeight: on ? 700 : 500, borderRadius: 8, cursor: 'pointer',
                    border: '1px solid', borderColor: on ? MODULO_META[m].color : '#e2e8f0',
                    background: on ? MODULO_META[m].color + '18' : '#fff',
                    color: on ? MODULO_META[m].color : '#64748b' }}>
                  {MODULO_META[m].label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Línea / Sección</label>
          <select className="select" value={lineaSel} onChange={e => setLineaSel(e.target.value)} style={{ minWidth: 190 }}>
            <option value="">Todas</option>
            {/* Un grupo por módulo: con cuatro módulos prendidos la lista plana
                mezclaba secciones de Fraccionamiento con tipos de cuota de Golf
                sin decir de dónde venía cada una. */}
            {lineasPorModulo.map(g => (
              <optgroup key={g.modulo} label={MODULO_META[g.modulo].label}>
                {g.lineas.map(l => (
                  <option key={`${g.modulo}|${l}`} value={`${g.modulo}|${l}`}>{l}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#475569', cursor: 'pointer', paddingBottom: 8 }}>
          <input type="checkbox" checked={incluirCargaInicial} onChange={e => setIncluirCargaInicial(e.target.checked)} />
          Incluir carga inicial de cartera
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#475569', cursor: 'pointer', paddingBottom: 8 }}
          title="Las cuotas anuales (ej. la Inscripción de Golf) se reparten en sus meses de devengo en vez de reconocerse completas en el mes del cargo. Solo afecta al devengado; el cobro no cambia.">
          <input type="checkbox" checked={prorratear} onChange={e => setProrratear(e.target.checked)} />
          Prorratear cuotas anuales
        </label>

        {esSuperadmin && (
          <button className="btn-ghost" onClick={exportar} disabled={loading} style={{ marginBottom: 1 }}>
            Exportar Excel
          </button>
        )}

        <PrintBar
          title={`Composicion-Ingreso-Cuotas-${anio}`}
          count={countPrint}
          reportTitle={`Composición del Ingreso por Cuotas — ${anio}`}
        />
      </div>

      {/* ── Errores y avisos ────────────────────────────────── */}
      {(data?.errores ?? []).map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><strong>Error de consulta:</strong> {e}</span>
        </div>
      ))}
      {(data?.avisos ?? []).map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{a}</span>
        </div>
      ))}
      {!incluirCargaInicial && Object.keys(data?.arranque ?? {}).length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e40af' }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Carga inicial excluida del cobro.</strong>{' '}
            {Object.entries(data!.arranque).map(([m, f]) => `${MODULO_META[m as ModuloCuotas].label}: cobros anteriores al ${fmtFecha(f as string)}`).join(' · ')}.
            {' '}Esos pagos son reales pero no generaron recibo de ingreso, así que no están en el Estado de Resultados.
            El devengado sí los conserva.
          </span>
        </div>
      )}

      {loading && <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Cargando cobranza…</div>}

      {!loading && data && (
        <>
          {/* ── KPIs ──────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: `Devengado ${anio}`, value: fmt0(kpis.devengado),
                sub: hayDiferido ? 'reconocido, con cuotas anuales prorrateadas' : 'cuotas del periodo, cobradas o no',
                color: '#2563eb', bg: '#eff6ff', icon: CalendarClock },
              // Con la card de condonación oculta, el subtítulo es lo único
              // que explica por qué este KPI no empata con el «Total cobrado»
              // de la tabla. Sin él la diferencia parece un error del reporte.
              { label: 'Cobrado (caja)',    value: fmt0(kpis.caja),
                sub: hayNeteo ? `del año ${anio} · neto de condonación` : `del año ${anio}`,
                color: '#15803d', bg: '#f0fdf4', icon: Wallet },
              ...(hayCondonacion ? [{
                label: 'Condonado', value: fmt0(kpis.condonado),
                sub: `liquidado sin efectivo · ${pctStr(kpis.condonado, kpis.liquidado)} de lo cobrado`,
                color: '#be185d', bg: '#fdf2f8', icon: Scissors,
              }] : []),
              { label: 'Por cobrar',        value: fmt0(kpis.pendiente), sub: 'cartera del devengado del año',     color: '#d97706', bg: '#fffbeb', icon: Clock },
              { label: 'Avance de cobro',   value: `${kpis.avance.toFixed(1)}%`, sub: 'del devengado del año',     color: '#7c3aed', bg: '#faf5ff', icon: TrendingUp },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: '1 1 180px', maxWidth: 260, padding: 14, background: k.bg, borderColor: k.color + '33' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <k.icon size={14} color={k.color} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: k.color }}>{k.label}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Composición del cobro: una tarjeta por banda ──── */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {BANDAS.map(b => {
              const meta = BANDA_META[b]
              const monto = matriz.totales[b]
              return (
                <div key={b} className="card" title={meta.ayuda}
                  style={{ flex: '1 1 180px', maxWidth: 280, padding: 14, background: meta.bg, borderColor: meta.color + '33' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: meta.color, marginBottom: 6 }}>{meta.label}</div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmt0(monto)}</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {pctStr(monto, matriz.granTotal)} del cobro {anio}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Tabs ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }}>
            {([
              { k: 'composicion', label: 'Composición del cobro' },
              { k: 'puente',      label: 'Puente devengado → caja' },
              { k: 'ingreso',     label: 'Ingreso reconocido (libro)' },
              { k: 'cartera',     label: 'Cartera por antigüedad' },
              { k: 'detalle',     label: `Detalle (${detalle.length})` },
            ] as const).map(t => (
              <button key={t.k} onClick={() => setTab(t.k)}
                style={{ padding: '9px 14px', fontSize: 13, fontWeight: tab === t.k ? 700 : 500, cursor: 'pointer',
                  background: 'none', border: 'none', borderBottom: '2px solid',
                  borderColor: tab === t.k ? '#2563eb' : 'transparent',
                  color: tab === t.k ? '#1d4ed8' : '#64748b' }}>
                {t.label}
              </button>
            ))}
          </div>

          <div id="reporte-print-area">
            {/* ── TAB 1: matriz mes × banda ──────────────────── */}
            {tab === 'composicion' && (
              <>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
                  Las cuatro bandas suman exactamente el cobro del mes: descomponen la cifra sin alterarla.
                  «Corriente» es el desempeño real del mes; «vencida» es recuperación de cartera y «anticipada»
                  es dinero de meses futuros — ninguna de las dos mide el mes en que entró.
                  {hayCondonacion && <>
                    {' '}Las dos últimas columnas son <strong>memo</strong>, no parte de la suma: separan de lo
                    cobrado la parte <strong>condonada</strong>, que extingue cartera pero no entra al banco ni
                    genera recibo de ingreso. <strong>Caja</strong> es lo único comparable contra el libro de
                    ingresos y contra el Estado de Resultados.
                  </>}
                </p>
                <table id="reporte-table" className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Mes de cobro</th>
                      {BANDAS.map(b => (
                        <th key={b} style={{ ...cellNum, color: BANDA_META[b].color }} title={BANDA_META[b].ayuda}>
                          {BANDA_META[b].label}
                        </th>
                      ))}
                      <th style={cellNum}>Total cobrado</th>
                      {hayCondonacion && <th style={{ ...cellNum, color: '#be185d' }} title="Parte del cobro liquidada por condonación: extingue el saldo de la cuota pero no entra al banco ni genera recibo de ingreso.">Condonado</th>}
                      {hayCondonacion && <th style={{ ...cellNum, color: '#15803d' }} title="Cobro menos condonación: el efectivo que sí pasó por caja.">Caja (efectivo)</th>}
                      <th style={cellNum}>% Corriente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matriz.filas.filter(f => f.total !== 0).map(f => (
                      <tr key={f.mes}>
                        <td style={{ fontWeight: 600 }}>{f.label} {anio}</td>
                        {BANDAS.map(b => (
                          <td key={b} style={{ ...cellNum, color: f.porBanda[b] ? BANDA_META[b].color : '#cbd5e1' }}>
                            {f.porBanda[b] ? fmt$(f.porBanda[b]) : '—'}
                          </td>
                        ))}
                        <td style={{ ...cellNum, fontWeight: 700 }}>{fmt$(f.total)}</td>
                        {hayCondonacion && (
                          <td style={{ ...cellNum, color: f.condonado ? '#be185d' : '#cbd5e1' }}>
                            {f.condonado ? fmt$(f.condonado) : '—'}
                          </td>
                        )}
                        {hayCondonacion && (
                          <td style={{ ...cellNum, color: '#15803d', fontWeight: 600 }}>{fmt$(f.caja)}</td>
                        )}
                        <td style={{ ...cellNum, color: '#16a34a', fontWeight: 600 }}>{pctStr(f.porBanda.CORRIENTE, f.total)}</td>
                      </tr>
                    ))}
                    {matriz.filas.every(f => f.total === 0) && (
                      <tr><td colSpan={hayCondonacion ? 9 : 7} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                        Sin cobros registrados en {anio} para los módulos seleccionados.
                      </td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                      <td>TOTAL {anio}</td>
                      {BANDAS.map(b => (
                        <td key={b} style={{ ...cellNum, color: BANDA_META[b].color }}>{fmt$(matriz.totales[b])}</td>
                      ))}
                      <td style={cellNum}>{fmt$(matriz.granTotal)}</td>
                      {hayCondonacion && <td style={{ ...cellNum, color: '#be185d' }}>{fmt$(matriz.granCondonado)}</td>}
                      {hayCondonacion && <td style={{ ...cellNum, color: '#15803d' }}>{fmt$(matriz.granCaja)}</td>}
                      <td style={{ ...cellNum, color: '#16a34a' }}>{pctStr(matriz.totales.CORRIENTE, matriz.granTotal)}</td>
                    </tr>
                    <tr style={{ background: '#f8fafc', fontSize: 11, color: '#64748b' }}>
                      <td>% del cobro</td>
                      {BANDAS.map(b => <td key={b} style={cellNum}>{pctStr(matriz.totales[b], matriz.granTotal)}</td>)}
                      <td style={cellNum}>100%</td>
                      {hayCondonacion && <td style={cellNum}>{pctStr(matriz.granCondonado, matriz.granTotal)}</td>}
                      {hayCondonacion && <td style={cellNum}>{pctStr(matriz.granCaja, matriz.granTotal)}</td>}
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {hayCondonacion && data && data.condonacionIndeterminada > 0 && (
                  <p style={{ fontSize: 11, color: '#92400e', marginTop: 8 }}>
                    <strong>{fmt$(data.condonacionIndeterminada)}</strong> se cobró con varias formas de pago,
                    una de ellas condonación, y la subcuenta solo guarda el texto concatenado sin los montos:
                    no se puede saber cuánto de eso fue condonación, así que queda contado como caja.
                    Afecta a Hípico y Locales, cuyas tablas de cartera no apuntan al recibo que sí trae el desglose.
                  </p>
                )}
              </>
            )}

            {/* ── TAB 2: puente devengado → caja ─────────────── */}
            {tab === 'puente' && (
              <>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
                  Por cada periodo: cuánto se devengó y cómo se cobró.{' '}
                  {hayDiferido && <><strong>Reconocido + diferido = devengado por cargo</strong>, y{' '}</>}
                  <strong>devengado por cargo = cobrado en su mes + antes + después + sin fecha{hayDescuento ? ' + descuento' : ''} + pendiente.</strong>{' '}
                  Esta tabla siempre considera el universo completo de cobros, incluida la carga inicial: es lo
                  que explica de dónde salió el devengado.
                  {hayDiferido && ' El «diferido» es la parte del cargo que se reconoce en otros meses (cuotas anuales prorrateadas).'}
                </p>
                <table id="reporte-table" className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Periodo</th>
                      {hayDiferido && <th style={{ ...cellNum, color: '#7c3aed' }} title="Devengado del mes con las cuotas anuales prorrateadas — es la medida del área">Devengado reconocido</th>}
                      {hayDiferido && <th style={{ ...cellNum, color: '#a855f7' }} title="Parte del cargo que se reconoce en otros meses">± Diferido</th>}
                      <th style={cellNum}>{hayDiferido ? 'Devengado por cargo' : 'Devengado'}</th>
                      <th style={{ ...cellNum, color: '#16a34a' }}>Cobrado en su mes</th>
                      <th style={{ ...cellNum, color: '#2563eb' }}>Cobrado antes (anticipo)</th>
                      <th style={{ ...cellNum, color: '#dc2626' }}>Cobrado después (vencido)</th>
                      <th style={{ ...cellNum, color: '#b45309' }}>Sin fecha</th>
                      {hayDescuento && <th style={{ ...cellNum, color: '#0891b2' }} title="Parte del cargo liquidada por descuento de pago anticipado — liquida cargo pero no es efectivo">Descuento</th>}
                      <th style={{ ...cellNum, color: '#d97706' }}>Pendiente</th>
                      <th style={{ textAlign: 'center' }}>Cuadra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {puente.filas.map(f => (
                      <tr key={f.mes}>
                        <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{labelPeriodo(f.periodo)}</td>
                        {hayDiferido && <td style={{ ...cellNum, fontWeight: 700, color: '#7c3aed' }}>{fmt$(f.reconocido)}</td>}
                        {hayDiferido && <td style={{ ...cellNum, color: f.diferido ? '#a855f7' : '#cbd5e1' }}>{f.diferido ? fmt$(f.diferido) : '—'}</td>}
                        <td style={{ ...cellNum, fontWeight: 700 }}>{fmt$(f.cargado)}</td>
                        <td style={{ ...cellNum, color: f.enSuMes ? '#16a34a' : '#cbd5e1' }}>{f.enSuMes ? fmt$(f.enSuMes) : '—'}</td>
                        <td style={{ ...cellNum, color: f.antes ? '#2563eb' : '#cbd5e1' }}>{f.antes ? fmt$(f.antes) : '—'}</td>
                        <td style={{ ...cellNum, color: f.despues ? '#dc2626' : '#cbd5e1' }}>{f.despues ? fmt$(f.despues) : '—'}</td>
                        <td style={{ ...cellNum, color: f.sinFecha ? '#b45309' : '#cbd5e1' }}>{f.sinFecha ? fmt$(f.sinFecha) : '—'}</td>
                        {hayDescuento && <td style={{ ...cellNum, color: f.descuento ? '#0891b2' : '#cbd5e1' }}>{f.descuento ? fmt$(f.descuento) : '—'}</td>}
                        <td style={{ ...cellNum, color: f.pendiente ? '#d97706' : '#cbd5e1' }}>{f.pendiente ? fmt$(f.pendiente) : '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {f.cuadra
                            ? <CheckCircle size={14} color="#16a34a" />
                            : <span title={`Diferencia ${fmt$(f.dif)}`} style={{ color: '#dc2626', fontSize: 11, fontWeight: 700 }}>{fmt$(f.dif)}</span>}
                        </td>
                      </tr>
                    ))}
                    {!puente.filas.length && (
                      <tr><td colSpan={(hayDiferido ? 10 : 8) + (hayDescuento ? 1 : 0)} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                        Sin cuotas devengadas en {anio} para los módulos seleccionados.
                      </td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                      <td>TOTAL {anio}</td>
                      {hayDiferido && <td style={{ ...cellNum, color: '#7c3aed' }}>{fmt$(puente.tot.reconocido)}</td>}
                      {hayDiferido && <td style={{ ...cellNum, color: '#a855f7' }}>{fmt$(puente.tot.diferido)}</td>}
                      <td style={cellNum}>{fmt$(puente.tot.cargado)}</td>
                      <td style={{ ...cellNum, color: '#16a34a' }}>{fmt$(puente.tot.enSuMes)}</td>
                      <td style={{ ...cellNum, color: '#2563eb' }}>{fmt$(puente.tot.antes)}</td>
                      <td style={{ ...cellNum, color: '#dc2626' }}>{fmt$(puente.tot.despues)}</td>
                      <td style={{ ...cellNum, color: '#b45309' }}>{fmt$(puente.tot.sinFecha)}</td>
                      {hayDescuento && <td style={{ ...cellNum, color: '#0891b2' }}>{fmt$(puente.tot.descuento)}</td>}
                      <td style={{ ...cellNum, color: '#d97706' }}>{fmt$(puente.tot.pendiente)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </>
            )}

            {/* ── TAB 3: libro de ingresos ───────────────────── */}
            {tab === 'ingreso' && (
              <>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
                  Construido sobre <strong>ctrl.recibos_ingreso</strong>, la misma fuente que el Comparativo de
                  Presupuesto: por eso el total de cada mes <strong>sí coincide</strong> con el Estado de Resultados.
                  Es otro libro del mismo dinero que las pestañas anteriores (que salen de las subcuentas de cobranza),
                  así que nunca se suman entre sí.
                  {matrizIngreso.centros.length > 0 && <> Centros incluidos: {matrizIngreso.centros.join(' · ')}.</>}
                  {' '}Ojo: aquí está <strong>todo</strong> el ingreso de esos centros, no solo las cuotas — en Golf
                  eso incluye green fees, torneos y pensiones, que no tienen cartera y por eso no aparecen en las
                  demás pestañas.
                </p>

                {!matrizIngreso.acotado && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                    <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      No se pudo resolver a qué centro de ingreso pertenecen los módulos seleccionados, así que esta
                      pestaña muestra el libro <strong>completo</strong> y no solo esos módulos. Se arregla
                      configurando el producto POS o el concepto de ingreso de sus cuotas.
                    </span>
                  </div>
                )}

                {matrizIngreso.lineaSinDimension && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                    <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      La línea «<strong>{lineaFiltro?.linea}</strong>» no tiene concepto ni sección con que ubicarse en el libro
                      de ingresos, así que el filtro de línea no se aplica en esta pestaña (las demás sí lo respetan).
                    </span>
                  </div>
                )}

                {ingreso && !ingreso.clasificacionDisponible && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                    <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      Las columnas de clasificación aún no existen en la base: falta ejecutar la migración
                      <strong> 20260920180000</strong>. Hasta entonces todo el ingreso aparece como «sin clasificar».
                    </span>
                  </div>
                )}

                {(ingreso?.errores ?? []).map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 10, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{e}</span>
                  </div>
                ))}

                <table id="reporte-table" className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Mes del recibo</th>
                      <th style={{ ...cellNum, color: '#16a34a' }}>Corriente</th>
                      <th style={{ ...cellNum, color: '#dc2626' }}>Vencida</th>
                      <th style={{ ...cellNum, color: '#2563eb' }}>Anticipada</th>
                      <th style={{ ...cellNum, color: '#64748b' }}>Sin clasificar</th>
                      <th style={cellNum}>Ingreso del mes</th>
                      <th style={cellNum}>% clasificado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrizIngreso.porMes.filter(f => f.total !== 0).map(f => (
                      <tr key={f.mes}>
                        <td style={{ fontWeight: 600 }}>{f.label} {anio}</td>
                        <td style={{ ...cellNum, color: f.corriente ? '#16a34a' : '#cbd5e1' }}>{f.corriente ? fmt$(f.corriente) : '—'}</td>
                        <td style={{ ...cellNum, color: f.vencido ? '#dc2626' : '#cbd5e1' }}>{f.vencido ? fmt$(f.vencido) : '—'}</td>
                        <td style={{ ...cellNum, color: f.anticipado ? '#2563eb' : '#cbd5e1' }}>{f.anticipado ? fmt$(f.anticipado) : '—'}</td>
                        <td style={{ ...cellNum, color: f.sinClas ? '#64748b' : '#cbd5e1' }}>{f.sinClas ? fmt$(f.sinClas) : '—'}</td>
                        <td style={{ ...cellNum, fontWeight: 700 }}>{fmt$(f.total)}</td>
                        <td style={cellNum}>{pctStr(f.total - f.sinClas, f.total)}</td>
                      </tr>
                    ))}
                    {matrizIngreso.porMes.every(f => f.total === 0) && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                        Sin recibos de ingreso confirmados en {anio}.
                      </td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                      <td>TOTAL {anio}</td>
                      <td style={{ ...cellNum, color: '#16a34a' }}>{fmt$(matrizIngreso.tot.corriente)}</td>
                      <td style={{ ...cellNum, color: '#dc2626' }}>{fmt$(matrizIngreso.tot.vencido)}</td>
                      <td style={{ ...cellNum, color: '#2563eb' }}>{fmt$(matrizIngreso.tot.anticipado)}</td>
                      <td style={{ ...cellNum, color: '#64748b' }}>{fmt$(matrizIngreso.tot.sinClas)}</td>
                      <td style={cellNum}>{fmt$(matrizIngreso.tot.total)}</td>
                      <td style={cellNum}>{pctStr(matrizIngreso.tot.total - matrizIngreso.tot.sinClas, matrizIngreso.tot.total)}</td>
                    </tr>
                    <tr style={{ background: '#f8fafc', fontSize: 11, color: '#64748b' }}>
                      <td>% del ingreso</td>
                      <td style={cellNum}>{pctStr(matrizIngreso.tot.corriente, matrizIngreso.tot.total)}</td>
                      <td style={cellNum}>{pctStr(matrizIngreso.tot.vencido, matrizIngreso.tot.total)}</td>
                      <td style={cellNum}>{pctStr(matrizIngreso.tot.anticipado, matrizIngreso.tot.total)}</td>
                      <td style={cellNum}>{pctStr(matrizIngreso.tot.sinClas, matrizIngreso.tot.total)}</td>
                      <td style={cellNum}>100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>

                {matrizIngreso.tot.sinClas > 0 && (
                  <p style={{ fontSize: 11, color: '#92400e', marginTop: 8 }}>
                    <strong>{fmt$(matrizIngreso.tot.sinClas)}</strong> sin clasificar
                    ({pctStr(matrizIngreso.tot.sinClas, matrizIngreso.tot.total)} del ingreso).
                    Se captura por recibo en <strong>Ingresos</strong>, activando «Clasificar cobranza» en el
                    desglose por sección. Los conceptos que no son cuotas (deslindes, tags, intereses) se quedan
                    aquí a propósito: no tienen periodo.
                  </p>
                )}
              </>
            )}

            {/* ── TAB 4: cartera por antigüedad ──────────────── */}
            {tab === 'cartera' && (
              <>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
                  Saldo pendiente a hoy por línea y banda de vencimiento. A diferencia de las otras pestañas,
                  esto es un <strong>stock</strong>, no un flujo de un mes: no depende del año seleccionado y no
                  se suma con la composición del cobro. El pendiente se deriva de cargado − cobrado, así que el
                  descuento por pago anticipado no aparece como adeudo.
                </p>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  {cartera.BANDAS_ANT.map(b => (
                    <div key={b.key} className="card" style={{ flex: '1 1 150px', maxWidth: 240, padding: 13, borderColor: b.color + '33' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: b.color, marginBottom: 5 }}>{b.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt0(cartera.totales[b.key] ?? 0)}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                        {pctStr(cartera.totales[b.key] ?? 0, cartera.total)} de la cartera
                      </div>
                    </div>
                  ))}
                </div>

                {cartera.sinVencimiento > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 10,
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                    <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      <strong>{fmt$(cartera.sinVencimiento)}</strong> en {cartera.nSinVenc} cuota(s) sin fecha de
                      vencimiento: no entran en ninguna banda. Se cuentan aparte en vez de asumirles un vencimiento.
                    </span>
                  </div>
                )}

                <table id="reporte-table" className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Módulo</th>
                      <th style={{ textAlign: 'left' }}>Línea / Sección</th>
                      {cartera.BANDAS_ANT.map(b => (
                        <th key={b.key} style={{ ...cellNum, color: b.color }}>{b.label}</th>
                      ))}
                      <th style={cellNum}>Saldo total</th>
                      <th style={cellNum}>Cuotas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartera.filas.map(f => (
                      <tr key={`${f.modulo}-${f.linea}`}>
                        <td style={{ color: MODULO_META[f.modulo].color, fontWeight: 600 }}>{MODULO_META[f.modulo].label}</td>
                        <td>{f.linea}</td>
                        {cartera.BANDAS_ANT.map(b => (
                          <td key={b.key} style={{ ...cellNum, color: (f as any)[b.key] ? b.color : '#cbd5e1' }}>
                            {(f as any)[b.key] ? fmt$((f as any)[b.key]) : '—'}
                          </td>
                        ))}
                        <td style={{ ...cellNum, fontWeight: 700 }}>{fmt$(f.total)}</td>
                        <td style={cellNum}>{f.n}</td>
                      </tr>
                    ))}
                    {!cartera.filas.length && (
                      <tr><td colSpan={cartera.BANDAS_ANT.length + 4} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                        Sin saldo pendiente en los módulos seleccionados.
                      </td></tr>
                    )}
                  </tbody>
                  {cartera.filas.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                        <td colSpan={2}>TOTAL</td>
                        {cartera.BANDAS_ANT.map(b => (
                          <td key={b.key} style={{ ...cellNum, color: b.color }}>{fmt$(cartera.totales[b.key] ?? 0)}</td>
                        ))}
                        <td style={cellNum}>{fmt$(cartera.total)}</td>
                        <td style={cellNum}>{cartera.nCuotas}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </>
            )}

            {/* ── TAB 3: detalle ─────────────────────────────── */}
            {tab === 'detalle' && (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                  {([{ k: '' as const, label: 'Todas' }, ...BANDAS.map(b => ({ k: b, label: BANDA_META[b].label }))]).map(o => (
                    <button key={o.k || 'all'} onClick={() => setBandaFiltro(o.k)}
                      style={{ padding: '6px 11px', fontSize: 12, fontWeight: bandaFiltro === o.k ? 700 : 500, borderRadius: 8, cursor: 'pointer',
                        border: '1px solid', borderColor: bandaFiltro === o.k ? '#2563eb' : '#e2e8f0',
                        background: bandaFiltro === o.k ? '#eff6ff' : '#fff',
                        color: bandaFiltro === o.k ? '#1d4ed8' : '#64748b' }}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <table id="reporte-table" className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Fecha de pago</th>
                      <th style={{ textAlign: 'left' }}>Módulo</th>
                      <th style={{ textAlign: 'left' }}>Línea / Sección</th>
                      <th style={{ textAlign: 'left' }}>Cliente</th>
                      <th style={{ textAlign: 'left' }}>Concepto</th>
                      <th style={{ textAlign: 'left' }}>Periodo</th>
                      <th style={{ textAlign: 'left' }}>Clasificación</th>
                      <th style={cellNum}>Monto</th>
                      {hayCondonacion && <th style={{ ...cellNum, color: '#be185d' }}>Condonado</th>}
                      {hayCondonacion && <th style={{ ...cellNum, color: '#15803d' }}>Caja</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.slice(0, 1500).map(c => (
                      <tr key={c.key}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(c.fechaPago)}</td>
                        <td style={{ color: MODULO_META[c.modulo].color, fontWeight: 600 }}>{MODULO_META[c.modulo].label}</td>
                        <td>{c.linea}</td>
                        <td>{c.cliente}</td>
                        <td style={{ color: '#64748b' }}>{c.concepto}</td>
                        <td style={{ whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{c.periodo ? labelPeriodo(c.periodo) : '—'}</td>
                        <td>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                            background: BANDA_META[c.banda].bg, color: BANDA_META[c.banda].color }}>
                            {BANDA_META[c.banda].label}
                          </span>
                          {c.esCargaInicial && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 6, marginLeft: 4, background: '#f1f5f9', color: '#64748b' }}>
                              carga inicial
                            </span>
                          )}
                        </td>
                        <td style={{ ...cellNum, fontWeight: 600 }}>{fmt$(c.monto)}</td>
                        {hayCondonacion && (
                          <td style={{ ...cellNum, color: c.condonado ? '#be185d' : '#cbd5e1' }}>
                            {c.condonado ? fmt$(c.condonado) : '—'}
                          </td>
                        )}
                        {hayCondonacion && (
                          <td style={{ ...cellNum, color: '#15803d' }}>{fmt$(c.monto - c.condonado)}</td>
                        )}
                      </tr>
                    ))}
                    {!detalle.length && (
                      <tr><td colSpan={hayCondonacion ? 10 : 8} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                        Sin cobros que cumplan los filtros.
                      </td></tr>
                    )}
                  </tbody>
                  {detalle.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                        <td colSpan={7}>
                          TOTAL {detalle.length} aplicación(es)
                          {/* Sin el botón de Excel a la vista, ofrecerlo como salida sería mentir. */}
                          {detalle.length > 1500 && (esSuperadmin
                            ? ' — se muestran las primeras 1,500; el Excel trae todas'
                            : ' — se muestran las primeras 1,500')}
                        </td>
                        <td style={cellNum}>{fmt$(detalle.reduce((a, c) => a + c.monto, 0))}</td>
                        {hayCondonacion && <td style={{ ...cellNum, color: '#be185d' }}>{fmt$(detalle.reduce((a, c) => a + c.condonado, 0))}</td>}
                        {hayCondonacion && <td style={{ ...cellNum, color: '#15803d' }}>{fmt$(detalle.reduce((a, c) => a + c.monto - c.condonado, 0))}</td>}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
