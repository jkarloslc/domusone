import { dbGolf, dbCtrl, dbComp } from '@/lib/supabase'
import { distribuirConceptosRecibo } from './distribucionIngreso'
import { distribuirSeccionesRecibo } from '@/lib/distribucionSecciones'

/**
 * Recibos de ingreso de un corte POS: UNO POR MES DE VENTA.
 *
 * Antes se generaba un solo recibo con la fecha final del corte. Un corte que
 * abarcaba dos meses (p.ej. 20-ago al 21-sep) llevaba todo el ingreso al mes
 * del cierre: la renta de agosto de La Práctica y el reembolso Canal Pluvial
 * aparecían en septiembre en Comparativo y Flujo (corregido a mano 2026-11-12,
 * recibo 302). Ahora cada mes de venta lleva su propio recibo, fechado el
 * último día con venta de ese mes, con sus formas de pago y su desglose por
 * concepto/sección. Todos comparten referencia_externa = golf.ctrl_cortes_caja:<id>.
 */

type FormaPago = { id_forma_fk: number; forma_nombre: string; monto: number }
type Columnas = 'monto_efectivo' | 'monto_transferencia' | 'monto_tarjeta' | 'monto_tarjeta_debito'
  | 'monto_tarjeta_credito' | 'monto_cheque' | 'monto_deposito'
type MapFormas = (rows: FormaPago[]) => Partial<Record<Columnas, number>>

const diaLocal = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })

export async function crearRecibosCorte({ idCorte, idCentroIngreso, nombreCentro, idsPagadas, usuario, mapFormasPago }: {
  idCorte: number
  idCentroIngreso: number
  nombreCentro: string
  idsPagadas: number[]
  usuario: string
  mapFormasPago: MapFormas
}): Promise<number[]> {
  if (idsPagadas.length === 0) return []

  const [{ data: ventas, error: eV }, { data: pagos, error: eP }] = await Promise.all([
    dbGolf.from('ctrl_ventas').select('id, fecha, total').in('id', idsPagadas),
    dbGolf.from('ctrl_ventas_pagos').select('id_venta_fk, id_forma_fk, forma_nombre, monto').in('id_venta_fk', idsPagadas),
  ])
  if (eV || eP) throw new Error(eV?.message ?? eP?.message)

  // Agrupar por mes (zona horaria CDMX)
  const meses = new Map<string, { ids: number[]; dias: string[]; total: number }>()
  for (const v of (ventas ?? []) as { id: number; fecha: string; total: number }[]) {
    const dia = diaLocal(v.fecha)
    const mes = dia.slice(0, 7)
    const g = meses.get(mes) ?? { ids: [], dias: [], total: 0 }
    g.ids.push(v.id); g.dias.push(dia); g.total += Number(v.total) || 0
    meses.set(mes, g)
  }
  const orden = Array.from(meses.keys()).sort()
  const n = orden.length
  const creados: number[] = []

  for (let i = 0; i < n; i++) {
    const mes = orden[i]
    const g = meses.get(mes)!
    const dias = g.dias.sort()
    const desde = dias[0], hasta = dias[dias.length - 1]

    const fpMap = new Map<number, FormaPago>()
    for (const p of (pagos ?? []) as any[]) {
      if (!g.ids.includes(p.id_venta_fk)) continue
      const f = fpMap.get(p.id_forma_fk) ?? { id_forma_fk: p.id_forma_fk, forma_nombre: p.forma_nombre, monto: 0 }
      f.monto += Number(p.monto) || 0
      fpMap.set(p.id_forma_fk, f)
    }
    const formas = Array.from(fpMap.values())
    const m = mapFormasPago(formas)
    const fp = (k: Columnas) => m[k] ?? 0
    const parte = n > 1 ? ` (parte ${i + 1} de ${n})` : ''

    const { data: recibo, error } = await dbCtrl.from('recibos_ingreso').insert({
      fecha:                 hasta,
      id_centro_ingreso_fk:  idCentroIngreso,
      descripcion:           `Corte POS Golf — ${nombreCentro} — ${desde} al ${hasta}${parte}`,
      monto_efectivo:        fp('monto_efectivo'),
      monto_transferencia:   fp('monto_transferencia'),
      monto_tarjeta_debito:  fp('monto_tarjeta_debito'),
      monto_tarjeta_credito: fp('monto_tarjeta_credito'),
      monto_tarjeta:         fp('monto_tarjeta'),
      monto_cheque:          fp('monto_cheque'),
      monto_deposito:        fp('monto_deposito'),
      monto_total:           Math.round(g.total * 100) / 100,
      status:                'Confirmado',
      origen:                'POS_GOLF',
      referencia_externa:    `golf.ctrl_cortes_caja:${idCorte}`,
      notas:                 `Folio corte Golf: #${idCorte}${n > 1 ? ` · ventas de ${mes}` : ''}`,
      usuario_crea:          usuario,
    }).select('id').single()
    if (error || !recibo) throw new Error(error?.message ?? 'No se pudo crear el recibo de ingreso')

    if (formas.length > 0) {
      await dbCtrl.from('recibos_ingreso_formas_pago').insert(formas.map(f => ({
        id_recibo_fk: recibo.id, id_forma_pago_fk: f.id_forma_fk, nombre_forma_pago: f.forma_nombre, monto: f.monto,
      })))
    }

    await distribuirConceptosRecibo(recibo.id, idCentroIngreso, g.ids)
    // Centros con desglose por sección (Fraccionamiento): el desglose y las
    // bandas vencido/corriente/anticipado se derivan de la cobranza. No-op
    // para los centros por concepto.
    const dSec = await distribuirSeccionesRecibo(recibo.id, idCentroIngreso, g.ids)
    dSec.errores.forEach(e => console.error('distribuirSeccionesRecibo:', e))
    dSec.avisos.forEach(a => console.warn('distribuirSeccionesRecibo:', a))

    creados.push(recibo.id)
  }

  // El corte guarda el primer recibo; los demás se ubican por referencia_externa.
  if (creados.length > 0) {
    await dbGolf.from('ctrl_cortes_caja').update({ id_recibo_ingreso: creados[0] }).eq('id', idCorte)
  }
  return creados
}

