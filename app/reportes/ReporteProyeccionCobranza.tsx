'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf, dbHip, dbCtrl } from '@/lib/supabase'
import { PrintBar } from './utils'
import ModalShell from '@/components/ui/ModalShell'
import { Search, X, TrendingUp, CreditCard, CheckCircle, Clock, CalendarClock, AlertTriangle } from 'lucide-react'
import { clasificarBanda } from '@/lib/clasificacionCobranza'

// ── Proyección de Cobranza — Golf / Pensiones / Hípico / Locales ──────
// Un mismo reporte sirve a los 4 módulos que llevan cuotas con periodo,
// vencimiento y saldo (cxc_golf / cxc_hip / loc_cxc) — cambia solo la
// fuente de datos y cómo se resuelve el nombre del cliente y su "unidad"
// (categoría de socio / caballeriza / propiedad). Mismo patrón que
// ReporteCobranzaCorrienteVencida.tsx.

export type FuenteProyeccion = 'golf' | 'pensiones' | 'hipico' | 'locales'

type Cliente = { nombre: string; numero: string | null; secundario: string | null }

const resolveSocio = (row: any): Cliente => {
  const s = row.cat_socios
  return {
    nombre:     s ? [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ') : '—',
    numero:     s?.numero_socio ?? null,
    secundario: s?.cat_categorias_socios?.nombre ?? null,
  }
}

const resolveArrendatario = (row: any): Cliente => {
  const a = row.cat_arrendatarios
  return {
    nombre:     a ? (a.razon_social || [a.nombre, a.apellido_paterno].filter(Boolean).join(' ')) : '—',
    numero:     null,
    secundario: row.ctrl_asignaciones?.unidad?.clave ?? null,
  }
}

const FUENTE_CFG: Record<FuenteProyeccion, {
  db: typeof dbGolf
  tabla: string
  selectJoin: string
  tipos: string[]           // tipos incluidos en el universo de datos de este reporte
  tiposResumen: string[]    // tipos que aparecen en las tarjetas "KPIs por tipo" (subconjunto de tipos)
  tipoLabels: Record<string, string>
  clienteLabel: string
  secundarioLabel: string
  titulo: string
  printSlug: string
  resolveCliente: (row: any) => Cliente
}> = {
  golf: {
    db: dbGolf, tabla: 'cxc_golf',
    selectJoin: 'cat_socios(numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre))',
    tipos: ['MENSUALIDAD', 'PENSION_CARRITO', 'INSCRIPCION'],
    tiposResumen: ['MENSUALIDAD', 'PENSION_CARRITO'],
    tipoLabels: { MENSUALIDAD: 'Membresía', PENSION_CARRITO: 'Pensión Carrito', INSCRIPCION: 'Inscripción' },
    clienteLabel: 'Socio', secundarioLabel: 'Categoría',
    titulo: 'Proyección de Cobranza — Club Golf', printSlug: 'Proyeccion-Cobranza-Golf',
    resolveCliente: resolveSocio,
  },
  pensiones: {
    db: dbGolf, tabla: 'cxc_golf',
    selectJoin: 'cat_socios(numero_socio, nombre, apellido_paterno, apellido_materno, cat_categorias_socios(nombre))',
    tipos: ['PENSION_CARRITO'],
    tiposResumen: ['PENSION_CARRITO'],
    tipoLabels: { PENSION_CARRITO: 'Pensión Carrito' },
    clienteLabel: 'Socio', secundarioLabel: 'Categoría',
    titulo: 'Proyección de Cobranza — Pensiones de Carritos', printSlug: 'Proyeccion-Cobranza-Pensiones',
    resolveCliente: resolveSocio,
  },
  hipico: {
    db: dbHip, tabla: 'cxc_hip',
    selectJoin: 'cat_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), ctrl_asignaciones(unidad:cat_caballerizas(clave, nombre))',
    tipos: ['RENTA_CABALLERIZA'],
    tiposResumen: ['RENTA_CABALLERIZA'],
    tipoLabels: { RENTA_CABALLERIZA: 'Renta Caballeriza' },
    clienteLabel: 'Arrendatario', secundarioLabel: 'Caballeriza',
    titulo: 'Proyección de Cobranza — Hípico', printSlug: 'Proyeccion-Cobranza-Hipico',
    resolveCliente: resolveArrendatario,
  },
  locales: {
    db: dbCtrl, tabla: 'loc_cxc',
    selectJoin: 'cat_arrendatarios:loc_arrendatarios(nombre, apellido_paterno, razon_social, tipo_persona), ctrl_asignaciones:loc_asignaciones(unidad:loc_propiedades(clave, nombre))',
    tipos: ['RENTA_LOCAL', 'SERVICIOS_MANTTO'],
    tiposResumen: ['RENTA_LOCAL', 'SERVICIOS_MANTTO'],
    tipoLabels: { RENTA_LOCAL: 'Renta Local', SERVICIOS_MANTTO: 'Mantenimiento' },
    clienteLabel: 'Arrendatario', secundarioLabel: 'Propiedad',
    titulo: 'Proyección de Cobranza — Locales Comerciales', printSlug: 'Proyeccion-Cobranza-Locales',
    resolveCliente: resolveArrendatario,
  },
}

type Fila = {
  id: number
  cliente: string
  numero: string | null
  secundario: string | null
  tipo: string
  concepto: string
  monto_cargo: number   // monto_final (lo que se cargó)
  cobrado: number       // lo que ya se pagó
  por_cobrar: number    // saldo pendiente
  status: string
  fecha_vencimiento: string | null
  fecha_pago: string | null
  forma_pago: string | null
}

const fmt$ = (v: number) => '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })
const pct  = (a: number, t: number) => t > 0 ? Math.round((a / t) * 100) : 0

const STATUS_COLOR: Record<string, { bg: string; color: string; label: string }> = {
  PAGADO:       { bg: '#E6E8EB', color: '#1F7A50', label: 'Pagado'       },
  PENDIENTE:    { bg: '#E6E8EB', color: '#A8821A', label: 'Pendiente'    },
  PAGO_PARCIAL: { bg: '#F4F5F7', color: '#C8642A', label: 'Pago Parcial' },
  CANCELADO:    { bg: '#F4F5F7', color: '#62666E', label: 'Cancelado'    },
}

// Genera lista de meses "YYYY-MM" de los últimos 12 meses + próximos 6
function mesesDisponibles() {
  const hoy  = new Date()
  const list: string[] = []
  for (let i = -12; i <= 6; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1)
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return list
}

function labelMes(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })
}

