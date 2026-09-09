import { dbComp } from '@/lib/supabase'

// Al pagar por completo una OP, cierra la(s) OC vinculada(s) (vía ordenes_pago_oc
// y/o el FK directo legado en la propia OP) y, en cascada, su requisición origen.
// Guarda el status previo en status_previo_cierre para poder reabrirlas con
// precisión si el pago se reversa (ver reabrirOCsDeOP).
export async function cerrarOCsDeOP(idOp: number, idOcDirecta: number | null) {
  const { data: link } = await dbComp.from('ordenes_pago_oc').select('id_oc_fk').eq('id_op_fk', idOp)
  const ocIds = Array.from(new Set([...(link ?? []).map((r: any) => r.id_oc_fk), ...(idOcDirecta ? [idOcDirecta] : [])]))
  if (ocIds.length === 0) return

  const { data: ocsRows } = await dbComp.from('ordenes_compra').select('id, status, id_requisicion_fk').in('id', ocIds)
  const aCerrar = (ocsRows ?? []).filter((o: any) => o.status !== 'Cerrada' && o.status !== 'Cancelada')
  if (aCerrar.length === 0) return

  await Promise.all(aCerrar.map((o: any) =>
    dbComp.from('ordenes_compra').update({ status: 'Cerrada', status_previo_cierre: o.status }).eq('id', o.id)
  ))

  const reqIds = Array.from(new Set(aCerrar.map((o: any) => o.id_requisicion_fk).filter(Boolean)))
  if (reqIds.length > 0) {
    const { data: reqRows } = await dbComp.from('requisiciones').select('id, status').in('id', reqIds).neq('status', 'Completada')
    await Promise.all((reqRows ?? []).map((r: any) =>
      dbComp.from('requisiciones').update({ status: 'Completada', status_previo_cierre: r.status }).eq('id', r.id)
    ))
  }
}

// ¿Sigue alguna otra OP "Pagada" (además de excludeOpId) referenciando esta OC,
// por join o por FK directo? Si sí, no hay que reabrirla — el pago de esa otra
// OP la sigue justificando (caso de OC pagada en varias OPs parciales).
async function otraOPPagadaReferenciaOC(ocId: number, excludeOpId: number): Promise<boolean> {
  const [{ data: viaJoin }, { data: viaDirecta }] = await Promise.all([
    dbComp.from('ordenes_pago_oc').select('id_op_fk').eq('id_oc_fk', ocId),
    dbComp.from('ordenes_pago').select('id').eq('id_oc_fk', ocId),
  ])
  const ids = Array.from(new Set([
    ...(viaJoin ?? []).map((r: any) => r.id_op_fk),
    ...(viaDirecta ?? []).map((r: any) => r.id),
  ])).filter(id => id !== excludeOpId)
  if (ids.length === 0) return false

  const { data: opsRows } = await dbComp.from('ordenes_pago').select('id, status').in('id', ids)
  return (opsRows ?? []).some((o: any) => o.status === 'Pagada')
}

// Contraparte de cerrarOCsDeOP: al reversar el pago de una OP, reabre la(s) OC
// (y su requisición) que ese pago había cerrado — solo si ninguna otra OP
// pagada sigue dependiendo de ese cierre. Las que no se pueden reabrir quedan
// tal cual, para revisión manual.
export async function reabrirOCsDeOP(idOp: number, idOcDirecta: number | null) {
  const { data: link } = await dbComp.from('ordenes_pago_oc').select('id_oc_fk').eq('id_op_fk', idOp)
  const ocIds = Array.from(new Set([...(link ?? []).map((r: any) => r.id_oc_fk), ...(idOcDirecta ? [idOcDirecta] : [])]))
  if (ocIds.length === 0) return

  const { data: ocsRows } = await dbComp.from('ordenes_compra')
    .select('id, status, status_previo_cierre, id_requisicion_fk').in('id', ocIds).eq('status', 'Cerrada')
  const candidatas = (ocsRows ?? []).filter((o: any) => o.status_previo_cierre)

  for (const oc of candidatas) {
    if (await otraOPPagadaReferenciaOC(oc.id, idOp)) continue

    await dbComp.from('ordenes_compra').update({ status: oc.status_previo_cierre, status_previo_cierre: null }).eq('id', oc.id)

    if (oc.id_requisicion_fk) {
      const { data: reqRow } = await dbComp.from('requisiciones')
        .select('id, status, status_previo_cierre').eq('id', oc.id_requisicion_fk).single()
      if (reqRow?.status === 'Completada' && reqRow.status_previo_cierre) {
        await dbComp.from('requisiciones').update({ status: reqRow.status_previo_cierre, status_previo_cierre: null }).eq('id', reqRow.id)
      }
    }
  }
}
