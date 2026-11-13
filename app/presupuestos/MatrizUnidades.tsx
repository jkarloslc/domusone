'use client'
import { Fragment } from 'react'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'
import { rubroDePartida, RUBROS_VACIO, type CatalogoRubros } from '@/lib/rubros'

/**
 * Estado de resultados por unidad de negocio (Fase 3 del Árbol).
 * Filas = rubros (ingresos y egresos por clasificación); columnas = unidad de
 * negocio (`ppto_partidas.modulo`: Golf, Hípico, Mantenimiento, Polo, Eventos,
 * Corporativo…) + Total. Al pie, resultado y margen por unidad.
 * Corporativo se muestra como unidad propia (gasto central sin prorratear).
 */

type Clasificacion = 'operativo' | 'financiero' | 'intercompanias'
export type FilaMatriz = {
  id: number; nombre: string; tipo: 'ingreso' | 'egreso'; clasificacion: Clasificacion
  modulo?: string | null
  id_agrupador_fk: number | null; id_tipo_gasto_fk: number | null
  id_concepto_fk?: number | null; id_centro_ingreso_fk: number | null
  realVal: number
}

const CLASIFICACIONES: Clasificacion[] = ['operativo', 'financiero', 'intercompanias']
const ORDEN_UNIDADES = ['Golf', 'Hípico', 'Eventos', 'Polo', "Patron's", 'Mantenimiento', 'Corporativo']
const SIN_UNIDAD = 'Sin unidad'
const nombreUnidad = (m?: string | null) => m === 'Mantenimiento' ? 'Mantto. Fraccionamiento' : (m || SIN_UNIDAD)
const fmt = (n: number) => n === 0 ? '—' : (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })

