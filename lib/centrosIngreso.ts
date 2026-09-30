import { dbCfg } from '@/lib/supabase'

export type AgrupadorIngreso = { id: number; nombre: string; es_cuotas_fraccionamiento?: boolean }

export type CentroIngresoAgr = {
  id: number
  nombre: string
  tipo_desglose?: string | null
  activo?: boolean | null
  id_agrupador_fk: number | null
  /** Nombre del agrupador ('' si no tiene) */
  agrupador: string
  /** El agrupador del centro es el de cuotas de fraccionamiento */
  agr_cuotas: boolean
  /** "Agrupador/Centro de Ingreso" (solo el nombre si no tiene agrupador) */
  label: string
}

/**
 * Centro de cuotas de Mantto. Fraccionamiento: su agrupador tiene marcado
 * `es_cuotas_fraccionamiento`. Cobranza solo ve estos centros y el reporte de
 * Cuotas solo los considera (sustituye a centros_ingreso.tipo = 'cuotas').
 */
export const esCentroCuotas = (c: { agr_cuotas?: boolean }) => !!c.agr_cuotas

const PALETA = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#0d9488', '#db2777', '#64748b']
/** Color estable por agrupador (gris si no tiene) */
export const colorAgrupador = (id: number | null | undefined) =>
  id ? PALETA[id % (PALETA.length - 1)] : PALETA[PALETA.length - 1]

export const etiquetaCentro = (agrupador: string | null | undefined, nombre: string) =>
  agrupador ? `${agrupador}/${nombre}` : nombre

/**
 * Carga centros de ingreso + agrupadores. Tolera que la migración de
 * agrupadores aún no esté ejecutada (devuelve centros sin agrupador).
 * `cols` = columnas extra de centros_ingreso (además de id, nombre).
 */
export async function cargarCentrosAgrupados(
  cols = '',
  aplicar: (q: any) => any = q => q,
): Promise<{ centros: CentroIngresoAgr[]; agrupadores: AgrupadorIngreso[] }> {
  let res: any = await aplicar(dbCfg.from('centros_ingreso').select(['id, nombre, id_agrupador_fk', cols].filter(Boolean).join(', '))).order('nombre')
  let conAgr = true
  if (res.error) {
    conAgr = false
    res = await aplicar(dbCfg.from('centros_ingreso').select(['id, nombre', cols].filter(Boolean).join(', '))).order('nombre')
  }
  let agrupadores: AgrupadorIngreso[] = []
  if (conAgr) {
    let r: any = await dbCfg.from('agrupadores_ingreso').select('id, nombre, es_cuotas_fraccionamiento').order('orden').order('nombre')
    // Migración del flag pendiente: transitoriamente el agrupador 3 es el de cuotas
    if (r.error) {
      r = await dbCfg.from('agrupadores_ingreso').select('id, nombre').order('orden').order('nombre')
      r.data = (r.data ?? []).map((a: any) => ({ ...a, es_cuotas_fraccionamiento: a.id === 3 }))
    }
    agrupadores = (r.data ?? []) as AgrupadorIngreso[]
  }
  const agrMap = new Map(agrupadores.map(a => [a.id, a.nombre]))
  const agrCuotas = new Set(agrupadores.filter(a => a.es_cuotas_fraccionamiento).map(a => a.id))
  const centros = ((res.data ?? []) as any[]).map(c => {
    const agrupador = (c.id_agrupador_fk && agrMap.get(c.id_agrupador_fk)) || ''
    return { ...c, id_agrupador_fk: c.id_agrupador_fk ?? null, agrupador, agr_cuotas: !!c.id_agrupador_fk && agrCuotas.has(c.id_agrupador_fk), label: etiquetaCentro(agrupador, c.nombre) } as CentroIngresoAgr
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