// ── Cancelación de una venta que ya entró a un corte ─────────────────────────
//
// Cancelar una venta después del corte no descontaba su línea del recibo de
// ingreso: el Real seguía contando dinero que se devolvió (venta 853, $34,800
// en el recibo 302, corregido a mano 2026-11-12). Al cancelar, el recibo del
// mes de esa venta se recalcula desde cero con las ventas PAGADAS que le
// quedan (formas de pago, totales y desglose por concepto/sección). Si ya no
// queda ninguna, el recibo se cancela.

/** Reparte formas de pago en las columnas de caja/banco (mismas reglas que el corte). */
function columnasFormas(rows: FormaPago[]) {
  const m = { monto_efectivo: 0, monto_transferencia: 0, monto_tarjeta: 0, monto_tarjeta_debito: 0,
    monto_tarjeta_credito: 0, monto_cheque: 0, monto_deposito: 0 }
  for (const fp of rows) {
    const n = fp.forma_nombre.toLowerCase()
    if (n.includes('efectivo')) m.monto_efectivo += fp.monto
    else if (n.includes('tarjeta') || n.includes('tdc') || n.includes('tdd')) {
      if (n.includes('cr') || n.includes('cré')) m.monto_tarjeta_credito += fp.monto
      else m.monto_tarjeta_debito += fp.monto
      m.monto_tarjeta += fp.monto
    } else if (n.includes('transf')) m.monto_transferencia += fp.monto
    else if (n.includes('cheque')) m.monto_cheque += fp.monto
    else if (n.includes('dep') || n.includes('ventanilla')) m.monto_deposito += fp.monto
  }
  return m
}

/**
 * Llamar DESPUÉS de marcar la venta como CANCELADA. Devuelve un mensaje para
 * el usuario si tocó algún recibo, o null si la venta no estaba en un corte.
 */