function rangoMes(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-').map(Number)
  const inicio = `${yyyyMM}-01`
  const fin = new Date(y, m, 0).toLocaleDateString('en-CA') // último día del mes
  return { inicio, fin }
}

// ── Flujo de cobranza del mes ────────────────────────────────
// Clasifica los pagos REGISTRADOS dentro del mes (por fecha_pago), sin importar
// a qué período pertenece la cuota — mismo criterio que ReporteCobranzaCorrienteVencida:
//   · Corriente/atrasado cobrado: periodo <= mes de la fecha de pago
//   · Anticipado:                 periodo >  mes de la fecha de pago (se cobró por adelantado)
// El "Vencido" es independiente del mes seleccionado: cuotas pendientes/parciales
// cuya fecha de vencimiento ya pasó a hoy (mismo criterio que ReporteGolfCobranza).
type PagoDia = { fecha: string; monto: number; count: number }

type CobroRow = {
  id: number
  tipo: string
  concepto: string
  periodo: string | null
  monto_final: number
  saldo: number | null
  status: string
  fecha_pago: string | null
  fecha_vencimiento: string | null
  cliente: string
}

// Supabase devuelve 1,000 filas como máximo: sin paginar, un rango de varios
// meses (Golf: ~3,300 pagos ene–nov) dejaba las tarjetas cortas.
async function todasLasFilas(q: () => any): Promise<{ data: any[]; error: any }> {
  const out: any[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await q().range(desde, desde + 999)
    if (error) return { data: out, error }
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return { data: out, error: null }
  }
}

const montoPagado = (c: CobroRow) =>
  c.status === 'PAGADO' ? c.monto_final : c.monto_final - (c.saldo ?? 0)

