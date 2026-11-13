import { dbCfg } from '@/lib/supabase'

/**
 * Rubros financieros: primer nivel del Árbol en Comparativo / Flujo.
 * Se asignan en catálogo (migración 20261112180000):
 *   Egreso  → tipo de gasto
 *   Ingreso → concepto de ingreso (override) ?? centro de ingreso (default)
 * Un rubro de ingreso no mezcla centros de ingreso.
 */
export type Rubro = { id: number; nombre: string; tipo: 'ingreso' | 'egreso'; orden: number }

export type CatalogoRubros = {
  rubros: Map<number, Rubro>
  porTipoGasto: Map<number, number>
  porConcepto: Map<number, number>
  porCentroIng: Map<number, number>
}

export const RUBROS_VACIO: CatalogoRubros = {
  rubros: new Map(), porTipoGasto: new Map(), porConcepto: new Map(), porCentroIng: new Map(),
}

export async function cargarRubros(): Promise<CatalogoRubros> {
  const [{ data: rs }, { data: tg }, { data: co }, { data: ci }] = await Promise.all([
    dbCfg.from('rubros_financieros').select('id, nombre, tipo, orden').eq('activo', true),
    dbCfg.from('tipos_gasto').select('id, id_rubro_fk').not('id_rubro_fk', 'is', null),
    dbCfg.from('conceptos_ingreso').select('id, id_rubro_fk').not('id_rubro_fk', 'is', null),
    dbCfg.from('centros_ingreso').select('id, id_rubro_fk').not('id_rubro_fk', 'is', null),
  ])
  const mapa = (rows: any[] | null) => new Map<number, number>((rows ?? []).map(r => [r.id, r.id_rubro_fk]))
  return {
    rubros: new Map((rs ?? []).map((r: any) => [r.id, r as Rubro])),
    porTipoGasto: mapa(tg), porConcepto: mapa(co), porCentroIng: mapa(ci),
  }
}

/** Rubro de una partida, o null si su catálogo no lo tiene asignado. */
export function rubroDePartida(cat: CatalogoRubros, p: {
  tipo: 'ingreso' | 'egreso'; id_tipo_gasto_fk: number | null
  id_concepto_fk?: number | null; id_centro_ingreso_fk: number | null
}): Rubro | null {
  const id = p.tipo === 'egreso'
    ? (p.id_tipo_gasto_fk != null ? cat.porTipoGasto.get(p.id_tipo_gasto_fk) : undefined)
    : ((p.id_concepto_fk != null ? cat.porConcepto.get(p.id_concepto_fk) : undefined)
       ?? (p.id_centro_ingreso_fk != null ? cat.porCentroIng.get(p.id_centro_ingreso_fk) : undefined))
  const r = id != null ? cat.rubros.get(id) : undefined
  return r && r.tipo === p.tipo ? r : null
}
