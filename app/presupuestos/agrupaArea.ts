/**
 * Egresos en vista Detalle: una banda por CC · Área, para que partidas con el
 * mismo nombre en áreas distintas (Sueldos, Otros, …) no parezcan duplicadas.
 * Compartido por Comparativo, Flujo, Vista Mensual y sus exportaciones.
 */
export type BandaArea<T> = { key: string; label: string; rows: T[] }

type ConArea = { id_centro_costo_fk: number | null; id_area_fk: number | null }

export function agruparPorArea<T extends ConArea>(
  rows: T[], nombreCC: (id: number) => string, nombreArea: (id: number) => string,
): BandaArea<T>[] {
  const m = new Map<string, BandaArea<T>>()
  for (const r of rows) {
    const key = `${r.id_centro_costo_fk ?? 0}|${r.id_area_fk ?? 0}`
    if (!m.has(key)) {
      const cc = r.id_centro_costo_fk != null ? nombreCC(r.id_centro_costo_fk) : null
      const ar = r.id_area_fk != null ? nombreArea(r.id_area_fk) : null
      m.set(key, { key, label: [cc, ar].filter(Boolean).join(' · ') || 'Sin centro de costo / área', rows: [] })
    }
    m.get(key)!.rows.push(r)
  }
  return Array.from(m.values()).sort((x, y) => x.label.localeCompare(y.label, 'es'))
}

/** Resolutores de nombre a partir de los catálogos ya cargados en la página. */
export function nombresDe(centros: { id: number; nombre: string }[], areas: { id: number; nombre: string }[]) {
  return {
    nombreCC:   (id: number) => centros.find(c => c.id === id)?.nombre ?? `CC ${id}`,
    nombreArea: (id: number) => areas.find(a => a.id === id)?.nombre ?? `Área ${id}`,
  }
}
