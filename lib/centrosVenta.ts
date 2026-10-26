import { dbCfg, dbGolf } from '@/lib/supabase'
import { AgrupadorIngreso, CentroIngresoAgr, etiquetaCentro } from '@/lib/centrosIngreso'

// Mismo contrato que los centros de ingreso, para reutilizar FiltroAgrupadorCentro
// y los helpers (idsCentrosFiltro, centrosDeAgrupador, colorAgrupador).
export type AgrupadorVenta = AgrupadorIngreso
export type CentroVentaAgr = CentroIngresoAgr

/**
 * Carga centros de venta POS + agrupadores. Tolera que la migración de
 * agrupadores aún no esté ejecutada (devuelve centros sin agrupador).
 */
export async function cargarCentrosVentaAgrupados(): Promise<{ centros: CentroVentaAgr[]; agrupadores: AgrupadorVenta[] }> {
  let res: any = await dbGolf.from('cat_centros_venta').select('id, nombre, activo, id_agrupador_fk').order('orden')
  let conAgr = true
  if (res.error) {
    conAgr = false
    res = await dbGolf.from('cat_centros_venta').select('id, nombre, activo').order('orden')
  }
  let agrupadores: AgrupadorVenta[] = []
  if (conAgr) {
    const r: any = await dbCfg.from('agrupadores_venta').select('id, nombre').order('orden').order('nombre')
    agrupadores = (r.data ?? []) as AgrupadorVenta[]
  }
  const agrMap = new Map(agrupadores.map(a => [a.id, a.nombre]))
  const centros = ((res.data ?? []) as any[]).map(c => {
    const agrupador = (c.id_agrupador_fk && agrMap.get(c.id_agrupador_fk)) || ''
    return { ...c, id_agrupador_fk: c.id_agrupador_fk ?? null, agrupador, agr_cuotas: false, label: etiquetaCentro(agrupador, c.nombre) } as CentroVentaAgr
  })
  centros.sort((a, b) => a.label.localeCompare(b.label, 'es'))
  return { centros, agrupadores }
}
