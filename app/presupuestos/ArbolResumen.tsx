'use client'
import { Fragment } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { RUBROS_VACIO, type CatalogoRubros } from '@/lib/rubros'
import { construirArbol, useArbolUI, ControlesArbol, type NodoArbol } from './arbolPartidas'
import { explicaDiferencia, type SaldosFila } from '@/lib/saldosFlujo'

/**
 * Vista Árbol del Resumen (Comparativo y Flujo de Efectivo).
 *
 * Reemplaza los listados planos por un reporte colapsable:
 *   Ingresos: Rubro → Centro de Ingreso → Partida
 *             (partidas por sección: Rubro → Zona → Sección)
 *   Egresos:  Rubro → Tipo de gasto     → CC · Área
 *             (CC con zonas: Rubro → Tipo de gasto → Zona → Área; ver zonaEgresos.ts)
 * El rubro viene del catálogo (lib/rubros.ts); sin rubro se usa el agrupador.
 * Abre en nivel 1 (~15-20 filas). Los hermanos que pesan menos del umbral
 * del total de su sección se juntan en "Otros menores (n)".
 * Un nivel con un solo hijo se colapsa en su padre para no repetir filas.
 */

type Clasificacion = 'operativo' | 'financiero' | 'intercompanias'

export type FilaArbol = {
  id: number; nombre: string; tipo: 'ingreso' | 'egreso'; clasificacion: Clasificacion
  fuente_real: string | null
  id_agrupador_fk: number | null; id_tipo_gasto_fk: number | null; tipo_gasto: string | null
  id_centro_ingreso_fk: number | null; id_centro_costo_fk: number | null; id_area_fk: number | null
  id_concepto_fk?: number | null
  id_seccion_fk?: number | null
  /** Solo egresos de CC con zonas: zona de esta porción del Real (filasConZona). */
  zona?: { id: string; nombre: string; prorrateo?: number }
  realVal: number; pptoVal: number
}

type Nodo<T> = Omit<NodoArbol<T>, 'hijos'> & { real: number; ppto: number; hijos: Nodo<T>[] }

const CLASIFICACIONES: Clasificacion[] = ['operativo', 'financiero', 'intercompanias']

const fmt = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })
const pct = (n: number | null) => n == null || !isFinite(n) ? '—' : `${n.toFixed(1)}%`

