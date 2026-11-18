// Estado de cuenta tipo bancario (Golf / Hípico).
//
// Arma un libro de movimientos a partir de las cuotas (cxc) y los recibos
// vigentes de un titular:
//   Cargo  = cuota no cancelada (monto_final) en su fecha de emisión,
//            + líneas de recibo sin cuota (consumos / venta directa).
//   Abono  = recibo vigente (total cobrado) en su fecha de recibo.
//   Ajuste = diferencia entre lo que la cuota da por aplicado
//            (monto_final − saldo) y lo cobrado en recibos para esa cuota.
//            Positivo → bonificación / descuento al cobro (abono);
//            negativo → pago duplicado sobre cuota ya cubierta (cargo).
// Con los ajustes, el saldo del libro siempre cuadra con el saldo de las cuotas.

export type CuotaLibro = {
  id: number
  concepto: string
  tipo?: string | null
  periodo: string | null
  monto_final: number
  saldo: number | null
  status: string
  fecha_emision: string | null
  fecha_vencimiento: string | null
  fecha_pago: string | null
  id_recibo_fk?: number | null
}

export type ReciboLibro = {
  id: number
  folio: string
  fecha_recibo: string
  total: number
  forma_pago_nombre: string | null
  referencia_pago: string | null
  det: { id_cuota_fk: number | null; concepto: string; monto_final: number }[]
}

export type Movimiento = {
  key: string
  fecha: string
  referencia: string
  concepto: string
  detalle?: string
  cargo: number
  abono: number
  clase: 'cuota' | 'consumo' | 'pago' | 'bonificacion' | 'ajuste'
  saldo: number // saldo corrido, se llena al ordenar
}

export type CuotaAlCorte = CuotaLibro & { saldoCorte: number; vencida: boolean }

export type EstadoCuenta = {
  saldoAnterior: number
  movimientos: Movimiento[]       // solo los del periodo, con saldo corrido
  cargos: number
  pagos: number
  bonificaciones: number          // abonos no monetarios (neto de ajustes de cargo)
  ajustesCargo: number
  saldoFinal: number
  pendientes: CuotaAlCorte[]      // cuotas con saldo al corte
  vencido: number
  porVencer: number
}

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => Number(v ?? 0) || 0

// Fecha del cargo: el vencimiento. La emisión no sirve: las cuotas se generan
// meses por adelantado (Hípico ago–dic emitidas el 14-jun, 2027 el 4-nov) y
// las cargas históricas tienen emisión posterior al vencimiento.
const fechaCargo = (c: CuotaLibro) => c.fecha_vencimiento ?? c.fecha_emision

const ORDEN_CLASE: Record<Movimiento['clase'], number> = {
  cuota: 0, consumo: 1, ajuste: 2, pago: 3, bonificacion: 4,
}

