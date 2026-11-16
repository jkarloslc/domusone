import { NextRequest, NextResponse } from 'next/server'
import { admin, respuestaError, usuarioSat, HttpError } from '@/lib/satServidor'
import { conciliar, llenarUuidOps } from '@/lib/satConciliacion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ISO = /^\d{4}-\d{2}-\d{2}$/

// POST { desde, hasta } → lee los UUID de los XML subidos a las OP y empata los CFDI recibidos del periodo
export async function POST(req: NextRequest) {
  try {
    const u = await usuarioSat(req, 'descarga')
    const { desde, hasta } = await req.json()
    if (!ISO.test(desde ?? '') || !ISO.test(hasta ?? '') || desde > hasta) throw new HttpError(400, 'Revisa el periodo.')
    const db = admin()
    const uuidOps = await llenarUuidOps(db, 30_000)
    const r = await conciliar(db, desde, hasta, u.id)
    return NextResponse.json({ ...r, uuidOps })
  } catch (e) {
    const r = respuestaError(e); return NextResponse.json(r.body, { status: r.status })
  }
}
