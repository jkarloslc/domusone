import { dbGolf, dbCtrl } from '@/lib/supabase'
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
