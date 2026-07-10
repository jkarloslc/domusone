import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ocurrenciasEnRango, addDays, toISODate, getSemana } from '@/lib/mantProgramas'

// ═══════════════════════════════════════════════════════════════
// Cierre automático de periodo — Programas de Mantenimiento
// (fases 3 y 5 del rediseño de seguimiento, 2026-07-10; ver memoria de
// proyecto "mant_estrategia_seguimiento").
//
// Dos pasadas independientes sobre la misma ventana de fechas:
//
// 1) Fuga de auditoría: si nadie confirmó una ocurrencia programada
//    antes de que su fecha pasara, se marca 'Omitida' y se genera (o
//    vincula) una OT — nada queda 'Pendiente' indefinidamente sin que
//    nadie se entere.
// 2) Correctivos mayores (`mant_programas.genera_ot_automatica`): la OT
//    se genera en cuanto llega la fecha programada, sin esperar a que
//    nadie reporte una excepción (ej. servicio anual de un tramo).
//
// Se ejecuta vía Vercel Cron (ver vercel.json) con un GET diario.
// Protegido con CRON_SECRET (Vercel lo manda como Bearer automáticamente
// si la variable de entorno está configurada en el proyecto).
//
// Ventana acotada a 14 días atrás: evita que la primera corrida (o una
// corrida tras una caída prolongada) genere una avalancha de OTs por
// meses de historial nunca confirmado — solo cierra lo reciente.
// ═══════════════════════════════════════════════════════════════

// Fuerza ejecución en cada invocación — sin esto Next.js puede tratar
// este GET como estático y servir una respuesta cacheada en vez de
// correr el cierre de verdad en cada disparo del cron.
export const dynamic = 'force-dynamic'

const LOOKBACK_DAYS = 14

function getDb() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return {
    ctrl: supabase.schema('ctrl' as any),
    cfg:  supabase.schema('cfg' as any),
  }
}

type Ejec = { id: number; id_programa_fk: number; id_area_comun_fk: number | null; fecha_prog: string; status: string; id_ot_fk: number | null }

