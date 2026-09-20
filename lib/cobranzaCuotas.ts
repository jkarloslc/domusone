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

// Un error de columna faltante significa "migración pendiente" y permite
// reintentar sin esas columnas. Cualquier otro error (permisos, red) es un error
// de verdad: si se trataran igual, un GRANT faltante se anunciaría como
// migración pendiente y se buscaría el problema en el lugar equivocado.
const esColumnaFaltante = (e: { code?: string; message?: string }) =>
  e.code === '42703' || /does not exist/i.test(e.message ?? '')

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
  /** false = falta la migración de `meses_devengo`; el prorrateo no aplica. */
  devengoDiferidoDisponible: boolean
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
  //
  // Se piden con select('*') a propósito: `meses_devengo` (migración
  // 20260920160000) puede no existir todavía, y nombrarlo en el select haría
  // fallar la consulta completa y con ella el reporte. Son tablas de config de
  // 1-2 filas, así que traerlas enteras no cuesta nada. Si la columna no está,
  // mesesDevengo cae a 1 = comportamiento actual, y el reporte lo avisa.
  const [cuotasCfgGolf, carritosCfg, cuotasEstandar] = await Promise.all([
    modulos.includes('golf')   ? dbGolf.from('cat_cuotas_config').select('*')            : Promise.resolve({ data: [] }),
    modulos.includes('golf')   ? dbGolf.from('cfg_carritos').select('*').limit(1)        : Promise.resolve({ data: [] }),
    modulos.includes('residencial') ? dbCfg.from('cuotas_estandar').select('*')          : Promise.resolve({ data: [] }),
  ])
  const conceptoPorCuotaCfg = new Map<number, number | null>(
    ((cuotasCfgGolf as any).data ?? []).map((r: any) => [r.id, r.id_concepto_ingreso_fk ?? null]))
  const conceptoPension = ((carritosCfg as any).data ?? [])[0]?.id_concepto_ingreso_fk ?? null
  const conceptoPorCuotaEstandar = new Map<number, number | null>(
    ((cuotasEstandar as any).data ?? []).map((r: any) => [r.id, r.id_concepto_ingreso_fk ?? null]))

  const devengoPorCuotaCfg = new Map<number, number>(
    ((cuotasCfgGolf as any).data ?? []).map((r: any) => [r.id, Number(r.meses_devengo) || 1]))
  const devengoPorCuotaEstandar = new Map<number, number>(
    ((cuotasEstandar as any).data ?? []).map((r: any) => [r.id, Number(r.meses_devengo) || 1]))
  const columnaDevengoPresente =
    ((cuotasCfgGolf as any).data ?? []).some((r: any) => r.meses_devengo !== undefined) ||
    ((cuotasEstandar as any).data ?? []).some((r: any) => r.meses_devengo !== undefined)

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
        mesesDevengo: c.id_cuota_config_fk != null ? devengoPorCuotaCfg.get(c.id_cuota_config_fk) ?? 1 : 1,
        cargado: Number(c.monto_final) || 0,
        cobrado: cobradoCxc(c),
        // monto_final ya viene neto de descuento en las tablas cxc_*.
        descuento: 0,
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
        mesesDevengo: 1,
        cargado: Number(c.monto_final) || 0, cobrado: cobradoCxc(c), descuento: 0, saldo: Number(c.saldo) || 0,
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
        mesesDevengo: 1,
        cargado: Number(c.monto_final) || 0, cobrado: cobradoCxc(c), descuento: 0, saldo: Number(c.saldo) || 0,
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
    // `descuento_aplicado` y `fecha_vencimiento` son de la migración
    // 20260920230000. Si todavía no existe, se reintenta sin ellas en vez de
    // dejar la cartera de Fraccionamiento fuera del reporte: sin este respaldo,
    // desplegar el código antes de correr la migración rompería el módulo.
    const COLS_CARGO_BASE = 'id, id_lote_fk, id_cuota_estandar_fk, concepto, monto, monto_pagado, saldo, periodo_mes, periodo_anio, fecha_cargo, status'
    let { rows: cargos, error: eCargos } = await traerTodo((d, h) => dbCtrl.from('cargos')
      .select(`${COLS_CARGO_BASE}, descuento_aplicado, fecha_vencimiento`)
      .neq('status', 'Cancelado')
      .range(d, h))
    if (eCargos && esColumnaFaltante({ message: eCargos })) {
      avisos.push('ctrl.cargos aún no tiene `descuento_aplicado` / `fecha_vencimiento`: falta ejecutar la migración 20260920230000. Hasta entonces el descuento por pago anticipado deja saldo residual y no hay antigüedad de saldos en Fraccionamiento.')
      const retry = await traerTodo((d, h) => dbCtrl.from('cargos')
        .select(COLS_CARGO_BASE)
        .neq('status', 'Cancelado')
        .range(d, h))
      cargos = retry.rows
      eCargos = retry.error
    }
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
        mesesDevengo: c.id_cuota_estandar_fk != null ? devengoPorCuotaEstandar.get(c.id_cuota_estandar_fk) ?? 1 : 1,
        cargado: Number(c.monto) || 0,
        // El descuento aplicado liquida cargo igual que el efectivo: si no se
        // suma aquí, el puente lo deja como pendiente eterno y la cartera
        // muestra morosidad que no existe (ver migración 20260920230000).
        cobrado: (Number(c.monto_pagado) || 0) + (Number(c.descuento_aplicado) || 0),
        descuento: Number(c.descuento_aplicado) || 0,
        saldo: Number(c.saldo) || 0,
        status: c.status,
        // Desde la migración 20260920230000 los cargos sí llevan vencimiento
        // (día `dia_vencimiento` del mes del periodo, default 10). Los cargos
        // anteriores al backfill quedan en null y simplemente no entran en la
        // antigüedad de saldos.
        fechaVencimiento: c.fecha_vencimiento ?? null,
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

  if (!columnaDevengoPresente && (modulos.includes('golf') || modulos.includes('residencial'))) {
    avisos.push('La columna `meses_devengo` aún no existe en el catálogo de cuotas: el prorrateo de cuotas anuales (ej. la Inscripción de Golf) no tendrá efecto hasta que se ejecute la migración 20260920160000.')
  }

  if (cobrosSinFecha.length) {
    const total = cobrosSinFecha.reduce((a, c) => a + c.monto, 0)
    avisos.push(`${cobrosSinFecha.length} cuota(s) con abono registrado pero sin fecha de pago (${total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}). No se pueden ubicar en ningún mes: aparecen como línea aparte en el puente. Corregirlas en el módulo de cobranza hace que el puente cuadre solo.`)
  }

  return { devengado, cobrado, cobrosSinFecha, arranque, modulosConDatos, avisos, errores, devengoDiferidoDisponible: columnaDevengoPresente }
}

