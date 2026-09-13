// Helpers compartidos por los 4 métodos de cancelación en cascada
// (Golf, Hípico, Locales, Residencial) — ver app/golf/recibos/RecibosGolf.tsx,
// app/hipico/cobranza/page.tsx, app/locales/cobranza/page.tsx y
// app/cobranza/ReciboDetail.tsx.
import { dbGolf, dbCtrl } from './supabase'

// Si el ticket POS ligado a este recibo ya fue facturado (CFDI timbrado), hay
// que cancelar la factura primero desde POS → Ventas — cancelar el recibo por
// debajo dejaría un CFDI vigente sin venta ni cuota que lo respalde.
export async function verificarNoFacturada(idVentaPosFk: number | null): Promise<string | null> {
  if (!idVentaPosFk) return null
  const { data } = await dbGolf.from('ctrl_ventas')
    .select('facturada, folio_fiscal').eq('id', idVentaPosFk).maybeSingle()
  const venta = data as { facturada: boolean; folio_fiscal: string | null } | null
  if (venta?.facturada) {
    return `Esta venta ya fue facturada${venta.folio_fiscal ? ` (folio fiscal ${venta.folio_fiscal})` : ''}. Cancela la factura primero desde POS → Ventas y luego cancela este recibo.`
  }
  return null
}

// Bitácora de auditoría (ctrl.cancelaciones) — mejor esfuerzo: si la tabla aún
// no existe (migración pendiente) o falla el insert, no debe tumbar la
// cancelación real, solo se registra en consola.
export async function logCancelacion(params: {
  modulo: 'golf' | 'hipico' | 'locales' | 'residencial'
  folio: string | null
  idOrigen: number
  idVentaPosFk?: number | null
  monto: number
  cuotasAfectadas: number
  motivo: string | null
  usuario: string | null
}) {
  try {
    const { error } = await dbCtrl.from('cancelaciones').insert({
      modulo:            params.modulo,
      folio:             params.folio,
      id_origen:         params.idOrigen,
      id_venta_pos_fk:   params.idVentaPosFk ?? null,
      monto:             params.monto,
      cuotas_afectadas:  params.cuotasAfectadas,
      motivo:            params.motivo,
      usuario:           params.usuario,
    })
    if (error) console.error('logCancelacion:', error.message)
  } catch (e) {
    console.error('logCancelacion:', e)
  }
}

// Reapertura de un recibo cancelado (solo superadmin) — vuelve a aplicar a
// cada cuota exactamente lo que este recibo había abonado (según su propio
// detalle, que nunca se borra al cancelar), replicando el mismo cobro
// original. Si la cuota ya trae más abonado de lo que le corresponde (p.ej.
// se volvió a cobrar con otro recibo mientras esta estaba cancelada), el
// saldo se detiene en 0 en vez de irse a negativo.
export async function reabrirCuotasCobertura(
  dbClient: any,
  tabla: 'cxc_hip' | 'loc_cxc' | 'cxc_golf',
  detRows: { id_cuota_fk: number | null; monto_final: number }[],
  fechaPago: string | null,
  formaPago: string | null,
  extraFields: Record<string, any> = {},
) {
  const detCuotas = detRows.filter(d => d.id_cuota_fk != null)
  if (!detCuotas.length) return
  const ids = Array.from(new Set(detCuotas.map(d => d.id_cuota_fk as number)))
  const { data: cuotasActuales, error: eq } = await dbClient.from(tabla)
    .select('id, saldo, monto_final, status').in('id', ids)
  if (eq) throw eq
  const porId = new Map(((cuotasActuales ?? []) as { id: number; saldo: number | null; monto_final: number; status: string }[]).map(c => [c.id, c]))
  const abonadoPorCuota = new Map<number, number>()
  for (const d of detCuotas) {
    const idC = d.id_cuota_fk as number
    abonadoPorCuota.set(idC, (abonadoPorCuota.get(idC) ?? 0) + d.monto_final)
  }
  const updates = Array.from(abonadoPorCuota.entries()).map(([idC, abonado]) => {
    const c = porId.get(idC)
    if (!c) return null
    const saldoActual = c.saldo ?? c.monto_final
    const nuevoSaldo = Math.max(0, parseFloat((saldoActual - abonado).toFixed(2)))
    return dbClient.from(tabla).update({
      saldo:      nuevoSaldo,
      status:     nuevoSaldo <= 0.005 ? 'PAGADO' : 'PAGO_PARCIAL',
      fecha_pago: fechaPago,
      forma_pago: formaPago,
      ...extraFields,
    }).eq('id', idC)
  }).filter(Boolean) as PromiseLike<any>[]
  const results = await Promise.all(updates)
  const updErr = (results as any[]).find(r => r.error)?.error
  if (updErr) throw updErr
}

// Marca en la bitácora que la cancelación de este recibo fue revertida —
// mejor esfuerzo, igual que logCancelacion.
export async function marcarCancelacionRevertida(
  modulo: 'golf' | 'hipico' | 'locales' | 'residencial',
  idOrigen: number,
  usuario: string | null,
) {
  try {
    const { error } = await dbCtrl.from('cancelaciones').update({
      revertida: true, revertida_fecha: new Date().toISOString(), revertida_por: usuario,
    }).eq('modulo', modulo).eq('id_origen', idOrigen).eq('revertida', false)
    if (error) console.error('marcarCancelacionRevertida:', error.message)
  } catch (e) {
    console.error('marcarCancelacionRevertida:', e)
  }
}
