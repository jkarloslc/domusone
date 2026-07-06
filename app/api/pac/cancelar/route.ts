import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Leer credenciales PAC desde cfg.configuracion ─────────────
// IMPORTANTE: usamos la service role key para saltarnos RLS en cfg.configuracion
async function getPacConfig() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const db = supabase.schema('cfg' as any)
  const { data, error } = await db
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['pac_url', 'pac_user', 'pac_pass'])

  if (error) throw new Error(`No se pudo leer cfg.configuracion: ${error.message}`)

  const cfg: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { cfg[r.clave] = r.valor ?? '' })

  return {
    url:  (cfg.pac_url  || 'https://apisandbox.facturama.mx').replace(/\/$/, ''),
    user: cfg.pac_user || 'domusonetest',
    pass: cfg.pac_pass || 'domusonetest',
  }
}

export async function POST(req: NextRequest) {
  try {
    const { pac_cfdi_id, motivo } = await req.json()

    if (!pac_cfdi_id) {
      return NextResponse.json({ error: 'pac_cfdi_id es requerido' }, { status: 400 })
    }

    const pac        = await getPacConfig()
    const authHeader = 'Basic ' + Buffer.from(`${pac.user}:${pac.pass}`).toString('base64')

    // Documentado en https://apisandbox.facturama.mx/docs/api/DELETE-cfdi-id_type_motive_uuidReplacement:
    // {id} es "ID del CFDI en Facturama" (su Id interno, NO el UUID fiscal —
    // a diferencia de /cfdi/{tipo}/{id} para descargar). `type=issued` es
    // obligatorio para la API Web (vs. `payroll` para nómina).
    const cancelRes = await fetch(
      `${pac.url}/cfdi/${pac_cfdi_id}?type=issued&motive=${motivo ?? '02'}`,
      { method: 'DELETE', headers: { Authorization: authHeader } }
    )

    if (!cancelRes.ok) {
      const rawText = await cancelRes.text()
      let msg = `Error HTTP ${cancelRes.status}`
      try {
        const parsed = JSON.parse(rawText)
        msg = parsed?.Message ?? (parsed?.ModelState ? JSON.stringify(parsed.ModelState) : rawText.substring(0, 200))
      } catch { if (rawText) msg = rawText.substring(0, 200) }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const acuse = await cancelRes.text().catch(() => '')
    return NextResponse.json({ acuse: acuse || `CANCELADO-${pac_cfdi_id}` })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