// ── Ingreso reconocido, clasificado (F2) ──────────────────────────────────
//
// Las medidas de arriba salen de las SUBCUENTAS de cobranza. Esta sale del
// LIBRO DE INGRESOS (ctrl.recibos_ingreso + su desglose), que es exactamente
// la fuente que usan el Comparativo de Presupuesto y el Estado de Resultados
// (ver app/presupuestos/comparativo/page.tsx: fuente_real 'seccion'/'concepto').
//
// Por eso vive aparte y NUNCA se suma con las anteriores: son dos libros
// distintos del mismo dinero. Mezclarlos duplicaría. Que se puedan ver lado a
// lado es justamente lo que hace visible la brecha entre cartera e ingreso.
//
// Fraccionamiento ($17.6M en 2026, el 52% del ingreso) no tiene subcuenta en
// operación, así que esta es hoy la única vía para clasificar su cobranza —
// capturada a mano en /ingresos.

export type IngresoClasificado = {
  key: string
  fecha: string
  folio: string | null
  idCentroFk: number | null
  centro: string
  origen: 'seccion' | 'concepto'
  linea: string
  monto: number
  vencido: number
  corriente: number
  anticipado: number
  /** Parte del monto sin clasificar. Igual al monto cuando la fila no se capturó. */
  sinClasificar: number
  clasificada: boolean
}

export type ResultadoIngresoClasificado = {
  filas: IngresoClasificado[]
  /** false = falta la migración 20260920180000; todo sale como "sin clasificar". */
  clasificacionDisponible: boolean
  errores: string[]
}

