'use client'
import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { PrintBar } from '@/app/reportes/utils'

const UNIDAD: Record<string, string> = { CFE: 'kWh', Agua: 'm³', 'Gas LP': 'L' }
type Sem = 'ROJO' | 'AMARILLO' | 'VERDE' | null
const SEM_COLOR: Record<string, string> = { ROJO: '#dc2626', AMARILLO: '#d97706', VERDE: '#15803d' }

const money = (n: number | null | undefined, d = 0) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: d, maximumFractionDigits: d })
const numf = (n: number | null | undefined, d = 0) =>
  n == null ? '—' : n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`)
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const lblPeriodo = (f: string) => { const [y, m] = f.split('-'); return `${MESES[Number(m) - 1]} ${y.slice(2)}` }

const dias = (r: any, modalidad: string) => {
  if (r.fecha_inicio && r.fecha_fin) {
    const d = Math.round((new Date(r.fecha_fin + 'T12:00:00').getTime() - new Date(r.fecha_inicio + 'T12:00:00').getTime()) / 86400000) + 1
    if (d > 0) return d
  }
  return modalidad === 'Bimestral' ? 61 : 30
}

type Calc = {
  s: any; ult: any; ant: any; regs: any[]; d: number
  consumo: number | null; costo: number; precio: number | null
  promConsumo: number | null; promPrecio: number | null; nPrev: number
  varConsumo: number | null; varPrecio: number | null; varCostoAnt: number | null
  mensual: number; alertas: { nivel: 'warn' | 'info' | 'ok'; txt: string }[]
}

export default function InformeServicio({ catalogo, registros, ccMap, areaMap }: {
  catalogo: any[]; registros: Record<number, any[]>
  ccMap: Record<number, string>; areaMap: Record<number, string>
}) {
  const [umbAm, setUmbAm] = useState(15)
  const [umbRo, setUmbRo] = useState(30)
  const [metaFP, setMetaFP] = useState(90)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroCC, setFiltroCC] = useState('')
  const [sel, setSel] = useState<number | null>(null)

  const sem = (v: number | null): Sem =>
    v == null ? null : v >= umbRo / 100 ? 'ROJO' : v >= umbAm / 100 ? 'AMARILLO' : 'VERDE'

  const etiqueta = (s: any) =>
    [ccMap[s.id_centro_costo_fk] ?? 'Sin CC', areaMap[s.id_area_fk] ?? s.ubicacion ?? '', s.no_servicio].filter(Boolean).join(' · ')

  const calcs = useMemo<Calc[]>(() => catalogo.map(s => {
    const regs = [...(registros[s.id] ?? [])].sort((a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? ''))
    const conImporte = regs.filter(r => r.monto_periodo > 0)
    const ult = conImporte[0] ?? regs[0], ant = conImporte[1] ?? regs[1]
    const prev = regs.slice(regs.indexOf(ult) + 1, regs.indexOf(ult) + 12)
    // Registros de histórico "solo consumo" traen monto 0: no cuentan para precio
    const precioDe = (r: any) => (r?.consumo_periodo > 0 && r?.monto_periodo > 0 ? r.monto_periodo / r.consumo_periodo : null)
    const consumo = ult?.consumo_periodo ?? null
    const costo = ult?.monto_periodo ?? 0
    const precio = precioDe(ult)
    const promConsumo = avg(prev.filter(r => r.consumo_periodo > 0).map(r => r.consumo_periodo))
    const promPrecio = avg(prev.map(precioDe).filter((x): x is number => x != null))
    const varConsumo = consumo != null && promConsumo ? consumo / promConsumo - 1 : null
    const varPrecio = precio != null && promPrecio ? precio / promPrecio - 1 : null
    const varCostoAnt = ant?.monto_periodo ? costo / ant.monto_periodo - 1 : null
    const d = ult ? dias(ult, s.modalidad) : 30
    const alertas: Calc['alertas'] = []
    if (ult) {
      const u = UNIDAD[s.tipo_servicio] ?? ''
      if (consumo === 0) alertas.push({ nivel: 'warn', txt: `Consumo 0 ${u} en el periodo: verificar medidor/servicio.` })
      if (varConsumo != null && varConsumo >= umbAm / 100)
        alertas.push({ nivel: 'warn', txt: `Consumo ${pct(varConsumo)} sobre su promedio previo: validar en campo la causa.` })
      if (varPrecio != null && varPrecio >= umbAm / 100)
        alertas.push({ nivel: 'warn', txt: `Precio por ${u} ${pct(varPrecio)} sobre su promedio previo.` })
      if (ult.factor_potencia != null && ult.factor_potencia < metaFP)
        alertas.push({ nivel: 'warn', txt: `Factor de potencia ${numf(ult.factor_potencia, 2)}% < ${metaFP}%${ult.cargo_fp ? `: cargo por FP ${money(ult.cargo_fp, 2)}` : ''}.` })
      if (ult.tipo_lectura === 'Estimada') alertas.push({ nivel: 'warn', txt: 'Lectura estimada (no medida).' })
      if (!alertas.length) alertas.push({ nivel: 'ok', txt: 'Sin alertas en el último periodo.' })
      if (s.tipo_servicio === 'CFE' && ult.factor_potencia == null)
        alertas.push({ nivel: 'info', txt: 'Sin factor de potencia capturado: no se evalúa esa alerta.' })
    } else alertas.push({ nivel: 'info', txt: 'Sin registros para este servicio.' })
    return { s, ult, ant, regs, d, consumo, costo, precio, promConsumo, promPrecio, nPrev: prev.length,
      varConsumo, varPrecio, varCostoAnt, mensual: (costo / d) * 30.4, alertas }
  }), [catalogo, registros, umbAm, metaFP])

  const lista = calcs.filter(c =>
    (!filtroTipo || c.s.tipo_servicio === filtroTipo) &&
    (!filtroCC || String(c.s.id_centro_costo_fk ?? '') === filtroCC))
    .sort((a, b) => b.costo - a.costo)
  const totalUlt = lista.reduce((a, c) => a + c.costo, 0)

  // Totales por centro de costo (decisión que soporta el informe: asignación del gasto)
  const porCC = useMemo(() => {
    const m: Record<string, { costo: number; consumo: number; n: number }> = {}
    lista.forEach(c => {
      const k = ccMap[c.s.id_centro_costo_fk] ?? 'Sin CC'
      m[k] ??= { costo: 0, consumo: 0, n: 0 }
      m[k].costo += c.costo; m[k].consumo += c.consumo ?? 0; m[k].n++
    })
    return Object.entries(m).sort((a, b) => b[1].costo - a[1].costo)
  }, [lista, ccMap])

  const cur = calcs.find(c => c.s.id === sel) ?? null

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lista.map((c, i) => ({
      '#': i + 1, 'Centro de Costo': ccMap[c.s.id_centro_costo_fk] ?? '', 'Área': areaMap[c.s.id_area_fk] ?? '',
      'Ubicación': c.s.ubicacion ?? '', 'No. Servicio': c.s.no_servicio, Tipo: c.s.tipo_servicio, Tarifa: c.s.tarifa ?? '',
      'Inicio periodo': c.ult?.fecha_inicio ?? '', 'Fin periodo': c.ult?.fecha_fin ?? '', Días: c.ult ? c.d : '',
      Consumo: c.consumo ?? '', Costo: c.costo, '$/unidad': c.precio ?? '', 'Costo mensual equiv.': c.ult ? c.mensual : '',
      'Var. consumo vs prom.': c.varConsumo ?? '', 'Var. precio vs prom.': c.varPrecio ?? '',
      'Participación': totalUlt ? c.costo / totalUlt : '', 'Factor potencia %': c.ult?.factor_potencia ?? '',
      'Cargo FP': c.ult?.cargo_fp ?? '', Alertas: c.alertas.filter(a => a.nivel === 'warn').map(a => a.txt).join(' | '),
    }))), 'Ranking')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porCC.map(([k, v]) => ({
      'Centro de Costo': k, Servicios: v.n, 'Costo último periodo': v.costo, Participación: totalUlt ? v.costo / totalUlt : 0,
    }))), 'Por Centro de Costo')
    const hist: any[] = []
    lista.forEach(c => c.regs.forEach(r => hist.push({
      'No. Servicio': c.s.no_servicio, 'Centro de Costo': ccMap[c.s.id_centro_costo_fk] ?? '', 'Área': areaMap[c.s.id_area_fk] ?? '',
      Inicio: r.fecha_inicio, Fin: r.fecha_fin ?? '', Consumo: r.consumo_periodo ?? '', Monto: r.monto_periodo,
      'Demanda kW': r.demanda_max_kw ?? '', 'FP %': r.factor_potencia ?? '', 'Cargo FP': r.cargo_fp ?? '',
      'Bonif. FP': r.bonif_fp ?? '', Subtotal: r.subtotal ?? '', IVA: r.iva ?? '', DAP: r.dap ?? '', Lectura: r.tipo_lectura ?? '',
    })))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hist), 'Histórico')
    XLSX.writeFile(wb, `Informe-Servicios_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const Card = ({ titulo, valor, sub, s }: { titulo: string; valor: string; sub: string; s?: Sem }) => (
    <div className="card" style={{ padding: '10px 14px', borderLeft: s ? `4px solid ${SEM_COLOR[s]}` : undefined }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      <div style={{ fontSize: 11, color: s ? SEM_COLOR[s] : 'var(--text-muted)', fontWeight: s ? 600 : 400 }}>{sub}</div>
    </div>
  )

  const SemBadge = ({ s }: { s: Sem }) => s
    ? <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, color: '#fff', background: SEM_COLOR[s] }}>{s}</span>
    : <span style={{ color: 'var(--text-muted)' }}>—</span>

  // Gráfica de barras simple (últimos 12 periodos, orden cronológico)
  const Barras = ({ datos, color, fmtV, titulo }: { datos: { l: string; v: number }[]; color: string; fmtV: (n: number) => string; titulo: string }) => {
    const W = 520, H = 170, P = { l: 8, r: 8, t: 14, b: 26 }
    const max = Math.max(...datos.map(d => d.v), 1)
    const bw = (W - P.l - P.r) / Math.max(datos.length, 1)
    const prom = avg(datos.map(d => d.v)) ?? 0
    const yp = H - P.b - (prom / max) * (H - P.t - P.b)
    return (
      <div className="card" style={{ padding: '10px 12px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{titulo}</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
          {datos.map((d, i) => {
            const h = (d.v / max) * (H - P.t - P.b)
            const x = P.l + i * bw + 3
            const ultimo = i === datos.length - 1
            return (
              <g key={i}>
                <rect x={x} y={H - P.b - h} width={Math.max(bw - 6, 4)} height={h} rx={2} fill={color} opacity={ultimo ? 1 : 0.55} />
                <text x={x + (bw - 6) / 2} y={H - P.b - h - 3} textAnchor="middle" fontSize={8} fill="#64748b">{fmtV(d.v)}</text>
                <text x={x + (bw - 6) / 2} y={H - 10} textAnchor="middle" fontSize={8} fill="#64748b">{d.l}</text>
              </g>
            )
          })}
          {datos.length > 1 && <>
            <line x1={P.l} x2={W - P.r} y1={yp} y2={yp} stroke="#94a3b8" strokeDasharray="4 3" strokeWidth={1} />
            <text x={W - P.r} y={yp - 3} textAnchor="end" fontSize={8} fill="#94a3b8">promedio {fmtV(prom)}</text>
          </>}
        </svg>
      </div>
    )
  }

  const inpS = { fontSize: 12, height: 28, padding: '3px 8px' } as const

  return (
    <div>
      {/* Filtros y parámetros */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '8px 12px',
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
        <select className="select" style={{ ...inpS, width: 120 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {['CFE', 'Agua', 'Gas LP'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="select" style={{ ...inpS, maxWidth: 210 }} value={filtroCC} onChange={e => setFiltroCC(e.target.value)}>
          <option value="">Todos los centros</option>
          {Object.entries(ccMap).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <div style={{ width: 1, height: 18, background: '#e2e8f0' }} />
        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Umbral amarillo %
          <input className="input" type="number" style={{ ...inpS, width: 60, marginLeft: 4 }} value={umbAm} onChange={e => setUmbAm(Number(e.target.value))} /></label>
        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>rojo %
          <input className="input" type="number" style={{ ...inpS, width: 60, marginLeft: 4 }} value={umbRo} onChange={e => setUmbRo(Number(e.target.value))} /></label>
        <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Meta FP %
          <input className="input" type="number" style={{ ...inpS, width: 60, marginLeft: 4 }} value={metaFP} onChange={e => setMetaFP(Number(e.target.value))} /></label>
        <button className="btn-ghost" style={{ ...inpS, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} onClick={exportarExcel}>
          <Download size={11} /> Excel
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
        Semáforo: consumo y precio del último periodo contra el promedio de hasta 11 periodos previos
        (amarillo ≥ +{umbAm}%, rojo ≥ +{umbRo}%). Los umbrales son una propuesta — validar con Dirección.
      </div>

      {/* Selector de servicio */}
      <div style={{ marginBottom: 12 }}>
        <select className="select" style={{ fontSize: 13, height: 32, maxWidth: 520 }} value={sel ?? ''}
          onChange={e => setSel(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Vista general (todos los servicios)</option>
          {lista.map(c => <option key={c.s.id} value={c.s.id}>{etiqueta(c.s)}</option>)}
        </select>
      </div>

      {!cur ? (
        <div id="reporte-print-area">
          <PrintBar title="Informe de Servicios" count={lista.length} reportTitle="Informe de Servicios — último periodo por servicio" hideCSV />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
            <Card titulo="Costo último periodo" valor={money(totalUlt)} sub={`${lista.length} servicios`} />
            <Card titulo="Con alerta" valor={String(lista.filter(c => c.alertas.some(a => a.nivel === 'warn')).length)} sub="requieren revisión" />
            <Card titulo="En rojo" valor={String(lista.filter(c => sem(c.varConsumo) === 'ROJO' || sem(c.varPrecio) === 'ROJO').length)} sub="consumo o precio atípico" />
            <Card titulo="Servicio más caro" valor={lista[0] ? money(lista[0].costo) : '—'} sub={lista[0] ? etiqueta(lista[0].s) : ''} />
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Por centro de costo (último periodo de cada servicio)</div>
            <table>
              <thead><tr><th>Centro de Costo</th><th style={{ textAlign: 'right' }}>Servicios</th><th style={{ textAlign: 'right' }}>Costo</th><th style={{ textAlign: 'right' }}>Participación</th></tr></thead>
              <tbody>{porCC.map(([k, v]) => (
                <tr key={k}><td style={{ fontWeight: 600 }}>{k}</td><td style={{ textAlign: 'right' }}>{v.n}</td>
                  <td style={{ textAlign: 'right' }}>{money(v.costo)}</td>
                  <td style={{ textAlign: 'right' }}>{totalUlt ? ((v.costo / totalUlt) * 100).toFixed(1) : 0}%</td></tr>
              ))}</tbody>
            </table>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Ranking de servicios por costo</div>
            <div style={{ overflowX: 'auto' }}>
              <table id="reporte-table">
                <thead><tr>
                  <th>#</th><th>Servicio</th><th>Tipo</th><th>Periodo</th>
                  <th style={{ textAlign: 'right' }}>Consumo</th><th style={{ textAlign: 'right' }}>Costo</th>
                  <th style={{ textAlign: 'right' }}>$/unidad</th><th style={{ textAlign: 'right' }}>Var. consumo</th>
                  <th style={{ textAlign: 'right' }}>Part.</th><th>Semáforo</th><th>Alertas</th>
                </tr></thead>
                <tbody>{lista.map((c, i) => {
                  const warns = c.alertas.filter(a => a.nivel === 'warn').length
                  return (
                    <tr key={c.s.id} onClick={() => setSel(c.s.id)} style={{ cursor: 'pointer' }}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{etiqueta(c.s)}</td>
                      <td>{c.s.tipo_servicio}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{c.ult ? lblPeriodo(c.ult.fecha_inicio) : '—'}</td>
                      <td style={{ textAlign: 'right' }}>{c.consumo != null ? `${numf(c.consumo)} ${UNIDAD[c.s.tipo_servicio]}` : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(c.costo)}</td>
                      <td style={{ textAlign: 'right' }}>{money(c.precio, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{pct(c.varConsumo)}</td>
                      <td style={{ textAlign: 'right' }}>{totalUlt ? ((c.costo / totalUlt) * 100).toFixed(1) : 0}%</td>
                      <td><SemBadge s={sem(Math.max(c.varConsumo ?? -1, c.varPrecio ?? -1) === -1 ? null : Math.max(c.varConsumo ?? -1, c.varPrecio ?? -1))} /></td>
                      <td style={{ color: warns ? '#d97706' : 'var(--text-muted)', fontWeight: warns ? 600 : 400 }}>{warns || '—'}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div id="reporte-print-area">
          <PrintBar title={`Informe — ${cur.s.no_servicio}`} count={cur.regs.length} reportTitle={`Informe por servicio — ${etiqueta(cur.s)}`} hideCSV />
          {/* Ficha */}
          <div className="card" style={{ padding: '10px 14px', marginBottom: 10, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: 12 }}>
            {[
              ['No. Servicio', cur.s.no_servicio], ['Tipo', `${cur.s.tipo_servicio} · ${cur.s.modalidad}`],
              ['Centro de costo', ccMap[cur.s.id_centro_costo_fk] ?? '—'], ['Área', areaMap[cur.s.id_area_fk] ?? cur.s.ubicacion ?? '—'],
              ['Tarifa', cur.s.tarifa ?? '—'], ['Medidor', cur.s.medidor ?? '—'],
              ['Carga conectada', cur.s.carga_kw != null ? `${numf(cur.s.carga_kw, 1)} kW` : '—'], ['Responsable', cur.s.responsable ?? '[PENDIENTE]'],
              ['Titular', cur.s.titular ?? '—'], ['Ubicación', cur.s.ubicacion ?? '—'],
              ['Periodo', cur.ult ? `${cur.ult.fecha_inicio} a ${cur.ult.fecha_fin ?? '—'}` : '—'], ['Días', cur.ult ? String(cur.d) : '—'],
            ].map(([k, v]) => (
              <div key={k}><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div></div>
            ))}
          </div>

          {/* Indicadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
            <Card titulo="Consumo del periodo" s={sem(cur.varConsumo)}
              valor={cur.consumo != null ? `${numf(cur.consumo)} ${UNIDAD[cur.s.tipo_servicio]}` : '—'}
              sub={cur.varConsumo != null ? `vs promedio previo: ${pct(cur.varConsumo)} (${numf(cur.promConsumo)})` : `${numf(cur.consumo != null ? cur.consumo / cur.d : null, 1)} ${UNIDAD[cur.s.tipo_servicio]}/día`} />
            <Card titulo="Costo del periodo" valor={money(cur.costo)}
              sub={`${cur.d} días · vs anterior: ${pct(cur.varCostoAnt)}`} />
            <Card titulo="Precio promedio" s={sem(cur.varPrecio)} valor={money(cur.precio, 2)}
              sub={cur.varPrecio != null ? `vs promedio previo: ${pct(cur.varPrecio)} (${money(cur.promPrecio, 2)})` : `por ${UNIDAD[cur.s.tipo_servicio]}`} />
            <Card titulo="Costo mensual equiv." valor={money(cur.mensual)}
              sub={`${totalUlt ? ((cur.costo / totalUlt) * 100).toFixed(1) : 0}% del gasto · lugar ${lista.findIndex(c => c.s.id === cur.s.id) + 1} de ${lista.length}`} />
          </div>

          {/* Gráficas */}
          {(() => {
            const h = [...cur.regs].slice(0, 12).reverse()
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <Barras titulo={`Consumo por periodo (${UNIDAD[cur.s.tipo_servicio]})`} color="#d97706"
                  datos={h.map(r => ({ l: lblPeriodo(r.fecha_inicio), v: r.consumo_periodo ?? 0 }))} fmtV={n => numf(n)} />
                <Barras titulo="Costo por periodo ($)" color="#2563eb"
                  datos={h.map(r => ({ l: lblPeriodo(r.fecha_inicio), v: r.monto_periodo ?? 0 }))} fmtV={n => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))} />
              </div>
            )
          })()}

          {/* Composición del recibo (si hay detalle) */}
          {cur.ult?.subtotal != null && (
            <div className="card" style={{ padding: '10px 14px', marginBottom: 10, fontSize: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <b>Composición del último recibo:</b>
              <span>Subtotal {money(cur.ult.subtotal, 2)}</span><span>IVA {money(cur.ult.iva, 2)}</span>
              {cur.ult.dap != null && <span>DAP {money(cur.ult.dap, 2)}</span>}
              {cur.ult.cargo_fp ? <span style={{ color: '#dc2626' }}>Cargo FP {money(cur.ult.cargo_fp, 2)}</span> : null}
              {cur.ult.bonif_fp ? <span style={{ color: '#15803d' }}>Bonif. FP {money(cur.ult.bonif_fp, 2)}</span> : null}
              {cur.ult.demanda_max_kw != null && <span>Demanda {numf(cur.ult.demanda_max_kw, 1)} kW</span>}
              {cur.ult.factor_potencia != null && <span>FP {numf(cur.ult.factor_potencia, 2)}%</span>}
            </div>
          )}

          {/* Comparativo */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>
              Último recibo vs anterior vs promedio de {cur.nPrev} periodos previos
            </div>
            <table>
              <thead><tr><th>Concepto</th><th style={{ textAlign: 'right' }}>Último</th><th style={{ textAlign: 'right' }}>Anterior</th>
                <th style={{ textAlign: 'right' }}>Var.</th><th style={{ textAlign: 'right' }}>Prom. previo</th><th style={{ textAlign: 'right' }}>Var.</th><th>Semáforo</th></tr></thead>
              <tbody>
                <tr><td>Consumo ({UNIDAD[cur.s.tipo_servicio]})</td><td style={{ textAlign: 'right' }}>{numf(cur.consumo)}</td>
                  <td style={{ textAlign: 'right' }}>{numf(cur.ant?.consumo_periodo)}</td>
                  <td style={{ textAlign: 'right' }}>{cur.ant?.consumo_periodo ? pct((cur.consumo ?? 0) / cur.ant.consumo_periodo - 1) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{numf(cur.promConsumo)}</td><td style={{ textAlign: 'right' }}>{pct(cur.varConsumo)}</td><td><SemBadge s={sem(cur.varConsumo)} /></td></tr>
                <tr><td>Costo del periodo</td><td style={{ textAlign: 'right' }}>{money(cur.costo, 2)}</td>
                  <td style={{ textAlign: 'right' }}>{money(cur.ant?.monto_periodo, 2)}</td><td style={{ textAlign: 'right' }}>{pct(cur.varCostoAnt)}</td>
                  <td style={{ textAlign: 'right' }}>—</td><td style={{ textAlign: 'right' }}>—</td><td>—</td></tr>
                <tr><td>Precio por {UNIDAD[cur.s.tipo_servicio]}</td><td style={{ textAlign: 'right' }}>{money(cur.precio, 2)}</td>
                  <td style={{ textAlign: 'right' }}>{cur.ant?.consumo_periodo > 0 ? money(cur.ant.monto_periodo / cur.ant.consumo_periodo, 2) : '—'}</td>
                  <td style={{ textAlign: 'right' }}>—</td><td style={{ textAlign: 'right' }}>{money(cur.promPrecio, 2)}</td>
                  <td style={{ textAlign: 'right' }}>{pct(cur.varPrecio)}</td><td><SemBadge s={sem(cur.varPrecio)} /></td></tr>
              </tbody>
            </table>
          </div>

          {/* Alertas */}
          <div className="card" style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Alertas automáticas</div>
            {cur.alertas.map((a, i) => (
              <div key={i} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0',
                color: a.nivel === 'warn' ? '#b45309' : a.nivel === 'ok' ? '#15803d' : 'var(--text-muted)' }}>
                {a.nivel === 'warn' ? <AlertTriangle size={12} /> : a.nivel === 'ok' ? <CheckCircle2 size={12} /> : <span style={{ width: 12, textAlign: 'center' }}>•</span>}
                {a.txt}
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              El informe muestra, no decide: las causas se validan en campo. Responsable: {cur.s.responsable ?? '[PENDIENTE]'}.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