export default function ArbolResumen<T extends FilaArbol>({
  filas, agrupadores, rubros = RUBROS_VACIO, labels, netoLabel, nombreCC, nombreArea, nombreCentroIng,
  mesesPromedio, zonasDeSeccion, prorrateoLotes, onProrrateoLotes, saldos, canWriteManual, onDrill, onDrillOps, onManual,
}: {
  filas: T[]
  agrupadores: { id: number; nombre: string; orden: number }[]
  rubros?: CatalogoRubros
  labels: Record<Clasificacion, { ingresos: string; egresos: string; balance: string }>
  netoLabel: string
  nombreCC: (id: number) => string
  nombreArea: (id: number) => string
  nombreCentroIng: (id: number) => string
  /** >0 en Acumulado año: meses con movimiento, para la columna Prom. mensual. */
  mesesPromedio: number
  /** Zonas de una sección: las partidas de ingreso por sección se agrupan por Zona. */
  zonasDeSeccion?: (idSeccion: number) => { id: number; nombre: string }[]
  /** Selector de prorrateo del gasto general por lotes (solo si hay egresos con zona). */
  prorrateoLotes?: boolean
  onProrrateoLotes?: (v: boolean) => void
  /** Flujo de Efectivo: filas Saldo inicial (arriba) y Saldo final / real / diferencia (abajo). */
  saldos?: SaldosFila | null
  /** Muestra '+ Manual' en las partidas con Real de captura manual (Intercompañías, Comisiones, …). */
  canWriteManual?: boolean
  onDrill: (nombre: string, tipo: 'ingreso' | 'egreso', partidas: T[]) => void
  onDrillOps: (p: T) => void
  onManual: (pid: number) => void
}) {
  const ui = useArbolUI()

  const hayPpto = filas.some(f => f.pptoVal !== 0)
  const ingresosOperativos = filas
    .filter(f => f.tipo === 'ingreso' && f.clasificacion === 'operativo')
    .reduce((s, f) => s + f.realVal, 0)

  const opciones = { rubros, agrupadores, nombreCC, nombreArea, nombreCentroIng, zonasDeSeccion,
    peso: (p: T) => p.realVal, agruparMenores: ui.agruparMenores }
  // El constructor compartido da `peso` (= Real); aquí se agrega el Presupuesto del nodo.
  const conPpto = (ns: NodoArbol<T>[]): Nodo<T>[] => ns.map(n => ({
    ...n, real: n.peso, ppto: n.partidas.reduce((s, p) => s + p.pptoVal, 0), hijos: conPpto(n.hijos),
  }))
  const construir = (rows: T[], tipo: 'ingreso' | 'egreso', prefijo: string) => conPpto(construirArbol(rows, tipo, prefijo, opciones))

  const secciones = CLASIFICACIONES.map(clas => {
    const ing = filas.filter(f => f.clasificacion === clas && f.tipo === 'ingreso')
    const egr = filas.filter(f => f.clasificacion === clas && f.tipo === 'egreso')
    return { clas, ing, egr, arbIng: construir(ing, 'ingreso', `${clas}-i`), arbEgr: construir(egr, 'egreso', `${clas}-e`) }
  })

  const abierto = (n: Nodo<T>) => ui.abierto(n as unknown as NodoArbol<unknown>)
  const toggle = (n: Nodo<T>) => ui.toggle(n as unknown as NodoArbol<unknown>)

  const conPromedio = mesesPromedio > 0
  const nCols = 3 + (conPromedio ? 1 : 0) + (hayPpto ? 2 : 0) + 1

  const th: React.CSSProperties = { padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'right', whiteSpace: 'nowrap' }
  const tdNum: React.CSSProperties = { padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  function celdas(real: number, ppto: number, totalSeccion: number, tipo: 'ingreso' | 'egreso', bold: boolean, onReal?: () => void) {
    const varAbs = real - ppto
    const bueno = tipo === 'ingreso' ? varAbs >= 0 : varAbs <= 0
    return (
      <>
        <td style={{ ...tdNum, fontWeight: bold ? 700 : 600, color: '#1e293b' }}>
          {real === 0 ? <span style={{ color: '#cbd5e1' }}>—</span>
            : onReal ? <button onClick={onReal} title="Ver detalle"
                style={{ font: 'inherit', color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}>{fmt(real)}</button>
            : fmt(real)}
        </td>
        <td style={{ ...tdNum, color: '#64748b', fontSize: 12 }}>{totalSeccion ? pct(real / totalSeccion * 100) : '—'}</td>
        <td style={{ ...tdNum, color: '#64748b', fontSize: 12 }}>
          {tipo === 'egreso' && ingresosOperativos > 0 ? pct(real / ingresosOperativos * 100) : ''}
        </td>
        {conPromedio && <td style={{ ...tdNum, color: '#475569', fontSize: 12 }}>{real ? fmt(real / mesesPromedio) : '—'}</td>}
        {hayPpto && <>
          <td style={{ ...tdNum, color: '#475569' }}>{ppto ? fmt(ppto) : '—'}</td>
          <td style={{ ...tdNum, fontWeight: 600, color: varAbs === 0 ? '#94a3b8' : bueno ? '#15803d' : '#dc2626' }}>
            {varAbs === 0 ? '—' : `${varAbs > 0 ? '+' : '-'}${fmt(Math.abs(varAbs))}`}
          </td>
        </>}
      </>
    )
  }

  function filasNodo(n: Nodo<T>, tipo: 'ingreso' | 'egreso', totalSeccion: number): React.ReactNode {
    const expandible = n.hijos.length > 0
    const open = expandible && abierto(n)
    const h = n.hoja
    const onReal = h
      ? () => (h.fuente_real === 'manual' ? onManual(h.id) : onDrillOps(h))
      : () => onDrill(n.nombre, tipo, n.partidas)
    const bg = n.depth === 0 ? '#fff' : n.depth === 1 ? '#fcfcfd' : '#f8fafc'
    return (
      <Fragment key={n.key}>
        <tr style={{ borderBottom: '1px solid #f1f5f9', background: bg }}>
          <td style={{ padding: '8px 14px', paddingLeft: 14 + n.depth * 20 }}>
            <span onClick={expandible ? () => toggle(n) : undefined}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: expandible ? 'pointer' : 'default',
                fontWeight: n.depth === 0 ? 700 : n.depth === 1 ? 600 : 500,
                color: n.esMenores ? '#64748b' : '#1e293b', fontStyle: n.esMenores ? 'italic' : 'normal',
                fontSize: n.depth === 0 ? 13 : 12.5 }}>
              <span style={{ width: 14, display: 'inline-flex', color: '#94a3b8' }}>
                {expandible ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
              </span>
              {n.nombre}
              {expandible && !open && (
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>· {n.hijos.length}</span>
              )}
            </span>
          </td>
          {celdas(n.real, n.ppto, totalSeccion, tipo, n.depth === 0, onReal)}
          <td style={{ padding: '4px 10px', textAlign: 'right' }}>
            {h && h.fuente_real === 'manual' && canWriteManual && (
              <button className="btn-ghost" onClick={() => onManual(h.id)} title="Capturar Real manual"
                style={{ fontSize: 11, padding: '2px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>+ Manual</button>
            )}
          </td>
        </tr>
        {open && n.hijos.map(c => filasNodo(c, tipo, totalSeccion))}
      </Fragment>
    )
  }

  function banda(label: string, tipo: 'ingreso' | 'egreso') {
    const c = tipo === 'ingreso' ? { bg: '#f0fdf4', fg: '#15803d', bd: '#bbf7d0' } : { bg: '#fef2f2', fg: '#dc2626', bd: '#fecaca' }
    return (
      <tr className="ppto-print-band">
        <td colSpan={nCols} style={{ padding: '7px 16px', background: c.bg, fontWeight: 700, fontSize: 11, color: c.fg,
          textTransform: 'uppercase', letterSpacing: '.06em', borderTop: `2px solid ${c.bd}` }}>{label}</td>
      </tr>
    )
  }

  function total(label: string, real: number, ppto: number, totalSeccion: number, tipo: 'ingreso' | 'egreso') {
    const c = tipo === 'ingreso' ? { bg: '#dcfce7', fg: '#15803d' } : { bg: '#fee2e2', fg: '#b91c1c' }
    return (
      <tr className="ppto-print-total" style={{ background: c.bg }}>
        <td style={{ padding: '9px 14px', fontWeight: 700, color: c.fg, fontSize: 12 }}>{label}</td>
        {celdas(real, ppto, totalSeccion, tipo, true)}
        <td />
      </tr>
    )
  }

  function balance(label: string, real: number, ppto: number, oscuro: boolean) {
    const varAbs = real - ppto
    return (
      <tr className="ppto-print-total" style={{ background: oscuro ? '#1e293b' : '#f1f5f9', fontWeight: 700 }}>
        <td style={{ padding: '10px 14px', color: oscuro ? '#f1f5f9' : '#1e293b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</td>
        <td style={{ ...tdNum, color: real >= 0 ? (oscuro ? '#86efac' : '#15803d') : (oscuro ? '#fca5a5' : '#dc2626') }}>{fmt(real)}</td>
        <td />
        <td style={{ ...tdNum, fontSize: 12, color: oscuro ? '#cbd5e1' : '#64748b' }}>
          {ingresosOperativos > 0 ? `Margen ${pct(real / ingresosOperativos * 100)}` : ''}
        </td>
        {conPromedio && <td style={{ ...tdNum, fontSize: 12, color: oscuro ? '#cbd5e1' : '#475569' }}>{fmt(real / mesesPromedio)}</td>}
        {hayPpto && <>
          <td style={{ ...tdNum, color: oscuro ? '#94a3b8' : '#475569' }}>{fmt(ppto)}</td>
          <td style={{ ...tdNum, color: varAbs >= 0 ? (oscuro ? '#86efac' : '#15803d') : (oscuro ? '#fca5a5' : '#dc2626') }}>
            {varAbs === 0 ? '—' : `${varAbs > 0 ? '+' : '-'}${fmt(Math.abs(varAbs))}`}
          </td>
        </>}
        <td />
      </tr>
    )
  }


  // Filas de saldo (Flujo de Efectivo): consolidado de todas las partidas, sin filtros.
  const filaSaldo = (label: string, v: number | null, fuerte: boolean, nota?: string, colorV?: string) => (
    <tr className="ppto-print-total" style={{ background: fuerte ? '#e0f2fe' : '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
      <td style={{ padding: '9px 14px', fontWeight: 700, color: '#0c4a6e', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}{nota && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#64748b', marginLeft: 6 }}>{nota}</span>}
      </td>
      <td style={{ padding: '9px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
        color: v == null ? '#cbd5e1' : (colorV ?? (v < 0 ? '#dc2626' : '#0c4a6e')) }}>{v == null ? '—' : fmt(v)}</td>
      <td colSpan={nCols - 2} />
    </tr>
  )

  const sum = (rs: T[], k: 'realVal' | 'pptoVal') => rs.reduce((s, r) => s + r[k], 0)
  const totIng = filas.filter(f => f.tipo === 'ingreso')
  const totEgr = filas.filter(f => f.tipo === 'egreso')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <ControlesArbol ui={ui} />
        {onProrrateoLotes && filas.some(f => f.zona) && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}
            title="El gasto sin zona (operación, vigilancia, vialidades) se reparte entre las zonas según su número de lotes">
            <input type="checkbox" checked={!!prorrateoLotes} onChange={e => onProrrateoLotes(e.target.checked)} />
            Prorratear gasto general entre zonas por lotes
          </label>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table id="reporte-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ ...th, textAlign: 'left' }}>Concepto</th>
              <th style={th}>Real</th>
              <th style={th}>% del total</th>
              <th style={th} title="Egreso como % de los ingresos operativos">% s/ingresos</th>
              {conPromedio && <th style={th} title={`Real ÷ ${mesesPromedio} meses con movimiento`}>Prom. mensual</th>}
              {hayPpto && <><th style={th}>Presupuesto</th><th style={th}>Variación</th></>}
              <th style={{ ...th, width: 8 }} />
            </tr>
          </thead>
          <tbody>
            {saldos && filaSaldo('Saldo inicial', saldos.inicial, false, 'efectivo al inicio del periodo')}
            {secciones.map(({ clas, ing, egr, arbIng, arbEgr }) => {
              if (ing.length === 0 && egr.length === 0) return null
              const L = labels[clas]
              const tI = sum(ing, 'realVal'), tE = sum(egr, 'realVal')
              return (
                <Fragment key={clas}>
                  {ing.length > 0 && <>
                    {banda(L.ingresos, 'ingreso')}
                    {arbIng.map(n => filasNodo(n, 'ingreso', tI))}
                    {total(`Total ${L.ingresos}`, tI, sum(ing, 'pptoVal'), tI, 'ingreso')}
                  </>}
                  {egr.length > 0 && <>
                    {banda(L.egresos, 'egreso')}
                    {arbEgr.map(n => filasNodo(n, 'egreso', tE))}
                    {total(`Total ${L.egresos}`, tE, sum(egr, 'pptoVal'), tE, 'egreso')}
                  </>}
                  {ing.length > 0 && egr.length > 0 && balance(L.balance, tI - tE, sum(ing, 'pptoVal') - sum(egr, 'pptoVal'), false)}
                </Fragment>
              )
            })}
            {totIng.length > 0 && totEgr.length > 0 &&
              balance(netoLabel, sum(totIng, 'realVal') - sum(totEgr, 'realVal'), sum(totIng, 'pptoVal') - sum(totEgr, 'pptoVal'), true)}
            {saldos && <>
              {filaSaldo('Saldo final', saldos.final, true, 'saldo inicial + flujo neto (todas las partidas)')}
              {filaSaldo('Saldo real en banco', saldos.real, false)}
              {filaSaldo('Diferencia sin conciliar', saldos.diferencia, false, explicaDiferencia(saldos) ?? 'saldo real − saldo calculado',
                saldos.diferencia == null ? undefined : Math.abs(saldos.diferencia) < 1 ? '#15803d' : '#b45309')}
            </>}
          </tbody>
        </table>
      </div>
    </>
  )
}
