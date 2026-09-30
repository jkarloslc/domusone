'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'

type Clasificacion = 'operativo' | 'financiero' | 'intercompanias'
type DetMap = Record<number, Record<number, number>>
export type FilaGrid = {
  id: number; nombre: string; tipo: 'ingreso' | 'egreso'; clasificacion: Clasificacion
  orden: number; tipo_gasto: string | null; id_centro_costo_fk: number | null; id_agrupador_fk: number | null
}
export type Vista = 'detalle' | 'concepto' | 'agrupado'
type Linea = { key: string; nombre: string; orden: number; ids: number[] }
type Metrica = 'real' | 'ppto' | 'var'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const CLASIFICACIONES: Clasificacion[] = ['operativo', 'financiero', 'intercompanias']
export type LabelsClas = Record<Clasificacion, { ingresos: string; egresos: string; balance: string }>
const METRICAS: { v: Metrica; label: string }[] = [
  { v: 'real', label: 'Real' },
  { v: 'ppto', label: 'Presupuesto' },
  { v: 'var',  label: 'Variación' },
]

const fmtN = (n: number) => Math.round(n).toLocaleString('es-MX')
const NUM: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

const SIN_AGRUPADOR = 'Sin Agrupador'

export default function GridMensual({ filas, detMap, realMap, vista, agrupadores, labels: LABELS, netoLabel, archivo }: {
  filas: FilaGrid[]; detMap: DetMap; realMap: DetMap
  labels: LabelsClas; netoLabel: string; archivo: string
  vista: Vista; agrupadores: { id: number; nombre: string; orden: number }[]
}) {
  const [metrica, setMetrica] = useState<Metrica>('real')
  const [ocultarVacios, setOcultarVacios] = useState(false)
  const [acum, setAcum] = useState(false)

  const mesesTodos = Array.from({ length: 12 }, (_, i) => i + 1)
  const ppto = (pid: number, m: number) => detMap[pid]?.[m] ?? 0
  const real = (pid: number, m: number) => realMap[pid]?.[m] ?? 0
  // valorMes = monto del mes; valor = lo que se muestra (corrido si Acumulado).
  // Los totales de fila siempre suman valorMes (el corrido termina en el mismo total).
  const valorMes = (pid: number, m: number) =>
    metrica === 'real' ? real(pid, m) : metrica === 'ppto' ? ppto(pid, m) : real(pid, m) - ppto(pid, m)
  const valor = (pid: number, m: number) =>
    acum ? mesesTodos.filter(k => k <= m).reduce((s, k) => s + valorMes(pid, k), 0) : valorMes(pid, m)

  // Líneas visibles según la vista: partida, concepto (tipo_gasto por CC) o agrupador.
  // Misma lógica de agrupación que la vista Resumen.
  function lineasDe(rows: FilaGrid[]): Linea[] {
    if (vista === 'detalle') return rows.map(r => ({ key: `p-${r.id}`, nombre: r.nombre, orden: r.orden, ids: [r.id] }))
    const map = new Map<string, Linea>()
    rows.forEach(r => {
      let key: string, nombre: string, orden: number
      if (vista === 'concepto') {
        key = r.tipo_gasto ? `${r.id_centro_costo_fk ?? 0}-${r.tipo_gasto}` : `p-${r.id}`
        nombre = r.tipo_gasto ?? r.nombre; orden = r.orden
      } else {
        const ag = r.id_agrupador_fk ? agrupadores.find(a => a.id === r.id_agrupador_fk) : null
        key = `ag-${r.id_agrupador_fk ?? 0}`
        nombre = ag?.nombre ?? SIN_AGRUPADOR; orden = ag?.orden ?? Number.MAX_SAFE_INTEGER
      }
      const g = map.get(key)
      if (g) { g.ids.push(r.id); g.orden = Math.min(g.orden, orden) }
      else map.set(key, { key, nombre, orden, ids: [r.id] })
    })
    return Array.from(map.values()).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
  }
  const valorLinea = (l: Linea, m: number) => l.ids.reduce((s, id) => s + valor(id, m), 0)
  const totalLinea = (l: Linea) => meses.reduce((s, m) => s + l.ids.reduce((a, id) => a + valorMes(id, m), 0), 0)

  // Meses sin ningún movimiento (ni ppto ni real) en las filas mostradas
  const meses = ocultarVacios
    ? mesesTodos.filter(m => filas.some(f => ppto(f.id, m) !== 0 || real(f.id, m) !== 0))
    : mesesTodos

  const sumaFilas = (rows: FilaGrid[], m: number) => rows.reduce((s, r) => s + valor(r.id, m), 0)
  const totalFila = (rows: FilaGrid[]) => meses.reduce((s, m) => s + rows.reduce((a, r) => a + valorMes(r.id, m), 0), 0)

  // Color de una celda de variación: ingreso → más real que ppto es bueno; egreso → al revés
  const colorVar = (v: number, tipo: 'ingreso' | 'egreso') =>
    v === 0 ? '#94a3b8' : (tipo === 'ingreso' ? v > 0 : v < 0) ? '#15803d' : '#dc2626'

  const cell = (v: number, tipo: 'ingreso' | 'egreso', bold = false, color?: string): React.CSSProperties => ({
    padding: '6px 10px', ...NUM, fontWeight: bold ? 700 : 400, fontSize: 12,
    color: color ?? (metrica === 'var' ? colorVar(v, tipo) : v === 0 ? '#cbd5e1' : '#1e293b'),
  })
  const show = (v: number) => v === 0 ? '—' : (metrica === 'var' && v > 0 ? '+' : '') + (v < 0 ? '-' : '') + fmtN(Math.abs(v))

  const stickyBase: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 1 }
  const thBase: React.CSSProperties = {
    padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '.04em', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0,
  }

  function FilaTotales({ label, rows, tipo, bg, fg }: {
    label: string; rows: FilaGrid[]; tipo: 'ingreso' | 'egreso'; bg: string; fg: string
  }) {
    return (
      <tr style={{ background: bg }}>
        <td style={{ ...stickyBase, background: bg, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: fg }}>{label}</td>
        {meses.map(m => { const v = sumaFilas(rows, m); return <td key={m} style={cell(v, tipo, true, metrica === 'var' ? undefined : fg)}>{show(v)}</td> })}
        <td style={{ ...cell(totalFila(rows), tipo, true, metrica === 'var' ? undefined : fg), borderLeft: '1px solid #e2e8f0' }}>{show(totalFila(rows))}</td>
      </tr>
    )
  }

  function Bloque({ label, rows, tipo, bg, fg }: {
    label: string; rows: FilaGrid[]; tipo: 'ingreso' | 'egreso'; bg: string; fg: string
  }) {
    if (rows.length === 0) return null
    return (
      <>
        <tr><td colSpan={meses.length + 2} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
          textTransform: 'uppercase', color: fg, background: bg }}>{label}</td></tr>
        {lineasDe(rows).map(r => {
          const t = totalLinea(r)
          return (
            <tr key={r.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...stickyBase, background: '#fff', padding: '6px 12px 6px 22px', fontSize: 12, color: '#334155', minWidth: 220, maxWidth: 280,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nombre}>{r.nombre}</td>
              {meses.map(m => { const v = valorLinea(r, m); return <td key={m} style={cell(v, tipo)}>{show(v)}</td> })}
              <td style={{ ...cell(t, tipo, true), borderLeft: '1px solid #e2e8f0', background: '#f8fafc' }}>{show(t)}</td>
            </tr>
          )
        })}
        <FilaTotales label={`Total ${label.replace(/ \(.*\)/, '')}`} rows={rows} tipo={tipo} bg="#f8fafc" fg="#1e293b" />
      </>
    )
  }

  const ingAll = filas.filter(f => f.tipo === 'ingreso')
  const egrAll = filas.filter(f => f.tipo === 'egreso')

  // Flujo neto de un conjunto: ingresos − egresos con la métrica activa
  function FilaNeto({ label, ing, egr, dark }: { label: string; ing: FilaGrid[]; egr: FilaGrid[]; dark?: boolean }) {
    const neto = (m: number) => sumaFilas(ing, m) - sumaFilas(egr, m)
    const total = totalFila(ing) - totalFila(egr)
    const bg = dark ? '#1e293b' : '#eef2ff'
    const colorDe = (v: number) => dark ? (v >= 0 ? '#86efac' : '#fca5a5') : (v >= 0 ? '#15803d' : '#dc2626')
    const td = (v: number, extra?: React.CSSProperties): React.CSSProperties =>
      ({ padding: '7px 10px', ...NUM, fontWeight: 700, fontSize: 12, color: v === 0 ? (dark ? '#64748b' : '#94a3b8') : colorDe(v), ...extra })
    return (
      <tr style={{ background: bg }}>
        <td style={{ ...stickyBase, background: bg, padding: '8px 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.05em', color: dark ? '#f1f5f9' : '#3730a3' }}>{label}</td>
        {meses.map(m => <td key={m} style={td(neto(m))}>{show(neto(m))}</td>)}
        <td style={td(total, { borderLeft: '1px solid #475569' })}>{show(total)}</td>
      </tr>
    )
  }

  function exportarExcel() {
    const tag = { real: 'Real', ppto: 'Presupuesto', var: 'Variacion' }[metrica]
    const aoa: (string | number)[][] = [['Partida', ...meses.map(m => MESES[m - 1]), 'Total']]
    const bloque = (label: string, rows: FilaGrid[]) => {
      if (rows.length === 0) return
      aoa.push([label.toUpperCase()])
      lineasDe(rows).forEach(l => aoa.push([l.nombre, ...meses.map(m => valorLinea(l, m)), totalLinea(l)]))
      aoa.push([`Total ${label.replace(/ \(.*\)/, '')}`, ...meses.map(m => sumaFilas(rows, m)), totalFila(rows)])
    }
    const neto = (label: string, ing: FilaGrid[], egr: FilaGrid[]) =>
      aoa.push([label, ...meses.map(m => sumaFilas(ing, m) - sumaFilas(egr, m)), totalFila(ing) - totalFila(egr)])
    CLASIFICACIONES.forEach(clas => {
      const ing = ingAll.filter(f => (f.clasificacion ?? 'operativo') === clas)
      const egr = egrAll.filter(f => (f.clasificacion ?? 'operativo') === clas)
      if (ing.length === 0 && egr.length === 0) return
      bloque(LABELS[clas].ingresos, ing); bloque(LABELS[clas].egresos, egr)
      if (ing.length > 0 && egr.length > 0) neto(LABELS[clas].balance, ing, egr)
      aoa.push([])
    })
    if (ingAll.length > 0 && egrAll.length > 0) neto(netoLabel, ingAll, egrAll)
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 42 }, ...meses.map(() => ({ wch: 13 })), { wch: 15 }]
    ws['!freeze'] = { xSplit: 1, ySplit: 1 } as any
    // Formato numérico de miles en todas las celdas numéricas
    Object.keys(ws).forEach(k => { if (k[0] !== '!' && typeof ws[k].v === 'number') ws[k].z = '#,##0;-#,##0;"-"' })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${tag}${acum ? ' acum' : ''}`.slice(0, 31))
    XLSX.writeFile(wb, `${archivo}_${tag}${acum ? '-acumulado' : ''}_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 6, background: '#f1f5f9', borderRadius: 22, padding: '3px 4px' }}>
          {METRICAS.map(({ v, label }) => (
            <button key={v} onClick={() => setMetrica(v)}
              style={{
                padding: '4px 14px', borderRadius: 18, border: 'none', cursor: 'pointer', fontSize: 12,
                background: metrica === v ? '#fff' : 'transparent',
                color: metrica === v ? '#1e293b' : '#64748b',
                fontWeight: metrica === v ? 600 : 400,
                boxShadow: metrica === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}>{label}</button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
          <input type="checkbox" checked={ocultarVacios} onChange={e => setOcultarVacios(e.target.checked)} />
          Ocultar meses sin movimiento
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
          <input type="checkbox" checked={acum} onChange={e => setAcum(e.target.checked)} />
          Acumulado corrido
        </label>
        {metrica === 'var' && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Variación = Real − Presupuesto</span>
        )}
        <button className="btn-ghost" onClick={exportarExcel}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 10px' }}>
          <Download size={13} /> Exportar Excel
        </button>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: '70vh' }}>
        <table id="reporte-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thBase, ...stickyBase, zIndex: 3, textAlign: 'left', minWidth: 220 }}>Partida</th>
              {meses.map(m => <th key={m} style={{ ...thBase, textAlign: 'right', minWidth: 78 }}>{MESES[m - 1]}</th>)}
              <th style={{ ...thBase, textAlign: 'right', minWidth: 92, borderLeft: '1px solid #e2e8f0' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {CLASIFICACIONES.map(clas => {
              const ing = ingAll.filter(f => (f.clasificacion ?? 'operativo') === clas)
              const egr = egrAll.filter(f => (f.clasificacion ?? 'operativo') === clas)
              if (ing.length === 0 && egr.length === 0) return null
              return (
                <FragmentoClas key={clas}>
                  <Bloque label={LABELS[clas].ingresos} rows={ing} tipo="ingreso" bg="#f0fdf4" fg="#15803d" />
                  <Bloque label={LABELS[clas].egresos}  rows={egr} tipo="egreso"  bg="#fef2f2" fg="#dc2626" />
                  {ing.length > 0 && egr.length > 0 && <FilaNeto label={LABELS[clas].balance} ing={ing} egr={egr} />}
                </FragmentoClas>
              )
            })}
            {ingAll.length > 0 && egrAll.length > 0 && (
              <FilaNeto label={netoLabel} ing={ingAll} egr={egrAll} dark />
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function FragmentoClas({ children }: { children: React.ReactNode }) { return <>{children}</> }
