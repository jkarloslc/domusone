'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp, dbCfg } from '@/lib/supabase'
import { Loader, RefreshCw, Wallet, Info, Layers, List, Trash2, Save, Building2 } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { useAuth } from '@/lib/AuthContext'
import { resolverCategoriasPorOp } from '@/lib/pptoOcCategoria'
import { prorratearDescuento } from '@/lib/prorateoDescuento'

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
}
type DetMapTx = Record<number, DetalleTransaccion[]>
type CentroIng    = { id: number; nombre: string; tipo_desglose: string }
type SeccionF     = { id: number; nombre: string }
type ConceptoF    = { id: number; nombre: string; id_centro_ingreso_fk: number | null }
type CentroCostoF = { id: number; nombre: string }
type AreaF        = { id: number; nombre: string; id_centro_costo_fk: number }

const CLASIFICACION_LABELS: Record<Clasificacion, { ingresos: string; egresos: string; balance: string }> = {
  operativo:      { ingresos: 'Ingresos (cobrado)',                 egresos: 'Egresos (pagado)',                 balance: 'Flujo Operativo' },
  financiero:     { ingresos: 'Ingreso Financiero (cobrado)',        egresos: 'Egreso Financiero (pagado)',        balance: 'Flujo Financiero' },
  intercompanias: { ingresos: 'Ingreso Intercompañías (cobrado)',    egresos: 'Egreso Intercompañías (pagado)',    balance: 'Flujo Intercompañías' },
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

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

function VariacionCell({ varAbs, varPct, tipo }: { varAbs: number; varPct: number | null; tipo: 'ingreso' | 'egreso' }) {
  if (varAbs === 0 && !varPct) return <span style={{ color: '#94a3b8' }}>—</span>
  const positivo = varAbs >= 0
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
export default function FlujoEfectivoPage() {
  const { canWrite } = useAuth()
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [selId, setSelId]               = useState<number | null>(null)
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)

  const [partidas, setPartidas] = useState<Partida[]>([])
  const [detMap,   setDetMap]   = useState<DetMap>({})
  const [realMap,  setRealMap]  = useState<DetMap>({})
  const [realDetalle, setRealDetalle] = useState<DetMapTx>({})
  const [agrupadores, setAgrupadores] = useState<Agrupador[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [drillOps, setDrillOps] = useState<{ partida: string; tipo: 'ingreso' | 'egreso'; conOp: boolean; rows: DetalleTransaccion[] } | null>(null)

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

  // Modal añadir/editar real manual (partidas adicionales de flujo, financiamiento, etc.)
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
      .select('id, nombre, descripcion, tipo, orden, fuente_real, id_centro_ingreso_fk, id_centro_costo_fk, id_area_fk, id_seccion_fk, id_concepto_fk, tipo_gasto, id_agrupador_fk, clasificacion')
      .eq('activo', true)
      .eq('incluir_flujo', true)
    if (modulo) partidasQ = (partidasQ as any).eq('modulo', modulo)

    const [{ data: pData }, { data: det }, { data: manual }] = await Promise.all([
      partidasQ.order('tipo').order('orden').order('nombre'),
      dbCtrl.from('ppto_presupuesto_det')
        .select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', pptoId),
      dbCtrl.from('ppto_presupuesto_real_manual')
        .select('id_partida_fk, mes, monto').eq('id_presupuesto_fk', pptoId),
    ])

    const parts = (pData ?? []) as Partida[]
    setPartidas(parts)

    // Presupuestado: idénticos montos ya cargados en Captura (mismos que Presupuestos)
    const dm: DetMap = {}
    ;(det ?? []).forEach((r: any) => {
      if (!dm[r.id_partida_fk]) dm[r.id_partida_fk] = {}
      dm[r.id_partida_fk][r.mes] = Number(r.monto)
    })
    setDetMap(dm)

    // ── Clasificar partidas por fuente real ──────────────────────
    const secParts  = parts.filter(p => p.fuente_real === 'seccion'  && p.id_seccion_fk)
    const concParts = parts.filter(p => p.fuente_real === 'concepto' && p.id_concepto_fk)
    const areaParts = parts.filter(p => p.fuente_real === 'op_area'  && p.id_area_fk)

    const secIds  = Array.from(new Set(secParts.map(p => p.id_seccion_fk!)))
    const concIds = Array.from(new Set(concParts.map(p => p.id_concepto_fk!)))
    const areaIds = Array.from(new Set(areaParts.map(p => p.id_area_fk!)))

    // ── Consultas en paralelo ────────────────────────────────────
    // Ingresos: recibos confirmados — misma fuente que el Comparativo de Presupuestos.
    // Egresos: pagos reales de OP (cxp_abonos) en su fecha real de pago — base efectivo,
    // incluye abonos parciales aunque la OP siga en status "Abonada".
    const [{ data: secData }, { data: concData }, { data: abonosData }] = await Promise.all([
      secIds.length > 0
        ? (dbCtrl.from('recibos_ingreso_secciones') as any)
            .select('id_seccion_fk, monto, recibos_ingreso!inner(status, fecha, folio, descripcion)')
            .in('id_seccion_fk', secIds)
            .eq('recibos_ingreso.status', 'Confirmado')
            .gte('recibos_ingreso.fecha', `${anio}-01-01`)
            .lte('recibos_ingreso.fecha', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
      concIds.length > 0
        ? (dbCtrl.from('recibos_ingreso_conceptos') as any)
            .select('id_concepto_fk, monto, recibos_ingreso!inner(status, fecha, folio, descripcion)')
            .in('id_concepto_fk', concIds)
            .eq('recibos_ingreso.status', 'Confirmado')
            .gte('recibos_ingreso.fecha', `${anio}-01-01`)
            .lte('recibos_ingreso.fecha', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
      areaIds.length > 0
        ? (dbComp.from('cxp_abonos') as any)
            .select('id_op_fk, monto, fecha_abono, ordenes_pago!inner(id_area_fk, tipo_gasto, status, monto, id_oc_fk, folio, concepto, id_proveedor_fk)')
            .in('ordenes_pago.id_area_fk', areaIds)
            .neq('ordenes_pago.status', 'Cancelada')
            .gte('fecha_abono', `${anio}-01-01`)
            .lte('fecha_abono', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
    ])

    // OP con distribución por área (ordenes_pago_det): el encabezado queda con
    // id_area_fk null, así que sus abonos no los captura la consulta de arriba.
    // Cada abono se prorratea entre las líneas según la proporción de cada línea
    // sobre el monto total de la OP.
    let abonosDistribuidos: any[] = []
    if (areaIds.length > 0) {
      const { data: abonosDist } = await (dbComp.from('cxp_abonos') as any)
        .select('id_op_fk, monto, fecha_abono, ordenes_pago!inner(id_area_fk, tipo_gasto, status, monto, folio, concepto, id_proveedor_fk)')
        .is('ordenes_pago.id_area_fk', null)
        .neq('ordenes_pago.status', 'Cancelada')
        .gte('fecha_abono', `${anio}-01-01`)
        .lte('fecha_abono', `${anio}-12-31`)
      const opIdsDist = Array.from(new Set((abonosDist ?? []).map((a: any) => a.id_op_fk)))
      if (opIdsDist.length > 0) {
        const { data: detDist } = await (dbComp.from('ordenes_pago_det') as any)
          .select('id_op_fk, id_area_fk, monto')
          .in('id_op_fk', opIdsDist)
          .in('id_area_fk', areaIds)
        abonosDistribuidos = (abonosDist ?? []).flatMap((a: any) => {
          const montoOP = Number(a.ordenes_pago.monto) || 0
          if (montoOP <= 0) return []
          return (detDist ?? [])
            .filter((d: any) => d.id_op_fk === a.id_op_fk)
            .map((d: any) => ({
              monto: Number(a.monto) * (Number(d.monto) / montoOP),
              fecha_abono: a.fecha_abono,
              ordenes_pago: {
                id_area_fk: d.id_area_fk, tipo_gasto: a.ordenes_pago.tipo_gasto, status: a.ordenes_pago.status,
                folio: a.ordenes_pago.folio, concepto: a.ordenes_pago.concepto, id_proveedor_fk: a.ordenes_pago.id_proveedor_fk,
              },
            }))
        })
      }
    }
    // OP con OC (tipo_gasto null por diseño): se reatribuyen a la categoría de
    // los artículos realmente comprados en vez de caer siempre en el catch-all.
    // Las fracciones se resuelven una sola vez por OP y se aplican a cada uno
    // de sus abonos. Si aún no existe una partida específica para esa
    // categoría en el área, el catch-all la sigue capturando sin cambios (ver
    // tiposEspecificosPorArea más abajo) — seguro desplegar antes de crear
    // esas partidas.
    const opIdsOC: number[] = Array.from(new Set(
      (abonosData ?? [])
        .filter((a: any) => a.ordenes_pago.tipo_gasto === null && a.ordenes_pago.id_oc_fk != null)
        .map((a: any) => a.id_op_fk as number)
    ))
    const candidatosOC = opIdsOC.map(id => {
      const a = (abonosData ?? []).find((x: any) => x.id_op_fk === id)
      return { id, id_oc_fk: a.ordenes_pago.id_oc_fk }
    })
    const categoriasPorOp = await resolverCategoriasPorOp(candidatosOC)
    const abonosCategoria: any[] = []
    ;(abonosData ?? []).forEach((a: any) => {
      const shares = categoriasPorOp.get(a.id_op_fk)
      if (!shares) return
      prorratearDescuento(shares, s => s.fraction, 1, Number(a.monto)).forEach(({ item, montoNeto }) => {
        abonosCategoria.push({
          monto: montoNeto, fecha_abono: a.fecha_abono,
          ordenes_pago: {
            id_area_fk: a.ordenes_pago.id_area_fk, tipo_gasto: item.categoria, status: a.ordenes_pago.status,
            folio: a.ordenes_pago.folio, concepto: a.ordenes_pago.concepto, id_proveedor_fk: a.ordenes_pago.id_proveedor_fk,
          },
        })
      })
    })

    const abonosTodos = [
      ...(abonosData ?? []).filter((a: any) => !categoriasPorOp.has(a.id_op_fk)),
      ...abonosDistribuidos,
      ...abonosCategoria,
    ]

    // ── Construir realMap + detalle transaccional (drill-down por OP/recibo) ──
    const rm: DetMap = {}
    const rd: DetMapTx = {}

    // Por sección
    secParts.forEach(p => {
      rm[p.id] = {}
      rd[p.id] = []
      ;(secData ?? []).filter((r: any) => r.id_seccion_fk === p.id_seccion_fk)
        .forEach((r: any) => {
          const mes = new Date(r.recibos_ingreso.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(r.monto)
          rd[p.id].push({ fecha: r.recibos_ingreso.fecha, monto: Number(r.monto), folio: r.recibos_ingreso.folio, descripcion: r.recibos_ingreso.descripcion })
        })
    })

    // Por concepto
    concParts.forEach(p => {
      rm[p.id] = {}
      rd[p.id] = []
      ;(concData ?? []).filter((r: any) => r.id_concepto_fk === p.id_concepto_fk)
        .forEach((r: any) => {
          const mes = new Date(r.recibos_ingreso.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(r.monto)
          rd[p.id].push({ fecha: r.recibos_ingreso.fecha, monto: Number(r.monto), folio: r.recibos_ingreso.folio, descripcion: r.recibos_ingreso.descripcion })
        })
    })

    // Por área — pagos reales de OP (abonos CXP), base efectivo por fecha_abono.
    // Una partida "catch-all" (sin tipo_gasto) de un área excluye los tipo_gasto que
    // ya cubre otra partida específica de esa misma área, para no contar el mismo
    // abono dos veces.
    const tiposEspecificosPorArea: Record<number, Set<string>> = {}
    areaParts.forEach(p => {
      if (p.tipo_gasto && p.id_area_fk) {
        if (!tiposEspecificosPorArea[p.id_area_fk]) tiposEspecificosPorArea[p.id_area_fk] = new Set()
        tiposEspecificosPorArea[p.id_area_fk].add(p.tipo_gasto)
      }
    })

    areaParts.forEach(p => {
      rm[p.id] = {}
      rd[p.id] = []
      const tiposCubiertos = !p.tipo_gasto && p.id_area_fk ? tiposEspecificosPorArea[p.id_area_fk] : null
      abonosTodos.filter((a: any) => {
          const op = a.ordenes_pago
          if (!op) return false
          if (p.id_area_fk && op.id_area_fk !== p.id_area_fk) return false
          if (p.tipo_gasto && op.tipo_gasto !== p.tipo_gasto) return false
          if (tiposCubiertos && op.tipo_gasto && tiposCubiertos.has(op.tipo_gasto)) return false
          return true
        })
        .forEach((a: any) => {
          if (!a.fecha_abono) return
          const mes = new Date(a.fecha_abono + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(a.monto)
          rd[p.id].push({
            fecha: a.fecha_abono, monto: Number(a.monto), folio: a.ordenes_pago.folio,
            id_proveedor_fk: a.ordenes_pago.id_proveedor_fk, tipo_gasto: a.ordenes_pago.tipo_gasto, descripcion: a.ordenes_pago.concepto,
          })
        })
    })

    // Real manual sumado encima del auto (partidas adicionales de flujo, financiamiento, etc.)
    ;(manual ?? []).forEach((r: any) => {
      if (!rm[r.id_partida_fk]) rm[r.id_partida_fk] = {}
      rm[r.id_partida_fk][r.mes] = (rm[r.id_partida_fk][r.mes] ?? 0) + Number(r.monto)
    })

    setRealMap(rm)
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

  // ── Helpers de agregación ──────────────────────────────────────
  const getMeses = () => filterMes === 0 ? Array.from({ length: 12 }, (_, i) => i + 1) : [filterMes]

  function pptoPartida(pid: number) {
    return getMeses().reduce((s, m) => s + (detMap[pid]?.[m] ?? 0), 0)
  }
  function realPartida(pid: number) {
    return getMeses().reduce((s, m) => s + (realMap[pid]?.[m] ?? 0), 0)
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
  // Flujo Neto final (grand total) al pie de la tabla.
  const ingRows = filas.filter(p => p.tipo === 'ingreso')
  const egrRows = filas.filter(p => p.tipo === 'egreso')

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
    const map = new Map<string, { nombre: string; pptoVal: number; realVal: number; partidas: FilaPartida[] }>()
    rows.forEach(r => {
      const key = r.tipo_gasto ? `${r.id_centro_costo_fk ?? 0}-${r.tipo_gasto}` : `p-${r.id}`
      if (!map.has(key)) {
        map.set(key, { nombre: r.tipo_gasto ?? r.nombre, pptoVal: 0, realVal: 0, partidas: [] })
      }
      const g = map.get(key)!
      g.pptoVal += r.pptoVal
      g.realVal += r.realVal
      g.partidas.push(r)
    })
    return Array.from(map.entries())
      .map(([id, g]) => {
        const varAbs = g.realVal - g.pptoVal
        const varPct = g.pptoVal > 0 ? Math.round(((g.realVal - g.pptoVal) / g.pptoVal) * 100) : null
        return { id: `co-${id}`, nombre: g.nombre, orden: 0, pptoVal: g.pptoVal, realVal: g.realVal, varAbs, varPct, partidas: g.partidas }
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
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
    setDrillOps({ partida: p.nombre, tipo: p.tipo, conOp: p.fuente_real === 'op_area', rows })
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

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left" style={{ display: 'block' }}>
          <div className="page-eyebrow">
            <Wallet size={15} style={{ color: 'var(--blue)' }} />
            <span className="page-eyebrow-label">Presupuestos</span>
          </div>
          <h1 className="page-title-xl">Flujo de Efectivo: Presupuestado vs Real</h1>
          <p className="page-subtitle">{mesLabel} · {selPpto?.nombre}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn-ghost" onClick={() => selPpto && loadEverything(selPpto.id, selPpto.anio, selPpto.modulo, true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px' }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Nota de metodología */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16,
        padding: '10px 14px', borderRadius: 8, background: '#eef2ff',
        border: '1px solid #c7d2fe', fontSize: 12, color: '#3730a3',
      }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          <strong>Ingresos:</strong> recibos confirmados, misma fuente que Presupuestos.{' '}
          <strong>Egresos:</strong> pagos reales de Órdenes de Pago (abonos CXP) en su fecha de pago —
          base de efectivo, incluye abonos parciales aunque la OP siga en status &quot;Abonada&quot;.{' '}
          <strong>Presupuestado:</strong> mismos montos capturados en Presupuestos.
        </span>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
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

      {/* Filtros por CC/Sección (ingresos) y CC/Área (egresos) — mismo modelo que Dashboard Financiero */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
      </div>

      {/* Tabla */}
      {filas.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
          Sin datos para el período seleccionado
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={th}>Partida</th>
                <th style={{ ...th, textAlign: 'right' }}>Presupuestado</th>
                <th style={{ ...th, textAlign: 'right' }}>Real (Efectivo)</th>
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

              {/* Flujo neto */}
              {ingRows.length > 0 && egrRows.length > 0 && (() => {
                const pptoB = totalSeccion(ingRows, 'pptoVal') - totalSeccion(egrRows, 'pptoVal')
                const realB = totalSeccion(ingRows, 'realVal') - totalSeccion(egrRows, 'realVal')
                const varAbs = realB - pptoB
                return (
                  <tr style={{ background: '#1e293b', fontWeight: 700 }}>
                    <td style={{ ...td, color: '#f1f5f9', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      Flujo Neto de Efectivo
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
      )}

      {/* Modal: Real Manual — agregar, editar y eliminar */}
      {modalManual && manualPid && (
        <ModalShell
          modulo="presupuestos"
          titulo="Real Manual"
          subtitulo={`Partida: ${partidas.find(p => p.id === manualPid)?.nombre ?? ''}`}
          icono={Wallet}
          maxWidth={460}
          onClose={() => setModalManual(false)}
          footer={<button className="btn-secondary" onClick={() => setModalManual(false)}>Cerrar</button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Montos reales adicionales que no provienen de recibos de ingreso ni de abonos de OP
              (por ejemplo, movimientos de financiamiento: préstamos, aportaciones de socios, pago de capital
              de deuda). Si un mismo mes tiene más de un registro, se suman.
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
          icono={Wallet}
          maxWidth={560}
          onClose={() => setDrillGrupo(null)}
          footer={<button className="btn-secondary" onClick={() => setDrillGrupo(null)}>Cerrar</button>}
        >
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={th}>Partida</th>
                  <th style={{ ...th, textAlign: 'right' }}>Presupuestado</th>
                  <th style={{ ...th, textAlign: 'right' }}>Real</th>
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
        </ModalShell>
      )}

      {/* Modal: Detalle de OP's / recibos que integran el monto real */}
      {drillOps && (
        <ModalShell
          modulo="presupuestos"
          titulo={`Real — ${drillOps.partida}`}
          subtitulo={`${drillOps.rows.length} movimiento${drillOps.rows.length !== 1 ? 's' : ''} · ${mesLabel}`}
          icono={Wallet}
          maxWidth={620}
          onClose={() => setDrillOps(null)}
          footer={<button className="btn-secondary" onClick={() => setDrillOps(null)}>Cerrar</button>}
        >
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
                      <td style={{ ...td, fontWeight: 600, color: '#1e293b' }}>{r.folio ?? '—'}</td>
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
          <tr>
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
          <tr>
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
    <tr style={{ background: bg, fontWeight: 700 }}>
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
