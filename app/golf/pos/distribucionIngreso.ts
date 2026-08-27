import { dbGolf, dbCtrl, dbCfg } from '@/lib/supabase'

// Distribuye el monto de un recibo de ingreso (generado desde un corte POS)
// por concepto (cfg.conceptos_ingreso), agrupando ctrl_ventas_det por el
// concepto mapeado en cat_productos_pos.id_concepto_ingreso_fk.
// Solo aplica si el centro de ingreso destino usa tipo_desglose = 'conceptos'
// — de lo contrario ctrl.recibos_ingreso_conceptos se queda sin filas y el
// ingreso "no se distribuye" en el módulo de Ingresos.
export async function distribuirConceptosRecibo(idRecibo: number, idCentroIngreso: number, ventaIds: number[]) {
  if (ventaIds.length === 0) return

  const { data: centro } = await dbCfg.from('centros_ingreso')
    .select('tipo_desglose').eq('id', idCentroIngreso).maybeSingle()
  if ((centro as any)?.tipo_desglose !== 'conceptos') return

  // Segunda capa de defensa: aunque el llamador ya debería filtrar a solo ventas
  // PAGADA, se vuelve a verificar aquí contra ctrl_ventas.status — una venta
  // cancelada nunca debe sumar a recibos_ingreso_conceptos (bug real detectado
  // 2026-08-26: dos recibos con conceptos inflados por ventas ya canceladas).
  const { data: det } = await dbGolf.from('ctrl_ventas_det')
    .select('id_producto_fk, id_concepto_ingreso_fk, total, ctrl_ventas!inner(status)')
    .in('id_venta_fk', ventaIds)
    .eq('ctrl_ventas.status', 'PAGADA')
  const detRows = (det ?? []) as { id_producto_fk: number | null; id_concepto_ingreso_fk: number | null; total: number }[]
  if (detRows.length === 0) return

  const productoIds = Array.from(new Set(detRows.map(d => d.id_producto_fk).filter((v): v is number => v != null)))
  const { data: productos } = productoIds.length
    ? await dbGolf.from('cat_productos_pos').select('id, id_concepto_ingreso_fk').in('id', productoIds)
    : { data: [] as any[] }
  const prodConcepto: Record<number, number | null> =
    Object.fromEntries((productos ?? []).map((p: any) => [p.id, p.id_concepto_ingreso_fk]))

  const { data: conceptos } = await dbCfg.from('conceptos_ingreso')
    .select('id, nombre').eq('id_centro_ingreso_fk', idCentroIngreso).eq('activo', true)
  const conceptoNombre: Record<number, string> =
    Object.fromEntries((conceptos ?? []).map((c: any) => [c.id, c.nombre]))
  const idConceptoOtros: number | null =
    (conceptos ?? []).find((c: any) => c.nombre.trim().toLowerCase() === 'otros')?.id ?? null

  const sumas: Record<number, number> = {}
  for (const d of detRows) {
    // Prioridad: concepto capturado directo en la línea (cuotas/rentas sin producto POS,
    // ver cat_cuotas_config / cfg_hip) > mapeo por producto > "Otros".
    const idConcepto = d.id_concepto_ingreso_fk
      ?? (d.id_producto_fk != null ? prodConcepto[d.id_producto_fk] : null)
      ?? idConceptoOtros
    // Sin concepto mapeado y sin "Otros" configurado para este centro: se omite
    // (el faltante queda visible como diferencia entre monto_total y la suma de conceptos).
    if (idConcepto == null) continue
    sumas[idConcepto] = (sumas[idConcepto] ?? 0) + (d.total ?? 0)
  }

  const rows = Object.entries(sumas)
    .filter(([, monto]) => monto !== 0)
    .map(([idConcepto, monto]) => ({
      id_recibo_fk:    idRecibo,
      id_concepto_fk:  Number(idConcepto),
      nombre_concepto: conceptoNombre[Number(idConcepto)] ?? 'Otros',
      monto:           Math.round(monto * 100) / 100,
    }))

  if (rows.length > 0) {
    await dbCtrl.from('recibos_ingreso_conceptos').insert(rows)
  }
}
