// ── Capa de datos unificada de cobranza de cuotas ─────────────────────────
//
// Los cuatro módulos que llevan cuotas con periodo tienen subcuentas con la
// misma forma pero en tablas y schemas distintos:
//
//   Fraccionamiento  ctrl.cargos        + ctrl.recibos / recibos_detalle
//   Club Golf        golf.cxc_golf
//   Hípico           hip.cxc_hip
//   Locales          ctrl.loc_cxc
//
// Este módulo las normaliza a las dos medidas de lib/clasificacionCobranza.ts
// (devengado del periodo y cobro aplicado) para que reportes, comparativo y
// dashboard midan todos sobre la misma base.
//
// Una diferencia estructural que obliga a tratar Fraccionamiento aparte:
// cxc_golf / cxc_hip / loc_cxc guardan `fecha_pago` en la propia cuota,
// mientras ctrl.cargos NO la tiene — ahí la fecha del pago vive en el recibo
// (ctrl.recibos) y la aplicación por periodo en ctrl.recibos_detalle. Por eso
// el devengado de Fraccionamiento sale de `cargos` y su cobro de
// `recibos_detalle`.
//
// Limitación conocida de las tablas cxc_*: solo guardan UNA `fecha_pago` por
// cuota, así que una cuota liquidada en dos abonos se atribuye completa a la
// fecha del último. Afecta únicamente a PAGO_PARCIAL (8 cuotas en Golf al
// 2026-09-20, $13,781 de saldo). Fraccionamiento no tiene ese problema porque
// cada aplicación es una fila de recibos_detalle.

import { dbCtrl, dbCat, dbGolf, dbHip, dbCfg } from '@/lib/supabase'
import {
  clasificarBanda, esCargaInicial, periodoDesdeNombre, claveArranque,
  MODULOS_CUOTAS,
  type ArranqueOperativo, type CobroAplicado, type CobroSinFecha, type CuotaDevengada,
  type ModuloCuotas,
} from '@/lib/clasificacionCobranza'

// PostgREST corta en 1000 filas por respuesta; hay que paginar o se pierde
// silenciosamente el resto (los reportes que no paginan quedan cortos sin avisar).
async function traerTodo(build: (desde: number, hasta: number) => any): Promise<{ rows: any[]; error: string | null }> {
  const out: any[] = []
  const tam = 1000
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await build(desde, desde + tam - 1)
    if (error) return { rows: out, error: error.message }
    const lote = (data ?? []) as any[]
    out.push(...lote)
    if (lote.length < tam) break
  }
  return { rows: out, error: null }
}

/** Fechas de arranque operativo por módulo (cfg.configuracion). */
export async function fetchArranqueOperativo(): Promise<ArranqueOperativo> {
  const claves = MODULOS_CUOTAS.map(claveArranque)
  const { data } = await dbCfg.from('configuracion').select('clave, valor').in('clave', claves)
  const out: ArranqueOperativo = {}
  for (const m of MODULOS_CUOTAS) {
    const row = (data ?? []).find((r: any) => r.clave === claveArranque(m))
    const val = (row?.valor ?? '').trim()
    if (val) out[m] = val
  }
  return out
}

