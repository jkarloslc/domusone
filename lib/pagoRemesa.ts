import { dbComp, dbCfg } from '@/lib/supabase'
import { nextFolio } from '@/app/compras/types'
import { cerrarOCsDeOP, reabrirOCsDeOP } from '@/lib/cxpCascade'
import { emitirValesPorPagoOP, revertirValesPorPagoOP } from '@/lib/combustible'

// Status de OP que ya no admiten entrar a una remesa de pago.
const STATUS_NO_PAGABLE = ['Pagada', 'Cancelada', 'Rechazada', 'Pendiente Auth', 'Pendiente Auth Finanzas', 'Sustituida']

export type PagoRemesaInput = {
  opIds: number[]
  idCuentaBancaria: number | null
  formaPago: string
  referencia: string
  comprobante: string | null
  complementoPago: string | null
  notas: string
  fechaPago: string   // YYYY-MM-DD
  createdBy: string | null
}

// Une varias OPs de un mismo proveedor en un solo pago: cada OP queda Pagada
// al 100% de su saldo, con un abono propio (para el estado de cuenta por OP),
// pero un único movimiento bancario por el total (coincide con la línea real
// del banco). Reutiliza tal cual la cascada de cierre de OC/vales que ya usa
// el pago individual en tesoreria/cxp/page.tsx.
export async function aplicarPagoRemesa(input: PagoRemesaInput) {
  const { opIds, idCuentaBancaria, formaPago, referencia, comprobante, complementoPago, notas, fechaPago, createdBy } = input
  if (opIds.length < 2) throw new Error('Selecciona al menos 2 OPs para armar una remesa de pago.')

  // Relectura desde BD — evita pagar OPs ya liquidadas por otra sesión o con
  // datos de grid desactualizados (mismo guard que usa el pago individual).
  const { data: opsBD, error: errOps } = await dbComp.from('ordenes_pago')
    .select('id, folio, monto, monto_pagado, saldo, status, id_proveedor_fk, id_oc_fk')
    .in('id', opIds)
  if (errOps) throw new Error('No se pudieron releer las OPs: ' + errOps.message)
  if (!opsBD || opsBD.length !== opIds.length) throw new Error('Alguna OP seleccionada ya no existe.')

  const provIds = new Set(opsBD.map((o: any) => o.id_proveedor_fk))
  if (provIds.size > 1) throw new Error('Todas las OPs de una remesa deben ser del mismo proveedor.')

  const noPagables = opsBD.filter((o: any) => STATUS_NO_PAGABLE.includes(o.status))
  if (noPagables.length > 0) {
    throw new Error(`Estas OPs ya no están disponibles para pago: ${noPagables.map((o: any) => o.folio).join(', ')}`)
  }

  const montoTotal = opsBD.reduce((a: number, o: any) => a + (o.saldo ?? o.monto ?? 0), 0)
  if (montoTotal <= 0) throw new Error('El monto total de la remesa debe ser mayor a cero.')

  const folio = await nextFolio(dbComp, 'REM')

  const { data: remesa, error: errRemesa } = await dbComp.from('cxp_pagos_remesa').insert({
    folio,
    id_proveedor_fk:       opsBD[0].id_proveedor_fk,
    fecha_pago:            fechaPago,
    forma_pago:            formaPago,
    id_cuenta_bancaria_fk: idCuentaBancaria,
    monto_total:           montoTotal,
    referencia:            referencia.trim() || null,
    comprobante:           comprobante || null,
    complemento_pago:      complementoPago || null,
    notas:                 notas.trim() || null,
    created_by:            createdBy,
  }).select('id, folio').single()
  if (errRemesa || !remesa) throw new Error('No se pudo crear la remesa: ' + (errRemesa?.message ?? 'sin datos'))

  for (const op of opsBD as any[]) {
    const montoAbono = op.saldo ?? op.monto ?? 0

    const { error: errAbono } = await dbComp.from('cxp_abonos').insert({
      id_op_fk:              op.id,
      id_remesa_fk:          remesa.id,
      fecha_abono:           fechaPago,
      monto:                 montoAbono,
      forma_pago:            formaPago,
      id_cuenta_bancaria_fk: idCuentaBancaria,
      referencia:            referencia.trim() || null,
      notas:                 notas.trim() || null,
      comprobante:           comprobante || null,
      complemento_pago:      complementoPago || null,
      created_by:            createdBy,
    })
    if (errAbono) throw new Error(`No se pudo registrar el abono de ${op.folio}: ${errAbono.message}`)

    await dbComp.from('ordenes_pago').update({
      monto_pagado:    (op.monto_pagado ?? 0) + montoAbono,
      saldo:           0,
      status:          'Pagada',
      fecha_pago:      fechaPago,
      referencia_pago: referencia.trim() || null,
    }).eq('id', op.id)

    await emitirValesPorPagoOP(op.id, createdBy)
    await cerrarOCsDeOP(op.id, op.id_oc_fk ?? null)
  }

  // Un solo movimiento bancario por el total de la remesa.
  if (idCuentaBancaria) {
    const { data: cuentaRow } = await dbCfg.from('cuentas_bancarias').select('saldo').eq('id', idCuentaBancaria).single()
    const saldoAntes   = (cuentaRow as any)?.saldo ?? 0
    const saldoDespues = saldoAntes - montoTotal
    await Promise.all([
      dbComp.from('movimientos_bancarios').insert({
        id_cuenta_fk:     idCuentaBancaria,
        id_remesa_fk:     remesa.id,
        tipo:             'Cargo',
        monto:            montoTotal,
        saldo_antes:      saldoAntes,
        saldo_despues:    saldoDespues,
        concepto:         `Pago remesa ${remesa.folio} (${opsBD.length} OPs)`,
        referencia:       referencia.trim() || null,
        fecha_movimiento: fechaPago,
        created_by:       createdBy,
      }),
      dbCfg.from('cuentas_bancarias').update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', idCuentaBancaria),
    ])
  }

  return remesa
}

