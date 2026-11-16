import { NextRequest, NextResponse } from 'next/server'
import {
  QueryParameters, DateTimePeriod, DownloadType, RequestType, DocumentStatus,
} from '@nodecfdi/sat-ws-descarga-masiva'
import { admin, respuestaError, servicioSat, usuarioSat, HttpError } from '@/lib/satServidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ISO = /^\d{4}-\d{2}-\d{2}$/

// 'YYYY-MM-DD HH:mm:ss' en hora de la Cd. de México, hace n minutos (el SAT rechaza una fecha final futura)
function horaMxHace(min: number) {
  const d = new Date(Date.now() - min * 60_000)
  return d.toLocaleString('sv-SE', { timeZone: 'America/Mexico_City' }).replace('T', ' ').slice(0, 19)
}

// POST { tipo: 'recibidos' | 'emitidos', desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD', solicitud?: 'xml' | 'metadata' }
// Metadata: listado con estatus (vigente/cancelado) de todos los CFDI, incluidos los cancelados.
export async function POST(req: NextRequest) {
  try {
    const u = await usuarioSat(req, 'descarga')
    const { tipo, desde, hasta, solicitud } = await req.json()
    const meta = solicitud === 'metadata'
    if (tipo !== 'recibidos' && tipo !== 'emitidos') throw new HttpError(400, 'Tipo no válido.')
    if (!ISO.test(desde ?? '') || !ISO.test(hasta ?? '') || desde > hasta) throw new HttpError(400, 'Revisa el rango de fechas.')
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' })
    if (desde > hoy) throw new HttpError(400, 'La fecha inicial no puede ser futura.')

    const db = admin()
    const { service, rfc } = await servicioSat(db)

    // Recibidos en XML: el SAT solo entrega los vigentes (los cancelados solo vienen en Metadata).
    let params = QueryParameters.create()
      .withPeriod(DateTimePeriod.createFromValues(`${desde} 00:00:00`, hasta >= hoy ? horaMxHace(5) : `${hasta} 23:59:59`))
      .withDownloadType(new DownloadType(tipo === 'recibidos' ? 'received' : 'issued'))
      .withRequestType(new RequestType(meta ? 'metadata' : 'xml'))
    if (tipo === 'recibidos' && !meta) params = params.withDocumentStatus(new DocumentStatus('active'))
    const errores = params.validate()
    if (errores.length) throw new HttpError(400, errores.join(' · '))

    const query = await service.query(params)
    const st = query.getStatus()
    const fila: any = {
      rfc, tipo, tipo_solicitud: meta ? 'metadata' : 'xml', fecha_desde: desde, fecha_hasta: hasta,
      id_solicitud_sat: query.getRequestId() || null,
      status: st.isAccepted() ? 'Solicitada' : 'Rechazada',
      mensaje_sat: `${st.getCode()} · ${st.getMessage()}`,
      created_by: u.id,
    }
    const { data, error } = await db.schema('ctrl' as any).from('sat_solicitudes').insert(fila).select().single()
    if (error) throw new Error(error.message)
    if (!st.isAccepted()) return NextResponse.json({ error: `El SAT rechazó la solicitud: ${st.getMessage()}`, solicitud: data }, { status: 422 })
    return NextResponse.json({ solicitud: data })
  } catch (e) {
    const r = respuestaError(e); return NextResponse.json(r.body, { status: r.status })
  }
}