const nombrePersona = (p: any): string => {
  if (!p) return '—'
  if (p.razon_social) return p.razon_social
  const num = p.numero_socio ? `${p.numero_socio} — ` : ''
  const n = [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ')
  return (num + n).trim() || '—'
}

// Lo realmente cobrado de una cuota cxc_*: PAGADO cobra el total; PAGO_PARCIAL
// cobra el total menos el saldo; el resto no ha cobrado nada.
const cobradoCxc = (c: any): number => {
  const monto = Number(c.monto_final) || 0
  if (c.status === 'PAGADO') return monto
  if (c.status === 'PAGO_PARCIAL') return monto - (Number(c.saldo) || 0)
  return 0
}

const LINEA_GOLF: Record<string, string> = {
  MENSUALIDAD:     'Membresías',
  INSCRIPCION:     'Inscripciones',
  PENSION_CARRITO: 'Pensión Carrito',
}
const LINEA_LOCALES: Record<string, string> = {
  RENTA_LOCAL:      'Renta Local',
  SERVICIOS_MANTTO: 'Mantenimiento',
}

export type ResultadoCobranza = {
  devengado: CuotaDevengada[]
  cobrado: CobroAplicado[]
  /** Abonos sin fecha de pago: no ubicables en un mes, se reportan aparte. */
  cobrosSinFecha: CobroSinFecha[]
  arranque: ArranqueOperativo
  /** Módulos consultados que devolvieron datos. */
  modulosConDatos: ModuloCuotas[]
  /** Avisos para mostrar en pantalla (no son errores). */
  avisos: string[]
  /** Errores de consulta — nunca se tragan en silencio. */
  errores: string[]
}

/**
 * Trae la cobranza de cuotas completa y normalizada.
 *
 * Trae TODO el histórico de cada subcuenta en vez de filtrar por año en la
 * consulta, y filtra después en memoria. Es a propósito: el puente
 * devengado→caja de un año necesita también los pagos hechos en OTROS años
 * para periodos de ese año (el pago anualizado de enero cubre meses que a su
 * vez pueden haberse cobrado el año anterior). Filtrar en SQL obligaría a un
 * `.or()` anidado por cada tabla; los volúmenes son chicos (3,642 cuotas en
 * Golf al 2026-09-20) y así el cálculo del puente queda exacto.
 */
export async function fetchCobranzaCuotas(modulos: ModuloCuotas[] = MODULOS_CUOTAS): Promise<ResultadoCobranza> {
  const devengado: CuotaDevengada[] = []
  const cobrado: CobroAplicado[] = []
  const cobrosSinFecha: CobroSinFecha[] = []
  const avisos: string[] = []
  const errores: string[] = []
  const modulosConDatos: ModuloCuotas[] = []

  const arranque = await fetchArranqueOperativo()

  // ── Conceptos de ingreso autoritativos ──────────────────────────────────
  // Se leen del catálogo en vez de mapearse por clave en código: las claves
  // ya se han renombrado varias veces en este proyecto y un mapa hardcodeado
  // rompe en silencio.
  const [cuotasCfgGolf, carritosCfg, cuotasEstandar] = await Promise.all([
    modulos.includes('golf')   ? dbGolf.from('cat_cuotas_config').select('id, tipo, id_concepto_ingreso_fk') : Promise.resolve({ data: [] }),
    modulos.includes('golf')   ? dbGolf.from('cfg_carritos').select('id_concepto_ingreso_fk').limit(1)       : Promise.resolve({ data: [] }),
    modulos.includes('residencial') ? dbCfg.from('cuotas_estandar').select('id, id_concepto_ingreso_fk')     : Promise.resolve({ data: [] }),
  ])
  const conceptoPorCuotaCfg = new Map<number, number | null>(
    ((cuotasCfgGolf as any).data ?? []).map((r: any) => [r.id, r.id_concepto_ingreso_fk ?? null]))
  const conceptoPension = ((carritosCfg as any).data ?? [])[0]?.id_concepto_ingreso_fk ?? null
  const conceptoPorCuotaEstandar = new Map<number, number | null>(
    ((cuotasEstandar as any).data ?? []).map((r: any) => [r.id, r.id_concepto_ingreso_fk ?? null]))

  const COLS_CXC = 'id, tipo, concepto, periodo, monto_original, descuento, monto_final, saldo, status, fecha_emision, fecha_vencimiento, fecha_pago, forma_pago'

  // ── Club Golf ───────────────────────────────────────────────────────────
  // cat_socios vive en el schema golf, igual que cxc_golf: el embed se resuelve.
  if (modulos.includes('golf')) {
    const { rows, error } = await traerTodo((d, h) => dbGolf.from('cxc_golf')
      .select(`${COLS_CXC}, id_cuota_config_fk, id_recibo_fk, cat_socios(numero_socio, nombre, apellido_paterno, apellido_materno)`)
      .neq('status', 'CANCELADO')
      .range(d, h))
    if (error) errores.push(`Golf (cxc_golf): ${error}`)
    else if (rows.length) modulosConDatos.push('golf')

    for (const c of rows) {
      const linea = LINEA_GOLF[c.tipo] ?? c.tipo ?? 'Sin tipo'
      const idConceptoFk = c.tipo === 'PENSION_CARRITO'
        ? conceptoPension
        : (c.id_cuota_config_fk != null ? conceptoPorCuotaCfg.get(c.id_cuota_config_fk) ?? null : null)
      const cliente = nombrePersona(c.cat_socios)

      devengado.push({
        key: `golf-${c.id}`, modulo: 'golf', linea,
        periodo: c.periodo ?? null,
        cargado: Number(c.monto_final) || 0,
        cobrado: cobradoCxc(c),
        saldo: Number(c.saldo) || 0,
        status: c.status, fechaVencimiento: c.fecha_vencimiento ?? null,
        cliente, concepto: c.concepto ?? linea,
        idConceptoFk, idSeccionFk: null,
      })

      const montoCobrado = cobradoCxc(c)
      if (montoCobrado > 0 && !c.fecha_pago) {
        cobrosSinFecha.push({
          key: `golf-sf-${c.id}`, modulo: 'golf', linea,
          periodo: c.periodo ?? null, monto: montoCobrado,
          cliente, concepto: c.concepto ?? linea,
        })
      }
      if (c.fecha_pago && montoCobrado > 0) {
        cobrado.push({
          key: `golf-c-${c.id}`, modulo: 'golf', linea,
          periodo: c.periodo ?? null, fechaPago: c.fecha_pago, monto: montoCobrado,
          banda: clasificarBanda(c.periodo ?? null, c.fecha_pago),
          esCargaInicial: esCargaInicial('golf', c.fecha_pago, arranque),
          cliente, concepto: c.concepto ?? linea,
          folio: c.id_recibo_fk ? `REC-${c.id_recibo_fk}` : null,
          idConceptoFk, idSeccionFk: null,
        })
      }
    }
  }

  // ── Hípico ──────────────────────────────────────────────────────────────
  if (modulos.includes('hipico')) {
    const { rows, error } = await traerTodo((d, h) => dbHip.from('cxc_hip')
      .select(`${COLS_CXC}, cat_arrendatarios(nombre, apellido_paterno, razon_social), ctrl_asignaciones(unidad:cat_caballerizas(clave, nombre))`)
      .neq('status', 'CANCELADO')
      .range(d, h))
    if (error) errores.push(`Hípico (cxc_hip): ${error}`)
    else if (rows.length) modulosConDatos.push('hipico')

    for (const c of rows) {
      const linea = 'Renta Caballeriza'
      const cliente = nombrePersona(c.cat_arrendatarios)
      devengado.push({
        key: `hip-${c.id}`, modulo: 'hipico', linea,
        periodo: c.periodo ?? null,
        cargado: Number(c.monto_final) || 0, cobrado: cobradoCxc(c), saldo: Number(c.saldo) || 0,
        status: c.status, fechaVencimiento: c.fecha_vencimiento ?? null,
        cliente, concepto: c.concepto ?? linea, idConceptoFk: null, idSeccionFk: null,
      })
      const montoCobrado = cobradoCxc(c)
      if (montoCobrado > 0 && !c.fecha_pago) {
        cobrosSinFecha.push({
          key: `hip-sf-${c.id}`, modulo: 'hipico', linea,
          periodo: c.periodo ?? null, monto: montoCobrado,
          cliente, concepto: c.concepto ?? linea,
        })
      }
      if (c.fecha_pago && montoCobrado > 0) {
        cobrado.push({
          key: `hip-c-${c.id}`, modulo: 'hipico', linea,
          periodo: c.periodo ?? null, fechaPago: c.fecha_pago, monto: montoCobrado,
          banda: clasificarBanda(c.periodo ?? null, c.fecha_pago),
          esCargaInicial: esCargaInicial('hipico', c.fecha_pago, arranque),
          cliente, concepto: c.concepto ?? linea, folio: null,
          idConceptoFk: null, idSeccionFk: null,
        })
      }
    }
  }

  // ── Locales Comerciales ─────────────────────────────────────────────────
  // Un solo `alias:tabla` por nivel de embed — apilar dos es inválido en
  // PostgREST y tsc no lo detecta (error en tiempo de query, no de tipos).
  if (modulos.includes('locales')) {
    const { rows, error } = await traerTodo((d, h) => dbCtrl.from('loc_cxc')
      .select(`${COLS_CXC}, arrendatario:loc_arrendatarios(nombre, apellido_paterno, razon_social), asignacion:loc_asignaciones(unidad:loc_propiedades(clave, nombre, id_concepto_ingreso_fk))`)
      .neq('status', 'CANCELADO')
      .range(d, h))
    if (error) errores.push(`Locales (loc_cxc): ${error}`)
    else if (rows.length) modulosConDatos.push('locales')

    for (const c of rows) {
      const linea = LINEA_LOCALES[c.tipo] ?? c.tipo ?? 'Sin tipo'
      const cliente = nombrePersona(c.arrendatario)
      const idConceptoFk = c.asignacion?.unidad?.id_concepto_ingreso_fk ?? null
      devengado.push({
        key: `loc-${c.id}`, modulo: 'locales', linea,
        periodo: c.periodo ?? null,
        cargado: Number(c.monto_final) || 0, cobrado: cobradoCxc(c), saldo: Number(c.saldo) || 0,
        status: c.status, fechaVencimiento: c.fecha_vencimiento ?? null,
        cliente, concepto: c.concepto ?? linea, idConceptoFk, idSeccionFk: null,
      })
      const montoCobrado = cobradoCxc(c)
      if (montoCobrado > 0 && !c.fecha_pago) {
        cobrosSinFecha.push({
          key: `loc-sf-${c.id}`, modulo: 'locales', linea,
          periodo: c.periodo ?? null, monto: montoCobrado,
          cliente, concepto: c.concepto ?? linea,
        })
      }
      if (c.fecha_pago && montoCobrado > 0) {
        cobrado.push({
          key: `loc-c-${c.id}`, modulo: 'locales', linea,
          periodo: c.periodo ?? null, fechaPago: c.fecha_pago, monto: montoCobrado,
          banda: clasificarBanda(c.periodo ?? null, c.fecha_pago),
          esCargaInicial: esCargaInicial('locales', c.fecha_pago, arranque),
          cliente, concepto: c.concepto ?? linea, folio: null,
          idConceptoFk, idSeccionFk: null,
        })
      }
    }
  }

  // ── Fraccionamiento ─────────────────────────────────────────────────────
  // cat.lotes vive en otro schema que ctrl.cargos, así que la sección se
  // resuelve en una consulta aparte (el embed cross-schema no se resuelve;
  // es el bug que ya se pagó varias veces en este proyecto).
  if (modulos.includes('residencial')) {
    const { rows: cargos, error: eCargos } = await traerTodo((d, h) => dbCtrl.from('cargos')
      .select('id, id_lote_fk, id_cuota_estandar_fk, concepto, monto, monto_pagado, saldo, periodo_mes, periodo_anio, fecha_cargo, status')
      .neq('status', 'Cancelado')
      .range(d, h))
    if (eCargos) errores.push(`Fraccionamiento (cargos): ${eCargos}`)

    const { rows: recibos, error: eRec } = await traerTodo((d, h) => dbCtrl.from('recibos')
      .select('id, folio, fecha_recibo, fecha_pago, propietario, id_lote_fk, activo')
      .eq('activo', true)
      .range(d, h))
    if (eRec) errores.push(`Fraccionamiento (recibos): ${eRec}`)

    const idsRecibo = recibos.map(r => r.id)
    let detalles: any[] = []
    if (idsRecibo.length) {
      for (let i = 0; i < idsRecibo.length; i += 400) {
        const { data, error } = await dbCtrl.from('recibos_detalle')
          .select('id, id_recibo_fk, concepto, total, periodo_mes, periodo_anio, id_cargo_fk')
          .in('id_recibo_fk', idsRecibo.slice(i, i + 400))
        if (error) { errores.push(`Fraccionamiento (recibos_detalle): ${error.message}`); break }
        detalles.push(...((data ?? []) as any[]))
      }
    }

    // Sección por lote — la dimensión con la que Fraccionamiento presupuesta
    // (ppto_partidas.fuente_real = 'seccion').
    //
    // cat.lotes y cfg.secciones viven en schemas distintos, así que NO hay
    // relación que PostgREST pueda embeber (`secciones:id_seccion_fk(nombre)`
    // falla con "Could not find a relationship"). Se resuelve en dos consultas,
    // igual que el resto del proyecto (ver app/lotes/expediente/page.tsx).
    const idsLote = Array.from(new Set([
      ...cargos.map(c => c.id_lote_fk), ...recibos.map(r => r.id_lote_fk),
    ].filter(Boolean))) as number[]

    const nombreSeccion = new Map<number, string>()
    if (idsLote.length) {
      const { data: secs, error: eSec } = await dbCfg.from('secciones').select('id, nombre')
      if (eSec) errores.push(`Fraccionamiento (secciones): ${eSec.message}`)
      for (const s of (secs ?? []) as any[]) nombreSeccion.set(s.id, s.nombre)
    }

    const seccionPorLote = new Map<number, { id: number | null; nombre: string; cve: string | null }>()
    if (idsLote.length) {
      for (let i = 0; i < idsLote.length; i += 400) {
        const { data, error } = await dbCat.from('lotes')
          .select('id, cve_lote, id_seccion_fk')
          .in('id', idsLote.slice(i, i + 400))
        if (error) { errores.push(`Fraccionamiento (lotes): ${error.message}`); break }
        for (const l of (data ?? []) as any[]) {
          seccionPorLote.set(l.id, {
            id: l.id_seccion_fk ?? null,
            nombre: (l.id_seccion_fk != null ? nombreSeccion.get(l.id_seccion_fk) : null) ?? 'Sin sección',
            cve: l.cve_lote ?? null,
          })
        }
      }
    }

    if (cargos.length || detalles.length) modulosConDatos.push('residencial')

    for (const c of cargos) {
      const sec = c.id_lote_fk ? seccionPorLote.get(c.id_lote_fk) : undefined
      devengado.push({
        key: `res-${c.id}`, modulo: 'residencial',
        linea: sec?.nombre ?? 'Sin sección',
        periodo: periodoDesdeNombre(c.periodo_mes, c.periodo_anio),
        cargado: Number(c.monto) || 0,
        cobrado: Number(c.monto_pagado) || 0,
        saldo: Number(c.saldo) || 0,
        status: c.status,
        // ctrl.cargos no lleva fecha_vencimiento: en Fraccionamiento el
        // vencimiento se deriva del periodo (día 10 del mes siguiente al
        // periodo, según la operación), no de una columna.
        fechaVencimiento: null,
        cliente: sec?.cve ?? `Lote ${c.id_lote_fk ?? '—'}`,
        concepto: c.concepto ?? 'Cuota',
        idConceptoFk: c.id_cuota_estandar_fk != null ? conceptoPorCuotaEstandar.get(c.id_cuota_estandar_fk) ?? null : null,
        idSeccionFk: sec?.id ?? null,
      })
    }

    const reciboPorId = new Map<number, any>(recibos.map(r => [r.id, r]))
    for (const d of detalles) {
      const r = reciboPorId.get(d.id_recibo_fk)
      if (!r) continue
      const fechaPago = (r.fecha_pago ?? r.fecha_recibo) as string | null
      if (!fechaPago) continue
      const monto = Number(d.total) || 0
      if (monto === 0) continue
      const sec = r.id_lote_fk ? seccionPorLote.get(r.id_lote_fk) : undefined
      const periodo = periodoDesdeNombre(d.periodo_mes, d.periodo_anio)
      cobrado.push({
        key: `res-c-${d.id}`, modulo: 'residencial',
        linea: sec?.nombre ?? 'Sin sección',
        periodo, fechaPago, monto,
        banda: clasificarBanda(periodo, fechaPago),
        esCargaInicial: esCargaInicial('residencial', fechaPago, arranque),
        cliente: r.propietario || sec?.cve || '—',
        concepto: d.concepto ?? 'Cuota',
        folio: r.folio ?? `#${r.id}`,
        idConceptoFk: null,
        idSeccionFk: sec?.id ?? null,
      })
    }
  }

  // ── Avisos ──────────────────────────────────────────────────────────────
  // Que un módulo no tenga fecha de arranque solo importa si además tiene
  // cobranza: ahí el flujo podría estar incluyendo una carga inicial sin
  // declarar, y callarlo sería mentir por omisión.
  for (const m of modulosConDatos) {
    if (!arranque[m]) {
      avisos.push(`${m}: sin fecha de arranque operativo configurada — todos sus cobros se consideran operativos. Si se cargó cartera histórica, captúrala en Configuración › Cobranza.`)
    }
  }

  if (cobrosSinFecha.length) {
    const total = cobrosSinFecha.reduce((a, c) => a + c.monto, 0)
    avisos.push(`${cobrosSinFecha.length} cuota(s) con abono registrado pero sin fecha de pago (${total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}). No se pueden ubicar en ningún mes: aparecen como línea aparte en el puente. Corregirlas en el módulo de cobranza hace que el puente cuadre solo.`)
  }

  return { devengado, cobrado, cobrosSinFecha, arranque, modulosConDatos, avisos, errores }
}
