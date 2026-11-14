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
    .select('id, id_op_fk, id_remesa_fk, monto, id_cuenta_bancaria_fk, status').eq('id', idAbono).single()
  if (errAbono || !abono) throw new Error('No se encontró el pago: ' + (errAbono?.message ?? 'sin datos'))
  if ((abono as any).status === 'Cancelada') throw new Error('Este pago ya fue cancelado; no se puede editar.')

  const { data: op, error: errOp } = await dbComp.from('ordenes_pago')
    .select('id, folio, monto, monto_pagado, saldo, status, id_oc_fk').eq('id', (abono as any).id_op_fk).single()
  if (errOp || !op) throw new Error('No se pudo releer la OP: ' + (errOp?.message ?? 'sin datos'))
  if ((op as any).status === 'Cancelada' || (op as any).status === 'Rechazada') {
    throw new Error('Esta OP está cancelada/rechazada; no se puede editar su pago.')
  }

  const montoAnterior    = (abono as any).monto ?? 0
  const cuentaAnteriorId = (abono as any).id_cuenta_bancaria_fk ?? null
  const statusPrevioOP   = (op as any).status
  const cambiaDinero     = Math.abs(montoAnterior - monto) > 0.001 || cuentaAnteriorId !== idCuentaBancaria

  // Pago de remesa: un solo movimiento bancario cubre todas sus OPs, así que
  // monto/cuenta se corrigen reversando la remesa. La fecha se cambia para
  // toda la remesa a la vez.
  if ((abono as any).id_remesa_fk) {
    if (cambiaDinero) throw new Error('Este pago es parte de una remesa: para cambiar monto o cuenta, reversa la remesa y vuelve a aplicarla.')
    await dbComp.from('cxp_abonos').update({
      forma_pago: formaPago, referencia: referencia.trim() || null, notas: notas.trim() || null,
    }).eq('id', idAbono)
    await cambiarFechaPagoCxp({ idAbono, fecha: fechaAbono, motivo: motivoEdicion, editadoPor })
    return { nuevoStatus: statusPrevioOP, nuevoSaldo: (op as any).saldo, nuevoMontoPagado: (op as any).monto_pagado }
  }

  // Solo cambian fecha/referencia/notas/forma: no se generan movimientos de
  // reverso; se corrige la fecha del cargo bancario existente.
  if (!cambiaDinero) {
    await dbComp.from('cxp_abonos').update({
      forma_pago: formaPago, referencia: referencia.trim() || null, notas: notas.trim() || null,
    }).eq('id', idAbono)
    await cambiarFechaPagoCxp({ idAbono, fecha: fechaAbono, motivo: motivoEdicion, editadoPor })
    if (statusPrevioOP === 'Pagada') {
      await dbComp.from('ordenes_pago').update({ referencia_pago: referencia.trim() || null }).eq('id', (op as any).id)
    }
    return { nuevoStatus: statusPrevioOP, nuevoSaldo: (op as any).saldo, nuevoMontoPagado: (op as any).monto_pagado }
  }

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
      ? { referencia_pago: referencia.trim() || null }
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

  if (nuevoStatus === 'Pagada') await sincronizarFechaPagoOP((op as any).id)

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

// La fecha de pago de una OP Pagada es la del último abono vigente (una OP
// con varios abonos se liquida con el último, no con el que se edite).
export async function sincronizarFechaPagoOP(idOp: number) {
  const { data: op } = await dbComp.from('ordenes_pago').select('status').eq('id', idOp).single()
  if ((op as any)?.status !== 'Pagada') return
  const { data: abs, error } = await dbComp.from('cxp_abonos')
    .select('fecha_abono, status').eq('id_op_fk', idOp)
  if (error) throw new Error('No se pudieron leer los pagos de la OP: ' + error.message)
  const fechas = (abs ?? []).filter((a: any) => a.status !== 'Cancelada' && a.fecha_abono).map((a: any) => a.fecha_abono as string)
  if (fechas.length === 0) return
  const ultima = fechas.sort().at(-1)!
  const { error: errUp } = await dbComp.from('ordenes_pago').update({ fecha_pago: ultima }).eq('id', idOp)
  if (errUp) throw new Error('No se pudo actualizar la fecha de pago de la OP: ' + errUp.message)
}

