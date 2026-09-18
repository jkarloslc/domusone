'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbGolf, dbHip, dbCtrl } from '@/lib/supabase'
import { PrintBar } from './utils'
import { TrendingUp, CreditCard, CheckCircle, Clock, CalendarClock, AlertTriangle } from 'lucide-react'

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
  PAGADO:       { bg: '#dcfce7', color: '#15803d', label: 'Pagado'       },
  PENDIENTE:    { bg: '#fef9c3', color: '#ca8a04', label: 'Pendiente'    },
  PAGO_PARCIAL: { bg: '#fff7ed', color: '#ea580c', label: 'Pago Parcial' },
  CANCELADO:    { bg: '#f1f5f9', color: '#64748b', label: 'Cancelado'    },
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
  const [filas, setFilas]           = useState<Fila[]>([])
  const [loading, setLoading]       = useState(false)

  // Reset de filtros locales al cambiar de fuente (evita quedarse con un tipo
  // seleccionado que no existe en el nuevo módulo)
  useEffect(() => { setFiltroTipo('TODOS'); setFiltroStatus('TODOS'); setBusqueda('') }, [fuente])

  // Flujo de cobranza del mes (cobrado / anticipado / vencido)
  const [cobrosMes, setCobrosMes]   = useState<CobroRow[]>([])
  const [vencidos, setVencidos]     = useState<CobroRow[]>([])
  const [loadingFlujo, setLoadingFlujo] = useState(false)

  const fetchFlujo = useCallback(async () => {
    setLoadingFlujo(true)
    const { inicio, fin } = rangoMes(mes)
    const hoyStr = new Date().toLocaleDateString('en-CA')
    const selectCols = `id, tipo, concepto, periodo, monto_final, saldo, status, fecha_pago, fecha_vencimiento, ${cfg.selectJoin}`

    const [{ data: dCobros }, { data: dVencidos }] = await Promise.all([
      cfg.db.from(cfg.tabla).select(selectCols)
        .in('tipo', cfg.tipos)
        .neq('status', 'CANCELADO')
        .gte('fecha_pago', inicio)
        .lte('fecha_pago', fin)
        .order('fecha_pago'),
      cfg.db.from(cfg.tabla).select(selectCols)
        .in('tipo', cfg.tipos)
        .in('status', ['PENDIENTE', 'PAGO_PARCIAL'])
        .lt('fecha_vencimiento', hoyStr)
        .order('fecha_vencimiento'),
    ])

    const normalizar = (rows: any[]): CobroRow[] => rows.map(r => ({
      id: r.id, tipo: r.tipo, concepto: r.concepto, periodo: r.periodo,
      monto_final: r.monto_final, saldo: r.saldo, status: r.status,
      fecha_pago: r.fecha_pago, fecha_vencimiento: r.fecha_vencimiento,
      cliente: cfg.resolveCliente(r).nombre,
    }))

    setCobrosMes(normalizar((dCobros as any[]) ?? []))
    setVencidos(normalizar((dVencidos as any[]) ?? []))
    setLoadingFlujo(false)
  }, [mes, cfg])

  useEffect(() => { fetchFlujo() }, [fetchFlujo])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await cfg.db
      .from(cfg.tabla)
      .select(`id, tipo, concepto, periodo, monto_original, descuento, monto_final, saldo,
        status, fecha_vencimiento, fecha_pago, forma_pago, ${cfg.selectJoin}`)
      .eq('periodo', mes)
      .in('tipo', cfg.tipos)
      .neq('status', 'CANCELADO')
      .order('status')

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

  // KPIs sobre el total sin filtro de status/tipo para mostrar el panorama completo
  const totalCargo    = filas.reduce((a, f) => a + f.monto_cargo,  0)
  const totalCobrado  = filas.reduce((a, f) => a + f.cobrado,      0)
  const totalPendiente= filas.reduce((a, f) => a + f.por_cobrar,   0)
  const countPagadas  = filas.filter(f => f.status === 'PAGADO').length
  const countPend     = filas.filter(f => f.status !== 'PAGADO').length
  const avancePct     = pct(totalCobrado, totalCargo)

  // KPIs por tipo
  const porTipo = cfg.tiposResumen.map(t => ({
    tipo:      t,
    label:     cfg.tipoLabels[t] ?? t,
    cargo:     filas.filter(f => f.tipo === t).reduce((a, f) => a + f.monto_cargo, 0),
    cobrado:   filas.filter(f => f.tipo === t).reduce((a, f) => a + f.cobrado,     0),
    pendiente: filas.filter(f => f.tipo === t).reduce((a, f) => a + f.por_cobrar,  0),
    total:     filas.filter(f => f.tipo === t).length,
    pagadas:   filas.filter(f => f.tipo === t && f.status === 'PAGADO').length,
  }))

  // Del "Cobrado" del período, cuánto entró de banco EN este mes vs cuánto ya
  // se había cobrado antes (pago anualizado/adelantado hecho en meses previos:
  // ej. un cliente paga en enero varios meses por adelantado — esas cuotas de
  // meses futuros quedan PAGADAS pero el banco no recibe nada nuevo cuando
  // llega ese mes).
  const cobradoEnMesRows = filas.filter(f => f.cobrado > 0 && f.fecha_pago && f.fecha_pago.slice(0, 7) === mes)
  const cobradoAntesRows = filas.filter(f => f.cobrado > 0 && f.fecha_pago && f.fecha_pago.slice(0, 7) < mes)
  const totalCobradoEnMes = cobradoEnMesRows.reduce((a, f) => a + f.cobrado, 0)
  const totalCobradoAntes = cobradoAntesRows.reduce((a, f) => a + f.cobrado, 0)

  // ── Flujo de cobranza: cobrado del mes / anticipado / vencido ──
  const totalCobradoMesFlujo = cobrosMes.reduce((a, c) => a + montoPagado(c), 0)
  const anticipadoRows   = cobrosMes.filter(c => c.periodo && c.periodo > mes)
  const corrienteRows    = cobrosMes.filter(c => !c.periodo || c.periodo <= mes)
  const totalAnticipado  = anticipadoRows.reduce((a, c) => a + montoPagado(c), 0)
  const totalCorriente   = corrienteRows.reduce((a, c) => a + montoPagado(c), 0)
  const totalVencidoFlujo = vencidos.reduce((a, c) => a + (c.saldo ?? c.monto_final), 0)

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
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Período (mes)</label>
          <select
            value={mes}
            onChange={e => setMes(e.target.value)}
            style={{ padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', minWidth: 200, textTransform: 'capitalize' }}>
            {meses.map(m => (
              <option key={m} value={m} style={{ textTransform: 'capitalize' }}>{labelMes(m)}</option>
            ))}
          </select>
        </div>

        {/* Tipo (solo si el módulo tiene más de un tipo de cuota) */}
        {cfg.tipos.length > 1 && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Tipo de cuota</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[{ key: 'TODOS', label: 'Todos' }, ...cfg.tipos.map(t => ({ key: t, label: cfg.tipoLabels[t] ?? t }))].map(o => (
                <button key={o.key} onClick={() => setFiltroTipo(o.key)}
                  style={{ padding: '7px 12px', fontSize: 12, fontWeight: filtroTipo === o.key ? 700 : 500, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: filtroTipo === o.key ? '#2563eb' : '#e2e8f0', background: filtroTipo === o.key ? '#eff6ff' : '#fff', color: filtroTipo === o.key ? '#1d4ed8' : '#64748b' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Status</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'TODOS',     label: 'Todos'      },
              { key: 'PENDIENTE', label: 'Por cobrar' },
              { key: 'PAGADO',    label: 'Cobrados'   },
            ] as const).map(o => (
              <button key={o.key} onClick={() => setFiltroStatus(o.key)}
                style={{ padding: '7px 12px', fontSize: 12, fontWeight: filtroStatus === o.key ? 700 : 500, borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: filtroStatus === o.key ? '#059669' : '#e2e8f0', background: filtroStatus === o.key ? '#ecfdf5' : '#fff', color: filtroStatus === o.key ? '#15803d' : '#64748b' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Búsqueda */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Buscar {cfg.clienteLabel.toLowerCase()}</label>
          <input
            style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
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

      {/* ── KPIs generales ──────────────────────────────────── */}
      {!loading && filas.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Total cargado',   value: fmt$(totalCargo),    sub: `${filas.length} cuota${filas.length !== 1 ? 's' : ''}`, color: '#2563eb', bg: '#eff6ff', icon: CreditCard  },
              { label: 'Cobrado',         value: fmt$(totalCobrado),  sub: `${countPagadas} pagada${countPagadas !== 1 ? 's' : ''}`, color: '#15803d', bg: '#f0fdf4', icon: CheckCircle },
              { label: 'Por cobrar',      value: fmt$(totalPendiente),sub: `${countPend} pendiente${countPend !== 1 ? 's' : ''}`,  color: '#d97706', bg: '#fffbeb', icon: Clock        },
              { label: 'Avance',          value: `${avancePct}%`,     sub: 'del total cargado',                                     color: '#7c3aed', bg: '#faf5ff', icon: TrendingUp   },
            ].map(k => {
              const Icon = k.icon
              return (
                <div key={k.label} style={{ flex: '1 1 150px', maxWidth: 220, padding: '14px 18px', background: k.bg, border: `1px solid ${k.color}22`, borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <Icon size={14} style={{ color: k.color }} />
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.label}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{k.sub}</div>
                </div>
              )
            })}
          </div>

          {/* Barra de avance */}
          <div style={{ background: '#f1f5f9', borderRadius: 8, height: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${avancePct}%`, background: avancePct >= 80 ? '#15803d' : avancePct >= 50 ? '#d97706' : '#dc2626', borderRadius: 8, transition: 'width 0.4s' }} />
          </div>

          {/* Aclaración: no todo lo "Cobrado" de este período entró de banco este mes —
              pagos anualizados/adelantados hechos en meses anteriores ya dejan estas
              cuotas en PAGADO sin que haya movimiento bancario nuevo en {mes}. */}
          {totalCobradoAntes > 0 && (
            <div style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
              De lo <strong style={{ color: '#15803d' }}>cobrado</strong> en {labelMes(mes)}: <strong style={{ color: '#15803d' }}>{fmt$(totalCobradoEnMes)}</strong> entró de banco durante {labelMes(mes)}
              {' '}· <strong style={{ color: '#2563eb' }}>{fmt$(totalCobradoAntes)}</strong> ya se había cobrado antes ({cobradoAntesRows.length} cuota{cobradoAntesRows.length !== 1 ? 's' : ''} de pago anualizado/adelantado) — no representa entrada de banco en {labelMes(mes)}.
            </div>
          )}

          {/* KPIs por tipo */}
          {porTipo.filter(t => t.total > 0).length > 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
              {porTipo.filter(t => t.total > 0).map(t => (
                <div key={t.tipo} style={{ padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10 }}>{t.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                    {[
                      { label: 'Cargo',    value: fmt$(t.cargo),    color: '#2563eb' },
                      { label: 'Cobrado',  value: fmt$(t.cobrado),  color: '#15803d' },
                      { label: 'Pendiente',value: fmt$(t.pendiente),color: '#d97706' },
                    ].map(col => (
                      <div key={col.label}>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{col.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: col.color }}>{col.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                    {t.pagadas} de {t.total} pagadas · {pct(t.cobrado, t.cargo)}% cobrado
                  </div>
                  <div style={{ marginTop: 4, background: '#e2e8f0', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct(t.cobrado, t.cargo)}%`, background: '#15803d', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Flujo de Cobranza: cobrado del mes / anticipado / vencido ── */}
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#334155', margin: '4px 0 10px' }}>
          Flujo de Cobranza — {labelMes(mes)}
        </h3>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Cobrado del mes', value: fmt$(totalCobradoMesFlujo), sub: `${cobrosMes.length} pago${cobrosMes.length !== 1 ? 's' : ''} registrado${cobrosMes.length !== 1 ? 's' : ''}`, color: '#15803d', bg: '#f0fdf4', icon: CheckCircle },
            { label: 'Anticipado',      value: fmt$(totalAnticipado),      sub: `${anticipadoRows.length} de periodos futuros`,       color: '#2563eb', bg: '#eff6ff', icon: CalendarClock },
            { label: 'Vencido',         value: fmt$(totalVencidoFlujo),    sub: `${vencidos.length} cuota${vencidos.length !== 1 ? 's' : ''} sin cobrar (a hoy)`, color: '#dc2626', bg: '#fef2f2', icon: AlertTriangle },
          ].map(k => {
            const Icon = k.icon
            return (
              <div key={k.label} style={{ flex: '1 1 180px', maxWidth: 260, padding: '14px 18px', background: k.bg, border: `1px solid ${k.color}22`, borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <Icon size={14} style={{ color: k.color }} />
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.label}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: k.color, lineHeight: 1 }}>{loadingFlujo ? '…' : k.value}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{k.sub}</div>
              </div>
            )
          })}
        </div>

        {!loadingFlujo && cobrosMes.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
              De lo cobrado en el mes: <strong style={{ color: '#15803d' }}>{fmt$(totalCorriente)}</strong> corresponde a periodos ≤ {labelMes(mes)}
              {' '}· <strong style={{ color: '#2563eb' }}>{fmt$(totalAnticipado)}</strong> corresponde a periodos futuros (adelantado)
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Desglose por fecha de cobro</span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                      {['Fecha de cobro', 'Cuotas', 'Monto cobrado'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Monto cobrado' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {desglosePorDia.map(d => (
                      <tr key={d.fecha} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 14px', color: '#1e293b' }}>
                          {d.fecha !== '—' ? new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', color: '#64748b' }}>{d.count}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#15803d' }}>{fmt$(d.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: '#475569' }}>Total</td>
                      <td style={{ padding: '8px 14px', color: '#475569' }}>{cobrosMes.length}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#15803d' }}>{fmt$(totalCobradoMesFlujo)}</td>
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
              <div style={{ padding: '8px 14px', background: '#fef2f2', borderBottom: '1px solid #fee2e2' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>Cuotas vencidas sin cobrar (a la fecha de hoy)</span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                      {[cfg.clienteLabel, 'Concepto', 'Período', 'Vencimiento', 'Saldo'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Saldo' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vencidos.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 14px', color: '#1e293b' }}>{c.cliente}</td>
                        <td style={{ padding: '8px 14px', color: '#475569' }}>{c.concepto}</td>
                        <td style={{ padding: '8px 14px', color: '#64748b', fontFamily: 'monospace' }}>{c.periodo ?? '—'}</td>
                        <td style={{ padding: '8px 14px', color: '#dc2626', fontWeight: 600 }}>
                          {c.fecha_vencimiento ? new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>{fmt$(c.saldo ?? c.monto_final)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fef2f2', borderTop: '2px solid #fee2e2', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '8px 14px', fontSize: 12, color: '#b91c1c' }}>Total vencido ({vencidos.length})</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#b91c1c' }}>{fmt$(totalVencidoFlujo)}</td>
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
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
              {loading ? 'Cargando…' : `${filtradas.length} cuota${filtradas.length !== 1 ? 's' : ''}`}
              {filtroTipo !== 'TODOS' && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>· {cfg.tipoLabels[filtroTipo] ?? filtroTipo}</span>}
            </span>
            {!loading && filtradas.length > 0 && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Cobrado: <strong style={{ color: '#15803d' }}>{fmt$(filtradas.reduce((a, f) => a + f.cobrado, 0))}</strong>
                {' '}· Por cobrar: <strong style={{ color: '#d97706' }}>{fmt$(filtradas.reduce((a, f) => a + f.por_cobrar, 0))}</strong>
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                  {(cfg.clienteLabel === 'Socio' ? ['No.'] : []).concat([cfg.clienteLabel, cfg.secundarioLabel, 'Tipo', 'Concepto', 'Cargo', 'Cobrado', 'Por cobrar', 'Status', 'Vencimiento', 'F. Pago', 'Forma Pago']).map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: h === 'Cargo' || h === 'Cobrado' || h === 'Por cobrar' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Cargando…</td></tr>
                ) : filtradas.length === 0 ? (
                  <tr><td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Sin cuotas para el período seleccionado</td></tr>
                ) : (
                  filtradas.map(f => {
                    const sc = STATUS_COLOR[f.status] ?? { bg: '#f1f5f9', color: '#64748b', label: f.status }
                    const venc = f.fecha_vencimiento && f.fecha_vencimiento < new Date().toLocaleDateString('en-CA') && f.status !== 'PAGADO'
                    return (
                      <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8fafc'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                        {cfg.clienteLabel === 'Socio' && (
                          <td style={{ padding: '9px 10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>
                            {f.numero ?? '—'}
                          </td>
                        )}
                        <td style={{ padding: '9px 10px', fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap' }}>
                          {f.cliente}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {f.secundario ?? '—'}
                        </td>
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: '#eff6ff', color: '#2563eb' }}>
                            {cfg.tipoLabels[f.tipo] ?? f.tipo}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: '#475569' }}>{f.concepto}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                          {fmt$(f.monto_cargo)}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#15803d', whiteSpace: 'nowrap' }}>
                          {f.cobrado > 0 ? fmt$(f.cobrado) : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: f.por_cobrar > 0 ? '#d97706' : '#94a3b8', whiteSpace: 'nowrap' }}>
                          {f.por_cobrar > 0 ? fmt$(f.por_cobrar) : '—'}
                        </td>
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                            {sc.label}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: venc ? '#dc2626' : '#64748b', fontWeight: venc ? 600 : 400, whiteSpace: 'nowrap', fontSize: 11 }}>
                          {f.fecha_vencimiento
                            ? new Date(f.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                          {venc && <span style={{ marginLeft: 4 }}>⚠</span>}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#64748b', whiteSpace: 'nowrap', fontSize: 11 }}>
                          {f.fecha_pago
                            ? new Date(f.fecha_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                          {f.fecha_pago && f.fecha_pago.slice(0, 7) < mes && (
                            <span title="Cobrado antes de este período — no es entrada de banco nueva en este mes" style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 20, background: '#dbeafe', color: '#2563eb' }}>
                              anticipo
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '9px 10px', color: '#64748b', fontSize: 11 }}>
                          {f.forma_pago ?? '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {!loading && filtradas.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                    <td colSpan={cfg.clienteLabel === 'Socio' ? 5 : 4} style={{ padding: '10px 10px', fontSize: 12, color: '#475569' }}>
                      Total ({filtradas.length} cuotas)
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#1e293b' }}>
                      {fmt$(filtradas.reduce((a, f) => a + f.monto_cargo, 0))}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#15803d' }}>
                      {fmt$(filtradas.reduce((a, f) => a + f.cobrado, 0))}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right', fontSize: 13, color: '#d97706' }}>
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
