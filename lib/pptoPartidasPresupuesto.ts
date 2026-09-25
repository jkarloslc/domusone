import { dbCtrl } from '@/lib/supabase'

/**
 * Partidas que pertenecen a un presupuesto: las de su módulo MÁS las de otro
 * módulo que tienen montos capturados en ESTE presupuesto.
 *
 * Una partida vive en un solo módulo, pero hay centros de ingreso que cruzan
 * módulos: las rentas de Locales Comerciales cuelgan de partidas de Golf, Polo
 * y Mantenimiento, y el presupuesto de Locales las captura. Filtrando solo por
 * `modulo`, ese presupuesto se veía vacío en Captura, Comparativo, Flujo y
 * Dashboard aunque tenía $2.86M capturados.
 *
 * `aplicar` agrega los filtros propios de cada pantalla (incluir_presupuesto,
 * incluir_flujo, …); se aplica igual a las partidas propias y a las ajenas.
 */
export async function cargarPartidasPresupuesto<T extends { id: number }>(
  select: string,
  pptoId: number,
  modulo: string | null | undefined,
  aplicar: (q: any) => any = q => q,
): Promise<T[]> {
  const base = () => aplicar(dbCtrl.from('ppto_partidas').select(select).eq('activo', true))
  const soloModulo = !!modulo && modulo !== 'General'

  const [{ data: propias, error }, { data: det }, { data: manual }] = await Promise.all([
    soloModulo ? base().eq('modulo', modulo) : base(),
    soloModulo
      ? dbCtrl.from('ppto_presupuesto_det').select('id_partida_fk').eq('id_presupuesto_fk', pptoId)
      : Promise.resolve({ data: [] as any[] }),
    soloModulo
      ? dbCtrl.from('ppto_presupuesto_real_manual').select('id_partida_fk').eq('id_presupuesto_fk', pptoId)
      : Promise.resolve({ data: [] as any[] }),
  ])
  if (error) console.error('ppto_partidas:', error.message)

  const lista = (propias ?? []) as T[]
  const yaEstan = new Set(lista.map(p => p.id))
  const ajenas = Array.from(new Set(
    [...(det ?? []), ...(manual ?? [])].map((r: any) => r.id_partida_fk as number),
  )).filter(id => !yaEstan.has(id))

  if (ajenas.length > 0) {
    const { data, error: e2 } = await base().in('id', ajenas)
    if (e2) console.error('ppto_partidas (otros módulos):', e2.message)
    lista.push(...((data ?? []) as T[]))
  }

  return lista.sort((a: any, b: any) =>
    String(a.tipo ?? '').localeCompare(String(b.tipo ?? ''))
    || (a.orden ?? 0) - (b.orden ?? 0)
    || String(a.nombre ?? '').localeCompare(String(b.nombre ?? '')))
}