export async function ajustarReciboPorVentaCancelada(idVenta: number, usuario?: string): Promise<string | null> {
  const { data: venta } = await dbGolf.from('ctrl_ventas').select('id, fecha, id_corte_fk').eq('id', idVenta).maybeSingle()
  if (!venta?.id_corte_fk) return null

  const { data: recibos } = await dbCtrl.from('recibos_ingreso')
    .select('id, fecha, id_centro_ingreso_fk')
    .eq('referencia_externa', `golf.ctrl_cortes_caja:${venta.id_corte_fk}`)
    .eq('status', 'Confirmado')
  if (!recibos?.length) return null

  // Cortes nuevos: un recibo por mes → el del mes de la venta.
  // Cortes viejos (un solo recibo para todo el corte): ese recibo.
  const mesVenta = diaLocal(venta.fecha).slice(0, 7)
  const porMes = recibos.length > 1
  const recibo: any = porMes ? recibos.find((r: any) => String(r.fecha).slice(0, 7) === mesVenta) : recibos[0]
  if (!recibo) return null

  const { data: restantes } = await dbGolf.from('ctrl_ventas').select('id, fecha, total')
    .eq('id_corte_fk', venta.id_corte_fk).eq('status', 'PAGADA')
  const quedan = ((restantes ?? []) as any[]).filter(v => !porMes || diaLocal(v.fecha).slice(0, 7) === mesVenta)
  const ids = quedan.map(v => v.id as number)

  const { data: mov } = await dbComp.from('movimientos_bancarios').select('id').eq('id_recibo_ingreso_fk', recibo.id).limit(1)
  const avisoBanco = mov?.length ? ' Tiene movimiento bancario ligado: revisa la conciliación.' : ''

  if (ids.length === 0) {
    const { error } = await dbCtrl.from('recibos_ingreso').update({
      status: 'Cancelado', usuario_cancela: usuario ?? 'sistema', fecha_cancela: new Date().toISOString(),
      motivo_cancelacion: `Se cancelaron todas las ventas del corte #${venta.id_corte_fk}${porMes ? ` de ${mesVenta}` : ''}`,
    }).eq('id', recibo.id)
    if (error) throw new Error(error.message)
    return `El recibo de ingreso #${recibo.id} quedó cancelado: ya no tiene ventas pagadas.${avisoBanco}`
  }

  const total = quedan.reduce((s, v) => s + (Number(v.total) || 0), 0)
  const { data: pagos } = await dbGolf.from('ctrl_ventas_pagos').select('id_forma_fk, forma_nombre, monto').in('id_venta_fk', ids)
  const fpMap = new Map<number, FormaPago>()
  for (const p of (pagos ?? []) as any[]) {
    const f = fpMap.get(p.id_forma_fk) ?? { id_forma_fk: p.id_forma_fk, forma_nombre: p.forma_nombre, monto: 0 }
    f.monto += Number(p.monto) || 0
    fpMap.set(p.id_forma_fk, f)
  }
  const formas = Array.from(fpMap.values())

  await Promise.all([
    dbCtrl.from('recibos_ingreso_conceptos').delete().eq('id_recibo_fk', recibo.id),
    dbCtrl.from('recibos_ingreso_secciones').delete().eq('id_recibo_fk', recibo.id),
    dbCtrl.from('recibos_ingreso_formas_pago').delete().eq('id_recibo_fk', recibo.id),
  ])
  const { error } = await dbCtrl.from('recibos_ingreso')
    .update({ ...columnasFormas(formas), monto_total: Math.round(total * 100) / 100 }).eq('id', recibo.id)
  if (error) throw new Error(error.message)
  if (formas.length > 0) {
    await dbCtrl.from('recibos_ingreso_formas_pago').insert(formas.map(f => ({
      id_recibo_fk: recibo.id, id_forma_pago_fk: f.id_forma_fk, nombre_forma_pago: f.forma_nombre, monto: f.monto,
    })))
  }
  await distribuirConceptosRecibo(recibo.id, recibo.id_centro_ingreso_fk, ids)
  const dSec = await distribuirSeccionesRecibo(recibo.id, recibo.id_centro_ingreso_fk, ids)
  dSec.errores.forEach(e => console.error('distribuirSeccionesRecibo:', e))

  return `El recibo de ingreso #${recibo.id} se ajustó sin esta venta (nuevo total $${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}).${avisoBanco}`
}
