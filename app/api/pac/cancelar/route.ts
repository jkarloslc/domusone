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
    const { folio_fiscal, rfc_emisor, motivo } = await req.json()

    if (!folio_fiscal) {
      return NextResponse.json({ error: 'folio_fiscal es requerido' }, { status: 400 })
    }

    const pac        = await getPacConfig()
    const authHeader = 'Basic ' + Buffer.from(`${pac.user}:${pac.pass}`).toString('base64')

    // Facturama expone /cfdi/{id} (sin prefijo /api/, sin /cfdis/issued) para
    // cancelar — mismo patrón que /cfdi/{tipo}/{id} usado para descargar en
    // app/api/pac/descargar/route.ts: recibe el UUID fiscal directamente, no
    // el Id interno de Facturama, y no requiere un paso previo de búsqueda.
    const cancelRes = await fetch(
      `${pac.url}/cfdi/${folio_fiscal}?motive=${motivo}`,
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
    return NextResponse.json({ acuse: acuse || `CANCELADO-${folio_fiscal}` })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
