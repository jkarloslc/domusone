'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCtrl, dbComp } from '@/lib/supabase'
import { Loader, RefreshCw, Wallet, Info } from 'lucide-react'
import ModalShell from '@/components/ui/ModalShell'
import { useAuth } from '@/lib/AuthContext'

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Presupuesto = { id: number; anio: number; nombre: string; status: string; modulo: string }
type Partida     = {
  id: number; nombre: string; tipo: 'ingreso' | 'egreso'; orden: number
  fuente_real:          string | null
  id_centro_ingreso_fk: number | null
  id_centro_costo_fk:   number | null
  id_area_fk:           number | null
  id_seccion_fk:        number | null
  id_concepto_fk:       number | null
  tipo_gasto:           string | null
}
type DetMap = Record<number, Record<number, number>>

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

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

  // Filtros
  const [filterTipo, setFilterTipo] = useState<'' | 'ingreso' | 'egreso'>('')
  const [filterMes,  setFilterMes]  = useState<number>(0) // 0 = Acumulado

  // Modal añadir real manual (partidas adicionales de flujo, financiamiento, etc.)
  const [modalManual, setModalManual] = useState(false)
  const [manualPid,   setManualPid]   = useState<number | null>(null)
  const [manualMes,   setManualMes]   = useState(new Date().getMonth() + 1)
  const [manualMonto, setManualMonto] = useState('')
  const [manualConc,  setManualConc]  = useState('')
  const [savingManual, setSavingManual] = useState(false)

  const loadEverything = useCallback(async (pptoId: number, anio: number, modulo: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true)

    let partidasQ = dbCtrl.from('ppto_partidas')
      .select('id, nombre, tipo, orden, fuente_real, id_centro_ingreso_fk, id_centro_costo_fk, id_area_fk, id_seccion_fk, id_concepto_fk, tipo_gasto')
      .eq('activo', true)
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
            .select('id_seccion_fk, monto, recibos_ingreso!inner(status, fecha)')
            .in('id_seccion_fk', secIds)
            .eq('recibos_ingreso.status', 'Confirmado')
            .gte('recibos_ingreso.fecha', `${anio}-01-01`)
            .lte('recibos_ingreso.fecha', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
      concIds.length > 0
        ? (dbCtrl.from('recibos_ingreso_conceptos') as any)
            .select('id_concepto_fk, monto, recibos_ingreso!inner(status, fecha)')
            .in('id_concepto_fk', concIds)
            .eq('recibos_ingreso.status', 'Confirmado')
            .gte('recibos_ingreso.fecha', `${anio}-01-01`)
            .lte('recibos_ingreso.fecha', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
      areaIds.length > 0
        ? (dbComp.from('cxp_abonos') as any)
            .select('monto, fecha_abono, ordenes_pago!inner(id_area_fk, tipo_gasto, status)')
            .in('ordenes_pago.id_area_fk', areaIds)
            .neq('ordenes_pago.status', 'Cancelada')
            .gte('fecha_abono', `${anio}-01-01`)
            .lte('fecha_abono', `${anio}-12-31`)
        : Promise.resolve({ data: [] }),
    ])

    // ── Construir realMap ────────────────────────────────────────
    const rm: DetMap = {}

    // Por sección
    secParts.forEach(p => {
      rm[p.id] = {}
      ;(secData ?? []).filter((r: any) => r.id_seccion_fk === p.id_seccion_fk)
        .forEach((r: any) => {
          const mes = new Date(r.recibos_ingreso.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(r.monto)
        })
    })

    // Por concepto
    concParts.forEach(p => {
      rm[p.id] = {}
      ;(concData ?? []).filter((r: any) => r.id_concepto_fk === p.id_concepto_fk)
        .forEach((r: any) => {
          const mes = new Date(r.recibos_ingreso.fecha + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(r.monto)
        })
    })

    // Por área — pagos reales de OP (abonos CXP), base efectivo por fecha_abono
    areaParts.forEach(p => {
      rm[p.id] = {}
      ;(abonosData ?? []).filter((a: any) => {
          const op = a.ordenes_pago
          if (!op) return false
          if (p.id_area_fk && op.id_area_fk !== p.id_area_fk) return false
          if (p.tipo_gasto && op.tipo_gasto !== p.tipo_gasto) return false
          return true
        })
        .forEach((a: any) => {
          if (!a.fecha_abono) return
          const mes = new Date(a.fecha_abono + 'T12:00:00').getMonth() + 1
          rm[p.id][mes] = (rm[p.id][mes] ?? 0) + Number(a.monto)
        })
    })

    // Real manual sumado encima del auto (partidas adicionales de flujo, financiamiento, etc.)
    ;(manual ?? []).forEach((r: any) => {
      if (!rm[r.id_partida_fk]) rm[r.id_partida_fk] = {}
      rm[r.id_partida_fk][r.mes] = (rm[r.id_partida_fk][r.mes] ?? 0) + Number(r.monto)
    })

    setRealMap(rm)
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
  }, [loadEverything])

  const selPpto = presupuestos.find(p => p.id === selId)

  function onChangePpto(id: number) {
    setSelId(id)
    const p = presupuestos.find(x => x.id === id)
    if (p) loadEverything(p.id, p.anio, p.modulo, true)
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
    setModalManual(false)
    setManualMonto('')
    setManualConc('')
    const p = presupuestos.find(x => x.id === selId)
    if (p) loadEverything(p.id, p.anio, p.modulo, true)
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
  const filas = partidas
    .filter(p => !filterTipo || p.tipo === filterTipo)
    .map(p => {
      const pptoVal = pptoPartida(p.id)
      const realVal = realPartida(p.id)
      const varAbs  = realVal - pptoVal
      const varPct  = pptoVal > 0 ? Math.round(((realVal - pptoVal) / pptoVal) * 100) : null
      return { ...p, pptoVal, realVal, varAbs, varPct }
    })
    .filter(p => p.pptoVal > 0 || p.realVal > 0)

  const ingRows = filas.filter(p => p.tipo === 'ingreso')
  const egrRows = filas.filter(p => p.tipo === 'egreso')

  function totalSeccion(rows: typeof filas, field: 'pptoVal' | 'realVal') {
    return rows.reduce((s, r) => s + r[field], 0)
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
          <select className="input" style={{ width: 280, flex: '0 0 auto' }}
            value={selId ?? ''} onChange={e => onChangePpto(Number(e.target.value))}>
            {presupuestos.map(p => (
              <option key={p.id} value={p.id}>{p.anio} — {p.nombre}</option>
            ))}
          </select>
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
              {/* INGRESOS */}
              {ingRows.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} style={{
                      padding: '7px 16px', background: '#f0fdf4',
                      fontWeight: 700, fontSize: 11, color: '#15803d',
                      textTransform: 'uppercase', letterSpacing: '.06em',
                      borderTop: '2px solid #bbf7d0',
                    }}>
                      Ingresos (cobrado)
                    </td>
                  </tr>
                  {ingRows.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9',
                      background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</span></td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                        {p.pptoVal > 0 ? fmt(p.pptoVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {p.realVal > 0 ? fmt(p.realVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <VariacionCell varAbs={p.varAbs} varPct={p.varPct} tipo="ingreso" />
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <PctEjercidoCell real={p.realVal} ppto={p.pptoVal} tipo="ingreso" />
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {canWrite('presupuestos') && (
                          <button className="btn-ghost"
                            onClick={() => { setManualPid(p.id); setManualMes(filterMes || new Date().getMonth() + 1); setModalManual(true) }}
                            style={{ fontSize: 11, padding: '3px 8px', color: '#64748b' }}>
                            + Manual
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <TotalSectionRow
                    label="Total Ingresos"
                    ppto={totalSeccion(ingRows, 'pptoVal')}
                    real={totalSeccion(ingRows, 'realVal')}
                    tipo="ingreso"
                    bg="#dcfce7" color="#15803d" bgTotal="#bbf7d0"
                  />
                </>
              )}

              {/* EGRESOS */}
              {egrRows.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} style={{
                      padding: '7px 16px', background: '#fef2f2',
                      fontWeight: 700, fontSize: 11, color: '#b91c1c',
                      textTransform: 'uppercase', letterSpacing: '.06em',
                      borderTop: '2px solid #fecaca',
                    }}>
                      Egresos (pagado)
                    </td>
                  </tr>
                  {egrRows.map((p, i) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9',
                      background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={td}><span style={{ fontWeight: 600, color: '#1e293b' }}>{p.nombre}</span></td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>
                        {p.pptoVal > 0 ? fmt(p.pptoVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {p.realVal > 0 ? fmt(p.realVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <VariacionCell varAbs={p.varAbs} varPct={p.varPct} tipo="egreso" />
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <PctEjercidoCell real={p.realVal} ppto={p.pptoVal} tipo="egreso" />
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {canWrite('presupuestos') && (
                          <button className="btn-ghost"
                            onClick={() => { setManualPid(p.id); setManualMes(filterMes || new Date().getMonth() + 1); setModalManual(true) }}
                            style={{ fontSize: 11, padding: '3px 8px', color: '#64748b' }}>
                            + Manual
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <TotalSectionRow
                    label="Total Egresos"
                    ppto={totalSeccion(egrRows, 'pptoVal')}
                    real={totalSeccion(egrRows, 'realVal')}
                    tipo="egreso"
                    bg="#fee2e2" color="#b91c1c" bgTotal="#fecaca"
                  />
                </>
              )}

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

      {/* Modal: Agregar Real Manual */}
      {modalManual && manualPid && (
        <ModalShell
          modulo="presupuestos"
          titulo="Agregar Real Manual"
          subtitulo={`Partida: ${partidas.find(p => p.id === manualPid)?.nombre ?? ''}`}
          icono={Wallet}
          maxWidth={400}
          onClose={() => setModalManual(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setModalManual(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveManual}
                disabled={savingManual || !manualMonto}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {savingManual ? <Loader size={14} className="animate-spin" /> : null}
                Guardar
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Captura un monto real adicional que no proviene de recibos de ingreso ni de abonos de OP
              (por ejemplo, movimientos de financiamiento: préstamos, aportaciones de socios, pago de capital de deuda).
            </p>
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
          </div>
        </ModalShell>
      )}
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
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
