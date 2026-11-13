import { dbCtrl, dbComp } from '@/lib/supabase'

/**
 * Saldos de efectivo para Flujo de Efectivo (migración 20261113150000).
 *
 * Saldo calculado: se encadena día con día —
 *   inicial(d) = saldo inicial capturado en d  ??  final(d-1)
 *   final(d)   = inicial(d) + ingresos(d) − egresos(d)
 * Saldo real (para conciliar contra el calculado), por prioridad de fuente:
 *   1. 'banco'      estado de cuenta importado (comp.flujo_mov_banco): último
 *                   saldo del día por cuenta, sumado. Se activa solo con datos.
 *   2. 'tesoreria'  comp.movimientos_bancarios (saldo_despues). APAGADA:
 *                   hoy solo registra pagos (los ingresos no se depositan a
 *                   cuenta) y daría saldos negativos falsos. Encender con
 *                   TESORERIA_LISTA cuando el proceso corra al día.
 *   3. 'manual'     captura en ctrl.flujo_saldos (tipo 'real').
 * Todo es consolidado (todas las cuentas); id_cuenta_bancaria_fk queda listo
 * para capturar por cuenta.
 */

export const TESORERIA_LISTA = false

export type FuenteSaldo = 'manual' | 'banco' | 'tesoreria'
export type SaldoCapturado = { id: number; tipo: 'inicial' | 'real'; fecha: string; monto: number; notas: string | null }
export type SaldosFuente = {
  capturados: SaldoCapturado[]
  /** fecha → saldo real del día y su fuente (banco/tesorería/manual, ya resuelto por prioridad) */
  real: Map<string, { monto: number; fuente: FuenteSaldo }>
  fuentesActivas: FuenteSaldo[]
}

export type DiaSaldo = {
  fecha: string; ingresos: number; egresos: number; neto: number
  inicial: number; final: number
  inicialCapturado: boolean
  real: number | null; fuenteReal: FuenteSaldo | null; diferencia: number | null
}

const pad = (n: number) => String(n).padStart(2, '0')
export const fechaISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
export const diasDelMes = (y: number, m: number) => new Date(y, m, 0).getDate()

/** Último saldo de cada día por cuenta, sumado entre cuentas. */
function saldoDiarioPorCuenta(rows: { id_cuenta_fk: number | null; fecha: string; saldo: number | null; orden: number }[]) {
  const ultimo = new Map<string, { saldo: number; orden: number }>()   // `${cuenta}|${fecha}`
  for (const r of rows) {
    if (r.saldo == null) continue
    const k = `${r.id_cuenta_fk ?? 0}|${r.fecha}`
    const prev = ultimo.get(k)
    if (!prev || r.orden >= prev.orden) ultimo.set(k, { saldo: Number(r.saldo), orden: r.orden })
  }
  const porDia = new Map<string, number>()
  ultimo.forEach((v, k) => { const f = k.split('|')[1]; porDia.set(f, (porDia.get(f) ?? 0) + v.saldo) })
  return porDia
}

export async function cargarSaldos(anio: number): Promise<SaldosFuente> {
  const ini = `${anio}-01-01`, fin = `${anio}-12-31`
  const [{ data: cap }, { data: banco }, tes] = await Promise.all([
    dbCtrl.from('flujo_saldos').select('id, tipo, fecha, monto, notas')
      .is('id_cuenta_bancaria_fk', null).gte('fecha', ini).lte('fecha', fin).order('fecha'),
    dbComp.from('flujo_mov_banco').select('id, id_cuenta_fk, fecha, saldo').gte('fecha', ini).lte('fecha', fin),
    TESORERIA_LISTA
      ? dbComp.from('movimientos_bancarios').select('id, id_cuenta_fk, fecha_movimiento, saldo_despues')
          .gte('fecha_movimiento', ini).lte('fecha_movimiento', fin)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const capturados = ((cap ?? []) as any[]).map(r => ({ ...r, monto: Number(r.monto) })) as SaldoCapturado[]

  const real = new Map<string, { monto: number; fuente: FuenteSaldo }>()
  capturados.filter(c => c.tipo === 'real').forEach(c => real.set(c.fecha, { monto: c.monto, fuente: 'manual' }))
  const fuentesActivas: FuenteSaldo[] = ['manual']

  const tesRows = ((tes as any).data ?? []) as any[]
  if (tesRows.length) {
    fuentesActivas.push('tesoreria')
    saldoDiarioPorCuenta(tesRows.map(r => ({ id_cuenta_fk: r.id_cuenta_fk, fecha: String(r.fecha_movimiento).slice(0, 10), saldo: r.saldo_despues, orden: r.id })))
      .forEach((v, f) => real.set(f, { monto: v, fuente: 'tesoreria' }))
  }
  const bancoRows = (banco ?? []) as any[]
  if (bancoRows.length) {
    fuentesActivas.push('banco')
    saldoDiarioPorCuenta(bancoRows.map(r => ({ id_cuenta_fk: r.id_cuenta_fk, fecha: String(r.fecha).slice(0, 10), saldo: r.saldo, orden: r.id })))
      .forEach((v, f) => real.set(f, { monto: v, fuente: 'banco' }))
  }
  return { capturados, real, fuentesActivas }
}

/**
 * Serie diaria del año: ingresos/egresos por día (`movs`, fecha → montos),
 * saldo encadenado y saldo real con diferencia.
 */
export function serieDiaria(anio: number, movs: Map<string, { ingresos: number; egresos: number }>, saldos: SaldosFuente): DiaSaldo[] {
  const iniciales = new Map(saldos.capturados.filter(c => c.tipo === 'inicial').map(c => [c.fecha, c.monto]))
  const out: DiaSaldo[] = []
  let prevFinal = 0
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= diasDelMes(anio, m); d++) {
      const fecha = fechaISO(anio, m, d)
      const mv = movs.get(fecha) ?? { ingresos: 0, egresos: 0 }
      const cap = iniciales.get(fecha)
      const inicial = cap ?? prevFinal
      const neto = mv.ingresos - mv.egresos
      const final = inicial + neto
      const r = saldos.real.get(fecha) ?? null
      out.push({
        fecha, ingresos: mv.ingresos, egresos: mv.egresos, neto, inicial, final,
        inicialCapturado: cap != null,
        real: r ? r.monto : null, fuenteReal: r ? r.fuente : null,
        diferencia: r ? r.monto - final : null,
      })
      prevFinal = final
    }
  }
  return out
}

