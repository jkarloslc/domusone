import { useState, useEffect, useMemo } from 'react'
import { dbCfg } from '@/lib/supabase'

// Catálogo cfg.tipos_gasto. Toda relación con él se hace por id
// (id_tipo_gasto_fk); el nombre solo se usa para mostrar. Los flujos con
// comportamiento propio se identifican por `clave` y el comodín por
// `es_comodin`, nunca por nombre.
export type TipoGasto = {
  id: number
  nombre: string
  activo: boolean
  es_articulo: boolean
  es_comodin: boolean
  clave: string | null
}

export const TIPO_GASTO_CAMPOS = 'id, nombre, activo, es_articulo, es_comodin, clave'

const ordenar = (a: TipoGasto, b: TipoGasto) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })

// Incluye inactivos: una partida u OP histórica puede apuntar a un tipo ya inactivo.
export async function cargarTiposGasto(): Promise<TipoGasto[]> {
  const { data, error } = await dbCfg.from('tipos_gasto').select(TIPO_GASTO_CAMPOS)
  if (error) console.error('cfg.tipos_gasto:', error.message)
  return ((data ?? []) as TipoGasto[]).sort(ordenar)
}

export type CatalogoTipoGasto = {
  tipos: TipoGasto[]            // todos, ordenados por nombre
  activos: TipoGasto[]          // para selects de captura
  nombre: (id: number | null | undefined) => string | null
  idPorClave: (clave: string) => number | null
  esClave: (id: number | null | undefined, clave: string) => boolean
  comodines: Set<number>
}

export function armarCatalogo(tipos: TipoGasto[]): CatalogoTipoGasto {
  const porId = new Map(tipos.map(t => [t.id, t]))
  const porClave = new Map(tipos.filter(t => t.clave).map(t => [t.clave as string, t.id]))
  return {
    tipos,
    activos: tipos.filter(t => t.activo),
    nombre: id => (id == null ? null : porId.get(id)?.nombre ?? null),
    idPorClave: clave => porClave.get(clave) ?? null,
    esClave: (id, clave) => id != null && porClave.get(clave) === id,
    comodines: new Set(tipos.filter(t => t.es_comodin).map(t => t.id)),
  }
}

export function useCatalogoTiposGasto(): CatalogoTipoGasto {
  const [tipos, setTipos] = useState<TipoGasto[]>([])
  useEffect(() => { cargarTiposGasto().then(setTipos) }, [])
  return useMemo(() => armarCatalogo(tipos), [tipos])
}
