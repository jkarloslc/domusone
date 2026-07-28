import { dbCtrl } from '@/lib/supabase'

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

// El proceso arranca con el vale en Solicitado: Tesorería genera la OP (tipo de
// gasto Combustible) para pagarle al proveedor con base en los vales pendientes.
// Al liquidarse esa OP, los vales que quedaron ligados a ella (vales_combustible.id_op_fk)
// pasan solos a Emitido — ya no se hace a mano desde el modal del vale.
export async function emitirValesPorPagoOP(idOp: number, emitidoPor: string | null) {
  const { data: vales } = await dbCtrl.from('vales_combustible')
    .select('id').eq('id_op_fk', idOp).eq('status', 'Solicitado')
  if (!vales || vales.length === 0) return
  await dbCtrl.from('vales_combustible')
    .update({ status: 'Emitido', emitido_por: emitidoPor, updated_at: new Date().toISOString() })
    .eq('id_op_fk', idOp).eq('status', 'Solicitado')
}
