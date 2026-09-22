'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import { Loader, RefreshCw, BookOpen, Layers, List, Trash2, Save, Building2 } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/lib/AuthContext'
import { resolverCategoriasPorOp } from '@/lib/pptoOcCategoria'
import { prorratearDescuento } from '@/lib/prorateoDescuento'
import { OPDetail } from '@/components/compras/OPDetailModal'
import { useRouter } from 'next/navigation'
import { esComodin } from '@/lib/pptoComodin'
import { PrintBar } from '@/app/reportes/utils'
import { fetchDevengadoSinIvaPorPartida } from '@/lib/cobranzaCuotas'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Presupuesto = { id: number; anio: number; nombre: string; status: string; modulo: string }
type Clasificacion = 'operativo' | 'financiero' | 'intercompanias'
type Partida     = {
  id: number; nombre: string; descripcion: string | null; tipo: 'ingreso' | 'egreso'; orden: number
  fuente_real:          string | null
  id_centro_ingreso_fk: number | null
  id_centro_costo_fk:   number | null
  id_area_fk:           number | null
  id_seccion_fk:        number | null
  id_concepto_fk:       number | null
  tipo_gasto:           string | null
  id_agrupador_fk:      number | null
  clasificacion:        Clasificacion
  /** Venta diaria: en base devengado su Real se toma del real de caja. */
  devengado_igual_a_cobro: boolean
}
type Agrupador = { id: number; nombre: string; orden: number }
type Proveedor = { id: number; nombre: string }
type DetMap = Record<number, Record<number, number>>
type FilaPartida = Partida & { pptoVal: number; realVal: number; varAbs: number; varPct: number | null }
type FilaGrupo   = { id: string; nombre: string; orden: number; pptoVal: number; realVal: number; varAbs: number; varPct: number | null; partidas: FilaPartida[] }
type DetalleTransaccion = {
  fecha: string; monto: number
  folio?: string | null; id_proveedor_fk?: number | null
  tipo_gasto?: string | null; descripcion?: string | null
  id_op_fk?: number | null
}
type DetMapTx = Record<number, DetalleTransaccion[]>
type CentroIng    = { id: number; nombre: string; tipo_desglose: string }
type SeccionF     = { id: number; nombre: string }
type ConceptoF    = { id: number; nombre: string; id_centro_ingreso_fk: number | null }
type CentroCostoF = { id: number; nombre: string }
type AreaF        = { id: number; nombre: string; id_centro_costo_fk: number }

const CLASIFICACION_LABELS: Record<Clasificacion, { ingresos: string; egresos: string; balance: string }> = {
  operativo:      { ingresos: 'Ingresos',                 egresos: 'Egresos',                 balance: 'Balance Operativo' },
  financiero:     { ingresos: 'Ingreso Financiero',        egresos: 'Egreso Financiero',        balance: 'Balance Financiero' },
  intercompanias: { ingresos: 'Ingreso Intercompañías',    egresos: 'Egreso Intercompañías',    balance: 'Balance Intercompañías' },
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const VISTA_LABEL = { detalle: 'Detalle', concepto: 'Concepto', agrupado: 'Agrupado' } as const

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtFecha = (f: string) =>
  new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

// Filtro por CC/Sección/Área — mismo estilo visual que /dashboards/financiero
const ING = { border: '#bbf7d0', bg: '#f0fdf4', text: '#15803d' }
const EGR = { border: '#fecaca', bg: '#fef2f2', text: '#dc2626' }
const selStyle = (active: boolean, color: { border: string; bg: string; text: string }, width: number): React.CSSProperties => ({
  fontSize: 11, padding: '4px 8px', borderRadius: 6, width,
  border: `1px solid ${color.border}`,
  background: active ? color.bg : '#f8fafc',
  color: active ? color.text : 'var(--text-secondary)',
  cursor: 'pointer',
})

function pctBar(real: number, ppto: number) {
  if (ppto <= 0) return null
  return Math.min(Math.round((real / ppto) * 100), 200)
}

function VariacionCell({ varAbs, varPct, tipo }: { varAbs: number; varPct: number | null; tipo: 'ingreso' | 'egreso' }) {
  if (varAbs === 0 && !varPct) return <span style={{ color: '#94a3b8' }}>—</span>
  const positivo = varAbs >= 0
  // Para ingresos: positivo (más real que ppto) = bueno = verde
  // Para egresos:  positivo (más real que ppto) = malo  = rojo
  const color = tipo === 'ingreso'
    ? (positivo ? '#15803d' : '#dc2626')
    : (positivo ? '#dc2626' : '#15803d')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
      <span style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
        {positivo ? '+' : '-'}{fmt(Math.abs(varAbs))}
      </span>
      {varPct !== null && (
        <span style={{ fontSize: 11, color, fontWeight: 500 }}>
          {positivo ? '+' : ''}{varPct}%
        </span>
      )}
    </div>
  )
}