export type CambiarFechaPagoInput = {
  idAbono:    number
  fecha:      string   // YYYY-MM-DD
  motivo:     string
  editadoPor: string | null
}

// Cambia solo la fecha de un pago ya aplicado, sin tocar montos ni saldos:
// actualiza la fecha del abono, la del cargo bancario que lo registró y la
// fecha_pago de la OP. Si el abono es parte de una remesa, cambia la fecha de
// toda la remesa (todas sus OPs + el movimiento bancario único).
export async function cambiarFechaPagoCxp({ idAbono, fecha, motivo, editadoPor }: CambiarFechaPagoInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Indica una fecha válida.')
  if (!motivo.trim()) throw new Error('Indica el motivo del cambio de fecha.')

  const { data: abono, error: errAbono } = await dbComp.from('cxp_abonos')
    .select('id, id_op_fk, id_remesa_fk, status').eq('id', idAbono).single()
  if (errAbono || !abono) throw new Error('No se encontró el pago: ' + (errAbono?.message ?? 'sin datos'))
  if ((abono as any).status === 'Cancelada') throw new Error('Este pago ya fue cancelado; no se puede editar.')

  const auditoria = { editado_by: editadoPor, editado_at: new Date().toISOString(), motivo_edicion: motivo.trim() }
  const idRemesa  = (abono as any).id_remesa_fk as number | null

  if (idRemesa) {
    const { data: abs, error: errAbs } = await dbComp.from('cxp_abonos')
      .select('id, id_op_fk, status').eq('id_remesa_fk', idRemesa)
    if (errAbs) throw new Error('No se pudieron leer los pagos de la remesa: ' + errAbs.message)
    const vigentes = (abs ?? []).filter((a: any) => a.status !== 'Cancelada')
    const { error: e1 } = await dbComp.from('cxp_abonos').update({ fecha_abono: fecha, ...auditoria })
      .in('id', vigentes.map((a: any) => a.id))
    if (e1) throw new Error('No se pudo actualizar la fecha de los pagos: ' + e1.message)
    const { error: e2 } = await dbComp.from('cxp_pagos_remesa').update({ fecha_pago: fecha }).eq('id', idRemesa)
    if (e2) throw new Error('No se pudo actualizar la fecha de la remesa: ' + e2.message)
    const { error: e3 } = await dbComp.from('movimientos_bancarios').update({ fecha_movimiento: fecha })
      .eq('id_remesa_fk', idRemesa).eq('tipo', 'Cargo')
    if (e3) throw new Error('No se pudo actualizar el movimiento bancario: ' + e3.message)
    for (const a of vigentes) await sincronizarFechaPagoOP((a as any).id_op_fk)
    return { remesa: true, ops: vigentes.length }
  }

  const { error: e1 } = await dbComp.from('cxp_abonos').update({ fecha_abono: fecha, ...auditoria }).eq('id', idAbono)
  if (e1) throw new Error('No se pudo actualizar la fecha del pago: ' + e1.message)

  // Cargo bancario vigente de este abono (el más reciente, por si hubo ediciones de monto/cuenta).
  const { data: movs, error: e2 } = await dbComp.from('movimientos_bancarios')
    .select('id').eq('id_abono_fk', idAbono).eq('tipo', 'Cargo').order('id', { ascending: false }).limit(1)
  if (e2) throw new Error('No se pudo leer el movimiento bancario: ' + e2.message)
  if (movs && movs.length > 0) {
    const { error: e3 } = await dbComp.from('movimientos_bancarios').update({ fecha_movimiento: fecha }).eq('id', (movs[0] as any).id)
    if (e3) throw new Error('No se pudo actualizar el movimiento bancario: ' + e3.message)
  }

  await sincronizarFechaPagoOP((abono as any).id_op_fk)
  return { remesa: false, ops: 1 }
}
