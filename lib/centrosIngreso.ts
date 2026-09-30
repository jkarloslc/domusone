import { dbCfg } from '@/lib/supabase'

export type AgrupadorIngreso = { id: number; nombre: string }

export type CentroIngresoAgr = {
  id: number
  nombre: string
  tipo?: string | null
  tipo_desglose?: string | null
  activo?: boolean | null
  id_agrupador_fk: number | null
  /** Nombre del agrupador ('' si no tiene) */
  agrupador: string
  /** "Agrupador/Centro de Ingreso" (solo el nombre si no tiene agrupador) */
  label: string
}

export const etiquetaCentro = (agrupador: string | null | undefined, nombre: string) =>
  agrupador ? `${agrupador}/${nombre}` : nombre

/**
 * Carga centros de ingreso + agrupadores. Tolera que la migración de
 * agrupadores aún no esté ejecutada (devuelve centros sin agrupador).
 * `cols` = columnas extra de centros_ingreso (además de id, nombre).
 */
export async function cargarCentrosAgrupados(
  cols = 'tipo',
  aplicar: (q: any) => any = q => q,
): Promise<{ centros: CentroIngresoAgr[]; agrupadores: AgrupadorIngreso[] }> {
  let res: any = await aplicar(dbCfg.from('centros_ingreso').select(`id, nombre, id_agrupador_fk, ${cols}`)).order('nombre')
  let conAgr = true
  if (res.error) {
    conAgr = false
    res = await aplicar(dbCfg.from('centros_ingreso').select(`id, nombre, ${cols}`)).order('nombre')
  }
  let agrupadores: AgrupadorIngreso[] = []
  if (conAgr) {
    const { data } = await dbCfg.from('agrupadores_ingreso').select('id, nombre').order('orden').order('nombre')
    agrupadores = (data ?? []) as AgrupadorIngreso[]
  }
  const agrMap = new Map(agrupadores.map(a => [a.id, a.nombre]))
  const centros = ((res.data ?? []) as any[]).map(c => {
    const agrupador = (c.id_agrupador_fk && agrMap.get(c.id_agrupador_fk)) || ''
    return { ...c, id_agrupador_fk: c.id_agrupador_fk ?? null, agrupador, label: etiquetaCentro(agrupador, c.nombre) } as CentroIngresoAgr
  })
  // Orden "Agrupador/Centro"
  centros.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { centros, agrupadores }
}

/** Agrupadores que tienen al menos un centro de la lista */
export const agrupadoresUsados = (agrupadores: AgrupadorIngreso[], centros: CentroIngresoAgr[]) =>
  agrupadores.filter(a => centros.some(c => c.id_agrupador_fk === a.id))

/** Centros visibles según el agrupador elegido ('' = todos; 'sin' = sin agrupador) */
export const centrosDeAgrupador = <T extends CentroIngresoAgr>(centros: T[], filtroAgr: string): T[] =>
  !filtroAgr ? centros
    : filtroAgr === 'sin' ? centros.filter(c => !c.id_agrupador_fk)
    : centros.filter(c => c.id_agrupador_fk === Number(filtroAgr))

/** ids de centros que pasan el filtro de agrupador + centro; null = sin filtro */
export function idsCentrosFiltro(centros: CentroIngresoAgr[], filtroAgr: string, filtroCentro: string): Set<number> | null {
  if (filtroCentro) return new Set([Number(filtroCentro)])
  if (filtroAgr) return new Set(centrosDeAgrupador(centros, filtroAgr).map(c => c.id))
  return null
}
