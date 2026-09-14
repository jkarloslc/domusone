import { dbComp, dbCfg } from '@/lib/supabase'
import { cerrarOCsDeOP, reabrirOCsDeOP } from '@/lib/cxpCascade'
import { emitirValesPorPagoOP, revertirValesPorPagoOP } from '@/lib/combustible'

export type EditarPagoCxpInput = {
  idAbono:          number
  fechaAbono:       string
  monto:            number
  formaPago:        string
  idCuentaBancaria: number | null
  referencia:       string
  notas:            string
  motivoEdicion:    string
  editadoPor:       string | null
}

// Edita un pago (abono) de CXP ya aplicado, permitiendo cambiar monto y
// cuenta bancaria de origen. Recalcula monto_pagado/saldo/status de la OP,
// revierte el movimiento bancario anterior (si tenía cuenta) e inserta el
// correcto — conserva el rastro de auditoría igual que reversarPagoRemesa
// (no reescribe saldo_antes/saldo_despues previos, solo agrega movimientos).
export async function editarPagoCxp(input: EditarPagoCxpInput) {
  const { idAbono, fechaAbono, monto, formaPago, idCuentaBancaria, referencia, notas, motivoEdicion, editadoPor } = input
  if (!motivoEdicion.trim()) throw new Error('Indica el motivo de la edición.')
  if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.')

  const { data: abono, error: errAbono } = await dbComp.from('cxp_abonos')
    .select('id, id_op_fk, monto, id_cuenta_bancaria_fk, status').eq('id', idAbono).single()
  if (errAbono || !abono) throw new Error('No se encontró el pago: ' + (errAbono?.message ?? 'sin datos'))
  if ((abono as any).status === 'Cancelada') throw new Error('Este pago ya fue cancelado; no se puede editar.')

  const { data: op, error: errOp } = await dbComp.from('ordenes_pago')
    .select('id, folio, monto, monto_pagado, status, id_oc_fk').eq('id', (abono as any).id_op_fk).single()
  if (errOp || !op) throw new Error('No se pudo releer la OP: ' + (errOp?.message ?? 'sin datos'))
  if ((op as any).status === 'Cancelada' || (op as any).status === 'Rechazada') {
    throw new Error('Esta OP está cancelada/rechazada; no se puede editar su pago.')
  }

  const montoAnterior    = (abono as any).monto ?? 0
  const cuentaAnteriorId = (abono as any).id_cuenta_bancaria_fk ?? null
  const statusPrevioOP   = (op as any).status

  const nuevoMontoPagado = Math.max(((op as any).monto_pagado ?? 0) - montoAnterior + monto, 0)
  if (nuevoMontoPagado > ((op as any).monto ?? 0) + 0.01) {
    throw new Error(`El nuevo monto excede el total de la OP (${(op as any).monto}).`)
  }
  const nuevoSaldo  = Math.max(((op as any).monto ?? 0) - nuevoMontoPagado, 0)
  const nuevoStatus = nuevoSaldo <= 0.01 ? 'Pagada' : (nuevoMontoPagado > 0.01 ? 'Abonada' : 'Pendiente')

  await dbComp.from('ordenes_pago').update({
    monto_pagado: nuevoMontoPagado,
    saldo:        nuevoSaldo,
    status:       nuevoStatus,
    ...(nuevoStatus === 'Pagada'
      ? { fecha_pago: fechaAbono, referencia_pago: referencia.trim() || null }
      : { fecha_pago: null, referencia_pago: null }),
  }).eq('id', (op as any).id)

  if (nuevoStatus === 'Pagada' && statusPrevioOP !== 'Pagada') {
    await emitirValesPorPagoOP((op as any).id, editadoPor)
    await cerrarOCsDeOP((op as any).id, (op as any).id_oc_fk ?? null)
  } else if (statusPrevioOP === 'Pagada' && nuevoStatus !== 'Pagada') {
    await revertirValesPorPagoOP((op as any).id)
    await reabrirOCsDeOP((op as any).id, (op as any).id_oc_fk ?? null)
  }

  await dbComp.from('cxp_abonos').update({
    fecha_abono:           fechaAbono,
    monto,
    forma_pago:            formaPago,
    id_cuenta_bancaria_fk: idCuentaBancaria,
    referencia:            referencia.trim() || null,
    notas:                 notas.trim() || null,
    editado_by:            editadoPor,
    editado_at:            new Date().toISOString(),
    motivo_edicion:        motivoEdicion.trim(),
  }).eq('id', idAbono)

  const fechaHoy = new Date().toISOString().slice(0, 10)

  if (cuentaAnteriorId) {
    const { data: cuentaRow } = await dbCfg.from('cuentas_bancarias').select('saldo').eq('id', cuentaAnteriorId).single()
    const saldoAntes   = (cuentaRow as any)?.saldo ?? 0
    const saldoDespues = saldoAntes + montoAnterior
    await Promise.all([
      dbComp.from('movimientos_bancarios').insert({
        id_cuenta_fk:     cuentaAnteriorId,
        id_op_fk:         (op as any).id,
        id_abono_fk:      idAbono,
        tipo:             'Abono',
        monto:            montoAnterior,
        saldo_antes:      saldoAntes,
        saldo_despues:    saldoDespues,
        concepto:         `Ajuste por edición de pago OP ${(op as any).folio} (reverso)`,
        referencia:       motivoEdicion.trim(),
        fecha_movimiento: fechaHoy,
        created_by:       editadoPor,
      }),
      dbCfg.from('cuentas_bancarias').update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', cuentaAnteriorId),
    ])
  }

  if (idCuentaBancaria) {
    const { data: cuentaRow } = await dbCfg.from('cuentas_bancarias').select('saldo').eq('id', idCuentaBancaria).single()
    const saldoAntes   = (cuentaRow as any)?.saldo ?? 0
    const saldoDespues = saldoAntes - monto
    await Promise.all([
      dbComp.from('movimientos_bancarios').insert({
        id_cuenta_fk:     idCuentaBancaria,
        id_op_fk:         (op as any).id,
        id_abono_fk:      idAbono,
        tipo:             'Cargo',
        monto:            monto,
        saldo_antes:      saldoAntes,
        saldo_despues:    saldoDespues,
        concepto:         `Pago OP ${(op as any).folio} (editado)`,
        referencia:       referencia.trim() || null,
        fecha_movimiento: fechaAbono,
        created_by:       editadoPor,
      }),
      dbCfg.from('cuentas_bancarias').update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', idCuentaBancaria),
    ])
  }

  return { nuevoStatus, nuevoSaldo, nuevoMontoPagado }
}
