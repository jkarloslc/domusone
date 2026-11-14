'use client'
import { Fragment } from 'react'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'
import { RUBROS_VACIO, type CatalogoRubros } from '@/lib/rubros'
import { construirArbol, aplanar, useArbolUI, ControlesArbol, EtiquetaNodo, type NodoArbol, type PartidaArbol } from './arbolPartidas'
import { explicaDiferencia, type SaldosFila } from '@/lib/saldosFlujo'

/**
 * Estado de resultados por unidad de negocio (Fase 3 del Árbol).
 * Filas = árbol de partidas (arbolPartidas.tsx: Rubro → Centro de ingreso /
 * Tipo de gasto → Partida / CC · Área); columnas = unidad de
 * negocio (`ppto_partidas.modulo`: Golf, Hípico, Mantenimiento, Polo, Eventos,
 * Corporativo…) + Total. Al pie, resultado y margen por unidad.
 * Corporativo se muestra como unidad propia (gasto central sin prorratear).
 */

type Clasificacion = 'operativo' | 'financiero' | 'intercompanias'
export type FilaMatriz = PartidaArbol & {
  clasificacion: Clasificacion
  modulo?: string | null
  id_centro_ingreso_fk: number | null
  realVal: number
}

const CLASIFICACIONES: Clasificacion[] = ['operativo', 'financiero', 'intercompanias']
const ORDEN_UNIDADES = ['Golf', 'Hípico', 'Eventos', 'Polo', "Patron's", 'Mantenimiento', 'Corporativo']
const SIN_UNIDAD = 'Sin unidad'
const nombreUnidad = (m?: string | null) => m === 'Mantenimiento' ? 'Mantto. Fraccionamiento' : (m || SIN_UNIDAD)
const fmt = (n: number) => n === 0 ? '—' : (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })

