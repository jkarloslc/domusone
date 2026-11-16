import { NextRequest, NextResponse } from 'next/server'
import { admin, respuestaError, usuarioSat, HttpError } from '@/lib/satServidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST { uuid, id_op, accion }
//   vincular    → liga manual (confirmado)
//   confirmar   → acepta una sugerencia
//   descartar   → rechaza la sugerencia (no se vuelve a proponer)
//   desvincular → quita la liga y la marca como descartada
export async function POST(req: NextRequest) {
  try {
    const u = await usuarioSat(req, 'descarga')
    const { uuid, id_op, accion } = await req.json()
    if (!uuid || !id_op) throw new HttpError(400, 'Faltan uuid e id_op.')
    const t = () => admin().schema('ctrl' as any).from('cfdi_sat_op')
    let r
    if (accion === 'vincular') {
      r = await t().upsert({ uuid, id_op_fk: Number(id_op), metodo: 'manual', estado: 'confirmado', created_by: u.id }, { onConflict: 'uuid,id_op_fk' })
    } else if (accion === 'confirmar') {
      r = await t().update({ estado: 'confirmado' }).eq('uuid', uuid).eq('id_op_fk', Number(id_op))
    } else if (accion === 'descartar' || accion === 'desvincular') {
      r = await t().update({ estado: 'descartado' }).eq('uuid', uuid).eq('id_op_fk', Number(id_op))
    } else throw new HttpError(400, 'Acción no válida.')
    if (r.error) throw new Error(r.error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const r = respuestaError(e); return NextResponse.json(r.body, { status: r.status })
  }
}
