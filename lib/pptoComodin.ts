// La partida comodín de un área es la que absorbe cualquier tipo_gasto sin
// partida específica — hoy es la de tipo_gasto="Otros" (antes existía además
// un catch-all con tipo_gasto=NULL; se eliminó el 2026-08-26 y "Otros" tomó
// su rol). Se deja el caso NULL como fallback defensivo por si algún día
// vuelve a crearse una partida sin tipo_gasto sin querer.
export function esComodin(tipoGasto: string | null | undefined): boolean {
  return !tipoGasto || tipoGasto === 'Otros'
}
