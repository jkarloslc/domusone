import { dbCtrl, dbComp } from '@/lib/supabase'

// Un vale se puede "sacar" desde dos lugares: la Carga registrada en el propio
// tab Combustible (compra directa / recepción de garrafa) y la Bitácora de Uso
// de Vehículos y Maquinaria (consumo real por equipo, medido en litros).
// El status del vale es 100% derivado de la suma de ambas fuentes — nunca se
// elige a mano.
export async function recomputeValeCombustible(idVale: number) {
  const [{ data: cargas }, { data: usos }, { data: vale }] = await Promise.all([
    dbCtrl.from('cargas_combustible').select('litros').eq('id_vale_fk', idVale).eq('activo', true),
    dbCtrl.from('bitacora_uso_equipos').select('litros').eq('id_vale_combustible_fk', idVale).eq('activo', true),
    dbCtrl.from('vales_combustible').select('litros_autorizados, status').eq('id', idVale).single(),
  ])
  if (!vale || vale.status === 'Cancelado') return

  const total = (cargas ?? []).reduce((a, c: any) => a + (c.litros ?? 0), 0)
              + (usos   ?? []).reduce((a, u: any) => a + (u.litros ?? 0), 0)

  const nuevoStatus = total <= 0 ? 'Emitido' : total >= (vale.litros_autorizados ?? 0) ? 'Completado' : 'Parcial'

  await dbCtrl.from('vales_combustible')
    .update({ litros_usados: total, status: nuevoStatus, updated_at: new Date().toISOString() })
    .eq('id', idVale)
}

const KARDEX_TIPOS = ['magna', 'premium', 'diesel']

// El proceso arranca con el vale en Solicitado: Tesorería genera la OP (tipo de
// gasto Combustible) para pagarle al proveedor con base en los vales pendientes.
// Al liquidarse esa OP, los vales que quedaron ligados a ella (vales_combustible.id_op_fk)
// pasan solos a Emitido — ya no se hace a mano desde el modal del vale.
export async function emitirValesPorPagoOP(idOp: number, emitidoPor: string | null) {
  const { data: vales } = await dbCtrl.from('vales_combustible')
    .select('id, folio, tipo_suministro, tipo_combustible, litros_autorizados, monto_autorizado')
    .eq('id_op_fk', idOp).eq('status', 'Solicitado')
  if (!vales || vales.length === 0) return
  await dbCtrl.from('vales_combustible')
    .update({ status: 'Emitido', emitido_por: emitidoPor, updated_at: new Date().toISOString() })
    .eq('id_op_fk', idOp).eq('status', 'Solicitado')

  // Garrafa: el combustible se compra para resguardo (tractores, equipos de
  // mantenimiento por litros), así que al pagarse la OP entra al Kardex.
  // Gasolinería es consumo directo en la estación: nunca toca el Kardex.
  for (const v of vales) {
    if (v.tipo_suministro !== 'Garrafa' || !KARDEX_TIPOS.includes(String(v.tipo_combustible ?? '').toLowerCase())) continue
    const { data: ya } = await dbComp.from('combustible_movimientos')
      .select('id').eq('id_vale_combustible_fk', v.id).eq('tipo_mov', 'ENTRADA').limit(1)
    if (ya && ya.length > 0) continue
    const litros = Number(v.litros_autorizados ?? 0)
    if (litros <= 0) continue
    const monto = v.monto_autorizado != null ? Number(v.monto_autorizado) : null
    const { error } = await dbComp.from('combustible_movimientos').insert({
      tipo_combustible:      String(v.tipo_combustible).toLowerCase(),
      tipo_mov:              'ENTRADA',
      fecha:                 new Date().toISOString().slice(0, 10),
      litros,
      precio_litro:          monto != null ? Number((monto / litros).toFixed(4)) : null,
      monto_total:           monto,
      referencia:            `Vale ${v.folio} · OP #${idOp}`,
      observaciones:         'Entrada por pago de OP (vale Garrafa)',
      created_by:            emitidoPor,
      id_vale_combustible_fk: v.id,
    })
    if (error) console.error('Kardex: entrada por vale', v.folio, error.message)
  }
}

// Contraparte de emitirValesPorPagoOP: si se reversa el pago de la OP, los
// vales que siguen en Emitido (sin litros cargados encima) regresan a
// Solicitado y su entrada al Kardex se elimina. Los que ya tienen consumo
// (Parcial/Completado) no se tocan.
export async function revertirValesPorPagoOP(idOp: number) {
  const { data: vales } = await dbCtrl.from('vales_combustible')
    .select('id').eq('id_op_fk', idOp).eq('status', 'Emitido')
  await dbCtrl.from('vales_combustible')
    .update({ status: 'Solicitado', emitido_por: null, updated_at: new Date().toISOString() })
    .eq('id_op_fk', idOp).eq('status', 'Emitido')
  const ids = (vales ?? []).map((v: any) => v.id)
  if (ids.length > 0) {
    await dbComp.from('combustible_movimientos').delete()
      .in('id_vale_combustible_fk', ids).eq('tipo_mov', 'ENTRADA')
  }
}
