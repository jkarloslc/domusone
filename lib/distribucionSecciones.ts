import { dbCtrl, dbCat, dbCfg, dbGolf } from '@/lib/supabase'
import { clasificarBanda, periodoDesdeNombre } from '@/lib/clasificacionCobranza'

// ── Distribución por SECCIÓN de un recibo de ingreso derivado de cobranza ──
//
// Hermano de distribuirConceptosRecibo (app/golf/pos/distribucionIngreso.ts),
// para los centros con tipo_desglose = 'secciones' — hoy solo
// "Mantto. Fraccionamiento [Cuotas]", el 52% del ingreso.
//
// POR QUÉ NO SE ARMA DESDE LAS LÍNEAS DEL POS
// distribuirConceptosRecibo agrupa ctrl_ventas_det por concepto, y eso funciona
// porque el concepto viene en la propia línea. La sección NO: las líneas del
// ticket que genera app/cobranza/ReciboModal.tsx no llevan id_cargo_fk, así que
// desde el POS no hay camino de vuelta al lote ni a su sección.
//
// El camino que sí existe es el inverso: ctrl.recibos.id_venta_pos_fk apunta al
// ticket, y ctrl.recibos_detalle sí trae id_cargo_fk y el periodo de cada cuota
// cobrada. Así que la distribución se arma desde la COBRANZA, no desde el POS:
//   ventas del corte → ctrl.recibos (por id_venta_pos_fk)
//   → recibos_detalle (periodo + cargo) → cargo/recibo → lote → sección
//
// LO QUE ESTO HABILITA
// Como el periodo de cada cuota viene en el detalle, las tres bandas de
// clasificación (vencido / corriente / anticipado) se calculan solas contra la
// fecha de pago. Es decir: en los meses derivados ya NO hay que capturarlas a
// mano — la captura de F2 (migración 20260920180000) queda como el puente para
// los meses anteriores al corte.
//
// El IVA se extrae con la tasa del producto ligado a la cuota, igual que en el
// resto de la cadena. Para la Cuota de Mantenimiento son 16% desde la migración
// 20260920220000 (antes el catálogo decía 0% y estaba mal).

export type ResultadoDistribucionSecciones = {
  filas: number
  montoDistribuido: number
  /** Monto de cobranza que no se pudo ligar a una sección. */
  montoSinSeccion: number
  avisos: string[]
  errores: string[]
}

const vacio = (): ResultadoDistribucionSecciones =>
  ({ filas: 0, montoDistribuido: 0, montoSinSeccion: 0, avisos: [], errores: [] })