export async function fetchIngresoClasificado(anio: number): Promise<ResultadoIngresoClasificado> {
  const errores: string[] = []
  const desde = `${anio}-01-01`
  const hasta = `${anio}-12-31`

  const [{ data: centrosData }, { rows: recibos, error: eRec }] = await Promise.all([
    dbCfg.from('centros_ingreso').select('id, nombre'),
    traerTodo((d, h) => dbCtrl.from('recibos_ingreso')
      .select('id, folio, fecha, status, monto_total, id_centro_ingreso_fk')
      .eq('status', 'Confirmado')
      .gte('fecha', desde).lte('fecha', hasta)
      .range(d, h)),
  ])
  if (eRec) errores.push(`Recibos de ingreso: ${eRec}`)

  const nombreCentro = new Map<number, string>(((centrosData ?? []) as any[]).map(c => [c.id, c.nombre]))
  const reciboPorId = new Map<number, any>(recibos.map(r => [r.id, r]))
  const ids = recibos.map(r => r.id)
  if (!ids.length) return { filas: [], clasificacionDisponible: true, errores }

  // Las 3 columnas de clasificación pueden no existir todavía (migración
  // 20260920180000). Se intenta con ellas y, si la consulta falla, se reintenta
  // sin ellas y se avisa — en vez de dejar el tab en blanco sin explicación.
  let clasificacionDisponible = true
  const COLS_CLASIF = ', monto_vencido, monto_corriente, monto_anticipado'

  const traerDesglose = async (tabla: string, cols: string) => {
    const out: any[] = []
    for (let i = 0; i < ids.length; i += 400) {
      const lote = ids.slice(i, i + 400)
      let { data, error } = await dbCtrl.from(tabla).select(cols + COLS_CLASIF).in('id_recibo_fk', lote)
      if (error) {
        if (!esColumnaFaltante(error)) { errores.push(`${tabla}: ${error.message}`); return out }
        clasificacionDisponible = false
        const retry = await dbCtrl.from(tabla).select(cols).in('id_recibo_fk', lote)
        if (retry.error) { errores.push(`${tabla}: ${retry.error.message}`); return out }
        data = retry.data
      }
      out.push(...((data ?? []) as any[]))
    }
    return out
  }

  const [secs, concs] = await Promise.all([
    traerDesglose('recibos_ingreso_secciones', 'id, id_recibo_fk, nombre_seccion, monto'),
    traerDesglose('recibos_ingreso_conceptos', 'id, id_recibo_fk, nombre_concepto, monto'),
  ])

  const armar = (r: any, origen: 'seccion' | 'concepto', linea: string, idRow: number): IngresoClasificado | null => {
    const rec = reciboPorId.get(r.id_recibo_fk)
    if (!rec) return null
    const monto = Number(r.monto) || 0
    const v = r.monto_vencido    != null ? Number(r.monto_vencido)    : 0
    const c = r.monto_corriente  != null ? Number(r.monto_corriente)  : 0
    const a = r.monto_anticipado != null ? Number(r.monto_anticipado) : 0
    const clasificada = r.monto_vencido != null || r.monto_corriente != null || r.monto_anticipado != null
    return {
      key: `${origen}-${idRow}`,
      fecha: rec.fecha, folio: rec.folio ?? `#${rec.id}`,
      idCentroFk: rec.id_centro_ingreso_fk ?? null,
      centro: nombreCentro.get(rec.id_centro_ingreso_fk) ?? '(sin centro)',
      origen, linea, monto,
      vencido: v, corriente: c, anticipado: a,
      // Lo no clasificado se muestra como tal en vez de repartirse: un residuo
      // inventado sería peor que un hueco visible.
      sinClasificar: Math.max(0, Math.round((monto - v - c - a) * 100) / 100),
      clasificada,
    }
  }

  const filas: IngresoClasificado[] = []
  for (const r of secs)  { const f = armar(r, 'seccion',  r.nombre_seccion  ?? 'Sin sección', r.id); if (f) filas.push(f) }
  for (const r of concs) { const f = armar(r, 'concepto', r.nombre_concepto ?? 'Sin concepto', r.id); if (f) filas.push(f) }

  return { filas, clasificacionDisponible, errores }
}

// ── Devengado sin IVA, por partida de presupuesto (F3) ────────────────────
//
// El Comparativo compara Presupuesto vs Real **sin IVA** (subtotales, ver
// migración 20260910130000). El monto de una cuota en cartera, en cambio,
// INCLUYE IVA — verificado con datos reales: una membresía de $4,900 genera
// subtotal $4,224.14 + IVA $675.86 en golf.ctrl_ventas_det. Así que para
// alimentar el Real del Comparativo con devengado hay que extraer el IVA.
//
// NO se divide todo entre 1.16. Esa aproximación ya se rechazó explícitamente
// en este proyecto porque distorsiona lo exento, y aquí el riesgo es real: la
// Cuota de Mantenimiento de Fraccionamiento tiene iva_pct = 0 / aplica_iva =
// false, mientras las de Golf son 16%. Dividir todo entre 1.16 le quitaría
// ~$2.4M inexistentes al 52% del ingreso.
//
// La tasa se resuelve desde el catálogo: los productos POS ligados al concepto
// de ingreso de la cuota. Si todos coinciden se usa esa tasa; si discrepan o no
// hay ninguno, la cuota se marca como SIN TASA RESUELTA y se excluye del Real
// en vez de inventarle una tasa — un hueco visible es mejor que una cifra
// equivocada.