export function construirEstadoCuenta(
  cuotas: CuotaLibro[], recibos: ReciboLibro[], desde: string, hasta: string,
  etiquetaTipo: (c: CuotaLibro) => string = c => c.concepto,
): EstadoCuenta {
  const todos: Movimiento[] = []
  const reciboPorId = new Map(recibos.map(r => [r.id, r]))

  // Pagos de recibos por cuota (con fecha) — para ajustes y saldo al corte
  const pagosCuota = new Map<number, { fecha: string; monto: number }[]>()
  for (const r of recibos) {
    for (const d of r.det) {
      if (d.id_cuota_fk == null) continue
      const arr = pagosCuota.get(d.id_cuota_fk) ?? []
      arr.push({ fecha: r.fecha_recibo, monto: num(d.monto_final) })
      pagosCuota.set(d.id_cuota_fk, arr)
    }
  }

  const ajusteCuota = new Map<number, { fecha: string; monto: number }>()

  for (const c of cuotas) {
    const cancelada = c.status === 'CANCELADO'
    const mf = cancelada ? 0 : num(c.monto_final)
    const fecha = fechaCargo(c)
    if (!fecha) continue
    if (mf > 0) {
      todos.push({
        key: `c${c.id}`, fecha, referencia: c.periodo ?? '', clase: 'cuota',
        concepto: c.concepto, detalle: etiquetaTipo(c), cargo: r2(mf), abono: 0, saldo: 0,
      })
    }
    const saldoAct = cancelada ? 0 : (c.saldo != null ? num(c.saldo) : (c.status === 'PAGADO' ? 0 : mf))
    const pagado = (pagosCuota.get(c.id) ?? []).reduce((s, p) => s + p.monto, 0)
    const ajuste = r2(mf - saldoAct - pagado)
    if (Math.abs(ajuste) >= 0.01) {
      const rec = c.id_recibo_fk != null ? reciboPorId.get(c.id_recibo_fk) : undefined
      const fechas = (pagosCuota.get(c.id) ?? []).map(p => p.fecha).sort()
      const fAj = c.fecha_pago ?? rec?.fecha_recibo ?? fechas[fechas.length - 1] ?? fecha
      ajusteCuota.set(c.id, { fecha: fAj, monto: ajuste })
      todos.push({
        key: `a${c.id}`, fecha: fAj, referencia: rec?.folio ?? (c.periodo ?? ''),
        clase: ajuste > 0 ? 'bonificacion' : 'ajuste',
        concepto: ajuste > 0 ? 'Bonificación / descuento al cobro' : 'Ajuste: pago duplicado sobre cuota ya cubierta',
        detalle: c.concepto,
        cargo: ajuste < 0 ? -ajuste : 0, abono: ajuste > 0 ? ajuste : 0, saldo: 0,
      })
    }
  }

  for (const r of recibos) {
    r.det.forEach((d, i) => {
      if (d.id_cuota_fk != null || num(d.monto_final) === 0) return
      todos.push({
        key: `v${r.id}-${i}`, fecha: r.fecha_recibo, referencia: r.folio, clase: 'consumo',
        concepto: d.concepto || 'Consumo', detalle: 'Venta directa',
        cargo: r2(num(d.monto_final)), abono: 0, saldo: 0,
      })
    })
    if (num(r.total) === 0) continue
    const conceptos = r.det.map(d => d.concepto).filter(Boolean)
    todos.push({
      key: `r${r.id}`, fecha: r.fecha_recibo, referencia: r.folio, clase: 'pago',
      concepto: `Pago${r.forma_pago_nombre ? ' · ' + r.forma_pago_nombre : ''}${r.referencia_pago ? ' · Ref. ' + r.referencia_pago : ''}`,
      detalle: conceptos.length > 3 ? `${conceptos.slice(0, 3).join(', ')} y ${conceptos.length - 3} más` : conceptos.join(', '),
      cargo: 0, abono: r2(num(r.total)), saldo: 0,
    })
  }

  todos.sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1
      : ORDEN_CLASE[a.clase] - ORDEN_CLASE[b.clase] || a.referencia.localeCompare(b.referencia))

  let saldoAnterior = 0
  const movimientos: Movimiento[] = []
  for (const m of todos) {
    if (m.fecha > hasta) continue
    if (m.fecha < desde) { saldoAnterior = r2(saldoAnterior + m.cargo - m.abono); continue }
    movimientos.push(m)
  }
  let corrido = saldoAnterior
  for (const m of movimientos) { corrido = r2(corrido + m.cargo - m.abono); m.saldo = corrido }

  const sum = (f: (m: Movimiento) => number) => r2(movimientos.reduce((s, m) => s + f(m), 0))
  const cargos = sum(m => (m.clase === 'cuota' || m.clase === 'consumo') ? m.cargo : 0)
  const ajustesCargo = sum(m => m.clase === 'ajuste' ? m.cargo : 0)
  const pagos = sum(m => m.clase === 'pago' ? m.abono : 0)
  const bonificaciones = sum(m => m.clase === 'bonificacion' ? m.abono : 0)

  // Saldo por cuota al corte
  const pendientes: CuotaAlCorte[] = []
  for (const c of cuotas) {
    if (c.status === 'CANCELADO') continue
    const fecha = fechaCargo(c)
    if (!fecha || fecha > hasta) continue
    const pag = (pagosCuota.get(c.id) ?? []).filter(p => p.fecha <= hasta).reduce((s, p) => s + p.monto, 0)
    const aj = ajusteCuota.get(c.id)
    const saldoCorte = r2(num(c.monto_final) - pag - (aj && aj.fecha <= hasta ? aj.monto : 0))
    if (saldoCorte > 0.009) {
      pendientes.push({ ...c, saldoCorte, vencida: !!c.fecha_vencimiento && c.fecha_vencimiento < hasta })
    }
  }
  pendientes.sort((a, b) => (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? ''))

  return {
    saldoAnterior, movimientos, cargos, pagos, bonificaciones, ajustesCargo,
    saldoFinal: corrido,
    pendientes,
    vencido: r2(pendientes.filter(p => p.vencida).reduce((s, p) => s + p.saldoCorte, 0)),
    porVencer: r2(pendientes.filter(p => !p.vencida).reduce((s, p) => s + p.saldoCorte, 0)),
  }
}