/** Resumen de un periodo (días consecutivos de la serie). */
export function resumenPeriodo(dias: DiaSaldo[]) {
  if (dias.length === 0) return null
  const conReal = [...dias].reverse().find(d => d.real != null) ?? null
  return {
    inicial: dias[0].inicial,
    inicialCapturado: dias[0].inicialCapturado,
    ingresos: dias.reduce((s, d) => s + d.ingresos, 0),
    egresos: dias.reduce((s, d) => s + d.egresos, 0),
    neto: dias.reduce((s, d) => s + d.neto, 0),
    final: dias[dias.length - 1].final,
    real: conReal?.real ?? null,
    fechaReal: conReal?.fecha ?? null,
    fuenteReal: conReal?.fuenteReal ?? null,
    diferencia: conReal ? conReal.diferencia : null,
    /** Saldo calculado del MISMO día del saldo real (contra el que se mide la diferencia). */
    finalAlReal: conReal ? conReal.final : null,
  }
}

/** Guarda (o borra, con monto null) un saldo capturado consolidado. */
export async function guardarSaldo(tipo: 'inicial' | 'real', fecha: string, monto: number | null, usuario: string, notas?: string | null) {
  const { error: e1 } = await dbCtrl.from('flujo_saldos').delete().eq('tipo', tipo).eq('fecha', fecha).is('id_cuenta_bancaria_fk', null)
  if (e1) throw new Error(e1.message)
  if (monto == null) return
  const { error } = await dbCtrl.from('flujo_saldos').insert({ tipo, fecha, monto, notas: notas ?? null, updated_by: usuario })
  if (error) throw new Error(error.message)
}

/** Saldos que se muestran como filas en el estado de resultados (Árbol / Por unidad). */
export type SaldosFila = { inicial: number; final: number; real: number | null; diferencia: number | null; finalAlReal?: number | null; fechaReal?: string | null }

const $ = (n: number) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-MX', { maximumFractionDigits: 0 })

/**
 * Diferencia sin conciliar = saldo real − saldo calculado (del mismo día).
 * + → en el banco hay MÁS de lo que explican los movimientos registrados
 *     (ingresos sin registrar, egresos registrados de más o un saldo inicial bajo).
 * − → en el banco hay MENOS (egresos sin registrar, ingresos registrados de más).
 * Texto con la operación completa para que el signo no se preste a confusión
 * cuando el calculado es negativo (restar un negativo suma).
 */
export function explicaDiferencia(s: SaldosFila | null | undefined): string | null {
  if (!s || s.real == null || s.diferencia == null) return null
  const calc = s.finalAlReal ?? s.final
  const sentido = Math.abs(s.diferencia) < 1 ? 'conciliado'
    : s.diferencia > 0 ? 'hay más en banco que lo registrado' : 'hay menos en banco que lo registrado'
  const cal = calc < 0 ? `(${$(calc)})` : $(calc)
  const dia = s.fechaReal ? ` al ${new Date(s.fechaReal + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}` : ''
  return `${$(s.real)} real − ${cal} calculado${dia} = ${s.diferencia > 0 ? '+' : ''}${$(s.diferencia)} · ${sentido}`
}

export const FUENTE_LABEL: Record<FuenteSaldo, string> = { manual: 'Manual', banco: 'Estado de cuenta', tesoreria: 'Tesorería' }
