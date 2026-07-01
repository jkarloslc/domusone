import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    user: cfg.pac_user  || 'domusonetest',
    pass: cfg.pac_pass  || 'domusonetest',
  }
}

// GET /api/pac/descargar?cfdiId=XXX&format=xml|pdf
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const cfdiId = searchParams.get('cfdiId')
    const format = searchParams.get('format') // 'xml' | 'pdf'

    if (!cfdiId || !format) {
      return NextResponse.json({ error: 'Faltan parámetros: cfdiId y format son requeridos' }, { status: 400 })
    }
    if (format !== 'xml' && format !== 'pdf') {
      return NextResponse.json({ error: 'format debe ser xml o pdf' }, { status: 400 })
    }

    const pac = await getPacConfig()
    const authHeader = 'Basic ' + Buffer.from(`${pac.user}:${pac.pass}`).toString('base64')

    const res = await fetch(`${pac.url}/cfdi/-/${format}/${cfdiId}`, {
      headers: { Authorization: authHeader },
    })

    if (!res.ok) {
      const txt = await res.text()
      return NextResponse.json({ error: `PAC error [${res.status}]: ${txt.substring(0, 200)}` }, { status: 400 })
    }

    // Facturama devuelve base64 para PDF y XML plano para XML
    const content = await res.text()
    return NextResponse.json({ content, format })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