export default function ReporteProyeccionCobranza({ fuente = 'golf' }: { fuente?: FuenteProyeccion }) {
  const cfg = FUENTE_CFG[fuente]
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  const [mes, setMes]               = useState(mesActual)
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS')
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'PENDIENTE' | 'PAGADO'>('TODOS')
  const [busqueda, setBusqueda]     = useState('')
  const [clienteSel, setClienteSel] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQ, setPickerQ]       = useState('')
  const [filasAll, setFilas]        = useState<Fila[]>([])
  const [loading, setLoading]       = useState(false)

  // Reset de filtros locales al cambiar de fuente (evita quedarse con un tipo
  // seleccionado que no existe en el nuevo módulo)
  useEffect(() => { setFiltroTipo('TODOS'); setFiltroStatus('TODOS'); setBusqueda(''); setClienteSel(null) }, [fuente])

  // Flujo de cobranza del mes (cobrado / anticipado / vencido)
  const [cobrosMesAll, setCobrosMes] = useState<CobroRow[]>([])
  const [vencidosAll, setVencidos]   = useState<CobroRow[]>([])
  // Cartera vencida al corte (cierre del mes «Al mes» del flujo, que por default
  // sigue al «Período (mes)» general).
  const [vencidosCorteAll, setVencidosCorte] = useState<(CobroRow & { saldo_corte: number })[]>([])
  const [loadingFlujo, setLoadingFlujo] = useState(false)

  // Rango propio del Flujo de Cobranza ('YYYY-MM'). Mientras no se toque, sigue
  // al «Período (mes)» general; al cambiar éste se vuelve a alinear. El resto de
  // la pantalla (proyección, cuotas del período) sigue usando un solo mes.
  const [flujoDesdeSel, setFlujoDesdeSel] = useState<string | null>(null)
  const [flujoHastaSel, setFlujoHastaSel] = useState<string | null>(null)
  useEffect(() => { setFlujoDesdeSel(null); setFlujoHastaSel(null) }, [mes])
  const flujoDesde = flujoDesdeSel ?? mes
  const flujoHasta = flujoHastaSel ?? mes
  const flujoTxt = flujoDesde === flujoHasta ? labelMes(flujoDesde)
    : `${labelMes(flujoDesde)} a ${labelMes(flujoHasta)}`

  const fetchFlujo = useCallback(async () => {
    setLoadingFlujo(true)
    const inicio = rangoMes(flujoDesde).inicio
    const fin    = rangoMes(flujoHasta).fin
    const hoyStr = new Date().toLocaleDateString('en-CA')
    const selectCols = `id, tipo, concepto, periodo, monto_final, saldo, status, fecha_pago, fecha_vencimiento, ${cfg.selectJoin}`

    const [{ data: dCobros }, { data: dVencidos }, { data: dCorte }] = await Promise.all([
      todasLasFilas(() => cfg.db.from(cfg.tabla).select(selectCols)
        .in('tipo', cfg.tipos)
        .neq('status', 'CANCELADO')
        .gte('fecha_pago', inicio)
        .lte('fecha_pago', fin)
        .order('fecha_pago').order('id')),
      todasLasFilas(() => cfg.db.from(cfg.tabla).select(selectCols)
        .in('tipo', cfg.tipos)
        .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
        .lt('fecha_vencimiento', hoyStr)
        .order('fecha_vencimiento').order('id')),
      // Vencidas al corte: vencimiento <= fin de mes y que a esa fecha seguían
      // sin cobrar — hoy pendientes/parciales, o pagadas DESPUÉS del corte.
      todasLasFilas(() => cfg.db.from(cfg.tabla).select(selectCols)
        .in('tipo', cfg.tipos)
        .neq('status', 'CANCELADO')
        .lte('fecha_vencimiento', fin)
        .or(`status.in.(PENDIENTE,PAGO_PARCIAL),fecha_pago.gt.${fin}`)
        .order('fecha_vencimiento').order('id')),
    ])

    const normalizar = (rows: any[]): CobroRow[] => rows.map(r => ({
      id: r.id, tipo: r.tipo, concepto: r.concepto, periodo: r.periodo,
      monto_final: r.monto_final, saldo: r.saldo, status: r.status,
      fecha_pago: r.fecha_pago, fecha_vencimiento: r.fecha_vencimiento,
      cliente: cfg.resolveCliente(r).nombre,
    }))

    setCobrosMes(normalizar((dCobros as any[]) ?? []))
    setVencidos(normalizar((dVencidos as any[]) ?? []))
    // Saldo al corte: si el (último) pago fue después del corte, a esa fecha se
    // debía el cargo completo; si no, el saldo vigente. No hay historial de
    // abonos por cuota en las 4 fuentes, así que una cuota con abono parcial
    // antes del corte y liquidada después se cuenta por su monto total.
    setVencidosCorte(normalizar((dCorte as any[]) ?? []).map(c => ({
      ...c,
      saldo_corte: c.fecha_pago && c.fecha_pago > fin ? c.monto_final : (c.saldo ?? c.monto_final),
    })))
    setLoadingFlujo(false)
  }, [flujoDesde, flujoHasta, cfg])

  useEffect(() => { fetchFlujo() }, [fetchFlujo])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await todasLasFilas(() => cfg.db
      .from(cfg.tabla)
      .select(`id, tipo, concepto, periodo, monto_original, descuento, monto_final, saldo,
        status, fecha_vencimiento, fecha_pago, forma_pago, ${cfg.selectJoin}`)
      .eq('periodo', mes)
      .in('tipo', cfg.tipos)
      .neq('status', 'CANCELADO')
      .order('status').order('id'))

    const rows = (data as any[]) ?? []

    setFilas(rows.map(c => {
      const cobrado    = c.status === 'PAGADO' ? c.monto_final
                       : c.status === 'PAGO_PARCIAL' ? c.monto_final - (c.saldo ?? 0)
                       : 0
      const por_cobrar = c.status === 'PAGADO' ? 0
                       : c.status === 'PAGO_PARCIAL' ? (c.saldo ?? 0)
                       : c.monto_final
      const cli = cfg.resolveCliente(c)
      return {
        id:               c.id,
        cliente:          cli.nombre,
        numero:           cli.numero,
        secundario:       cli.secundario,
        tipo:             c.tipo,
        concepto:         c.concepto,
        monto_cargo:      c.monto_final,
        cobrado,
        por_cobrar,
        status:           c.status,
        fecha_vencimiento: c.fecha_vencimiento,
        fecha_pago:       c.fecha_pago,
        forma_pago:       c.forma_pago,
      }
    }))
    setLoading(false)
  }, [mes, cfg])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtro por cliente (popup): acota filas, KPIs y flujo
  const filas     = clienteSel ? filasAll.filter(f => f.cliente === clienteSel) : filasAll
  const cobrosMes = clienteSel ? cobrosMesAll.filter(c => c.cliente === clienteSel) : cobrosMesAll
  const vencidos  = clienteSel ? vencidosAll.filter(c => c.cliente === clienteSel) : vencidosAll
  const vencidosCorte = clienteSel ? vencidosCorteAll.filter(c => c.cliente === clienteSel) : vencidosCorteAll
  const clientesOpc = Array.from(new Set([...filasAll, ...cobrosMesAll, ...vencidosAll].map(r => r.cliente).filter(c => c && c !== '—')))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .filter(c => !pickerQ.trim() || c.toLowerCase().includes(pickerQ.trim().toLowerCase()))

  // Filtros locales (rápidos, sin ir a BD)
  const filtradas = filas.filter(f => {
    if (filtroTipo !== 'TODOS' && f.tipo !== filtroTipo) return false
    if (filtroStatus === 'PENDIENTE' && f.status === 'PAGADO') return false
    if (filtroStatus === 'PAGADO'    && f.status !== 'PAGADO') return false
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      if (!f.cliente.toLowerCase().includes(q) && !(f.numero ?? '').includes(q) && !f.concepto.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Fecha de corte = cierre del «Al mes» del flujo (por default sigue al
  // «Período (mes)»). Las tarjetas generales se calculan A ESA FECHA: lo cobrado
  // después del corte cuenta como por cobrar. No hay historial de abonos por
  // cuota, así que una cuota con abono parcial antes del corte y liquidada
  // después se toma como no cobrada al corte (mismo criterio que la cartera).
  const corteFin   = rangoMes(flujoHasta).fin
  const corteTxt   = new Date(corteFin + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  const corteFuturo = corteFin >= new Date().toLocaleDateString('en-CA')
  const cobradoCorte = (f: Fila) => (f.fecha_pago && f.fecha_pago <= corteFin ? f.cobrado : 0)
  const pagadaCorte  = (f: Fila) => f.status === 'PAGADO' && !!f.fecha_pago && f.fecha_pago <= corteFin

  // KPIs sobre el total sin filtro de status/tipo para mostrar el panorama completo
  const totalCargo    = filas.reduce((a, f) => a + f.monto_cargo,  0)
  const totalCobrado  = filas.reduce((a, f) => a + cobradoCorte(f), 0)
  const totalPendiente= totalCargo - totalCobrado
  const countPagadas  = filas.filter(pagadaCorte).length
  const countPend     = filas.length - countPagadas
  const avancePct     = pct(totalCobrado, totalCargo)

  // KPIs por tipo (también al corte)
  const porTipo = cfg.tiposResumen.map(t => {
    const ft = filas.filter(f => f.tipo === t)
    const cargo = ft.reduce((a, f) => a + f.monto_cargo, 0)
    const cobrado = ft.reduce((a, f) => a + cobradoCorte(f), 0)
    return {
      tipo: t, label: cfg.tipoLabels[t] ?? t, cargo, cobrado,
      pendiente: cargo - cobrado,
      total: ft.length,
      pagadas: ft.filter(pagadaCorte).length,
    }
  })

  // Del "Cobrado" del período, cuánto entró de banco EN este mes vs cuánto ya
  // se había cobrado antes (pago anualizado/adelantado hecho en meses previos:
  // ej. un cliente paga en enero varios meses por adelantado — esas cuotas de
  // meses futuros quedan PAGADAS pero el banco no recibe nada nuevo cuando
  // llega ese mes).
  const cobradoEnMesRows = filas.filter(f => cobradoCorte(f) > 0 && f.fecha_pago!.slice(0, 7) === mes)
  const cobradoAntesRows = filas.filter(f => cobradoCorte(f) > 0 && f.fecha_pago!.slice(0, 7) < mes)
  const totalCobradoEnMes = cobradoEnMesRows.reduce((a, f) => a + f.cobrado, 0)
  const totalCobradoAntes = cobradoAntesRows.reduce((a, f) => a + f.cobrado, 0)

  // ── Flujo de cobranza: cobrado del mes / anticipado / vencido ──
  // Clasificación a 4 bandas desde lib/clasificacionCobranza (fuente única).
  // Antes este bloque hacía `periodo <= mes` y metía la recuperación de vencido
  // DENTRO de corriente, así que el panel no distinguía el desempeño del mes de
  // la recuperación de cartera — justo la mezcla que este reporte debe separar.
  const totalCobradoMesFlujo = cobrosMes.reduce((a, c) => a + montoPagado(c), 0)
  const bandaDe = (c: CobroRow) => clasificarBanda(c.periodo, c.fecha_pago ?? '')
  const corrienteRows    = cobrosMes.filter(c => bandaDe(c) === 'CORRIENTE')
  const vencidaRows      = cobrosMes.filter(c => bandaDe(c) === 'VENCIDA')
  const anticipadoRows   = cobrosMes.filter(c => bandaDe(c) === 'ANTICIPADA')
  const otrosRows        = cobrosMes.filter(c => bandaDe(c) === 'OTROS')
  const totalCorriente   = corrienteRows.reduce((a, c) => a + montoPagado(c), 0)
  const totalVencidaRec  = vencidaRows.reduce((a, c) => a + montoPagado(c), 0)
  const totalAnticipado  = anticipadoRows.reduce((a, c) => a + montoPagado(c), 0)
  const totalOtros       = otrosRows.reduce((a, c) => a + montoPagado(c), 0)
  // Ojo: este es un SALDO a hoy (stock de cartera), no un flujo del mes — no
  // suma con los anteriores. Va rotulado como tal en la UI.
  const totalVencidoFlujo = vencidos.reduce((a, c) => a + (c.saldo ?? c.monto_final), 0)
  const totalVencidoCorte = vencidosCorte.reduce((a, c) => a + c.saldo_corte, 0)

  const porDia = cobrosMes.reduce((acc, c) => {
    const f = c.fecha_pago ?? '—'
    if (!acc[f]) acc[f] = { fecha: f, monto: 0, count: 0 }
    acc[f].monto += montoPagado(c)
    acc[f].count += 1
    return acc
  }, {} as Record<string, PagoDia>)
  const desglosePorDia = Object.values(porDia).sort((a, b) => a.fecha.localeCompare(b.fecha))

  const meses = mesesDisponibles()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Selector de mes */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#4A4D54', display: 'block', marginBottom: 4 }}>Período (mes)</label>
          <select
            value={mes}
            onChange={e => setMes(e.target.value)}
            style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #E6E8EB', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', minWidth: 200, textTransform: 'capitalize' }}>
            {meses.map(m => (
              <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{labelMes(m)}</option>
            ))}
          </select>
        </div>

        {/* Tipo (solo si el módulo tiene más de un tipo de cuota) */}
        {cfg.tipos.length > 1 && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#4A4D54', display: 'block', marginBottom: 4 }}>Tipo de cuota</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ key: 'TODOS', label: 'Todos' }, ...cfg.tipos.map(t => ({ key: t, label: cfg.tipoLabels[t] ?? t }))].map(o => (
                <button key={o.key} onClick={() => setFiltroTipo(o.key)}
                  style={{ padding: '7px 12px', fontSize: 12, fontWeight: filtroTipo === o.key ? 700 : 500, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: filtroTipo === o.key ? '#1C1D21' : '#E6E8EB', background: filtroTipo === o.key ? '#F4F5F7' : '#fff', color: filtroTipo === o.key ? '#26282D' : '#62666E' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#4A4D54', display: 'block', marginBottom: 4 }}>Status</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'TODOS',     label: 'Todos'      },
              { key: 'PENDIENTE', label: 'Por cobrar' },
              { key: 'PAGADO',    label: 'Cobrados'   },
            ] as const).map(o => (
              <button key={o.key} onClick={() => setFiltroStatus(o.key)}
                style={{ padding: '7px 12px', fontSize: 12, fontWeight: filtroStatus === o.key ? 700 : 500, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: filtroStatus === o.key ? '#267F56' : '#E6E8EB', background: filtroStatus === o.key ? '#F4F5F7' : '#fff', color: filtroStatus === o.key ? '#1F7A50' : '#62666E' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cliente (popup) */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#4A4D54', display: 'block', marginBottom: 4 }}>{cfg.clienteLabel}</label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => { setPickerQ(''); setPickerOpen(true) }}
              style={{ padding: '8px 12px', fontSize: 13, border: '1px solid', borderColor: clienteSel ? '#1C1D21' : '#E6E8EB', borderRadius: 8, background: clienteSel ? '#F4F5F7' : '#fff', color: clienteSel ? '#26282D' : '#62666E', fontFamily: 'inherit', cursor: 'pointer', minWidth: 200, maxWidth: 280, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              <Search size={13} /> {clienteSel ?? `Todos los ${cfg.clienteLabel.toLowerCase()}s`}
            </button>
            {clienteSel && (
              <button onClick={() => setClienteSel(null)} title="Quitar filtro"
                style={{ padding: '8px 10px', border: '1px solid #E6E8EB', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#62666E' }}>
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Búsqueda */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#4A4D54', display: 'block', marginBottom: 4 }}>Buscar {cfg.clienteLabel.toLowerCase()}</label>
          <input
            style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #E6E8EB', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
            placeholder={`Nombre${cfg.clienteLabel === 'Socio' ? ', No. socio…' : '…'}`}
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <PrintBar
          title={`${cfg.printSlug} — ${labelMes(mes)}`}
          count={filtradas.length}
          reportTitle={`${cfg.titulo} — ${labelMes(mes)}`}
        />
      </div>


      {pickerOpen && (
        <ModalShell modulo={fuente === 'hipico' ? 'hipico' : fuente === 'locales' ? 'locales' : 'golf'} titulo={`Filtrar por ${cfg.clienteLabel.toLowerCase()}`} onClose={() => setPickerOpen(false)}>
          <input autoFocus placeholder="Buscar nombre…" value={pickerQ} onChange={e => setPickerQ(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #E6E8EB', borderRadius: 8, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, marginBottom: 10 }} />
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button onClick={() => { setClienteSel(null); setPickerOpen(false) }}
              style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13, border: 'none', borderRadius: 6, background: !clienteSel ? '#F4F5F7' : 'transparent', fontWeight: !clienteSel ? 700 : 500, cursor: 'pointer', color: '#33363C' }}>
              Todos
            </button>
            {clientesOpc.map(c => (
              <button key={c} onClick={() => { setClienteSel(c); setPickerOpen(false) }}
                style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13, border: 'none', borderRadius: 6, background: clienteSel === c ? '#F4F5F7' : 'transparent', fontWeight: clienteSel === c ? 700 : 500, cursor: 'pointer', color: '#33363C' }}>
                {c}
              </button>
            ))}
            {clientesOpc.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#7A7E87' }}>Sin resultados</div>}
          </div>
        </ModalShell>
      )}

      {/* ── KPIs generales ──────────────────────────────────── */}
      {!loading && filas.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Total cargado',   value: fmt$(totalCargo),    sub: `${filas.length} cuota${filas.length !== 1 ? 's' : ''}`, color: '#1C1D21', bg: '#F4F5F7', icon: CreditCard  },
              { label: corteFuturo ? 'Cobrado' : `Cobrado al ${corteTxt}`,    value: fmt$(totalCobrado),  sub: `${countPagadas} pagada${countPagadas !== 1 ? 's' : ''}`, color: '#1F7A50', bg: '#F4F5F7', icon: CheckCircle },
              { label: corteFuturo ? 'Por cobrar' : `Por cobrar al ${corteTxt}`, value: fmt$(totalPendiente),sub: `${countPend} pendiente${countPend !== 1 ? 's' : ''}`,  color: '#B5761A', bg: '#F4F5F7', icon: Clock        },
              { label: 'Avance',          value: `${avancePct}%`,     sub: corteFuturo ? 'del total cargado' : `del total cargado, al ${corteTxt}`, color: '#6B4E79', bg: '#F4F5F7', icon: TrendingUp   },
            ].map(k => {
              const Icon = k.icon
              return (
                <div key={k.label} style={{ flex: '1 1 150px', maxWidth: 220, padding: '14px 18px', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <Icon size={14} style={{ color: k.color }} />
                    <span style={{ fontSize: 11, color: '#62666E', fontWeight: 600 }}>{k.label}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: '#7A7E87', marginTop: 4 }}>{k.sub}</div>
                </div>
              )
            })}
          </div>

          {/* Barra de avance */}
          <div style={{ background: '#F4F5F7', borderRadius: 8, height: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${avancePct}%`, background: avancePct >= 80 ? '#1F7A50' : avancePct >= 50 ? '#B5761A' : '#C23B3B', borderRadius: 8, transition: 'width 0.4s' }} />
          </div>

          {/* Aclaración: no todo lo "Cobrado" de este período entró de banco este mes —
              pagos anualizados/adelantados hechos en meses anteriores ya dejan estas
              cuotas en PAGADO sin que haya movimiento bancario nuevo en {mes}. */}
          {totalCobradoAntes > 0 && (
            <div style={{ fontSize: 11, color: '#62666E', background: '#F8F9FA', border: '1px solid #E6E8EB', borderRadius: 8, padding: '8px 12px' }}>
              De lo <strong style={{ color: '#1F7A50' }}>cobrado</strong> en {labelMes(mes)}: <strong style={{ color: '#1F7A50' }}>{fmt$(totalCobradoEnMes)}</strong> entró de banco durante {labelMes(mes)}
              {' '}· <strong style={{ color: '#1C1D21' }}>{fmt$(totalCobradoAntes)}</strong> ya se había cobrado antes ({cobradoAntesRows.length} cuota{cobradoAntesRows.length !== 1 ? 's' : ''} de pago anualizado/adelantado) — no representa entrada de banco en {labelMes(mes)}.
            </div>
          )}

          {/* KPIs por tipo */}
          {porTipo.filter(t => t.total > 0).length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {porTipo.filter(t => t.total > 0).map(t => (
                <div key={t.tipo} style={{ padding: '14px 16px', background: '#F8F9FA', border: '1px solid #E6E8EB', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#4A4D54', marginBottom: 10 }}>{t.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                    {[
                      { label: 'Cargo',    value: fmt$(t.cargo),    color: '#1C1D21' },
                      { label: 'Cobrado',  value: fmt$(t.cobrado),  color: '#1F7A50' },
                      { label: 'Pendiente',value: fmt$(t.pendiente),color: '#B5761A' },
                    ].map(col => (
                      <div key={col.label}>
                        <div style={{ fontSize: 10, color: '#7A7E87', marginBottom: 2 }}>{col.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: col.color }}>{col.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#7A7E87' }}>
                    {t.pagadas} de {t.total} pagadas · {pct(t.cobrado, t.cargo)}% cobrado
                  </div>
                  <div style={{ marginTop: 4, background: '#E6E8EB', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct(t.cobrado, t.cargo)}%`, background: '#1F7A50', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Flujo de Cobranza: cobrado del mes / anticipado / vencido ── */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#33363C', margin: '4px 0 10px' }}>
          Flujo de Cobranza — {flujoTxt}
        </h3>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#4A4D54', display: 'block', marginBottom: 4 }}>Del mes</label>
            <select className="select" value={flujoDesde}
              onChange={e => { setFlujoDesdeSel(e.target.value); if (e.target.value > flujoHasta) setFlujoHastaSel(e.target.value) }}>
              {meses.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{labelMes(m)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#4A4D54', display: 'block', marginBottom: 4 }}>Al mes</label>
            <select className="select" value={flujoHasta}
              onChange={e => { setFlujoHastaSel(e.target.value); if (e.target.value < flujoDesde) setFlujoDesdeSel(e.target.value) }}>
              {meses.map(m => <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{labelMes(m)}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: flujoDesde === flujoHasta ? 'Cobrado del mes' : 'Cobrado del periodo', value: fmt$(totalCobradoMesFlujo), sub: `${cobrosMes.length} pago${cobrosMes.length !== 1 ? 's' : ''} registrado${cobrosMes.length !== 1 ? 's' : ''}`, color: '#1F7A50', bg: '#F4F5F7', icon: CheckCircle },
            { label: flujoDesde === flujoHasta ? 'Corriente del mes' : 'Corriente', value: fmt$(totalCorriente),    sub: `${corrienteRows.length} cuota${corrienteRows.length !== 1 ? 's' : ''} de su propio mes de cobro`, color: '#267F56', bg: '#F4F5F7', icon: CheckCircle },
            { label: 'Vencido recuperado', value: fmt$(totalVencidaRec),  sub: `${vencidaRows.length} de periodos anteriores`,        color: '#C8642A', bg: '#F4F5F7', icon: Clock },
            { label: 'Anticipado',      value: fmt$(totalAnticipado),      sub: `${anticipadoRows.length} de periodos futuros`,       color: '#1C1D21', bg: '#F4F5F7', icon: CalendarClock },
            { label: `Cartera vencida al ${corteTxt}`, value: fmt$(totalVencidoCorte), sub: `${vencidosCorte.length} cuota${vencidosCorte.length !== 1 ? 's' : ''} vencida${vencidosCorte.length !== 1 ? 's' : ''} sin cobrar al cierre de ${labelMes(flujoHasta)}${corteFuturo ? ' (proyectado si no se cobra)' : ''}`, color: '#A83232', bg: '#F4F5F7', icon: AlertTriangle },
            { label: 'Cartera vencida (saldo a hoy)', value: fmt$(totalVencidoFlujo), sub: `${vencidos.length} cuota${vencidos.length !== 1 ? 's' : ''} sin cobrar — es un saldo, no flujo del mes`, color: '#C23B3B', bg: '#F4F5F7', icon: AlertTriangle },
          ].map(k => {
            const Icon = k.icon
            return (
              <div key={k.label} style={{ flex: '1 1 180px', maxWidth: 260, padding: '14px 18px', background: '#fff', border: '1px solid #E6E8EB', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <Icon size={14} style={{ color: k.color }} />
                  <span style={{ fontSize: 11, color: '#62666E', fontWeight: 600 }}>{k.label}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', lineHeight: 1 }}>{loadingFlujo ? '…' : k.value}</div>
                <div style={{ fontSize: 11, color: '#7A7E87', marginTop: 4 }}>{k.sub}</div>
              </div>
            )
          })}
        </div>

        {!loadingFlujo && cobrosMes.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: '#62666E', marginBottom: 8 }}>
              De lo cobrado en el periodo: <strong style={{ color: '#267F56' }}>{fmt$(totalCorriente)}</strong> del propio mes de cobro (desempeño)
              {' '}· <strong style={{ color: '#C8642A' }}>{fmt$(totalVencidaRec)}</strong> de periodos anteriores (recuperación de cartera)
              {' '}· <strong style={{ color: '#1C1D21' }}>{fmt$(totalAnticipado)}</strong> de periodos futuros (adelantado)
              {totalOtros > 0 && <> · <strong style={{ color: '#62666E' }}>{fmt$(totalOtros)}</strong> sin periodo</>}
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: '#F8F9FA', borderBottom: '1px solid #E6E8EB' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#4A4D54' }}>Desglose por fecha de cobro</span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F4F5F7', borderBottom: '2px solid #E6E8EB' }}>
                      {['Fecha de cobro', 'Cuotas', 'Monto cobrado'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Monto cobrado' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#4A4D54', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {desglosePorDia.map(d => (
                      <tr key={d.fecha} style={{ borderBottom: '1px solid #F4F5F7' }}>
                        <td style={{ padding: '8px 14px', color: '#26282D' }}>
                          {d.fecha !== '—' ? new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', color: '#62666E' }}>{d.count}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#1F7A50' }}>{fmt$(d.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F8F9FA', borderTop: '2px solid #E6E8EB', fontWeight: 700 }}>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: '#4A4D54' }}>Total</td>
                      <td style={{ padding: '8px 14px', color: '#4A4D54' }}>{cobrosMes.length}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#1F7A50' }}>{fmt$(totalCobradoMesFlujo)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {!loadingFlujo && vencidos.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: '#F4F5F7', borderBottom: '1px solid #E6E8EB' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#A83232' }}>Cuotas vencidas sin cobrar (a la fecha de hoy)</span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F4F5F7', borderBottom: '2px solid #E6E8EB' }}>
                      {[cfg.clienteLabel, 'Concepto', 'Período', 'Vencimiento', 'Saldo'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Saldo' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#4A4D54', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vencidos.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #F4F5F7' }}>
                        <td style={{ padding: '8px 14px', color: '#26282D' }}>{c.cliente}</td>
                        <td style={{ padding: '8px 14px', color: '#4A4D54' }}>{c.concepto}</td>
                        <td style={{ padding: '8px 14px', color: '#62666E', fontVariantNumeric: 'tabular-nums' }}>{c.periodo ?? '—'}</td>
                        <td style={{ padding: '8px 14px', color: '#C23B3B', fontWeight: 600 }}>
                          {c.fecha_vencimiento ? new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#C23B3B' }}>{fmt$(c.saldo ?? c.monto_final)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F4F5F7', borderTop: '2px solid #E6E8EB', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '8px 14px', fontSize: 12, color: '#A83232' }}>Total vencido ({vencidos.length})</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#A83232' }}>{fmt$(totalVencidoFlujo)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabla detalle ─────────────────────────────────── */}
      <div id="reporte-print-area">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: '#F8F9FA', borderBottom: '1px solid #E6E8EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4A4D54' }}>
              {loading ? 'Cargando…' : `${filtradas.length} cuota${filtradas.length !== 1 ? 's' : ''}`}
              {filtroTipo !== 'TODOS' && <span style={{ fontWeight: 400, color: '#7A7E87', marginLeft: 6 }}>· {cfg.tipoLabels[filtroTipo] ?? filtroTipo}</span>}
            </span>
            {!loading && filtradas.length > 0 && (
              <span style={{ fontSize: 12, color: '#62666E' }}>
                Cobrado: <strong style={{ color: '#1F7A50' }}>{fmt$(filtradas.reduce((a, f) => a + f.cobrado, 0))}</strong>
                {' '}· Por cobrar: <strong style={{ color: '#B5761A' }}>{fmt$(filtradas.reduce((a, f) => a + f.por_cobrar, 0))}</strong>
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F4F5F7', borderBottom: '2px solid #E6E8EB' }}>
                  {(cfg.clienteLabel === 'Socio' ? ['No.'] : []).concat([cfg.clienteLabel, cfg.secundarioLabel, 'Tipo', 'Concepto', 'Cargo', 'Cobrado', 'Por cobrar', 'Status', 'Vencimiento', 'F. Pago', 'Forma Pago']).map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: h === 'Cargo' || h === 'Cobrado' || h === 'Por cobrar' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#4A4D54', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#7A7E87' }}>Cargando…</td></tr>
                ) : filtradas.length === 0 ? (
                  <tr><td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#7A7E87' }}>Sin cuotas para el período seleccionado</td></tr>
                ) : (
                  filtradas.map(f => {
                    const sc = STATUS_COLOR[f.status] ?? { bg: '#F4F5F7', color: '#62666E', label: f.status }
                    const venc = f.fecha_vencimiento && f.fecha_vencimiento < new Date().toLocaleDateString('en-CA') && f.status !== 'PAGADO'
                    return (
                      <tr key={f.id} style={{ borderBottom: '1px solid #F4F5F7' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8F9FA'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                        {cfg.clienteLabel === 'Socio' && (
                          <td style={{ padding: '9px 10px', color: '#7A7E87', fontVariantNumeric: 'tabular-nums', fontSize: 11, whiteSpace: 'nowrap' }}>
                            {f.numero ?? '—'}
                          </td>
                        )}
                        <td style={{ padding: '9px 10px', fontWeight: 500, color: '#26282D', whiteSpace: 'nowrap' }}>
                          {f.cliente}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#62666E', whiteSpace: 'nowrap' }}>
                          {f.secundario ?? '—'}
                        </td>
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#F4F5F7', color: '#1C1D21' }}>
                            {cfg.tipoLabels[f.tipo] ?? f.tipo}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: '#4A4D54' }}>{f.concepto}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#26282D', whiteSpace: 'nowrap' }}>
                          {fmt$(f.monto_cargo)}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#1F7A50', whiteSpace: 'nowrap' }}>
                          {f.cobrado > 0 ? fmt$(f.cobrado) : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: f.por_cobrar > 0 ? '#B5761A' : '#7A7E87', whiteSpace: 'nowrap' }}>
                          {f.por_cobrar > 0 ? fmt$(f.por_cobrar) : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.color, color: '#fff'}}>
                            {sc.label}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: venc ? '#C23B3B' : '#62666E', fontWeight: venc ? 600 : 400, whiteSpace: 'nowrap', fontSize: 11 }}>
                          {f.fecha_vencimiento
                            ? new Date(f.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                          {venc && <AlertTriangle size={11} style={{ marginLeft: 4, verticalAlign: -1 }} />}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#62666E', whiteSpace: 'nowrap', fontSize: 11 }}>
                          {f.fecha_pago
                            ? new Date(f.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                          {f.fecha_pago && f.fecha_pago.slice(0, 7) < mes && (
                            <span title="Cobrado antes de este período — no es entrada de banco nueva en este mes" style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 20, background: '#E6E8EB', color: '#1C1D21' }}>
                              anticipo
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#62666E', fontSize: 11 }}>
                          {f.forma_pago ?? '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!loading && filtradas.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#F8F9FA', borderTop: '2px solid #E6E8EB', fontWeight: 700 }}>
                    <td colSpan={cfg.clienteLabel === 'Socio' ? 5 : 4} style={{ padding: '10px 10px', fontSize: 12, color: '#4A4D54' }}>
                      Total ({filtradas.length} cuotas)
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#26282D' }}>
                      {fmt$(filtradas.reduce((a, f) => a + f.monto_cargo, 0))}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#1F7A50' }}>
                      {fmt$(filtradas.reduce((a, f) => a + f.cobrado, 0))}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#B5761A' }}>
                      {fmt$(filtradas.reduce((a, f) => a + f.por_cobrar, 0))}
                    </td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
