'use client'
import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { rubroDePartida, type CatalogoRubros } from '@/lib/rubros'

/**
 * Árbol de partidas compartido por Resumen (ArbolResumen), Mensual (GridMensual)
 * y Por unidad (MatrizUnidades):
 *   Ingresos: Rubro → Centro de Ingreso → Partida
 *             (partidas por sección: Rubro → Zona → Sección)
 *   Egresos:  Rubro → Tipo de gasto     → CC · Área
 *             (CC con zonas, solo Resumen: Rubro → Tipo de gasto → Zona → Área)
 * El rubro viene del catálogo (lib/rubros.ts); sin rubro se usa el agrupador.
 * Orden de mayor a menor por `peso`; hermanos < 1% del total de la sección van
 * a "Otros menores (n)". Un nivel con un solo hijo se funde con su padre.
 */

export type PartidaArbol = {
  id: number; nombre: string; tipo: 'ingreso' | 'egreso'
  id_agrupador_fk: number | null; id_tipo_gasto_fk: number | null; tipo_gasto: string | null
  id_centro_ingreso_fk?: number | null; id_centro_costo_fk: number | null; id_area_fk: number | null
  id_concepto_fk?: number | null
  id_seccion_fk?: number | null
  zona?: { id: string; nombre: string; prorrateo?: number }
}

export type NodoArbol<T> = {
  key: string; nombre: string; depth: number
  /** Suma de `peso` (Real) de sus partidas: ordena y decide "Otros menores". */
  peso: number
  partidas: T[]
  hijos: NodoArbol<T>[]; hoja?: T; esMenores?: boolean
}

export type OpcionesArbol<T> = {
  rubros: CatalogoRubros
  agrupadores: { id: number; nombre: string }[]
  nombreCC: (id: number) => string
  nombreArea: (id: number) => string
  nombreCentroIng: (id: number) => string
  zonasDeSeccion?: (idSeccion: number) => { id: number; nombre: string }[]
  peso: (p: T) => number
  agruparMenores: boolean
}

const SIN_AGRUPADOR = 'Sin Agrupador'
const UMBRAL = 0.01

export function etiquetaHoja<T extends PartidaArbol>(p: T, nombreCC: (id: number) => string, nombreArea: (id: number) => string) {
  if (p.tipo === 'egreso' && (p.id_centro_costo_fk != null || p.id_area_fk != null)) {
    const base = [p.id_centro_costo_fk != null ? nombreCC(p.id_centro_costo_fk) : null,
            p.id_area_fk != null ? nombreArea(p.id_area_fk) : null].filter(Boolean).join(' · ')
    return p.zona?.prorrateo != null ? `${base} — gasto general prorrateado (${(p.zona.prorrateo * 100).toFixed(1)}% por lotes)` : base
  }
  return p.nombre
}

export function construirArbol<T extends PartidaArbol>(rows: T[], tipo: 'ingreso' | 'egreso', prefijo: string, o: OpcionesArbol<T>): NodoArbol<T>[] {
  const suma = (ps: T[]) => ps.reduce((s, p) => s + o.peso(p), 0)
  const totalSeccion = suma(rows)

  const hojas = (ps: T[], depth: number, pre: string): NodoArbol<T>[] => ps.map(p => ({
    key: `${pre}|p${p.id}${p.zona?.prorrateo != null ? 'r' : ''}${p.zona ? `z${p.zona.id}` : ''}`,
    nombre: etiquetaHoja(p, o.nombreCC, o.nombreArea), depth,
    peso: o.peso(p), partidas: [p], hijos: [], hoja: p,
  }))

  const agruparPor = (ps: T[], depth: number, pre: string,
    clave: (p: T) => string, nombre: (p: T) => string,
    siguiente: (ps: T[], depth: number, pre: string) => NodoArbol<T>[]): NodoArbol<T>[] => {
    const m = new Map<string, T[]>()
    ps.forEach(p => { const k = clave(p); m.set(k, [...(m.get(k) ?? []), p]) })
    return Array.from(m.entries()).map(([k, grupo]) => {
      const key = `${pre}|${k}`
      return { key, nombre: nombre(grupo[0]), depth, peso: suma(grupo), partidas: grupo, hijos: siguiente(grupo, depth + 1, key) }
    })
  }

  const nivelZonaEgreso = (ps: T[], depth: number, pre: string): NodoArbol<T>[] => [
    ...agruparPor(ps.filter(p => p.zona), depth, pre, p => `zn${p.zona!.id}`, p => p.zona!.nombre, hojas),
    ...hojas(ps.filter(p => !p.zona), depth, pre),
  ]
  const zonasDe = (p: T) => p.id_seccion_fk != null && o.zonasDeSeccion ? o.zonasDeSeccion(p.id_seccion_fk) : null
  const nivel2 = (ps: T[], depth: number, pre: string) => tipo === 'ingreso'
    ? agruparPor(ps, depth, pre,
        p => { const z = zonasDe(p); return z ? `zn${z.map(x => x.id).join('-') || 0}` : `ci${p.id_centro_ingreso_fk ?? 0}` },
        p => {
          const z = zonasDe(p)
          if (z) return z.length ? z.map(x => x.nombre).join(' + ') : 'Sin zona'
          return p.id_centro_ingreso_fk != null ? o.nombreCentroIng(p.id_centro_ingreso_fk) : 'Sin centro de ingreso'
        },
        hojas)
    : agruparPor(ps, depth, pre,
        p => p.id_tipo_gasto_fk != null ? `tg${p.id_tipo_gasto_fk}` : `px${p.id}`,
        p => p.tipo_gasto ?? p.nombre,
        nivelZonaEgreso)

  const rubroP = (p: T) => rubroDePartida(o.rubros, { ...p, id_centro_ingreso_fk: p.id_centro_ingreso_fk ?? null })
  const raiz = agruparPor(rows, 0, prefijo,
    p => { const r = rubroP(p); return r ? `rb${r.id}` : `ag${p.id_agrupador_fk ?? 0}` },
    p => rubroP(p)?.nombre ?? o.agrupadores.find(a => a.id === p.id_agrupador_fk)?.nombre ?? SIN_AGRUPADOR,
    nivel2)

  const reprofundizar = (n: NodoArbol<T>, depth: number): NodoArbol<T> =>
    ({ ...n, depth, hijos: n.hijos.map(h => reprofundizar(h, depth + 1)) })
  const fundir = (n: NodoArbol<T>): NodoArbol<T> => {
    let hijos = n.hijos.map(fundir)
    if (hijos.length === 1) {
      const h = hijos[0]
      if (h.hoja) return { ...n, hijos: [], hoja: h.hoja }
      hijos = h.hijos.map(x => reprofundizar(x, n.depth + 1))
    }
    return { ...n, hijos }
  }
  const ordenar = (ns: NodoArbol<T>[], depth: number, pre: string): NodoArbol<T>[] => {
    const lista = ns.map(n => ({ ...n, hijos: ordenar(n.hijos, depth + 1, n.key) }))
      .sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso) || a.nombre.localeCompare(b.nombre, 'es'))
    if (!o.agruparMenores || totalSeccion === 0) return lista
    const menores = lista.filter(n => Math.abs(n.peso) < Math.abs(totalSeccion) * UMBRAL)
    if (menores.length < 2) return lista
    const mayores = lista.filter(n => !menores.includes(n))
    const partidas = menores.flatMap(n => n.partidas)
    return [...mayores, {
      key: `${pre}|menores`, nombre: `Otros menores (${menores.length})`, depth, esMenores: true,
      peso: suma(partidas), partidas, hijos: menores.map(n => reprofundizar(n, depth + 1)),
    }]
  }
  return ordenar(raiz.map(fundir), 0, prefijo)
}

