import { dbComp } from '@/lib/supabase'

// OP con OC vinculada llegan con tipo_gasto = null en el encabezado por diseño
// (ver app/compras/ordenes-pago/page.tsx, el campo Tipo de Gasto solo se
// captura en el flujo "sin OC"). Esta función deriva, para cada una, cómo se
// reparte su monto entre las categorías de los artículos realmente comprados
// (comp.articulos.categoria vía comp.ordenes_compra_det), para que Real en
// Presupuestos/Flujo pueda atribuirlas a algo más útil que el catch-all
// "Otros Gastos [Área]".
//
// Devuelve FRACCIONES (0–1) que suman 1 por OP, no montos — el llamador
// decide contra qué monto aplicarlas (el total de la OP en
// Comparativo/Dashboard, o el de cada abono en Flujo). Al ser proporciones,
// el resultado es inmune a que la suma de líneas de la OC no cuadre
// exactamente con el monto de la OP (descuentos, ajustes de cabecera).
//
// Líneas sin id_articulo_fk o cuyo artículo no tiene categoría quedan en un
// bucket categoria=null — exactamente el valor que ya hace que una fila
// caiga en el catch-all del área, así que el remanente no clasificable
// sigue cayendo ahí, igual que hoy.
export async function resolverCategoriasPorOp(
  candidatos: { id: number; id_oc_fk: number | null }[]
): Promise<Map<number, { categoria: string | null; fraction: number }[]>> {
  const resultado = new Map<number, { categoria: string | null; fraction: number }[]>()
  if (candidatos.length === 0) return resultado

  const opIds = candidatos.map(c => c.id)

  // 1) Resolver OC(s) por OP: junction ordenes_pago_oc (multi-OC, con el
  //    monto ya asignado a cada una) + fallback al FK directo del
  //    encabezado para OP legado sin fila en la tabla puente.
  const { data: junction } = await (dbComp.from('ordenes_pago_oc') as any)
    .select('id_op_fk, id_oc_fk, monto')
    .in('id_op_fk', opIds)

  const ocsPorOp = new Map<number, { id_oc_fk: number; peso: number }[]>()
  ;(junction ?? []).forEach((j: any) => {
    if (!ocsPorOp.has(j.id_op_fk)) ocsPorOp.set(j.id_op_fk, [])
    ocsPorOp.get(j.id_op_fk)!.push({ id_oc_fk: j.id_oc_fk, peso: Number(j.monto) || 0 })
  })
  candidatos.forEach(c => {
    if (!ocsPorOp.has(c.id) && c.id_oc_fk != null) {
      ocsPorOp.set(c.id, [{ id_oc_fk: c.id_oc_fk, peso: 1 }])
    }
  })

  const ocIds = Array.from(new Set(Array.from(ocsPorOp.values()).flat().map(o => o.id_oc_fk)))
  if (ocIds.length === 0) return resultado

  // 2) Líneas de cada OC con la categoría de su artículo (sin !inner, para
  //    no perder líneas con id_articulo_fk null).
  const { data: detLines } = await (dbComp.from('ordenes_compra_det') as any)
    .select('id_oc_fk, cantidad, precio_unitario, tasa_iva, articulos(categoria)')
    .in('id_oc_fk', ocIds)

  // 3) Por OC: total de cada categoría (bucket null para líneas sin
  //    artículo/categoría) y total general de la OC.
  const categoriasPorOC = new Map<number, Map<string | null, number>>()
  ;(detLines ?? []).forEach((d: any) => {
    const total = (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0) * (1 + (Number(d.tasa_iva) || 0))
    const categoria: string | null = d.articulos?.categoria ?? null
    if (!categoriasPorOC.has(d.id_oc_fk)) categoriasPorOC.set(d.id_oc_fk, new Map())
    const m = categoriasPorOC.get(d.id_oc_fk)!
    m.set(categoria, (m.get(categoria) ?? 0) + total)
  })

  // 4) Por OP: ponderar cada OC por su peso (monto de la fila puente, o 1
  //    en el fallback de OC única) y acumular por categoría; una OC sin
  //    líneas capturadas aporta su peso completo al bucket null.
  candidatos.forEach(c => {
    const ocs = ocsPorOp.get(c.id)
    if (!ocs || ocs.length === 0) return

    const acumulado = new Map<string | null, number>()
    ocs.forEach(({ id_oc_fk, peso }) => {
      const cats = categoriasPorOC.get(id_oc_fk)
      const totalOC = cats ? Array.from(cats.values()).reduce((a, v) => a + v, 0) : 0
      if (!cats || totalOC <= 0) {
        acumulado.set(null, (acumulado.get(null) ?? 0) + peso)
        return
      }
      cats.forEach((montoCat, categoria) => {
        acumulado.set(categoria, (acumulado.get(categoria) ?? 0) + peso * (montoCat / totalOC))
      })
    })

    const totalAcumulado = Array.from(acumulado.values()).reduce((a, v) => a + v, 0)
    if (totalAcumulado <= 0) return

    resultado.set(c.id, Array.from(acumulado.entries()).map(([categoria, v]) => ({
      categoria,
      fraction: v / totalAcumulado,
    })))
  })

  return resultado
}
