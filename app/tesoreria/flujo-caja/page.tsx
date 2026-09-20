'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { dbComp, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import ModalShell from '@/components/ui/ModalShell'
import {
  Wallet, Plus, Copy, Trash2, Eraser, AlertTriangle, ChevronDown,
} from 'lucide-react'
import {
  CONCEPTOS, GRUPOS, GCOLOR, CPT, ConceptoId, GrupoId,
  CentroCosto, Matriz, Ingresos, ConfigPeriodo, DiaCalc, SemanaCalc,
  construirDias, agruparSemanas, calcularKpis, totalConcepto,
  mesesDelPeriodo, isoOf, parseISODateUTC,
  mxn0, kFmt, NUM_FMT, fdate, flong, MESES, MESES_LARGO,
} from '@/lib/flujoCaja'

// ── Tipos de fila (Supabase) ──────────────────────────────────
type PeriodoRow = {
  id: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  saldo_inicial: number
  dia_pago_impuestos: 17 | 22
  frecuencia_proveedores: 'semanal' | 'mensual'
}
type CapturaRow = { concepto: string; id_centro_costo_fk: number; monto_por_pago: number }
type IngresoRow = { id_centro_costo_fk: number; mes: string; monto_mensual: number }

const CC_COLORS = ['#0E8A6B', '#3374C4', '#C2437A', '#E0A028', '#6B4FA8', '#8A8F98', '#0EA5A0', '#B4552B', '#4C6EF5', '#A3419C']
const colorDeCC = (idx: number) => CC_COLORS[idx % CC_COLORS.length]

function primerDiaMes(anio: number, mes1a12: number): string {
  return `${anio}-${String(mes1a12).padStart(2, '0')}-01`
}
function ultimoDiaMesISO(anio: number, mes1a12: number): string {
  const d = new Date(Date.UTC(anio, mes1a12, 0))
  return isoOf(d.getTime())
}