export async function distribuirSeccionesRecibo(
  idRecibo: number,
  idCentroIngreso: number,
  ventaIds: number[],
): Promise<ResultadoDistribucionSecciones> {
  const out = vacio()
  if (!ventaIds.length) return out

  const { data: centro, error: eCentro } = await dbCfg.from('centros_ingreso')
    .select('tipo_desglose').eq('id', idCentroIngreso).maybeSingle()
  if (eCentro) { out.errores.push(`centros_ingreso: ${eCentro.message}`); return out }
  if ((centro as any)?.tipo_desglose !== 'secciones') return out

  // ── Cobranza que originó estas ventas ───────────────────────────────────
  const { data: recibosCob, error: eRec } = await dbCtrl.from('recibos')
    .select('id, folio, fecha_recibo, fecha_pago, id_lote_fk, id_venta_pos_fk, activo')
    .in('id_venta_pos_fk', ventaIds)
    .eq('activo', true)
  if (eRec) { out.errores.push(`recibos (cobranza): ${eRec.message}`); return out }
  const recibos = (recibosCob ?? []) as any[]
  if (!recibos.length) {
    out.avisos.push('Ninguna venta del corte viene de un recibo de cobranza activo: no hay desglose por sección que generar.')
    return out
  }

  const { data: detalles, error: eDet } = await dbCtrl.from('recibos_detalle')
    .select('id, id_recibo_fk, concepto, total, periodo_mes, periodo_anio, id_cargo_fk')
    .in('id_recibo_fk', recibos.map(r => r.id))
  if (eDet) { out.errores.push(`recibos_detalle: ${eDet.message}`); return out }

  // ── Sección de cada lote (cat.lotes y cfg.secciones viven en schemas
  // distintos, así que no hay embed posible: dos consultas) ───────────────
  const idsLote = Array.from(new Set(recibos.map(r => r.id_lote_fk).filter(Boolean))) as number[]
  const seccionDeLote = new Map<number, number | null>()
  if (idsLote.length) {
    const { data: lotes, error: eLotes } = await dbCat.from('lotes')
      .select('id, id_seccion_fk').in('id', idsLote)
    if (eLotes) { out.errores.push(`lotes: ${eLotes.message}`); return out }
    for (const l of (lotes ?? []) as any[]) seccionDeLote.set(l.id, l.id_seccion_fk ?? null)
  }
  const { data: secs, error: eSecs } = await dbCfg.from('secciones').select('id, nombre')
  if (eSecs) { out.errores.push(`secciones: ${eSecs.message}`); return out }
  const nombreSeccion = new Map<number, string>(((secs ?? []) as any[]).map(s => [s.id, s.nombre]))

  // ── Tasa de IVA de la cuota ─────────────────────────────────────────────
  // Del producto ligado a la cuota estándar, nunca hardcodeada: así cambiar la
  // tasa es cambiar el catálogo (fue justo lo que permitió corregir el 0% que
  // traía mal la Cuota de Mantenimiento sin tocar código).
  const { data: cuotas } = await dbCfg.from('cuotas_estandar')
    .select('id, id_producto_pos_fk').eq('activo', true)
  const idsProd = Array.from(new Set(((cuotas ?? []) as any[])
    .map(c => c.id_producto_pos_fk).filter((x): x is number => x != null)))
  const { data: prods } = idsProd.length
    ? await dbGolf.from('cat_productos_pos').select('id, iva_pct, aplica_iva').in('id', idsProd)
    : { data: [] as any[] }
  const pctPorProducto = new Map<number, number>(((prods ?? []) as any[])
    .map(p => [p.id, p.aplica_iva === false ? 0 : (Number(p.iva_pct) || 0)]))
  // Las cuotas activas comparten tasa en la práctica; si hubiera más de una se
  // toma la de la primera y se avisa, en vez de mezclarlas en silencio.
  const tasas = Array.from(new Set(Array.from(pctPorProducto.values())))
  if (tasas.length > 1) {
    out.avisos.push(`Las cuotas activas tienen tasas de IVA distintas (${tasas.join('%, ')}%). Se usa ${tasas[0]}% para el desglose por sección; revisa el catálogo de productos.`)
  }
  const ivaPct = tasas.length ? tasas[0] : 0

  // ── Agregación por sección × banda ──────────────────────────────────────
  const reciboPorId = new Map<number, any>(recibos.map(r => [r.id, r]))
  type Acum = { monto: number; vencido: number; corriente: number; anticipado: number }
  const porSeccion = new Map<number, Acum>()
  const nuevo = (): Acum => ({ monto: 0, vencido: 0, corriente: 0, anticipado: 0 })

  for (const d of (detalles ?? []) as any[]) {
    const rec = reciboPorId.get(d.id_recibo_fk)
    if (!rec) continue
    const monto = Number(d.total) || 0
    if (monto === 0) continue

    const idSeccion = rec.id_lote_fk ? seccionDeLote.get(rec.id_lote_fk) ?? null : null
    if (idSeccion == null) { out.montoSinSeccion += monto; continue }

    if (!porSeccion.has(idSeccion)) porSeccion.set(idSeccion, nuevo())
    const acum = porSeccion.get(idSeccion)!
    acum.monto += monto

    // Las bandas salen del periodo de la cuota contra la fecha de pago — la
    // misma regla de lib/clasificacionCobranza que usan los reportes.
    const fechaPago = (rec.fecha_pago ?? rec.fecha_recibo) as string | null
    const periodo = periodoDesdeNombre(d.periodo_mes, d.periodo_anio)
    if (fechaPago) {
      const banda = clasificarBanda(periodo, fechaPago)
      if (banda === 'VENCIDA')         acum.vencido += monto
      else if (banda === 'CORRIENTE')  acum.corriente += monto
      else if (banda === 'ANTICIPADA') acum.anticipado += monto
      // OTROS (líneas sin periodo: cargos adicionales) no entra en ninguna
      // banda a propósito: se ve como "sin clasificar" en el reporte, que es
      // exactamente lo que es.
    }
  }

  if (out.montoSinSeccion > 0) {
    out.avisos.push(`${out.montoSinSeccion.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} de cobranza no se pudo ligar a una sección (recibo sin lote o lote sin sección). No se reparte: queda como diferencia visible contra el total del recibo.`)
  }

  const r2 = (v: number) => Math.round(v * 100) / 100
  const filas = Array.from(porSeccion.entries())
    .filter(([, a]) => a.monto !== 0)
    .map(([idSeccion, a]) => {
      const subtotal = ivaPct > 0 ? r2(a.monto / (1 + ivaPct / 100)) : a.monto
      return {
        id_recibo_fk:     idRecibo,
        id_seccion_fk:    idSeccion,
        nombre_seccion:   nombreSeccion.get(idSeccion) ?? `Sección ${idSeccion}`,
        monto:            r2(a.monto),
        subtotal,
        iva:              r2(a.monto - subtotal),
        monto_vencido:    r2(a.vencido),
        monto_corriente:  r2(a.corriente),
        monto_anticipado: r2(a.anticipado),
        notas:            'Derivado de cobranza',
      }
    })

  if (!filas.length) return out

  const { error } = await dbCtrl.from('recibos_ingreso_secciones').insert(filas)
  if (error) { out.errores.push(`recibos_ingreso_secciones: ${error.message}`); return out }

  out.filas = filas.length
  out.montoDistribuido = r2(filas.reduce((a, f) => a + f.monto, 0))
  return out
}
