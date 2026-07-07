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

// POST /api/pac/registrar-serie — registra una Serie nueva en la sucursal
// (Matriz) de Facturama. Facturama exige que cualquier Serie usada al
// timbrar ya exista dada de alta ahí ("El atributo Serie debe existir en
// la sucursal") — se llama automáticamente desde FacturaUniversalModal
// cuando el timbrado falla por ese motivo, para dar de alta la serie y
// reintentar una sola vez.
export async function POST(req: NextRequest) {
  try {
    const { serie, folio_inicial } = await req.json()
    if (!serie) return NextResponse.json({ error: 'serie es requerida' }, { status: 400 })

    const pac        = await getPacConfig()
    const authHeader = 'Basic ' + Buffer.from(`${pac.user}:${pac.pass}`).toString('base64')

    // 1) Ubicar la sucursal (Matriz / IsDefault)
    const branchRes = await fetch(`${pac.url}/BranchOffice`, { headers: { Authorization: authHeader } })
    if (!branchRes.ok) {
      const t = await branchRes.text()
      return NextResponse.json({ error: `No se pudo obtener la sucursal: [${branchRes.status}] ${t.substring(0, 200)}` }, { status: 400 })
    }
    const sucursales = await branchRes.json()
    const lista = Array.isArray(sucursales) ? sucursales : (sucursales?.Content ?? [])
    const matriz = lista.find((s: any) => s.IsDefault) ?? lista[0]
    if (!matriz?.Id) {
      return NextResponse.json({ error: 'La cuenta de Facturama no tiene ninguna sucursal configurada' }, { status: 400 })
    }

    // 2) Crear la serie en esa sucursal
    const serieRes = await fetch(`${pac.url}/serie/${matriz.Id}`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        IdBranchOffice: matriz.Id,
        Name:           serie,
        Description:    serie,
        Folio:          folio_inicial ?? 1,
      }),
    })

    if (!serieRes.ok) {
      const rawText = await serieRes.text()
      // Si ya existe, no es un error real — la serie queda utilizable igual.
      if (/ya existe|already exists|duplicad/i.test(rawText)) {
        return NextResponse.json({ ok: true, ya_existia: true })
      }
      let msg = `Error HTTP ${serieRes.status}`
      try {
        const parsed = JSON.parse(rawText)
        msg = parsed?.Message ?? (parsed?.ModelState ? JSON.stringify(parsed.ModelState) : rawText.substring(0, 200))
      } catch { if (rawText) msg = rawText.substring(0, 200) }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