export default function MatrizUnidades<T extends FilaMatriz>({
  filas, agrupadores, rubros = RUBROS_VACIO, labels, netoLabel, archivo, onDrill, saldos,
  nombreCC, nombreArea, nombreCentroIng, zonasDeSeccion,
}: {
  nombreCC: (id: number) => string
  nombreArea: (id: number) => string
  nombreCentroIng: (id: number) => string
  zonasDeSeccion?: (idSeccion: number) => { id: number; nombre: string }[]
  filas: T[]
  agrupadores: { id: number; nombre: string; orden: number }[]
  rubros?: CatalogoRubros
  labels: Record<Clasificacion, { ingresos: string; egresos: string; balance: string }>
  netoLabel: string
  archivo: string
  onDrill: (nombre: string, tipo: 'ingreso' | 'egreso', partidas: T[]) => void
  /** Flujo de Efectivo: saldos consolidados (solo en la columna Total). */
  saldos?: SaldosFila | null
}) {
  const unidades = Array.from(new Set(filas.filter(f => f.realVal !== 0).map(f => f.modulo || SIN_UNIDAD)))
    .sort((a, b) => {
      const ia = ORDEN_UNIDADES.indexOf(a), ib = ORDEN_UNIDADES.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es')
    })

  const ui = useArbolUI()
  type Linea = { key: string; nombre: string; porUnidad: Record<string, T[]>; total: number; nodo: NodoArbol<T> }
  const lineasDe = (rows: T[], tipo: 'ingreso' | 'egreso', prefijo: string, todos = false): Linea[] => {
    const arbol = construirArbol(rows.filter(p => p.realVal !== 0), tipo, prefijo, {
      rubros, agrupadores, nombreCC, nombreArea, nombreCentroIng, zonasDeSeccion,
      peso: p => p.realVal, agruparMenores: ui.agruparMenores,
    })
    return aplanar(arbol, n => ui.abierto(n as NodoArbol<unknown>), todos).map(n => {
      const porU: Record<string, T[]> = {}
      n.partidas.forEach(p => { (porU[p.modulo || SIN_UNIDAD] ??= []).push(p) })
      return { key: n.key, nombre: n.nombre, porUnidad: porU, total: n.peso, nodo: n }
    })
  }
  const suma = (ps: T[] | undefined) => (ps ?? []).reduce((s, p) => s + p.realVal, 0)
  const porUnidad = (rows: T[]) => Object.fromEntries(unidades.map(u => [u, rows.filter(p => (p.modulo || SIN_UNIDAD) === u)])) as Record<string, T[]>

  const secciones = CLASIFICACIONES.map(clas => {
    const ing = filas.filter(f => f.clasificacion === clas && f.tipo === 'ingreso')
    const egr = filas.filter(f => f.clasificacion === clas && f.tipo === 'egreso')
    return { clas, ing, egr, lIng: lineasDe(ing, 'ingreso', `${clas}-i`), lEgr: lineasDe(egr, 'egreso', `${clas}-e`),
      xIng: lineasDe(ing, 'ingreso', `${clas}-i`, true), xEgr: lineasDe(egr, 'egreso', `${clas}-e`, true) }
  }).filter(s => s.lIng.length || s.lEgr.length)

  const ingOp = filas.filter(f => f.clasificacion === 'operativo' && f.tipo === 'ingreso')
  const egrOp = filas.filter(f => f.clasificacion === 'operativo' && f.tipo === 'egreso')
  const ingOpU = porUnidad(ingOp), egrOpU = porUnidad(egrOp)

  // ── Estilos ──
  // Encabezado fijo arriba y columna Concepto fija a la izquierda: la tabla se
  // desplaza dentro de su propio contenedor (maxHeight), como la vista Mensual.
  const th: React.CSSProperties = { padding: '9px 12px', fontSize: 11, fontWeight: 700, color: '#62666E', textTransform: 'uppercase',
    letterSpacing: '.04em', textAlign: 'right', whiteSpace: 'nowrap', background: '#F8F9FA', borderBottom: '1px solid #E6E8EB',
    position: 'sticky', top: 0, zIndex: 2 }
  const td: React.CSSProperties = { padding: '7px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: 12.5, borderBottom: '1px solid #F4F5F7' }
  const tdNombre: React.CSSProperties = { padding: '7px 14px', position: 'sticky', left: 0, zIndex: 1, background: '#fff', whiteSpace: 'nowrap',
    minWidth: 260, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', borderRight: '1px solid #F4F5F7' }
  const nCols = unidades.length + 2

  const celda = (ps: T[] | undefined, nombre: string, tipo: 'ingreso' | 'egreso', bold = false) => {
    const v = suma(ps)
    return (
      <td style={{ ...td, fontWeight: bold ? 700 : 500, color: v === 0 ? '#C9CCD3' : '#26282D' }}>
        {v === 0 ? '—' : (
          <button onClick={() => onDrill(nombre, tipo, ps ?? [])} title="Ver partidas"
            style={{ font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{fmt(v)}</button>
        )}
      </td>
    )
  }

  const banda = (label: string, tipo: 'ingreso' | 'egreso') => {
    const c = tipo === 'ingreso' ? { bg: '#F4F5F7', fg: '#1F7A50', bd: '#E6E8EB' } : { bg: '#F4F5F7', fg: '#C23B3B', bd: '#E6E8EB' }
    return <tr><td colSpan={nCols} style={{ padding: '7px 16px', background: c.bg, fontWeight: 700, fontSize: 11, color: c.fg,
      textTransform: 'uppercase', letterSpacing: '.06em', borderTop: `2px solid ${c.bd}` }}>
      <span style={{ position: 'sticky', left: 16 }}>{label}</span></td></tr>
  }

  const filaTotal = (label: string, rows: T[], tipo: 'ingreso' | 'egreso') => {
    const c = tipo === 'ingreso' ? { bg: '#E6E8EB', fg: '#1F7A50' } : { bg: '#E6E8EB', fg: '#A83232' }
    const pu = porUnidad(rows)
    return (
      <tr style={{ background: c.bg }}>
        <td style={{ ...tdNombre, background: c.bg, fontWeight: 700, color: c.fg, fontSize: 12 }}>{label}</td>
        {unidades.map(u => <Fragment key={u}>{celda(pu[u], `${label} · ${nombreUnidad(u)}`, tipo, true)}</Fragment>)}
        {celda(rows, label, tipo, true)}
      </tr>
    )
  }

  const filaResultado = (label: string, ingU: Record<string, T[]>, egrU: Record<string, T[]>, ingT: T[], egrT: T[], oscuro: boolean) => {
    const val = (i?: T[], e?: T[]) => suma(i) - suma(e)
    const color = (v: number) => v >= 0 ? (oscuro ? '#7CC9A3' : '#1F7A50') : (oscuro ? '#EBB5B5' : '#C23B3B')
    return (
      <tr style={{ background: oscuro ? '#26282D' : '#F4F5F7', fontWeight: 700 }}>
        <td style={{ ...tdNombre, background: oscuro ? '#26282D' : '#F4F5F7', color: oscuro ? '#F4F5F7' : '#26282D', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</td>
        {unidades.map(u => { const v = val(ingU[u], egrU[u]); return <td key={u} style={{ ...td, color: color(v) }}>{fmt(v)}</td> })}
        {(() => { const v = val(ingT, egrT); return <td style={{ ...td, color: color(v) }}>{fmt(v)}</td> })()}
      </tr>
    )
  }

  const filaSaldo = (label: string, v: number | null, fuerte: boolean, colorV?: string) => (
    <tr style={{ background: fuerte ? '#E6E8EB' : '#F8F9FA', borderTop: '1px solid #E6E8EB' }}>
      <td style={{ ...tdNombre, background: fuerte ? '#E6E8EB' : '#F8F9FA', fontWeight: 700, color: '#1F4E66', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</td>
      {unidades.map(u => <td key={u} style={{ ...td, color: '#C9CCD3' }} />)}
      <td style={{ ...td, fontWeight: 700, color: v == null ? '#C9CCD3' : (colorV ?? (v < 0 ? '#C23B3B' : '#1F4E66')) }}>{v == null ? '—' : fmt(v)}</td>
    </tr>
  )

  const margen = (i: number, e: number) => i > 0 ? `${((i - e) / i * 100).toFixed(1)}%` : '—'

  const totIng = filas.filter(f => f.tipo === 'ingreso'), totEgr = filas.filter(f => f.tipo === 'egreso')

  function exportar() {
    const aoa: (string | number | null)[][] = [['Concepto', ...unidades.map(nombreUnidad), 'Total']]
    const filaSaldoX = (label: string, v: number | null) => aoa.push([label, ...unidades.map(() => null), v == null ? null : Math.round(v)])
    if (saldos) { filaSaldoX('SALDO INICIAL', saldos.inicial); aoa.push([]) }
    secciones.forEach(({ clas, ing, egr, xIng: lIng, xEgr: lEgr }) => {
      const L = labels[clas]
      const fila = (n: string, pu: Record<string, T[]>, tot: number) => [n, ...unidades.map(u => Math.round(suma(pu[u]))), Math.round(tot)]
      if (lIng.length) {
        aoa.push([L.ingresos])
        lIng.forEach(l => aoa.push(fila('    '.repeat(l.nodo.depth) + l.nombre, l.porUnidad, l.total)))
        aoa.push(fila(`Total ${L.ingresos}`, porUnidad(ing), suma(ing)))
      }
      if (lEgr.length) {
        aoa.push([L.egresos])
        lEgr.forEach(l => aoa.push(fila('    '.repeat(l.nodo.depth) + l.nombre, l.porUnidad, l.total)))
        aoa.push(fila(`Total ${L.egresos}`, porUnidad(egr), suma(egr)))
      }
      const pi = porUnidad(ing), pe = porUnidad(egr)
      aoa.push([L.balance, ...unidades.map(u => Math.round(suma(pi[u]) - suma(pe[u]))), Math.round(suma(ing) - suma(egr))])
    })
    aoa.push(['Margen operativo', ...unidades.map(u => margen(suma(ingOpU[u]), suma(egrOpU[u]))), margen(suma(ingOp), suma(egrOp))])
    aoa.push([netoLabel, ...unidades.map(u => Math.round(suma(porUnidad(totIng)[u]) - suma(porUnidad(totEgr)[u]))), Math.round(suma(totIng) - suma(totEgr))])
    if (saldos) {
      aoa.push([])
      filaSaldoX('SALDO FINAL', saldos.final)
      filaSaldoX('SALDO REAL EN BANCO', saldos.real)
      filaSaldoX('DIFERENCIA SIN CONCILIAR (saldo real − saldo calculado)', saldos.diferencia)
      { const t = explicaDiferencia(saldos); if (t) aoa.push([t]) }
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Por unidad')
    XLSX.writeFile(wb, `${archivo}-por-unidad_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (unidades.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: '#7A7E87' }}>Sin movimientos en el período</div>


  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #E6E8EB', flexWrap: 'wrap' }}>
        <ControlesArbol ui={ui} />
        <span style={{ fontSize: 12, color: '#62666E' }}>
          Estado de resultados por unidad de negocio · Real del período · Corporativo se muestra como unidad propia (sin prorratear)
        </span>
        <button className="btn-ghost" onClick={exportar} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 10px' }}>
          <Download size={13} /> Exportar Excel
        </button>
      </div>
      <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
        <table id="reporte-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 3, minWidth: 260 }}>Concepto</th>
              {unidades.map(u => <th key={u} style={th}>{nombreUnidad(u)}</th>)}
              <th style={{ ...th, color: '#26282D' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {saldos && filaSaldo('Saldo inicial', saldos.inicial, false)}
            {secciones.map(({ clas, ing, egr, lIng, lEgr }) => {
              const L = labels[clas]
              return (
                <Fragment key={clas}>
                  {lIng.length > 0 && <>
                    {banda(L.ingresos, 'ingreso')}
                    {lIng.map(l => {
                      const d = l.nodo.depth, bg = d === 0 ? '#fff' : '#F8F9FA'
                      return (
                        <tr key={l.key} style={{ background: bg }}>
                          <td style={{ ...tdNombre, background: bg, borderBottom: '1px solid #F4F5F7' }}><EtiquetaNodo n={l.nodo} ui={ui} /></td>
                          {unidades.map(u => <Fragment key={u}>{celda(l.porUnidad[u], `${l.nombre} · ${nombreUnidad(u)}`, 'ingreso', d === 0)}</Fragment>)}
                          {celda(l.nodo.partidas, l.nombre, 'ingreso', true)}
                        </tr>
                      )
                    })}
                    {filaTotal(`Total ${L.ingresos}`, ing, 'ingreso')}
                  </>}
                  {lEgr.length > 0 && <>
                    {banda(L.egresos, 'egreso')}
                    {lEgr.map(l => {
                      const d = l.nodo.depth, bg = d === 0 ? '#fff' : '#F8F9FA'
                      return (
                        <tr key={l.key} style={{ background: bg }}>
                          <td style={{ ...tdNombre, background: bg, borderBottom: '1px solid #F4F5F7' }}><EtiquetaNodo n={l.nodo} ui={ui} /></td>
                          {unidades.map(u => <Fragment key={u}>{celda(l.porUnidad[u], `${l.nombre} · ${nombreUnidad(u)}`, 'egreso', d === 0)}</Fragment>)}
                          {celda(l.nodo.partidas, l.nombre, 'egreso', true)}
                        </tr>
                      )
                    })}
                    {filaTotal(`Total ${L.egresos}`, egr, 'egreso')}
                  </>}
                  {filaResultado(L.balance, porUnidad(ing), porUnidad(egr), ing, egr, false)}
                  {clas === 'operativo' && (
                    <tr style={{ background: '#F8F9FA' }}>
                      <td style={{ ...tdNombre, background: '#F8F9FA', fontSize: 12, color: '#4A4D54', fontWeight: 600 }}>Margen operativo</td>
                      {unidades.map(u => <td key={u} style={{ ...td, color: '#4A4D54', fontWeight: 600 }}>{margen(suma(ingOpU[u]), suma(egrOpU[u]))}</td>)}
                      <td style={{ ...td, color: '#26282D', fontWeight: 700 }}>{margen(suma(ingOp), suma(egrOp))}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filaResultado(netoLabel, porUnidad(totIng), porUnidad(totEgr), totIng, totEgr, true)}
            {saldos && <>
              {filaSaldo('Saldo final', saldos.final, true)}
              {filaSaldo('Saldo real en banco', saldos.real, false)}
              {filaSaldo(`Diferencia sin conciliar${explicaDiferencia(saldos) ? ' · ' + explicaDiferencia(saldos) : ''}`, saldos.diferencia, false,
                saldos.diferencia == null ? undefined : Math.abs(saldos.diferencia) < 1 ? '#1F7A50' : '#96600F')}
            </>}
          </tbody>
        </table>
      </div>
    </>
  )
}
