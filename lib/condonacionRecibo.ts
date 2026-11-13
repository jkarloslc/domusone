import { dbCtrl } from '@/lib/supabase'

/**
 * Condonación / Intercambio en recibos de ingreso: NO suma en ningún lado
 * (migración 20261114120000).
 *
 * Las líneas (recibos_ingreso_conceptos / _secciones) se guardan con el monto
 * capturado (bruto) y luego esta función las deja NETAS:
 *   línea.monto           = parte cobrada (cuenta en el Real, reportes, Flujo)
 *   línea.monto_condonado = parte condonada (informativa)
 *   recibo.monto_total    = total neto;  recibo.monto_condonacion = condonación
 * La condonación se reparte entre las líneas en proporción a su monto;
 * subtotal/IVA conservan la proporción de cada línea (respeta exentas).
 * monto + monto_condonado = lo capturado: así el recibo se puede volver a editar.
 */

const r2 = (n: number) => Math.round(n * 100) / 100

type Linea = {
  id: number; monto: number; monto_condonado: number | null; subtotal: number | null; iva: number | null
  monto_vencido: number | null; monto_corriente: number | null; monto_anticipado: number | null
}

/** `totalBruto`: total capturado; solo se usa si el recibo no tiene líneas (centros sin desglose). */
export async function netearCondonacion(idRecibo: number, condonacion: number, totalBruto?: number): Promise<void> {
  const sel = 'id, monto, monto_condonado, subtotal, iva, monto_vencido, monto_corriente, monto_anticipado'
  const [{ data: c, error: e1 }, { data: s, error: e2 }] = await Promise.all([
    dbCtrl.from('recibos_ingreso_conceptos').select(sel).eq('id_recibo_fk', idRecibo),
    dbCtrl.from('recibos_ingreso_secciones').select(sel).eq('id_recibo_fk', idRecibo),
  ])
  if (e1 || e2) throw new Error(e1?.message ?? e2?.message)
  const lineas = [
    ...((c ?? []) as Linea[]).map(l => ({ ...l, tabla: 'recibos_ingreso_conceptos' as const })),
    ...((s ?? []) as Linea[]).map(l => ({ ...l, tabla: 'recibos_ingreso_secciones' as const })),
  ]
  // Bruto de cada línea = lo capturado (si ya estaba neteada, se reconstruye)
  const brutoDe = (l: Linea) => Number(l.monto) + Number(l.monto_condonado ?? 0)
  const brutoTotal = r2(lineas.reduce((a, l) => a + brutoDe(l), 0))
  const { data: rec } = await dbCtrl.from('recibos_ingreso').select('monto_total, monto_condonacion').eq('id', idRecibo).single()
  const brutoRecibo = lineas.length ? brutoTotal : r2(totalBruto ?? (Number(rec?.monto_total ?? 0) + Number(rec?.monto_condonacion ?? 0)))
  const cond = Math.min(Math.max(r2(condonacion || 0), 0), brutoRecibo)

  let asignado = 0
  const ordenadas = [...lineas].sort((a, b) => brutoDe(b) - brutoDe(a))
  for (let i = 0; i < ordenadas.length; i++) {
    const l = ordenadas[i]
    const bruto = brutoDe(l)
    // La última línea absorbe el redondeo para que la suma condonada sea exacta
    const condLinea = i === ordenadas.length - 1 ? r2(cond - asignado) : (brutoTotal ? r2(cond * bruto / brutoTotal) : 0)
    asignado = r2(asignado + condLinea)
    const neto = r2(bruto - condLinea)
    // subtotal/IVA: misma proporción que tenía la línea sobre su bruto
    const brutoAnterior = Number(l.monto) || 0
    const ratioSub = brutoAnterior ? Number(l.subtotal ?? l.monto) / brutoAnterior : 1
    const subtotal = r2(neto * ratioSub)
    const f = brutoAnterior ? neto / brutoAnterior : 0
    const escala = (v: number | null) => v == null ? null : r2(Number(v) * f)
    const { error } = await dbCtrl.from(l.tabla).update({
      monto: neto, monto_condonado: condLinea, subtotal, iva: r2(neto - subtotal),
      monto_vencido: escala(l.monto_vencido), monto_corriente: escala(l.monto_corriente), monto_anticipado: escala(l.monto_anticipado),
    }).eq('id', l.id)
    if (error) throw new Error(error.message)
  }

  const { error } = await dbCtrl.from('recibos_ingreso')
    .update({ monto_total: r2(brutoRecibo - cond), monto_condonacion: cond }).eq('id', idRecibo)
  if (error) throw new Error(error.message)
}

/** ¿La forma de pago es Condonación / Intercambio / Remisión de deuda (no es caja)? */
export const esFormaCondonacion = (nombre: string | null | undefined) =>
  !!nombre && /condon|intercambio|remisi/i.test(nombre)