// Antes de crear una OT nueva, busca si ya hay una abierta para el mismo
// programa+área (vía mant_ejecuciones.id_ot_fk) y la reutiliza — mismo
// mecanismo que resolverOT en el cliente (app/mantenimiento/gestion/page.tsx).
async function crearOTyVincular(
  ctrl: any, ejecsProg: Ejec[], prog: any, areaId: number | null, fecha: Date,
  ejecucionId: number, titulo: string, descripcion: string, otCounterRef: { n: number },
): Promise<'vinculada' | 'creada' | null> {
  const otIdsPrevias = Array.from(new Set(
    ejecsProg.filter(e => e.id_area_comun_fk === areaId && e.id_ot_fk).map(e => e.id_ot_fk)
  ))
  if (otIdsPrevias.length) {
    const { data: ots } = await ctrl.from('ordenes_trabajo').select('id, status').in('id', otIdsPrevias)
    const abierta = (ots ?? []).find((o: any) => o.status !== 'Completada' && o.status !== 'Cancelada')
    if (abierta) {
      await ctrl.from('mant_ejecuciones').update({ id_ot_fk: abierta.id }).eq('id', ejecucionId)
      return 'vinculada'
    }
  }
  otCounterRef.n++
  const fechaISO = toISODate(fecha)
  const folio = `OT-${fecha.getFullYear()}-${String(otCounterRef.n).padStart(4, '0')}`
  const { data: ot, error: errOt } = await ctrl.from('ordenes_trabajo').insert({
    folio, empresa: 'Balvanera', modulo: 'mantenimiento', titulo,
    tipo_trabajo: prog.tipo_trabajo ?? null,
    prioridad: 'Media', status: 'Pendiente',
    id_area_fk: prog.id_area_fk ?? null,
    id_cuadrante_fk: prog.id_cuadrante_fk ?? null,
    id_area_comun_fk: areaId,
    descripcion, asignado_a: prog.responsable ?? null,
    fecha_limite: fechaISO, semana_no: getSemana(fecha), anio: fecha.getFullYear(),
    created_by: 'cierre-automatico',
  }).select('id').single()
  if (errOt || !ot) return null
  await ctrl.from('mant_ejecuciones').update({ id_ot_fk: ot.id }).eq('id', ejecucionId)
  return 'creada'
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const { ctrl, cfg } = getDb()
  const hoy   = new Date()
  const desde = addDays(hoy, -LOOKBACK_DAYS)
  const ayer  = addDays(hoy, -1) // solo fechas ya pasadas, no la de hoy

  const { data: programas, error: errProgs } = await ctrl.from('mant_programas')
    .select('id, nombre, tipo_trabajo, descripcion, responsable, frecuencia, fecha_inicio, fecha_fin, id_area_fk, id_cuadrante_fk, genera_ot_automatica')
    .eq('activo', true)
  if (errProgs) return NextResponse.json({ error: errProgs.message }, { status: 500 })
  if (!programas?.length) return NextResponse.json({ ok: true, procesados: 0, omitidas: 0, correctivosGenerados: 0, otsCreadas: 0, otsVinculadas: 0 })

  const progIds = programas.map(p => p.id)

  const [{ data: areasRel }, { data: ejecuciones }, { data: areasComunes }] = await Promise.all([
    ctrl.from('mant_programa_areas').select('id_programa_fk, id_area_comun_fk').in('id_programa_fk', progIds),
    ctrl.from('mant_ejecuciones').select('id, id_programa_fk, id_area_comun_fk, fecha_prog, status, id_ot_fk').in('id_programa_fk', progIds),
    cfg.from('areas_comunes').select('id, criticidad'),
  ])

  const critById: Record<number, string> = {}
  ;(areasComunes ?? []).forEach((a: any) => { critById[a.id] = a.criticidad ?? 'rutinario' })

  const areasPorPrograma: Record<number, number[]> = {}
  ;(areasRel ?? []).forEach((r: any) => {
    if (!areasPorPrograma[r.id_programa_fk]) areasPorPrograma[r.id_programa_fk] = []
    areasPorPrograma[r.id_programa_fk].push(r.id_area_comun_fk)
  })

  const ejecucionesPorPrograma: Record<number, Ejec[]> = {}
  ;(ejecuciones ?? []).forEach((e: any) => {
    if (!ejecucionesPorPrograma[e.id_programa_fk]) ejecucionesPorPrograma[e.id_programa_fk] = []
    ejecucionesPorPrograma[e.id_programa_fk].push(e)
  })

  let procesados = 0, omitidas = 0, correctivosGenerados = 0, otsCreadas = 0, otsVinculadas = 0
  const { count: otCountInicial } = await ctrl.from('ordenes_trabajo').select('id', { count: 'exact', head: true })
  const otCounterRef = { n: otCountInicial ?? 0 }

  const areaSlotsDe = (prog: any) => {
    const areaIds = areasPorPrograma[prog.id] ?? []
    const criticidad = areaIds.length ? (critById[areaIds[0]] ?? 'rutinario') : 'rutinario'
    const esRutinarioMulti = areaIds.length > 1 && criticidad === 'rutinario'
    return esRutinarioMulti ? [null] : (areaIds.length ? areaIds : [null])
  }

  // ── Pasada 1: fuga de auditoría — ocurrencias pasadas sin confirmar ──
  for (const prog of programas) {
    const areaSlots = areaSlotsDe(prog)
    const ocurrencias = ocurrenciasEnRango(
      { frecuencia: prog.frecuencia, fecha_inicio: prog.fecha_inicio, fecha_fin: prog.fecha_fin }, desde, ayer)
    if (!ocurrencias.length) continue
    const ejecsProg = ejecucionesPorPrograma[prog.id] ?? []

    for (const fecha of ocurrencias) {
      const fechaISO = toISODate(fecha)
      for (const areaId of areaSlots) {
        procesados++
        if (ejecsProg.some(e => e.fecha_prog === fechaISO && e.id_area_comun_fk === areaId)) continue

        const { data: nuevaEjec, error: errIns } = await ctrl.from('mant_ejecuciones').insert({
          id_programa_fk: prog.id, id_area_comun_fk: areaId, fecha_prog: fechaISO,
          status: 'Omitida',
          hallazgo: `Cierre automático de periodo: sin confirmación registrada antes del ${toISODate(hoy)}.`,
        }).select('id').single()
        if (errIns || !nuevaEjec) continue
        omitidas++
        ejecsProg.push({ id: nuevaEjec.id, id_programa_fk: prog.id, id_area_comun_fk: areaId, fecha_prog: fechaISO, status: 'Omitida', id_ot_fk: null })

        const resultado = await crearOTyVincular(ctrl, ejecsProg, prog, areaId, fecha, nuevaEjec.id,
          `${prog.nombre} — omitida (cierre automático) ${fechaISO}`,
          `Generada automáticamente: la ocurrencia programada del ${fechaISO} no fue confirmada.`,
          otCounterRef)
        if (resultado === 'creada') otsCreadas++
        else if (resultado === 'vinculada') otsVinculadas++
      }
    }
  }

  // ── Pasada 2: correctivos mayores — OT en cuanto llega la fecha, sin
  //    esperar excepción (incluye HOY, a diferencia de la pasada 1) ──
  for (const prog of programas) {
    if (!prog.genera_ot_automatica) continue
    const areaSlots = areaSlotsDe(prog)
    const ocurrencias = ocurrenciasEnRango(
      { frecuencia: prog.frecuencia, fecha_inicio: prog.fecha_inicio, fecha_fin: prog.fecha_fin }, desde, hoy)
    if (!ocurrencias.length) continue
    const ejecsProg = ejecucionesPorPrograma[prog.id] ?? []

    for (const fecha of ocurrencias) {
      const fechaISO = toISODate(fecha)
      for (const areaId of areaSlots) {
        const existente = ejecsProg.find(e => e.fecha_prog === fechaISO && e.id_area_comun_fk === areaId)
        if (existente?.id_ot_fk) continue // ya tiene OT (manual o de esta misma pasada)

        let ejecucionId: number | null = existente?.id ?? null
        if (!ejecucionId) {
          const { data: nuevaEjec, error: errIns } = await ctrl.from('mant_ejecuciones').insert({
            id_programa_fk: prog.id, id_area_comun_fk: areaId, fecha_prog: fechaISO, status: 'En Proceso',
          }).select('id').single()
          if (errIns || !nuevaEjec) continue
          const nuevoId: number = nuevaEjec.id
          ejecucionId = nuevoId
          ejecsProg.push({ id: nuevoId, id_programa_fk: prog.id, id_area_comun_fk: areaId, fecha_prog: fechaISO, status: 'En Proceso', id_ot_fk: null })
        }
        if (!ejecucionId) continue
        correctivosGenerados++

        const resultado = await crearOTyVincular(ctrl, ejecsProg, prog, areaId, fecha, ejecucionId,
          `${prog.nombre} — correctivo mayor ${fechaISO}`,
          `Generada automáticamente: correctivo mayor programado para el ${fechaISO} (sin esperar excepción).`,
          otCounterRef)
        if (resultado === 'creada') otsCreadas++
        else if (resultado === 'vinculada') otsVinculadas++
      }
    }
  }

  return NextResponse.json({ ok: true, procesados, omitidas, correctivosGenerados, otsCreadas, otsVinculadas })
}
