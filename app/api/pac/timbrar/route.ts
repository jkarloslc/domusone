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
    .in('clave', ['pac_url', 'pac_user', 'pac_pass', 'org_cp_fiscal'])

  const cfg: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { cfg[r.clave] = r.valor ?? '' })

  return {
    url:      cfg.pac_url      || 'https://apisandbox.facturama.mx',
    user:     cfg.pac_user     || 'domusonetest',
    pass:     cfg.pac_pass     || 'domusonetest',
    cp_fiscal: cfg.org_cp_fiscal || '',
  }
}

export async function POST(req: NextRequest) {
  try {
    const datos = await req.json()
    const pac   = await getPacConfig()

    const authHeader = 'Basic ' + Buffer.from(`${pac.user}:${pac.pass}`).toString('base64')

    // ── Construir payload CFDI 4.0 para Facturama ─────────────
    // ExpeditionPlace = LugarExpedicion (C.P. fiscal del emisor) — campo obligatorio SAT
    const cpExpedicion = datos.cp_emisor || pac.cp_fiscal || '76900'

    const payload = {
      ExpeditionPlace: cpExpedicion,
      Receiver: {
        Rfc:          datos.rfc_receptor,
        Name:         datos.razon_social_receptor,
        CfdiUse:      datos.uso_cfdi,
        FiscalRegime: datos.regimen_fiscal_receptor ?? '616',
        TaxZipCode:   datos.cp_receptor ?? cpExpedicion,
      },
      CfdiType:      'I',   // Ingreso
      PaymentForm:   datos.forma_pago,
      PaymentMethod: datos.metodo_pago,
      Currency:      datos.moneda ?? 'MXN',
      Serie:         datos.serie,
      Folio:         datos.folio_interno,
      Exportation:   '01',  // No aplica
      Items: datos.conceptos.map((c: any) => ({
        ProductCode:          c.clave_prod_serv,
        IdentificationNumber: datos.folio_interno,
        Description:          c.descripcion,
        Unit:                 'E48',
        UnitCode:             'E48',
        UnitPrice:            c.precio_unitario,
        Quantity:             c.cantidad,
        Subtotal:             c.importe,
        TaxObject:            c.objeto_imp ?? '01',
        Total:                c.importe,
        ...(c.objeto_imp === '02' && c.tasa_iva > 0 ? {
          Taxes: [{
            Total:       c.importe * c.tasa_iva,
            Name:        'IVA',
            Base:        c.importe,
            Rate:        c.tasa_iva,
            IsRetention: false,
          }]
        } : {})
      })),
    }

    // ── Llamar al PAC ──────────────────────────────────────────
    const res = await fetch(`${pac.url}/3/cfdis`, {
      method:  'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    const pacResp = await res.json()

    if (!res.ok) {
      const msg = pacResp?.ModelState
        ? Object.values(pacResp.ModelState).flat().join('; ')
        : pacResp?.Message ?? JSON.stringify(pacResp)
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const cfdiId = pacResp.Id

    // ── Descargar PDF y XML ────────────────────────────────────
    const [xmlRes, pdfRes] = await Promise.all([
      fetch(`${pac.url}/cfdi/-/xml/${cfdiId}`,  { headers: { Authorization: authHeader } }),
      fetch(`${pac.url}/cfdi/-/pdf/${cfdiId}`,  { headers: { Authorization: authHeader } }),
    ])

    const xmlText = xmlRes.ok ? await xmlRes.text() : null
    const pdfB64  = pdfRes.ok ? await pdfRes.text() : null   // Facturama devuelve base64

    const pdfUrl  = pdfB64 ? `data:application/pdf;base64,${pdfB64}` : null

    return NextResponse.json({
      folio_fiscal:  pacResp.Complement?.TaxStamp?.Uuid ?? pacResp.Id,
      xml_cfdi:      xmlText,
      pdf_url:       pdfUrl,
      pac_respuesta: pacResp,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
