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
