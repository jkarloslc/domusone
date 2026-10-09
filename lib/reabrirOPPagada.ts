import { dbComp, dbCfg } from '@/lib/supabase'
import { reabrirOCsDeOP } from '@/lib/cxpCascade'
import { revertirValesPorPagoOP } from '@/lib/combustible'

export type ReabrirOPPagadaInput = {
  idOp:       number
  reabiertoPor: string | null
}

// Reabre una OP Pagada/Abonada (solo superadmin) para corregir montos:
// anula todos sus pagos activos (cxp_abonos → 'Cancelada', sin borrarlos),
// devuelve el dinero a cada cuenta bancaria con un movimiento de reverso
// (no reescribe saldo_antes/saldo_despues previos), reabre OC/vales que el
// pago había cerrado y deja la OP en 'Pendiente' con saldo = monto. Desde ahí
// se edita con el botón Editar y se vuelve a pagar en Tesorería > CXP, que
// genera el movimiento bancario correcto.
// Los pagos agrupados (remesa) se reversan desde CXP como unidad.
export async function reabrirOPPagada({ idOp, reabiertoPor }: ReabrirOPPagadaInput) {
  const { data: op, error: errOp } = await dbComp.from('ordenes_pago')
    .select('id, folio, monto, status, id_oc_fk').eq('id', idOp).single()
  if (errOp || !op) throw new Error('No se pudo leer la OP: ' + (errOp?.message ?? 'sin datos'))
  if (!['Pagada', 'Abonada'].includes((op as any).status)) {
    throw new Error('Solo se pueden reabrir OP en status Pagada o Abonada.')
  }

  const { data: abonos, error: errAb } = await dbComp.from('cxp_abonos')
    .select('id, monto, id_cuenta_bancaria_fk, id_remesa_fk, status').eq('id_op_fk', idOp).neq('status', 'Cancelada')
  if (errAb) throw new Error('No se pudieron leer los pagos: ' + errAb.message)

  if ((abonos ?? []).some((a: any) => a.id_remesa_fk)) {
    throw new Error('Esta OP fue pagada dentro de una remesa. Reversa primero la remesa en Tesorería > CXP.')
  }

  const hoy = new Date().toISOString().slice(0, 10)

  // Secuencial: varios pagos pueden ser de la misma cuenta y cada reverso
  // debe partir del saldo ya actualizado.
  for (const a of (abonos ?? []) as any[]) {
    if (a.id_cuenta_bancaria_fk && a.monto > 0) {
      const { data: cuentaRow, error: errC } = await dbCfg.from('cuentas_bancarias')
        .select('saldo').eq('id', a.id_cuenta_bancaria_fk).single()
      if (errC) throw new Error('No se pudo leer la cuenta bancaria: ' + errC.message)
      const saldoAntes   = (cuentaRow as any)?.saldo ?? 0
      const saldoDespues = saldoAntes + a.monto
      const { error: errMov } = await dbComp.from('movimientos_bancarios').insert({
        id_cuenta_fk:     a.id_cuenta_bancaria_fk,
        id_op_fk:         idOp,
        id_abono_fk:      a.id,
        tipo:             'Abono',
        monto:            a.monto,
        saldo_antes:      saldoAntes,
        saldo_despues:    saldoDespues,
        concepto:         `Reverso pago OP ${(op as any).folio}`,
        referencia:       null,
        fecha_movimiento: hoy,
        created_by:       reabiertoPor,
      })
      if (errMov) throw new Error('No se pudo registrar el reverso bancario: ' + errMov.message)
      const { error: errSaldo } = await dbCfg.from('cuentas_bancarias')
        .update({ saldo: saldoDespues, updated_at: new Date().toISOString() }).eq('id', a.id_cuenta_bancaria_fk)
      if (errSaldo) throw new Error('No se pudo actualizar el saldo de la cuenta: ' + errSaldo.message)
    }
    const { error: errCan } = await dbComp.from('cxp_abonos').update({
      status:         'Cancelada',
    }).eq('id', a.id)
    if (errCan) throw new Error('No se pudo cancelar el pago: ' + errCan.message)
  }

  const statusPrevio = (op as any).status
  const { error: errUp } = await dbComp.from('ordenes_pago').update({
    status:           'Pendiente',
    monto_pagado:     0,
    saldo:            (op as any).monto,
    fecha_pago:       null,
    referencia_pago:  null,
  }).eq('id', idOp)
  if (errUp) throw new Error('No se pudo reabrir la OP: ' + errUp.message)

  if (statusPrevio === 'Pagada') {
    await revertirValesPorPagoOP(idOp)
    await reabrirOCsDeOP(idOp, (op as any).id_oc_fk ?? null)
  }

  return { pagosAnulados: (abonos ?? []).length }
}
