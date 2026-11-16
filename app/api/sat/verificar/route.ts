import { NextRequest, NextResponse } from 'next/server'
import { DOMParser } from '@xmldom/xmldom'
import { CfdiPackageReader, MetadataPackageReader } from '@nodecfdi/sat-ws-descarga-masiva'
import { admin, respuestaError, servicioSat, usuarioSat, HttpError } from '@/lib/satServidor'
import { extraerCfdi } from '@/lib/cfdiXml'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Presupuesto de tiempo por llamada: si hay muchos paquetes se corta y la
// siguiente verificación continúa con los que falten (paquetes_descargados).
const PRESUPUESTO_MS = 45_000
const LOTE = 200

// POST { id } → consulta al SAT el avance; si ya está lista, descarga los paquetes y guarda los CFDI.
export async function POST(req: NextRequest) {
  const t0 = Date.now()
  try {
    await usuarioSat(req, 'descarga')
    const { id } = await req.json()
    const db = admin()
    const tSol = () => db.schema('ctrl' as any).from('sat_solicitudes')
    const { data: sol, error: eSol } = await tSol().select('*').eq('id', id).single()
    if (eSol || !sol) throw new HttpError(404, 'Solicitud no encontrada.')
    if (!sol.id_solicitud_sat) throw new HttpError(409, 'La solicitud no tiene folio del SAT.')
    if (['Descargada', 'Sin datos', 'Rechazada', 'Vencida'].includes(sol.status)) {
      return NextResponse.json({ solicitud: sol })
    }

    const { service } = await servicioSat(db)
    const guardar = async (cambios: any) => {
      const { data, error } = await tSol().update({ ...cambios, updated_at: new Date().toISOString(), ultima_verificacion: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) throw new Error(error.message)
      return data
    }

    let paquetes: string[] = sol.paquetes ?? []
    if (sol.status !== 'Lista' || !paquetes.length) {
      const v = await service.verify(sol.id_solicitud_sat)
      if (!v.getStatus().isAccepted()) {
        const s = await guardar({ mensaje_sat: `${v.getStatus().getCode()} · ${v.getStatus().getMessage()}` })
        return NextResponse.json({ solicitud: s, aviso: `El SAT no aceptó la verificación: ${v.getStatus().getMessage()}` })
      }
      const sr = v.getStatusRequest(), cr = v.getCodeRequest()
      const ESTADO: Record<string, string> = { Accepted: 'Aceptada', InProgress: 'En proceso', Finished: 'Terminada', Failure: 'Error', Rejected: 'Rechazada', Expired: 'Vencida' }
      const msg = `${ESTADO[sr.getEntryId()] ?? sr.getEntryId()} · ${cr.getMessage()}`
      if (cr.isTypeOf('EmptyResult')) return NextResponse.json({ solicitud: await guardar({ status: 'Sin datos', mensaje_sat: msg, num_cfdis: 0 }) })
      if (sr.isTypeOf('Expired'))  return NextResponse.json({ solicitud: await guardar({ status: 'Vencida', mensaje_sat: msg }) })
      if (sr.isTypeOf('Rejected') || sr.isTypeOf('Failure')) return NextResponse.json({ solicitud: await guardar({ status: 'Rechazada', mensaje_sat: msg }) })
      if (!sr.isTypeOf('Finished')) return NextResponse.json({ solicitud: await guardar({ status: 'En proceso', mensaje_sat: msg }) })
      paquetes = v.getPackageIds()
      await guardar({ status: 'Lista', mensaje_sat: msg, num_cfdis: v.getNumberCfdis(), paquetes })
    }

    const tipoDescarga = sol.tipo === 'recibidos' ? 'recibido' : 'emitido'
    const hechos = new Set<string>(sol.paquetes_descargados ?? [])
    let guardados = sol.cfdis_guardados ?? 0
    const errores: string[] = []
    let cortado = false

    for (const pk of paquetes) {
      if (hechos.has(pk)) continue
      if (Date.now() - t0 > PRESUPUESTO_MS) { cortado = true; break }
      const d = await service.download(pk)
      if (!d.getStatus().isAccepted()) { errores.push(`Paquete ${pk}: ${d.getStatus().getMessage()}`); continue }
      const zip = Buffer.from(d.getPackageContent(), 'base64').toString('binary')
      if (sol.tipo_solicitud === 'metadata') {
        guardados += await guardarMetadata(db, await MetadataPackageReader.createFromContents(zip), tipoDescarga, sol.id)
        hechos.add(pk)
        await guardar({ paquetes_descargados: Array.from(hechos), cfdis_guardados: guardados })
        continue
      }
      const reader = await CfdiPackageReader.createFromContents(zip)

      let filas: any[] = [], xmls: any[] = []
      const vaciar = async () => {
        if (!filas.length) return
        // Sin UUID repetidos en el mismo upsert (Postgres no deja tocar la misma fila dos veces)
        filas = Array.from(new Map(filas.map(f => [f.uuid, f])).values())
        xmls  = Array.from(new Map(xmls.map(f => [f.uuid, f])).values())
        const c = db.schema('ctrl' as any)
        const { error: e1 } = await c.from('cfdi_sat').upsert(filas, { onConflict: 'uuid' })
        if (e1) throw new Error(`Guardando CFDI: ${e1.message}`)
        const { error: e2 } = await c.from('cfdi_sat_xml').upsert(xmls, { onConflict: 'uuid' })
        if (e2) throw new Error(`Guardando XML: ${e2.message}`)
        guardados += filas.length
        filas = []; xmls = []
      }
      for await (const mapa of reader.cfdis()) {
        for (const [nombre, xml] of Array.from(mapa)) {
          try {
            const x = extraerCfdi(new DOMParser().parseFromString(xml, 'text/xml') as any)
            filas.push({
              uuid: x.uuid, tipo_descarga: tipoDescarga, version: x.version, serie: x.serie, folio: x.folio,
              fecha_emision: x.fecha_emision, fecha_timbrado: x.fecha_timbrado, tipo_comprobante: x.tipo_comprobante,
              rfc_emisor: x.rfc_emisor, nombre_emisor: x.nombre_emisor, regimen_emisor: x.regimen_emisor,
              rfc_receptor: x.rfc_receptor, nombre_receptor: x.nombre_receptor, uso_cfdi: x.uso_cfdi,
              metodo_pago: x.metodo_pago, forma_pago: x.forma_pago, moneda: x.moneda, tipo_cambio: x.tipo_cambio,
              subtotal: x.subtotal, descuento: x.descuento, iva_trasladado: x.iva_trasladado,
              iva_retenido: x.iva_retenido, isr_retenido: x.isr_retenido, ieps: x.ieps, total: x.total,
              id_solicitud_fk: sol.id, tiene_xml: true,
            })
            xmls.push({ uuid: x.uuid, xml })
            if (filas.length >= LOTE) await vaciar()
          } catch (err: any) {
            errores.push(`${nombre}: ${err?.message ?? err}`)
          }
        }
      }
      await vaciar()
      hechos.add(pk)
      await guardar({ paquetes_descargados: Array.from(hechos), cfdis_guardados: guardados })
    }

    const completa = paquetes.every(p => hechos.has(p))
    const s = await guardar({
      status: completa ? 'Descargada' : 'Lista',
      cfdis_guardados: guardados,
      ...(errores.length ? { mensaje_sat: errores.slice(0, 5).join(' | ') } : {}),
    })
    return NextResponse.json({
      solicitud: s,
      aviso: cortado ? 'Faltan paquetes por descargar: vuelve a pulsar Verificar para continuar.' : undefined,
      errores: errores.length ? errores.slice(0, 20) : undefined,
    })
  } catch (e) {
    const r = respuestaError(e); return NextResponse.json(r.body, { status: r.status })
  }
}

// Metadata: actualiza el estatus (vigente/cancelado) de los CFDI que ya existen y da
// de alta, sin XML, los que no se descargaron (p. ej. recibidos cancelados).
async function guardarMetadata(db: ReturnType<typeof admin>, reader: MetadataPackageReader, tipoDescarga: string, idSol: number) {
  const items: any[] = []
  for await (const it of reader.metadata()) {
    const g = (k: string) => String(it.get(k) ?? '').trim()
    const uuid = g('uuid').toUpperCase()
    if (!uuid) continue
    const cancelado = g('estatus') === '0'
    items.push({
      uuid, cancelado, fecha_cancelacion: cancelado && g('fechaCancelacion') ? g('fechaCancelacion').replace(' ', 'T') : null,
      fila: {
        uuid, tipo_descarga: tipoDescarga, tipo_comprobante: g('efectoComprobante') || null,
        rfc_emisor: g('rfcEmisor').toUpperCase(), nombre_emisor: g('nombreEmisor') || null,
        rfc_receptor: g('rfcReceptor').toUpperCase(), nombre_receptor: g('nombreReceptor') || null,
        fecha_emision: g('fechaEmision').replace(' ', 'T') || null, fecha_timbrado: g('fechaCertificacionSat').replace(' ', 'T') || null,
        total: g('monto') ? Number(g('monto')) : null, tiene_xml: false, id_solicitud_fk: idSol,
      },
    })
  }
  const t = () => db.schema('ctrl' as any).from('cfdi_sat')
  const existentes = new Set<string>()
  for (let i = 0; i < items.length; i += 300) {
    const { data, error } = await t().select('uuid').in('uuid', items.slice(i, i + 300).map(x => x.uuid))
    if (error) throw new Error(error.message)
    for (const r of data ?? []) existentes.add((r as any).uuid)
  }
  const vigentes = items.filter(x => existentes.has(x.uuid) && !x.cancelado).map(x => x.uuid)
  for (let i = 0; i < vigentes.length; i += 300) {
    const { error } = await t().update({ estatus_sat: 'Vigente', fecha_cancelacion: null }).in('uuid', vigentes.slice(i, i + 300))
    if (error) throw new Error(error.message)
  }
  for (const x of items.filter(x => existentes.has(x.uuid) && x.cancelado)) {
    const { error } = await t().update({ estatus_sat: 'Cancelado', fecha_cancelacion: x.fecha_cancelacion }).eq('uuid', x.uuid)
    if (error) throw new Error(error.message)
  }
  const nuevos = Array.from(new Map(items.filter(x => !existentes.has(x.uuid))
    .map(x => [x.uuid, { ...x.fila, estatus_sat: x.cancelado ? 'Cancelado' : 'Vigente', fecha_cancelacion: x.fecha_cancelacion }])).values())
  for (let i = 0; i < nuevos.length; i += 500) {
    const { error } = await t().insert(nuevos.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }
  return items.length
}
