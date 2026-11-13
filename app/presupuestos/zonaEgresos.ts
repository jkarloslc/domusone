'use client'
import { useEffect, useState } from 'react'
import { dbComp } from '@/lib/supabase'

/**
 * Zona en los egresos del Árbol (solo CC con usa_zonas, hoy Mantto. Fraccionamiento).
 *
 * El Real de una partida (área × tipo de gasto) se reparte entre zonas OP por OP,
 * con la misma regla que docEnZona: zona guardada en la línea de distribución
 * (ordenes_pago_det) o en el encabezado de la OP; si no tiene, la del área
 * (si el área está en varias zonas, nodo combinado "Zona A + Zona B";
 * sin ninguna, "Sin zona"). Lo que no viene de una OP (Real manual) usa la
 * zona del área.
 */

type ZonaCat = {
  zonas: { id: number; nombre: string }[]
  areaEnZona: (zona: number, idArea: number | null | undefined) => boolean
  ccUsaZonas: (cc: number | null | undefined) => boolean
}
type Tx = { fecha: string; monto: number; id_op_fk?: number | null }
export type ZonaFila = { id: string; nombre: string }

export function useZonaDeOps(opIds: number[]) {
  const [porOp, setPorOp] = useState<Map<number, number | null>>(new Map())
  const [porOpArea, setPorOpArea] = useState<Map<string, number | null>>(new Map())
  const firma = Array.from(new Set(opIds)).sort((a, b) => a - b).join(',')

  useEffect(() => {
    const ids = firma ? firma.split(',').map(Number) : []
    if (ids.length === 0) { setPorOp(new Map()); setPorOpArea(new Map()); return }
    let vivo = true
    ;(async () => {
      const op = new Map<number, number | null>()
      const det = new Map<string, number | null>()
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200)
        const [{ data: h }, { data: d }] = await Promise.all([
          dbComp.from('ordenes_pago').select('id, id_cuadrante_fk').in('id', lote),
          dbComp.from('ordenes_pago_det').select('id_op_fk, id_area_fk, id_cuadrante_fk').in('id_op_fk', lote),
        ])
        ;(h ?? []).forEach((r: any) => op.set(r.id, r.id_cuadrante_fk))
        ;(d ?? []).forEach((r: any) => { if (r.id_cuadrante_fk != null) det.set(`${r.id_op_fk}-${r.id_area_fk}`, r.id_cuadrante_fk) })
      }
      if (vivo) { setPorOp(op); setPorOpArea(det) }
    })()
    return () => { vivo = false }
  }, [firma])

  return { porOp, porOpArea }
}

/** Divide las filas de egreso de CC con zonas en una fila por zona (mismo id, Real parcial). */
export function filasConZona<T extends {
  id: number; tipo: 'ingreso' | 'egreso'; id_centro_costo_fk: number | null; id_area_fk: number | null
  realVal: number; pptoVal: number
}>(
  filas: T[], realDetalle: Record<number, Tx[]>, meses: number[], zonasCat: ZonaCat,
  zonaOps: { porOp: Map<number, number | null>; porOpArea: Map<string, number | null> },
): (T & { zona?: ZonaFila })[] {
  const nombreZona = (id: number) => zonasCat.zonas.find(z => z.id === id)?.nombre ?? `Zona ${id}`
  const zonaDeArea = (area: number | null): ZonaFila => {
    const zs = area != null ? zonasCat.zonas.filter(z => zonasCat.areaEnZona(z.id, area)) : []
    if (zs.length === 0) return { id: 'sin', nombre: 'Sin zona' }
    return { id: zs.map(z => z.id).join('-'), nombre: zs.map(z => z.nombre).join(' + ') }
  }
  const enMeses = new Set(meses)

  return filas.flatMap(f => {
    if (f.tipo !== 'egreso' || !zonasCat.ccUsaZonas(f.id_centro_costo_fk)) return [f]
    const partes = new Map<string, { zona: ZonaFila; monto: number }>()
    const sumar = (zona: ZonaFila, monto: number) => {
      const p = partes.get(zona.id)
      if (p) p.monto += monto; else partes.set(zona.id, { zona, monto })
    }
    let asignado = 0
    for (const t of realDetalle[f.id] ?? []) {
      if (!t.fecha || !enMeses.has(new Date(t.fecha + 'T12:00:00').getMonth() + 1)) continue
      const z = t.id_op_fk != null
        ? (zonaOps.porOpArea.get(`${t.id_op_fk}-${f.id_area_fk}`) ?? zonaOps.porOp.get(t.id_op_fk) ?? null)
        : null
      sumar(z != null ? { id: String(z), nombre: nombreZona(z) } : zonaDeArea(f.id_area_fk), Number(t.monto))
      asignado += Number(t.monto)
    }
    const resto = f.realVal - asignado
    if (Math.abs(resto) > 0.005) sumar(zonaDeArea(f.id_area_fk), resto)
    if (partes.size === 0) return [{ ...f, zona: zonaDeArea(f.id_area_fk) }]
    const lista = Array.from(partes.values()).sort((a, b) => b.monto - a.monto)
    // El presupuesto no tiene zona: va completo a la parte mayor.
    return lista.map((p, i) => ({ ...f, realVal: p.monto, pptoVal: i === 0 ? f.pptoVal : 0, zona: p.zona }))
  })
}
