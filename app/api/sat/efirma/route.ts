import { NextRequest, NextResponse } from 'next/server'
import { Credential } from '@nodecfdi/credentials/node'
import { admin, cifrar, respuestaError, usuarioSat, HttpError } from '@/lib/satServidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET → datos públicos de la e.firma activa (nunca la llave ni la contraseña)
export async function GET(req: NextRequest) {
  try {
    await usuarioSat(req, 'descarga')
    const { data, error } = await admin().schema('ctrl' as any).from('sat_efirma')
      .select('id, rfc, razon_social, no_certificado, vigencia_inicio, vigencia_fin, created_at')
      .eq('activo', true).order('created_at', { ascending: false }).limit(1)
    if (error) throw new Error(error.message)
    return NextResponse.json({ efirma: (data ?? [])[0] ?? null })
  } catch (e) {
    const r = respuestaError(e); return NextResponse.json(r.body, { status: r.status })
  }
}

// POST (multipart: cer, key, password) → valida y guarda la e.firma cifrada
export async function POST(req: NextRequest) {
  try {
    const u = await usuarioSat(req, 'efirma')
    const form = await req.formData()
    const cerF = form.get('cer') as File | null
    const keyF = form.get('key') as File | null
    const pass = String(form.get('password') ?? '')
    if (!cerF || !keyF || !pass) throw new HttpError(400, 'Adjunta el archivo .cer, el archivo .key y la contraseña.')

    const cer = Buffer.from(await cerF.arrayBuffer())
    const key = Buffer.from(await keyF.arrayBuffer())

    let cred: Credential
    try {
      cred = Credential.create(cer.toString('binary'), key.toString('binary'), pass)
    } catch (err: any) {
      const m = String(err?.message ?? err)
      throw new HttpError(400, /pass|decrypt|PKCS|key/i.test(m)
        ? 'No se pudo abrir la llave privada: revisa que la contraseña sea la de la e.firma y que el .key corresponda al .cer.'
        : `Archivos no válidos: ${m}`)
    }
    if (!cred.isFiel()) throw new HttpError(400, 'El certificado es un CSD (sello digital), no una e.firma. La descarga masiva exige la e.firma (FIEL).')
    const cert = cred.certificate()
    if (!cert.validOn()) throw new HttpError(400, `La e.firma no está vigente (vence ${cert.validTo().toISOString().slice(0, 10)}).`)

    const db = admin()
    const rfc = cred.rfc().toUpperCase()
    const { data: cfg } = await db.schema('cfg' as any).from('configuracion').select('valor').eq('clave', 'org_rfc').maybeSingle()
    const rfcOrg = String((cfg as any)?.valor ?? '').trim().toUpperCase()
    if (rfcOrg && rfcOrg !== rfc) throw new HttpError(400, `La e.firma es del RFC ${rfc}, pero la organización está configurada con ${rfcOrg}.`)

    // from() nuevo por operación: el builder comparte la URL y arrastraría los filtros
    const t = () => db.schema('ctrl' as any).from('sat_efirma')
    const { error: eOff } = await t().update({ activo: false }).eq('rfc', rfc).eq('activo', true)
    if (eOff) throw new Error(eOff.message)
    const fila = {
      rfc,
      razon_social:    cred.legalName() || null,
      no_certificado:  cert.serialNumber().bytesArePrintable() ? cert.serialNumber().bytes() : cert.serialNumber().decimal(),
      vigencia_inicio: cert.validFrom().toISOString(),
      vigencia_fin:    cert.validTo().toISOString(),
      cer_b64:         cer.toString('base64'),
      key_enc:         cifrar(key),
      pass_enc:        cifrar(Buffer.from(pass, 'utf8')),
      activo:          true,
      created_by:      u.id,
    }
    const { error } = await t().insert(fila)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, rfc, razon_social: fila.razon_social, vigencia_fin: fila.vigencia_fin, no_certificado: fila.no_certificado })
  } catch (e) {
    const r = respuestaError(e); return NextResponse.json(r.body, { status: r.status })
  }
}
