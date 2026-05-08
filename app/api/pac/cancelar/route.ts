import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Leer credenciales PAC desde cfg.configuracion ─────────────
async function getPacConfig() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const db = supabase.schema('cfg' as any)
  const { data } = await db
    .from('configuracion')
    .select('clave, valor')
    .in('clave', ['pac_url', 'pac_user', 'pac_pass'])

  const cfg: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { cfg[r.clave] = r.valor ?? '' })

  return {
    url:  cfg.pac_url  || 'https://apisandbox.facturama.mx',
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

    // Buscar el Id interno del PAC por UUID
    const searchRes = await fetch(
      `${pac.url}/api/cfdis/issued?uuid=${folio_fiscal}`,
      { headers: { Authorization: authHeader } }
    )

    let cfdiId = folio_fiscal  // fallback: usar UUID directamente
    if (searchRes.ok) {
      const searchData = await searchRes.json()
      if (searchData?.Id) cfdiId = searchData.Id
    }

    // Cancelar el CFDI
    const cancelRes = await fetch(
      `${pac.url}/api/cfdis/issued/${cfdiId}?motivo=${motivo}&folioSustitucion=`,
      { method: 'DELETE', headers: { Authorization: authHeader } }
    )

    if (!cancelRes.ok) {
      const err = await cancelRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.Message ?? `Error HTTP ${cancelRes.status}` },
        { status: 400 }
      )
    }

    const acuse = await cancelRes.text().catch(() => '')
    return NextResponse.json({ acuse: acuse || `CANCELADO-${folio_fiscal}` })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