export default function FlujoCajaPage() {
  const { authUser, canWrite, canDelete } = useAuth()
  const puedeEditar = canWrite('tesoreria')

  const [loading, setLoading] = useState(true)
  const [centros, setCentros] = useState<CentroCosto[]>([])
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([])
  const [periodoId, setPeriodoId] = useState<number | null>(null)
  const [periodo, setPeriodo] = useState<PeriodoRow | null>(null)
  const [matriz, setMatriz] = useState<Matriz>({})
  const [ingresos, setIngresos] = useState<Ingresos>({})
  const [dataVersion, setDataVersion] = useState(0)
  const [filtroCC, setFiltroCC] = useState<number | 'all'>('all')
  const [colorCriterio, setColorCriterio] = useState<'grupo' | 'cc'>('grupo')
  const [modalPeriodo, setModalPeriodo] = useState(false)
  const [hoverSaldo, setHoverSaldo] = useState<number | null>(null)
  const [hoverSem, setHoverSem] = useState<number | null>(null)

  // ── Carga inicial: centros de costo + periodos ──────────────
  useEffect(() => {
    Promise.all([
      dbCfg.from('centros_costo').select('id, nombre').eq('activo', true).order('nombre'),
      dbComp.from('flujo_caja_periodos').select('*').eq('activo', true).order('created_at', { ascending: false }),
    ]).then(([{ data: ccs }, { data: pers }]) => {
      setCentros((ccs ?? []) as CentroCosto[])
      const lista = (pers ?? []) as PeriodoRow[]
      setPeriodos(lista)
      if (lista.length) setPeriodoId(lista[0].id)
      setLoading(false)
    })
  }, [])

  // ── Carga de captura/ingresos al cambiar de periodo ─────────
  const cargarPeriodo = useCallback(async (id: number, ccs: CentroCosto[]) => {
    const [{ data: per }, { data: cap }, { data: ing }] = await Promise.all([
      dbComp.from('flujo_caja_periodos').select('*').eq('id', id).single(),
      dbComp.from('flujo_caja_captura').select('concepto, id_centro_costo_fk, monto_por_pago').eq('id_periodo_fk', id),
      dbComp.from('flujo_caja_ingresos').select('id_centro_costo_fk, mes, monto_mensual').eq('id_periodo_fk', id),
    ])
    if (per) setPeriodo(per as PeriodoRow)
    const mat: Matriz = {}
    CONCEPTOS.forEach(c => { mat[c.id] = {}; ccs.forEach(cc => { mat[c.id]![cc.id] = 0 }) })
    ;((cap ?? []) as CapturaRow[]).forEach(r => {
      if (!mat[r.concepto as ConceptoId]) mat[r.concepto as ConceptoId] = {}
      mat[r.concepto as ConceptoId]![r.id_centro_costo_fk] = Number(r.monto_por_pago) || 0
    })
    setMatriz(mat)
    const ingr: Ingresos = {}
    ccs.forEach(cc => { ingr[cc.id] = {} })
    ;((ing ?? []) as IngresoRow[]).forEach(r => {
      if (!ingr[r.id_centro_costo_fk]) ingr[r.id_centro_costo_fk] = {}
      ingr[r.id_centro_costo_fk][r.mes] = Number(r.monto_mensual) || 0
    })
    setIngresos(ingr)
    setDataVersion(v => v + 1)
  }, [])

  useEffect(() => {
    if (periodoId != null && centros.length) cargarPeriodo(periodoId, centros)
  }, [periodoId, centros, cargarPeriodo])

  // ── Config derivada para el motor de cálculo ────────────────
  const cfg: ConfigPeriodo | null = useMemo(() => {
    if (!periodo) return null
    return {
      fechaInicio: periodo.fecha_inicio,
      fechaFin: periodo.fecha_fin,
      saldoInicial: Number(periodo.saldo_inicial) || 0,
      diaPagoImpuestos: periodo.dia_pago_impuestos,
      frecuenciaProveedores: periodo.frecuencia_proveedores,
    }
  }, [periodo])

  const ccIds = useMemo(() => centros.map(c => c.id), [centros])
  const meses = useMemo(() => cfg ? mesesDelPeriodo(cfg) : [], [cfg])

  const diasTotal = useMemo(() => cfg ? construirDias(cfg, matriz, ingresos, ccIds, 'all') : [], [cfg, matriz, ingresos, ccIds])
  const diasFiltrados = useMemo(() => cfg ? construirDias(cfg, matriz, ingresos, ccIds, filtroCC) : [], [cfg, matriz, ingresos, ccIds, filtroCC])
  const semanas = useMemo(() => agruparSemanas(diasFiltrados), [diasFiltrados])
  const kpis = useMemo(() => cfg ? calcularKpis(diasFiltrados, cfg, filtroCC) : null, [diasFiltrados, cfg, filtroCC])

  // ── Guardado ──────────────────────────────────────────────
  async function guardarCeldaEgreso(concepto: ConceptoId, ccId: number, valor: number) {
    setMatriz(prev => ({ ...prev, [concepto]: { ...(prev[concepto] ?? {}), [ccId]: valor } }))
    if (!periodoId) return
    await dbComp.from('flujo_caja_captura').upsert(
      { id_periodo_fk: periodoId, concepto, id_centro_costo_fk: ccId, monto_por_pago: valor, updated_at: new Date().toISOString() },
      { onConflict: 'id_periodo_fk,concepto,id_centro_costo_fk' },
    )
  }
  async function guardarCeldaIngreso(ccId: number, mes: string, valor: number) {
    setIngresos(prev => ({ ...prev, [ccId]: { ...(prev[ccId] ?? {}), [mes]: valor } }))
    if (!periodoId) return
    await dbComp.from('flujo_caja_ingresos').upsert(
      { id_periodo_fk: periodoId, id_centro_costo_fk: ccId, mes, monto_mensual: valor, updated_at: new Date().toISOString() },
      { onConflict: 'id_periodo_fk,id_centro_costo_fk,mes' },
    )
  }
  async function actualizarConfig(patch: Partial<PeriodoRow>) {
    if (!periodo || !periodoId) return
    setPeriodo({ ...periodo, ...patch })
    await dbComp.from('flujo_caja_periodos').update(patch).eq('id', periodoId)
  }
  async function vaciarEgresos() {
    if (!periodoId) return
    if (!confirm('¿Vaciar todos los egresos capturados de este periodo? Los ingresos no se tocan.')) return
    await dbComp.from('flujo_caja_captura').delete().eq('id_periodo_fk', periodoId)
    cargarPeriodo(periodoId, centros)
  }
  async function eliminarPeriodo() {
    if (!periodoId || !periodo) return
    if (!confirm(`¿Archivar el periodo "${periodo.nombre}"? Deja de aparecer en el selector, pero su captura no se borra.`)) return
    await dbComp.from('flujo_caja_periodos').update({ activo: false }).eq('id', periodoId)
    const restantes = periodos.filter(p => p.id !== periodoId)
    setPeriodos(restantes)
    setPeriodoId(restantes[0]?.id ?? null)
    if (!restantes.length) setPeriodo(null)
  }

  if (loading) {
    return <div style={{ padding: '32px 36px' }}>Cargando…</div>
  }

  return (
    <div style={{ padding: '32px 36px', animation: 'fadeIn 0.3s ease-out' }}>
      <PageHeader
        icon={Wallet}
        eyebrowLabel="Tesorería"
        title="Flujo de Caja"
        subtitle="Proyección de posición de caja día a día, por centro de costo y periodo"
        backHref="/tesoreria"
        actions={puedeEditar ? (
          <button className="btn-primary" onClick={() => setModalPeriodo(true)}>
            <Plus size={14} /> Nuevo periodo
          </button>
        ) : undefined}
      />

      {!periodo ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
          Todavía no hay periodos de flujo de caja capturados.
          {puedeEditar && (
            <div style={{ marginTop: 14 }}>
              <button className="btn-primary" onClick={() => setModalPeriodo(true)}>
                <Plus size={14} /> Crear el primero
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Selector de periodo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <select
                value={periodoId ?? ''}
                onChange={e => setPeriodoId(Number(e.target.value))}
                style={{
                  appearance: 'none', font: 'inherit', fontSize: 13, fontWeight: 600,
                  padding: '9px 34px 9px 14px', borderRadius: 8, border: '1px solid #d3dce9',
                  background: '#fff', color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                {periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: 11, pointerEvents: 'none', color: '#7a8aa3' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {fdate(parseISODateUTC(periodo.fecha_inicio))} – {fdate(parseISODateUTC(periodo.fecha_fin))}
            </span>
            {puedeEditar && (
              <button className="btn-ghost" onClick={() => setModalPeriodo(true)} title="Nuevo / duplicar periodo">
                <Copy size={13} /> Duplicar / nuevo
              </button>
            )}
            {canDelete() && (
              <button className="btn-ghost" onClick={eliminarPeriodo} style={{ color: '#dc2626', marginLeft: 'auto' }}>
                <Trash2 size={13} /> Archivar periodo
              </button>
            )}
          </div>

          <MatrizEgresos
            centros={centros} matriz={matriz} diasTotal={diasTotal}
            puedeEditar={puedeEditar} dataVersion={dataVersion} periodoId={periodoId!}
            onGuardar={guardarCeldaEgreso}
          />

          <MatrizIngresos
            centros={centros} ingresos={ingresos} meses={meses}
            puedeEditar={puedeEditar} dataVersion={dataVersion} periodoId={periodoId!}
            onGuardar={guardarCeldaIngreso}
          />

          {/* Controles */}
          <div className="card" style={{ padding: 16, marginBottom: 20 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '16px 22px',
            }}>
              <Control label="Saldo inicial de caja">
                <input type="number" disabled={!puedeEditar} defaultValue={periodo.saldo_inicial}
                  key={`saldo-${dataVersion}`}
                  onBlur={e => actualizarConfig({ saldo_inicial: Number(e.target.value) || 0 })}
                  style={inputStyle} />
              </Control>
              <Control label="Pago de impuestos">
                <Seg options={[{ v: 17, l: 'Día 17' }, { v: 22, l: 'Día 22' }]} value={periodo.dia_pago_impuestos}
                  disabled={!puedeEditar} onChange={v => actualizarConfig({ dia_pago_impuestos: v as 17 | 22 })} />
              </Control>
              <Control label="Pago a proveedores">
                <Seg options={[{ v: 'semanal', l: 'Semanal · viernes' }, { v: 'mensual', l: 'Mensual · día 25' }]}
                  value={periodo.frecuencia_proveedores} disabled={!puedeEditar}
                  onChange={v => actualizarConfig({ frecuencia_proveedores: v as 'semanal' | 'mensual' })} />
              </Control>
              <Control label="Color de las barras semanales">
                <Seg options={[{ v: 'grupo', l: 'Por concepto' }, { v: 'cc', l: 'Por centro de costo' }]}
                  value={colorCriterio} onChange={v => setColorCriterio(v as 'grupo' | 'cc')} />
              </Control>
            </div>
            {puedeEditar && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid #eef1f6' }}>
                <button className="btn-ghost" onClick={vaciarEgresos}>
                  <Eraser size={13} /> Vaciar egresos
                </button>
              </div>
            )}
          </div>

          {/* Filtro por centro de costo */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
              Centro de costo
            </span>
            <Chip active={filtroCC === 'all'} onClick={() => setFiltroCC('all')} label="Todos" />
            {centros.map((cc, i) => (
              <Chip key={cc.id} active={filtroCC === cc.id} onClick={() => setFiltroCC(cc.id)} label={cc.nombre} color={colorDeCC(i)} />
            ))}
          </div>

          {kpis && cfg && (
            <KpisRow kpis={kpis} filtroCC={filtroCC} centros={centros} />
          )}

          <TablaCentrosCosto centros={centros} diasTotal={diasTotal} ingresos={ingresos} meses={meses} />

          <section style={{ marginBottom: 28 }}>
            <h2 style={sectionTitle}>Saldo de caja acumulado</h2>
            <p style={sectionCap}>Un punto por día. La zona roja bajo la línea de cero es el efectivo que falta y hay que fondear.</p>
            <div className="card" style={{ padding: 16 }}>
              <ChartSaldo dias={diasFiltrados} hover={hoverSaldo} setHover={setHoverSaldo} />
            </div>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={sectionTitle}>Egresos por semana</h2>
            <p style={sectionCap}>Semanas de lunes a domingo. Los picos marcan dónde se concentra la presión de pago.</p>
            <div className="card" style={{ padding: 16 }}>
              <ChartEgresos semanas={semanas} criterio={colorCriterio} centros={centros} hover={hoverSem} setHover={setHoverSem} />
            </div>
          </section>

          <TablaSemanal semanas={semanas} />

          <div className="cols-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 20, marginBottom: 28 }}>
            <ListaCompromisos dias={diasFiltrados} />
            <ListaPicos dias={diasFiltrados} />
          </div>

          <Narrativa dias={diasFiltrados} semanas={semanas} kpis={kpis!} filtroCC={filtroCC} centros={centros} matriz={matriz} />
        </>
      )}

      {modalPeriodo && (
        <ModalPeriodo
          periodos={periodos}
          onClose={() => setModalPeriodo(false)}
          onCreado={(nuevo) => {
            setPeriodos(prev => [nuevo, ...prev])
            setPeriodoId(nuevo.id)
            setModalPeriodo(false)
          }}
        />
      )}
    </div>
  )
}

// ── Estilos compartidos ──────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', font: 'inherit', fontSize: 13, padding: '7px 10px',
  border: '1px solid #d3dce9', borderRadius: 6, background: '#f7f9fc',
}
const sectionTitle: React.CSSProperties = { fontSize: 15, margin: '0 0 2px', color: '#1F3864' }
const sectionCap: React.CSSProperties = { fontSize: 12, color: '#7a8aa3', margin: '0 0 12px' }

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: '#7a8aa3', fontWeight: 700, marginBottom: 7 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Seg<T extends string | number>({ options, value, onChange, disabled }: {
  options: { v: T; l: string }[]; value: T; onChange?: (v: T) => void; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', border: '1px solid #d3dce9', borderRadius: 6, overflow: 'hidden' }}>
      {options.map((o, i) => (
        <button key={String(o.v)} type="button" disabled={disabled}
          onClick={() => onChange?.(o.v)}
          style={{
            flex: 1, appearance: 'none', border: 'none', font: 'inherit', fontSize: 12.5,
            padding: '7px 8px', cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap',
            borderLeft: i > 0 ? '1px solid #d3dce9' : 'none',
            background: value === o.v ? '#1F3864' : '#f0f4fa',
            color: value === o.v ? '#fff' : '#4a5b77',
            fontWeight: value === o.v ? 700 : 400,
          }}>
          {o.l}
        </button>
      ))}
    </div>
  )
}

function Chip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button type="button" onClick={onClick} style={{
      appearance: 'none', font: 'inherit', fontSize: 12.5, padding: '6px 13px', borderRadius: 999,
      cursor: 'pointer', border: '1px solid ' + (active ? '#1F3864' : '#d3dce9'),
      background: active ? '#1F3864' : '#fff', color: active ? '#fff' : '#4a5b77',
      fontWeight: active ? 700 : 400, display: 'flex', alignItems: 'center', gap: 7,
    }}>
      {color && <i style={{ width: 9, height: 9, borderRadius: 2, display: 'block', background: active ? '#fff' : color }} />}
      {label}
    </button>
  )
}

// ── Matriz editable de egresos ───────────────────────────────
function MatrizEgresos({ centros, matriz, diasTotal, puedeEditar, dataVersion, periodoId, onGuardar }: {
  centros: CentroCosto[]; matriz: Matriz; diasTotal: DiaCalc[]; puedeEditar: boolean
  dataVersion: number; periodoId: number
  onGuardar: (concepto: ConceptoId, ccId: number, valor: number) => void
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={sectionTitle}>Egresos por concepto y centro de costo</h2>
      <p style={sectionCap}>Escribe el monto <strong>por cada pago</strong>. El calendario y los totales del periodo se recalculan solos.</p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={tblStyle}>
          <thead>
            <tr>
              <th style={thLeft}>Concepto</th>
              {centros.map((cc, i) => (
                <th key={cc.id} style={{ ...th, borderBottom: `3px solid ${colorDeCC(i)}` }}>{cc.nombre}</th>
              ))}
              <th style={th}>Por pago</th>
              <th style={th}>Total periodo</th>
            </tr>
          </thead>
          <tbody>
            {CONCEPTOS.map(c => {
              const porPago = centros.reduce((a, cc) => a + (matriz[c.id]?.[cc.id] ?? 0), 0)
              const totalPeriodo = totalConcepto(c.id, diasTotal)
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #e6ecf4' }}>
                  <td style={{ ...tdLeft, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                      <i style={{ width: 9, height: 9, borderRadius: 2, background: GCOLOR[c.grupo], display: 'block' }} />
                      {c.nombre}
                    </div>
                    <div style={{ fontSize: 11, color: '#7a8aa3' }}>{c.sigla} · {c.calendarioDesc}</div>
                  </td>
                  {centros.map(cc => (
                    <td key={cc.id} style={td}>
                      <input
                        key={`${periodoId}-${c.id}-${cc.id}-${dataVersion}`}
                        type="text" inputMode="numeric" disabled={!puedeEditar}
                        defaultValue={NUM_FMT.format(matriz[c.id]?.[cc.id] ?? 0)}
                        onBlur={e => {
                          const v = Math.max(0, Math.round(parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0))
                          e.target.value = NUM_FMT.format(v)
                          onGuardar(c.id, cc.id, v)
                        }}
                        style={cellInput}
                      />
                    </td>
                  ))}
                  <td style={tdTot}>{porPago ? mxn0(porPago) : '—'}</td>
                  <td style={tdTot}>{totalPeriodo ? mxn0(totalPeriodo) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={tdLeft}><strong>Total periodo</strong></td>
              {centros.map(cc => {
                const t = diasTotal.reduce((a, d) => a + (d.porCC[cc.id] ?? 0), 0)
                return <td key={cc.id} style={tdTot}>{t ? mxn0(t) : '—'}</td>
              })}
              <td style={tdTot} />
              <td style={tdTot}>{mxn0(diasTotal.reduce((a, d) => a + d.egreso, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ── Matriz editable de ingresos (por mes) ────────────────────
function MatrizIngresos({ centros, ingresos, meses, puedeEditar, dataVersion, periodoId, onGuardar }: {
  centros: CentroCosto[]; ingresos: Ingresos; meses: number[]; puedeEditar: boolean
  dataVersion: number; periodoId: number
  onGuardar: (ccId: number, mes: string, valor: number) => void
}) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={sectionTitle}>Ingresos mensuales por centro de costo</h2>
      <p style={sectionCap}>Monto que entra cada mes, repartido 40% / 35% / 25% los días 5, 8 y 10.</p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={tblStyle}>
          <thead>
            <tr>
              <th style={thLeft}>Centro de costo</th>
              {meses.map(m => <th key={m} style={th}>{MESES[new Date(m).getUTCMonth()]} {new Date(m).getUTCFullYear()}</th>)}
              <th style={th}>Total periodo</th>
            </tr>
          </thead>
          <tbody>
            {centros.map((cc, i) => {
              const total = meses.reduce((a, m) => a + (ingresos[cc.id]?.[isoOf(m)] ?? 0), 0)
              return (
                <tr key={cc.id} style={{ borderBottom: '1px solid #e6ecf4' }}>
                  <td style={{ ...tdLeft, minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
                      <i style={{ width: 9, height: 9, borderRadius: 2, background: colorDeCC(i), display: 'block' }} />
                      {cc.nombre}
                    </div>
                  </td>
                  {meses.map(m => {
                    const key = isoOf(m)
                    return (
                      <td key={key} style={td}>
                        <input
                          key={`${periodoId}-${cc.id}-${key}-${dataVersion}`}
                          type="text" inputMode="numeric" disabled={!puedeEditar}
                          defaultValue={NUM_FMT.format(ingresos[cc.id]?.[key] ?? 0)}
                          onBlur={e => {
                            const v = Math.max(0, Math.round(parseFloat(e.target.value.replace(/[^0-9.-]/g, '')) || 0))
                            e.target.value = NUM_FMT.format(v)
                            onGuardar(cc.id, key, v)
                          }}
                          style={cellInput}
                        />
                      </td>
                    )
                  })}
                  <td style={tdTot}>{total ? mxn0(total) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={tdLeft}><strong>Total</strong></td>
              {meses.map(m => {
                const key = isoOf(m)
                const t = centros.reduce((a, cc) => a + (ingresos[cc.id]?.[key] ?? 0), 0)
                return <td key={key} style={tdTot}>{t ? mxn0(t) : '—'}</td>
              })}
              <td style={tdTot}>
                {mxn0(meses.reduce((a, m) => a + centros.reduce((b, cc) => b + (ingresos[cc.id]?.[isoOf(m)] ?? 0), 0), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

const tblStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'right', fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase', color: '#7a8aa3', borderBottom: '1.5px solid #1F3864', whiteSpace: 'nowrap' }
const thLeft: React.CSSProperties = { ...th, textAlign: 'left' }
const td: React.CSSProperties = { padding: '5px 7px', textAlign: 'right' }
const tdLeft: React.CSSProperties = { ...td, textAlign: 'left', padding: '8px 10px' }
const tdTot: React.CSSProperties = { ...td, fontWeight: 700, background: '#f0f4fa' }
const cellInput: React.CSSProperties = {
  width: '100%', minWidth: 74, font: 'inherit', fontSize: 12.5, textAlign: 'right',
  padding: '5px 7px', border: '1px solid #d3dce9', borderRadius: 5, background: '#f7f9fc',
}

// ── KPIs ──────────────────────────────────────────────────────
function KpisRow({ kpis, filtroCC, centros }: { kpis: ReturnType<typeof calcularKpis>; filtroCC: number | 'all'; centros: CentroCosto[] }) {
  const alcance = filtroCC === 'all' ? 'Consolidado' : (centros.find(c => c.id === filtroCC)?.nombre ?? '')
  const cells: { k: string; v: string; n: string; tone?: 'neg' | 'pos' }[] = [
    { k: 'Ingresos del periodo', v: mxn0(kpis.ingreso), n: alcance },
    { k: 'Egresos del periodo', v: mxn0(kpis.egreso), n: `${kpis.diasPago} días de pago` },
    { k: 'Resultado del periodo', v: (kpis.finSaldo - kpis.caja >= 0 ? '+' : '') + mxn0(kpis.finSaldo - kpis.caja), n: `Saldo final ${mxn0(kpis.finSaldo)}`, tone: kpis.finSaldo - kpis.caja >= 0 ? 'pos' : 'neg' },
    { k: 'Saldo mínimo', v: mxn0(kpis.minSaldo), n: flong(kpis.minTs) + (kpis.minSaldo < 0 ? ' · en rojo' : ' · sin déficit'), tone: kpis.minSaldo < 0 ? 'neg' : 'pos' },
    { k: 'Fondeo requerido', v: kpis.falta > 0 ? mxn0(kpis.falta) : '$0', n: kpis.falta > 0 ? `${kpis.diasNegativos} días en descubierto` : 'Aguanta el periodo', tone: kpis.falta > 0 ? 'neg' : 'pos' },
    { k: 'Ingreso de equilibrio', v: mxn0(kpis.ingresoEquilibrioMensual), n: 'Mensual, para cerrar en cero' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(166px,1fr))', gap: 1, background: '#d3dce9', border: '1px solid #d3dce9', borderRadius: 8, overflow: 'hidden', marginBottom: 26 }}>
      {cells.map(c => (
        <div key={c.k} style={{ background: c.tone === 'neg' ? '#f6e6e8' : '#fff', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#7a8aa3', fontWeight: 700 }}>{c.k}</div>
          <div style={{ fontSize: 21, fontWeight: 700, marginTop: 5, color: c.tone === 'neg' ? '#b23a48' : c.tone === 'pos' ? '#0e8a6b' : '#152540' }}>{c.v}</div>
          <div style={{ fontSize: 11.5, color: '#7a8aa3', marginTop: 3 }}>{c.n}</div>
        </div>
      ))}
    </div>
  )
}

// ── Tabla por centro de costo ────────────────────────────────
function TablaCentrosCosto({ centros, diasTotal, ingresos, meses }: { centros: CentroCosto[]; diasTotal: DiaCalc[]; ingresos: Ingresos; meses: number[] }) {
  const filas = centros.map(cc => {
    const ing = meses.reduce((a, m) => a + (ingresos[cc.id]?.[isoOf(m)] ?? 0), 0)
    const eg = diasTotal.reduce((a, d) => a + (d.porCC[cc.id] ?? 0), 0)
    return { cc, ing, eg, res: ing - eg }
  })
  const maxAbs = Math.max(1, ...filas.map(f => Math.abs(f.res)))
  const tIng = filas.reduce((a, f) => a + f.ing, 0)
  const tEg = filas.reduce((a, f) => a + f.eg, 0)
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={sectionTitle}>Resultado por centro de costo</h2>
      <p style={sectionCap}>Ingreso menos egreso del periodo. La barra muestra el tamaño relativo del déficit o superávit.</p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={tblStyle}>
          <thead>
            <tr>
              <th style={thLeft}>Centro de costo</th><th style={th}>Ingresos</th><th style={th}>Egresos</th>
              <th style={th}>Resultado</th><th style={th}>% del egreso</th><th style={th}>Déficit / superávit</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const w = Math.abs(f.res) / maxAbs * 50, left = f.res < 0 ? 50 - w : 50
              return (
                <tr key={f.cc.id} style={{ borderBottom: '1px solid #e6ecf4' }}>
                  <td style={tdLeft}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <i style={{ width: 11, height: 11, borderRadius: 2, background: colorDeCC(i), display: 'block' }} />
                      {f.cc.nombre}
                    </span>
                  </td>
                  <td style={td}>{f.ing ? mxn0(f.ing) : '—'}</td>
                  <td style={td}>{f.eg ? mxn0(f.eg) : '—'}</td>
                  <td style={{ ...td, color: f.res < 0 ? '#b23a48' : undefined, fontWeight: 700 }}>{(f.res >= 0 ? '+' : '') + mxn0(f.res)}</td>
                  <td style={{ ...td, color: '#7a8aa3' }}>{tEg ? Math.round(f.eg / tEg * 100) : 0}%</td>
                  <td style={{ ...td, width: 180 }}>
                    <span style={{ display: 'block', width: '100%', height: 9, background: '#e6ecf4', borderRadius: 2, position: 'relative', overflow: 'hidden', minWidth: 90 }}>
                      <span style={{ position: 'absolute', top: 0, bottom: 0, left: left + '%', width: w + '%', borderRadius: 2, background: f.res >= 0 ? '#0e8a6b' : '#b23a48' }} />
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={tdLeft}><strong>Consolidado</strong></td>
              <td style={tdTot}>{mxn0(tIng)}</td>
              <td style={tdTot}>{mxn0(tEg)}</td>
              <td style={{ ...tdTot, color: tIng - tEg < 0 ? '#b23a48' : undefined }}>{(tIng - tEg >= 0 ? '+' : '') + mxn0(tIng - tEg)}</td>
              <td style={tdTot}>100%</td><td style={tdTot} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ── Gráfica de saldo acumulado (SVG) ─────────────────────────
function ChartSaldo({ dias, hover, setHover }: { dias: DiaCalc[]; hover: number | null; setHover: (i: number | null) => void }) {
  const W = 960, H = 320, M = { t: 18, r: 16, b: 40, l: 84 }
  const iw = W - M.l - M.r, ih = H - M.t - M.b
  if (!dias.length) return <div style={{ color: '#7a8aa3', fontSize: 13, padding: 20 }}>Sin datos para graficar.</div>
  const vals = dias.map(d => d.saldo)
  let mx = Math.max(0, ...vals), mn = Math.min(0, ...vals)
  const pad = (mx - mn) * 0.12 || 1e5
  mx += pad; mn -= pad
  const X = (i: number) => M.l + i * (iw / Math.max(1, dias.length - 1))
  const Y = (v: number) => M.t + ih - (v - mn) / (mx - mn) * ih
  const y0 = Y(0)

  let step = Math.pow(10, Math.floor(Math.log10(Math.max(1, mx - mn)))) / 2
  while ((mx - mn) / step > 7) step *= 2
  while ((mx - mn) / step < 3) step /= 2
  const ticks: number[] = []
  for (let v = Math.ceil(mn / step) * step; v <= mx; v += step) ticks.push(v)

  const meses: { i: number; label: string }[] = []
  let lastMes = -1
  dias.forEach((d, i) => {
    const m = new Date(d.ts).getUTCMonth()
    if (m !== lastMes) { meses.push({ i, label: `${MESES[m].toUpperCase()} ${new Date(d.ts).getUTCFullYear()}` }); lastMes = m }
  })

  const posPts = [`${M.l},${y0}`, ...dias.map((d, i) => `${X(i)},${d.saldo > 0 ? Y(d.saldo) : y0}`), `${X(dias.length - 1)},${y0}`]
  const negPts = [`${M.l},${y0}`, ...dias.map((d, i) => `${X(i)},${d.saldo < 0 ? Y(d.saldo) : y0}`), `${X(dias.length - 1)},${y0}`]
  const line = dias.map((d, i) => `${X(i)},${Y(d.saldo)}`).join(' ')
  let mi = 0; dias.forEach((d, i) => { if (d.saldo < dias[mi].saldo) mi = i })
  const mcolor = dias[mi].saldo < 0 ? '#B23A48' : '#0E8A6B'

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const r = (e.target as SVGRectElement).ownerSVGElement!.getBoundingClientRect()
    const sx = (e.clientX - r.left) / r.width * W
    const p = (sx - M.l) / iw
    setHover(Math.max(0, Math.min(dias.length - 1, Math.round(p * (dias.length - 1)))))
  }

  const hd = hover != null ? dias[hover] : null

  return (
    <div style={{ overflowX: 'auto', position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', minWidth: 660, height: 'auto' }}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={M.l} y1={Y(v)} x2={W - M.r} y2={Y(v)} stroke="#e6ecf4" strokeWidth={1} />
            <text x={M.l - 9} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="#7a8aa3">{kFmt(v)}</text>
          </g>
        ))}
        {meses.map((m, k) => (
          <g key={m.i}>
            {k > 0 && <line x1={X(m.i)} y1={M.t} x2={X(m.i)} y2={M.t + ih} stroke="#d3dce9" strokeWidth={1} strokeDasharray="3 3" />}
            <text x={X(m.i) + 6} y={M.t + 13} fontSize={10.5} fontWeight="bold" fill="#7a8aa3" letterSpacing="0.06em">{m.label}</text>
          </g>
        ))}
        <polygon points={posPts.join(' ')} fill="#2563A8" fillOpacity={0.13} />
        <polygon points={negPts.join(' ')} fill="#B23A48" fillOpacity={0.24} />
        <line x1={M.l} y1={y0} x2={W - M.r} y2={y0} stroke="#4a5b77" strokeWidth={1.5} />
        <polyline points={line} fill="none" stroke="#2563A8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={X(mi)} cy={Y(dias[mi].saldo)} r={5} fill={mcolor} stroke="#fff" strokeWidth={2} />
        <text x={X(mi) > M.l + iw * 0.6 ? X(mi) - 11 : X(mi) + 11} y={Math.min(Math.max(Y(dias[mi].saldo) - 13, M.t + 30), M.t + ih - 6)}
          textAnchor={X(mi) > M.l + iw * 0.6 ? 'end' : 'start'} fontSize={11.5} fontWeight="bold" fill={mcolor}>
          mínimo {mxn0(dias[mi].saldo)} · {fdate(dias[mi].ts)}
        </text>
        {dias.filter((_, i) => i % 7 === 0).map((d, k) => (
          <text key={k} x={X(dias.indexOf(d))} y={M.t + ih + 18} textAnchor="middle" fontSize={10} fill="#7a8aa3">{new Date(d.ts).getUTCDate()}</text>
        ))}
        {hd && <line x1={X(hover!)} y1={M.t} x2={X(hover!)} y2={M.t + ih} stroke="#7a8aa3" strokeWidth={1} strokeDasharray="3 3" />}
        {hd && <circle cx={X(hover!)} cy={Y(hd.saldo)} r={5} fill="#2563A8" stroke="#fff" strokeWidth={2} />}
        <rect x={M.l} y={M.t} width={iw} height={ih} fill="transparent" style={{ cursor: 'crosshair' }}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hd && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', left: `${(X(hover!) / W) * 100}%`, top: 8,
          transform: 'translateX(-50%)', background: '#fff', border: '1px solid #d3dce9', borderRadius: 6,
          padding: '8px 10px', fontSize: 12, boxShadow: '0 6px 20px rgba(31,56,100,.12)', minWidth: 170, zIndex: 5,
        }}>
          <div style={{ fontWeight: 700, color: '#1F3864', marginBottom: 5 }}>{flong(hd.ts)}</div>
          {hd.ingreso > 0 && <Row l="Ingreso" v={mxn0(hd.ingreso)} />}
          {Object.entries(hd.detalleConcepto).map(([c, v]) => (
            <Row key={c} l={CPT[c as ConceptoId].nombre} v={'−' + mxn0(v as number)} />
          ))}
          {!hd.ingreso && !Object.keys(hd.detalleConcepto).length && <Row l="Sin movimientos" v="" />}
          <hr style={{ border: 0, borderTop: '1px solid #e6ecf4', margin: '5px 0' }} />
          <Row l="Saldo" v={mxn0(hd.saldo)} strong color={hd.saldo < 0 ? '#B23A48' : undefined} />
        </div>
      )}
    </div>
  )
}

// ── Gráfica de egresos semanales (SVG, barras apiladas) ──────
function ChartEgresos({ semanas, criterio, centros, hover, setHover }: {
  semanas: SemanaCalc[]; criterio: 'grupo' | 'cc'; centros: CentroCosto[]
  hover: number | null; setHover: (i: number | null) => void
}) {
  const w = 960, h = 300, m = { t: 18, r: 16, b: 52, l: 84 }
  const iw = w - m.l - m.r, ih = h - m.t - m.b
  if (!semanas.length) return <div style={{ color: '#7a8aa3', fontSize: 13, padding: 20 }}>Sin datos para graficar.</div>
  const series = criterio === 'cc'
    ? centros.map((cc, i) => ({ id: cc.id, nombre: cc.nombre, color: colorDeCC(i) }))
    : GRUPOS.map(g => ({ id: g.id, nombre: g.nombre, color: g.color }))
  let mx = Math.max(1, ...semanas.map(s => s.egreso)) * 1.12
  const bw = Math.min(46, iw / semanas.length * 0.68), gap = iw / semanas.length
  const Y = (v: number) => m.t + ih - v / mx * ih
  let step = 500000
  while (mx / step > 6) step *= 2
  while (mx / step < 2) step /= 2
  const ticks: number[] = []
  for (let v = 0; v <= mx; v += step) ticks.push(v)

  function valorSerie(s: SemanaCalc, id: string | number) {
    return criterio === 'cc' ? (s.porCC[id as number] ?? 0) : (s.porGrupo[id as GrupoId] ?? 0)
  }

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const r = (e.target as SVGRectElement).ownerSVGElement!.getBoundingClientRect()
    const sx = (e.clientX - r.left) / r.width * w
    const p = (sx - m.l) / iw
    setHover(Math.max(0, Math.min(semanas.length - 1, Math.floor(p * semanas.length))))
  }
  const hs = hover != null ? semanas[hover] : null

  return (
    <div style={{ overflowX: 'auto', position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', width: '100%', minWidth: 660, height: 'auto' }}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={m.l} y1={Y(v)} x2={w - m.r} y2={Y(v)} stroke="#e6ecf4" strokeWidth={1} />
            <text x={m.l - 9} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="#7a8aa3">{kFmt(v)}</text>
          </g>
        ))}
        {semanas.map((s, i) => {
          const cx = m.l + gap * i + gap / 2, x0 = cx - bw / 2
          let acc = 0
          return (
            <g key={i}>
              {series.map(g => {
                const val = valorSerie(s, g.id)
                if (!val) return null
                const y1 = Y(acc + val), y2 = Y(acc), hh = Math.max(1.5, y2 - y1 - 2)
                acc += val
                return <rect key={g.id} x={x0} y={y1} width={bw} height={hh} rx={2} fill={g.color} />
              })}
              {s.egreso > 0 && <text x={cx} y={Y(s.egreso) - 7} textAnchor="middle" fontSize={10.5} fontWeight="bold" fill="#4a5b77">{kFmt(s.egreso)}</text>}
              <text x={cx} y={m.t + ih + 16} textAnchor="middle" fontSize={10} fill="#7a8aa3">{new Date(s.inicio).getUTCDate()}</text>
              <text x={cx} y={m.t + ih + 28} textAnchor="middle" fontSize={9.5} fill="#7a8aa3">{MESES[new Date(s.inicio).getUTCMonth()]}</text>
            </g>
          )
        })}
        <line x1={m.l} y1={m.t + ih} x2={w - m.r} y2={m.t + ih} stroke="#4a5b77" strokeWidth={1.5} />
        <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" style={{ cursor: 'crosshair' }}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hs && (
        <div style={{
          position: 'absolute', pointerEvents: 'none',
          left: `${((m.l + gap * hover! + gap / 2) / w) * 100}%`, top: 8, transform: 'translateX(-50%)',
          background: '#fff', border: '1px solid #d3dce9', borderRadius: 6, padding: '8px 10px', fontSize: 12,
          boxShadow: '0 6px 20px rgba(31,56,100,.12)', minWidth: 170, zIndex: 5,
        }}>
          <div style={{ fontWeight: 700, color: '#1F3864', marginBottom: 5 }}>{fdate(hs.inicio)} – {fdate(hs.fin)}</div>
          {series.filter(g => valorSerie(hs, g.id) > 0).map(g => (
            <Row key={g.id} l={g.nombre} v={mxn0(valorSerie(hs, g.id))} />
          ))}
          <hr style={{ border: 0, borderTop: '1px solid #e6ecf4', margin: '5px 0' }} />
          <Row l="Egresos" v={mxn0(hs.egreso)} />
          <Row l="Ingresos" v={mxn0(hs.ingreso)} />
          <Row l="Saldo al cierre" v={mxn0(hs.saldo)} strong color={hs.saldo < 0 ? '#B23A48' : undefined} />
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', marginTop: 10, paddingTop: 10, borderTop: '1px solid #e6ecf4' }}>
        {series.map(g => {
          const tot = semanas.reduce((a, s) => a + valorSerie(s, g.id), 0)
          return (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#4a5b77', opacity: tot ? 1 : 0.45 }}>
              <i style={{ width: 11, height: 11, borderRadius: 2, display: 'block', background: g.color }} />
              {g.nombre}{!tot && ' · $0'}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Row({ l, v, strong, color }: { l: string; v: string; strong?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
      <span>{l}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 700 : 400, color }}>{v}</span>
    </div>
  )
}

// ── Tabla semanal ─────────────────────────────────────────────
function TablaSemanal({ semanas }: { semanas: SemanaCalc[] }) {
  if (!semanas.length) return null
  const rank = [...semanas].map((s, i) => ({ i, eg: s.egreso })).sort((a, b) => b.eg - a.eg)
  const top3 = new Set(rank.slice(0, 3).map(r => r.i))
  const sum3 = rank.slice(0, 3).reduce((a, r) => a + r.eg, 0)
  const all = semanas.reduce((a, s) => a + s.egreso, 0)
  let ti = 0, te = 0
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={sectionTitle}>Detalle semanal</h2>
      <p style={sectionCap}>{all ? `Las tres semanas sombreadas concentran el ${Math.round(sum3 / all * 100)}% de los egresos del periodo.` : 'Sin egresos capturados en este filtro.'}</p>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={tblStyle}>
          <thead><tr><th style={thLeft}>Semana</th><th style={th}>Ingresos</th><th style={th}>Egresos</th><th style={th}>Neto</th><th style={th}>Saldo al cierre</th></tr></thead>
          <tbody>
            {semanas.map((s, i) => {
              ti += s.ingreso; te += s.egreso
              const neto = s.ingreso - s.egreso
              return (
                <tr key={i} style={{ borderBottom: '1px solid #e6ecf4', background: top3.has(i) && s.egreso ? '#f0f4fa' : undefined }}>
                  <td style={tdLeft}>{fdate(s.inicio)} – {fdate(s.fin)}</td>
                  <td style={td}>{s.ingreso ? mxn0(s.ingreso) : '—'}</td>
                  <td style={td}>{s.egreso ? mxn0(s.egreso) : '—'}</td>
                  <td style={{ ...td, color: neto < 0 ? '#b23a48' : undefined }}>{(neto >= 0 ? '+' : '') + mxn0(neto)}</td>
                  <td style={{ ...td, color: s.saldo < 0 ? '#b23a48' : undefined }}>{mxn0(s.saldo)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={tdLeft}><strong>Periodo</strong></td>
              <td style={tdTot}>{mxn0(ti)}</td><td style={tdTot}>{mxn0(te)}</td>
              <td style={{ ...tdTot, color: ti - te < 0 ? '#b23a48' : undefined }}>{(ti - te >= 0 ? '+' : '') + mxn0(ti - te)}</td>
              <td style={{ ...tdTot, color: semanas[semanas.length - 1].saldo < 0 ? '#b23a48' : undefined }}>{mxn0(semanas[semanas.length - 1].saldo)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ── Listas ────────────────────────────────────────────────────
function ListaCompromisos({ dias }: { dias: DiaCalc[] }) {
  const tot: Partial<Record<ConceptoId, number>> = {}
  const fechas: Partial<Record<ConceptoId, number[]>> = {}
  dias.forEach(d => {
    (Object.keys(d.detalleConcepto) as ConceptoId[]).forEach(c => {
      tot[c] = (tot[c] ?? 0) + (d.detalleConcepto[c] ?? 0)
      ;(fechas[c] ??= []).push(d.ts)
    })
  })
  const orden = (Object.keys(tot) as ConceptoId[]).sort((a, b) => (tot[b] ?? 0) - (tot[a] ?? 0))
  return (
    <div>
      <h2 style={sectionTitle}>Compromisos del periodo</h2>
      <p style={sectionCap}>Monto total y fechas de cada concepto.</p>
      <div className="card" style={{ padding: '0 16px' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {orden.length ? orden.map(c => {
            const f = fechas[c] ?? []
            const unit = Math.round((tot[c] ?? 0) / f.length)
            const cuando = f.length > 4 ? `${f.length} pagos de ${mxn0(unit)}` : f.map(fdate).join(' · ')
            return (
              <li key={c} style={{ display: 'grid', gridTemplateColumns: '11px 1fr auto', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid #e6ecf4', fontSize: 13 }}>
                <i style={{ width: 11, height: 11, borderRadius: 2, background: GCOLOR[CPT[c].grupo], alignSelf: 'center' }} />
                <span>{CPT[c].nombre}<span style={{ display: 'block', fontSize: 11.5, color: '#7a8aa3' }}>{cuando}</span></span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{mxn0(tot[c] ?? 0)}</span>
              </li>
            )
          }) : <li style={{ padding: '14px 0', color: '#7a8aa3', fontSize: 13 }}>Sin egresos capturados en este filtro.</li>}
        </ul>
      </div>
    </div>
  )
}

function ListaPicos({ dias }: { dias: DiaCalc[] }) {
  const picos = dias.filter(d => d.egreso > 0).sort((a, b) => b.egreso - a.egreso).slice(0, 5)
  return (
    <div>
      <h2 style={sectionTitle}>Días de mayor exigencia</h2>
      <p style={sectionCap}>Los cinco días con más salida de efectivo.</p>
      <div className="card" style={{ padding: '0 16px' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {picos.length ? picos.map(d => {
            const cs = (Object.keys(d.detalleConcepto) as ConceptoId[]).sort((a, b) => (d.detalleConcepto[b] ?? 0) - (d.detalleConcepto[a] ?? 0))
            return (
              <li key={d.ts} style={{ display: 'grid', gridTemplateColumns: '11px 1fr auto', gap: 10, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid #e6ecf4', fontSize: 13 }}>
                <i style={{ width: 11, height: 11, borderRadius: 2, background: GCOLOR[CPT[cs[0]].grupo], alignSelf: 'center' }} />
                <span>{flong(d.ts)}<span style={{ display: 'block', fontSize: 11.5, color: '#7a8aa3' }}>{cs.map(c => CPT[c].nombre).join(' + ')}</span></span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{mxn0(d.egreso)}</span>
              </li>
            )
          }) : <li style={{ padding: '14px 0', color: '#7a8aa3', fontSize: 13 }}>Sin egresos capturados en este filtro.</li>}
        </ul>
      </div>
    </div>
  )
}

// ── Narrativa ─────────────────────────────────────────────────
function Narrativa({ dias, semanas, kpis, filtroCC, centros, matriz }: {
  dias: DiaCalc[]; semanas: SemanaCalc[]; kpis: ReturnType<typeof calcularKpis>
  filtroCC: number | 'all'; centros: CentroCosto[]; matriz: Matriz
}) {
  const alcance = filtroCC === 'all' ? 'el consolidado' : (centros.find(c => c.id === filtroCC)?.nombre ?? '')
  if (!kpis.egreso && !kpis.ingreso) {
    return (
      <div className="card" style={{ borderLeft: '3px solid #D4A574', padding: '14px 16px', fontSize: 13, color: '#4a5b77' }}>
        <strong>Sin datos en este filtro</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          <li>No hay montos capturados para {alcance}. Escribe los importes en la matriz de arriba.</li>
        </ul>
      </div>
    )
  }
  const li: string[] = []
  const primerNeg = dias.find(d => d.saldo < 0)
  if (kpis.falta > 0 && primerNeg) {
    li.push(`Entra en rojo el ${flong(primerNeg.ts)} y acumula ${kpis.diasNegativos} días en descubierto. El hueco máximo es de ${mxn0(kpis.falta)} el ${flong(kpis.minTs)} — ése es el tamaño de la línea de crédito o del colchón inicial.`)
    li.push(`Harían falta ${mxn0(kpis.ingresoEquilibrioMensual)} de ingreso mensual para cerrar en cero.`)
  } else {
    li.push(`Ningún día queda en descubierto; el piso es ${mxn0(kpis.minSaldo)} el ${flong(kpis.minTs)}.`)
  }
  const pico = [...dias].filter(d => d.egreso > 0).sort((a, b) => b.egreso - a.egreso)[0]
  const semPico = [...semanas].sort((a, b) => b.egreso - a.egreso)[0]
  if (pico && semPico) li.push(`El día más pesado es ${flong(pico.ts)} con ${mxn0(pico.egreso)}. La semana más pesada es la del ${fdate(semPico.inicio)} con ${mxn0(semPico.egreso)}.`)
  const vie = filtroCC === 'all'
    ? centros.reduce((a, cc) => a + (matriz.NS?.[cc.id] ?? 0) + (matriz.PPE?.[cc.id] ?? 0) + (matriz.COMBS?.[cc.id] ?? 0), 0)
    : (matriz.NS?.[filtroCC] ?? 0) + (matriz.PPE?.[filtroCC] ?? 0) + (matriz.COMBS?.[filtroCC] ?? 0)
  if (vie) li.push(`Piso fijo de cada viernes: ${mxn0(vie)} (nómina semanal + personal extraordinario + combustible).`)
  const fds = dias.filter(d => d.egreso > 0 && ((new Date(d.ts).getUTCDay() + 6) % 7) >= 5)
  if (fds.length) li.push(`${fds.length} fechas de pago caen en fin de semana (${fds.map(d => flong(d.ts)).join(', ')}): la transferencia debe quedar fondeada el día hábil previo.`)
  return (
    <div className="card" style={{ borderLeft: '3px solid #D4A574', padding: '14px 16px', fontSize: 13, color: '#4a5b77', marginBottom: 20 }}>
      <strong style={{ color: '#152540' }}>Cómo se lee este escenario</strong>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
        {li.map((t, i) => <li key={i} style={{ marginBottom: 5 }}>{t}</li>)}
      </ul>
    </div>
  )
}

// ── Modal: nuevo periodo / duplicar ──────────────────────────
function ModalPeriodo({ periodos, onClose, onCreado }: {
  periodos: PeriodoRow[]; onClose: () => void; onCreado: (p: PeriodoRow) => void
}) {
  const { authUser } = useAuth()
  const hoy = new Date()
  const finDefault = new Date(hoy.getFullYear(), hoy.getMonth() + 2, 1) // trimestre por default (mes actual + 2)
  const [nombre, setNombre] = useState('')
  const [anioIni, setAnioIni] = useState(hoy.getFullYear())
  const [mesIni, setMesIni] = useState(hoy.getMonth() + 1)
  const [anioFin, setAnioFin] = useState(finDefault.getFullYear())
  const [mesFin, setMesFin] = useState(finDefault.getMonth() + 1)
  const [copiarDeId, setCopiarDeId] = useState<number | ''>('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crear() {
    setError(null)
    if (!nombre.trim()) { setError('Ponle un nombre al periodo.'); return }
    const fechaInicio = primerDiaMes(anioIni, mesIni)
    const fechaFin = ultimoDiaMesISO(anioFin, mesFin)
    if (fechaFin < fechaInicio) { setError('El mes final no puede ser anterior al mes inicial.'); return }
    setGuardando(true)
    const { data, error: errIns } = await dbComp.from('flujo_caja_periodos').insert({
      nombre: nombre.trim(), fecha_inicio: fechaInicio, fecha_fin: fechaFin,
      saldo_inicial: 0, dia_pago_impuestos: 17, frecuencia_proveedores: 'semanal',
      created_by: authUser?.nombre ?? null,
    }).select('*').single()
    if (errIns || !data) { setError(errIns?.message ?? 'No se pudo crear el periodo.'); setGuardando(false); return }

    if (copiarDeId) {
      const [{ data: cap }, { data: ing }] = await Promise.all([
        dbComp.from('flujo_caja_captura').select('concepto, id_centro_costo_fk, monto_por_pago').eq('id_periodo_fk', copiarDeId),
        dbComp.from('flujo_caja_ingresos').select('id_centro_costo_fk, mes, monto_mensual').eq('id_periodo_fk', copiarDeId),
      ])
      if (cap?.length) {
        await dbComp.from('flujo_caja_captura').insert(
          cap.map(r => ({ id_periodo_fk: data.id, concepto: r.concepto, id_centro_costo_fk: r.id_centro_costo_fk, monto_por_pago: r.monto_por_pago })),
        )
      }
      if (ing?.length) {
        // Mapea meses por posición relativa (1er mes origen → 1er mes destino, etc.)
        const origenMeses = Array.from(new Set(ing.map(r => r.mes))).sort()
        const destMeses = mesesDelPeriodo({ fechaInicio, fechaFin, saldoInicial: 0, diaPagoImpuestos: 17, frecuenciaProveedores: 'semanal' }).map(isoOf)
        const map = new Map(origenMeses.map((m, i) => [m, destMeses[i]]))
        const filas = ing.map(r => ({ id_periodo_fk: data.id, id_centro_costo_fk: r.id_centro_costo_fk, mes: map.get(r.mes), monto_mensual: r.monto_mensual }))
          .filter(r => r.mes)
        if (filas.length) await dbComp.from('flujo_caja_ingresos').insert(filas)
      }
    }
    setGuardando(false)
    onCreado(data as PeriodoRow)
  }

  const anios = Array.from({ length: 6 }, (_, i) => hoy.getFullYear() - 1 + i)

  return (
    <ModalShell modulo="tesoreria" titulo="Nuevo periodo de Flujo de Caja" icono={Wallet} onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={crear} disabled={guardando}>{guardando ? 'Creando…' : 'Crear periodo'}</button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={lbl}>Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. 1T 2027" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Mes inicial</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={mesIni} onChange={e => setMesIni(Number(e.target.value))} style={inputStyle}>
                {MESES_LARGO.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={anioIni} onChange={e => setAnioIni(Number(e.target.value))} style={inputStyle}>
                {anios.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Mes final</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={mesFin} onChange={e => setMesFin(Number(e.target.value))} style={inputStyle}>
                {MESES_LARGO.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={anioFin} onChange={e => setAnioFin(Number(e.target.value))} style={inputStyle}>
                {anios.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
        </div>
        {periodos.length > 0 && (
          <div>
            <label style={lbl}>Copiar captura desde (opcional)</label>
            <select value={copiarDeId} onChange={e => setCopiarDeId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
              <option value="">No copiar — empezar en blanco</option>
              {periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <p style={{ fontSize: 11.5, color: '#7a8aa3', marginTop: 5 }}>
              Copia los montos por pago y los ingresos mensuales del periodo elegido (los meses se acomodan por posición relativa).
            </p>
          </div>
        )}
        {error && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#b23a48', fontSize: 12.5 }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: '#7a8aa3', fontWeight: 700, marginBottom: 6 }
