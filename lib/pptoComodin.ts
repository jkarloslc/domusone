// La partida comodín de un área es la que absorbe cualquier tipo de gasto sin
// partida específica — hoy es la del tipo marcado es_comodin en
// cfg.tipos_gasto ("Otros"). Se deja el caso sin tipo (id null) como fallback
// defensivo por si algún día vuelve a crearse una partida sin tipo.
// `comodines` = ids de los tipos con es_comodin (CatalogoTipoGasto.comodines).
export function esComodin(idTipoGasto: number | null | undefined, comodines: Set<number>): boolean {
  return idTipoGasto == null || comodines.has(idTipoGasto)
}