function PctEjercidoCell({ real, ppto, tipo }: { real: number; ppto: number; tipo: 'ingreso' | 'egreso' }) {
  const p = ppto > 0 ? Math.round((real / ppto) * 100) : null
  if (p === null) return <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
  const color = tipo === 'ingreso'
    ? (p >= 90 ? '#15803d' : p >= 60 ? '#d97706' : '#dc2626')
    : (p <= 100 ? '#15803d' : p <= 115 ? '#d97706' : '#dc2626')
  const w = Math.min(p, 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{p}%</span>
      <div style={{ height: 4, borderRadius: 2, background: '#f1f5f9', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 2, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

function MontoDrillButton({ monto, onClick, fmt }: { monto: number; onClick: () => void; fmt: (n: number) => string }) {
  return (
    <button onClick={onClick} title="Ver partidas que integran este monto"
      style={{
        font: 'inherit', fontWeight: 'inherit', color: 'inherit', background: 'none', border: 'none',
        padding: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
        textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
      }}>
      {fmt(monto)}
    </button>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function ComparativoPage() {
  const { canWrite } = useAuth()
  const router = useRouter()
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [selId, setSelId]               = useState<number | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)

  const [partidas, setPartidas] = useState<Partida[]>([])
  const [detMap,   setDetMap]   = useState<DetMap>({})
  const [realMap,  setRealMap]  = useState<DetMap>({})

  // ── Bandas de clasificación del Real por partida y mes ──────────────────
  // Responde, sobre la cifra que ya se ve en la columna Real: cuánto es
  // desempeño del mes (corriente), cuánto recuperación de cartera (vencido) y
  // cuánto dinero de meses futuros (anticipado). Se muestra en el drill.
  //
  // Vienen de recibos_ingreso_secciones/_conceptos: capturadas a mano
  // (migración 20260920180000) o derivadas de la cobranza en los meses
  // posteriores al corte (lib/distribucionSecciones.ts). NULL = sin clasificar,
  // y se presenta como tal en vez de repartirse.
  type Bandas = { vencido: number; corriente: number; anticipado: number; sinClasificar: number }
  const [bandasMap, setBandasMap] = useState<Record<number, Record<number, Bandas>>>({})

  // ── Base de medición ────────────────────────────────────────────
  // 'cobro'     Presupuesto = monto (cobro esperado) · Real = recibos por fecha
  //             de cobro. Es el comportamiento histórico de este tab.
  // 'devengado' Presupuesto = monto_devengado · Real = devengado de la cartera,
  //             prorrateado y sin IVA. Es la base con la que medir un área mes
  //             a mes: no la mueve el momento del cobro.
  //
  // El selector cambia LAS DOS columnas a la vez. Mezclar un presupuesto
  // devengado contra un real de caja daría una variación que no significa nada,
  // y es justo el problema que este trabajo viene a resolver.
  type Base = 'cobro' | 'devengado'
  const [base, setBase] = useState<Base>('cobro')
  const [detDevMap, setDetDevMap] = useState<DetMap>({})
  const [realDevMap, setRealDevMap] = useState<DetMap>({})
  const [devAvisos, setDevAvisos] = useState<string[]>([])
  const [devErrores, setDevErrores] = useState<string[]>([])
  const [loadingDev, setLoadingDev] = useState(false)
  const [realDetalle, setRealDetalle] = useState<DetMapTx>({})
  const [agrupadores, setAgrupadores] = useState<Agrupador[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [drillOps, setDrillOps] = useState<{ partida: string; tipo: 'ingreso' | 'egreso'; conOp: boolean; rows: DetalleTransaccion[]; bandas?: { vencido: number; corriente: number; anticipado: number; sinClasificar: number } | null } | null>(null)
  const [opDetalle, setOpDetalle]   = useState<any | null>(null)
  const [opLoading,  setOpLoading]  = useState(false)

  const abrirOP = async (id: number) => {
    setOpLoading(true)
    const { data, error } = await dbComp.from('ordenes_pago').select('*').eq('id', id).single()
    setOpLoading(false)
    if (error || !data) { alert('No se pudo cargar la orden de pago.'); return }
    setOpDetalle({ ...data, _provNombre: proveedores.find(p => p.id === data.id_proveedor_fk)?.nombre })
  }

  // Catálogos para filtro por CC/Sección (ingresos) y CC/Área (egresos) — mismo modelo que /dashboards/financiero
  const [centrosIng, setCentrosIng]     = useState<CentroIng[]>([])
  const [seccionesF, setSeccionesF]     = useState<SeccionF[]>([])
  const [conceptosF, setConceptosF]     = useState<ConceptoF[]>([])
  const [centrosCostoF, setCentrosCostoF] = useState<CentroCostoF[]>([])
  const [areasF, setAreasF]             = useState<AreaF[]>([])
  const [filtroCentroIng, setFiltroCentroIng] = useState('')
  const [filtroSeccion,   setFiltroSeccion]   = useState('')
  const [filtroConcepto,  setFiltroConcepto]  = useState('')
  const [filtroCC,   setFiltroCC]   = useState('')
  const [filtroArea, setFiltroArea] = useState('')

  // Filtros
  const [filterTipo, setFilterTipo] = useState<'' | 'ingreso' | 'egreso'>('')
  const [filterMes,  setFilterMes]  = useState<number>(0) // 0 = Acumulado
  const [vista, setVista] = useState<'detalle' | 'concepto' | 'agrupado'>('detalle')
  const [drillGrupo, setDrillGrupo] = useState<{ nombre: string; tipo: 'ingreso' | 'egreso'; partidas: FilaPartida[] } | null>(null)

  // Modal añadir/editar real manual
  const [modalManual, setModalManual] = useState(false)
  const [manualPid,   setManualPid]   = useState<number | null>(null)
  const [manualEntries, setManualEntries] = useState<{ id: number; mes: number; monto: number; concepto: string | null }[]>([])
  const [editManualId,    setEditManualId]    = useState<number | null>(null)
  const [editManualMonto, setEditManualMonto] = useState('')
  const [editManualConc,  setEditManualConc]  = useState('')
  const [manualMes,   setManualMes]   = useState(new Date().getMonth() + 1)
  const [manualMonto, setManualMonto] = useState('')
  const [manualConc,  setManualConc]  = useState('')
  const [savingManual, setSavingManual] = useState(false)

  const loadEverything = useCallback(async (pptoId: number, anio: number, modulo: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)

    let partidasQ = dbCtrl.from('ppto_partidas')
      .select('id, nombre, descripcion, tipo, orden, fuente_real, id_centro_ingreso_fk, id_centro_costo_fk, id_area_fk, id_seccion_fk, id_concepto_fk, tipo_gasto, id_agrupador_fk, clasificacion, devengado_igual_a_cobro')
      .eq('activo', true)
      .eq('incluir_presupuesto', true)
    if (modulo) partidasQ = (partidasQ as any).eq('modulo', modulo)

    const [{ data: pData }, { data: det }, { data: manual }] = await Promise.all([
      partidasQ.order('tipo').order('orden').order('nombre'),
      dbCtrl.from('ppto_presupuesto_det')
        .select('id_partida_fk, mes, monto, monto_devengado').eq('id_presupuesto_fk', pptoId),
      dbCtrl.from('ppto_presupuesto_real_manual')
        .select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', pptoId),
    ])

    const parts = (pData ?? []) as Partida[]
    setPartidas(parts)

    const dm: DetMap = {}
    const dd: DetMap = {}
    ;(det ?? []).forEach((r: any) => {
      if (!dm[r.id_partida_fk]) dm[r.id_partida_fk] = {}
      dm[r.id_partida_fk][r.mes] = Number(r.monto)
      // NULL = devengado esperado no capturado; no se siembra con `monto` para
      // que el fallback sea visible en pantalla y se sepa qué falta capturar.
      if (r.monto_devengado != null) {
        if (!dd[r.id_partida_fk]) dd[r.id_partida_fk] = {}
        dd[r.id_partida_fk][r.mes] = Number(r.monto_devengado)
      }
    })
    setDetMap(dm)
    setDetDevMap(dd)

    // ── Clasificar partidas por fuente real ──────────────────────
    const secParts  = parts.filter(p => p.fuente_real === 'seccion'  && p.id_seccion_fk)
    const concParts = parts.filter(p => p.fuente_real === 'concepto' && p.id_concepto_fk)
    const areaParts = parts.filter(p => p.fuente_real === 'op_area'  && p.id_area_fk)

    const secIds  = Array.from(new Set(secParts.map(p => p.id_seccion_fk!)))
    const concIds = Array.from(new Set(concParts.map(p => p.id_concepto_fk!)))
    const areaIds = Array.from(new Set(areaParts.map(p => p.id_area_fk!)))

    // ── Consultas en paralelo ────────────────────────────────────
    const [{ data: secData }, { data: concData }, { data: opsData }, { data: opsDetData }] = await Promise.all([
      secIds.length > 0
        ? (dbCtrl.from('recibos_ingreso_secciones') as any)
            .select('id_seccion_fk, monto, subtotal, monto_vencido, monto_corriente, monto_anticipado, recibos_ingreso!inner(status, fecha, folio, descripcion)')
            .in('id_seccion_fk', secIds)
            .eq('recibos_ingreso.status', 'Confirmado')
            .gte('recibos_ingreso.fecha', `${anio}-01-01`)
            .lte('recibos_ingreso.fecha', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
      concIds.length > 0
        ? (dbCtrl.from('recibos_ingreso_conceptos') as any)
            .select('id_concepto_fk, monto, subtotal, monto_vencido, monto_corriente, monto_anticipado, recibos_ingreso!inner(status, fecha, folio, descripcion)')
            .in('id_concepto_fk', concIds)
            .eq('recibos_ingreso.status', 'Confirmado')
            .gte('recibos_ingreso.fecha', `${anio}-01-01`)
            .lte('recibos_ingreso.fecha', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
      areaIds.length > 0
        ? dbComp.from('ordenes_pago')
            .select('id, id_centro_costo_fk, id_area_fk, tipo_gasto, fecha_op, monto, subtotal, status, id_oc_fk, folio, concepto, id_proveedor_fk')
            .in('id_area_fk', areaIds)
            .gte('fecha_op', `${anio}-01-01`)
            .lte('fecha_op', `${anio}-12-31`)
            .not('status', 'in', '("Cancelada","Rechazada","Sustituida")')
        : Promise.resolve({ data: [] }),
      // OP con distribución por área (ordenes_pago_det): el encabezado queda con
      // id_area_fk null, así que no las captura el .in('id_area_fk', areaIds) de
      // arriba — hay que sumar cada línea por su propia área.
      areaIds.length > 0
        ? (dbComp.from('ordenes_pago_det') as any)
            .select('id_area_fk, monto, ordenes_pago!inner(id, tipo_gasto, fecha_op, status, id_area_fk, folio, concepto, id_proveedor_fk, monto, subtotal)')
            .in('id_area_fk', areaIds)
            .is('ordenes_pago.id_area_fk', null)
            .gte('ordenes_pago.fecha_op', `${anio}-01-01`)
            .lte('ordenes_pago.fecha_op', `${anio}-12-31`)
            .not('ordenes_pago.status', 'in', '("Cancelada","Rechazada","Sustituida")')
        : Promise.resolve({ data: [] }),
    ])
    // Fracción sin-IVA de una OP: subtotal/monto cuando el encabezado trae el
    // desglose capturado (ver ordenes_pago.subtotal, migración cb7fc54); si no
    // lo tiene (mayoría del histórico), factor=1 y el monto con IVA se usa tal
    // cual — no se aproxima con /1.16 para no distorsionar partidas exentas
    // (ej. Nómina). Al ser un factor, es válido aplicarlo tanto al monto pleno
    // de la OP como a cualquier fracción suya (reparto por área o por categoría).
    const factorSinIva = (subtotal: number | null | undefined, monto: number) =>
      (subtotal != null && monto !== 0) ? Number(subtotal) / Number(monto) : 1

    const opsDistribuidas = (opsDetData ?? []).map((r: any) => ({
      id:         r.ordenes_pago.id,
      id_area_fk: r.id_area_fk,
      tipo_gasto: r.ordenes_pago.tipo_gasto,
      fecha_op:   r.ordenes_pago.fecha_op,
      status:     r.ordenes_pago.status,
      monto:      r.monto,
      subtotal:   r.monto * factorSinIva(r.ordenes_pago.subtotal, Number(r.ordenes_pago.monto)),
      folio:      r.ordenes_pago.folio,
      concepto:   r.ordenes_pago.concepto,
      id_proveedor_fk: r.ordenes_pago.id_proveedor_fk,
    }))

    // OP con OC (tipo_gasto null por diseño): se reatribuyen a la categoría de
    // los artículos realmente comprados en vez de caer siempre en el catch-all.
    // Si aún no existe una partida específica para esa categoría en el área,
    // el catch-all la sigue capturando sin cambios (ver tiposEspecificosPorArea
    // más abajo) — seguro desplegar antes de crear esas partidas.
    const candidatosOC = (opsData ?? [])
      .filter((o: any) => o.tipo_gasto === null && o.id_oc_fk != null)
      .map((o: any) => ({ id: o.id, id_oc_fk: o.id_oc_fk }))
    const categoriasPorOp = await resolverCategoriasPorOp(candidatosOC)
    const opsCategoria: any[] = []
    ;(opsData ?? []).forEach((op: any) => {
      const shares = categoriasPorOp.get(op.id)
      if (!shares) return
      const factor = factorSinIva(op.subtotal, Number(op.monto))
      prorratearDescuento(shares, s => s.fraction, 1, Number(op.monto)).forEach(({ item, montoNeto }) => {
        opsCategoria.push({
          id: op.id, id_area_fk: op.id_area_fk, tipo_gasto: item.categoria,
          fecha_op: op.fecha_op, status: op.status, monto: montoNeto, subtotal: montoNeto * factor,
          folio: op.folio, concepto: op.concepto, id_proveedor_fk: op.id_proveedor_fk,
        })
      })
    })

    const opsTodas = [
      ...(opsData ?? []).filter((o: any) => !categoriasPorOp.has(o.id))
        .map((o: any) => ({ ...o, subtotal: Number(o.monto) * factorSinIva(o.subtotal, Number(o.monto)) })),
      ...opsDistribuidas,
      ...opsCategoria,
    ]

    // ── Construir realMap + detalle transaccional (drill-down por OP/recibo) ──
    const rm: DetMap = {}
    const rd: DetMapTx = {}

    // Por sección — sin IVA: usa el subtotal capturado en /ingresos (calcFiscal,
    // 16%); recibos anteriores a ese cambio no lo tienen y caen al monto tal cual.
    const bm: Record<number, Record<number, Bandas>> = {}
    // Las bandas vienen en monto CON IVA, mientras la columna Real es sin IVA:
    // se aplica a cada banda el mismo factor subtotal/monto de su fila, así el
    // desglose suma exactamente el Real que se está viendo.
    const acumBandas = (pid: number, mes: number, r: any) => {
      const monto = Number(r.monto) || 0
      if (monto === 0) return
      const factor = r.subtotal != null ? Number(r.subtotal) / monto : 1
      const v = r.monto_vencido    != null ? Number(r.monto_vencido)    : 0
      const c = r.monto_corriente  != null ? Number(r.monto_corriente)  : 0
      const a = r.monto_anticipado != null ? Number(r.monto_anticipado) : 0
      const sin = Math.max(0, monto - v - c - a)
      if (!bm[pid]) bm[pid] = {}
      if (!bm[pid][mes]) bm[pid][mes] = { vencido: 0, corriente: 0, anticipado: 0, sinClasificar: 0 }
      const b = bm[pid][mes]
      b.vencido       += v * factor
      b.corriente     += c * factor
      b.anticipado    += a * factor
      b.sinClasificar += sin * factor
    }

    secParts.forEach(p => {
      rm[p.id] = {}
      rd[p.id] = []
      ;(secData ?? []).filter((r: any) => r.id_seccion_fk === p.id_seccion_fk)
        .forEach((r: any) => {
          const monto = Number(r.subtotal ?? r.monto)
          const mes = new Date(r.recibos_ingreso.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + monto
          acumBandas(p.id, mes, r)
          rd[p.id].push({ fecha: r.recibos_ingreso.fecha, monto, folio: r.recibos_ingreso.folio, descripcion: r.recibos_ingreso.descripcion })
        })
    })

    // Por concepto — sin IVA: usa el subtotal capturado (POS real o 16% de
    // captura manual, ver distribucionIngreso.ts / ingresos/page.tsx); los
    // recibos anteriores a ese cambio no lo tienen y caen al monto tal cual.
    concParts.forEach(p => {
      rm[p.id] = {}
      rd[p.id] = []
      ;(concData ?? []).filter((r: any) => r.id_concepto_fk === p.id_concepto_fk)
        .forEach((r: any) => {
          const monto = Number(r.subtotal ?? r.monto)
          const mes = new Date(r.recibos_ingreso.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + monto
          acumBandas(p.id, mes, r)
          rd[p.id].push({ fecha: r.recibos_ingreso.fecha, monto, folio: r.recibos_ingreso.folio, descripcion: r.recibos_ingreso.descripcion })
        })
    })

    // Por área (ordenes de pago) — la partida comodín de un área ("Otros", o
    // legado sin tipo_gasto) excluye los tipo_gasto que ya cubre otra partida
    // específica de esa misma área, para no contar la misma OP dos veces.
    const tiposEspecificosPorArea: Record<number, Set<string>> = {}
    areaParts.forEach(p => {
      if (p.tipo_gasto && !esComodin(p.tipo_gasto) && p.id_area_fk) {
        if (!tiposEspecificosPorArea[p.id_area_fk]) tiposEspecificosPorArea[p.id_area_fk] = new Set()
        tiposEspecificosPorArea[p.id_area_fk].add(p.tipo_gasto)
      }
    })

    areaParts.forEach(p => {
      rm[p.id] = {}
      rd[p.id] = []
      const tiposCubiertos = esComodin(p.tipo_gasto) && p.id_area_fk ? tiposEspecificosPorArea[p.id_area_fk] : null
      opsTodas.filter((op: any) => {
          if (p.id_area_fk && op.id_area_fk !== p.id_area_fk) return false
          if (p.tipo_gasto && !esComodin(p.tipo_gasto) && op.tipo_gasto !== p.tipo_gasto) return false
          if (tiposCubiertos && op.tipo_gasto && tiposCubiertos.has(op.tipo_gasto)) return false
          return true
        })
        .forEach((op: any) => {
          if (!op.fecha_op) return
          // Sin IVA: op.subtotal ya viene resuelto con fallback al monto pleno
          // cuando la OP no tiene el desglose capturado (ver factorSinIva arriba).
          const monto = Number(op.subtotal)
          const mes = new Date(op.fecha_op + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + monto
          rd[p.id].push({
            fecha: op.fecha_op, monto, folio: op.folio,
            id_proveedor_fk: op.id_proveedor_fk, tipo_gasto: op.tipo_gasto, descripcion: op.concepto,
            id_op_fk: op.id,
          })
        })
    })

    // Real manual sumado encima del auto
    ;(manual ?? []).forEach((r: any) => {
      if (!rm[r.id_partida_fk]) rm[r.id_partida_fk] = {}
      rm[r.id_partida_fk][r.mes] = (rm[r.id_partida_fk][r.mes] ?? 0) + Number(r.monto)
    })

    setRealMap(rm)
    setBandasMap(bm)
    setRealDetalle(rd)
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    dbCtrl.from('ppto_presupuestos').select('id, anio, nombre, status, modulo')
      .order('anio', { ascending: false }).order('nombre')
      .then(({ data }) => {
        const list = (data ?? []) as Presupuesto[]
        setPresupuestos(list)
        if (list.length > 0) {
          setSelId(list[0].id)
          loadEverything(list[0].id, list[0].anio, list[0].modulo)
        } else setLoading(false)
      })
    dbCtrl.from('ppto_agrupadores').select('id, nombre, orden').eq('activo', true).order('orden').order('nombre')
      .then(({ data }) => setAgrupadores((data ?? []) as Agrupador[]))
    dbComp.from('proveedores').select('id, nombre').order('nombre')
      .then(({ data }) => setProveedores((data ?? []) as Proveedor[]))
    dbCfg.from('centros_ingreso').select('id, nombre, tipo_desglose').order('nombre')
      .then(({ data }) => setCentrosIng((data ?? []) as CentroIng[]))
    dbCfg.from('secciones').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setSeccionesF((data ?? []) as SeccionF[]))
    dbCfg.from('conceptos_ingreso').select('id, nombre, id_centro_ingreso_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setConceptosF((data ?? []) as ConceptoF[]))
    dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre')
      .then(({ data }) => setCentrosCostoF((data ?? []) as CentroCostoF[]))
    dbCfg.from('areas').select('id, nombre, id_centro_costo_fk').eq('activo', true).order('nombre')
      .then(({ data }) => setAreasF((data ?? []) as AreaF[]))
  }, [loadEverything])

  const selPpto = presupuestos.find(p => p.id === selId)

  function onChangePpto(id: number) {
    setSelId(id)
    const p = presupuestos.find(x => x.id === id)
    if (p) loadEverything(p.id, p.anio, p.modulo, true)
    setFiltroCentroIng(''); setFiltroSeccion(''); setFiltroConcepto('')
    setFiltroCC(''); setFiltroArea('')
  }

  const centroIngSel = centrosIng.find(c => String(c.id) === filtroCentroIng)
  const esSecciones  = centroIngSel?.tipo_desglose === 'secciones'
  const esConceptos  = centroIngSel?.tipo_desglose === 'conceptos'
  const conceptosOpts = filtroCentroIng
    ? conceptosF.filter(c => c.id_centro_ingreso_fk === Number(filtroCentroIng) || c.id_centro_ingreso_fk === null)
    : conceptosF
  const areasFFiltradas = filtroCC ? areasF.filter(a => a.id_centro_costo_fk === Number(filtroCC)) : areasF
  const hayFiltroIng = !!(filtroCentroIng || filtroSeccion || filtroConcepto)
  const hayFiltroEgr = !!(filtroCC || filtroArea)

  // Carga los registros de real manual ya capturados para una partida
  const loadManualEntries = useCallback(async (pid: number) => {
    if (!selId) return
    const { data } = await dbCtrl.from('ppto_presupuesto_real_manual')
      .select('id, mes, monto, concepto')
      .eq('id_presupuesto_fk', selId).eq('id_partida_fk', pid)
      .order('mes')
    setManualEntries((data ?? []) as typeof manualEntries)
  }, [selId])

  function refreshManual() {
    const p = presupuestos.find(x => x.id === selId)
    if (p) loadEverything(p.id, p.anio, p.modulo, true)
    if (manualPid) loadManualEntries(manualPid)
  }

  // Agrega real manual
  async function saveManual() {
    if (!manualPid || !selId) return
    const monto = parseFloat(manualMonto.replace(/,/g, '')) || 0
    if (monto <= 0) return
    setSavingManual(true)
    await dbCtrl.from('ppto_presupuesto_real_manual').insert({
      id_presupuesto_fk: selId, id_partida_fk: manualPid,
      mes: manualMes, monto, concepto: manualConc || null,
    })
    setSavingManual(false)
    setManualMonto('')
    setManualConc('')
    refreshManual()
  }

  function startEditManual(e: { id: number; monto: number; concepto: string | null }) {
    setEditManualId(e.id); setEditManualMonto(String(e.monto)); setEditManualConc(e.concepto ?? '')
  }

  async function saveEditManual(id: number) {
    const monto = parseFloat(editManualMonto.replace(/,/g, '')) || 0
    if (monto <= 0) return
    await dbCtrl.from('ppto_presupuesto_real_manual').update({
      monto, concepto: editManualConc || null,
    }).eq('id', id)
    setEditManualId(null)
    refreshManual()
  }

  async function deleteManualEntry(id: number) {
    if (!confirm('¿Eliminar este monto capturado?')) return
    await dbCtrl.from('ppto_presupuesto_real_manual').delete().eq('id', id)
    refreshManual()
  }

  // ── Real devengado (solo se carga si se pide esa base) ──────────
  // Viene de las subcuentas de cobranza, prorrateado por meses_devengo y sin
  // IVA (la tasa se resuelve por concepto desde el catálogo de productos, no
  // con un /1.16 a ciegas — la cuota de Fraccionamiento es exenta).
  useEffect(() => {
    if (base !== 'devengado' || !selPpto) { return }
    let vivo = true
    setLoadingDev(true)
    fetchDevengadoSinIvaPorPartida(selPpto.anio, true).then(r => {
      if (!vivo) return
      const map: DetMap = {}
      for (const p of partidas) {
        if (p.tipo !== 'ingreso') continue
        const src = p.fuente_real === 'concepto' && p.id_concepto_fk != null
          ? r.porConcepto.get(p.id_concepto_fk)
          : p.fuente_real === 'seccion' && p.id_seccion_fk != null
            ? r.porSeccion.get(p.id_seccion_fk)
            : undefined
        if (src) map[p.id] = { ...src }
      }
      setRealDevMap(map)
      setDevAvisos(r.avisos)
      setDevErrores(r.errores)
      setLoadingDev(false)
    })
    return () => { vivo = false }
  }, [base, selPpto, partidas])

  // Partidas de ingreso que no tienen de dónde sacar un Real devengado: no se
  // rellenan con el real de caja (sería comparar peras con manzanas), se marcan.
  // Las de venta diaria quedan fuera del aviso: ahí caja y devengado coinciden
  // por naturaleza, así que su Real sí sale — del real de caja, a propósito.
  const ingresosSinDevengado = partidas.filter(p =>
    p.tipo === 'ingreso' && !p.devengado_igual_a_cobro &&
    !realDevMap[p.id] && (detDevMap[p.id] || detMap[p.id]))

  // ── Helpers de agregación ──────────────────────────────────────
  const getMeses = () => filterMes === 0 ? Array.from({ length: 12 }, (_, i) => i + 1) : [filterMes]

  const esIngreso = (pid: number) => partidas.find(p => p.id === pid)?.tipo === 'ingreso'

  /** true si la partida no tiene devengado esperado capturado y se cae a `monto`. */
  function pptoEsFallback(pid: number) {
    if (base !== 'devengado') return false
    return getMeses().some(m => detDevMap[pid]?.[m] == null && detMap[pid]?.[m] != null)
  }

  function pptoPartida(pid: number) {
    const fuente = base === 'devengado' ? detDevMap : detMap
    // En base devengado se cae a `monto` cuando no hay devengado capturado, para
    // no dejar la columna en blanco — pero queda marcado (ver pptoEsFallback).
    return getMeses().reduce((s, m) => s + (fuente[pid]?.[m] ?? (base === 'devengado' ? (detMap[pid]?.[m] ?? 0) : 0)), 0)
  }
  function realPartida(pid: number) {
    // Los EGRESOS no cambian de base: la OP ya se registra por fecha_op, que es
    // lo más cercano a devengado que hay hoy. Solo los ingresos por cuotas
    // tienen dos bases realmente distintas.
    //
    // Y dentro de los ingresos, los de VENTA DIARIA tampoco: el servicio se
    // presta y se cobra el mismo día, así que su devengado ES su caja. Sin esta
    // excepción quedaban en cero por no tener cartera de dónde devengar
    // (Golf 2026: $5.61M entre Green Fees, Torneos y Tee de Práctica).
    const ventaDiaria = partidas.find(p => p.id === pid)?.devengado_igual_a_cobro
    const fuente = (base === 'devengado' && esIngreso(pid) && !ventaDiaria) ? realDevMap : realMap
    return getMeses().reduce((s, m) => s + (fuente[pid]?.[m] ?? 0), 0)
  }

  // ── Datos de tabla ──────────────────────────────────────────────
  const filas: FilaPartida[] = partidas
    .filter(p => !filterTipo || p.tipo === filterTipo)
    // Filtro por Centro de Ingreso/Sección/Concepto (ingresos) o Centro de
    // Costo/Área (egresos) — mismo modelo que /dashboards/financiero.
    .filter(p => {
      if (p.tipo === 'ingreso') {
        if (filtroCentroIng && p.id_centro_ingreso_fk !== Number(filtroCentroIng)) return false
        if (filtroSeccion && p.id_seccion_fk !== Number(filtroSeccion)) return false
        if (filtroConcepto && p.id_concepto_fk !== Number(filtroConcepto)) return false
      } else {
        if (filtroCC && p.id_centro_costo_fk !== Number(filtroCC)) return false
        if (filtroArea && p.id_area_fk !== Number(filtroArea)) return false
      }
      return true
    })
    .map(p => {
      const pptoVal = pptoPartida(p.id)
      const realVal = realPartida(p.id)
      const varAbs  = realVal - pptoVal
      const varPct  = pptoVal > 0 ? Math.round(((realVal - pptoVal) / pptoVal) * 100) : null
      return { ...p, pptoVal, realVal, varAbs, varPct }
    })
    // Operativo se sigue ocultando en $0 (son cientos de partidas por CC/área).
    // Financiero/Intercompañías siempre se muestran, aunque sigan en $0 —
    // son pocas partidas curadas y el usuario necesita verlas para poder
    // capturarles el primer monto (Captura, "+ Manual", o esperando la OP).
    .filter(p => p.pptoVal > 0 || p.realVal > 0 || p.fuente_real === 'manual'
      || p.clasificacion === 'financiero' || p.clasificacion === 'intercompanias')

  // Ingresos/Egresos combinando TODAS las clasificaciones — usados para el
  // Balance Neto final (grand total) al pie de la tabla.
  const ingRows = filas.filter(p => p.tipo === 'ingreso')
  const egrRows = filas.filter(p => p.tipo === 'egreso')

  // Totales de sección
  function totalSeccion(rows: FilaPartida[], field: 'pptoVal' | 'realVal') {
    return rows.reduce((s, r) => s + r[field], 0)
  }

  function porClasificacion(rows: FilaPartida[], clas: Clasificacion) {
    return rows.filter(p => (p.clasificacion ?? 'operativo') === clas)
  }

  // Agrupa filas por agrupador (partidas sin agrupador van a "Sin Agrupador")
  const SIN_AGRUPADOR = 'Sin Agrupador'
  function agrupar(rows: FilaPartida[]): FilaGrupo[] {
    const map = new Map<number, { nombre: string; orden: number; pptoVal: number; realVal: number; partidas: FilaPartida[] }>()
    rows.forEach(r => {
      const agId = r.id_agrupador_fk ?? 0
      const ag = agId ? agrupadores.find(a => a.id === agId) : null
      if (!map.has(agId)) {
        map.set(agId, { nombre: ag?.nombre ?? SIN_AGRUPADOR, orden: ag?.orden ?? Number.MAX_SAFE_INTEGER, pptoVal: 0, realVal: 0, partidas: [] })
      }
      const g = map.get(agId)!
      g.pptoVal += r.pptoVal
      g.realVal += r.realVal
      g.partidas.push(r)
    })
    return Array.from(map.entries())
      .map(([id, g]) => {
        const varAbs = g.realVal - g.pptoVal
        const varPct = g.pptoVal > 0 ? Math.round(((g.realVal - g.pptoVal) / g.pptoVal) * 100) : null
        return { id: `ag-${id}`, nombre: g.nombre, orden: g.orden, pptoVal: g.pptoVal, realVal: g.realVal, varAbs, varPct, partidas: g.partidas }
      })
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  }

  // Agrupa filas por concepto (tipo_gasto) dentro de un mismo Centro de Costo —
  // nivel intermedio entre Detalle (partida × área) y Agrupado (agrupador
  // general). Partidas sin tipo_gasto (ingreso por sección/concepto/manual)
  // no tienen "concepto" que compartir con nadie más, así que quedan como
  // grupos de 1 (misma fila que en Detalle).
  function agruparPorConcepto(rows: FilaPartida[]): FilaGrupo[] {
    const map = new Map<string, { nombre: string; orden: number; pptoVal: number; realVal: number; partidas: FilaPartida[] }>()
    rows.forEach(r => {
      const key = r.tipo_gasto ? `${r.id_centro_costo_fk ?? 0}-${r.tipo_gasto}` : `p-${r.id}`
      if (!map.has(key)) {
        map.set(key, { nombre: r.tipo_gasto ?? r.nombre, orden: r.orden, pptoVal: 0, realVal: 0, partidas: [] })
      }
      const g = map.get(key)!
      g.orden = Math.min(g.orden, r.orden)
      g.pptoVal += r.pptoVal
      g.realVal += r.realVal
      g.partidas.push(r)
    })
    return Array.from(map.entries())
      .map(([id, g]) => {
        const varAbs = g.realVal - g.pptoVal
        const varPct = g.pptoVal > 0 ? Math.round(((g.realVal - g.pptoVal) / g.pptoVal) * 100) : null
        return { id: `co-${id}`, nombre: g.nombre, orden: g.orden, pptoVal: g.pptoVal, realVal: g.realVal, varAbs, varPct, partidas: g.partidas }
      })
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  }

  const CLASIFICACIONES: Clasificacion[] = ['operativo', 'financiero', 'intercompanias']

  function handleManual(pid: number) {
    setManualPid(pid); setManualMes(filterMes || new Date().getMonth() + 1)
    setEditManualId(null); setManualMonto(''); setManualConc('')
    setModalManual(true)
    loadManualEntries(pid)
  }
  function handleDrill(nombre: string, tipo: 'ingreso' | 'egreso', partidasGrupo: FilaPartida[]) {
    setDrillGrupo({ nombre, tipo, partidas: partidasGrupo })
  }
  const provMap = Object.fromEntries(proveedores.map(pr => [pr.id, pr.nombre]))

  function handleDrillOps(p: FilaPartida) {
    const meses = getMeses()
    const rows = (realDetalle[p.id] ?? [])
      .filter(r => meses.includes(new Date(r.fecha + 'T12:00:00').getMonth() + 1))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))

    // Composición del Real en las 4 bandas — solo para ingresos y solo en base
    // cobro: el devengado no tiene bandas (es la cuota del periodo, punto).
    let bandas: Bandas | null = null
    if (p.tipo === 'ingreso' && base === 'cobro') {
      const acc: Bandas = { vencido: 0, corriente: 0, anticipado: 0, sinClasificar: 0 }
      for (const m of meses) {
        const b = bandasMap[p.id]?.[m]
        if (!b) continue
        acc.vencido += b.vencido; acc.corriente += b.corriente
        acc.anticipado += b.anticipado; acc.sinClasificar += b.sinClasificar
      }
      if (acc.vencido + acc.corriente + acc.anticipado + acc.sinClasificar > 0) bandas = acc
    }

    setDrillOps({ partida: p.nombre, tipo: p.tipo, conOp: p.fuente_real === 'op_area', rows, bandas })
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <Loader size={28} color="#94a3b8" className="animate-spin" />
    </div>
  )

  if (presupuestos.length === 0) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
      <p>No hay presupuestos. Crea uno en la pestaña <strong>Captura</strong>.</p>
    </div>
  )

  const mesLabel = filterMes === 0
    ? 'Acumulado anual'
    : `${MESES[filterMes - 1]} ${selPpto?.anio ?? ''}`

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>

      <PageHeader
        variant="xl"
        icon={BookOpen}
        eyebrowLabel="Presupuestos"
        title="Comparativo Presupuesto vs Real"
        subtitle={`${mesLabel} · ${selPpto?.nombre}`}
        actions={<button className="btn-ghost" onClick={() => selPpto && loadEverything(selPpto.id, selPpto.anio, selPpto.modulo, true)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px' }}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>}
      />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {/* Presupuesto */}
        <select className="input" style={{ width: 280, flex: '0 0 auto' }}
          value={selId ?? ''} onChange={e => onChangePpto(Number(e.target.value))}>
          {presupuestos.map(p => (
            <option key={p.id} value={p.id}>{p.anio} — {p.nombre}</option>
          ))}
        </select>

        {/* Mes */}
        <select className="input" style={{ width: 180, flex: '0 0 auto' }}
          value={filterMes} onChange={e => setFilterMes(Number(e.target.value))}>
          <option value={0}>Acumulado año</option>
          {MESES.map((m, i) => (
            <option key={i + 1} value={i + 1}>{m} {selPpto?.anio}</option>
          ))}
        </select>

        {/* Filtros por CC/Sección (ingresos) y CC/Área (egresos) — mismo modelo que Dashboard Financiero.
            Van antes que Tipo/Vista para que, si el ancho no alcanza, sean Tipo/Vista
            los que bajen de línea — estos filtros de datos se quedan junto a Presupuesto/Mes. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#059669', paddingLeft: 2 }}>
            Ingresos
          </span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select value={filtroCentroIng}
              onChange={e => { setFiltroCentroIng(e.target.value); setFiltroSeccion(''); setFiltroConcepto('') }}
              style={selStyle(!!filtroCentroIng, ING, 148)}>
              <option value="">Todos los centros</option>
              {centrosIng.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {esSecciones && (
              <select value={filtroSeccion} onChange={e => setFiltroSeccion(e.target.value)}
                style={selStyle(!!filtroSeccion, ING, 130)}>
                <option value="">Todas las secciones</option>
                {seccionesF.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            )}
            {esConceptos && conceptosOpts.length > 0 && (
              <select value={filtroConcepto} onChange={e => setFiltroConcepto(e.target.value)}
                style={selStyle(!!filtroConcepto, ING, 140)}>
                <option value="">Todos los conceptos</option>
                {conceptosOpts.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            {hayFiltroIng && (
              <button onClick={() => { setFiltroCentroIng(''); setFiltroSeccion(''); setFiltroConcepto('') }}
                title="Limpiar filtro ingresos"
                style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #bbf7d0',
                  background: '#f0fdf4', color: '#16a34a', cursor: 'pointer', fontSize: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                ✕
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#dc2626', paddingLeft: 2 }}>
            Egresos
          </span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select value={filtroCC}
              onChange={e => { setFiltroCC(e.target.value); setFiltroArea('') }}
              style={selStyle(!!filtroCC, EGR, 148)}>
              <option value="">Todos los CC</option>
              {centrosCostoF.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {filtroCC && (
              <select value={filtroArea} onChange={e => setFiltroArea(e.target.value)}
                style={selStyle(!!filtroArea, EGR, 130)}>
                <option value="">Todas las áreas</option>
                {areasFFiltradas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            )}
            {hayFiltroEgr && (
              <button onClick={() => { setFiltroCC(''); setFiltroArea('') }}
                title="Limpiar filtro egresos"
                style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #fecaca',
                  background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Base de medición: Cobro / Devengado */}
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', borderRadius: 22, padding: '3px 4px', flex: '0 0 auto' }}>
          {([
            { b: 'cobro' as Base,     label: 'Cobro',     t: 'Presupuesto = cobro esperado · Real = recibos por fecha de cobro. Base histórica de este tab.' },
            { b: 'devengado' as Base, label: 'Generado', t: 'Presupuesto = generado esperado · Real = generado de la cartera, prorrateado y sin IVA. Es la base para medir un área mes a mes.' },
          ]).map(({ b, label, t }) => (
            <button key={b} onClick={() => setBase(b)} title={t}
              style={{
                padding: '4px 14px', borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 12,
                background: base === b ? '#fff' : 'transparent',
                color: base === b ? (b === 'devengado' ? '#7c3aed' : '#15803d') : '#64748b',
                fontWeight: base === b ? 700 : 400,
                boxShadow: base === b ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tipo */}
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', borderRadius: 22, padding: '3px 4px', flex: '0 0 auto' }}>
          {(['', 'ingreso', 'egreso'] as const).map(t => (
            <button key={t} onClick={() => setFilterTipo(t)}
              style={{
                padding: '4px 14px', borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 12,
                background: filterTipo === t ? '#fff' : 'transparent',
                color: filterTipo === t ? '#1e293b' : '#64748b',
                fontWeight: filterTipo === t ? 600 : 400,
                boxShadow: filterTipo === t ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}>
              {t === '' ? 'Todos' : t === 'ingreso' ? 'Ingresos' : 'Egresos'}
            </button>
          ))}
        </div>

        {/* Vista: Detalle / Concepto (CC) / Agrupado */}
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', borderRadius: 22, padding: '3px 4px', flex: '0 0 auto' }}>
          {([
            { v: 'detalle',  label: 'Detalle',  icon: List },
            { v: 'concepto', label: 'Concepto', icon: Building2 },
            { v: 'agrupado', label: 'Agrupado', icon: Layers },
          ] as const).map(({ v, label, icon: Icon }) => (
            <button key={v} onClick={() => setVista(v)}
              style={{
                padding: '4px 14px', borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 5,
                background: vista === v ? '#fff' : 'transparent',
                color: vista === v ? '#1e293b' : '#64748b',
                fontWeight: vista === v ? 600 : 400,
                boxShadow: vista === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Qué se está comparando ─────────────────────────────── */}
      {base === 'devengado' && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8,
          background: '#faf5ff', border: '1px solid #e9d5ff', fontSize: 12, color: '#6b21a8' }}>
          <strong>Base generado.</strong>{' '}
          Presupuesto = generado esperado capturado en{' '}
          <a href="/presupuestos/captura" style={{ color: '#7c3aed', fontWeight: 600 }}>Captura</a>{' '}
          (serie «Generado esperado»). Real de <strong>ingresos</strong> = cuotas del periodo según la cartera,
          con las cuotas anuales prorrateadas y el IVA extraído con la tasa configurada de cada cuota.
          Los <strong>egresos no cambian de base</strong>: la OP ya se registra por su fecha, que es lo más
          cercano a lo generado que existe hoy.
          {loadingDev && <> · <em>cargando generado…</em></>}
        </div>
      )}

      {base === 'devengado' && devErrores.map((e, i) => (
        <div key={i} style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 8,
          background: '#fee2e2', border: '1px solid #fecaca', fontSize: 12, color: '#991b1b' }}>
          <strong>Error al calcular el generado:</strong> {e}
        </div>
      ))}

      {base === 'devengado' && devAvisos.map((a, i) => (
        <div key={i} style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 8,
          background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
          {a}
        </div>
      ))}

      {base === 'devengado' && !loadingDev && ingresosSinDevengado.length > 0 && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8,
          background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
          <strong>{ingresosSinDevengado.length} partida(s) de ingreso sin Real generado:</strong>{' '}
          {ingresosSinDevengado.slice(0, 6).map(p => p.nombre).join(' · ')}
          {ingresosSinDevengado.length > 6 && ` … +${ingresosSinDevengado.length - 6}`}.
          Su Real aparece en cero porque su cobranza no lleva cuotas con periodo en la cartera
          (es el caso de Fraccionamiento hasta que se cargue en <code>ctrl.cargos</code>).
          No se rellena con el real de caja: sería comparar contra otra base.
        </div>
      )}

      {/* Tabla */}
      {filas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          Sin datos para el período seleccionado
        </div>
      ) : (
        <>
          <PrintBar title="Comparativo-Presupuesto-vs-Real" count={ingRows.length + egrRows.length}
            reportTitle={`Comparativo Presupuesto vs Real — ${mesLabel} · ${selPpto?.nombre ?? ''} · Vista ${VISTA_LABEL[vista]}`} />
          <style>{`
            @media print {
              #reporte-print-area .ppto-print-band { page-break-after: avoid !important; break-after: avoid !important; }
              #reporte-print-area .ppto-print-total { page-break-before: avoid !important; break-before: avoid !important; }
              #reporte-print-area .btn-ghost { display: none !important; }
            }
          `}</style>
          <div id="reporte-print-area" className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
          <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={th}>Partida</th>
                <th style={{ ...th, textAlign: 'right' }}>Presupuesto</th>
                <th style={{ ...th, textAlign: 'right' }}>Real (sin IVA)</th>
                <th style={{ ...th, textAlign: 'right' }}>Variación</th>
                <th style={{ ...th, textAlign: 'center', minWidth: 110 }}>% Ejercido</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {CLASIFICACIONES.map(clas => {
                const ing = porClasificacion(ingRows, clas)
                const egr = porClasificacion(egrRows, clas)
                return (
                  <SeccionClasificacion key={clas}
                    labels={CLASIFICACION_LABELS[clas]}
                    ingRows={ing} egrRows={egr}
                    ingRowsConcepto={agruparPorConcepto(ing)} egrRowsConcepto={agruparPorConcepto(egr)}
                    ingRowsAgrupado={agrupar(ing)} egrRowsAgrupado={agrupar(egr)}
                    vista={vista} canWriteManual={canWrite('presupuestos')}
                    onManual={handleManual} onDrill={handleDrill} onDrillOps={handleDrillOps}
                  />
                )
              })}

              {/* Balance neto */}
              {ingRows.length > 0 && egrRows.length > 0 && (() => {
                const pptoB = totalSeccion(ingRows, 'pptoVal') - totalSeccion(egrRows, 'pptoVal')
                const realB = totalSeccion(ingRows, 'realVal') - totalSeccion(egrRows, 'realVal')
                const varAbs = realB - pptoB
                return (
                  <tr className="ppto-print-total" style={{ background: '#1e293b', fontWeight: 700 }}>
                    <td style={{ ...td, color: '#f1f5f9', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Balance Neto
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(pptoB)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: realB >= 0 ? '#86efac' : '#fca5a5' }}>
                      {fmt(realB)}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: varAbs >= 0 ? '#86efac' : '#fca5a5' }}>
                      {varAbs !== 0 ? `${varAbs > 0 ? '+' : '-'}${fmt(Math.abs(varAbs))}` : '—'}
                    </td>
                    <td colSpan={2} />
                  </tr>
                )
              })()}
            </tbody>
          </table>
          </div>
          </div>
        </>
      )}

      {/* Modal: Real Manual — agregar, editar y eliminar */}
      {modalManual && manualPid && (
        <ModalShell
          modulo="presupuestos"
          titulo="Real Manual"
          subtitulo={`Partida: ${partidas.find(p => p.id === manualPid)?.nombre ?? ''}`}
          icono={BookOpen}
          maxWidth={460}
          onClose={() => setModalManual(false)}
          footer={<button className="btn-secondary" onClick={() => setModalManual(false)}>Cerrar</button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Montos reales adicionales que no provienen de recibos de ingreso ni órdenes de pago.
              Si un mismo mes tiene más de un registro, se suman.
            </p>

            {manualEntries.length > 0 && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {manualEntries.map((e, i) => (
                  <div key={e.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    borderBottom: i < manualEntries.length - 1 ? '1px solid #f1f5f9' : 'none',
                  }}>
                    {editManualId === e.id ? (
                      <>
                        <span style={{ fontSize: 12, color: '#64748b', width: 34, flexShrink: 0 }}>
                          {MESES[e.mes - 1]}
                        </span>
                        <input className="input" type="number" min={0} step={0.01} autoFocus
                          value={editManualMonto} onChange={ev => setEditManualMonto(ev.target.value)}
                          style={{ width: 100, fontSize: 13 }}
                          onKeyDown={ev => { if (ev.key === 'Enter') saveEditManual(e.id); if (ev.key === 'Escape') setEditManualId(null) }} />
                        <input className="input" value={editManualConc}
                          onChange={ev => setEditManualConc(ev.target.value)}
                          placeholder="Concepto" style={{ flex: 1, fontSize: 13 }} />
                        <button className="btn-ghost" onClick={() => saveEditManual(e.id)} style={{ padding: '4px 8px' }}>
                          <Save size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 12, color: '#64748b', width: 34, flexShrink: 0 }}>
                          {MESES[e.mes - 1]}
                        </span>
                        <button onClick={() => startEditManual(e)} title="Clic para editar"
                          style={{
                            font: 'inherit', fontWeight: 600, color: '#1e293b', background: 'none', border: 'none',
                            padding: 0, cursor: 'pointer', fontVariantNumeric: 'tabular-nums',
                            textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3,
                          }}>
                          {fmt(e.monto)}
                        </button>
                        <span style={{ flex: 1, fontSize: 12, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.concepto ?? '—'}
                        </span>
                        <button className="btn-ghost" onClick={() => deleteManualEntry(e.id)}
                          style={{ padding: '4px 6px', color: '#dc2626' }}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: manualEntries.length > 0 ? '1px solid #f1f5f9' : undefined, paddingTop: manualEntries.length > 0 ? 14 : 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
                Agregar nuevo
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={lbl}>
                  Mes
                  <select className="input" value={manualMes} onChange={e => setManualMes(Number(e.target.value))}>
                    {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m} {selPpto?.anio}</option>)}
                  </select>
                </label>
                <label style={lbl}>
                  Monto *
                  <input className="input" type="number" min={0} step={0.01}
                    value={manualMonto} onChange={e => setManualMonto(e.target.value)}
                    placeholder="0.00" />
                </label>
                <label style={lbl}>
                  Concepto
                  <input className="input" value={manualConc}
                    onChange={e => setManualConc(e.target.value)}
                    placeholder="Descripción del ajuste (opcional)" />
                </label>
                <button className="btn-primary" onClick={saveManual}
                  disabled={savingManual || !manualMonto}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start' }}>
                  {savingManual ? <Loader size={14} className="animate-spin" /> : null}
                  Agregar
                </button>
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Modal: Partidas que integran el monto agrupado */}
      {drillGrupo && (
        <ModalShell
          modulo="presupuestos"
          titulo={`Partidas — ${drillGrupo.nombre}`}
          subtitulo={`${drillGrupo.partidas.length} partida${drillGrupo.partidas.length !== 1 ? 's' : ''}`}
          icono={BookOpen}
          maxWidth={560}
          onClose={() => setDrillGrupo(null)}
          footer={<button className="btn-secondary" onClick={() => setDrillGrupo(null)}>Cerrar</button>}
        >
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={th}>Partida</th>
                  <th style={{ ...th, textAlign: 'right' }}>Presupuesto</th>
                  <th style={{ ...th, textAlign: 'right' }}>Real (sin IVA)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Variación</th>
                </tr>
              </thead>
              <tbody>
                {drillGrupo.partidas
                  .slice()
                  .sort((a, b) => b.realVal - a.realVal)
                  .map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9',
                      background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={td}>{p.nombre}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                        {p.pptoVal > 0 ? fmt(p.pptoVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {p.realVal > 0 ? fmt(p.realVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <VariacionCell varAbs={p.varAbs} varPct={p.varPct} tipo={drillGrupo.tipo} />
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                  <td style={{ ...td, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569' }}>
                    Total
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(drillGrupo.partidas.reduce((s, p) => s + p.pptoVal, 0))}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(drillGrupo.partidas.reduce((s, p) => s + p.realVal, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Modal: Detalle de OP's / recibos que integran el monto real */}
      {drillOps && (
        <ModalShell
          modulo="presupuestos"
          titulo={`Real — ${drillOps.partida}`}
          subtitulo={`${drillOps.rows.length} movimiento${drillOps.rows.length !== 1 ? 's' : ''} · ${mesLabel}`}
          icono={BookOpen}
          maxWidth={620}
          onClose={() => setDrillOps(null)}
          footer={<button className="btn-secondary" onClick={() => setDrillOps(null)}>Cerrar</button>}
        >
          {/* Composición del Real: de esta cifra, cuánto es desempeño del mes,
              cuánto recuperación de cartera y cuánto dinero de meses futuros. */}
          {drillOps.bandas && (() => {
            const b = drillOps.bandas!
            const tot = b.vencido + b.corriente + b.anticipado + b.sinClasificar
            const pc = (v: number) => tot > 0 ? `${((v / tot) * 100).toFixed(1)}%` : '—'
            const items = [
              { label: 'Corriente',          sub: 'cuota del propio mes — desempeño del mes', v: b.corriente,     c: '#16a34a', bg: '#f0fdf4' },
              { label: 'Vencida recuperada', sub: 'de meses anteriores — recuperación de cartera', v: b.vencido,   c: '#dc2626', bg: '#fef2f2' },
              { label: 'Anticipada',         sub: 'de meses futuros — pago adelantado', v: b.anticipado,           c: '#2563eb', bg: '#eff6ff' },
              { label: 'Sin clasificar',     sub: 'no capturado, o conceptos sin periodo', v: b.sinClasificar,     c: '#64748b', bg: '#f8fafc' },
            ].filter(i => i.v !== 0)
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Composición del Real — {fmt(tot)}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {items.map(i => (
                    <div key={i.label} title={i.sub}
                      style={{ flex: '1 1 130px', padding: '9px 11px', borderRadius: 8, background: i.bg, border: `1px solid ${i.c}33` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: i.c }}>{i.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{fmt(i.v)}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{pc(i.v)}</div>
                    </div>
                  ))}
                </div>
                {b.sinClasificar > 0 && (
                  <div style={{ fontSize: 10.5, color: '#92400e', marginTop: 6 }}>
                    Lo no clasificado se captura por recibo en <strong>Ingresos</strong> (toggle «Clasificar cobranza»),
                    o se calcula solo en los meses posteriores al corte a ingreso derivado.
                  </div>
                )}
              </div>
            )
          })()}

          {drillOps.rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 13 }}>
              Sin movimientos para el período seleccionado
            </div>
          ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={th}>Fecha</th>
                    <th style={th}>Folio</th>
                    <th style={th}>{drillOps.conOp ? 'Proveedor' : 'Descripción'}</th>
                    {drillOps.conOp && <th style={th}>Tipo de Gasto</th>}
                    <th style={{ ...th, textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {drillOps.rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9',
                      background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={td}>{fmtFecha(r.fecha)}</td>
                      <td style={{ ...td, fontWeight: 600, color: r.id_op_fk ? '#2563eb' : '#1e293b' }}>
                        {r.id_op_fk ? (
                          <button onClick={() => abrirOP(r.id_op_fk!)} disabled={opLoading}
                            style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', fontWeight: 600,
                              fontFamily: 'inherit', fontSize: 'inherit', cursor: opLoading ? 'default' : 'pointer', textDecoration: 'underline' }}>
                            {r.folio ?? '—'}
                          </button>
                        ) : (r.folio ?? '—')}
                      </td>
                      <td style={{ ...td, color: '#475569' }}>
                        {drillOps.conOp ? (r.id_proveedor_fk ? (provMap[r.id_proveedor_fk] ?? `#${r.id_proveedor_fk}`) : (r.descripcion ?? '—')) : (r.descripcion ?? '—')}
                      </td>
                      {drillOps.conOp && <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{r.tipo_gasto ?? '—'}</td>}
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {fmt(r.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                    <td colSpan={drillOps.conOp ? 4 : 3} style={{ ...td, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569' }}>
                      Total
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(drillOps.rows.reduce((s, r) => s + r.monto, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </ModalShell>
      )}

      {opDetalle && (
        <OPDetail
          op={opDetalle}
          onClose={() => setOpDetalle(null)}
          onCanceled={() => { setOpDetalle(null); selPpto && loadEverything(selPpto.id, selPpto.anio, selPpto.modulo, true) }}
          onAuthorized={() => { setOpDetalle(null); selPpto && loadEverything(selPpto.id, selPpto.anio, selPpto.modulo, true) }}
          onEdit={() => router.push('/compras/ordenes-pago')}
        />
      )}
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function totalSeccionRows(rows: FilaPartida[], field: 'pptoVal' | 'realVal') {
  return rows.reduce((s, r) => s + r[field], 0)
}

function SeccionClasificacion({ labels, ingRows, egrRows, ingRowsConcepto, egrRowsConcepto, ingRowsAgrupado, egrRowsAgrupado, vista, canWriteManual, onManual, onDrill, onDrillOps }: {
  labels: { ingresos: string; egresos: string; balance: string }
  ingRows: FilaPartida[]; egrRows: FilaPartida[]
  ingRowsConcepto: FilaGrupo[]; egrRowsConcepto: FilaGrupo[]
  ingRowsAgrupado: FilaGrupo[]; egrRowsAgrupado: FilaGrupo[]
  vista: 'detalle' | 'concepto' | 'agrupado'
  canWriteManual: boolean
  onManual: (pid: number) => void
  onDrill: (nombre: string, tipo: 'ingreso' | 'egreso', partidas: FilaPartida[]) => void
  onDrillOps: (p: FilaPartida) => void
}) {
  if (ingRows.length === 0 && egrRows.length === 0) return null
  const ingGrupo = vista === 'concepto' ? ingRowsConcepto : ingRowsAgrupado
  const egrGrupo = vista === 'concepto' ? egrRowsConcepto : egrRowsAgrupado
  return (
    <>
      {ingRows.length > 0 && (
        <>
          <tr className="ppto-print-band">
            <td colSpan={6} style={{
              padding: '7px 16px', background: '#f0fdf4',
              fontWeight: 700, fontSize: 11, color: '#15803d',
              textTransform: 'uppercase', letterSpacing: '.06em',
              borderTop: '2px solid #bbf7d0',
            }}>
              {labels.ingresos}
            </td>
          </tr>
          {vista === 'detalle' ? ingRows.map((p, i) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9',
              background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</span>{p.descripcion && <span style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>{p.descripcion}</span>}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                {p.pptoVal > 0 ? fmt(p.pptoVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {p.realVal > 0
                  ? <MontoDrillButton monto={p.realVal} fmt={fmt}
                      onClick={() => p.fuente_real === 'manual' ? onManual(p.id) : onDrillOps(p)} />
                  : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <VariacionCell varAbs={p.varAbs} varPct={p.varPct} tipo="ingreso" />
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <PctEjercidoCell real={p.realVal} ppto={p.pptoVal} tipo="ingreso" />
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                {canWriteManual && p.fuente_real === 'manual' && (
                  <button className="btn-ghost" onClick={() => onManual(p.id)}
                    style={{ fontSize: 11, padding: '3px 8px', color: '#64748b' }}>
                    + Manual
                  </button>
                )}
              </td>
            </tr>
          )) : ingGrupo.map((g, i) => (
            <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9',
              background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{g.nombre}</span></td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                {g.pptoVal > 0 ? <MontoDrillButton monto={g.pptoVal} onClick={() => onDrill(g.nombre, 'ingreso', g.partidas)} fmt={fmt} /> : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {g.realVal > 0 ? <MontoDrillButton monto={g.realVal} onClick={() => onDrill(g.nombre, 'ingreso', g.partidas)} fmt={fmt} /> : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <VariacionCell varAbs={g.varAbs} varPct={g.varPct} tipo="ingreso" />
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <PctEjercidoCell real={g.realVal} ppto={g.pptoVal} tipo="ingreso" />
              </td>
              <td style={td}></td>
            </tr>
          ))}
          <TotalSectionRow
            label={`Total ${labels.ingresos}`}
            ppto={totalSeccionRows(ingRows, 'pptoVal')}
            real={totalSeccionRows(ingRows, 'realVal')}
            tipo="ingreso"
            bg="#dcfce7" color="#15803d" bgTotal="#bbf7d0"
          />
        </>
      )}

      {egrRows.length > 0 && (
        <>
          <tr className="ppto-print-band">
            <td colSpan={6} style={{
              padding: '7px 16px', background: '#fef2f2',
              fontWeight: 700, fontSize: 11, color: '#b91c1c',
              textTransform: 'uppercase', letterSpacing: '.06em',
              borderTop: '2px solid #fecaca',
            }}>
              {labels.egresos}
            </td>
          </tr>
          {vista === 'detalle' ? egrRows.map((p, i) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9',
              background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</span>{p.descripcion && <span style={{ display: 'block', fontSize: 11, color: '#94a3b8' }}>{p.descripcion}</span>}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                {p.pptoVal > 0 ? fmt(p.pptoVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {p.realVal > 0
                  ? <MontoDrillButton monto={p.realVal} fmt={fmt}
                      onClick={() => p.fuente_real === 'manual' ? onManual(p.id) : onDrillOps(p)} />
                  : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <VariacionCell varAbs={p.varAbs} varPct={p.varPct} tipo="egreso" />
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <PctEjercidoCell real={p.realVal} ppto={p.pptoVal} tipo="egreso" />
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                {canWriteManual && p.fuente_real === 'manual' && (
                  <button className="btn-ghost" onClick={() => onManual(p.id)}
                    style={{ fontSize: 11, padding: '3px 8px', color: '#64748b' }}>
                    + Manual
                  </button>
                )}
              </td>
            </tr>
          )) : egrGrupo.map((g, i) => (
            <tr key={g.id} style={{ borderBottom: '1px solid #f1f5f9',
              background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{g.nombre}</span></td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                {g.pptoVal > 0 ? <MontoDrillButton monto={g.pptoVal} onClick={() => onDrill(g.nombre, 'egreso', g.partidas)} fmt={fmt} /> : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {g.realVal > 0 ? <MontoDrillButton monto={g.realVal} onClick={() => onDrill(g.nombre, 'egreso', g.partidas)} fmt={fmt} /> : <span style={{ color: '#cbd5e1' }}>—</span>}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <VariacionCell varAbs={g.varAbs} varPct={g.varPct} tipo="egreso" />
              </td>
              <td style={{ ...td, textAlign: 'center' }}>
                <PctEjercidoCell real={g.realVal} ppto={g.pptoVal} tipo="egreso" />
              </td>
              <td style={td}></td>
            </tr>
          ))}
          <TotalSectionRow
            label={`Total ${labels.egresos}`}
            ppto={totalSeccionRows(egrRows, 'pptoVal')}
            real={totalSeccionRows(egrRows, 'realVal')}
            tipo="egreso"
            bg="#fee2e2" color="#b91c1c" bgTotal="#fecaca"
          />
        </>
      )}

      {ingRows.length > 0 && egrRows.length > 0 && (() => {
        const pptoB = totalSeccionRows(ingRows, 'pptoVal') - totalSeccionRows(egrRows, 'pptoVal')
        const realB = totalSeccionRows(ingRows, 'realVal') - totalSeccionRows(egrRows, 'realVal')
        const varAbs = realB - pptoB
        return (
          <tr style={{ background: '#334155', fontWeight: 700 }}>
            <td style={{ ...td, color: '#f1f5f9', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {labels.balance}
            </td>
            <td style={{ ...td, textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(pptoB)}
            </td>
            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              color: realB >= 0 ? '#86efac' : '#fca5a5' }}>
              {fmt(realB)}
            </td>
            <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              color: varAbs >= 0 ? '#86efac' : '#fca5a5' }}>
              {varAbs !== 0 ? `${varAbs > 0 ? '+' : '-'}${fmt(Math.abs(varAbs))}` : '—'}
            </td>
            <td colSpan={2} />
          </tr>
        )
      })()}
    </>
  )
}

function TotalSectionRow({ label, ppto, real, tipo, bg, color, bgTotal }: {
  label: string; ppto: number; real: number; tipo: 'ingreso' | 'egreso'
  bg: string; color: string; bgTotal: string
}) {
  const varAbs = real - ppto
  const varPct = ppto > 0 ? Math.round(((real - ppto) / ppto) * 100) : null
  return (
    <tr className="ppto-print-total" style={{ background: bg, fontWeight: 700 }}>
      <td style={{ padding: '10px 16px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color }}>
        {label}
      </td>
      <td style={{ padding: '10px 16px', textAlign: 'right', color, fontVariantNumeric: 'tabular-nums' }}>
        {fmt(ppto)}
      </td>
      <td style={{ padding: '10px 16px', textAlign: 'right', color, fontVariantNumeric: 'tabular-nums', background: bgTotal }}>
        {fmt(real)}
      </td>
      <td style={{ padding: '10px 16px', textAlign: 'right', color }}>
        {varAbs !== 0
          ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{varAbs > 0 ? '+' : '-'}{fmt(Math.abs(varAbs))}</span>
          : '—'}
      </td>
      <td style={{ padding: '10px 16px', textAlign: 'center' }}>
        {varPct !== null ? (
          <span style={{ fontSize: 13, fontWeight: 700, color }}>
            {varPct > 0 ? '+' : ''}{varPct}%
          </span>
        ) : '—'}
      </td>
      <td />
    </tr>
  )
}

const th: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'left', fontSize: 11,
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em',
}
const td: React.CSSProperties = { padding: '10px 16px', fontSize: 13, color: '#374151' }
const lbl: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 13, fontWeight: 500, color: '#374151',
}