export type ReversarRemesaInput = {
  idRemesa: number
  motivo: string
  createdBy: string | null
}

// Reversa una remesa completa: regresa cada OP a su status previo (Pendiente
// o Abonada, según traía antes de esta remesa), anula sus abonos (sin
// borrarlos — quedan como "Cancelada" para trazabilidad), reabre OC/vales que
// esta remesa había cerrado si nadie más depende de ese cierre, y devuelve el
// dinero a la cuenta bancaria con un movimiento de reverso (no reescribe el
// historial de saldo_antes/saldo_despues previo).
export async function reversarPagoRemesa(input: ReversarRemesaInput) {
  const { idRemesa, motivo, createdBy } = input
  if (!motivo.trim()) throw new Error('Indica el motivo de la reversión.')

  const { data: remesa, error: errRemesa } = await dbComp.from('cxp_pagos_remesa').select('*').eq('id', idRemesa).single()
  if (errRemesa || !remesa) throw new Error('No se encontró la remesa: ' + (errRemesa?.message ?? 'sin datos'))
  if (remesa.status !== 'Aplicado') throw new Error('Esta remesa ya fue reversada anteriormente.')

  const { data: abonos, error: errAbonos } = await dbComp.from('cxp_abonos')
    .select('id, id_op_fk, monto, status').eq('id_remesa_fk', idRemesa).eq('status', 'Aplicado')
  if (errAbonos) throw new Error('No se pudieron leer los abonos de la remesa: ' + errAbonos.message)
  if (!abonos || abonos.length === 0) throw new Error('La remesa no tiene abonos activos por reversar.')

  const opIds = abonos.map((a: any) => a.id_op_fk)
  const { data: opsBD, error: errOps } = await dbComp.from('ordenes_pago')
    .select('id, folio, monto, monto_pagado, id_oc_fk').in('id', opIds)
  if (errOps || !opsBD) throw new Error('No se pudieron releer las OPs de la remesa: ' + (errOps?.message ?? 'sin datos'))

  for (const abono of abonos as any[]) {
    const op = (opsBD as any[]).find(o => o.id === abono.id_op_fk)
    if (!op) continue

    const nuevoMontoPagado = Math.max((op.monto_pagado ?? 0) - abono.monto, 0)
    const nuevoSaldo       = Math.max((op.monto ?? 0) - nuevoMontoPagado, 0)
    const nuevoStatus      = nuevoMontoPagado <= 0.01 ? 'Pendiente' : 'Abonada'

    await dbComp.from('ordenes_pago').update({
      monto_pagado:    nuevoMontoPagado,
      saldo:           nuevoSaldo,
      status:          nuevoStatus,
      fecha_pago:      null,
      referencia_pago: null,
    }).eq('id', op.id)

    await dbComp.from('cxp_abonos').update({ status: 'Cancelada' }).eq('id', abono.id)

    await revertirValesPorPagoOP(op.id)
    await reabrirOCsDeOP(op.id, op.id_oc_fk ?? null)
  }

  if (remesa.id_cuenta_bancaria_fk) {
    const { data: cuentaRow } = await dbCfg.from('cuentas_bancarias').select('saldo').eq('id', remesa.id_cuenta_bancaria_fk).single()
    const saldoAntes   = (cuentaRow as any)?.saldo ?? 0
    const saldoDespues = saldoAntes + remesa.monto_total
    await Promise.all([
      dbComp.from('movimientos_bancarios').insert({
        id_cuenta_fk:     remesa.id_cuenta_bancaria_fk,
        id_remesa_fk:     remesa.id,
        tipo:             'Abono',
        monto:            remesa.monto_total,
        saldo_antes:      saldoAntes,
        saldo_despues:    saldoDespues,
        concepto:         `Reverso remesa ${remesa.folio}`,
        referencia:       motivo.trim(),
        fecha_movimiento: new Date().toISOString().slice(0, 10),
        created_by:       createdBy,
      }),
      dbCfg.from('cuentas_bancarias').update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', remesa.id_cuenta_bancaria_fk),
    ])
  }

  await dbComp.from('cxp_pagos_remesa').update({
    status:           'Cancelada',
    cancelado_motivo: motivo.trim(),
    cancelado_by:     createdBy,
    cancelado_at:     new Date().toISOString(),
  }).eq('id', idRemesa)

  return { ...remesa, status: 'Cancelada' }
}