/** Estado de apertura del árbol (nivel 1/2/3 + toggles por nodo). */
export function useArbolUI() {
  const [nivel, setNivel] = useState<1 | 2 | 3>(1)
  const [toggles, setToggles] = useState<Record<string, boolean>>({})
  const [agruparMenores, setAgruparMenores] = useState(true)
  const abierto = (n: NodoArbol<unknown>) => n.key in toggles ? toggles[n.key]
    : n.esMenores ? nivel === 3 : n.depth < nivel - 1
  const toggle = (n: NodoArbol<unknown>) => setToggles(t => ({ ...t, [n.key]: !abierto(n) }))
  const cambiarNivel = (v: 1 | 2 | 3) => { setNivel(v); setToggles({}) }
  return { nivel, cambiarNivel, abierto, toggle, agruparMenores, setAgruparMenores }
}

/** Nodos visibles en orden (los hijos solo si el padre está abierto). `todos` = todo abierto (Excel). */
export function aplanar<T>(ns: NodoArbol<T>[], abierto: (n: NodoArbol<T>) => boolean, todos = false): NodoArbol<T>[] {
  const out: NodoArbol<T>[] = []
  const rec = (n: NodoArbol<T>) => { out.push(n); if (n.hijos.length && (todos || abierto(n))) n.hijos.forEach(rec) }
  ns.forEach(rec)
  return out
}

export function ControlesArbol({ ui }: { ui: ReturnType<typeof useArbolUI> }) {
  return (
    <>
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Nivel de detalle</span>
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 18, padding: 3 }}>
        {([1, 2, 3] as const).map(v => (
          <button key={v} onClick={() => ui.cambiarNivel(v)}
            title={v === 1 ? 'Solo rubros' : v === 2 ? 'Rubro → Zona / Centro de ingreso / Tipo de gasto' : 'Todo abierto'}
            style={{ padding: '3px 12px', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 12,
              background: ui.nivel === v ? '#fff' : 'transparent', color: ui.nivel === v ? '#1e293b' : '#64748b',
              fontWeight: ui.nivel === v ? 600 : 400, boxShadow: ui.nivel === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}>
            {v}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
        <input type="checkbox" checked={ui.agruparMenores} onChange={e => ui.setAgruparMenores(e.target.checked)} />
        Agrupar partidas menores al 1% en “Otros menores”
      </label>
    </>
  )
}

/** Nombre del nodo con sangría y chevron. */
export function EtiquetaNodo<T>({ n, ui }: { n: NodoArbol<T>; ui: ReturnType<typeof useArbolUI> }) {
  const expandible = n.hijos.length > 0
  const open = expandible && ui.abierto(n as NodoArbol<unknown>)
  return (
    <span onClick={expandible ? () => ui.toggle(n as NodoArbol<unknown>) : undefined} title={n.nombre}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: expandible ? 'pointer' : 'default',
        paddingLeft: n.depth * 18,
        fontWeight: n.depth === 0 ? 700 : n.depth === 1 ? 600 : 500,
        color: n.esMenores ? '#64748b' : '#1e293b', fontStyle: n.esMenores ? 'italic' : 'normal',
        fontSize: n.depth === 0 ? 12.5 : 12 }}>
      <span style={{ width: 14, flexShrink: 0, display: 'inline-flex', color: '#94a3b8' }}>
        {expandible ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
      </span>
      {n.nombre}
      {expandible && !open && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>· {n.hijos.length}</span>}
    </span>
  )
}