export default function MatrizUnidades<T extends FilaMatriz>({
  filas, agrupadores, rubros = RUBROS_VACIO, labels, netoLabel, archivo, onDrill,
}: {
  filas: T[]
  agrupadores: { id: number; nombre: string; orden: number }[]
  rubros?: CatalogoRubros
  labels: Record<Clasificacion, { ingresos: string; egresos: string; balance: string }>
  netoLabel: string
  archivo: string
  onDrill: (nombre: string, tipo: 'ingreso' | 'egreso', partidas: T[]) => void
}) {
  const unidades = Array.from(new Set(filas.filter(f => f.realVal !== 0).map(f => f.modulo || SIN_UNIDAD)))
    .sort((a, b) => {
      const ia = ORDEN_UNIDADES.indexOf(a), ib = ORDEN_UNIDADES.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es')
    })

  const rubroDe = (p: T) => {
    const r = rubroDePartida(rubros, p)
    if (r) return { key: `rb${r.id}`, nombre: r.nombre, orden: r.orden }
    const ag = agrupadores.find(a => a.id === p.id_agrupador_fk)
    return { key: `ag${p.id_agrupador_fk ?? 0}`, nombre: ag?.nombre ?? 'Sin rubro', orden: 900 + (ag?.orden ?? 99) }
  }

  type Linea = { key: string; nombre: string; porUnidad: Record<string, T[]>; total: number }
  const lineasDe = (rows: T[]): Linea[] => {
    const m = new Map<string, Linea>()
    rows.forEach(p => {
      const r = rubroDe(p)
      const l = m.get(r.key) ?? { key: r.key, nombre: r.nombre, porUnidad: {}, total: 0 }
      const u = p.modulo || SIN_UNIDAD
      ;(l.porUnidad[u] ??= []).push(p)
      l.total += p.realVal
      m.set(r.key, l)
    })
    return Array.from(m.values()).filter(l => l.total !== 0).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  }
  const suma = (ps: T[] | undefined) => (ps ?? []).reduce((s, p) => s + p.realVal, 0)
  const porUnidad = (rows: T[]) => Object.fromEntries(unidades.map(u => [u, rows.filter(p => (p.modulo || SIN_UNIDAD) === u)])) as Record<string, T[]>

  const secciones = CLASIFICACIONES.map(clas => {
    const ing = filas.filter(f => f.clasificacion === clas && f.tipo === 'ingreso')
    const egr = filas.filter(f => f.clasificacion === clas && f.tipo === 'egreso')
    return { clas, ing, egr, lIng: lineasDe(ing), lEgr: lineasDe(egr) }
  }).filter(s => s.lIng.length || s.lEgr.length)

  const ingOp = filas.filter(f => f.clasificacion === 'operativo' && f.tipo === 'ingreso')
  const egrOp = filas.filter(f => f.clasificacion === 'operativo' && f.tipo === 'egreso')
  const ingOpU = porUnidad(ingOp), egrOpU = porUnidad(egrOp)

  // ── Estilos ──
  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase',
    letterSpacing: '.04em', textAlign: 'right', whiteSpace: 'nowrap', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }
  const td: React.CSSProperties = { padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 12.5 }
  const tdNombre: React.CSSProperties = { padding: '7px 14px', position: 'sticky', left: 0, background: 'inherit', whiteSpace: 'nowrap' }
  const nCols = unidades.length + 2

  const celda = (ps: T[] | undefined, nombre: string, tipo: 'ingreso' | 'egreso', bold = false) => {
    const v = suma(ps)
    return (
      <td style={{ ...td, fontWeight: bold ? 700 : 500, color: v === 0 ? '#cbd5e1' : '#1e293b' }}>
        {v === 0 ? '—' : (
          <button onClick={() => onDrill(nombre, tipo, ps ?? [])} title="Ver partidas"
            style={{ font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{fmt(v)}</button>
        )}
      </td>
    )
  }

  const banda = (label: string, tipo: 'ingreso' | 'egreso') => {
    const c = tipo === 'ingreso' ? { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' } : { bg: '#fef2f2', fg: '#dc2626', bd: '#fecaca' }
    return <tr><td colSpan={nCols} style={{ padding: '7px 16px', background: c.bg, fontWeight: 700, fontSize: 11, color: c.fg,
      textTransform: 'uppercase', letterSpacing: '.06em', borderTop: `2px solid ${c.bd}` }}>{label}</td></tr>
  }

  const filaTotal = (label: string, rows: T[], tipo: 'ingreso' | 'egreso') => {
    const c = tipo === 'ingreso' ? { bg: '#dcfce7', fg: '#15803d' } : { bg: '#fee2e2', fg: '#b91c1c' }
    const pu = porUnidad(rows)
    return (
      <tr style={{ background: c.bg }}>
        <td style={{ ...tdNombre, fontWeight: 700, color: c.fg, fontSize: 12 }}>{label}</td>
        {unidades.map(u => <Fragment key={u}>{celda(pu[u], `${label} · ${nombreUnidad(u)}`, tipo, true)}</Fragment>)}
        {celda(rows, label, tipo, true)}
      </tr>
    )
  }

  const filaResultado = (label: string, ingU: Record<string, T[]>, egrU: Record<string, T[]>, ingT: T[], egrT: T[], oscuro: boolean) => {
    const val = (i?: T[], e?: T[]) => suma(i) - suma(e)
    const color = (v: number) => v >= 0 ? (oscuro ? '#86efac' : '#15803d') : (oscuro ? '#fca5a5' : '#dc2626')
    return (
      <tr style={{ background: oscuro ? '#1e293b' : '#f1f5f9', fontWeight: 700 }}>
        <td style={{ ...tdNombre, color: oscuro ? '#f1f5f9' : '#1e293b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</td>
        {unidades.map(u => { const v = val(ingU[u], egrU[u]); return <td key={u} style={{ ...td, color: color(v) }}>{fmt(v)}</td> })}
        {(() => { const v = val(ingT, egrT); return <td style={{ ...td, color: color(v) }}>{fmt(v)}</td> })()}
      </tr>
    )
  }

  const margen = (i: number, e: number) => i > 0 ? `${((i - e) / i * 100).toFixed(1)}%` : '—'

  function exportar() {
    const aoa: (string | number)[][] = [['Concepto', ...unidades.map(nombreUnidad), 'Total']]
    secciones.forEach(({ clas, ing, egr, lIng, lEgr }) => {
      const L = labels[clas]
      const fila = (n: string, pu: Record<string, T[]>, tot: number) => [n, ...unidades.map(u => Math.round(suma(pu[u]))), Math.round(tot)]
      if (lIng.length) {
        aoa.push([L.ingresos])
        lIng.forEach(l => aoa.push(fila(l.nombre, l.porUnidad, l.total)))
        aoa.push(fila(`Total ${L.ingresos}`, porUnidad(ing), suma(ing)))
      }
      if (lEgr.length) {
        aoa.push([L.egresos])
        lEgr.forEach(l => aoa.push(fila(l.nombre, l.porUnidad, l.total)))
        aoa.push(fila(`Total ${L.egresos}`, porUnidad(egr), suma(egr)))
      }
      const pi = porUnidad(ing), pe = porUnidad(egr)
      aoa.push([L.balance, ...unidades.map(u => Math.round(suma(pi[u]) - suma(pe[u]))), Math.round(suma(ing) - suma(egr))])
    })
    aoa.push(['Margen operativo', ...unidades.map(u => margen(suma(ingOpU[u]), suma(egrOpU[u]))), margen(suma(ingOp), suma(egrOp))])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Por unidad')
    XLSX.writeFile(wb, `${archivo}-por-unidad_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (unidades.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Sin movimientos en el período</div>

  const totIng = filas.filter(f => f.tipo === 'ingreso'), totEgr = filas.filter(f => f.tipo === 'egreso')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>
          Estado de resultados por unidad de negocio · Real del período · Corporativo se muestra como unidad propia (sin prorratear)
        </span>
        <button className="btn-ghost" onClick={exportar} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 10px' }}>
          <Download size={13} /> Exportar Excel
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 2 }}>Concepto</th>
              {unidades.map(u => <th key={u} style={th}>{nombreUnidad(u)}</th>)}
              <th style={{ ...th, color: '#1e293b' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {secciones.map(({ clas, ing, egr, lIng, lEgr }) => {
              const L = labels[clas]
              return (
                <Fragment key={clas}>
                  {lIng.length > 0 && <>
                    {banda(L.ingresos, 'ingreso')}
                    {lIng.map((l, i) => (
                      <tr key={l.key} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafafa' : '#fff' }}>
                        <td style={{ ...tdNombre, fontWeight: 600, color: '#1e293b' }}>{l.nombre}</td>
                        {unidades.map(u => <Fragment key={u}>{celda(l.porUnidad[u], `${l.nombre} · ${nombreUnidad(u)}`, 'ingreso')}</Fragment>)}
                        {celda(Object.values(l.porUnidad).flat(), l.nombre, 'ingreso', true)}
                      </tr>
                    ))}
                    {filaTotal(`Total ${L.ingresos}`, ing, 'ingreso')}
                  </>}
                  {lEgr.length > 0 && <>
                    {banda(L.egresos, 'egreso')}
                    {lEgr.map((l, i) => (
                      <tr key={l.key} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#fafafa' : '#fff' }}>
                        <td style={{ ...tdNombre, fontWeight: 600, color: '#1e293b' }}>{l.nombre}</td>
                        {unidades.map(u => <Fragment key={u}>{celda(l.porUnidad[u], `${l.nombre} · ${nombreUnidad(u)}`, 'egreso')}</Fragment>)}
                        {celda(Object.values(l.porUnidad).flat(), l.nombre, 'egreso', true)}
                      </tr>
                    ))}
                    {filaTotal(`Total ${L.egresos}`, egr, 'egreso')}
                  </>}
                  {filaResultado(L.balance, porUnidad(ing), porUnidad(egr), ing, egr, false)}
                  {clas === 'operativo' && (
                    <tr style={{ background: '#f8fafc' }}>
                      <td style={{ ...tdNombre, fontSize: 12, color: '#475569', fontWeight: 600 }}>Margen operativo</td>
                      {unidades.map(u => <td key={u} style={{ ...td, color: '#475569', fontWeight: 600 }}>{margen(suma(ingOpU[u]), suma(egrOpU[u]))}</td>)}
                      <td style={{ ...td, color: '#1e293b', fontWeight: 700 }}>{margen(suma(ingOp), suma(egrOp))}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filaResultado(netoLabel, porUnidad(totIng), porUnidad(totEgr), totIng, totEgr, true)}
          </tbody>
        </table>
      </div>
    </>
  )
}