/** Tasa de IVA por concepto de ingreso. null = no resuelta (productos en desacuerdo o sin producto). */
async function fetchTasaIvaPorConcepto(): Promise<{ tasas: Map<number, number | null>; error: string | null }> {
  const { data, error } = await dbGolf.from('cat_productos_pos')
    .select('id_concepto_ingreso_fk, iva_pct, aplica_iva')
    .not('id_concepto_ingreso_fk', 'is', null)
  if (error) return { tasas: new Map(), error: error.message }

  const vistas = new Map<number, Set<number>>()
  for (const p of (data ?? []) as any[]) {
    const cid = p.id_concepto_ingreso_fk as number
    const pct = p.aplica_iva === false ? 0 : (Number(p.iva_pct) || 0)
    if (!vistas.has(cid)) vistas.set(cid, new Set())
    vistas.get(cid)!.add(pct)
  }
  const tasas = new Map<number, number | null>()
  vistas.forEach((set, cid) => { tasas.set(cid, set.size === 1 ? Array.from(set)[0] : null) })
  return { tasas, error: null }
}

const quitarIva = (monto: number, ivaPct: number) =>
  Math.round((monto / (1 + ivaPct / 100)) * 100) / 100

export type DevengadoPorPartida = {
  /** idConceptoFk → { mes: monto sin IVA } */
  porConcepto: Map<number, Record<number, number>>
  /** idSeccionFk → { mes: monto sin IVA } */
  porSeccion: Map<number, Record<number, number>>
  /** Devengado excluido por no poder resolver su tasa de IVA. */
  montoSinTasa: number
  /** Devengado excluido por no tener concepto ni sección con que ligarse a una partida. */
  montoSinDimension: number
  avisos: string[]
  errores: string[]
}

/**
 * Devengado del año por partida de presupuesto, prorrateado y sin IVA.
 * Lo consume el Comparativo cuando se elige la base Devengado.
 */
export async function fetchDevengadoSinIvaPorPartida(
  anio: number,
  prorratear = true,
): Promise<DevengadoPorPartida> {
  const { repartirDevengo } = await import('@/lib/clasificacionCobranza')
  const [cobranza, { tasas, error: eTasas }] = await Promise.all([
    fetchCobranzaCuotas(),
    fetchTasaIvaPorConcepto(),
  ])

  const porConcepto = new Map<number, Record<number, number>>()
  const porSeccion = new Map<number, Record<number, number>>()
  const avisos: string[] = [...cobranza.avisos]
  const errores: string[] = [...cobranza.errores]
  if (eTasas) errores.push(`Tasas de IVA (cat_productos_pos): ${eTasas}`)

  let montoSinTasa = 0
  let montoSinDimension = 0
  const conceptosSinTasa = new Set<number>()

  for (const d of cobranza.devengado) {
    if (d.idConceptoFk == null && d.idSeccionFk == null) { montoSinDimension += d.cargado; continue }

    // La tasa se busca por el concepto de la cuota. Una partida por sección
    // (Fraccionamiento) también tiene concepto de cuota, así que la resolución
    // es la misma para las dos dimensiones.
    const ivaPct = d.idConceptoFk != null ? tasas.get(d.idConceptoFk) : undefined
    if (ivaPct == null) {
      montoSinTasa += d.cargado
      if (d.idConceptoFk != null) conceptosSinTasa.add(d.idConceptoFk)
      continue
    }

    const slices = prorratear
      ? repartirDevengo(d.periodo, d.cargado, d.mesesDevengo)
      : [{ periodo: d.periodo, monto: d.cargado }]

    for (const sl of slices) {
      if (!sl.periodo || !sl.periodo.startsWith(String(anio))) continue
      const mes = Number(sl.periodo.slice(5, 7))
      const neto = quitarIva(sl.monto, ivaPct)
      const destino = d.idConceptoFk != null ? porConcepto : porSeccion
      const clave = (d.idConceptoFk != null ? d.idConceptoFk : d.idSeccionFk) as number
      const actual = destino.get(clave) ?? {}
      actual[mes] = Math.round(((actual[mes] ?? 0) + neto) * 100) / 100
      destino.set(clave, actual)
    }
  }

  if (montoSinTasa > 0) {
    avisos.push(`${montoSinTasa.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} de devengado quedó fuera del Real: no se pudo resolver su tasa de IVA desde el catálogo de productos${conceptosSinTasa.size ? ` (conceptos ${Array.from(conceptosSinTasa).join(', ')})` : ''}. Se excluye en vez de asumirle una tasa.`)
  }
  if (montoSinDimension > 0) {
    avisos.push(`${montoSinDimension.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} de devengado no tiene concepto ni sección con que ligarse a una partida de presupuesto.`)
  }

  return { porConcepto, porSeccion, montoSinTasa, montoSinDimension, avisos, errores }
}
